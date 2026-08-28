import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { get } from "node:http";
import { join, resolve } from "node:path";

const root = resolve(".");
const screenshotPath = join(root, ".tmp", "karlo-throw-smoke.png");
const refereeScreenshotPath = join(root, ".tmp", "referee-intro-smoke.png");
const videoStageScreenshotPath = join(root, ".tmp", "dragon-temple-video-smoke.png");
const smokeWindowSize = process.env.SMOKE_WINDOW_SIZE ?? "1920,1080";
const smokeDebugPort = process.env.SMOKE_DEBUG_PORT ?? "9223";
const smokeRunId = process.env.SMOKE_RUN_ID ?? "default";
const chromeCandidates = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const chromePath = chromeCandidates.find((candidate) => existsSync(candidate));

if (!chromePath) {
  throw new Error("Chrome or Edge was not found for headless smoke testing.");
}

const userDataDir = join(root, ".tmp", `chrome-smoke-${smokeRunId}`);
mkdirSync(userDataDir, { recursive: true });

const browser = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  `--window-size=${smokeWindowSize}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-background-networking",
  `--remote-debugging-port=${smokeDebugPort}`,
  `--user-data-dir=${userDataDir}`,
  "about:blank",
]);

browser.stderr.on("data", () => {});

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function fetchJson(url) {
  return new Promise((resolveFetch, rejectFetch) => {
    get(url, (response) => {
      let body = "";
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        try {
          resolveFetch(JSON.parse(body));
        } catch (error) {
          rejectFetch(error);
        }
      });
    }).on("error", rejectFetch);
  });
}

async function getDebuggerUrl() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const targets = await fetchJson(`http://127.0.0.1:${smokeDebugPort}/json/list`);
      const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
      if (page) {
        return page.webSocketDebuggerUrl;
      }
    } catch {
      // Chrome can expose the remote endpoint just before its first page target is ready.
    }
    await sleep(250);
  }
  throw new Error("Chrome DevTools page target did not become ready.");
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.id = 0;
    this.pending = new Map();
    this.events = new EventTarget();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve: resolvePending, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) {
          reject(new Error(message.error.message));
        } else {
          resolvePending(message.result);
        }
      } else if (message.method) {
        this.events.dispatchEvent(new Event(message.method));
      }
    });
    await new Promise((resolveOpen) => this.socket.addEventListener("open", resolveOpen, { once: true }));
  }

  send(method, params = {}) {
    const id = (this.id += 1);
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolveSend, rejectSend) => {
      this.pending.set(id, { resolve: resolveSend, reject: rejectSend });
    });
  }

  once(method) {
    return new Promise((resolveEvent) => {
      this.events.addEventListener(method, resolveEvent, { once: true });
    });
  }
}

const client = new CdpClient(await getDebuggerUrl());

try {
  await client.connect();
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Input.setIgnoreInputEvents", { ignore: false });
  const loaded = client.once("Page.loadEventFired");
  await client.send("Page.navigate", { url: "http://127.0.0.1:5173/" });
  await loaded;
  await sleep(900);

  async function evaluate(expression) {
    const result = await client.send("Runtime.evaluate", {
      returnByValue: true,
      awaitPromise: true,
      expression,
    });
    if (result.exceptionDetails) {
      const details = result.exceptionDetails;
      throw new Error(details.exception?.description ?? details.text);
    }
    return result.result.value;
  }

  async function sceneState() {
    const result = await client.send("Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => {
        const game = window.__bsuFighterGame;
        const scene = game?.scene?.getScene("BattleScene");
        const snapshot = scene?.sim?.snapshot;
        return {
          hasCanvas: Boolean(document.querySelector("canvas")),
          screen: scene?.screen,
          ready: Boolean(scene?.ui && scene?.keys),
          p1: snapshot && { name: snapshot.fighters.p1.def.displayName, x: snapshot.fighters.p1.x, y: snapshot.fighters.p1.y, health: snapshot.fighters.p1.health, grounded: snapshot.fighters.p1.grounded },
          p2: snapshot && { name: snapshot.fighters.p2.def.displayName, x: snapshot.fighters.p2.x, y: snapshot.fighters.p2.y, health: snapshot.fighters.p2.health, grounded: snapshot.fighters.p2.grounded },
          throw: snapshot?.throwSequence,
          karloThrowFrames: [1, 2, 3].every((frame) => game?.textures?.exists(\`karlo-throw-frame-\${frame}\`)),
        };
      })()`,
    });
    return result.result.value;
  }

  async function waitForScreen(screen, timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;
    let current = await sceneState();
    while ((current.screen !== screen || !current.ready) && Date.now() < deadline) {
      await sleep(250);
      current = await sceneState();
    }
    if (current.screen !== screen || !current.ready) {
      throw new Error(`Timed out waiting for ${screen}, got ${JSON.stringify(current)}`);
    }
    return current;
  }

  await waitForScreen("title", 12000);

  async function waitForRefereeSign(timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const state = await evaluate(`(() => {
        const sign = document.querySelector(".referee-round-sign");
        return {
          exists: Boolean(sign),
          display: sign ? getComputedStyle(sign).display : "none",
        };
      })()`);
      if (state.exists && state.display !== "none") {
        return;
      }
      await sleep(120);
    }
    throw new Error("Referee round sign did not become visible during the intro.");
  }

  await evaluate(`(() => {
    const scene = window.__bsuFighterGame?.scene?.getScene("BattleScene");
    scene.startMatch({ mode: "pvp", p1FighterKey: "esleigue", p2FighterKey: "karlo", stageKey: "bsu-cartoon" }, true);
  })()`);
  await waitForRefereeSign();
  const refereeIntroDuring = await evaluate(`(() => {
    const scene = window.__bsuFighterGame?.scene?.getScene("BattleScene");
    const referee = document.querySelector(".referee-intro-frame");
    const sign = document.querySelector(".referee-round-sign");
    return {
      active: scene?.roundIntroActive,
      timerMs: scene?.sim?.snapshot?.timerMs,
      refereeFrames: document.querySelectorAll(".referee-intro-sprite").length,
      auras: document.querySelectorAll(".referee-intro-aura").length,
      signs: document.querySelectorAll(".referee-round-sign").length,
      refereeSource: referee?.getAttribute("src"),
    signText: sign?.textContent,
      signVisibility: sign ? getComputedStyle(sign).visibility : null,
      signDisplay: sign ? getComputedStyle(sign).display : null,
      signRect: sign?.getBoundingClientRect().toJSON(),
      refereeRect: referee?.getBoundingClientRect().toJSON(),
    };
  })()`);
  const refereeScreenshot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(refereeScreenshotPath, Buffer.from(refereeScreenshot.data, "base64"));
  await sleep(4000);
  const refereeIntroAfter = await evaluate(`(() => {
    const scene = window.__bsuFighterGame?.scene?.getScene("BattleScene");
    return {
      active: scene?.roundIntroActive,
      timerMs: scene?.sim?.snapshot?.timerMs,
      refereeFrames: document.querySelectorAll(".referee-intro-sprite").length,
      auras: document.querySelectorAll(".referee-intro-aura").length,
      signs: document.querySelectorAll(".referee-round-sign").length,
    };
  })()`);

  const visualThrow = await evaluate(`(async () => {
    const scene = window.__bsuFighterGame?.scene?.getScene("BattleScene");
    scene.startMatch({ mode: "pvp", p1FighterKey: "karlo", p2FighterKey: "karlo", stageKey: "bsu-cartoon" }, true);
    const sim = scene.sim;
    const empty = () => ({ left: false, right: false, jump: false, punch: false, punch2: false, kick: false, throw: false, special: false, block: false });
    const p1 = sim.snapshot.fighters.p1;
    const p2 = sim.snapshot.fighters.p2;
    p1.x = 430;
    p2.x = 530;
    p1.facing = 1;
    p2.facing = -1;
    sim.update(16, { p1: { ...empty(), throw: true }, p2: empty() });
    scene.syncViews(sim.snapshot);
    const grabbedTexture = scene.fighterViews.get("p2")?.sprite.texture.key;
    sim.update(180, { p1: empty(), p2: empty() });
    scene.syncViews(sim.snapshot);
    const liftedTexture = scene.fighterViews.get("p2")?.sprite.texture.key;
    sim.update(150, { p1: empty(), p2: empty() });
    scene.syncViews(sim.snapshot);
    const liftedPose = {
      y: p2.y,
      angle: scene.fighterViews.get("p2")?.sprite.angle,
    };
    sim.update(150, { p1: empty(), p2: empty() });
    sim.update(300, { p1: empty(), p2: empty() });
    sim.update(250, { p1: empty(), p2: empty() });
    sim.update(380, { p1: empty(), p2: empty() });
    scene.syncViews(sim.snapshot);
    const slidePose = {
      x: p2.x,
      y: p2.y,
      angle: scene.fighterViews.get("p2")?.sprite.angle,
      texture: scene.fighterViews.get("p2")?.sprite.texture.key,
    };
    return {
      screen: scene.screen,
      throw: { ...sim.snapshot.throwSequence },
      grabbedTexture,
      liftedTexture,
      liftedPose,
      slidePose,
      p1: { x: p1.x, y: p1.y, facing: p1.facing },
      p2: { x: p2.x, y: p2.y, facing: p2.facing },
    };
  })()`);

  const screenshot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));

  const videoStageVisual = await evaluate(`(async () => {
    const scene = window.__bsuFighterGame?.scene?.getScene("BattleScene");
    scene.startMatch({ mode: "pvp", p1FighterKey: "esleigue", p2FighterKey: "karlo", stageKey: "dragon-temple" }, true);
    const deadline = Date.now() + 30000;
    while (scene.matchAssetLoadInProgress && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await new Promise((resolve) => setTimeout(resolve, 3300));
    const snapshot = scene.sim.snapshot;
    const camera = scene.cameras.main;
    return {
      p1X: snapshot.fighters.p1.x,
      p2X: snapshot.fighters.p2.x,
      midpoint: (snapshot.fighters.p1.x + snapshot.fighters.p2.x) / 2,
      cameraCenter: camera.scrollX + camera.displayWidth / 2,
      refereeVisible: Boolean(document.querySelector(".referee-intro-sprite")),
    };
  })()`);
  const videoStageScreenshot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(videoStageScreenshotPath, Buffer.from(videoStageScreenshot.data, "base64"));

  const report = await evaluate(`(async () => {
    const scene = window.__bsuFighterGame?.scene?.getScene("BattleScene");
    const empty = () => ({ left: false, right: false, jump: false, punch: false, punch2: false, kick: false, throw: false, special: false, block: false });
    const snapshot = () => scene.sim.snapshot;
    const tick = (ms, p1Input = empty(), p2Input = empty()) => {
      for (let elapsed = 0; elapsed < ms; elapsed += 16) {
        scene.sim.update(Math.min(16, ms - elapsed), { p1: p1Input, p2: p2Input });
      }
      scene.syncViews(scene.sim.snapshot);
    };
    const fresh = async (
      p1FighterKey = "karlo",
      p2FighterKey = "karlo",
      mode = "pvp",
      stageKey = "bsu-cartoon",
    ) => {
      scene.startMatch({ mode, p1FighterKey, p2FighterKey, stageKey }, true);
      const deadline = Date.now() + 30000;
      while (scene.matchAssetLoadInProgress && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
      return snapshot();
    };
    const refereeRoundNumbers = [0, 1, 2, 3, 4].map((completedRounds) => {
      scene.score = { p1: completedRounds, p2: 0 };
      return scene.currentRoundNumber();
    });
    scene.score = { p1: 0, p2: 0 };
    const position = (p1X, p2X) => {
      const state = snapshot();
      const p1 = state.fighters.p1;
      const p2 = state.fighters.p2;
      const groundY = p1.y;
      for (const fighter of [p1, p2]) {
        fighter.y = groundY;
        fighter.vx = 0;
        fighter.vy = 0;
        fighter.grounded = true;
        fighter.health = fighter.maxHealth;
        fighter.hitStunMs = 0;
        fighter.blocking = false;
        fighter.activeAttack = null;
        fighter.throwCooldownMs = 0;
      }
      p1.x = p1X;
      p2.x = p2X;
      p1.facing = p1X <= p2X ? 1 : -1;
      p2.facing = p2X <= p1X ? 1 : -1;
      return { p1, p2 };
    };
    const completeThrow = () => tick(1950);

    await fresh("karlo", "esleigue");
    scene.cleanupRefereeRoundIntro();
    const assistFighters = position(430, 530);
    assistFighters.p1.assistMeter = 100;
    tick(16, { ...empty(), assist: true });
    const assistStarted = {
      phase: snapshot().assistSequence.phase,
      meter: snapshot().fighters.p1.assistMeter,
      hasActor: Boolean(scene.assistView),
      timerMs: snapshot().timerMs,
    };
    tick(700);
    const assistActive = {
      phase: snapshot().assistSequence.phase,
      hasActor: Boolean(scene.assistView),
      timerMs: snapshot().timerMs,
    };
    scene.sim.cancelSpecialSequence();
    scene.cleanupAssist();
    scene.syncViews(snapshot());
    const assistCleanup = {
      phase: snapshot().assistSequence.phase,
      hasActor: Boolean(scene.assistView),
      timerUnchangedDuringCall: assistActive.timerMs === assistStarted.timerMs,
    };

    await fresh("karlo", "esleigue");
    scene.cleanupRefereeRoundIntro();
    position(1040, 1700);
    scene.updateBattleCamera(snapshot(), true, 16);
    const cameraRight = scene.cameras.main.scrollX;
    position(500, 1000);
    scene.updateBattleCamera(snapshot(), true, 16);
    const cameraLeft = scene.cameras.main.scrollX;
    position(200, 2200);
    tick(16);
    const constrainedSeparation = Math.abs(snapshot().fighters.p2.x - snapshot().fighters.p1.x);
    const stageScroll = {
      stageWidth: scene.currentStageWidth,
      visibleWorldWidth: scene.cameras.main.worldView.width,
      cameraRight,
      cameraLeft,
      constrainedSeparation,
      maxSeparation: 760,
      stageBounds: {
        p1: snapshot().fighters.p1.x,
        p2: snapshot().fighters.p2.x,
      },
    };

    await fresh("karlo", "esleigue", "pvp", "dragon-temple");
    scene.cleanupRefereeRoundIntro();
    await new Promise((resolve) => setTimeout(resolve, 500));
    const video = scene.stageVideo;
    const videoStyle = video ? getComputedStyle(video) : null;
    const videoInitialSnapshot = scene.sim.snapshot;
    const videoInitialMidpoint = (videoInitialSnapshot.fighters.p1.x + videoInitialSnapshot.fighters.p2.x) / 2;
    const videoInitialCameraCenter = scene.cameras.main.scrollX + scene.cameras.main.displayWidth / 2;
    const videoStage = {
      stageWidth: scene.currentStageWidth,
      stageHeight: scene.currentStageHeight,
      groundY: scene.currentGroundY,
      scrolling: scene.currentStageScrolling,
      visibleWorldWidth: scene.cameras.main.displayWidth,
      initialMidpoint: videoInitialMidpoint,
      initialCameraCenter: videoInitialCameraCenter,
      hasVideo: Boolean(video),
      videoWidth: video?.videoWidth ?? 0,
      videoHeight: video?.videoHeight ?? 0,
      readyState: video?.readyState ?? 0,
      mediaError: video?.error?.code ?? null,
      muted: video?.muted ?? false,
      loop: video?.loop ?? false,
      objectFit: videoStyle?.objectFit ?? "",
      zIndex: videoStyle?.zIndex ?? "",
    };
    scene.cleanupSpawnEntrance();
    scene.playRefereeRoundIntro(1);
    await new Promise((resolve) => setTimeout(resolve, 2050));
    const videoRefereeNode = document.querySelector(".referee-intro-sprite");
    const videoRefereeRect = videoRefereeNode?.getBoundingClientRect();
    const videoStageRootRect = document.querySelector("#game-root")?.getBoundingClientRect();
    videoStage.referee = {
      active: scene.roundIntroActive,
      hasNode: Boolean(videoRefereeNode),
      left: videoRefereeRect && videoStageRootRect ? videoRefereeRect.left - videoStageRootRect.left : null,
      right: videoRefereeRect && videoStageRootRect ? videoRefereeRect.right - videoStageRootRect.left : null,
      top: videoRefereeRect && videoStageRootRect ? videoRefereeRect.top - videoStageRootRect.top : null,
      bottom: videoRefereeRect && videoStageRootRect ? videoRefereeRect.bottom - videoStageRootRect.top : null,
      viewportWidth: videoStageRootRect?.width ?? 0,
      viewportHeight: videoStageRootRect?.height ?? 0,
    };
    scene.cleanupRefereeRoundIntro();
    const videoStageFighters = position(900, 1300);
    scene.updateBattleCamera(snapshot(), true, 16);
    const videoCameraLeft = scene.cameras.main.scrollX;
    videoStageFighters.p1.x = 2700;
    videoStageFighters.p2.x = 3100;
    scene.updateBattleCamera(snapshot(), true, 16);
    const videoCameraRight = scene.cameras.main.scrollX;
    const videoCameraScrollY = scene.cameras.main.scrollY;
    videoStage.cameraLeft = videoCameraLeft;
    videoStage.cameraRight = videoCameraRight;
    videoStage.cameraScrollY = videoCameraScrollY;

    await fresh();
    const motionFighters = position(430, 530);
    const defenderStartX = motionFighters.p2.x;
    tick(16, { ...empty(), throw: true });
    tick(90);
    const pull = {
      x: snapshot().fighters.p2.x,
      angle: scene.fighterViews.get("p2")?.sprite.angle,
      texture: scene.fighterViews.get("p2")?.sprite.texture.key,
    };
    tick(90);
    const lift = {
      x: snapshot().fighters.p2.x,
      y: snapshot().fighters.p2.y,
      angle: scene.fighterViews.get("p2")?.sprite.angle,
      texture: scene.fighterViews.get("p2")?.sprite.texture.key,
    };
    tick(300);
    tick(240);
    const slam = {
      x: snapshot().fighters.p2.x,
      y: snapshot().fighters.p2.y,
      angle: scene.fighterViews.get("p2")?.sprite.angle,
      health: snapshot().fighters.p2.health,
      texture: scene.fighterViews.get("p2")?.sprite.texture.key,
    };
    tick(60);
    tick(250);
    const slideStart = {
      x: snapshot().fighters.p2.x,
      targetX: snapshot().throwSequence.slideTargetX,
      angle: scene.fighterViews.get("p2")?.sprite.angle,
    };
    tick(380);
    const slideMid = {
      x: snapshot().fighters.p2.x,
      angle: scene.fighterViews.get("p2")?.sprite.angle,
    };
    tick(380);
    const slideEnd = {
      phase: snapshot().throwSequence.phase,
      x: snapshot().fighters.p2.x,
      angle: scene.fighterViews.get("p2")?.sprite.angle,
      texture: scene.fighterViews.get("p2")?.sprite.texture.key,
    };
    const throwMotion = { defenderStartX, pull, lift, slam, slideStart, slideMid, slideEnd };

    await fresh();
    const koFighters = position(430, 530);
    koFighters.p2.health = 18;
    tick(16, { ...empty(), throw: true });
    tick(180);
    tick(300);
    tick(240);
    const koThrow = {
      health: snapshot().fighters.p2.health,
      texture: scene.fighterViews.get("p2")?.sprite.texture.key,
    };

    const originalPlaySfx = scene.playSfx;
    const recordAttackSfx = async (p1Input, p2Input, durationMs) => {
      await fresh();
      position(430, 530);
      const played = [];
      scene.playSfx = (key) => {
        played.push(key);
        return true;
      };
      tick(16, p1Input, p2Input);
      tick(durationMs, empty(), p2Input);
      scene.playSfx = originalPlaySfx;
      return played;
    };
    const basicAttackSfx = {
      punch: await recordAttackSfx({ ...empty(), punch: true }, empty(), 140),
      kick: await recordAttackSfx({ ...empty(), kick: true }, empty(), 240),
      block: await recordAttackSfx({ ...empty(), punch: true }, { ...empty(), block: true }, 140),
    };

    let state = await fresh();
    let fighters = position(430, 530);
    tick(16, { ...empty(), throw: true });
    const grabbedTexture = scene.fighterViews.get("p2")?.sprite.texture.key;
    tick(180);
    const liftedTexture = scene.fighterViews.get("p2")?.sprite.texture.key;
    tick(300);
    tick(300);
    tick(250);
    const recoveryTexture = scene.fighterViews.get("p2")?.sprite.texture.key;

    state = await fresh();
    fighters = position(430, 530);
    const p1Before = fighters.p2.health;
    tick(16, { ...empty(), throw: true });
    const p1Active = { ...snapshot().throwSequence };
    tick(1000);
    const p1MidPhase = snapshot().throwSequence.phase;
    tick(900);
    const p1Damage = p1Before - snapshot().fighters.p2.health;

    state = await fresh();
    fighters = position(430, 530);
    const p2Before = fighters.p1.health;
    tick(16, empty(), { ...empty(), throw: true });
    const p2Active = { ...snapshot().throwSequence };
    completeThrow();
    const p2Damage = p2Before - snapshot().fighters.p1.health;

    state = await fresh();
    fighters = position(240, 720);
    const whiffBefore = fighters.p2.health;
    tick(16, { ...empty(), throw: true });
    const whiffActive = { ...snapshot().throwSequence };
    completeThrow();
    const whiffDamage = whiffBefore - snapshot().fighters.p2.health;

    state = await fresh();
    fighters = position(430, 530);
    fighters.p2.blocking = true;
    const blockBefore = fighters.p2.health;
    tick(16, { ...empty(), throw: true });
    const blockActive = { ...snapshot().throwSequence };
    completeThrow();
    const blockDamage = blockBefore - snapshot().fighters.p2.health;

    state = await fresh();
    fighters = position(430, 530);
    fighters.p2.grounded = false;
    fighters.p2.y -= 80;
    const airBefore = fighters.p2.health;
    tick(16, { ...empty(), throw: true });
    const airActive = { ...snapshot().throwSequence };
    completeThrow();
    const airDamage = airBefore - snapshot().fighters.p2.health;

    state = await fresh();
    fighters = position(430, 530);
    tick(16, { ...empty(), throw: true });
    scene.sim.cancelSpecialSequence();
    scene.syncViews(scene.sim.snapshot);
    const cleanup = {
      throw: { ...snapshot().throwSequence },
      p1: { x: snapshot().fighters.p1.x, y: snapshot().fighters.p1.y, grounded: snapshot().fighters.p1.grounded, angle: scene.fighterViews.get("p1")?.sprite.angle },
      p2: { x: snapshot().fighters.p2.x, y: snapshot().fighters.p2.y, grounded: snapshot().fighters.p2.grounded, angle: scene.fighterViews.get("p2")?.sprite.angle },
    };

    const playableFighters = ["esleigue", "karlo", "idjao", "dellomas", "vince", "mark", "hernandez", "gerald"];
    const rosterThrows = [];
    for (const fighterKey of playableFighters) {
      await fresh(fighterKey, "karlo");
      const rosterFighters = position(430, 530);
      const before = rosterFighters.p2.health;
      tick(16, { ...empty(), throw: true });
      const startedPhase = snapshot().throwSequence.phase;
      const casterTexture = scene.fighterViews.get("p1")?.sprite.texture.key;
      tick(1950);
      rosterThrows.push({
        fighterKey,
        startedPhase,
        damage: before - snapshot().fighters.p2.health,
        completed: snapshot().throwSequence.phase === "idle",
        casterTexture,
      });
    }

    const rosterThrowsRight = [];
    for (const fighterKey of playableFighters) {
      await fresh("karlo", fighterKey);
      const rosterFighters = position(430, 530);
      const before = rosterFighters.p1.health;
      tick(16, empty(), { ...empty(), throw: true });
      const startedPhase = snapshot().throwSequence.phase;
      const casterTexture = scene.fighterViews.get("p2")?.sprite.texture.key;
      tick(1950);
      rosterThrowsRight.push({
        fighterKey,
        startedPhase,
        damage: before - snapshot().fighters.p1.health,
        completed: snapshot().throwSequence.phase === "idle",
        casterTexture,
      });
    }

    await fresh("karlo", "esleigue", "pvc");
    const cpuFighters = position(430, 530);
    cpuFighters.p1.blocking = true;
    const originalRandom = Math.random;
    Math.random = () => 0;
    const cpuInput = scene.readAiInput(1000);
    Math.random = originalRandom;

    return {
      screen: scene.screen,
      rendering: {
        canvasWidth: scene.game.canvas.width,
        canvasHeight: scene.game.canvas.height,
        cssWidth: scene.game.canvas.clientWidth,
        cssHeight: scene.game.canvas.clientHeight,
        cameraZoom: scene.cameras.main.zoom,
        cameraWidth: scene.cameras.main.width,
        cameraHeight: scene.cameras.main.height,
      },
      controls: { p1Throw: scene.keys.p1.throw.keyCode, p2Throw: scene.keys.p2.throw.keyCode },
      karloThrowFrames: [1, 2, 3].every((frame) => window.__bsuFighterGame.textures.exists(\`karlo-throw-frame-\${frame}\`)),
      throwMotion,
      koThrow,
      basicAttackSfx,
      throwPoseTextures: { grabbedTexture, liftedTexture, recoveryTexture },
      p1Active,
      p1MidPhase,
      p1Damage,
      p2Active,
      p2Damage,
      whiffActive,
      whiffDamage,
      blockActive,
      blockDamage,
      airActive,
      airDamage,
      cleanup,
      rosterThrows,
      rosterThrowsRight,
      cpuThrow: cpuInput.throw,
      refereeRoundNumbers,
      assistSmoke: { started: assistStarted, active: assistActive, cleanup: assistCleanup },
      stageScroll,
      videoStage,
    };
  })()`);

  report.visualThrow = visualThrow;
  report.refereeIntro = { during: refereeIntroDuring, after: refereeIntroAfter, screenshotPath: refereeScreenshotPath };
  report.screenshotPath = screenshotPath;
  report.videoStageVisual = { ...videoStageVisual, screenshotPath: videoStageScreenshotPath };

  if (
    report.screen !== "playing" ||
    !report.karloThrowFrames ||
    report.controls.p1Throw !== 84 ||
    report.controls.p2Throw !== 73 ||
    report.visualThrow.grabbedTexture !== "karlo-hurt" ||
    report.visualThrow.liftedTexture !== "karlo-hurt" ||
    report.visualThrow.liftedPose.y >= 492 ||
    Math.abs(report.visualThrow.liftedPose.angle) < 15 ||
    report.throwMotion.pull.texture !== "karlo-hurt" ||
    report.throwMotion.pull.x >= report.throwMotion.defenderStartX ||
    Math.abs(report.throwMotion.pull.angle) < 8 ||
    report.throwMotion.lift.texture !== "karlo-hurt" ||
    Math.abs(report.throwMotion.lift.angle) < 15 ||
    report.throwMotion.slam.texture !== "karlo-ko" ||
    Math.abs(report.throwMotion.slam.angle) < 45 ||
    report.throwMotion.slam.y !== 492 ||
    report.throwMotion.slam.health !== 182 ||
    report.throwMotion.slideStart.targetX === null ||
    report.throwMotion.slideStart.targetX <= report.throwMotion.slideStart.x ||
    report.throwMotion.slideStart.x <= report.throwMotion.slam.x ||
    Math.abs(report.throwMotion.slideStart.angle) < 20 ||
    report.throwMotion.slideMid.x <= report.throwMotion.slideStart.x ||
    report.throwMotion.slideEnd.phase !== "idle" ||
    Math.abs(report.throwMotion.slideEnd.angle) > 0.01 ||
    report.throwMotion.slideEnd.texture !== "karlo-hurt" ||
    report.koThrow.health !== 0 ||
    report.koThrow.texture !== "karlo-ko" ||
    report.basicAttackSfx.punch.includes("sfx-whoosh") ||
    !report.basicAttackSfx.punch.includes("sfx-punch-hit") ||
    report.basicAttackSfx.kick.includes("sfx-whoosh") ||
    !report.basicAttackSfx.kick.includes("sfx-kick-hit") ||
    report.basicAttackSfx.block.includes("sfx-whoosh") ||
    !report.basicAttackSfx.block.includes("sfx-block") ||
    report.throwPoseTextures.grabbedTexture !== "karlo-hurt" ||
    report.throwPoseTextures.liftedTexture !== "karlo-hurt" ||
    report.throwPoseTextures.recoveryTexture !== "karlo-ko" ||
    report.p1Active.phase === "idle" ||
    report.p1MidPhase === "idle" ||
    report.p1Damage !== 18 ||
    report.p2Active.phase === "idle" ||
    report.p2Damage !== 18 ||
    report.whiffActive.phase !== "whiff" ||
    report.whiffDamage !== 0 ||
    report.blockActive.phase === "idle" ||
    report.blockDamage !== 18 ||
    report.airActive.phase !== "whiff" ||
    report.airDamage !== 0 ||
    report.cleanup.throw.phase !== "idle" ||
    !report.cleanup.p1.grounded ||
    !report.cleanup.p2.grounded ||
    Math.abs(report.cleanup.p1.angle) > 0.01 ||
    Math.abs(report.cleanup.p2.angle) > 0.01 ||
    !report.cpuThrow ||
    report.assistSmoke.started.phase !== "entrance" ||
    report.assistSmoke.started.meter !== 0 ||
    !report.assistSmoke.started.hasActor ||
    report.assistSmoke.started.timerMs <= 0 ||
    report.assistSmoke.active.phase !== "active" ||
    !report.assistSmoke.active.hasActor ||
    report.assistSmoke.cleanup.phase !== "idle" ||
    report.assistSmoke.cleanup.hasActor ||
    !report.assistSmoke.cleanup.timerUnchangedDuringCall ||
    report.stageScroll.stageWidth <= report.stageScroll.visibleWorldWidth ||
    report.stageScroll.cameraRight <= report.stageScroll.cameraLeft ||
    report.stageScroll.constrainedSeparation > report.stageScroll.maxSeparation + 0.01 ||
    report.videoStage.stageWidth !== 1920 ||
    report.videoStage.stageHeight !== 540 ||
    report.videoStage.groundY !== 506 ||
    !report.videoStage.scrolling ||
    !report.videoStage.hasVideo ||
    report.videoStage.readyState < 2 ||
    report.videoStage.mediaError !== null ||
    !report.videoStage.muted ||
    !report.videoStage.loop ||
    report.videoStage.objectFit !== "contain" ||
    !report.videoStage.referee.active ||
    !report.videoStage.referee.hasNode ||
    report.videoStage.referee.left === null ||
    report.videoStage.referee.right === null ||
    report.videoStage.referee.top === null ||
    report.videoStage.referee.bottom === null ||
    report.videoStage.referee.right < 0 ||
    report.videoStage.referee.left > report.videoStage.referee.viewportWidth ||
    report.videoStage.referee.bottom < 0 ||
    report.videoStage.referee.top > report.videoStage.referee.viewportHeight ||
    report.videoStage.cameraRight <= report.videoStage.cameraLeft ||
    report.videoStage.cameraLeft < 0 ||
    report.videoStage.cameraRight > report.videoStage.stageWidth - report.videoStage.visibleWorldWidth + 0.01 ||
    report.videoStage.cameraScrollY !== 0 ||
    Math.abs(report.videoStage.initialCameraCenter - report.videoStage.initialMidpoint) > 1 ||
    Math.abs(report.videoStageVisual.cameraCenter - report.videoStageVisual.midpoint) > 1 ||
    !report.videoStageVisual.refereeVisible ||
    report.rosterThrows.length !== 8 ||
    report.rosterThrowsRight.length !== 8 ||
    report.rosterThrows.some((throwResult) =>
      throwResult.startedPhase === "idle" ||
      throwResult.damage !== 18 ||
      !throwResult.completed ||
      !throwResult.casterTexture,
    ) ||
    report.rosterThrowsRight.some((throwResult) =>
      throwResult.startedPhase === "idle" ||
      throwResult.damage !== 18 ||
      !throwResult.completed ||
      !throwResult.casterTexture,
    ) ||
    !report.refereeIntro.during.active ||
    report.refereeIntro.during.timerMs !== 120000 ||
    report.refereeIntro.during.refereeFrames !== 1 ||
    report.refereeIntro.during.auras !== 1 ||
    report.refereeIntro.during.signs !== 1 ||
    report.refereeIntro.during.refereeSource !== "/assets/referee/frame_4.png" ||
    report.refereeIntro.during.signDisplay === "none" ||
    report.refereeIntro.during.signText !== "ROUND\n1" ||
    report.refereeIntro.after.active ||
    report.refereeIntro.after.timerMs >= 120000 ||
    report.refereeIntro.after.refereeFrames !== 0 ||
    report.refereeIntro.after.auras !== 0 ||
    report.refereeIntro.after.signs !== 0 ||
    report.refereeRoundNumbers.join(",") !== "1,2,3,4,5"
  ) {
    throw new Error(`Karlo throw smoke test failed: ${JSON.stringify(report, null, 2)}`);
  }

  console.log(JSON.stringify(report, null, 2));
} finally {
  await client.send("Browser.close").catch(() => {});
  browser.kill();
}
