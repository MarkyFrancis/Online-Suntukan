import Phaser from "phaser";
import {
  allFrameAnimationAssets,
  allExtraSfxAssets,
  allPortraitAssets,
  allPoseAssets,
  allSpecialAssets,
  allVfxAssets,
  allVoicePaths,
  attackVfxManifest,
  extraSfxManifest,
  fighterManifests,
  getFighterManifest,
  getStageManifest,
  getVfxAsset,
  isFighterPlayable,
  menuLightningManifests,
  menuMusicTrackManifests,
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
  type VfxConfig,
} from "../../game/assets/manifest";
import { audioConfig } from "../../game/config/audio";
import { aiDifficulty } from "../../game/config/ai";
import { arcadeFonts } from "../../game/config/fonts";
import { menuLightningConfig, specialIntroPresentation } from "../../game/config/presentation";
import {
  SPECIAL_ANIMATION_FRAME_RATE,
  SPECIAL_FRAME_MS,
  SPECIAL_INTRO_PAUSE_MS,
  SPECIAL_NAME_DISPLAY_MS,
  SPECIAL_RECOVERY_MS,
  type AttackName,
} from "../../game/config/attacks";
import { createKeyboardBindings, emptyInput, readInput, type KeyboardBindings } from "../../game/input/bindings";
import { FighterAi } from "../../game/simulation/ai";
import { RoundSimulation } from "../../game/simulation/RoundSimulation";
import type { FighterId, FighterState, GameMode, RoundSnapshot } from "../../game/simulation/types";
import { DomUi, type MatchScore, type MusicChoice, type PauseAction, type RoundSelection, type SelectSnapshot } from "../../ui/dom";

type FighterView = {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
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
  "enter" | "escape" | "space" | "music" | "p1Up" | "p1Down" | "p2Up" | "p2Down" | "p1Back" | "p2Back",
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
const musicStorageKey = "bsu-online-suntukan.music";
const retiredMusicKeyMigration: Record<string, string> = {
  "music-ptangona-remix": "music-menu",
  "music-ptangona-remix-alt": "music-menu",
  "music-pngoa-remix": "music-menu",
};
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
  private background!: Phaser.GameObjects.Image;
  private screen: ScreenState = "title";
  private hasStarted = false;
  private stageIndex = 0;
  private pauseIndex = 0;
  private settingsOpen = false;
  private roundAdvanceEvent: Phaser.Time.TimerEvent | null = null;
  private roundEndHandled = false;
  private selectState: SelectSnapshot = {
    mode: "pvp",
    p1Index: 0,
    p2Index: 1,
    p1Locked: false,
    p2Locked: false,
  };
  private lastSelection: RoundSelection = {
    mode: "pvp",
    p1FighterKey: fighterManifests[0].key,
    p2FighterKey: fighterManifests[1]?.key ?? fighterManifests[0].key,
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
  private menuMusic: Phaser.Sound.BaseSound | null = null;
  private menuMusicKey: string | null = null;
  private selectedMusicKey = defaultMusicKey;
  private menuLightningTimers: Phaser.Time.TimerEvent[] = [];
  private menuLightningElements: HTMLElement[] = [];
  private specialEffectObjects: Phaser.GameObjects.GameObject[] = [];
  private specialEffectTimers: Phaser.Time.TimerEvent[] = [];
  private specialEffectTweens: Phaser.Tweens.Tween[] = [];
  private specialHtmlAudios: HTMLAudioElement[] = [];
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

  constructor() {
    super("BattleScene");
  }

  preload() {
    for (const stage of stageManifests) {
      this.load.image(stage.key, stage.path);
    }

    for (const portrait of allPortraitAssets()) {
      this.load.image(portrait.key, portrait.path);
    }

    for (const frame of allFrameAnimationAssets()) {
      this.load.image(frame.key, frame.path);
    }

    for (const pose of allPoseAssets()) {
      this.loadPoseAsset(pose);
    }

    for (const specialAsset of allSpecialAssets()) {
      this.load.image(specialAsset.key, specialAsset.path);
    }

    for (const vfx of allVfxAssets()) {
      this.load.spritesheet(vfx.key, vfx.path, {
        frameWidth: vfx.frameWidth,
        frameHeight: vfx.frameHeight,
      });
    }

    for (const [index, path] of allVoicePaths().entries()) {
      const key = `voice-${index}`;
      voiceKeyByPath.set(path, key);
      this.load.audio(key, path);
    }

    for (const track of menuMusicTrackManifests) {
      this.load.audio(track.key, track.path);
    }

    for (const sfx of [...sfxEntries, ...allExtraSfxAssets()]) {
      this.load.audio(sfx.key, sfx.path);
    }
  }

  create() {
    this.ensureFallbackTextures();
    this.preloadUiFonts();
    this.createVfxAnimations();
    this.createBackground();
    this.createFloorMarks();
    this.keys = createKeyboardBindings(this);
    this.menuKeys = this.createMenuKeys();
    this.selectedMusicKey = this.loadSavedMusicKey();
    this.ui = new DomUi(
      {
        chooseMode: (mode) => this.enterCharacterSelect(mode),
        previewSelection: () => undefined,
        startMatch: (selection) => this.startMatch(selection, true),
        changeMusic: (delta) => this.changeMusicSelection(delta),
        openSettings: () => this.openSettingsMenu(),
        closeSettings: () => this.closeSettingsMenu(),
        pauseAction: (action) => this.applyPauseAction(action),
        restartMatch: () => this.startMatch(this.lastSelection, true),
        mainMenu: () => this.enterMainMenu(),
      },
      fighterManifests,
      stageManifests,
      musicChoices,
    );
    this.ui.updateMusicChoice(this.selectedMusicKey);
    this.enterMainMenu();
    document.getElementById("loading-screen")?.classList.add("hidden");
  }

  update(_time: number, deltaMs: number) {
    const clampedDelta = Math.min(deltaMs, 34);
    this.handleScreenInput();

    if (!this.sim || this.screen !== "playing") {
      this.ui.updateHud(this.sim?.snapshot ?? null, this.score);
      return;
    }

    const inputs =
      this.sim.snapshot.status === "playing"
        ? {
            p1:
              this.sim.snapshot.specialSequence.phase === "idle"
                ? readInput(this.keys.p1)
                : emptyInput(),
            p2:
              this.sim.snapshot.specialSequence.phase === "idle"
                ? this.sim.snapshot.mode === "pvc"
                  ? this.readAiInput(clampedDelta)
                  : readInput(this.keys.p2)
                : emptyInput(),
          }
        : {
            p1: emptyInput(),
            p2: emptyInput(),
          };

    this.sim.update(clampedDelta, inputs);
    this.syncViews(this.sim.snapshot);
    this.ui.updateHud(this.sim.snapshot, this.score);
  }

  private enterMainMenu() {
    this.stopRoundAdvance();
    this.cancelSelectionConfirm();
    this.cleanupMenuLightning();
    this.stopTransientSfx();
    this.sim?.cancelSpecialSequence();
    this.cleanupSpecialEffects();
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
    this.stopRoundAdvance();
    this.cancelSelectionConfirm();
    this.cleanupMenuLightning();
    this.stopTransientSfx();
    this.sim?.cancelSpecialSequence();
    this.cleanupSpecialEffects();
    this.resetMatch();
    this.settingsOpen = false;
    this.screen = "characters";
    this.sim = null;
    this.destroyFighterViews();
    this.playMenuMusic();
    this.selectState = {
      mode,
      p1Index: this.findFighterIndex(this.lastSelection.p1FighterKey, 0),
      p2Index: this.findFighterIndex(this.lastSelection.p2FighterKey, 1),
      p1Locked: false,
      p2Locked: false,
    };
    this.ui.showCharacterSelect(this.selectState);
    this.startMenuLightning();
  }

  private enterStageSelect() {
    this.cancelSelectionConfirm();
    this.cleanupMenuLightning();
    this.settingsOpen = false;
    this.sim?.cancelSpecialSequence();
    this.cleanupSpecialEffects();
    this.screen = "stage";
    this.playMenuMusic();
    this.lastSelection = this.selectionFromSelectState();
    this.stageIndex = this.findStageIndex(this.lastSelection.stageKey);
    this.setStage(this.lastSelection.stageKey);
    this.ui.showStageSelect(this.lastSelection);
    this.startMenuLightning();
  }

  private startMatch(selection: RoundSelection, resetScore: boolean) {
    this.hasStarted = true;
    this.lastSelection = this.normalizeSelection(selection);
    this.stageIndex = this.findStageIndex(this.lastSelection.stageKey);
    if (resetScore) {
      this.resetMatch();
    }
    this.startRound();
  }

  private startRound() {
    this.stopRoundAdvance();
    this.sim?.cancelSpecialSequence();
    this.cleanupSpecialEffects();
    this.cleanupMenuLightning();
    this.screen = "playing";
    this.settingsOpen = false;
    this.roundEndHandled = false;
    this.roundOverPlayed = false;
    this.stopTransientSfx();
    this.resetVoicePolicy();
    this.stopMenuMusic();
    this.playSfx(sfxManifest.menuSelect.key, "menuSelect");
    this.playRoundAnnouncementSfx();
    this.ui.hideRoundMessage();
    this.ui.hidePauseMenu();
    this.ui.showGameplay();
    this.ai.reset();
    this.destroyFighterViews();

    const p1Def = getFighterManifest(this.lastSelection.p1FighterKey);
    const p2Def = getFighterManifest(this.lastSelection.p2FighterKey);
    this.setStage(this.lastSelection.stageKey);

    this.sim = new RoundSimulation(this.lastSelection.mode, p1Def, p2Def, {
      onAttack: (fighter, attackName) => {
        this.playSfx(sfxManifest.whoosh.key, "whoosh");
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
    });

    this.createFighterView("p1", p1Def);
    this.createFighterView("p2", p2Def);
    this.syncViews(this.sim.snapshot);
    this.ui.updateHud(this.sim.snapshot, this.score);
    const roundNumber = this.currentRoundNumber();
    this.ui.showRoundMessage(`ROUND ${roundNumber}`);
    this.time.delayedCall(1150, () => {
      if (this.screen === "playing" && !this.roundEndHandled) {
        this.ui.hideRoundMessage();
      }
    });
  }

  private handleRoundEnd(winner: FighterId | "draw") {
    if (this.roundEndHandled || !this.sim) {
      return;
    }

    this.roundEndHandled = true;
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
    this.sim.cancelSpecialSequence();
    this.cleanupSpecialEffects();
    this.cleanupMenuLightning();
    this.sound.stopAll();
    this.clearSfxGuards();
    this.ui.hideRoundMessage();
    this.ui.showMatchWinner(this.sim.snapshot.fighters[winner].def.displayName, this.score);
  }

  private pauseGame() {
    if (this.screen !== "playing" || this.sim?.snapshot.status !== "playing") {
      return;
    }
    this.screen = "paused";
    this.pauseIndex = 0;
    this.sim.cancelSpecialSequence();
    this.cleanupSpecialEffects();
    this.cleanupMenuLightning();
    this.sound.pauseAll();
    this.tweens.pauseAll();
    this.time.paused = true;
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
    this.ui.hidePauseMenu();
  }

  private applyPauseAction(action: PauseAction) {
    if (action === "resume") {
      this.resumeGame();
      return;
    }

    this.sound.stopAll();
    this.clearSfxGuards();
    this.cleanupSpecialEffects();
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
        this.enterCharacterSelect("pvp");
      } else if (this.just(this.keys.p2.punch)) {
        this.playSfx(sfxManifest.menuSelect.key, "menuSelect");
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

  private handleCharacterSelectInput() {
    if (this.selectionConfirming) {
      return;
    }

    let changed = false;
    if (!this.selectState.p1Locked) {
      const delta = this.cursorDelta("p1");
      if (delta !== 0) {
        this.selectState.p1Index = this.wrapFighterIndex(this.selectState.p1Index + delta);
        changed = true;
      }
    }

    if (!this.selectState.p2Locked) {
      const delta = this.cursorDelta("p2");
      if (delta !== 0) {
        this.selectState.p2Index = this.wrapFighterIndex(this.selectState.p2Index + delta);
        changed = true;
      }
    }

    if (this.just(this.keys.p1.punch) && !this.selectState.p1Locked) {
      if (this.isPlayableFighterIndex(this.selectState.p1Index)) {
        this.selectState.p1Locked = true;
        if (this.selectState.mode === "pvc") {
          this.selectState.p2Index = this.randomCpuFighterIndex(this.selectState.p1Index);
          this.selectState.p2Locked = true;
        }
        this.playSfx(sfxManifest.menuSelect.key, "menuSelect");
        changed = true;
      } else {
        this.playSfx(sfxManifest.block.key, "block", { cooldownMs: 180 });
      }
    }
    if (this.just(this.keys.p2.punch) && this.selectState.mode === "pvp" && !this.selectState.p2Locked) {
      if (this.isPlayableFighterIndex(this.selectState.p2Index)) {
        this.selectState.p2Locked = true;
        this.playSfx(sfxManifest.menuSelect.key, "menuSelect");
        changed = true;
      } else {
        this.playSfx(sfxManifest.block.key, "block", { cooldownMs: 180 });
      }
    }
    if (this.just(this.keys.p1.kick)) {
      this.selectState.p1Locked = false;
      changed = true;
    }
    if (this.just(this.keys.p2.kick)) {
      this.selectState.p2Locked = false;
      changed = true;
    }

    if (
      this.just(this.menuKeys.enter) ||
      (this.selectState.p1Locked && this.selectState.p2Locked && (this.just(this.keys.p1.punch) || this.just(this.keys.p2.punch)))
    ) {
      if (this.selectState.mode === "pvc" && this.selectState.p1Locked && !this.selectState.p2Locked) {
        this.selectState.p2Locked = true;
      }
      if (this.selectState.p1Locked && this.selectState.p2Locked) {
        this.confirmCharacterSelection();
        return;
      }
    }

    if (this.just(this.menuKeys.escape)) {
      this.enterMainMenu();
      return;
    }

    if (changed) {
      this.ui.updateCharacterSelect(this.selectState);
    }
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

  private ensureFallbackTextures() {
    this.createFallbackTexture("missing-stage", 960, 540, 0x1f2933, "BSU STAGE");

    for (const fighter of fighterManifests.filter(isFighterPlayable)) {
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
    graphics.fillStyle(effect === "car-rush" ? 0x050505 : effect === "rasengan" ? 0x1c82ff : effect === "mango-projectile" ? 0x4bcf48 : 0x2c3440, 1);
    graphics.fillRoundedRect(0, 38, 220, 88, 18);
    graphics.fillStyle(0xffffff, 0.9);
    graphics.fillRoundedRect(38, 16, 88, 46, 12);
    graphics.fillStyle(effect === "rasengan" ? 0x8deeff : 0xf4c84a, 1);
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
    const bgKey = this.textures.exists(stage.key) ? stage.key : "missing-stage";
    this.background = this.add.image(480, 270, bgKey);
    this.background.setDisplaySize(960, 540);
    this.background.setDepth(-10);
    this.background.setAlpha(stage.usesDomBackground ? 0 : 1);
    this.applyDomStageBackground(stage);
  }

  private setStage(stageKey: string) {
    this.cleanupSpecialEffects();
    const stage = getStageManifest(stageKey);
    const textureKey = this.textures.exists(stage.key) ? stage.key : "missing-stage";
    this.background?.setTexture(textureKey);
    this.background?.setDisplaySize(960, 540);
    this.background?.setAlpha(stage.usesDomBackground ? 0 : 1);
    this.applyDomStageBackground(stage);
    this.currentGroundY = stage.floorY ?? 474;
  }

  private applyDomStageBackground(stage: { path: string; usesDomBackground?: boolean }) {
    const root = document.getElementById("game-root");
    if (!root) {
      return;
    }
    root.style.backgroundImage = stage.usesDomBackground ? `url("${stage.path}")` : "";
  }

  private createFloorMarks() {
    const ground = this.add.rectangle(480, this.currentGroundY + 29, 840, 5, 0xf4c84a, 0.72);
    ground.setDepth(-1);
    this.add.rectangle(480, 510, 960, 60, 0x06080c, 0.28).setDepth(-2);
  }

  private destroyFighterViews() {
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
    sprite.setOrigin(0.5, 1);
    sprite.setDisplaySize(def.body.drawWidth * def.scale, def.body.drawHeight * def.scale);
    sprite.setFlipX(shouldFlipFighterAsset(def, "idle", facing));
    sprite.setData("fighterView", true);
    shadow.setData("fighterView", true);
    shadow.setDepth(2);
    sprite.setDepth(3);
    this.fighterViews.set(id, {
      sprite,
      shadow,
      lastPose: null,
      frameAnimation: { name: null, frameIndex: 0, nextFrameAtMs: 0 },
      effect: { offsetX: 0, offsetY: 0, angle: 0, scale: 1 },
    });
  }

  private syncViews(snapshot: RoundSnapshot) {
    const specialSequence = snapshot.specialSequence;
    for (const fighter of Object.values(snapshot.fighters)) {
      const view = this.fighterViews.get(fighter.id);
      if (!view) {
        continue;
      }
      view.sprite.setPosition(fighter.x + view.effect.offsetX, fighter.y + view.effect.offsetY);
      view.sprite.setAngle(view.effect.angle);
      view.sprite.setDisplaySize(
        fighter.def.body.drawWidth * fighter.def.scale * view.effect.scale,
        fighter.def.body.drawHeight * fighter.def.scale * view.effect.scale,
      );
      view.shadow.setPosition(fighter.x, fighter.y + 8);
      view.shadow.setScale(fighter.grounded ? 1 : 0.74);

      const frameAnimationName = this.getFrameAnimationName(snapshot, fighter);
      const frameAnimationApplied = frameAnimationName
        ? this.applyFrameAnimation(view, fighter, frameAnimationName)
        : false;
      if (frameAnimationApplied) {
        // Texture and flip are handled by the active frame animation.
      } else {
        this.stopLoopAnimation(view);
        view.sprite.setFlipX(this.shouldFlipFighterPose(fighter, fighter.pose));
      }

      if (!frameAnimationApplied && view.lastPose !== fighter.pose) {
        this.applyPose(view, fighter, fighter.pose);
        view.lastPose = fighter.pose;
      }

      if (
        specialSequence.phase === "intro" &&
        specialSequence.casterId === fighter.id &&
        specialIntroPresentation.specialIntroTint !== null
      ) {
        view.sprite.setTint(specialIntroPresentation.specialIntroTint);
      } else if (fighter.hitStunMs > 0) {
        view.sprite.setTint(0xffb2a8);
      } else if (fighter.health <= 0) {
        view.sprite.setTint(0x9a9a9a);
      } else {
        view.sprite.clearTint();
      }
    }
  }

  private applyPose(view: FighterView, fighter: FighterState, poseName: PoseName) {
    const pose = fighter.def.poses[poseName];
    if (pose.type === "spritesheet") {
      const animationKey = `${pose.key}-${poseName}`;
      if (this.anims.exists(animationKey)) {
        view.sprite.play(animationKey, true);
        view.sprite.setOrigin(0.5, 1);
        view.sprite.setDisplaySize(
          fighter.def.body.drawWidth * fighter.def.scale * view.effect.scale,
          fighter.def.body.drawHeight * fighter.def.scale * view.effect.scale,
        );
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
    view.sprite.setDisplaySize(
      fighter.def.body.drawWidth * fighter.def.scale * view.effect.scale,
      fighter.def.body.drawHeight * fighter.def.scale * view.effect.scale,
    );
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
    const availableTracks = menuMusicTrackManifests.filter((track) => this.cache.audio.exists(track.key));
    if (availableTracks.length <= 1) {
      return;
    }
    const completedIndex = Math.max(0, availableTracks.findIndex((track) => track.key === completedTrackKey));
    const nextTrack = availableTracks[(completedIndex + 1) % availableTracks.length];
    if (!nextTrack || nextTrack.key === completedTrackKey) {
      return;
    }
    this.selectedMusicKey = nextTrack.key;
    this.saveMusicKey(nextTrack.key);
    this.stopMenuMusic();
    this.playMenuMusic();
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
    this.cameras.main.setZoom(1);
    this.cameras.main.centerOn(480, 270);
    for (const view of this.fighterViews.values()) {
      this.stopLoopAnimation(view);
      view.effect.offsetX = 0;
      view.effect.offsetY = 0;
      view.effect.angle = 0;
      view.effect.scale = 1;
      view.sprite.setAlpha(1);
      view.sprite.clearTint();
      view.sprite.setDepth(3);
      view.shadow.setDepth(2);
    }
    for (const audio of this.specialHtmlAudios) {
      audio.pause();
      audio.src = "";
      audio.remove();
    }
    this.specialHtmlAudios = [];
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

    const overlay = this.trackSpecialObject(this.add.rectangle(480, 270, 960, 540, 0x000000, 0.54));
    overlay.setDepth(5);

    const special = attacker.def.special;
    const label = this.trackSpecialObject(
      this.add
        .text(480, 130, special.name, {
          color: "#fff2a4",
          fontFamily: arcadeFonts.display,
          fontSize: "42px",
          fontStyle: "900",
          stroke: "#000000",
          strokeThickness: 6,
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
        .setDepth(13),
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
    } else {
      this.playRasenganEffect(attacker, victim);
    }
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
    const startX = attacker.facing === 1 ? -150 : 1110;
    const endX = attacker.facing === 1 ? 1110 : -150;
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
      attacker.def.special.effect === "mango-projectile" || attacker.def.special.effect === "satellite-strike";
    const startX = isCarRush
      ? (attacker.facing === 1 ? -170 : 1130)
      : attacker.x + (isStationaryCaster ? 0 : attacker.facing * 24);
    const endX = isCarRush
      ? (attacker.facing === 1 ? 1130 : -170)
      : isSuperFlight
        ? Phaser.Math.Clamp(attacker.x + attacker.facing * attacker.def.special.range, 80, 880)
        : isStationaryCaster
        ? startX
        : Phaser.Math.Clamp(victim.x - attacker.facing * 36, 80, 880);
    const y = isCarRush ? attacker.y + 8 : attacker.y;
    const width = isCarRush ? 300 : Math.max(attacker.def.body.drawWidth * 1.28, 270);
    const height = isCarRush ? 300 : Math.max(attacker.def.body.drawHeight * 1.22, 260);
    const sprite = this.trackSpecialObject(this.add.sprite(startX, y, frames[0].key));
    sprite.setOrigin(0.5, 1);
    sprite.setDisplaySize(width, height);
    sprite.setDepth(9);
    sprite.setFlipX(shouldFlipSpecialFrameAsset(attacker.def, 0, attacker.facing));

    const casterView = this.fighterViews.get(attacker.id);
    if (casterView) {
      casterView.sprite.setAlpha(0);
    }

    if (attacker.def.special.effect === "mango-projectile") {
      this.playMangoProjectileEffect(attacker, victim);
    } else if (attacker.def.special.effect === "satellite-strike") {
      this.playSatelliteStrikeEffect(attacker, victim);
    }

    let elapsedMs = 0;
    for (const [index, frame] of frames.entries()) {
      const frameStartMs = elapsedMs;
      this.trackSpecialTimer(
        this.time.delayedCall(frameStartMs, () => {
          if (!sprite.active) {
            return;
          }
          sprite.setTexture(frame.key);
          sprite.setFlipX(shouldFlipSpecialFrameAsset(attacker.def, index, attacker.facing));
          if (index === (attacker.def.special.impactFrame ?? 4) - 1) {
            if (attacker.def.special.effect === "ground-smash" || attacker.def.special.effect === "barbell") {
              this.cameras.main.shake(260, 0.012);
            } else {
              this.cameras.main.shake(180, 0.008);
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
        const targetX = targetIsInFront ? victim.x - attacker.facing * 16 : attacker.facing === 1 ? 1080 : -120;
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

  private playSatelliteStrikeEffect(attacker: FighterState, victim: FighterState) {
    const impactMs = this.getSpecialImpactVisualMs(attacker);
    const targetX = Phaser.Math.Clamp(victim.x, 92, 868);
    const targetY = victim.y - 68;
    const warning = this.trackSpecialObject(this.add.ellipse(targetX, 463, 132, 34, 0xff3b30, 0.28));
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
    const announcement = extraSfxManifest.roundAnnouncements[roundNumber - 1];
    if (
      announcement &&
      this.playSfx(announcement.key, "roundStart", {
        oneShot: true,
        cooldownMs: 1200,
        volumeMultiplier: 1.12,
      })
    ) {
      return;
    }
    this.playSfx(sfxManifest.roundStart.key, "roundStart", { oneShot: true, cooldownMs: 1200 });
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
    options: { oneShot?: boolean; cooldownMs?: number; volumeMultiplier?: number } = {},
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
        const volume = Math.min(1, audioConfig.sfxVolume * (options.volumeMultiplier ?? 1));
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
    return {
      ...selection,
      p1FighterKey: getFighterManifest(selection.p1FighterKey).key ?? fallback.key,
      p2FighterKey: getFighterManifest(selection.p2FighterKey).key ?? fallback.key,
    };
  }

  private randomCpuFighterIndex(excludedIndex: number) {
    const options = fighterManifests
      .map((_fighter, index) => index)
      .filter((index) => index !== excludedIndex && this.isPlayableFighterIndex(index));
    return Phaser.Utils.Array.GetRandom(options) ?? Math.max(0, fighterManifests.findIndex(isFighterPlayable));
  }

  private just(key: Phaser.Input.Keyboard.Key) {
    return Phaser.Input.Keyboard.JustDown(key);
  }
}
