import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { get } from "node:http";
import { join, resolve } from "node:path";

const root = resolve(".");
const screenshotPath = join(root, "smoke-pvc.png");
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

const userDataDir = join(root, ".tmp", "chrome-smoke");
mkdirSync(userDataDir, { recursive: true });

const browser = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-background-networking",
  "--remote-debugging-port=9223",
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
      const version = await fetchJson("http://127.0.0.1:9223/json/version");
      return version.webSocketDebuggerUrl;
    } catch {
      await sleep(250);
    }
  }
  throw new Error("Chrome DevTools endpoint did not become ready.");
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
  await sleep(1800);

  const initial = await client.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `({
      hasCanvas: Boolean(document.querySelector("canvas")),
      menuVisible: !document.getElementById("mode-menu").classList.contains("hidden"),
      pvp: document.getElementById("start-pvp").textContent.trim(),
      pvc: document.getElementById("start-pvc").textContent.trim()
    })`,
  });

  await client.send("Runtime.evaluate", {
    expression: `document.getElementById("start-pvc").click()`,
  });
  await sleep(700);
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", windowsVirtualKeyCode: 68, code: "KeyD", key: "d" });
  await sleep(200);
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: 68, code: "KeyD", key: "d" });
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", windowsVirtualKeyCode: 70, code: "KeyF", key: "f" });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: 70, code: "KeyF", key: "f" });
  await sleep(900);

  const afterStart = await client.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `({
      menuHidden: document.getElementById("mode-menu").classList.contains("hidden"),
      p2Name: document.getElementById("p2-name").textContent.trim(),
      timer: document.getElementById("timer").textContent.trim(),
      p1Health: document.getElementById("p1-health").style.width,
      p2Health: document.getElementById("p2-health").style.width,
      bannerHidden: document.getElementById("round-banner").classList.contains("hidden")
    })`,
  });

  const screenshot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));

  console.log(JSON.stringify({ initial: initial.result.value, afterStart: afterStart.result.value, screenshotPath }, null, 2));
} finally {
  await client.send("Browser.close").catch(() => {});
  browser.kill();
}
