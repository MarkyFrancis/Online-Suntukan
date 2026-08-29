import Phaser from "phaser";
import {
  allFrameAnimationAssets,
  allExtraSfxAssets,
  allPoseAssets,
  allSpecialAssets,
  allThrowAssets,
  allVfxAssets,
  attackVfxManifest,
  entranceVfxManifests,
  extraSfxManifest,
  fighterManifests,
  getFighterManifest,
  getStageManifest,
  getVfxAsset,
  isFighterPlayable,
  menuLightningManifests,
  menuMusicTrackManifests,
  refereeIntroManifest,
  sfxManifest,
  shouldFlipFighterAsset,
  shouldFlipSpecialFrameAsset,
  shouldFlipSpecialAsset,
  specialVfxManifest,
  stageManifests,
  type FighterAssetManifest,
  type MovementAnimationName,
  type PoseAsset,
  type PoseName,
  type SpecialEffectKind,
  type StageAssetManifest,
  type VfxConfig,
} from "../../game/assets/manifest";
import { audioConfig } from "../../game/config/audio";
import { aiDifficulty } from "../../game/config/ai";
import { arcadeFonts } from "../../game/config/fonts";
import {
  menuLightningConfig,
  refereeRoundIntroPresentation,
  assistPresentation,
  spawnEntrancePresentation,
  specialIntroPresentation,
} from "../../game/config/presentation";
import {
  SPECIAL_ANIMATION_FRAME_RATE,
  SPECIAL_FRAME_MS,
  SPECIAL_INTRO_PAUSE_MS,
  SPECIAL_NAME_DISPLAY_MS,
  SPECIAL_RECOVERY_MS,
  SS_PARTNER_DOUBLE_TAP_MS,
  THROW_RECOVERY_MS,
  ASSIST_ENTRANCE_MS,
  ASSIST_EXIT_MS,
  type AttackName,
} from "../../game/config/attacks";
import { createKeyboardBindings, emptyInput, readInput, type KeyboardBindings, type PlayerInput } from "../../game/input/bindings";
import { FighterAi } from "../../game/simulation/ai";
import { RoundSimulation } from "../../game/simulation/RoundSimulation";
import type { FighterId, FighterState, GameMode, RoundSnapshot, ThrowSequenceState } from "../../game/simulation/types";
import {
  DomUi,
  type MatchScore,
  type MusicChoice,
  type PauseAction,
  type RoundSelection,
  type SelectSnapshot,
  type TouchAction,
  type TouchPhase,
} from "../../ui/dom";
import { stageWorldDefaults } from "../../game/config/stage";

type FighterView = {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  domImage: HTMLImageElement | null;
  domTextureKey: string | null;
  lastPose: PoseName | null;
  frameAnimation: {
    name: MovementAnimationName | null;
    frameIndex: number;
    nextFrameAtMs: number;
  };
  effect: {
    offsetX: number;
    offsetY: number;
    angle: number;
    scale: number;
  };
};

type ScreenState = "title" | "characters" | "stage" | "playing" | "paused" | "match-over";
type MenuKeys = Record<
  "enter" | "escape" | "space" | "music" | "mobile" | "p1Up" | "p1Down" | "p2Up" | "p2Down" | "p1Back" | "p2Back",
  Phaser.Input.Keyboard.Key
>;

type VoicePolicy = {
  hurtReadyAtMs: number;
  koPlayed: boolean;
};

type WindowWithWebkitAudio = Window & {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
};

const voiceKeyByPath = new Map<string, string>();
const sfxEntries = Object.values(sfxManifest);
const winsNeeded = 3;
const maxRoundOverPauseMs = 8000;
const fallbackRoundOverPauseMs = 1500;
const noMusicKey = "none";
const defaultMusicKey = "music-taguro-song";
const logicalStageWidth = stageWorldDefaults.visibleWidth;
const logicalStageHeight = stageWorldDefaults.visibleHeight;
const musicStorageKey = "bsu-online-suntukan.music";
const retiredMusicKeyMigration: Record<string, string> = {
  "music-ptangona-remix": "music-menu",
  "music-ptangona-remix-alt": "music-menu",
  "music-pngoa-remix": "music-menu",
};

type RefereeIntroElements = {
  aura: Phaser.GameObjects.DOMElement;
  referee: Phaser.GameObjects.DOMElement;
  frame: HTMLImageElement;
  roundSign: HTMLDivElement;
};

type SpawnEntranceElement = {
  dom: Phaser.GameObjects.DOMElement;
  image: HTMLImageElement;
};

type AssistView = {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  domImage: HTMLImageElement | null;
  domTextureKey: string | null;
  def: FighterAssetManifest;
  callerId: FighterId;
  facing: -1 | 1;
  x: number;
  y: number;
};

type SpecialTapState = {
  timer: Phaser.Time.TimerEvent | null;
  fireSingle: boolean;
};
const fighterBattleVisualScale = 1;
const musicChoices: MusicChoice[] = [
  { key: noMusicKey, displayName: "No Music" },
  ...menuMusicTrackManifests.map((track) => ({ key: track.key, displayName: track.displayName })),
];

export class BattleScene extends Phaser.Scene {
  private ui!: DomUi;
  private keys!: KeyboardBindings;
  private menuKeys!: MenuKeys;
  private sim: RoundSimulation | null = null;
  private ai = new FighterAi(aiDifficulty);
  private fighterViews = new Map<FighterId, FighterView>();
  private background!: Phaser.GameObjects.Image | Phaser.GameObjects.TileSprite;
  private screen: ScreenState = "title";
  private hasStarted = false;
  private mobileMode = false;
  private touchInput: PlayerInput = emptyInput();
  private stageIndex = 0;
  private pauseIndex = 0;
  private settingsOpen = false;
  private roundAdvanceEvent: Phaser.Time.TimerEvent | null = null;
  private roundEndHandled = false;
  private selectState: SelectSnapshot = {
    mode: "pvp",
    step: "main",
    p1Index: 0,
    p2Index: 1,
    p1Locked: false,
    p2Locked: false,
    p1AssistIndex: 2,
    p2AssistIndex: 3,
    p1AssistLocked: false,
    p2AssistLocked: false,
  };
  private lastSelection: RoundSelection = {
    mode: "pvp",
    p1FighterKey: fighterManifests[0].key,
    p2FighterKey: fighterManifests[1]?.key ?? fighterManifests[0].key,
    p1AssistKey: fighterManifests[2]?.key ?? fighterManifests[0].key,
    p2AssistKey: fighterManifests[3]?.key ?? fighterManifests[1]?.key ?? fighterManifests[0].key,
    stageKey: stageManifests[0].key,
  };
  private score: MatchScore = { p1: 0, p2: 0 };
  private voicePolicy: Record<FighterId, VoicePolicy> = {
    p1: { hurtReadyAtMs: 0, koPlayed: false },
    p2: { hurtReadyAtMs: 0, koPlayed: false },
  };
  private playingVoiceKeys = new Set<string>();
  private specialActivationSounds: Phaser.Sound.BaseSound[] = [];
  private currentGroundY = 474;
  private currentStageWidth: number = stageWorldDefaults.stageWidth;
  private currentStageHeight: number = stageWorldDefaults.stageHeight;
  private currentStageLeft: number = stageWorldDefaults.edgePadding;
  private currentStageRight: number = stageWorldDefaults.stageWidth - stageWorldDefaults.edgePadding;
  private currentCameraMinX: number = logicalStageWidth / 2;
  private currentCameraMaxX: number = stageWorldDefaults.stageWidth - logicalStageWidth / 2;
  private currentStageScrolling = true;
  private cameraRefitFrame: number | null = null;
  private readonly onScaleResize = () => this.fitBattleCamera();
  private readonly onUserInteraction = () => this.unlockAudio();
  private menuMusic: Phaser.Sound.BaseSound | null = null;
  private menuMusicKey: string | null = null;
  private selectedMusicKey = defaultMusicKey;
  private musicLoadPromises = new Map<string, Promise<boolean>>();
  private menuLightningTimers: Phaser.Time.TimerEvent[] = [];
  private menuLightningElements: HTMLElement[] = [];
  private specialEffectObjects: Phaser.GameObjects.GameObject[] = [];
  private specialEffectTimers: Phaser.Time.TimerEvent[] = [];
  private specialEffectTweens: Phaser.Tweens.Tween[] = [];
  private specialHtmlAudios: HTMLAudioElement[] = [];
  private specialActorDomImage: HTMLImageElement | null = null;
  private specialActorDomSprite: Phaser.GameObjects.Sprite | null = null;
  private specialActorDomTextureKey: string | null = null;
  private vfxObjects: Phaser.GameObjects.GameObject[] = [];
  private vfxTweens: Phaser.Tweens.Tween[] = [];
  private vfxTimers: Phaser.Time.TimerEvent[] = [];
  private playingSfxKeys = new Set<string>();
  private sfxCooldownUntil = new Map<string, number>();
  private selectionConfirming = false;
  private selectionConfirmEvent: Phaser.Time.TimerEvent | null = null;
  private selectionConfirmTimers: Phaser.Time.TimerEvent[] = [];
  private roundOverPlayed = false;
  private lastRoundOverPauseMs = fallbackRoundOverPauseMs;
  private roundStartSoundHandled = false;
  private roundIntroActive = false;
  private refereeIntroRunId = 0;
  private refereeIntroElements: RefereeIntroElements | null = null;
  private refereeIntroTimers: Phaser.Time.TimerEvent[] = [];
  private refereeIntroTweens: Phaser.Tweens.Tween[] = [];
  private refereeAuraSound: Phaser.Sound.BaseSound | null = null;
  private stageVideo: HTMLVideoElement | null = null;
  private stageVideoStageKey: string | null = null;
  private stageVideoReady = false;
  private preparedStageVideoPath: string | null = null;
  private preparedStageVideoAvailable = false;
  private stageVideoUnlockHandler: (() => void) | null = null;
  private spawnEntranceActive = false;
  private spawnEntranceRunId = 0;
  private spawnEntranceRevealed = new Set<FighterId>();
  private spawnEntranceElements = new Map<FighterId, SpawnEntranceElement>();
  private spawnEntranceFallbacks: Phaser.GameObjects.GameObject[] = [];
  private spawnEntranceTimers: Phaser.Time.TimerEvent[] = [];
  private spawnEntranceTweens: Phaser.Tweens.Tween[] = [];
  private queuedTextureKeys = new Set<string>();
  private textureAssetPaths = new Map<string, string>();
  private queuedAudioKeys = new Set<string>();
  private matchAssetLoadInProgress = false;
  private matchAssetLoadRunId = 0;
  private assistView: AssistView | null = null;
  private assistRunId = 0;
  private assistTimers: Phaser.Time.TimerEvent[] = [];
  private assistTweens: Phaser.Tweens.Tween[] = [];
  private assistEntranceDom: Phaser.GameObjects.DOMElement | null = null;
  private assistImpactSfxPlayed = false;
  private specialTapStates: Record<"p1" | "p2", SpecialTapState> = {
    p1: { timer: null, fireSingle: false },
    p2: { timer: null, fireSingle: false },
  };

  constructor() {
    super("BattleScene");
  }

  preload() {
    this.bindLoadingProgress();
    this.selectedMusicKey = this.loadSavedMusicKey();
    const defaultStage = getStageManifest(stageManifests[0]?.key ?? "");
    const initialMusic = this.selectedMusicTrack();
    this.queueImageFile(defaultStage.key, defaultStage.path);
    this.queueAudioFile(sfxManifest.menuSelect.key, sfxManifest.menuSelect.path);
    // Load the chosen opening track with Phaser's initial loader. This avoids
    // competing loaders if the player clicks a menu button immediately.
    if (initialMusic) {
      this.queueAudioFile(initialMusic.key, initialMusic.path);
    }
  }

  create() {
    this.configureDomOverlayLayer();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onScaleResize);
    this.fitBattleCamera();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onScaleResize);
      window.removeEventListener("pointerdown", this.onUserInteraction, true);
      window.removeEventListener("keydown", this.onUserInteraction, true);
      if (this.cameraRefitFrame !== null) {
        cancelAnimationFrame(this.cameraRefitFrame);
        this.cameraRefitFrame = null;
      }
      this.cleanupStageVideo();
    });
    this.ensureFallbackTextures();
    this.configureFighterTextureFiltering();
    this.preloadUiFonts();
    this.createVfxAnimations();
    this.createBackground();
    this.createFloorMarks();
    window.addEventListener("pointerdown", this.onUserInteraction, true);
    window.addEventListener("keydown", this.onUserInteraction, true);
    this.keys = createKeyboardBindings(this);
    this.menuKeys = this.createMenuKeys();
    this.selectedMusicKey = this.loadSavedMusicKey();
    this.ui = new DomUi(
      {
        chooseMode: (mode) => {
          this.setMobileMode(false);
          this.enterCharacterSelect(mode);
        },
        chooseMobileMode: () => {
          this.setMobileMode(true);
          this.enterCharacterSelect("pvc");
        },
        previewSelection: () => undefined,
        startMatch: (selection) => this.startMatch(selection, true),
        changeMusic: (delta) => this.changeMusicSelection(delta),
        openSettings: () => this.openSettingsMenu(),
        closeSettings: () => this.closeSettingsMenu(),
        pauseAction: (action) => this.applyPauseAction(action),
        restartMatch: () => this.startMatch(this.lastSelection, true),
        mainMenu: () => this.enterMainMenu(),
        selectFighter: (index) => this.handleMobileFighterSelect(index),
        backFromCharacters: () => this.handleCharacterSelectBack(),
        backFromStage: () => this.enterCharacterSelect(this.lastSelection.mode),
        touchAction: (action, phase) => this.handleTouchAction(action, phase),
        mobilePause: () => this.pauseGame(),
        unlockAudio: () => this.unlockAudio(),
      },
      fighterManifests,
      stageManifests,
      musicChoices,
    );
    this.ui.updateMusicChoice(this.selectedMusicKey);
    this.enterMainMenu();
    this.hideLoadingScreen();
  }

  // Phaser keeps GIF-backed effects in a sibling DOM container. Keep that
  // container above the WebGL canvas while stage video stays underneath both.
  private configureDomOverlayLayer() {
    const domContainer = this.game.domContainer;
    if (!domContainer) {
      return;
    }
    domContainer.classList.add("phaser-dom-overlay");
    domContainer.style.zIndex = "2";
    domContainer.style.pointerEvents = "none";
  }

  update(_time: number, deltaMs: number) {
    const clampedDelta = Math.min(deltaMs, 34);
    this.handleScreenInput();

    if (!this.sim || this.screen !== "playing") {
      this.ui.updateHud(this.sim?.snapshot ?? null, this.score);
      return;
    }

    if (this.roundIntroActive) {
      this.updateBattleCamera(this.sim.snapshot, false, clampedDelta);
      this.syncViews(this.sim.snapshot);
      this.syncAssistDomVisual();
      this.syncSpecialActorDomVisual();
      this.ui.updateHud(this.sim.snapshot, this.score);
      return;
    }

    const p1Input = this.mobileMode ? this.readTouchInput() : readInput(this.keys.p1);
    const p1CanAct =
      this.sim.snapshot.specialSequence.phase === "idle" && this.sim.snapshot.assistSequence.phase === "idle";
    const inputs =
      this.sim.snapshot.status === "playing"
        ? {
            p1: p1CanAct ? this.resolveSpecialTap("p1", p1Input) : emptyInput(),
            p2:
              p1CanAct && this.sim.snapshot.mode === "pvc"
                ? this.readAiInput(clampedDelta)
                : p1CanAct
                  ? this.resolveSpecialTap("p2", readInput(this.keys.p2))
                  : emptyInput(),
          }
        : {
            p1: emptyInput(),
            p2: emptyInput(),
          };

    this.sim.update(clampedDelta, inputs);
    this.updateBattleCamera(this.sim.snapshot, false, clampedDelta);
    this.syncViews(this.sim.snapshot);
    this.syncAssistDomVisual();
    this.syncSpecialActorDomVisual();
    this.ui.updateHud(this.sim.snapshot, this.score);
  }

  private enterMainMenu() {
    this.setMobileMode(false);
    this.clearTouchInput();
    this.stopRoundAdvance();
    this.clearSpecialTapStates();
    this.cancelSelectionConfirm();
    this.cleanupRefereeRoundIntro();
    this.cleanupMenuLightning();
    this.stopTransientSfx();
    this.sim?.cancelSpecialSequence();
    this.cleanupSpecialEffects();
    this.cleanupAssist();
    this.resetMatch();
    this.settingsOpen = false;
    this.screen = "title";
    this.sim = null;
    this.destroyFighterViews();
    this.setStage(this.lastSelection.stageKey);
    this.playMenuMusic();
    this.ui.showMainMenu();
    this.startMenuLightning();
    this.ui.updateHud(null, this.score);
  }

  private enterCharacterSelect(mode: GameMode) {
    this.clearTouchInput();
    this.stopRoundAdvance();
    this.clearSpecialTapStates();
    this.cancelSelectionConfirm();
    this.cleanupRefereeRoundIntro();
    this.cleanupMenuLightning();
    this.stopTransientSfx();
    this.sim?.cancelSpecialSequence();
    this.cleanupSpecialEffects();
    this.cleanupAssist();
    this.resetMatch();
    this.settingsOpen = false;
    this.screen = "characters";
    this.sim = null;
    this.destroyFighterViews();
    this.playMenuMusic();
    this.selectState = {
      mode,
      step: "main",
      p1Index: this.findFighterIndex(this.lastSelection.p1FighterKey, 0),
      p2Index: this.findFighterIndex(this.lastSelection.p2FighterKey, 1),
      p1Locked: false,
      p2Locked: false,
      p1AssistIndex: this.findFighterIndex(this.lastSelection.p1AssistKey, 2),
      p2AssistIndex: this.findFighterIndex(this.lastSelection.p2AssistKey, 3),
      p1AssistLocked: false,
      p2AssistLocked: false,
    };
    this.ui.showCharacterSelect(this.selectState);
    this.ui.setMobileControls(false);
    this.startMenuLightning();
  }

  private enterStageSelect() {
    this.clearTouchInput();
    this.cancelSelectionConfirm();
    this.clearSpecialTapStates();
    this.cleanupRefereeRoundIntro();
    this.cleanupMenuLightning();
    this.settingsOpen = false;
    this.sim?.cancelSpecialSequence();
    this.cleanupSpecialEffects();
    this.cleanupAssist();
    this.screen = "stage";
    this.playMenuMusic();
    this.lastSelection = this.selectionFromSelectState();
    this.stageIndex = this.findStageIndex(this.lastSelection.stageKey);
    this.setStage(this.lastSelection.stageKey);
    this.ui.showStageSelect(this.lastSelection);
    this.ui.setMobileControls(false);
    this.startMenuLightning();
  }

  private startMatch(selection: RoundSelection, resetScore: boolean) {
    if (this.matchAssetLoadInProgress) {
      return;
    }
    this.hasStarted = true;
    this.lastSelection = this.normalizeSelection(selection);
    this.stageIndex = this.findStageIndex(this.lastSelection.stageKey);
    if (resetScore) {
      this.resetMatch();
    }

    const runId = ++this.matchAssetLoadRunId;
    this.matchAssetLoadInProgress = true;
    this.showLoadingScreen("Loading selected fighters and stage...", 0);
    void this.loadSelectedMatchAssets(this.lastSelection)
      .catch(() => {
        // Missing optional assets should never strand the match behind the loader.
      })
      .then(() => {
        if (runId !== this.matchAssetLoadRunId) {
          return;
        }
        this.matchAssetLoadInProgress = false;
        this.hideLoadingScreen();
        this.startRound();
      });
  }

  private startRound() {
    this.stopRoundAdvance();
    this.clearTouchInput();
    this.clearSpecialTapStates();
    this.cleanupRefereeRoundIntro();
    this.sim?.cancelSpecialSequence();
    // Do not let setStage() frame the previous round while the new fighters
    // are being created. The next round must begin from the stage center.
    this.sim = null;
    this.cleanupSpecialEffects();
    this.cleanupAssist();
    this.cleanupMenuLightning();
    this.screen = "playing";
    this.settingsOpen = false;
    this.roundEndHandled = false;
    this.roundOverPlayed = false;
    this.roundStartSoundHandled = false;
    this.stopTransientSfx();
    this.resetVoicePolicy();
    this.stopMenuMusic();
    this.playSfx(sfxManifest.menuSelect.key, "menuSelect");
    this.ui.hideRoundMessage();
    this.ui.hidePauseMenu();
    this.ui.showGameplay();
    this.ui.setMobileControls(this.mobileMode);
    this.ai.reset();
    this.destroyFighterViews();

    const p1Def = getFighterManifest(this.lastSelection.p1FighterKey);
    const p2Def = getFighterManifest(this.lastSelection.p2FighterKey);
    const p1AssistDef = getFighterManifest(this.lastSelection.p1AssistKey);
    const p2AssistDef = getFighterManifest(this.lastSelection.p2AssistKey);
    this.setStage(this.lastSelection.stageKey);
    this.ui.setAssistSelection(p1AssistDef, p2AssistDef);

    this.sim = new RoundSimulation(this.lastSelection.mode, p1Def, p2Def, {
      onAttack: (fighter, attackName) => {
        this.playAttackVoice(fighter, attackName);
      },
      onHit: (_attacker, victim, attackName) => {
        this.playAttackImpactVfx(_attacker, victim, attackName);
        this.playSfx(
          attackName === "kick" ? sfxManifest.kickHit.key : sfxManifest.punchHit.key,
          attackName === "kick" ? "kickHit" : "punchHit",
        );
        this.playHurtVoice(victim);
      },
      onBlock: (attacker, victim) => {
        this.playAttackImpactVfx(attacker, victim, "block");
        this.playSfx(sfxManifest.block.key, "block");
      },
      onSpecialStart: (fighter, victim) => {
        this.playSpecialCastSequence(fighter, victim);
      },
      onSpecialHit: (attacker, victim) => {
        this.playSpecialImpactSfx(attacker);
        this.playSpecialImpactVfx(attacker, victim);
        this.playSpecialImpact(attacker, victim);
        this.playHurtVoice(victim);
      },
      onSpecialEnd: () => {
        this.cleanupSpecialEffects();
      },
      onThrowImpact: (attacker, victim) => {
        this.playThrowImpactVfx(attacker, victim);
        this.playSfx(extraSfxManifest.bodyThrowImpact.key, "kickHit", {
          oneShot: true,
          cooldownMs: 1200,
        });
        this.playHurtVoice(victim);
        this.cameras.main.shake(150, 0.008);
      },
      onThrowEnd: () => {
        for (const view of this.fighterViews.values()) {
          view.effect.offsetX = 0;
          view.effect.offsetY = 0;
          view.effect.angle = 0;
          view.effect.scale = 1;
          view.sprite.setAngle(0);
          view.sprite.setScale(1);
          view.sprite.setAlpha(1);
          view.sprite.clearTint();
        }
      },
      onAssistStart: (caller, victim, assist) => {
        this.playAssistStart(caller, victim, assist);
      },
      onAssistHit: (caller, victim, assist) => {
        const assistView = this.assistView;
        if (
          !assistView?.sprite.active ||
          this.screen !== "playing" ||
          this.roundEndHandled
        ) {
          return;
        }
        const assistState = {
          ...caller,
          def: assist,
          x: assistView.x,
          y: assistView.y,
          facing: assistView.facing,
        };
        // The simulation event and the visible impact frame use the same
        // configured timestamp. Play the cue here, once, so it cannot be
        // queued behind the Partner exit animation.
        if (!this.assistImpactSfxPlayed) {
          // Keep Partner impact feedback identical to the main special path.
          this.playSpecialImpactSfx(assistState);
          this.assistImpactSfxPlayed = true;
        }
        this.playSpecialImpactVfx(assistState, victim);
        this.playSpecialImpact(assistState, victim);
        this.playHurtVoice(victim);
      },
      onAssistEnd: () => {
        this.cleanupAssist();
      },
      onKo: (winner) => {
        if (winner !== "draw") {
          const loser = winner === "p1" ? this.sim?.snapshot.fighters.p2 : this.sim?.snapshot.fighters.p1;
          if (loser) {
            if (loser.health <= 0) {
              this.playSfx(sfxManifest.ko.key, "ko", {
                oneShot: true,
                cooldownMs: maxRoundOverPauseMs,
                volumeMultiplier: 1.15,
              });
            }
            this.playKoVoice(loser);
          }
        } else {
          const fighters = this.sim?.snapshot.fighters;
          if (fighters) {
            this.playKoVoice(fighters.p1);
            this.playKoVoice(fighters.p2);
          }
        }
        this.handleRoundEnd(winner);
      },
    }, {
      groundY: this.currentGroundY,
      stageWidth: this.currentStageWidth,
      stageLeft: this.currentStageLeft,
      stageRight: this.currentStageRight,
      maxFighterSeparation: stageWorldDefaults.maxFighterSeparation,
      assistSpecials: { p1: p1AssistDef, p2: p2AssistDef },
    });

    this.createFighterView("p1", p1Def);
    this.createFighterView("p2", p2Def);
    this.syncViews(this.sim.snapshot);
    // A new round always starts from fresh, centered fighter positions. Snap
    // the camera to that snapshot before the entrance/referee sequence so a
    // previous round's scroll position cannot leave the fighters off-screen.
    this.updateBattleCamera(this.sim.snapshot, true, 16);
    // Browser zoom and the DOM loading overlay can settle one or two frames
    // after a match starts. Refit once the canvas has its final dimensions.
    this.scheduleCameraRefit();
    this.ui.updateHud(this.sim.snapshot, this.score);
    this.playRoundStartSequence(this.currentRoundNumber());
  }

  private handleRoundEnd(winner: FighterId | "draw") {
    if (this.roundEndHandled || !this.sim) {
      return;
    }

    this.roundEndHandled = true;
    this.clearSpecialTapStates();
    this.cleanupRefereeRoundIntro();
    this.sim.cancelSpecialSequence();
    this.cleanupSpecialEffects();
    const roundOverPauseMs = this.playRoundOverSfx();
    if (winner !== "draw") {
      this.score[winner] += 1;
    }

    const winnerText =
      winner === "draw" ? "Draw round" : `${this.sim.snapshot.fighters[winner].def.displayName} wins the round`;
    this.ui.updateHud(this.sim.snapshot, this.score);
    this.ui.showRoundMessage(winnerText);

    if (winner !== "draw" && this.score[winner] >= winsNeeded) {
      this.roundAdvanceEvent = this.time.delayedCall(roundOverPauseMs, () => this.showMatchWinner(winner));
      return;
    }

    this.roundAdvanceEvent = this.time.delayedCall(roundOverPauseMs, () => this.startRound());
  }

  private showMatchWinner(winner: FighterId) {
    if (!this.sim) {
      return;
    }
    this.screen = "match-over";
    this.clearTouchInput();
    this.clearSpecialTapStates();
    this.cleanupRefereeRoundIntro();
    this.sim.cancelSpecialSequence();
    this.cleanupSpecialEffects();
    this.cleanupAssist();
    this.cleanupMenuLightning();
    this.sound.stopAll();
    this.clearSfxGuards();
    this.ui.hideRoundMessage();
    this.ui.setMobileControls(false);
    this.ui.showMatchWinner(this.sim.snapshot.fighters[winner].def.displayName, this.score);
  }

  private pauseGame() {
    if (this.screen !== "playing" || this.sim?.snapshot.status !== "playing") {
      return;
    }
    this.screen = "paused";
    this.clearTouchInput();
    this.clearSpecialTapStates();
    this.pauseIndex = 0;
    this.cleanupRefereeRoundIntro();
    this.sim.cancelSpecialSequence();
    this.cleanupSpecialEffects();
    this.cleanupAssist();
    this.cleanupMenuLightning();
    this.sound.pauseAll();
    this.tweens.pauseAll();
    this.time.paused = true;
    this.ui.setMobileControls(this.mobileMode, true);
    this.ui.showPauseMenu(this.pauseIndex);
  }

  private resumeGame() {
    if (this.screen !== "paused") {
      return;
    }
    this.screen = "playing";
    this.time.paused = false;
    this.tweens.resumeAll();
    this.sound.resumeAll();
    this.ui.setMobileControls(this.mobileMode, false);
    this.ui.hidePauseMenu();
  }

  private applyPauseAction(action: PauseAction) {
    if (action === "resume") {
      this.resumeGame();
      return;
    }

    this.sound.stopAll();
    this.clearSfxGuards();
    this.clearTouchInput();
    this.cleanupRefereeRoundIntro();
    this.cleanupSpecialEffects();
    this.cleanupAssist();
    this.time.paused = false;
    this.tweens.resumeAll();
    this.ui.hidePauseMenu();

    if (action === "restart-round") {
      this.startRound();
    } else if (action === "character-select") {
      this.enterCharacterSelect(this.lastSelection.mode);
    } else if (action === "stage-select") {
      this.resetMatch();
      this.sim = null;
      this.destroyFighterViews();
      this.enterStageSelect();
    } else if (action === "main-menu") {
      this.enterMainMenu();
    }
  }

  private handleScreenInput() {
    if (this.screen === "title") {
      if (this.settingsOpen) {
        this.handleSettingsInput();
        return;
      }
      if (this.just(this.menuKeys.music)) {
        this.openSettingsMenu();
        return;
      }
      if (this.just(this.keys.p1.punch)) {
        this.playSfx(sfxManifest.menuSelect.key, "menuSelect");
        this.setMobileMode(false);
        this.enterCharacterSelect("pvp");
      } else if (this.just(this.keys.p2.punch)) {
        this.playSfx(sfxManifest.menuSelect.key, "menuSelect");
        this.setMobileMode(false);
        this.enterCharacterSelect("pvc");
      } else if (this.just(this.menuKeys.mobile)) {
        this.playSfx(sfxManifest.menuSelect.key, "menuSelect");
        this.setMobileMode(true);
        this.enterCharacterSelect("pvc");
      }
      return;
    }

    if (this.screen === "characters") {
      this.settingsOpen = false;
      this.handleCharacterSelectInput();
      return;
    }

    if (this.screen === "stage") {
      this.settingsOpen = false;
      this.handleStageSelectInput();
      return;
    }

    if (this.screen === "playing") {
      if (this.just(this.menuKeys.escape) || this.just(this.menuKeys.enter)) {
        this.pauseGame();
      }
      return;
    }

    if (this.screen === "paused") {
      this.handlePauseInput();
      return;
    }

    if (this.screen === "match-over") {
      if (this.just(this.keys.p1.punch) || this.just(this.menuKeys.enter) || this.just(this.menuKeys.space)) {
        this.startMatch(this.lastSelection, true);
      } else if (this.just(this.keys.p1.kick) || this.just(this.menuKeys.escape)) {
        this.enterMainMenu();
      }
    }
  }

  private setMobileMode(enabled: boolean) {
    this.mobileMode = enabled;
    document.body.dataset.mobileMode = enabled ? "true" : "false";
    this.ui?.setMobileMode(enabled);
    if (!enabled) {
      this.ui?.setMobileControls(false);
    }
  }

  private handleTouchAction(action: TouchAction, phase: TouchPhase) {
    this.unlockAudio();
    if (!this.mobileMode) {
      return;
    }

    if (phase === "down") {
      if (this.screen !== "playing" || this.roundIntroActive || this.sim?.snapshot.status !== "playing") {
        return;
      }
      this.touchInput[action] = true;
      return;
    }

    if (action === "left" || action === "right" || action === "block") {
      this.touchInput[action] = false;
    }
  }

  private readTouchInput(): PlayerInput {
    const input = { ...this.touchInput };
    this.touchInput.jump = false;
    this.touchInput.punch = false;
    this.touchInput.kick = false;
    this.touchInput.throw = false;
    this.touchInput.special = false;
    this.touchInput.assist = false;
    return input;
  }

  private clearTouchInput() {
    this.touchInput = emptyInput();
  }

  private handleCharacterSelectBack() {
    if (this.screen !== "characters" || this.selectionConfirming) {
      return;
    }
    if (this.selectState.step === "assist") {
      this.selectState.step = "main";
      this.selectState.p1AssistLocked = false;
      this.selectState.p2AssistLocked = false;
      this.ui.updateCharacterSelect(this.selectState);
      return;
    }
    this.enterMainMenu();
  }

  private handleMobileFighterSelect(index: number) {
    if (!this.mobileMode || this.screen !== "characters" || this.selectionConfirming) {
      return;
    }

    const assistStep = this.selectState.step === "assist";
    if (assistStep) {
      if (!this.isSelectableAssistIndex(index, this.selectState.p1Index)) {
        this.playSfx(sfxManifest.block.key, "block", { cooldownMs: 180 });
        return;
      }
      this.selectState.p1AssistIndex = index;
      this.selectState.p1AssistLocked = true;
      this.selectState.p2AssistIndex = this.randomCpuAssistIndex(this.selectState.p2Index);
      this.selectState.p2AssistLocked = true;
      this.ui.updateCharacterSelect(this.selectState);
      this.confirmCharacterSelection();
      return;
    }

    if (!this.isPlayableFighterIndex(index)) {
      this.playSfx(sfxManifest.block.key, "block", { cooldownMs: 180 });
      return;
    }

    this.selectState.p1Index = index;
    this.selectState.p1Locked = true;
    this.selectState.p2Index = this.randomCpuFighterIndex(index);
    this.selectState.p2Locked = true;
    this.selectState.p1AssistIndex = this.firstSelectableAssistIndex(index);
    this.selectState.p2AssistIndex = this.randomCpuAssistIndex(this.selectState.p2Index);
    this.selectState.step = "assist";
    this.selectState.p1AssistLocked = false;
    this.selectState.p2AssistLocked = false;
    this.playSfx(sfxManifest.menuSelect.key, "menuSelect");
    this.ui.updateCharacterSelect(this.selectState);
  }

  private handleCharacterSelectInput() {
    if (this.selectionConfirming) {
      return;
    }

    if (this.just(this.menuKeys.escape)) {
      if (this.selectState.step === "assist") {
        this.selectState.step = "main";
        this.selectState.p1AssistLocked = false;
        this.selectState.p2AssistLocked = false;
        this.ui.updateCharacterSelect(this.selectState);
      } else {
        this.enterMainMenu();
      }
      return;
    }

    const assistStep = this.selectState.step === "assist";
    const p1Locked = assistStep ? this.selectState.p1AssistLocked : this.selectState.p1Locked;
    const p2Locked = assistStep ? this.selectState.p2AssistLocked : this.selectState.p2Locked;
    let changed = false;

    if (!p1Locked) {
      const delta = this.cursorDelta("p1");
      if (delta !== 0) {
        if (assistStep) {
          this.selectState.p1AssistIndex = this.wrapFighterIndex(this.selectState.p1AssistIndex + delta);
        } else {
          this.selectState.p1Index = this.wrapFighterIndex(this.selectState.p1Index + delta);
        }
        changed = true;
      }
    }

    if (!p2Locked) {
      const delta = this.cursorDelta("p2");
      if (delta !== 0) {
        if (assistStep) {
          this.selectState.p2AssistIndex = this.wrapFighterIndex(this.selectState.p2AssistIndex + delta);
        } else {
          this.selectState.p2Index = this.wrapFighterIndex(this.selectState.p2Index + delta);
        }
        changed = true;
      }
    }

    const p1Confirm = this.just(this.keys.p1.punch);
    const p2Confirm = this.just(this.keys.p2.punch);
    if (p1Confirm && !p1Locked) {
      const index = assistStep ? this.selectState.p1AssistIndex : this.selectState.p1Index;
      const mainIndex = this.selectState.p1Index;
      if (assistStep ? this.isSelectableAssistIndex(index, mainIndex) : this.isPlayableFighterIndex(index)) {
        if (assistStep) {
          this.selectState.p1AssistLocked = true;
          if (this.selectState.mode === "pvc") {
            this.selectState.p2AssistIndex = this.randomCpuAssistIndex(this.selectState.p2Index);
            this.selectState.p2AssistLocked = true;
          }
        } else {
          this.selectState.p1Locked = true;
          if (this.selectState.mode === "pvc") {
            this.selectState.p2Index = this.randomCpuFighterIndex(this.selectState.p1Index);
            this.selectState.p2Locked = true;
          }
        }
        this.playSfx(sfxManifest.menuSelect.key, "menuSelect");
        changed = true;
      } else {
        this.playSfx(sfxManifest.block.key, "block", { cooldownMs: 180 });
      }
    }
    if (p2Confirm && this.selectState.mode === "pvp" && !p2Locked) {
      const index = assistStep ? this.selectState.p2AssistIndex : this.selectState.p2Index;
      const mainIndex = this.selectState.p2Index;
      if (assistStep ? this.isSelectableAssistIndex(index, mainIndex) : this.isPlayableFighterIndex(index)) {
        if (assistStep) {
          this.selectState.p2AssistLocked = true;
        } else {
          this.selectState.p2Locked = true;
        }
        this.playSfx(sfxManifest.menuSelect.key, "menuSelect");
        changed = true;
      } else {
        this.playSfx(sfxManifest.block.key, "block", { cooldownMs: 180 });
      }
    }

    if (this.just(this.keys.p1.kick)) {
      if (assistStep) this.selectState.p1AssistLocked = false;
      else this.selectState.p1Locked = false;
      changed = true;
    }
    if (this.just(this.keys.p2.kick)) {
      if (assistStep) this.selectState.p2AssistLocked = false;
      else this.selectState.p2Locked = false;
      changed = true;
    }

    const enterPressed = this.just(this.menuKeys.enter);
    const bothLocked = assistStep
      ? this.selectState.p1AssistLocked && this.selectState.p2AssistLocked
      : this.selectState.p1Locked && this.selectState.p2Locked;
    if (enterPressed || (bothLocked && (p1Confirm || p2Confirm))) {
      if (this.selectState.mode === "pvc") {
        if (!assistStep && this.selectState.p1Locked) {
          this.selectState.p2Locked = true;
        }
        if (assistStep && this.selectState.p1AssistLocked && !this.selectState.p2AssistLocked) {
          this.selectState.p2AssistIndex = this.randomCpuAssistIndex(this.selectState.p2Index);
          this.selectState.p2AssistLocked = true;
        }
      }

      if (assistStep) {
        if (this.selectState.p1AssistLocked && this.selectState.p2AssistLocked) {
          this.confirmCharacterSelection();
          return;
        }
      } else if (this.selectState.p1Locked && this.selectState.p2Locked) {
        this.selectState.step = "assist";
        this.selectState.p1AssistLocked = false;
        this.selectState.p2AssistLocked = false;
        this.playSfx(sfxManifest.menuSelect.key, "menuSelect");
        changed = true;
      }
    }

    if (changed) {
      this.ui.updateCharacterSelect(this.selectState);
    }
  }

  private isSelectableAssistIndex(index: number, mainIndex: number) {
    return this.isPlayableFighterIndex(index) &&
      (assistPresentation.allowSameCharacterAsAssist || index !== mainIndex);
  }

  private handleStageSelectInput() {
    let delta = 0;
    if (this.just(this.keys.p1.left) || this.just(this.keys.p2.left)) delta -= 1;
    if (this.just(this.keys.p1.right) || this.just(this.keys.p2.right)) delta += 1;

    if (delta !== 0) {
      this.stageIndex = Phaser.Math.Wrap(this.stageIndex + delta, 0, stageManifests.length);
      this.lastSelection.stageKey = stageManifests[this.stageIndex].key;
      this.setStage(this.lastSelection.stageKey);
      this.ui.updateStageSelect(this.stageIndex);
    }

    if (
      this.just(this.keys.p1.punch) ||
      this.just(this.keys.p2.punch) ||
      this.just(this.menuKeys.enter) ||
      this.just(this.menuKeys.space)
    ) {
      this.lastSelection.stageKey = stageManifests[this.stageIndex].key;
      this.startMatch(this.lastSelection, true);
    } else if (this.just(this.keys.p1.kick) || this.just(this.keys.p2.kick) || this.just(this.menuKeys.escape)) {
      this.enterCharacterSelect(this.lastSelection.mode);
    }
  }

  private handlePauseInput() {
    if (this.just(this.menuKeys.p1Up) || this.just(this.menuKeys.p2Up)) {
      this.pauseIndex -= 1;
      this.ui.updatePauseMenu(this.pauseIndex);
    }
    if (this.just(this.menuKeys.p1Down) || this.just(this.menuKeys.p2Down)) {
      this.pauseIndex += 1;
      this.ui.updatePauseMenu(this.pauseIndex);
    }

    if (
      this.just(this.keys.p1.punch) ||
      this.just(this.keys.p2.punch) ||
      this.just(this.menuKeys.enter) ||
      this.just(this.menuKeys.space)
    ) {
      this.applyPauseAction(this.ui.getPauseAction(this.pauseIndex));
    } else if (this.just(this.keys.p1.kick) || this.just(this.keys.p2.kick) || this.just(this.menuKeys.escape)) {
      this.resumeGame();
    }
  }

  private clearSpecialTapStates() {
    for (const state of Object.values(this.specialTapStates)) {
      state.timer?.remove(false);
      state.timer = null;
      state.fireSingle = false;
    }
  }

  private resolveSpecialTap(player: "p1" | "p2", input: PlayerInput): PlayerInput {
    const state = this.specialTapStates[player];

    if (state.fireSingle) {
      state.fireSingle = false;
      // This is the queued result of the first tap. Return it directly so it
      // reaches RoundSimulation instead of being mistaken for another tap and
      // starting the double-tap timer again.
      input.special = true;
      return input;
    }

    if (!input.special) {
      return input;
    }

    const fighter = this.sim?.snapshot.fighters[player];
    const specialReady = Boolean(fighter && fighter.specialMeter >= 100);
    const partnerReady = Boolean(fighter && fighter.assistMeter >= 100);

    // When Partner is not ready, there is no ambiguity to resolve: a single
    // tap should fire Special immediately. This keeps the mobile button
    // responsive while preserving the double-tap path when both are ready.
    if (!partnerReady && specialReady && !state.timer) {
      return input;
    }

    if (state.timer) {
      state.timer.remove(false);
      state.timer = null;
      // A double tap is reserved for Partner. If Partner is not ready, consume
      // the second tap without accidentally firing Special a second time.
      input.special = false;
      input.assist = partnerReady;
      return input;
    }

    input.special = false;
    state.timer = this.time.delayedCall(SS_PARTNER_DOUBLE_TAP_MS, () => {
      state.timer = null;
      if (
        specialReady &&
        this.screen === "playing" &&
        this.sim?.snapshot.status === "playing" &&
        !this.roundIntroActive
      ) {
        state.fireSingle = true;
      }
    });
    return input;
  }

  private readAiInput(deltaMs: number) {
    if (!this.sim) {
      return emptyInput();
    }
    return this.ai.decide(deltaMs, this.sim.snapshot.fighters.p2, this.sim.snapshot.fighters.p1);
  }

  private cursorDelta(player: "p1" | "p2") {
    const keys = player === "p1" ? this.keys.p1 : this.keys.p2;
    const up = player === "p1" ? this.menuKeys.p1Up : this.menuKeys.p2Up;
    const down = player === "p1" ? this.menuKeys.p1Down : this.menuKeys.p2Down;
    let delta = 0;
    if (this.just(keys.left) || this.just(up)) delta -= 1;
    if (this.just(keys.right) || this.just(down)) delta += 1;
    return delta;
  }

  private selectionFromSelectState(): RoundSelection {
    return this.normalizeSelection({
      mode: this.selectState.mode,
      p1FighterKey: fighterManifests[this.selectState.p1Index]?.key ?? fighterManifests[0].key,
      p2FighterKey: fighterManifests[this.selectState.p2Index]?.key ?? fighterManifests[0].key,
      p1AssistKey: fighterManifests[this.selectState.p1AssistIndex]?.key ?? fighterManifests[2]?.key ?? fighterManifests[0].key,
      p2AssistKey: fighterManifests[this.selectState.p2AssistIndex]?.key ?? fighterManifests[3]?.key ?? fighterManifests[0].key,
      stageKey: this.lastSelection.stageKey,
    });
  }

  private resetMatch() {
    this.score = { p1: 0, p2: 0 };
    this.roundEndHandled = false;
    this.stopRoundAdvance();
  }

  private stopRoundAdvance() {
    this.roundAdvanceEvent?.remove(false);
    this.roundAdvanceEvent = null;
  }

  private cancelSelectionConfirm() {
    this.selectionConfirmEvent?.remove(false);
    this.selectionConfirmEvent = null;
    for (const timer of this.selectionConfirmTimers) {
      timer.remove(false);
    }
    this.selectionConfirmTimers = [];
    this.selectionConfirming = false;
  }

  private playRoundStartSequence(roundNumber: number) {
    if (this.sim) {
      // Re-assert the fresh round framing immediately before any entrance or
      // referee DOM element is positioned. This also covers a resize event
      // that happened while the selected match assets were loading.
      this.updateBattleCamera(this.sim.snapshot, true, 16);
    }
    if (
      spawnEntrancePresentation.enableSpawnEntrances &&
      (spawnEntrancePresentation.playSpawnEntranceEveryRound || roundNumber === 1)
    ) {
      this.playSpawnEntrance(roundNumber);
      return;
    }

    this.playRefereeRoundIntro(roundNumber);
  }

  private playSpawnEntrance(_roundNumber: number) {
    this.cleanupRefereeRoundIntro();
    this.roundIntroActive = true;
    this.spawnEntranceActive = true;
    const runId = ++this.spawnEntranceRunId;
    this.spawnEntranceRevealed.clear();

    const fighters = Object.values(this.sim?.snapshot.fighters ?? {});
    if (fighters.length === 0) {
      this.finishSpawnEntrance(runId);
      return;
    }

    let firstAssetKey: string | null = null;
    const selectedAssets = new Map<FighterId, (typeof entranceVfxManifests)[number] | null>();
    for (const fighter of fighters) {
      const view = this.fighterViews.get(fighter.id);
      if (!view) {
        continue;
      }

      view.sprite.setAlpha(0);
      view.shadow.setAlpha(0);
      const asset = this.chooseSpawnEntranceVfx(firstAssetKey);
      selectedAssets.set(fighter.id, asset);
      if (asset) {
        firstAssetKey ??= asset.key;
      }
    }

    const revealDelay = Math.max(0, spawnEntrancePresentation.introMs - spawnEntrancePresentation.revealMs);
    for (const [fighterIndex, fighter] of fighters.entries()) {
      const playerStartDelay =
        fighterIndex * (spawnEntrancePresentation.introMs + spawnEntrancePresentation.playerIntroGapMs);
      this.addSpawnEntranceTimer(
        this.time.delayedCall(playerStartDelay, () => {
          if (fighterIndex > 0) {
            this.cleanupSpawnEntranceVisual(fighters[fighterIndex - 1]?.id);
          }
          const asset = selectedAssets.get(fighter.id) ?? null;
          if (asset) {
            this.startSpawnEntranceEffect(fighter, asset, runId);
          } else {
            this.createSpawnEntranceFallback(fighter, runId);
          }
        }),
      );
      this.addSpawnEntranceTimer(
        this.time.delayedCall(playerStartDelay + revealDelay, () => {
          this.spawnEntranceRevealed.add(fighter.id);
          this.playSfx(extraSfxManifest.spawnEntrance.key, "roundStart", {
            cooldownMs: 120,
            volumeMultiplier: 1.1,
          });
          const entrance = this.spawnEntranceElements.get(fighter.id);
          if (entrance) {
            this.addSpawnEntranceTween(
              this.tweens.add({
                targets: entrance.dom,
                alpha: spawnEntrancePresentation.revealEffectAlpha,
                duration: 180,
                ease: "Sine.easeOut",
              }),
            );
          }
          if (this.sim) {
            this.syncViews(this.sim.snapshot);
          }
        }),
      );
    }
    const finishDelay =
      Math.max(0, fighters.length - 1) *
        (spawnEntrancePresentation.introMs + spawnEntrancePresentation.playerIntroGapMs) +
      spawnEntrancePresentation.introMs;
    this.addSpawnEntranceTimer(
      this.time.delayedCall(finishDelay, () => {
        this.finishSpawnEntrance(runId);
      }),
    );
  }

  private chooseSpawnEntranceVfx(previousKey: string | null) {
    const available = entranceVfxManifests.filter(
      (asset) => spawnEntrancePresentation.allowSameEntranceVfxForBothPlayers || asset.key !== previousKey,
    );
    const candidates = available.length > 0 ? available : entranceVfxManifests;
    if (candidates.length === 0) {
      return null;
    }
    if (spawnEntrancePresentation.entranceVfxMode === "random") {
      return Phaser.Utils.Array.GetRandom(candidates);
    }
    return candidates[0];
  }

  private startSpawnEntranceEffect(
    fighter: FighterState,
    asset: (typeof entranceVfxManifests)[number],
    runId: number,
  ) {
    if (!this.isSpawnEntranceCurrent(runId)) {
      return;
    }
    const image = document.createElement("img");
    image.className = "spawn-entrance-vfx";
    image.alt = "";
    image.draggable = false;
    image.style.width = `${asset.width}px`;
    image.style.height = `${asset.height}px`;
    image.style.objectFit = "contain";
    image.style.opacity = "0.94";
    const dom = this.add
      .dom(fighter.x, fighter.y + 8, image)
      .setOrigin(0.5, 1)
      .setDepth(2)
      .setScale(0.78);
    this.spawnEntranceElements.set(fighter.id, { dom, image });
    image.onerror = () => {
      if (!this.isSpawnEntranceCurrent(runId)) {
        return;
      }
      image.style.display = "none";
      dom.setVisible(false);
      this.createSpawnEntranceFallback(fighter, runId);
    };
    image.src = asset.path;
    this.addSpawnEntranceTween(
      this.tweens.add({
        targets: dom,
        scale: 1.04,
        alpha: 1,
        duration: spawnEntrancePresentation.introMs,
        ease: "Sine.easeOut",
      }),
    );
  }

  private cleanupSpawnEntranceVisual(fighterId: FighterId | undefined) {
    if (!fighterId) {
      return;
    }
    const entrance = this.spawnEntranceElements.get(fighterId);
    if (!entrance) {
      return;
    }
    this.tweens.killTweensOf(entrance.dom);
    entrance.dom.destroy();
    this.spawnEntranceElements.delete(fighterId);
  }

  private createSpawnEntranceFallback(fighter: FighterState, runId: number) {
    if (!this.isSpawnEntranceCurrent(runId)) {
      return;
    }
    const flash = this.add
      .circle(fighter.x, fighter.y - 116, 82, spawnEntrancePresentation.fallbackColor, 0.24)
      .setDepth(2);
    const core = this.add
      .circle(fighter.x, fighter.y - 116, 38, 0xffffff, 0.82)
      .setDepth(2);
    const fallback = this.add.container(0, 0, [flash, core]).setDepth(2);
    this.spawnEntranceFallbacks.push(fallback);
    this.addSpawnEntranceTween(
      this.tweens.add({
        targets: fallback,
        scale: 1.35,
        alpha: 0,
        duration: spawnEntrancePresentation.fallbackFlashMs,
        ease: "Quad.easeOut",
      }),
    );
  }

  private finishSpawnEntrance(runId: number) {
    if (!this.isSpawnEntranceCurrent(runId)) {
      return;
    }
    this.cleanupSpawnEntrance();
    if (this.sim) {
      this.syncViews(this.sim.snapshot);
    }
    this.playRefereeRoundIntro(this.currentRoundNumber());
  }

  private addSpawnEntranceTimer(timer: Phaser.Time.TimerEvent) {
    this.spawnEntranceTimers.push(timer);
    return timer;
  }

  private addSpawnEntranceTween(tween: Phaser.Tweens.Tween) {
    this.spawnEntranceTweens.push(tween);
    return tween;
  }

  private isSpawnEntranceCurrent(runId: number) {
    return this.spawnEntranceActive && this.spawnEntranceRunId === runId && this.screen === "playing" && !this.roundEndHandled;
  }

  private cleanupSpawnEntrance() {
    this.spawnEntranceActive = false;
    this.spawnEntranceRunId += 1;
    this.spawnEntranceRevealed.clear();
    for (const timer of this.spawnEntranceTimers) {
      timer.remove(false);
    }
    this.spawnEntranceTimers = [];
    for (const tween of this.spawnEntranceTweens) {
      tween.stop();
      tween.remove();
    }
    this.spawnEntranceTweens = [];
    for (const entrance of this.spawnEntranceElements.values()) {
      entrance.dom.destroy();
    }
    this.spawnEntranceElements.clear();
    for (const fallback of this.spawnEntranceFallbacks) {
      if (fallback.active) {
        fallback.destroy();
      }
    }
    this.spawnEntranceFallbacks = [];
    for (const view of this.fighterViews.values()) {
      view.sprite.setAlpha(1);
      view.shadow.setAlpha(0.34);
    }
  }

  private playRefereeRoundIntro(roundNumber: number) {
    this.cleanupRefereeRoundIntro();
    this.roundIntroActive = true;
    const runId = ++this.refereeIntroRunId;
    const config = refereeRoundIntroPresentation;

    const auraNode = document.createElement("img");
    auraNode.className = "referee-intro-aura";
    auraNode.src = refereeIntroManifest.aura.path;
    auraNode.alt = "";
    auraNode.draggable = false;
    auraNode.style.width = `${config.auraWidth}px`;
    auraNode.style.height = `${Math.round(config.auraWidth * (1080 / 990))}px`;
    auraNode.style.objectFit = "contain";
    auraNode.style.zIndex = "1";

    const refereeNode = document.createElement("div");
    refereeNode.className = "referee-intro-sprite";
    refereeNode.style.width = `${config.refereeWidth}px`;
    refereeNode.style.height = `${config.refereeWidth}px`;
    refereeNode.style.zIndex = "2";

    const frameNode = document.createElement("img");
    frameNode.className = "referee-intro-frame";
    frameNode.src = refereeIntroManifest.frames[0]?.path ?? "";
    frameNode.alt = "";
    frameNode.draggable = false;
    frameNode.style.width = "100%";
    frameNode.style.height = "100%";
    frameNode.style.objectFit = "contain";
    refereeNode.append(frameNode);

    const signNode = document.createElement("div");
    signNode.className = "referee-round-sign";
    signNode.textContent = `ROUND\n${roundNumber}`;
    signNode.style.display = "none";
    refereeNode.append(signNode);

    // DOM elements with scrollFactor(0) use camera display coordinates rather
    // than the fixed 960px design width. At a shorter browser viewport, 480 is
    // no longer the visible center, which is why the referee drifted left.
    const stageX = this.cameras.main.displayWidth / 2;
    const aura = this.add
      .dom(stageX, config.startY + config.auraOffsetY, auraNode)
      .setOrigin(0.5)
      .setAlpha(config.auraAlpha)
      .setScrollFactor(0);
    const referee = this.add
      .dom(stageX, config.startY, refereeNode)
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.refereeIntroElements = { aura, referee, frame: frameNode, roundSign: signNode };
    this.startRefereeAuraSound();

    this.addRefereeIntroTween(
      this.tweens.add({
        targets: aura,
        y: config.stageY + config.auraOffsetY,
        duration: config.descentMs,
        ease: "Sine.easeOut",
      }),
    );
    this.addRefereeIntroTween(
      this.tweens.add({
        targets: referee,
        y: config.stageY,
        duration: config.descentMs,
        ease: "Sine.easeOut",
      }),
    );
    let elapsedMs = config.descentMs;
    for (const [frameIndex, durationMs] of config.frameDurationsMs.entries()) {
      this.addRefereeIntroTimer(elapsedMs, runId, () => {
        this.setRefereeIntroFrame(frameIndex, roundNumber);
        if (frameIndex === 3) {
          this.playRoundAnnouncementSfx();
        }
      });
      elapsedMs += durationMs;
    }

    this.addRefereeIntroTimer(elapsedMs, runId, () => {
      const intro = this.refereeIntroElements;
      if (!intro) {
        return;
      }
      intro.roundSign.style.display = "none";
      this.fadeRefereeAuraSound();
      this.addRefereeIntroTween(
        this.tweens.add({
          targets: intro.aura,
          y: config.startY + config.auraOffsetY,
          alpha: 0,
          duration: config.exitMs,
          ease: "Sine.easeIn",
        }),
      );
      this.addRefereeIntroTween(
        this.tweens.add({
          targets: intro.referee,
          y: config.startY,
          alpha: 0,
          duration: config.exitMs,
          ease: "Sine.easeIn",
          onComplete: () => this.finishRefereeRoundIntro(runId),
        }),
      );
    });
  }

  private setRefereeIntroFrame(frameIndex: number, roundNumber: number) {
    const intro = this.refereeIntroElements;
    const frame = refereeIntroManifest.frames[frameIndex];
    if (!intro || !frame) {
      return;
    }

    intro.frame.src = frame.path;
    const signIsVisible = frameIndex === 3 || frameIndex === 4;
    intro.roundSign.style.display = signIsVisible ? "block" : "none";
    if (signIsVisible) {
      intro.roundSign.textContent = `ROUND\n${roundNumber}`;
    }
  }

  private finishRefereeRoundIntro(runId: number) {
    if (!this.isRefereeIntroCurrent(runId)) {
      return;
    }

    this.cleanupRefereeRoundIntro();
    this.ui.showRoundMessage("FIGHT");
    if (!this.roundStartSoundHandled) {
      this.playSfx(sfxManifest.roundStart.key, "roundStart", {
        oneShot: true,
        cooldownMs: 1200,
        volumeMultiplier: audioConfig.fightVolumeMultiplier,
        allowBoost: true,
      });
    }
    this.roundStartSoundHandled = false;
    const fightTimer = this.time.delayedCall(refereeRoundIntroPresentation.fightMessageMs, () => {
      if (this.screen === "playing" && !this.roundEndHandled && !this.roundIntroActive) {
        this.ui.hideRoundMessage();
      }
    });
    this.refereeIntroTimers.push(fightTimer);
  }

  private addRefereeIntroTimer(delayMs: number, runId: number, callback: () => void) {
    const timer = this.time.delayedCall(delayMs, () => {
      if (this.isRefereeIntroCurrent(runId)) {
        callback();
      }
    });
    this.refereeIntroTimers.push(timer);
  }

  private addRefereeIntroTween(tween: Phaser.Tweens.Tween) {
    this.refereeIntroTweens.push(tween);
  }

  private isRefereeIntroCurrent(runId: number) {
    return this.roundIntroActive && this.refereeIntroRunId === runId && this.screen === "playing" && !this.roundEndHandled;
  }

  private cleanupRefereeRoundIntro() {
    this.stopRefereeAuraSound();
    this.cleanupSpawnEntrance();
    this.roundIntroActive = false;
    this.refereeIntroRunId += 1;
    for (const timer of this.refereeIntroTimers) {
      timer.remove(false);
    }
    this.refereeIntroTimers = [];
    for (const tween of this.refereeIntroTweens) {
      tween.stop();
      tween.remove();
    }
    this.refereeIntroTweens = [];
    this.refereeIntroElements?.aura.destroy();
    this.refereeIntroElements?.referee.destroy();
    this.refereeIntroElements = null;
  }

  private startRefereeAuraSound() {
    this.stopRefereeAuraSound();
    const key = extraSfxManifest.refereeAura.key;
    if (!this.cache.audio.exists(key)) {
      return;
    }
    try {
      const sound = this.sound.add(key, {
        loop: true,
        volume: Math.min(1, audioConfig.sfxVolume * audioConfig.refereeAuraVolumeMultiplier),
      });
      this.refereeAuraSound = sound;
      sound.once("destroy", () => {
        if (this.refereeAuraSound === sound) {
          this.refereeAuraSound = null;
        }
      });
      sound.play();
    } catch {
      this.refereeAuraSound = null;
    }
  }

  private fadeRefereeAuraSound() {
    const sound = this.refereeAuraSound;
    if (!sound) {
      return;
    }
    const volumeSound = sound as Phaser.Sound.BaseSound & {
      volume?: number;
      setVolume?: (volume: number) => Phaser.Sound.BaseSound;
    };
    if (!volumeSound.setVolume) {
      this.stopRefereeAuraSound();
      return;
    }
    const volumeState = { value: volumeSound.volume ?? audioConfig.sfxVolume * audioConfig.refereeAuraVolumeMultiplier };
    this.addRefereeIntroTween(
      this.tweens.add({
        targets: volumeState,
        value: 0,
        duration: audioConfig.refereeAuraFadeMs,
        ease: "Sine.easeIn",
        onUpdate: () => {
          volumeSound.setVolume?.(volumeState.value);
        },
        onComplete: () => {
          this.stopRefereeAuraSound();
        },
      }),
    );
  }

  private stopRefereeAuraSound() {
    const sound = this.refereeAuraSound;
    this.refereeAuraSound = null;
    if (!sound) {
      return;
    }
    sound.stop();
    sound.destroy();
  }

  private confirmCharacterSelection() {
    if (this.selectionConfirming) {
      return;
    }

    this.selectionConfirming = true;
    this.playSfx(sfxManifest.menuSelect.key, "menuSelect", { cooldownMs: 200 });
    const [first, second] = extraSfxManifest.selectionComplete;
    this.playSfx(first.key, "menuSelect", { oneShot: true, cooldownMs: 1200 });
    this.selectionConfirmTimers.push(
      this.time.delayedCall(450, () => {
        this.playSfx(second.key, "menuSelect", { oneShot: true, cooldownMs: 1200 });
      }),
    );
    this.selectionConfirmEvent = this.time.delayedCall(1000, () => {
      this.selectionConfirmEvent = null;
      this.selectionConfirming = false;
      this.enterStageSelect();
    });
    this.selectionConfirmTimers.push(this.selectionConfirmEvent);
  }

  private createMenuKeys(): MenuKeys {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      throw new Error("Keyboard input is not available in this browser.");
    }
    return {
      enter: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER),
      escape: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC),
      space: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      music: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M),
      mobile: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.V),
      p1Up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      p1Down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      p2Up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      p2Down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      p1Back: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.G),
      p2Back: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.L),
    };
  }

  private preloadUiFonts() {
    if (!document.fonts) {
      return;
    }
    void Promise.all([
      document.fonts.load(`900 44px ${arcadeFonts.display}`),
      document.fonts.load(`900 28px ${arcadeFonts.menu}`),
      document.fonts.load(`900 24px ${arcadeFonts.hud}`),
    ]).catch(() => {
      // CSS fallback stacks keep the game readable when local font files are missing.
    });
  }

  private bindLoadingProgress() {
    this.load.on("progress", (progress: number) => {
      this.updateLoadingScreen(progress, "Loading menu...");
    });
  }

  private updateLoadingScreen(progress: number, message?: string) {
    const fill = document.getElementById("loading-progress-fill") as HTMLElement | null;
    const label = document.getElementById("loading-progress-label");
    if (fill) {
      fill.style.width = `${Phaser.Math.Clamp(progress, 0, 1) * 100}%`;
    }
    if (label && message) {
      label.textContent = `${message} ${Math.round(Phaser.Math.Clamp(progress, 0, 1) * 100)}%`;
    }
  }

  private showLoadingScreen(message: string, progress = 0) {
    document.getElementById("loading-screen")?.classList.remove("hidden");
    this.updateLoadingScreen(progress, message);
  }

  private hideLoadingScreen() {
    this.updateLoadingScreen(1, "Ready");
    document.getElementById("loading-screen")?.classList.add("hidden");
  }

  private queueImageFile(key: string, path: string) {
    if (key && path) {
      this.textureAssetPaths.set(key, path);
    }
    if (!key || !path || this.textures.exists(key) || this.queuedTextureKeys.has(key)) {
      return false;
    }
    this.queuedTextureKeys.add(key);
    this.load.image(key, path);
    return true;
  }

  private queuePoseFile(pose: PoseAsset) {
    if (pose.key && pose.path) {
      this.textureAssetPaths.set(pose.key, pose.path);
    }
    if (pose.type === "spritesheet") {
      if (!pose.key || !pose.path || this.textures.exists(pose.key) || this.queuedTextureKeys.has(pose.key)) {
        return false;
      }
      this.queuedTextureKeys.add(pose.key);
      this.load.spritesheet(pose.key, pose.path, {
        frameWidth: pose.frameWidth,
        frameHeight: pose.frameHeight,
      });
      return true;
    }
    return this.queueImageFile(pose.key, pose.path);
  }

  private queueAudioFile(key: string, path: string) {
    if (!key || !path || this.cache.audio.exists(key) || this.queuedAudioKeys.has(key)) {
      return false;
    }
    this.queuedAudioKeys.add(key);
    this.load.audio(key, path);
    return true;
  }

  private queueVoicePath(path: string) {
    if (!path) {
      return false;
    }
    const existingKey = voiceKeyByPath.get(path);
    if (existingKey) {
      return false;
    }
    const key = `voice-${voiceKeyByPath.size}`;
    voiceKeyByPath.set(path, key);
    return this.queueAudioFile(key, path);
  }

  private queueFighterMatchAssets(fighter: FighterAssetManifest) {
    let queued = false;
    for (const pose of Object.values(fighter.poses)) {
      queued = this.queuePoseFile(pose) || queued;
    }
    for (const animation of Object.values(fighter.frameAnimations ?? {})) {
      for (const frame of animation?.frames ?? []) {
        queued = this.queueImageFile(frame.key, frame.path) || queued;
      }
    }
    for (const frame of fighter.throw?.frames ?? []) {
      queued = this.queueImageFile(frame.key, frame.path) || queued;
    }
    if (fighter.throw?.fallback) {
      queued = this.queueImageFile(fighter.throw.fallback.key, fighter.throw.fallback.path) || queued;
    }
    queued = this.queueImageFile(fighter.special.asset.key, fighter.special.asset.path) || queued;
    for (const frame of fighter.special.frameAssets ?? []) {
      queued = this.queueImageFile(frame.key, frame.path) || queued;
    }
    if (fighter.special.projectileAsset) {
      queued = this.queueImageFile(fighter.special.projectileAsset.key, fighter.special.projectileAsset.path) || queued;
    }
    for (const path of [
      ...fighter.voices.attack,
      ...fighter.voices.hurt,
      ...fighter.voices.ko,
      ...fighter.voices.special,
    ]) {
      queued = this.queueVoicePath(path) || queued;
    }
    return queued;
  }

  private async loadSelectedMatchAssets(selection: RoundSelection) {
    const fighters = [
      getFighterManifest(selection.p1FighterKey),
      getFighterManifest(selection.p2FighterKey),
      getFighterManifest(selection.p1AssistKey),
      getFighterManifest(selection.p2AssistKey),
    ].filter((fighter, index, all) => all.findIndex((candidate) => candidate.key === fighter.key) === index);
    const stage = getStageManifest(selection.stageKey);
    let hasQueuedFiles = false;
    const stageVideoPromise = stage.videoPath
      ? this.waitForVideo(stage.videoPath)
      : Promise.resolve(false);

    for (const fighter of fighters) {
      hasQueuedFiles = this.queueFighterMatchAssets(fighter) || hasQueuedFiles;
    }
    if (!stage.usesDomBackground) {
      hasQueuedFiles = this.queueImageFile(stage.key, stage.path) || hasQueuedFiles;
    }
    for (const sfx of [...sfxEntries, ...allExtraSfxAssets()]) {
      hasQueuedFiles = this.queueAudioFile(sfx.key, sfx.path) || hasQueuedFiles;
    }

    const neededVfxKeys = new Set<string>(Object.values(attackVfxManifest).map((config) => config.assetKey));
    for (const fighter of fighters) {
      const specialVfx = specialVfxManifest[fighter.special.effect];
      if (specialVfx) {
        neededVfxKeys.add(specialVfx.assetKey);
      }
    }
    for (const vfx of allVfxAssets()) {
      if (!neededVfxKeys.has(vfx.key) || this.textures.exists(vfx.key) || this.queuedTextureKeys.has(vfx.key)) {
        continue;
      }
      this.queuedTextureKeys.add(vfx.key);
      this.load.spritesheet(vfx.key, vfx.path, {
        frameWidth: vfx.frameWidth,
        frameHeight: vfx.frameHeight,
      });
      hasQueuedFiles = true;
    }

    const domPaths = new Set<string>([
      ...(stage.usesDomBackground ? [stage.path] : []),
      refereeIntroManifest.aura.path,
      ...refereeIntroManifest.frames.map((frame) => frame.path),
      ...entranceVfxManifests.map((entrance) => entrance.path),
      ...fighters.flatMap((fighter) => [fighter.special.beamAsset?.path, fighter.special.chargeAsset?.path]),
    ].filter((path): path is string => Boolean(path)));
    const domImagePromise = Promise.all([...domPaths].map((path) => this.waitForImage(path)));
    const [, stageVideoAvailable] = await Promise.all([
      Promise.all([this.runQueuedLoader(hasQueuedFiles), domImagePromise]),
      stageVideoPromise,
    ]);
    this.preparedStageVideoPath = stage.videoPath ?? null;
    this.preparedStageVideoAvailable = stageVideoAvailable;

    this.ensureFallbackTextures(fighters);
    this.configureFighterTextureFiltering();
    this.createVfxAnimations();
  }

  private runQueuedLoader(hasQueuedFiles: boolean) {
    if (!hasQueuedFiles) {
      this.updateLoadingScreen(1, "Ready");
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const onProgress = (progress: number) => {
        this.updateLoadingScreen(progress, "Loading selected fight assets...");
      };
      const finish = () => {
        this.load.off("progress", onProgress);
        this.updateLoadingScreen(1, "Fight ready");
        resolve();
      };
      this.load.on("progress", onProgress);
      this.load.once("complete", finish);
      this.load.start();
    });
  }

  private waitForImage(path: string) {
    return new Promise<void>((resolve) => {
      const image = new Image();
      const finish = () => resolve();
      image.onload = finish;
      image.onerror = finish;
      image.src = path;
      if (image.complete) {
        resolve();
      }
    });
  }

  private waitForVideo(path: string) {
    return new Promise<boolean>((resolve) => {
      const video = document.createElement("video");
      let settled = false;
      let timeout = 0;
      const finish = (available: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timeout);
        video.removeAttribute("src");
        video.load();
        resolve(available);
      };
      timeout = window.setTimeout(() => {
        finish(video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA);
      }, 10000);
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      video.addEventListener("loadeddata", () => finish(true), { once: true });
      video.addEventListener("canplay", () => finish(true), { once: true });
      video.addEventListener("error", () => finish(false), { once: true });
      video.src = path;
      video.load();
    });
  }

  private loadPoseAsset(pose: PoseAsset) {
    if (pose.type === "spritesheet") {
      this.load.spritesheet(pose.key, pose.path, {
        frameWidth: pose.frameWidth,
        frameHeight: pose.frameHeight,
      });
    } else {
      this.load.image(pose.key, pose.path);
    }
  }

  private ensureFallbackTextures(fighters: FighterAssetManifest[] = []) {
    this.createFallbackTexture("missing-stage", 960, 540, 0x1f2933, "BSU STAGE");

    for (const fighter of fighters.filter(isFighterPlayable)) {
      if (!this.textures.exists(fighter.portrait.key)) {
        const idle = fighter.poses.idle;
        if (this.textures.exists(idle.key)) {
          this.textures.addCanvas(fighter.portrait.key, this.textures.get(idle.key).getSourceImage() as HTMLCanvasElement);
        } else {
          this.createFallbackTexture(fighter.portrait.key, 256, 256, 0x2c3440, fighter.displayName);
        }
      }

      for (const pose of Object.values(fighter.poses)) {
        if (!this.textures.exists(pose.key)) {
          this.createFallbackTexture(pose.key, 256, 256, fighter.key === "esleigue" ? 0x167d77 : 0x9f3f38, fighter.displayName);
        }
        if (pose.type === "spritesheet") {
          for (const [animKey, config] of Object.entries(pose.animations)) {
            const fullKey = `${pose.key}-${animKey}`;
            if (!this.anims.exists(fullKey)) {
              this.anims.create({
                key: fullKey,
                frames: this.anims.generateFrameNumbers(pose.key, { start: config.start, end: config.end }),
                frameRate: config.frameRate,
                repeat: config.repeat,
              });
            }
          }
        }
      }

      if (!this.textures.exists(fighter.special.asset.key)) {
        this.createSpecialFallbackTexture(fighter.special.asset.key, fighter.special.effect, fighter.displayName);
      }
      if (fighter.special.projectileAsset && !this.textures.exists(fighter.special.projectileAsset.key)) {
        this.createProjectileFallbackTexture(fighter.special.projectileAsset.key, fighter.special.effect);
      }
    }
  }

  private handleSettingsInput() {
    const musicDelta =
      (this.just(this.keys.p1.left) || this.just(this.keys.p2.left) ? -1 : 0) +
      (this.just(this.keys.p1.right) || this.just(this.keys.p2.right) ? 1 : 0);
    if (musicDelta !== 0) {
      this.changeMusicSelection(musicDelta);
      return;
    }
    if (
      this.just(this.keys.p1.kick) ||
      this.just(this.keys.p2.kick) ||
      this.just(this.menuKeys.escape) ||
      this.just(this.menuKeys.music)
    ) {
      this.closeSettingsMenu();
    }
  }

  private openSettingsMenu() {
    if (this.screen !== "title") {
      return;
    }
    this.settingsOpen = true;
    this.playSfx(sfxManifest.menuSelect.key, "menuSelect", { cooldownMs: 120 });
    this.ui.showSettingsMenu();
    this.ui.updateMusicChoice(this.selectedMusicKey);
  }

  private closeSettingsMenu() {
    if (!this.settingsOpen) {
      return;
    }
    this.settingsOpen = false;
    this.playSfx(sfxManifest.menuSelect.key, "menuSelect", { cooldownMs: 120 });
    this.ui.hideSettingsMenu();
  }

  private createVfxAnimations() {
    for (const vfx of allVfxAssets()) {
      if (!this.textures.exists(vfx.key)) {
        continue;
      }
      const animationKey = this.vfxAnimationKey(vfx.key);
      if (!this.anims.exists(animationKey)) {
        this.anims.create({
          key: animationKey,
          frames: this.anims.generateFrameNumbers(vfx.key, { start: 0, end: vfx.frames - 1 }),
          frameRate: vfx.frameRate,
          repeat: 0,
        });
      }
    }
  }

  private configureFighterTextureFiltering() {
    const fighterTextureKeys = new Set([
      ...allPoseAssets().map((asset) => asset.key),
      ...allFrameAnimationAssets().map((asset) => asset.key),
      ...allThrowAssets().map((asset) => asset.key),
      ...allSpecialAssets().map((asset) => asset.key),
    ]);

    for (const key of fighterTextureKeys) {
      this.setNearestTextureFilter(key);
    }
  }

  private setNearestTextureFilter(textureKey: string) {
    if (textureKey && this.textures.exists(textureKey)) {
      this.textures.get(textureKey).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
  }

  private vfxAnimationKey(key: string) {
    return `vfx-${key}`;
  }

  private createFallbackTexture(key: string, width: number, height: number, label: string | number, text: string) {
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    const color = typeof label === "number" ? label : 0x2c3440;
    graphics.fillStyle(color, 1);
    graphics.fillRect(0, 0, width, height);
    graphics.lineStyle(8, 0xffffff, 0.75);
    graphics.strokeRect(4, 4, width - 8, height - 8);
    graphics.generateTexture(key, width, height);
    graphics.destroy();
  }

  private createSpecialFallbackTexture(key: string, effect: SpecialEffectKind, label: string) {
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(
      effect === "car-rush"
        ? 0x050505
        : effect === "rasengan" || effect === "kamehameha"
          ? 0x1c82ff
          : effect === "mango-projectile"
            ? 0x4bcf48
            : 0x2c3440,
      1,
    );
    graphics.fillRoundedRect(0, 38, 220, 88, 18);
    graphics.fillStyle(0xffffff, 0.9);
    graphics.fillRoundedRect(38, 16, 88, 46, 12);
    graphics.fillStyle(effect === "rasengan" || effect === "kamehameha" ? 0x8deeff : 0xf4c84a, 1);
    graphics.fillCircle(180, 82, 28);
    graphics.lineStyle(8, 0xffffff, 0.72);
    graphics.strokeRoundedRect(4, 4, 212, 132, 16);
    graphics.generateTexture(key, 220, 140);
    graphics.destroy();
  }

  private createProjectileFallbackTexture(key: string, effect: SpecialEffectKind) {
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    if (effect === "mango-projectile") {
      graphics.fillStyle(0x4bff55, 0.38);
      graphics.fillEllipse(62, 54, 108, 82);
      graphics.fillStyle(0x89d12f, 1);
      graphics.fillEllipse(58, 58, 74, 54);
      graphics.fillStyle(0xffdf52, 1);
      graphics.fillEllipse(50, 56, 42, 34);
      graphics.lineStyle(5, 0xc9ff78, 0.95);
      graphics.strokeEllipse(58, 58, 78, 58);
      graphics.fillStyle(0x2e7b2d, 1);
      graphics.fillEllipse(82, 28, 28, 12);
      graphics.generateTexture(key, 124, 108);
    } else {
      graphics.fillStyle(0x9ba9b8, 1);
      graphics.fillRoundedRect(40, 28, 78, 52, 8);
      graphics.fillStyle(0x334155, 1);
      graphics.fillRect(8, 22, 34, 64);
      graphics.fillRect(116, 22, 34, 64);
      graphics.lineStyle(4, 0xdbeafe, 0.9);
      graphics.strokeRoundedRect(40, 28, 78, 52, 8);
      graphics.lineStyle(5, 0x64748b, 1);
      graphics.lineBetween(80, 80, 80, 118);
      graphics.generateTexture(key, 158, 126);
    }
    graphics.destroy();
  }

  private createBackground() {
    const stage = getStageManifest(this.lastSelection.stageKey);
    this.updateStageWorldConfig(stage);
    const bgKey = this.textures.exists(stage.key) ? stage.key : "missing-stage";
    this.createOrReplaceStageBackground(stage, bgKey);
    this.background.setDepth(-10);
    this.background.setAlpha(stage.usesDomBackground ? 0 : 1);
    this.applyDomStageBackground(stage);
  }

  private setStage(stageKey: string) {
    this.cleanupSpecialEffects();
    this.cleanupStageVideo();
    const stage = getStageManifest(stageKey);
    this.updateStageWorldConfig(stage);
    const textureKey = this.textures.exists(stage.key) ? stage.key : "missing-stage";
    this.createOrReplaceStageBackground(stage, textureKey);
    this.background.setDepth(-10);
    this.background.setAlpha(stage.usesDomBackground ? 0 : 1);
    this.updateFloorMarks();
    this.fitBattleCamera();
    this.applyDomStageBackground(stage);
    if (this.screen === "playing") {
      this.startStageVideo(stage);
    }
  }

  private isVideoStage(stage: StageAssetManifest) {
    return stage.type === "video" || Boolean(stage.videoPath);
  }

  private startStageVideo(stage: StageAssetManifest) {
    if (
      !this.isVideoStage(stage) ||
      !stage.videoPath ||
      this.preparedStageVideoPath !== stage.videoPath ||
      !this.preparedStageVideoAvailable
    ) {
      return;
    }
    const root = document.getElementById("game-root");
    if (!root) {
      return;
    }

    const video = document.createElement("video");
    video.className = "stage-video-background";
    video.setAttribute("aria-hidden", "true");
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.controls = false;
    video.preload = "auto";
    video.style.objectFit = stage.fitMode ?? "cover";
    video.style.visibility = "hidden";
    video.dataset.stageKey = stage.key;
    const canvas = root.querySelector("canvas");
    if (canvas) {
      root.insertBefore(video, canvas);
    } else {
      root.prepend(video);
    }
    this.stageVideo = video;
    this.stageVideoStageKey = stage.key;
    this.stageVideoReady = false;

    const reveal = () => {
      if (this.stageVideo !== video || this.stageVideoStageKey !== stage.key) {
        return;
      }
      this.stageVideoReady = true;
      video.style.visibility = "visible";
      this.updateStageVideoLayout();
      this.applyDomStageBackground(stage);
      void video.play().catch(() => this.installStageVideoUnlock(video));
    };
    video.addEventListener("loadeddata", reveal, { once: true });
    video.addEventListener("canplay", reveal, { once: true });
    video.addEventListener("error", () => {
      if (this.stageVideo !== video) {
        return;
      }
      this.cleanupStageVideo();
      this.applyDomStageBackground(stage);
    }, { once: true });
    video.src = stage.videoPath;
    video.load();
    this.updateStageVideoLayout();
  }

  private installStageVideoUnlock(video: HTMLVideoElement) {
    this.removeStageVideoUnlock();
    const unlock = () => {
      if (this.stageVideo === video) {
        void video.play().catch(() => undefined);
      }
      this.removeStageVideoUnlock();
    };
    this.stageVideoUnlockHandler = unlock;
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
  }

  private removeStageVideoUnlock() {
    if (!this.stageVideoUnlockHandler) {
      return;
    }
    window.removeEventListener("pointerdown", this.stageVideoUnlockHandler);
    window.removeEventListener("keydown", this.stageVideoUnlockHandler);
    this.stageVideoUnlockHandler = null;
  }

  private cleanupStageVideo() {
    this.removeStageVideoUnlock();
    if (this.stageVideo) {
      this.stageVideo.pause();
      this.stageVideo.removeAttribute("src");
      this.stageVideo.load();
      this.stageVideo.remove();
    }
    this.stageVideo = null;
    this.stageVideoStageKey = null;
    this.stageVideoReady = false;
  }

  private updateStageVideoLayout() {
    if (!this.stageVideo) {
      return;
    }
    const camera = this.cameras.main;
    const zoom = (camera.zoom || 1) * this.getCanvasDisplayScale();
    const width = this.currentStageWidth * zoom;
    const height = this.currentStageHeight * zoom;
    this.stageVideo.style.width = `${width}px`;
    this.stageVideo.style.height = `${height}px`;
    this.stageVideo.style.left = `${-camera.scrollX * zoom}px`;
    this.stageVideo.style.top = `${-camera.scrollY * zoom}px`;
  }

  private firstSelectableAssistIndex(mainIndex: number) {
    for (let offset = 1; offset <= fighterManifests.length; offset += 1) {
      const index = Phaser.Math.Wrap(mainIndex + offset, 0, fighterManifests.length);
      if (this.isSelectableAssistIndex(index, mainIndex)) {
        return index;
      }
    }
    return mainIndex;
  }

  private unlockAudio() {
    const soundManager = this.sound as unknown as {
      context?: AudioContext;
      unlock?: () => void;
    };
    soundManager.unlock?.();
    const resumePromise = soundManager.context?.state === "suspended"
      ? soundManager.context.resume()
      : null;
    if (resumePromise) {
      void resumePromise
        .then(() => {
          if (this.screen !== "playing" && this.screen !== "paused") {
            this.playMenuMusic();
          }
        })
        .catch(() => undefined);
    } else if (this.screen !== "playing" && this.screen !== "paused") {
      this.playMenuMusic();
    }
  }

  // Phaser's FIT mode keeps the world at 960x540 while CSS enlarges the
  // canvas. DOM videos/backgrounds do not get that transform automatically,
  // so convert logical world coordinates to the canvas's displayed pixels.
  private getCanvasDisplayScale() {
    const logicalWidth = Math.max(1, this.scale.width || logicalStageWidth);
    const displayedWidth = this.game.canvas?.getBoundingClientRect().width ?? logicalWidth;
    return Math.max(0.001, displayedWidth / logicalWidth);
  }

  private updateStageWorldConfig(stage: StageAssetManifest) {
    this.currentStageWidth = Math.max(logicalStageWidth, stage.stageWidth ?? stageWorldDefaults.stageWidth);
    this.currentStageHeight = Math.max(logicalStageHeight, stage.stageHeight ?? stageWorldDefaults.stageHeight);
    this.currentStageScrolling = stage.scrolling ?? this.currentStageWidth > logicalStageWidth;
    this.currentStageLeft = stageWorldDefaults.edgePadding;
    this.currentStageRight = Math.max(
      this.currentStageLeft + logicalStageWidth,
      this.currentStageWidth - stageWorldDefaults.edgePadding,
    );
    const stageCenterX = this.currentStageWidth / 2;
    this.currentCameraMinX = stage.cameraMinX ?? (this.currentStageScrolling ? logicalStageWidth / 2 : stageCenterX);
    this.currentCameraMaxX = stage.cameraMaxX ?? (this.currentStageScrolling ? this.currentStageWidth - logicalStageWidth / 2 : stageCenterX);
    this.currentGroundY = (stage.groundY ?? stage.floorY ?? 474) + stageWorldDefaults.fighterGroundOffset;
  }

  private createOrReplaceStageBackground(stage: StageAssetManifest, textureKey: string) {
    const useTile = (stage.backgroundScaleMode ?? "tile") === "tile";
    const backgroundIsTile = this.background instanceof Phaser.GameObjects.TileSprite;
    if (this.background && backgroundIsTile !== useTile) {
      this.background.destroy();
      this.background = undefined as never;
    }

    if (!this.background) {
      this.background = useTile
        ? this.add.tileSprite(this.currentStageWidth / 2, this.currentStageHeight / 2, this.currentStageWidth, this.currentStageHeight, textureKey)
        : this.add.image(this.currentStageWidth / 2, this.currentStageHeight / 2, textureKey);
    } else {
      this.background.setTexture(textureKey);
    }

    this.background.setPosition(this.currentStageWidth / 2, this.currentStageHeight / 2);
    const texture = this.textures.get(textureKey);
    const source = texture?.getSourceImage() as { width?: number; height?: number } | undefined;
    const sourceWidth = Math.max(1, source?.width ?? logicalStageWidth);
    const sourceHeight = Math.max(1, source?.height ?? logicalStageHeight);

    if (this.background instanceof Phaser.GameObjects.TileSprite) {
      this.background.setSize(this.currentStageWidth, this.currentStageHeight);
      const tileScale = this.currentStageHeight / sourceHeight;
      this.background.setTileScale(tileScale, tileScale);
      this.background.setTilePosition(0, 0);
      return;
    }

    const backgroundScaleMode = stage.backgroundScaleMode ?? "cover";
    const scale =
      backgroundScaleMode === "stretch"
        ? 1
        : backgroundScaleMode === "cover"
          ? Math.max(this.currentStageWidth / sourceWidth, this.currentStageHeight / sourceHeight)
          : this.currentStageHeight / sourceHeight;
    this.background.setDisplaySize(
      backgroundScaleMode === "stretch" ? this.currentStageWidth : sourceWidth * scale,
      backgroundScaleMode === "stretch" ? this.currentStageHeight : sourceHeight * scale,
    );
  }

  private applyDomStageBackground(stage: StageAssetManifest) {
    const root = document.getElementById("game-root");
    if (!root) {
      return;
    }
    if (!stage.usesDomBackground) {
      root.style.backgroundImage = "";
      root.style.backgroundSize = "";
      root.style.backgroundPosition = "";
      root.style.backgroundRepeat = "";
      return;
    }

    if (this.stageVideoReady && this.stageVideoStageKey === stage.key) {
      root.style.backgroundImage = "none";
      root.style.backgroundSize = "";
      root.style.backgroundPosition = "";
      root.style.backgroundRepeat = "no-repeat";
      this.updateStageVideoLayout();
      return;
    }

    const zoom = (this.cameras.main.zoom || 1) * this.getCanvasDisplayScale();
    // Keep the existing image/GIF visible while the MP4 loads and use it as
    // the automatic fallback if the browser cannot play the video.
    root.style.backgroundImage = `url("${stage.path}")`;
    root.style.backgroundRepeat = stage.backgroundScaleMode === "tile" ? "repeat-x" : "no-repeat";
    root.style.backgroundSize =
      stage.backgroundScaleMode === "stretch"
        ? `${this.currentStageWidth * zoom}px ${this.currentStageHeight * zoom}px`
        : `auto ${this.currentStageHeight * zoom}px`;
    root.style.backgroundPosition = `${-this.cameras.main.scrollX * zoom}px ${-this.cameras.main.scrollY * zoom}px`;
  }

  private createFloorMarks() {
    // The stage artwork already contains its own floor treatment.
  }

  private updateFloorMarks() {
    // Kept as a stage hook for future floor markers.
  }

  private fitBattleCamera() {
    const width = Math.max(1, Math.round(this.scale.width || this.scale.gameSize.width || logicalStageWidth));
    const height = Math.max(1, Math.round(this.scale.height || this.scale.gameSize.height || logicalStageHeight));
    // Fit the complete 16:9 battle height. ENVELOP used the larger scale and
    // cropped the arena, which could hide a fighter when browser zoom changed.
    const zoom = Math.min(width / logicalStageWidth, height / logicalStageHeight);
    const camera = this.cameras.main;
    camera.setViewport(0, 0, width, height);
    camera.setZoom(zoom);
    camera.setBounds(0, 0, this.currentStageWidth, this.currentStageHeight);
    if (this.sim) {
      this.updateBattleCamera(this.sim.snapshot, true, 16);
    } else {
      const visibleWorldWidth = Math.max(1, camera.displayWidth);
      const { minScrollX, maxScrollX } = this.getStageCameraScrollLimits(visibleWorldWidth);
      const initialCenter = Phaser.Math.Clamp(
        (this.currentCameraMinX + this.currentCameraMaxX) / 2,
        minScrollX + visibleWorldWidth / 2,
        maxScrollX + visibleWorldWidth / 2,
      );
      camera.scrollX = Phaser.Math.Clamp(initialCenter - visibleWorldWidth / 2, minScrollX, maxScrollX);
      camera.scrollY = this.getStageCameraScrollY(camera);
      this.applyDomStageBackground(getStageManifest(this.lastSelection.stageKey));
    }
  }

  private scheduleCameraRefit() {
    if (this.cameraRefitFrame !== null) {
      cancelAnimationFrame(this.cameraRefitFrame);
    }
    this.cameraRefitFrame = requestAnimationFrame(() => {
      this.cameraRefitFrame = requestAnimationFrame(() => {
        this.cameraRefitFrame = null;
        this.fitBattleCamera();
      });
    });
  }

  private updateBattleCamera(snapshot: RoundSnapshot, snap = false, deltaMs = 16) {
    const camera = this.cameras.main;
    const visibleWorldWidth = Math.max(1, camera.displayWidth);
    const cameraHalfWidth = visibleWorldWidth / 2;
    const { minScrollX, maxScrollX } = this.getStageCameraScrollLimits(visibleWorldWidth);
    const minCenter = Math.max(minScrollX + cameraHalfWidth, this.currentCameraMinX);
    const maxCenter = Math.min(maxScrollX + cameraHalfWidth, this.currentCameraMaxX);
    const midpoint = (snapshot.fighters.p1.x + snapshot.fighters.p2.x) / 2;
    const targetCenter = Phaser.Math.Clamp(midpoint, minCenter, Math.max(minCenter, maxCenter));
    const currentCenter = camera.scrollX + cameraHalfWidth;
    const smoothing = snap
      ? 1
      : 1 - Math.pow(1 - stageWorldDefaults.cameraFollowLerp, Math.max(0.25, deltaMs / 16));
    const nextCenter = Phaser.Math.Linear(currentCenter, targetCenter, smoothing);
    camera.scrollX = Phaser.Math.Clamp(nextCenter - cameraHalfWidth, minScrollX, maxScrollX);
    camera.scrollY = this.getStageCameraScrollY(camera);
    this.applyDomStageBackground(getStageManifest(this.lastSelection.stageKey));
  }

  private getStageCameraScrollLimits(visibleWorldWidth: number) {
    const centeredScroll = (this.currentStageWidth - visibleWorldWidth) / 2;
    const minScrollX = this.currentStageWidth <= visibleWorldWidth ? centeredScroll : 0;
    const maxScrollX = Math.max(minScrollX, this.currentStageWidth - visibleWorldWidth);
    return { minScrollX, maxScrollX };
  }

  private getStageCameraScrollY(camera: Phaser.Cameras.Scene2D.Camera) {
    const visibleWorldHeight = Math.max(1, camera.displayHeight);
    const maxScrollY = Math.max(0, this.currentStageHeight - visibleWorldHeight);
    // Keep the floor at the familiar battle-line height even when an asset is
    // taller than the 540-unit fighting viewport.
    const preferredGroundScreenY = Math.min(visibleWorldHeight - 34, logicalStageHeight - 48);
    return Phaser.Math.Clamp(this.currentGroundY - preferredGroundScreenY, 0, maxScrollY);
  }

  private destroyFighterViews() {
    for (const view of this.fighterViews.values()) {
      view.domImage?.remove();
    }
    const staleViews: Phaser.GameObjects.GameObject[] = [];
    this.children.each((child) => {
      if (child.getData("fighterView")) {
        staleViews.push(child);
      }
    });
    for (const view of staleViews) {
      view.destroy();
    }
    this.fighterViews.clear();
  }

  private setFighterDisplaySize(
    sprite: Phaser.GameObjects.Sprite,
    def: FighterAssetManifest,
    effectScale: number,
  ) {
    sprite.setDisplaySize(
      def.body.drawWidth * def.scale * fighterBattleVisualScale * effectScale,
      def.body.drawHeight * def.scale * fighterBattleVisualScale * effectScale,
    );
  }

  private setSpecialFrameDisplaySize(sprite: Phaser.GameObjects.Sprite, def: FighterAssetManifest) {
    if (def.special.effect === "car-rush") {
      sprite.setDisplaySize(300, 300);
      return;
    }
    sprite.setDisplaySize(
      Math.max(def.body.drawWidth * 1.28, 270),
      Math.max(def.body.drawHeight * 1.22, 260),
    );
  }

  private createFighterView(
    id: FighterId,
    def: FighterAssetManifest,
    x = 0,
    y = 0,
    facing: -1 | 1 = 1,
  ) {
    const pose = def.poses.idle;
    const shadow = this.add.ellipse(x, y + 8, def.body.drawWidth * 0.62, 28, 0x000000, 0.34);
    const sprite = this.add.sprite(x, y, pose.key);
    const domImage = document.createElement("img");
    domImage.className = "fighter-dom-sprite";
    domImage.alt = "";
    domImage.draggable = false;
    domImage.style.display = "none";
    domImage.style.pointerEvents = "none";
    domImage.style.position = "absolute";
    domImage.style.zIndex = "3";
    this.game.domContainer?.appendChild(domImage);
    sprite.setOrigin(0.5, 1);
    this.setFighterDisplaySize(sprite, def, 1);
    sprite.setFlipX(shouldFlipFighterAsset(def, "idle", facing));
    sprite.setData("fighterView", true);
    shadow.setData("fighterView", true);
    shadow.setDepth(2);
    sprite.setDepth(3);
    this.fighterViews.set(id, {
      sprite,
      shadow,
      domImage: this.game.domContainer ? domImage : null,
      domTextureKey: null,
      lastPose: null,
      frameAnimation: { name: null, frameIndex: 0, nextFrameAtMs: 0 },
      effect: { offsetX: 0, offsetY: 0, angle: 0, scale: 1 },
    });
  }

  private syncViews(snapshot: RoundSnapshot) {
    const specialSequence = snapshot.specialSequence;
    const throwSequence = snapshot.throwSequence;
    for (const fighter of Object.values(snapshot.fighters)) {
      const view = this.fighterViews.get(fighter.id);
      if (!view) {
        continue;
      }
      view.sprite.setPosition(fighter.x + view.effect.offsetX, fighter.y + view.effect.offsetY);
      view.sprite.setAngle(view.effect.angle);
      this.setFighterDisplaySize(view.sprite, fighter.def, view.effect.scale);
      view.shadow.setPosition(fighter.x, fighter.y + 8);
      view.shadow.setScale(fighter.grounded ? 1 : 0.74);
      view.shadow.setAlpha(fighter.grounded ? 0.34 : 0.16);

      const isThrowingCaster = throwSequence.phase !== "idle" && throwSequence.casterId === fighter.id;
      const isThrownVictim =
        throwSequence.phase !== "idle" &&
        throwSequence.success &&
        throwSequence.victimId === fighter.id;

      let frameAnimationApplied = false;
      if (isThrowingCaster) {
        this.stopLoopAnimation(view);
        this.applyThrowFrame(view, fighter, throwSequence);
        view.lastPose = null;
      } else if (isThrownVictim) {
        this.stopLoopAnimation(view);
        this.applyThrownVictimPose(view, fighter, throwSequence);
        view.lastPose = null;
      } else {
        const frameAnimationName = this.getFrameAnimationName(snapshot, fighter);
        frameAnimationApplied = frameAnimationName
          ? this.applyFrameAnimation(view, fighter, frameAnimationName)
          : false;
        if (frameAnimationApplied) {
          // Texture and flip are handled by the active frame animation.
        } else {
          this.stopLoopAnimation(view);
          view.sprite.setFlipX(this.shouldFlipFighterPose(fighter, fighter.pose));
        }
      }

      if (!isThrowingCaster && !isThrownVictim && !frameAnimationApplied && view.lastPose !== fighter.pose) {
        this.applyPose(view, fighter, fighter.pose);
        view.lastPose = fighter.pose;
      }

      if (
        specialSequence.phase === "intro" &&
        specialSequence.casterId === fighter.id &&
        specialIntroPresentation.specialIntroTint !== null
      ) {
        view.sprite.setTint(specialIntroPresentation.specialIntroTint);
      } else if (isThrownVictim) {
        view.sprite.clearTint();
      } else if (fighter.hitStunMs > 0) {
        view.sprite.setTint(0xffb2a8);
      } else if (fighter.health <= 0) {
        view.sprite.setTint(0x9a9a9a);
      } else {
        view.sprite.clearTint();
      }

      if (this.spawnEntranceActive) {
        const revealed = this.spawnEntranceRevealed.has(fighter.id);
        view.sprite.setAlpha(revealed ? 1 : 0);
        view.shadow.setAlpha(revealed && fighter.grounded ? 0.34 : 0);
      }

      this.syncFighterDomVisual(view);
    }
  }

  private syncFighterDomVisual(view: FighterView) {
    if (!view.domImage) {
      return;
    }
    view.domTextureKey = this.syncCrispDomVisual(view.sprite, view.domImage, view.domTextureKey);
  }

  private syncAssistDomVisual() {
    const view = this.assistView;
    if (!view?.domImage) {
      return;
    }
    view.domTextureKey = this.syncCrispDomVisual(view.sprite, view.domImage, view.domTextureKey);
  }

  private syncSpecialActorDomVisual() {
    if (!this.specialActorDomSprite || !this.specialActorDomImage) {
      return;
    }
    this.specialActorDomTextureKey = this.syncCrispDomVisual(
      this.specialActorDomSprite,
      this.specialActorDomImage,
      this.specialActorDomTextureKey,
    );
  }

  private syncCrispDomVisual(
    sprite: Phaser.GameObjects.Sprite,
    domImage: HTMLImageElement,
    domTextureKey: string | null,
  ) {
    const texture = sprite.texture;
    const source = texture.getSourceImage();
    const image = source instanceof HTMLImageElement ? source : null;
    const frame = sprite.frame;
    const isWholeImage =
      image !== null &&
      frame.cutX === 0 &&
      frame.cutY === 0 &&
      frame.cutWidth === image.naturalWidth &&
      frame.cutHeight === image.naturalHeight;

    // A DOM image preserves the source PNG detail at browser scale. Cropped
    // spritesheet frames stay on Phaser because they need a texture crop.
    const sourcePath = this.textureAssetPaths.get(texture.key);
    if (!sourcePath || !isWholeImage) {
      domImage.style.display = "none";
      sprite.setVisible(true);
      return domTextureKey;
    }

    if (domTextureKey !== texture.key || domImage.dataset.sourcePath !== sourcePath) {
      domImage.src = sourcePath;
      domImage.dataset.sourcePath = sourcePath;
      domTextureKey = texture.key;
    }

    if (!domImage.complete || domImage.naturalWidth === 0) {
      domImage.style.display = "none";
      sprite.setVisible(true);
      return domTextureKey;
    }

    const container = this.game.domContainer;
    const scale = container ? container.clientWidth / logicalStageWidth : 1;
    const camera = this.cameras.main;
    const screenX = (sprite.x - camera.scrollX) * camera.zoomX * scale;
    const screenY = (sprite.y - camera.scrollY) * camera.zoomY * scale;
    const width = Math.max(1, sprite.displayWidth * camera.zoomX * scale);
    const height = Math.max(1, sprite.displayHeight * camera.zoomY * scale);

    domImage.style.left = `${screenX}px`;
    domImage.style.top = `${screenY}px`;
    domImage.style.width = `${width}px`;
    domImage.style.height = `${height}px`;
    domImage.style.opacity = `${sprite.alpha}`;
    domImage.style.display = sprite.alpha > 0.001 ? "block" : "none";
    domImage.style.transformOrigin = "50% 100%";
    domImage.style.transform = `translate(-50%, -100%) rotate(${sprite.angle}deg) scaleX(${sprite.flipX ? -1 : 1})`;
    sprite.setVisible(false);
    return domTextureKey;
  }

  private applyPose(view: FighterView, fighter: FighterState, poseName: PoseName) {
    const pose = fighter.def.poses[poseName];
    if (pose.type === "spritesheet") {
      const animationKey = `${pose.key}-${poseName}`;
      if (this.anims.exists(animationKey)) {
        view.sprite.play(animationKey, true);
        view.sprite.setOrigin(0.5, 1);
        this.setFighterDisplaySize(view.sprite, fighter.def, view.effect.scale);
        view.sprite.setFlipX(this.shouldFlipFighterPose(fighter, poseName));
        return;
      }
    }
    this.setFighterTexture(view, fighter, pose.key, this.getPoseSourceFacing(fighter, poseName), false);
  }

  private getPoseSourceFacing(fighter: FighterState, poseName: PoseName) {
    if (poseName === "jump") {
      return fighter.def.jumpBaseFacing ?? fighter.def.poses[poseName].sourceFacing ?? fighter.def.baseFacing;
    }
    return fighter.def.poses[poseName].sourceFacing ?? fighter.def.baseFacing;
  }

  private applyThrowFrame(view: FighterView, fighter: FighterState, sequence: ThrowSequenceState) {
    const frameIndex = sequence.phase === "lift" ? 1 : sequence.phase === "slam" || sequence.phase === "impact" || sequence.phase === "recovery" ? 2 : 0;
    const frame = fighter.def.throw?.frames[frameIndex];
    if (frame && this.textures.exists(frame.key)) {
      this.setFighterTexture(view, fighter, frame.key, frame.sourceFacing ?? fighter.def.baseFacing, false);
      return;
    }

    const fallback = fighter.def.throw?.fallback;
    if (fallback && this.textures.exists(fallback.key)) {
      this.setFighterTexture(view, fighter, fallback.key, fallback.sourceFacing ?? fighter.def.baseFacing, false);
      return;
    }

    // A missing throw asset is still playable: the normal punch reads as a short lunge.
    this.applyPose(view, fighter, this.textures.exists(fighter.def.poses.punch.key) ? "punch" : "idle");
  }

  private applyThrownVictimPose(view: FighterView, fighter: FighterState, sequence: ThrowSequenceState) {
    const useKoPose =
      fighter.health <= 0 ||
      sequence.phase === "slam" ||
      sequence.phase === "impact" ||
      sequence.phase === "recovery";
    const pose = useKoPose && this.textures.exists(fighter.def.poses.ko.key) ? fighter.def.poses.ko : fighter.def.poses.hurt;
    this.setFighterTexture(
      view,
      fighter,
      pose.key,
      this.getPoseSourceFacing(fighter, pose === fighter.def.poses.ko ? "ko" : "hurt"),
      false,
    );
    const caster = sequence.casterId ? this.sim?.snapshot.fighters[sequence.casterId] : null;
    const facing = caster?.facing ?? fighter.facing;
    const recoveryProgress = Math.min(1, sequence.phaseElapsedMs / THROW_RECOVERY_MS);
    const angle =
      sequence.phase === "startup"
        ? -11 * facing
        : sequence.phase === "lift"
          ? -26 * facing
          : sequence.phase === "slam"
            ? 58 * facing
            : sequence.phase === "impact"
              ? 42 * facing
              : sequence.phase === "recovery"
                ? fighter.health <= 0
                  ? 28 * facing
                  : Phaser.Math.Linear(58 * facing, 0, recoveryProgress)
                : 0;
    view.sprite.setAngle(angle);
  }

  private getFrameAnimationName(snapshot: RoundSnapshot, fighter: FighterState): MovementAnimationName | null {
    if (
      snapshot.status !== "playing" ||
      snapshot.specialSequence.phase !== "idle" ||
      fighter.pose !== "idle" ||
      fighter.health <= 0 ||
      !fighter.grounded
    ) {
      return null;
    }

    const animations = fighter.def.frameAnimations;
    if (Math.abs(fighter.vx) > 16) {
      const movementMode = fighter.def.movementAnimation ?? "walk";
      if (movementMode === "dash") {
        const movementDirection: -1 | 1 = fighter.vx < 0 ? -1 : 1;
        const animationName: MovementAnimationName = movementDirection === fighter.facing ? "dash" : "backdash";
        if (animations?.[animationName]) {
          return animationName;
        }
      }
      if (movementMode === "walk" && animations?.walk) {
        return "walk";
      }
      return null;
    }
    if (animations?.idle) {
      return "idle";
    }
    return null;
  }

  private applyFrameAnimation(view: FighterView, fighter: FighterState, animationName: MovementAnimationName) {
    const animation = fighter.def.frameAnimations?.[animationName];
    if (!animation || animation.frames.length === 0 || !animation.frames.every((frame) => this.textures.exists(frame.key))) {
      return false;
    }

    const now = this.time.now;
    if (view.frameAnimation.name !== animationName) {
      view.frameAnimation.name = animationName;
      view.frameAnimation.frameIndex = 0;
      view.frameAnimation.nextFrameAtMs = now + animation.frameMs;
    } else if (now >= view.frameAnimation.nextFrameAtMs) {
      const elapsedFrames = Math.max(1, Math.floor((now - view.frameAnimation.nextFrameAtMs) / animation.frameMs) + 1);
      view.frameAnimation.frameIndex = (view.frameAnimation.frameIndex + elapsedFrames) % animation.frames.length;
      view.frameAnimation.nextFrameAtMs += elapsedFrames * animation.frameMs;
      if (view.frameAnimation.nextFrameAtMs <= now) {
        view.frameAnimation.nextFrameAtMs = now + animation.frameMs;
      }
    }

    const frame = animation.frames[view.frameAnimation.frameIndex % animation.frames.length];
    const sourceFacing = frame.sourceFacing ?? fighter.def.poses.idle.sourceFacing ?? fighter.def.baseFacing;
    this.setFighterTexture(view, fighter, frame.key, sourceFacing, true);
    view.lastPose = null;
    return true;
  }

  private setFighterTexture(
    view: FighterView,
    fighter: FighterState,
    textureKey: string,
    sourceFacing: "left" | "right",
    resetAlpha: boolean,
  ) {
    view.sprite.stop();
    if (view.sprite.texture.key !== textureKey) {
      view.sprite.setTexture(textureKey);
    }
    view.sprite.setOrigin(0.5, 1);
    this.setFighterDisplaySize(view.sprite, fighter.def, view.effect.scale);
    const unflippedFacing = sourceFacing === "right" ? 1 : -1;
    view.sprite.setFlipX(this.getRenderFacing(fighter) !== unflippedFacing);
    if (resetAlpha) {
      view.sprite.setAlpha(1);
      view.sprite.clearTint();
    }
  }

  private stopLoopAnimation(view: FighterView) {
    view.frameAnimation.name = null;
    view.frameAnimation.frameIndex = 0;
    view.frameAnimation.nextFrameAtMs = 0;
  }

  private shouldFlipFighterPose(fighter: FighterState, poseName: PoseName) {
    return shouldFlipFighterAsset(fighter.def, poseName, this.getRenderFacing(fighter));
  }

  private getRenderFacing(fighter: FighterState): -1 | 1 {
    if (fighter.pose === "jump" && !fighter.grounded && Math.abs(fighter.vx) > 12) {
      return fighter.vx < 0 ? -1 : 1;
    }
    return fighter.facing;
  }

  private changeMusicSelection(delta: number) {
    const currentIndex = Math.max(0, musicChoices.findIndex((choice) => choice.key === this.selectedMusicKey));
    const nextChoice = musicChoices[Phaser.Math.Wrap(currentIndex + delta, 0, musicChoices.length)] ?? musicChoices[0];
    if (!nextChoice || nextChoice.key === this.selectedMusicKey) {
      return;
    }
    this.selectedMusicKey = nextChoice.key;
    this.saveMusicKey(nextChoice.key);
    this.ui.updateMusicChoice(nextChoice.key);
    this.playSfx(sfxManifest.menuSelect.key, "menuSelect", { cooldownMs: 80 });
    this.playMenuMusic();
  }

  private loadSavedMusicKey() {
    try {
      const saved = window.localStorage.getItem(musicStorageKey);
      const migrated = saved ? retiredMusicKeyMigration[saved] : undefined;
      if (migrated && musicChoices.some((choice) => choice.key === migrated)) {
        this.saveMusicKey(migrated);
        return migrated;
      }
      if (saved && musicChoices.some((choice) => choice.key === saved)) {
        return saved;
      }
    } catch {
      // localStorage can be unavailable in private or restricted browser contexts.
    }
    return menuMusicTrackManifests.some((track) => track.key === defaultMusicKey)
      ? defaultMusicKey
      : menuMusicTrackManifests[0]?.key ?? noMusicKey;
  }

  private saveMusicKey(key: string) {
    try {
      window.localStorage.setItem(musicStorageKey, key);
    } catch {
      // The game still works if settings persistence is blocked.
    }
  }

  private selectedMusicTrack() {
    if (this.selectedMusicKey === noMusicKey) {
      return null;
    }
    return menuMusicTrackManifests.find((track) => track.key === this.selectedMusicKey) ?? menuMusicTrackManifests[0] ?? null;
  }

  private playMenuMusic() {
    const track = this.selectedMusicTrack();
    this.ui?.updateMusicChoice(this.selectedMusicKey);
    if (!track) {
      this.stopMenuMusic();
      return;
    }
    if (!this.cache.audio.exists(track.key)) {
      this.stopMenuMusic();
      void this.ensureMusicTrackLoaded(track).then((loaded) => {
        if (loaded && this.selectedMusicKey === track.key && this.screen !== "playing" && this.screen !== "paused") {
          this.playMenuMusic();
        }
      });
      return;
    }
    if (this.menuMusic && this.menuMusicKey === track.key) {
      const volumeSound = this.menuMusic as Phaser.Sound.BaseSound & {
        setVolume?: (volume: number) => Phaser.Sound.BaseSound;
      };
      volumeSound.setVolume?.(audioConfig.musicVolume);
      if (!this.menuMusic.isPlaying) {
        this.startMenuMusicPlayback(this.menuMusic, track.key);
      }
      return;
    }

    this.stopMenuMusic();
    this.menuMusic = this.sound.add(track.key, { volume: audioConfig.musicVolume });
    this.menuMusicKey = track.key;
    this.startMenuMusicPlayback(this.menuMusic, track.key);
  }

  private startMenuMusicPlayback(music: Phaser.Sound.BaseSound, trackKey: string) {
    const shouldLoop = menuMusicTrackManifests.length <= 1;
    music.once("complete", () => {
      if (this.menuMusic !== music || this.menuMusicKey !== trackKey || shouldLoop) {
        return;
      }
      this.playNextMenuMusic(trackKey);
    });
    music.play({ loop: shouldLoop, volume: audioConfig.musicVolume });
  }

  private playNextMenuMusic(completedTrackKey: string) {
    if (this.selectedMusicKey === noMusicKey) {
      return;
    }
    if (menuMusicTrackManifests.length <= 1) {
      return;
    }
    const completedIndex = Math.max(0, menuMusicTrackManifests.findIndex((track) => track.key === completedTrackKey));
    const nextTrack = menuMusicTrackManifests[(completedIndex + 1) % menuMusicTrackManifests.length];
    if (!nextTrack || nextTrack.key === completedTrackKey) {
      return;
    }
    this.selectedMusicKey = nextTrack.key;
    this.saveMusicKey(nextTrack.key);
    this.stopMenuMusic();
    void this.ensureMusicTrackLoaded(nextTrack).then((loaded) => {
      if (loaded && this.selectedMusicKey === nextTrack.key && this.screen !== "playing" && this.screen !== "paused") {
        this.playMenuMusic();
      }
    });
  }

  private ensureMusicTrackLoaded(track: { key: string; path: string }) {
    if (this.cache.audio.exists(track.key)) {
      return Promise.resolve(true);
    }
    const pendingLoad = this.musicLoadPromises.get(track.key);
    if (pendingLoad) {
      return pendingLoad;
    }
    const queued = this.queueAudioFile(track.key, track.path);
    if (!queued) {
      return Promise.resolve(this.cache.audio.exists(track.key));
    }

    const load = this.runQueuedLoader(true)
      .then(() => this.cache.audio.exists(track.key))
      .catch(() => false)
      .finally(() => this.musicLoadPromises.delete(track.key));
    this.musicLoadPromises.set(track.key, load);
    return load;
  }

  private stopMenuMusic() {
    if (this.menuMusic?.isPlaying) {
      this.menuMusic.stop();
    }
    this.menuMusic?.destroy();
    this.menuMusic = null;
    this.menuMusicKey = null;
  }

  private startMenuLightning() {
    this.cleanupMenuLightning();
    if (!menuLightningConfig.enabled || menuLightningManifests.length === 0 || !this.isLightningMenuScreen()) {
      return;
    }
    this.spawnMenuLightning();
    this.scheduleNextMenuLightning();
  }

  private scheduleNextMenuLightning() {
    if (!this.isLightningMenuScreen()) {
      return;
    }
    const delay = Phaser.Math.Between(menuLightningConfig.minDelayMs, menuLightningConfig.maxDelayMs);
    const timer = this.time.delayedCall(delay, () => {
      this.spawnMenuLightning();
      this.scheduleNextMenuLightning();
    });
    this.menuLightningTimers.push(timer);
  }

  private spawnMenuLightning() {
    if (!this.isLightningMenuScreen()) {
      return;
    }
    if (this.screen === "characters") {
      this.spawnCharacterPortraitLightning();
      return;
    }
    const root = document.getElementById("ui-root");
    if (!root) {
      return;
    }
    const boltCount = Phaser.Math.Between(1, Math.max(1, menuLightningConfig.maxBolts));

    for (let index = 0; index < boltCount; index += 1) {
      const asset = Phaser.Utils.Array.GetRandom(menuLightningManifests);
      const bolt = document.createElement("span");
      const width = Phaser.Math.Between(menuLightningConfig.minWidthPx, menuLightningConfig.maxWidthPx);
      const alpha = Phaser.Math.FloatBetween(menuLightningConfig.minAlpha, menuLightningConfig.maxAlpha);
      const position = this.menuLightningPosition(index);
      bolt.className = `menu-lightning-bolt ${this.screen}`;
      bolt.style.backgroundImage = `url("${asset.path}")`;
      bolt.style.left = `${position.x}%`;
      bolt.style.top = `${position.y}%`;
      bolt.style.width = `${width}px`;
      bolt.style.setProperty("--bolt-alpha", `${alpha}`);
      bolt.style.transform = `translate(-50%, -50%) rotate(${Phaser.Math.Between(-18, 18)}deg) scaleX(${
        Math.random() > 0.5 ? -1 : 1
      })`;
      root.append(bolt);
      this.menuLightningElements.push(bolt);

      const cleanupTimer = this.time.delayedCall(menuLightningConfig.lifetimeMs, () => {
        bolt.remove();
        this.menuLightningElements = this.menuLightningElements.filter((element) => element !== bolt);
      });
      this.menuLightningTimers.push(cleanupTimer);
    }
  }

  private spawnCharacterPortraitLightning() {
    const previews = Array.from(document.querySelectorAll<HTMLElement>(".big-preview"));
    if (previews.length === 0) {
      return;
    }

    const shuffled = Phaser.Utils.Array.Shuffle([...previews]);
    const boltCount = Phaser.Math.Between(1, Math.min(menuLightningConfig.maxBolts, shuffled.length));
    for (let index = 0; index < boltCount; index += 1) {
      const preview = shuffled[index];
      if (!preview) {
        continue;
      }
      const asset = Phaser.Utils.Array.GetRandom(menuLightningManifests);
      const bolt = document.createElement("span");
      const width = Phaser.Math.Between(260, 460);
      const alpha = Phaser.Math.FloatBetween(0.56, 0.82);
      bolt.className = "menu-lightning-bolt character-portrait";
      bolt.style.backgroundImage = `url("${asset.path}")`;
      bolt.style.left = `${Phaser.Math.Between(36, 64)}%`;
      bolt.style.top = `${Phaser.Math.Between(28, 56)}%`;
      bolt.style.width = `${width}px`;
      bolt.style.setProperty("--bolt-alpha", `${alpha}`);
      bolt.style.transform = `translate(-50%, -50%) rotate(${Phaser.Math.Between(-22, 22)}deg) scaleX(${
        Math.random() > 0.5 ? -1 : 1
      })`;
      preview.append(bolt);
      this.menuLightningElements.push(bolt);

      const cleanupTimer = this.time.delayedCall(menuLightningConfig.lifetimeMs, () => {
        bolt.remove();
        this.menuLightningElements = this.menuLightningElements.filter((element) => element !== bolt);
      });
      this.menuLightningTimers.push(cleanupTimer);
    }
  }

  private menuLightningPosition(index: number) {
    if (this.screen === "characters") {
      return {
        x: index === 0 ? Phaser.Math.Between(43, 48) : Phaser.Math.Between(52, 57),
        y: Phaser.Math.Between(30, 48),
      };
    }
    if (this.screen === "stage") {
      return {
        x: Phaser.Math.Between(18, 82),
        y: Phaser.Math.Between(18, 70),
      };
    }
    return {
      x: Phaser.Math.Between(14, 86),
      y: Phaser.Math.Between(12, 78),
    };
  }

  private cleanupMenuLightning() {
    for (const timer of this.menuLightningTimers) {
      timer.remove(false);
    }
    this.menuLightningTimers = [];
    for (const element of this.menuLightningElements) {
      element.remove();
    }
    this.menuLightningElements = [];
  }

  private isLightningMenuScreen() {
    return this.screen === "title" || this.screen === "characters" || this.screen === "stage";
  }

  private trackSpecialObject<T extends Phaser.GameObjects.GameObject>(object: T): T {
    object.setData("specialEffect", true);
    this.specialEffectObjects.push(object);
    return object;
  }

  private trackSpecialTween(tween: Phaser.Tweens.Tween) {
    this.specialEffectTweens.push(tween);
    return tween;
  }

  private trackSpecialTimer(timer: Phaser.Time.TimerEvent) {
    this.specialEffectTimers.push(timer);
    return timer;
  }

  private trackVfxObject<T extends Phaser.GameObjects.GameObject>(object: T): T {
    object.setData("vfxEffect", true);
    this.vfxObjects.push(object);
    return object;
  }

  private trackVfxTween(tween: Phaser.Tweens.Tween) {
    this.vfxTweens.push(tween);
    return tween;
  }

  private trackVfxTimer(timer: Phaser.Time.TimerEvent) {
    this.vfxTimers.push(timer);
    return timer;
  }

  private cleanupVfx() {
    for (const timer of this.vfxTimers) {
      timer.remove(false);
    }
    this.vfxTimers = [];

    for (const tween of this.vfxTweens) {
      tween.stop();
      tween.remove();
    }
    this.vfxTweens = [];

    const taggedObjects: Phaser.GameObjects.GameObject[] = [];
    this.children.each((child) => {
      if (child.getData("vfxEffect")) {
        taggedObjects.push(child);
      }
    });
    for (const object of [...this.vfxObjects, ...taggedObjects]) {
      if (object.active) {
        object.destroy();
      }
    }
    this.vfxObjects = [];
  }

  private cleanupSpecialEffects() {
    this.cleanupVfx();

    this.specialActorDomImage?.remove();
    this.specialActorDomImage = null;
    this.specialActorDomSprite = null;
    this.specialActorDomTextureKey = null;

    for (const timer of this.specialEffectTimers) {
      timer.remove(false);
    }
    this.specialEffectTimers = [];

    for (const tween of this.specialEffectTweens) {
      tween.stop();
      tween.remove();
    }
    this.specialEffectTweens = [];

    const taggedObjects: Phaser.GameObjects.GameObject[] = [];
    this.children.each((child) => {
      if (child.getData("specialEffect")) {
        taggedObjects.push(child);
      }
    });
    for (const object of [...this.specialEffectObjects, ...taggedObjects]) {
      if (object.active) {
        object.destroy();
      }
    }
    this.specialEffectObjects = [];

    this.cameras.main.resetFX();
    this.fitBattleCamera();
    for (const fighter of Object.values(this.sim?.snapshot.fighters ?? {})) {
      const view = this.fighterViews.get(fighter.id);
      if (!view) {
        continue;
      }
      this.stopLoopAnimation(view);
      view.effect.offsetX = 0;
      view.effect.offsetY = 0;
      view.effect.angle = 0;
      view.effect.scale = 1;
      view.sprite.setAngle(0);
      view.sprite.setScale(1);
      view.sprite.setAlpha(1);
      view.sprite.clearTint();
      view.sprite.setDepth(3);
      view.shadow.setDepth(2);
      this.applyPose(view, fighter, fighter.pose);
      view.lastPose = fighter.pose;
    }
    for (const audio of this.specialHtmlAudios) {
      audio.pause();
      audio.src = "";
      audio.remove();
    }
    this.specialHtmlAudios = [];
  }

  private playAssistStart(caller: FighterState, victim: FighterState, assist: FighterAssetManifest) {
    this.cleanupAssist();
    this.assistImpactSfxPlayed = false;
    const runId = ++this.assistRunId;
    const facing = caller.facing;
    const x = Phaser.Math.Clamp(
      caller.x - facing * assistPresentation.actorOffsetX,
      this.currentStageLeft + 20,
      this.currentStageRight - 20,
    );
    const y = caller.y;
    const idle = assist.poses.idle;
    const textureKey = this.textures.exists(idle.key) ? idle.key : assist.special.asset.key;
    const shadow = this.add.ellipse(x, y + 8, assist.body.drawWidth * 0.58, 24, 0x000000, 0.32).setDepth(5);
    const sprite = this.add.sprite(x, y, textureKey).setOrigin(0.5, 1).setDepth(8).setAlpha(0);
    const domImage = document.createElement("img");
    domImage.className = "fighter-dom-sprite assist-dom-sprite";
    domImage.alt = "";
    domImage.draggable = false;
    domImage.style.display = "none";
    domImage.style.pointerEvents = "none";
    domImage.style.position = "absolute";
    domImage.style.zIndex = "4";
    this.game.domContainer?.appendChild(domImage);
    this.setFighterDisplaySize(sprite, assist, 1);
    this.setNearestTextureFilter(textureKey);
    sprite.setFlipX(shouldFlipFighterAsset(assist, "idle", facing));
    this.assistView = {
      sprite,
      shadow,
      domImage: this.game.domContainer ? domImage : null,
      domTextureKey: null,
      def: assist,
      callerId: caller.id,
      facing,
      x,
      y,
    };

    const assistState: FighterState = {
      ...caller,
      def: assist,
      x,
      y,
      facing,
      pose: "idle",
    };
    // Start the activation line when the Partner is called, matching the
    // normal special start event.
    this.playSpecialVoice(assistState);

    const asset = this.chooseSpawnEntranceVfx(null);
    if (asset) {
      const image = document.createElement("img");
      image.className = "spawn-entrance-vfx assist-entrance-vfx";
      image.alt = "";
      image.draggable = false;
      image.style.width = `${asset.width * 0.78}px`;
      image.style.height = `${asset.height * 0.78}px`;
      image.style.objectFit = "contain";
      image.style.opacity = "0.94";
      const dom = this.add.dom(x, y + 8, image).setOrigin(0.5, 1).setDepth(7).setScale(0.74);
      this.assistEntranceDom = dom;
      image.src = asset.path;
      image.onerror = () => dom.setVisible(false);
      this.assistTweens.push(this.tweens.add({
        targets: dom,
        scale: 0.98,
        duration: ASSIST_ENTRANCE_MS,
        ease: "Sine.easeOut",
      }));
    }
    this.playSfx(extraSfxManifest.spawnEntrance.key, "roundStart", {
      oneShot: true,
      cooldownMs: 800,
      volumeMultiplier: 1.05,
    });

    this.assistTimers.push(this.time.delayedCall(assistPresentation.revealMs, () => {
      if (!this.isAssistCurrent(runId) || !this.assistView) return;
      this.assistView.sprite.setAlpha(1);
      this.assistView.shadow.setAlpha(0.34);
      this.assistEntranceDom?.setAlpha(0.22);
    }));
    this.assistTimers.push(this.time.delayedCall(ASSIST_ENTRANCE_MS, () => {
      if (!this.isAssistCurrent(runId)) return;
      this.assistEntranceDom?.destroy();
      this.assistEntranceDom = null;
      this.playAssistSpecialPresentation(caller, victim, assist, runId);
    }));
  }

  private playAssistSpecialPresentation(
    caller: FighterState,
    victim: FighterState,
    assist: FighterAssetManifest,
    runId: number,
  ) {
    const view = this.assistView;
    if (!view || !this.isAssistCurrent(runId)) return;
    const assistState: FighterState = {
      ...caller,
      def: assist,
      x: view.x,
      y: view.y,
      facing: view.facing,
      pose: "idle",
    };
    const overlay = this.createSpecialScreenOverlay(0.22, 4);
    const assistLabelPoint = this.getFixedCameraPoint(
      this.cameras.main.width / 2,
      this.cameras.main.height * (112 / 540),
    );
    const label = this.trackSpecialObject(
      this.add.text(assistLabelPoint.x, assistLabelPoint.y, assist.special.name, {
        color: "#fff2a4",
        fontFamily: arcadeFonts.display,
        fontSize: `${34 / this.cameras.main.zoomX}px`,
        fontStyle: "900",
        stroke: "#000000",
        strokeThickness: Math.max(2, Math.round(5 / this.cameras.main.zoomX)),
      }).setOrigin(0.5).setDepth(13).setScrollFactor(0),
    );
    this.trackSpecialTimer(this.time.delayedCall(SPECIAL_NAME_DISPLAY_MS, () => label.destroy()));

    const frames = assist.special.frameAssets ?? [];
    const usableFrames = frames.length > 0 && frames.every((frame) => this.textures.exists(frame.key));
    const frameDurations = usableFrames ? this.getSpecialFrameDurations(assistState) : [assist.special.durationMs];
    const visualFrames = usableFrames ? frames : [{ key: assist.special.asset.key, sourceFacing: assist.special.asset.sourceFacing }];
    let elapsedMs = 0;
    const impactIndex = (assist.special.impactFrame ?? 4) - 1;
    const isCarRush = assist.special.effect === "car-rush";
    const isSuperFlight = assist.special.effect === "super-flight";
    const isStationaryCaster =
      assist.special.effect === "mango-projectile" ||
      assist.special.effect === "satellite-strike" ||
      assist.special.effect === "kamehameha";
    const originalX = view.x;
    const originalY = view.y;
    const startX = isCarRush
      ? (view.facing === 1 ? this.currentStageLeft - 170 : this.currentStageRight + 170)
      : originalX + (isStationaryCaster ? 0 : view.facing * 24);
    const endX = isCarRush
      ? (view.facing === 1 ? this.currentStageRight + 170 : this.currentStageLeft - 170)
      : isSuperFlight
        ? Phaser.Math.Clamp(
            victim.x - view.facing * 36,
            this.currentStageLeft,
            this.currentStageRight,
          )
        : isStationaryCaster
          ? startX
          : Phaser.Math.Clamp(victim.x - view.facing * 36, this.currentStageLeft, this.currentStageRight);

    view.sprite.setDepth(12);
    view.sprite.setOrigin(0.5, 1);
    view.sprite.setPosition(startX, isCarRush ? originalY + 8 : originalY);
    if (usableFrames) {
      this.setSpecialFrameDisplaySize(view.sprite, assist);
    }

    let kamehamehaCharge: Phaser.GameObjects.DOMElement | null = null;
    if (assist.special.effect === "kamehameha") {
      kamehamehaCharge = this.playKamehamehaCharge(
        assistState,
        this.getSpecialFrameStartMs(assistState, assist.special.impactFrame ?? 4),
      );
    }

    if (assist.special.effect === "mango-projectile") {
      this.playMangoProjectileEffect(assistState, victim);
    } else if (assist.special.effect === "satellite-strike") {
      this.playSatelliteStrikeEffect(assistState, victim);
    } else if (assist.special.effect === "car-rush" && !usableFrames) {
      this.playCarRushEffect(assistState);
    } else if (!usableFrames) {
      this.playAssistFallbackSpecialEffect(assistState, victim);
    }

    const applyAssistFrame = (index: number) => {
      const frame = visualFrames[index];
      if (!frame || !this.isAssistCurrent(runId) || !this.assistView) return;
      const sprite = this.assistView.sprite;
      // Apply frame 1 immediately, then reuse the same sprite for every later frame.
      // This prevents an assist from appearing stuck on its entrance/idle pose.
      this.setNearestTextureFilter(frame.key);
      sprite.setVisible(true).setAlpha(1).setTexture(frame.key);
      sprite.setOrigin(0.5, 1);
      sprite.setFlipX(shouldFlipSpecialFrameAsset(assist, Math.min(index, frames.length - 1), view.facing));
      if (usableFrames) {
        this.setSpecialFrameDisplaySize(sprite, assist);
      } else {
        this.setFighterDisplaySize(sprite, assist, 1);
      }
      if (assist.special.effect === "kamehameha" && kamehamehaCharge) {
        if (index === 1) {
          this.updateKamehamehaChargePosition(kamehamehaCharge, assistState, index);
          kamehamehaCharge.setAlpha(1);
        } else if (index === 2) {
          this.updateKamehamehaChargePosition(kamehamehaCharge, assistState, index);
        }
      }
      if (index === impactIndex) {
        if (assist.special.effect === "ground-smash" || assist.special.effect === "barbell") {
          this.cameras.main.shake(260, 0.012);
        }
        if (assist.special.effect === "kamehameha") {
          if (kamehamehaCharge?.active) {
            kamehamehaCharge.destroy();
          }
          kamehamehaCharge = null;
          this.playKamehamehaBeam(assistState, victim, frameDurations[index] ?? SPECIAL_FRAME_MS);
        }
      }
    };

    for (const [index] of visualFrames.entries()) {
      const frameStartMs = elapsedMs;
      if (index === 0) {
        applyAssistFrame(index);
      } else {
        this.trackSpecialTimer(this.time.delayedCall(frameStartMs, () => applyAssistFrame(index)));
      }
      elapsedMs += frameDurations[index] ?? SPECIAL_FRAME_MS;
    }

    this.assistTweens.push(this.tweens.add({
      targets: view.sprite,
      x: endX,
      duration: elapsedMs,
      ease: "Sine.easeInOut",
      onComplete: () => {
        if (view.sprite.active && !isCarRush) {
          view.sprite.setPosition(originalX, originalY);
        }
      },
    }));

    this.trackSpecialTimer(this.time.delayedCall(elapsedMs + ASSIST_EXIT_MS, () => {
      if (!this.isAssistCurrent(runId) || !this.assistView) return;
      this.assistTweens.push(this.tweens.add({
        targets: [this.assistView.sprite, this.assistView.shadow],
        alpha: 0,
        duration: assistPresentation.exitMs,
      }));
    }));
  }

  private playAssistFallbackSpecialEffect(attacker: FighterState, victim: FighterState) {
    if (attacker.def.special.effect === "super-flight") {
      const sprite = this.createSpecialSprite(attacker, 220, 150);
      sprite.setPosition(attacker.x, attacker.y - 120);
      this.trackSpecialTween(this.tweens.add({
        targets: sprite,
        x: victim.x - attacker.facing * 34,
        y: victim.y - 126,
        duration: 760,
        ease: "Back.easeIn",
        yoyo: true,
        hold: 80,
        onComplete: () => sprite.destroy(),
      }));
      return;
    }
    if (attacker.def.special.effect === "ground-smash") {
      const sprite = this.createSpecialSprite(attacker, 250, 190);
      sprite.setPosition(attacker.x, attacker.y);
      this.trackSpecialTween(this.tweens.add({
        targets: sprite,
        alpha: 0,
        scaleX: 1.32,
        scaleY: 1.12,
        duration: 1180,
        onComplete: () => sprite.destroy(),
      }));
      return;
    }
    if (attacker.def.special.effect === "barbell") {
      this.playBarbellEffect(attacker, victim);
      return;
    }
    if (attacker.def.special.effect === "fishing-trap") {
      this.playFishingTrapEffect(attacker, victim);
      return;
    }
    if (attacker.def.special.effect === "kamehameha") {
      this.playKamehamehaFallbackEffect(attacker, victim);
      return;
    }
    this.playRasenganEffect(attacker, victim);
  }

  private isAssistCurrent(runId: number) {
    return this.assistRunId === runId && this.screen === "playing" && !this.roundEndHandled && Boolean(this.assistView);
  }

  private cleanupAssist() {
    this.assistRunId += 1;
    this.assistImpactSfxPlayed = false;
    for (const timer of this.assistTimers) timer.remove(false);
    this.assistTimers = [];
    for (const tween of this.assistTweens) {
      tween.stop();
      tween.remove();
    }
    this.assistTweens = [];
    this.assistEntranceDom?.destroy();
    this.assistEntranceDom = null;
    if (this.assistView) {
      this.assistView.domImage?.remove();
      this.assistView.sprite.destroy();
      this.assistView.shadow.destroy();
      this.assistView = null;
    }
    this.cleanupSpecialEffects();
  }

  private playAttackImpactVfx(attacker: FighterState, victim: FighterState, attackName: AttackName | "block") {
    const config = attackVfxManifest[attackName];
    if (!config) {
      return;
    }
    const x = victim.x - attacker.facing * 34;
    const y = victim.y - (attackName === "kick" ? 98 : attackName === "punch2" ? 112 : 126);
    this.playConfiguredVfx(config, x, y, attacker.facing);
  }

  private playSpecialImpactVfx(attacker: FighterState, victim: FighterState) {
    const config = specialVfxManifest[attacker.def.special.effect];
    if (!config) {
      return;
    }
    this.playConfiguredVfx(config, victim.x - attacker.facing * 22, victim.y - 92, attacker.facing);
  }

  private playConfiguredVfx(config: VfxConfig, x: number, y: number, facing: -1 | 1) {
    const asset = getVfxAsset(config.assetKey);
    if (!asset || !this.textures.exists(asset.key)) {
      return;
    }

    const sprite = this.trackVfxObject(
      this.add.sprite(x + (config.offsetX ?? 0) * facing, y + (config.offsetY ?? 0), asset.key),
    );
    sprite.setOrigin(0.5);
    sprite.setDepth(15);
    sprite.setDisplaySize(config.displayWidth * (config.scale ?? 1), config.displayHeight * (config.scale ?? 1));
    sprite.setFlipX(Boolean(config.flipWithFacing && facing === -1));
    sprite.play(this.vfxAnimationKey(asset.key));
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      sprite.destroy();
    });
    this.trackVfxTimer(this.time.delayedCall((asset.frames / asset.frameRate) * 1000 + 120, () => {
      if (sprite.active) {
        sprite.destroy();
      }
    }));
  }

  private playSpecialCastSequence(attacker: FighterState, victim: FighterState) {
    this.cleanupSpecialEffects();
    this.playSpecialVoice(attacker);
    this.playSfx(sfxManifest.roundStart.key, "roundStart");

    const overlay = this.createSpecialScreenOverlay(0.3, 5);
    const specialLabelPoint = this.getFixedCameraPoint(
      this.cameras.main.width / 2,
      this.cameras.main.height * (130 / 540),
    );

    const special = attacker.def.special;
    const label = this.trackSpecialObject(
      this.add
        .text(specialLabelPoint.x, specialLabelPoint.y, special.name, {
          color: "#fff2a4",
          fontFamily: arcadeFonts.display,
          fontSize: `${42 / this.cameras.main.zoomX}px`,
          fontStyle: "900",
          stroke: "#000000",
          strokeThickness: Math.max(2, Math.round(6 / this.cameras.main.zoomX)),
          shadow: {
            offsetX: 0,
            offsetY: 4,
            color: "#05060a",
            blur: 6,
            fill: true,
            stroke: true,
          },
        })
        .setOrigin(0.5)
        .setDepth(13)
        .setScrollFactor(0),
    );

    const casterView = this.fighterViews.get(attacker.id);
    if (casterView) {
      casterView.sprite.setDepth(14);
      if (specialIntroPresentation.specialIntroTint !== null) {
        casterView.sprite.setTint(specialIntroPresentation.specialIntroTint);
      }
      if (specialIntroPresentation.specialIntroScaleEffect) {
        this.trackSpecialTween(
          this.tweens.add({
            targets: casterView.effect,
            offsetY: -8,
            scale: 1.06,
            duration: SPECIAL_INTRO_PAUSE_MS,
            ease: "Sine.easeInOut",
            yoyo: true,
          }),
        );
      }
      if (specialIntroPresentation.specialIntroGlow) {
        const glow = this.trackSpecialObject(
          this.add.ellipse(attacker.x, attacker.y - 92, 180, 78, 0xfff1a6, 0.18),
        );
        glow.setDepth(13);
        this.trackSpecialTween(
          this.tweens.add({
            targets: glow,
            alpha: 0,
            scaleX: 1.22,
            scaleY: 1.28,
            duration: SPECIAL_INTRO_PAUSE_MS,
            ease: "Sine.easeOut",
            onComplete: () => glow.destroy(),
          }),
        );
      }
      if (specialIntroPresentation.specialIntroFlash) {
        this.cameras.main.flash(120, 255, 245, 190, false);
      }
    }

    this.trackSpecialTween(
      this.tweens.add({
        targets: label,
        scaleX: 1.08,
        scaleY: 1.08,
        alpha: 0.92,
        duration: 180,
        yoyo: true,
        repeat: 2,
      }),
    );

    this.trackSpecialTimer(
      this.time.delayedCall(SPECIAL_NAME_DISPLAY_MS, () => {
        label.destroy();
      }),
    );

    this.trackSpecialTimer(
      this.time.delayedCall(SPECIAL_INTRO_PAUSE_MS, () => {
        if (casterView) {
          casterView.sprite.setDepth(3);
          casterView.sprite.clearTint();
        }
        this.playSfx(sfxManifest.whoosh.key, "whoosh");
        this.playSpecialEffect(attacker, victim);
      }),
    );

    this.trackSpecialTimer(
      this.time.delayedCall(SPECIAL_INTRO_PAUSE_MS + this.getSpecialSceneDurationMs(attacker), () => {
        overlay.destroy();
      }),
    );
  }

  private getSpecialSceneDurationMs(attacker: FighterState) {
    return (
      attacker.def.special.durationMs +
      (attacker.def.special.impactHoldMs ?? 180) +
      (attacker.def.special.recoveryMs ?? SPECIAL_RECOVERY_MS)
    );
  }

  private getFixedCameraPoint(screenX: number, screenY: number) {
    const camera = this.cameras.main;
    return {
      x: camera.width / 2 + (screenX - camera.width / 2) / camera.zoomX,
      y: camera.height / 2 + (screenY - camera.height / 2) / camera.zoomY,
    };
  }

  private createSpecialScreenOverlay(alpha: number, depth: number) {
    const camera = this.cameras.main;
    const center = this.getFixedCameraPoint(camera.width / 2, camera.height / 2);
    return this.trackSpecialObject(
      this.add
        .rectangle(center.x, center.y, camera.displayWidth, camera.displayHeight, 0x000000, alpha)
        .setDepth(depth)
        .setScrollFactor(0),
    );
  }

  private playSpecialEffect(attacker: FighterState, victim: FighterState) {
    const special = attacker.def.special;
    if (this.hasSpecialFrameSequence(attacker)) {
      this.playSpecialFrameSequenceEffect(attacker, victim);
    } else if (special.effect === "super-flight") {
      this.playSuperFlightEffect(attacker, victim);
    } else if (special.effect === "ground-smash") {
      this.playGroundSmashEffect(attacker, victim);
    } else if (special.effect === "car-rush") {
      this.playCarRushEffect(attacker);
    } else if (special.effect === "fishing-trap") {
      this.playFishingTrapEffect(attacker, victim);
    } else if (special.effect === "barbell") {
      this.playBarbellEffect(attacker, victim);
    } else if (special.effect === "mango-projectile") {
      this.playMangoProjectileEffect(attacker, victim);
    } else if (special.effect === "satellite-strike") {
      this.playSatelliteStrikeEffect(attacker, victim);
    } else if (special.effect === "kamehameha") {
      this.playKamehamehaFallbackEffect(attacker, victim);
    } else {
      this.playRasenganEffect(attacker, victim);
    }
  }

  private playThrowImpactVfx(attacker: FighterState, victim: FighterState) {
    this.playConfiguredVfx(
      { assetKey: "big-hit", displayWidth: 196, displayHeight: 160, offsetY: 18, flipWithFacing: true },
      victim.x - attacker.facing * 12,
      victim.y - 18,
      attacker.facing,
    );
    const shockwave = this.trackVfxObject(this.add.ellipse(victim.x, victim.y + 3, 68, 16, 0xf4c84a, 0.65));
    shockwave.setDepth(14);
    this.trackVfxTween(
      this.tweens.add({
        targets: shockwave,
        scaleX: 2.2,
        scaleY: 1.7,
        alpha: 0,
        duration: 210,
        ease: "Sine.easeOut",
        onComplete: () => shockwave.destroy(),
      }),
    );
  }

  private playSuperFlightEffect(attacker: FighterState, victim: FighterState) {
    const sprite = this.createSpecialSprite(attacker, 220, 150);
    sprite.setPosition(attacker.x, attacker.y - 120);
    this.trackSpecialTween(this.tweens.add({
      targets: sprite,
      x: victim.x - attacker.facing * 34,
      y: victim.y - 126,
      scaleX: 1.16,
      scaleY: 1.16,
      duration: 760,
      ease: "Back.easeIn",
      yoyo: true,
      hold: 80,
      onComplete: () => sprite.destroy(),
    }));
    this.tweenFighterOffset(attacker.id, attacker.facing * 70, -52, 0, 1.08, 760, true);
  }

  private playGroundSmashEffect(attacker: FighterState, victim: FighterState) {
    const sprite = this.createSpecialSprite(attacker, 250, 190);
    sprite.setPosition(attacker.x, attacker.y);
    this.tweenFighterOffset(attacker.id, 0, -8, -6 * attacker.facing, 1.28, 360, true);
    this.trackSpecialTimer(this.time.delayedCall(760, () => {
      this.cameras.main.shake(260, 0.012);
      this.tweenFighterOffset(victim.id, -attacker.facing * 58, -62, 13 * attacker.facing, 1, 300, true);
    }));
    this.trackSpecialTween(this.tweens.add({
      targets: sprite,
      alpha: 0,
      scaleX: 1.32,
      scaleY: 1.12,
      duration: 1180,
      onComplete: () => sprite.destroy(),
    }));
  }

  private playCarRushEffect(attacker: FighterState) {
    const sprite = this.createSpecialSprite(attacker, 260, 150);
    const startX = attacker.facing === 1 ? this.currentStageLeft - 150 : this.currentStageRight + 150;
    const endX = attacker.facing === 1 ? this.currentStageRight + 150 : this.currentStageLeft - 150;
    sprite.setPosition(startX, attacker.y + 8);
    this.trackSpecialTween(this.tweens.add({
      targets: sprite,
      x: endX,
      duration: 1320,
      ease: "Cubic.easeIn",
      onComplete: () => sprite.destroy(),
    }));
  }

  private hasSpecialFrameSequence(attacker: FighterState) {
    const frames = attacker.def.special.frameAssets ?? [];
    return frames.length > 0 && frames.every((frame) => this.textures.exists(frame.key));
  }

  private playSpecialFrameSequenceEffect(attacker: FighterState, victim: FighterState) {
    const frames = attacker.def.special.frameAssets ?? [];
    const frameDurations = this.getSpecialFrameDurations(attacker);
    const isCarRush = attacker.def.special.effect === "car-rush";
    const isSuperFlight = attacker.def.special.effect === "super-flight";
    const isStationaryCaster =
      attacker.def.special.effect === "mango-projectile" ||
      attacker.def.special.effect === "satellite-strike" ||
      attacker.def.special.effect === "kamehameha";
    const startX = isCarRush
      ? (attacker.facing === 1 ? this.currentStageLeft - 170 : this.currentStageRight + 170)
      : attacker.x + (isStationaryCaster ? 0 : attacker.facing * 24);
    const endX = isCarRush
      ? (attacker.facing === 1 ? this.currentStageRight + 170 : this.currentStageLeft - 170)
      : isSuperFlight
        ? Phaser.Math.Clamp(
            attacker.x + attacker.facing * attacker.def.special.range,
            this.currentStageLeft,
            this.currentStageRight,
          )
        : isStationaryCaster
        ? startX
        : Phaser.Math.Clamp(victim.x - attacker.facing * 36, this.currentStageLeft, this.currentStageRight);
    const y = isCarRush ? attacker.y + 8 : attacker.y;
    const width = isCarRush ? 300 : Math.max(attacker.def.body.drawWidth * 1.28, 270);
    const height = isCarRush ? 300 : Math.max(attacker.def.body.drawHeight * 1.22, 260);
    const sprite = this.trackSpecialObject(this.add.sprite(startX, y, frames[0].key));
    this.setNearestTextureFilter(frames[0].key);
    sprite.setOrigin(0.5, 1);
    sprite.setDisplaySize(width, height);
    sprite.setDepth(9);
    sprite.setFlipX(shouldFlipSpecialFrameAsset(attacker.def, 0, attacker.facing));

    // Special frame PNGs are whole images, so keep them in the same browser
    // image path as normal fighters. Phaser's canvas scaling made these frames
    // noticeably softer during the cinematic.
    const domImage = document.createElement("img");
    domImage.className = "fighter-dom-sprite special-dom-sprite";
    domImage.alt = "";
    domImage.draggable = false;
    domImage.style.display = "none";
    domImage.style.pointerEvents = "none";
    domImage.style.position = "absolute";
    domImage.style.zIndex = "5";
    this.game.domContainer?.appendChild(domImage);
    this.specialActorDomImage = this.game.domContainer ? domImage : null;
    this.specialActorDomSprite = this.game.domContainer ? sprite : null;
    this.specialActorDomTextureKey = null;

    const casterView = this.fighterViews.get(attacker.id);
    if (casterView) {
      casterView.sprite.setAlpha(0);
    }

    let kamehamehaCharge: Phaser.GameObjects.DOMElement | null = null;
    if (attacker.def.special.effect === "kamehameha") {
      kamehamehaCharge = this.playKamehamehaCharge(
        attacker,
        this.getSpecialFrameStartMs(attacker, attacker.def.special.impactFrame ?? 4),
      );
    }

    if (attacker.def.special.effect === "mango-projectile") {
      this.playMangoProjectileEffect(attacker, victim);
    } else if (attacker.def.special.effect === "satellite-strike") {
      this.playSatelliteStrikeEffect(attacker, victim);
    }

    let elapsedMs = 0;
    const impactIndex = (attacker.def.special.impactFrame ?? 4) - 1;
    for (const [index, frame] of frames.entries()) {
      const frameStartMs = elapsedMs;
      this.trackSpecialTimer(
        this.time.delayedCall(frameStartMs, () => {
          if (!sprite.active) {
            return;
          }
          this.setNearestTextureFilter(frame.key);
          sprite.setTexture(frame.key);
          sprite.setFlipX(shouldFlipSpecialFrameAsset(attacker.def, index, attacker.facing));
          if (attacker.def.special.effect === "kamehameha" && kamehamehaCharge) {
            if (index === 1) {
              this.updateKamehamehaChargePosition(kamehamehaCharge, attacker, index);
              kamehamehaCharge.setAlpha(1);
            } else if (index === 2) {
              this.updateKamehamehaChargePosition(kamehamehaCharge, attacker, index);
            }
          }
          if (index === impactIndex) {
            if (attacker.def.special.effect === "ground-smash" || attacker.def.special.effect === "barbell") {
              this.cameras.main.shake(260, 0.012);
            } else {
              this.cameras.main.shake(180, 0.008);
            }
            if (attacker.def.special.effect === "kamehameha") {
              if (kamehamehaCharge?.active) {
                kamehamehaCharge.destroy();
              }
              kamehamehaCharge = null;
              this.playKamehamehaBeam(attacker, victim, frameDurations[index] ?? SPECIAL_FRAME_MS);
            }
          }
        }),
      );
      elapsedMs += frameDurations[index] ?? SPECIAL_FRAME_MS;
    }

    this.trackSpecialTween(
      this.tweens.add({
        targets: sprite,
        x: endX,
        duration: elapsedMs,
        ease: "Sine.easeInOut",
        onComplete: () => {
          sprite.destroy();
          if (this.specialActorDomSprite === sprite) {
            this.specialActorDomImage?.remove();
            this.specialActorDomImage = null;
            this.specialActorDomSprite = null;
            this.specialActorDomTextureKey = null;
          }
          if (casterView) {
            casterView.sprite.setAlpha(1);
            casterView.sprite.clearTint();
          }
        },
      }),
    );
  }

  private getSpecialFrameDurations(attacker: FighterState) {
    const frames = attacker.def.special.frameAssets ?? [];
    const configured = attacker.def.special.frameDurationsMs ?? [];
    return frames.map((_frame, index) => configured[index] ?? SPECIAL_FRAME_MS);
  }

  private getSpecialImpactVisualMs(attacker: FighterState) {
    return this.getSpecialFrameStartMs(attacker, attacker.def.special.impactFrame ?? 4);
  }

  private getSpecialFrameStartMs(attacker: FighterState, frameNumber: number) {
    const frameIndex = Math.max(0, frameNumber - 1);
    return this.getSpecialFrameDurations(attacker)
      .slice(0, frameIndex)
      .reduce((total, duration) => total + duration, 0);
  }

  private playMangoProjectileEffect(attacker: FighterState, victim: FighterState) {
    const spawnMs = this.getSpecialFrameStartMs(
      attacker,
      attacker.def.special.projectileSpawnFrame ?? attacker.def.special.impactFrame ?? 4,
    );
    const travelMs = Math.max(520, attacker.def.special.hitAtMs - spawnMs);
    this.trackSpecialTimer(
      this.time.delayedCall(spawnMs, () => {
        const projectile = this.createProjectileSprite(attacker, 150, 118);
        const targetIsInFront = attacker.facing === 1 ? victim.x >= attacker.x : victim.x <= attacker.x;
        const startX = attacker.x + attacker.facing * 78;
        const startY = attacker.y - 128;
        const targetX = targetIsInFront
          ? victim.x - attacker.facing * 16
          : attacker.facing === 1
            ? this.currentStageRight + 120
            : this.currentStageLeft - 120;
        const targetY = targetIsInFront ? victim.y - 116 : startY;
        projectile.setPosition(startX, startY);
        projectile.setDisplaySize(88, 70);
        projectile.setTint(0xcaff66);
        const glow = this.trackSpecialObject(this.add.ellipse(startX, startY, 126, 86, 0x7cff4d, 0.24));
        glow.setDepth(11);
        const trail = this.trackSpecialObject(this.add.ellipse(startX - attacker.facing * 32, startY, 82, 44, 0x9bff5c, 0.18));
        trail.setDepth(10);
        this.trackSpecialTween(
          this.tweens.add({
            targets: projectile,
            displayWidth: 166,
            displayHeight: 130,
            duration: 320,
            ease: "Back.easeOut",
            onUpdate: () => {
              glow.setPosition(projectile.x, projectile.y);
              trail.setPosition(projectile.x - attacker.facing * 32, projectile.y);
            },
          }),
        );
        this.trackSpecialTween(
          this.tweens.add({
            targets: projectile,
            x: targetX,
            y: targetY,
            angle: 380 * attacker.facing,
            duration: travelMs,
            ease: "Cubic.easeIn",
            onUpdate: () => {
              glow.setPosition(projectile.x, projectile.y);
              trail.setPosition(projectile.x - attacker.facing * 38, projectile.y);
            },
            onComplete: () => {
              this.cameras.main.shake(150, 0.006);
              this.trackSpecialTween(
                this.tweens.add({
                  targets: [projectile, glow, trail],
                  alpha: 0,
                  displayWidth: 188,
                  displayHeight: 146,
                  duration: 260,
                  onComplete: () => {
                    projectile.destroy();
                    glow.destroy();
                    trail.destroy();
                  },
                }),
              );
            },
          }),
        );
      }),
    );
  }

  private playKamehamehaCharge(attacker: FighterState, durationMs: number): Phaser.GameObjects.DOMElement | null {
    const chargeAsset = attacker.def.special.chargeAsset;
    if (!chargeAsset || durationMs <= 0) {
      return null;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "kamehameha-charge";
    wrapper.style.width = `${chargeAsset.displayWidth ?? 165}px`;
    wrapper.style.height = `${chargeAsset.displayHeight ?? 165}px`;

    const image = document.createElement("img");
    image.className = "kamehameha-charge-image";
    image.alt = "";
    image.draggable = false;
    image.src = chargeAsset.path;
    const sourceFacing = chargeAsset.sourceFacing ?? "right";
    const sourceDirection = sourceFacing === "right" ? 1 : -1;
    image.style.transform = attacker.facing === sourceDirection ? "scaleX(1)" : "scaleX(-1)";
    wrapper.append(image);

    const charge = this.trackSpecialObject(this.add.dom(attacker.x, attacker.y, wrapper).setOrigin(0.5));
    charge.setDepth(8);
    charge.setAlpha(0);
    this.updateKamehamehaChargePosition(charge, attacker, 1);
    image.addEventListener("error", () => {
      if (charge.active) {
        charge.destroy();
      }
    }, { once: true });

    this.trackSpecialTimer(
      this.time.delayedCall(durationMs, () => {
        if (charge.active) {
          charge.destroy();
        }
      }),
    );
    return charge;
  }

  private updateKamehamehaChargePosition(
    charge: Phaser.GameObjects.DOMElement,
    attacker: FighterState,
    frameIndex: number,
  ) {
    const chargeAsset = attacker.def.special.chargeAsset;
    if (!chargeAsset || !charge.active) {
      return;
    }
    const offsetX = chargeAsset.offsetXByFrame?.[frameIndex] ?? chargeAsset.offsetX ?? -82;
    const offsetY = chargeAsset.offsetYByFrame?.[frameIndex] ?? chargeAsset.offsetY ?? -132;
    charge.setPosition(attacker.x + attacker.facing * offsetX, attacker.y + offsetY);
    const image = charge.node.querySelector(".kamehameha-charge-image");
    if (image instanceof HTMLImageElement) {
      const sourceFacing = chargeAsset.sourceFacing ?? "right";
      const sourceDirection = sourceFacing === "right" ? 1 : -1;
      image.style.transform = attacker.facing === sourceDirection ? "scaleX(1)" : "scaleX(-1)";
    }
  }

  private playKamehamehaBeam(attacker: FighterState, victim: FighterState, durationMs: number) {
    const beamAsset = attacker.def.special.beamAsset;
    const startX = attacker.x + attacker.facing * 78;
    const targetX = Phaser.Math.Clamp(
      victim.x - attacker.facing * 28,
      attacker.facing === 1 ? startX + 120 : this.currentStageLeft,
      attacker.facing === 1 ? this.currentStageRight : startX - 120,
    );
    const beamLength = Phaser.Math.Clamp(Math.abs(targetX - startX) + 80, 240, 700);
    const beamY = attacker.y - 132;

    if (!beamAsset) {
      this.playKamehamehaFallbackEffect(attacker, victim, durationMs);
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "kamehameha-beam";
    wrapper.style.width = `${beamLength}px`;
    wrapper.style.height = "150px";

    const image = document.createElement("img");
    image.className = "kamehameha-beam-image";
    image.alt = "";
    image.draggable = false;
    image.src = beamAsset.path;
    const sourceFacing = beamAsset.sourceFacing ?? "right";
    const sourceDirection = sourceFacing === "right" ? 1 : -1;
    image.style.transform = attacker.facing === sourceDirection ? "scaleX(1)" : "scaleX(-1)";
    wrapper.append(image);

    const x = startX + attacker.facing * (beamLength / 2);
    const domBeam = this.trackSpecialObject(this.add.dom(x, beamY, wrapper).setOrigin(0.5));
    domBeam.setDepth(12);

    image.addEventListener("error", () => {
      if (!domBeam.active) {
        return;
      }
      domBeam.destroy();
      this.playKamehamehaFallbackEffect(attacker, victim, durationMs);
    }, { once: true });

    this.trackSpecialTimer(
      this.time.delayedCall(durationMs, () => {
        if (domBeam.active) {
          domBeam.destroy();
        }
      }),
    );
  }

  private playKamehamehaFallbackEffect(attacker: FighterState, victim: FighterState, durationMs = 650) {
    const startX = attacker.x + attacker.facing * 78;
    const targetX = Phaser.Math.Clamp(
      victim.x - attacker.facing * 28,
      attacker.facing === 1 ? startX + 120 : this.currentStageLeft,
      attacker.facing === 1 ? this.currentStageRight : startX - 120,
    );
    const y = attacker.y - 132;
    const beam = this.trackSpecialObject(this.add.graphics().setDepth(12));
    beam.lineStyle(58, 0x247dff, 0.3);
    beam.lineBetween(startX, y, targetX, y);
    beam.lineStyle(30, 0x62c9ff, 0.86);
    beam.lineBetween(startX, y, targetX, y);
    beam.lineStyle(10, 0xf2fdff, 0.96);
    beam.lineBetween(startX, y, targetX, y);
    this.trackSpecialTimer(
      this.time.delayedCall(durationMs, () => {
        if (beam.active) {
          beam.destroy();
        }
      }),
    );
  }

  private playSatelliteStrikeEffect(attacker: FighterState, victim: FighterState) {
    const impactMs = this.getSpecialImpactVisualMs(attacker);
    const targetX = Phaser.Math.Clamp(victim.x, this.currentStageLeft, this.currentStageRight);
    const targetY = victim.y - 68;
    const warning = this.trackSpecialObject(
      this.add.ellipse(targetX, this.currentGroundY - 39, 132, 34, 0xff3b30, 0.28),
    );
    warning.setDepth(6);
    warning.setStrokeStyle(4, 0xfff1a6, 0.9);
    this.trackSpecialTween(
      this.tweens.add({
        targets: warning,
        alpha: 0.78,
        scaleX: 1.18,
        scaleY: 1.12,
        duration: 220,
        yoyo: true,
        repeat: Math.max(2, Math.floor(impactMs / 440)),
      }),
    );

    const fallStartMs = Math.max(260, impactMs - 820);
    this.trackSpecialTimer(
      this.time.delayedCall(fallStartMs, () => {
        const satellite = this.createProjectileSprite(attacker, 146, 116);
        satellite.setPosition(targetX - attacker.facing * 72, -86);
        satellite.setAngle(18 * attacker.facing);
        this.trackSpecialTween(
          this.tweens.add({
            targets: satellite,
            x: targetX,
            y: targetY,
            angle: 0,
            duration: Math.max(440, impactMs - fallStartMs),
            ease: "Cubic.easeIn",
            onComplete: () => {
              this.cameras.main.shake(260, 0.013);
              warning.destroy();
              this.trackSpecialTween(
                this.tweens.add({
                  targets: satellite,
                  alpha: 0,
                  y: targetY + 28,
                  duration: 260,
                  onComplete: () => satellite.destroy(),
                }),
              );
            },
          }),
        );
      }),
    );
  }

  private createProjectileSprite(attacker: FighterState, width: number, height: number) {
    const asset = attacker.def.special.projectileAsset;
    const textureKey = asset && this.textures.exists(asset.key) ? asset.key : attacker.def.special.asset.key;
    const sprite = this.trackSpecialObject(this.add.sprite(attacker.x, attacker.y, textureKey));
    const sourceFacing = asset?.sourceFacing ?? attacker.def.special.specialBaseFacing ?? attacker.def.baseFacing;
    const unflippedFacing = sourceFacing === "right" ? 1 : -1;
    sprite.setOrigin(0.5);
    sprite.setDisplaySize(width, height);
    sprite.setDepth(12);
    sprite.setFlipX(attacker.facing !== unflippedFacing);
    return sprite;
  }

  private playFishingTrapEffect(attacker: FighterState, victim: FighterState) {
    const graphics = this.trackSpecialObject(this.add.graphics().setDepth(8));
    const updateLine = () => {
      graphics.clear();
      graphics.lineStyle(5, 0xf4c84a, 0.9);
      graphics.beginPath();
      graphics.moveTo(attacker.x, attacker.y - 118);
      graphics.lineTo(victim.x, victim.y - 105);
      graphics.strokePath();
      graphics.fillStyle(0xffffff, 0.95);
      graphics.fillCircle(victim.x, victim.y - 105, 8);
    };
    const timer = this.trackSpecialTimer(this.time.addEvent({ delay: 1000 / SPECIAL_ANIMATION_FRAME_RATE, repeat: 54, callback: updateLine }));
    this.tweenFighterOffset(victim.id, -attacker.facing * 72, -18, -8 * attacker.facing, 1, 620, true);
    this.trackSpecialTimer(this.time.delayedCall(1120, () => {
      timer.remove(false);
      graphics.destroy();
    }));
  }

  private playBarbellEffect(attacker: FighterState, victim: FighterState) {
    const sprite = this.createSpecialSprite(attacker, 230, 160);
    sprite.setPosition(attacker.x + attacker.facing * 88, attacker.y - 108);
    sprite.setAngle(-35 * attacker.facing);
    this.trackSpecialTween(this.tweens.add({
      targets: sprite,
      angle: 85 * attacker.facing,
      x: victim.x,
      y: victim.y - 98,
      duration: 980,
      ease: "Back.easeIn",
      onComplete: () => {
        this.cameras.main.shake(220, 0.01);
        sprite.destroy();
      },
    }));
  }

  private playRasenganEffect(attacker: FighterState, victim: FighterState) {
    const graphics = this.trackSpecialObject(this.add.graphics().setDepth(9));
    const ball = { x: attacker.x + attacker.facing * 48, y: attacker.y - 116, radius: 18, spin: 0 };
    const redraw = () => {
      graphics.clear();
      graphics.fillStyle(0x2d9cff, 0.82);
      graphics.fillCircle(ball.x, ball.y, ball.radius);
      graphics.lineStyle(4, 0xb7f8ff, 0.9);
      for (let i = 0; i < 3; i += 1) {
        graphics.strokeCircle(ball.x + Math.cos(ball.spin + i * 2) * 7, ball.y + Math.sin(ball.spin + i * 2) * 5, ball.radius - i * 4);
      }
      ball.spin += 0.42;
    };
    const timer = this.trackSpecialTimer(this.time.addEvent({ delay: 1000 / SPECIAL_ANIMATION_FRAME_RATE, repeat: 54, callback: redraw }));
    this.trackSpecialTween(this.tweens.add({
      targets: ball,
      x: victim.x - attacker.facing * 24,
      radius: 34,
      duration: 860,
      ease: "Cubic.easeIn",
      onComplete: () => {
        this.cameras.main.shake(180, 0.008);
      },
    }));
    this.trackSpecialTimer(this.time.delayedCall(1020, () => {
      timer.remove(false);
      graphics.destroy();
    }));
  }

  private createSpecialSprite(attacker: FighterState, width: number, height: number) {
    const special = attacker.def.special;
    const sprite = this.trackSpecialObject(this.add.sprite(attacker.x, attacker.y, special.asset.key));
    this.setNearestTextureFilter(special.asset.key);
    sprite.setOrigin(0.5, 1);
    sprite.setDisplaySize(width, height);
    sprite.setDepth(7);
    sprite.setFlipX(shouldFlipSpecialAsset(attacker.def, attacker.facing));
    return sprite;
  }

  private tweenFighterOffset(
    fighterId: FighterId,
    offsetX: number,
    offsetY: number,
    angle: number,
    scale: number,
    duration: number,
    yoyo: boolean,
  ) {
    const view = this.fighterViews.get(fighterId);
    if (!view) {
      return;
    }
    this.trackSpecialTween(this.tweens.add({
      targets: view.effect,
      offsetX,
      offsetY,
      angle,
      scale,
      duration,
      ease: "Quad.easeOut",
      yoyo,
      onComplete: () => {
        view.effect.offsetX = 0;
        view.effect.offsetY = 0;
        view.effect.angle = 0;
        view.effect.scale = 1;
      },
    }));
  }

  private playSpecialImpact(attacker: FighterState, victim: FighterState) {
    if (attacker.def.special.effect === "ground-smash" || attacker.def.special.effect === "barbell") {
      this.cameras.main.shake(240, 0.012);
    }
    if (attacker.def.special.effect === "fishing-trap") {
      this.tweenFighterOffset(victim.id, -attacker.facing * 42, -12, 0, 1, 180, true);
    }
    if (attacker.def.special.effect === "rasengan") {
      this.cameras.main.flash(130, 70, 180, 255);
    }
    if (attacker.def.special.effect === "mango-projectile") {
      this.cameras.main.flash(110, 155, 255, 90);
    }
    if (attacker.def.special.effect === "satellite-strike") {
      this.cameras.main.shake(300, 0.014);
    }
  }

  private playSpecialImpactSfx(attacker: FighterState) {
    if (
      attacker.def.key === "karlo" &&
      this.playSfx(extraSfxManifest.karloExplosion.key, "kickHit", { oneShot: true, cooldownMs: 1200 })
    ) {
      return;
    }
    if (
      attacker.def.key === "gerald" &&
      this.playSfx(extraSfxManifest.geraldExplosion.key, "kickHit", { oneShot: true, cooldownMs: 1200 })
    ) {
      return;
    }
    if (
      attacker.def.key === "idjao" &&
      this.playSfx(extraSfxManifest.idjaoCarCrash.key, "kickHit", { oneShot: true, cooldownMs: 1200 })
    ) {
      return;
    }
    this.playSfx(sfxManifest.kickHit.key, "kickHit", { cooldownMs: 120 });
  }

  private playRoundOverSfx() {
    if (this.roundOverPlayed) {
      return this.lastRoundOverPauseMs;
    }
    this.roundOverPlayed = true;
    const available = extraSfxManifest.roundOver.filter((sfx) => this.cache.audio.exists(sfx.key));
    const chosen = available.length > 0 ? Phaser.Utils.Array.GetRandom(available) : null;
    const key = chosen?.key ?? sfxManifest.ko.key;
    this.lastRoundOverPauseMs = this.getAudioPauseMs(key);
    if (chosen) {
      this.playSfx(chosen.key, "ko", {
        oneShot: true,
        cooldownMs: maxRoundOverPauseMs,
        volumeMultiplier: audioConfig.roundOverVolumeMultiplier,
      });
    } else {
      this.playSfx(sfxManifest.ko.key, "ko", {
        oneShot: true,
        cooldownMs: maxRoundOverPauseMs,
        volumeMultiplier: audioConfig.roundOverVolumeMultiplier,
      });
    }
    return this.lastRoundOverPauseMs;
  }

  private currentRoundNumber() {
    return Phaser.Math.Clamp(this.score.p1 + this.score.p2 + 1, 1, winsNeeded * 2 - 1);
  }

  private playRoundAnnouncementSfx() {
    const roundNumber = this.currentRoundNumber();
    if (roundNumber === 1 && this.cache.audio.exists(extraSfxManifest.round1Fight.key)) {
      const played = this.playSfx(extraSfxManifest.round1Fight.key, "roundStart", {
        oneShot: true,
        cooldownMs: 1200,
        volumeMultiplier: audioConfig.fightVolumeMultiplier,
        allowBoost: true,
      });
      if (played) {
        this.roundStartSoundHandled = true;
        return;
      }
    }
    const announcement = extraSfxManifest.roundAnnouncements[roundNumber - 1];
    if (
      announcement &&
      this.playSfx(announcement.key, "roundStart", {
        oneShot: true,
        cooldownMs: 1200,
        volumeMultiplier: audioConfig.roundAnnouncementVolumeMultiplier,
        allowBoost: true,
      })
    ) {
      return;
    }
    this.playSfx(sfxManifest.roundStart.key, "roundStart", {
      oneShot: true,
      cooldownMs: 1200,
      volumeMultiplier: audioConfig.roundAnnouncementVolumeMultiplier,
      allowBoost: true,
    });
  }

  private getAudioPauseMs(key: string) {
    const sound = this.sound.add(key, { volume: 0 });
    const durationMs = sound.duration > 0 ? Math.ceil(sound.duration * 1000) : fallbackRoundOverPauseMs;
    sound.destroy();
    return Phaser.Math.Clamp(durationMs, fallbackRoundOverPauseMs, maxRoundOverPauseMs);
  }

  private clearSfxGuards() {
    this.playingSfxKeys.clear();
    this.sfxCooldownUntil.clear();
  }

  private stopTransientSfx() {
    for (const sfx of [...sfxEntries, ...allExtraSfxAssets()]) {
      this.sound.stopByKey(sfx.key);
    }
    this.clearSfxGuards();
  }

  private resetVoicePolicy() {
    this.voicePolicy = {
      p1: { hurtReadyAtMs: 0, koPlayed: false },
      p2: { hurtReadyAtMs: 0, koPlayed: false },
    };
    this.playingVoiceKeys.clear();
  }

  private playAttackVoice(fighter: FighterState, _attackName: string) {
    if (
      this.screen === "paused" ||
      fighter.health <= 0 ||
      this.sim?.snapshot.specialSequence.phase !== "idle" ||
      this.voicePolicy[fighter.id].koPlayed
    ) {
      return;
    }
    this.playRandomVoice(fighter.def.voices.attack);
  }

  private playSpecialVoice(fighter: FighterState) {
    if (this.screen === "paused" || fighter.health <= 0 || this.voicePolicy[fighter.id].koPlayed) {
      return;
    }
    this.fadeOutSpecialActivationAudio();
    this.playFirstAvailableSpecialVoice(fighter.def.voices.special);
  }

  private playHurtVoice(fighter: FighterState) {
    const policy = this.voicePolicy[fighter.id];
    const now = this.time.now;
    if (this.screen === "paused" || fighter.health <= 0 || policy.koPlayed || now < policy.hurtReadyAtMs) {
      return;
    }
    policy.hurtReadyAtMs = now + 800;
    this.playRandomVoice(fighter.def.voices.hurt);
  }

  private playKoVoice(fighter: FighterState) {
    const policy = this.voicePolicy[fighter.id];
    if (policy.koPlayed) {
      return;
    }
    policy.koPlayed = true;
    this.playRandomVoice(fighter.def.voices.ko);
  }

  private playRandomVoice(paths: string[]) {
    if (paths.length === 0) {
      return;
    }
    const path = Phaser.Utils.Array.GetRandom(paths);
    this.playVoicePath(path);
  }

  private playFirstAvailableVoice(paths: string[]) {
    for (const path of paths) {
      if (this.playVoicePath(path)) {
        return;
      }
    }
  }

  private playFirstAvailableSpecialVoice(paths: string[]) {
    for (const path of paths) {
      if (this.playSpecialVoicePath(path)) {
        return;
      }
    }
  }

  private playSpecialVoicePath(path: string) {
    const key = voiceKeyByPath.get(path);
    if (!key || !this.cache.audio.exists(key) || this.playingVoiceKeys.has(key)) {
      return false;
    }
    try {
      const sound = this.sound.add(key, { volume: audioConfig.specialActivationVolume });
      this.specialActivationSounds.push(sound);
      this.playingVoiceKeys.add(key);
      const clear = () => {
        this.playingVoiceKeys.delete(key);
        this.specialActivationSounds = this.specialActivationSounds.filter((candidate) => candidate !== sound);
        sound.destroy();
      };
      sound.once("complete", clear);
      sound.once("destroy", () => {
        this.playingVoiceKeys.delete(key);
        this.specialActivationSounds = this.specialActivationSounds.filter((candidate) => candidate !== sound);
      });
      sound.play();
      return true;
    } catch {
      this.playingVoiceKeys.delete(key);
      return false;
    }
  }

  private fadeOutSpecialActivationAudio(fadeMs = 220) {
    const sounds = [...this.specialActivationSounds];
    this.specialActivationSounds = [];
    for (const sound of sounds) {
      this.playingVoiceKeys.delete(sound.key);
      if (!sound.isPlaying) {
        sound.destroy();
        continue;
      }

      const volumeSound = sound as Phaser.Sound.BaseSound & {
        volume?: number;
        setVolume?: (volume: number) => Phaser.Sound.BaseSound;
      };
      if (!volumeSound.setVolume) {
        sound.stop();
        sound.destroy();
        continue;
      }

      const target = { volume: volumeSound.volume ?? audioConfig.specialActivationVolume };
      this.tweens.add({
        targets: target,
        volume: 0,
        duration: fadeMs,
        ease: "Sine.easeOut",
        onUpdate: () => {
          if (!sound.isPlaying) {
            return;
          }
          volumeSound.setVolume?.(target.volume);
        },
        onComplete: () => {
          sound.stop();
          sound.destroy();
        },
      });
    }
  }

  private playVoicePath(path: string) {
    const key = voiceKeyByPath.get(path);
    if (!key || !this.cache.audio.exists(key) || this.playingVoiceKeys.has(key)) {
      return false;
    }
    try {
      const sound = this.sound.add(key, { volume: audioConfig.voiceVolume });
      this.playingVoiceKeys.add(key);
      sound.once("complete", () => {
        this.playingVoiceKeys.delete(key);
        sound.destroy();
      });
      sound.once("destroy", () => {
        this.playingVoiceKeys.delete(key);
      });
      sound.play();
      return true;
    } catch {
      this.playingVoiceKeys.delete(key);
      return false;
    }
  }

  private playSfx(
    key: string,
    fallbackName: keyof typeof sfxManifest | string,
    options: { oneShot?: boolean; cooldownMs?: number; volumeMultiplier?: number; allowBoost?: boolean } = {},
  ): boolean {
    if (this.screen === "paused") {
      return false;
    }
    const now = this.time.now;
    if (options.cooldownMs && now < (this.sfxCooldownUntil.get(key) ?? 0)) {
      return false;
    }
    if (options.oneShot && this.playingSfxKeys.has(key)) {
      return false;
    }
    if (options.cooldownMs) {
      this.sfxCooldownUntil.set(key, now + options.cooldownMs);
    }
    if (this.cache.audio.exists(key)) {
      try {
        const volume = options.allowBoost
          ? audioConfig.sfxVolume * (options.volumeMultiplier ?? 1)
          : Math.min(1, audioConfig.sfxVolume * (options.volumeMultiplier ?? 1));
        if (options.oneShot) {
          const sound = this.sound.add(key, { volume });
          this.playingSfxKeys.add(key);
          const clear = () => {
            this.playingSfxKeys.delete(key);
            sound.destroy();
          };
          sound.once("complete", clear);
          sound.once("destroy", () => this.playingSfxKeys.delete(key));
          sound.play();
          return true;
        }
        this.sound.play(key, { volume });
        return true;
      } catch {
        // Fall through to synthesized Web Audio when browser playback is blocked or decoding fails.
      }
    }
    this.playSynthFallback(fallbackName);
    return true;
  }

  private playSynthFallback(name: string) {
    const browserWindow = window as WindowWithWebkitAudio;
    const AudioContextClass = browserWindow.AudioContext || browserWindow.webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, now);
    const oscillator = ctx.createOscillator();
    oscillator.connect(gain);
    const duration = name === "ko" ? 0.62 : name === "roundStart" ? 0.46 : name === "whoosh" ? 0.22 : 0.18;
    const startFreq = name === "kickHit" ? 92 : name === "punchHit" ? 118 : name === "block" ? 520 : name === "ko" ? 420 : 720;
    const endFreq = name === "whoosh" ? 1440 : name === "ko" ? 72 : name === "roundStart" ? 220 : startFreq * 0.72;
    oscillator.type = name === "block" || name === "menuSelect" ? "square" : "sawtooth";
    oscillator.frequency.setValueAtTime(startFreq, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), now + duration);
    gain.gain.exponentialRampToValueAtTime(0.42, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.start(now);
    oscillator.stop(now + duration);
    oscillator.addEventListener("ended", () => {
      void ctx.close();
    });
  }

  private findFighterIndex(key: string, fallback: number) {
    const index = fighterManifests.findIndex((fighter) => fighter.key === key && isFighterPlayable(fighter));
    if (index >= 0) {
      return index;
    }
    const fallbackIndex = Math.min(fallback, fighterManifests.length - 1);
    return this.isPlayableFighterIndex(fallbackIndex)
      ? fallbackIndex
      : Math.max(0, fighterManifests.findIndex(isFighterPlayable));
  }

  private findStageIndex(key: string) {
    const index = stageManifests.findIndex((stage) => stage.key === key);
    return index >= 0 ? index : 0;
  }

  private wrapFighterIndex(index: number) {
    return Phaser.Math.Wrap(index, 0, fighterManifests.length);
  }

  private isPlayableFighterIndex(index: number) {
    const fighter = fighterManifests[index];
    return fighter ? isFighterPlayable(fighter) : false;
  }

  private normalizeSelection(selection: RoundSelection): RoundSelection {
    const fallback = fighterManifests.find(isFighterPlayable) ?? fighterManifests[0];
    const p1Main = getFighterManifest(selection.p1FighterKey);
    const p2Main = getFighterManifest(selection.p2FighterKey);
    const resolveAssist = (key: string, mainKey: string) => {
      const selected = getFighterManifest(key);
      if (assistPresentation.allowSameCharacterAsAssist || selected.key !== mainKey) {
        return selected.key;
      }
      return fighterManifests.find((fighter) => isFighterPlayable(fighter) && fighter.key !== mainKey)?.key ?? selected.key;
    };
    return {
      ...selection,
      p1FighterKey: p1Main.key ?? fallback.key,
      p2FighterKey: p2Main.key ?? fallback.key,
      p1AssistKey: resolveAssist(selection.p1AssistKey, p1Main.key),
      p2AssistKey: resolveAssist(selection.p2AssistKey, p2Main.key),
    };
  }

  private randomCpuFighterIndex(excludedIndex: number) {
    const options = fighterManifests
      .map((_fighter, index) => index)
      .filter((index) => index !== excludedIndex && this.isPlayableFighterIndex(index));
    return Phaser.Utils.Array.GetRandom(options) ?? Math.max(0, fighterManifests.findIndex(isFighterPlayable));
  }

  private randomCpuAssistIndex(mainIndex: number) {
    const options = fighterManifests
      .map((_fighter, index) => index)
      .filter((index) => this.isSelectableAssistIndex(index, mainIndex));
    return Phaser.Utils.Array.GetRandom(options) ?? this.randomCpuFighterIndex(mainIndex);
  }

  private just(key: Phaser.Input.Keyboard.Key) {
    return Phaser.Input.Keyboard.JustDown(key);
  }
}
