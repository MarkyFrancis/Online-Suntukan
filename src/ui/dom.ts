import { isFighterPlayable, type FighterAssetManifest, type StageAssetManifest } from "../game/assets/manifest";
import type { FighterId, GameMode, RoundSnapshot } from "../game/simulation/types";

export type MusicChoice = {
  key: string;
  displayName: string;
};

export type RoundSelection = {
  mode: GameMode;
  p1FighterKey: string;
  p2FighterKey: string;
  stageKey: string;
};

export type SelectSnapshot = {
  mode: GameMode;
  p1Index: number;
  p2Index: number;
  p1Locked: boolean;
  p2Locked: boolean;
};

export type MatchScore = Record<FighterId, number>;
export type PauseAction = "resume" | "restart-round" | "character-select" | "stage-select" | "main-menu";

type UiCallbacks = {
  chooseMode: (mode: GameMode) => void;
  previewSelection: (selection: Omit<RoundSelection, "mode">) => void;
  startMatch: (selection: RoundSelection) => void;
  changeMusic: (delta: number) => void;
  openSettings: () => void;
  closeSettings: () => void;
  pauseAction: (action: PauseAction) => void;
  restartMatch: () => void;
  mainMenu: () => void;
};

type UiElements = {
  titleScreen: HTMLElement;
  titlePvp: HTMLButtonElement;
  titlePvc: HTMLButtonElement;
  titleSettings: HTMLButtonElement;
  settingsMenu: HTMLElement;
  settingsClose: HTMLButtonElement;
  musicPrev: HTMLButtonElement;
  musicNext: HTMLButtonElement;
  musicChoice: HTMLElement;
  characterSelect: HTMLElement;
  selectModeLabel: HTMLElement;
  fighterGrid: HTMLElement;
  p1PreviewImg: HTMLImageElement;
  p2PreviewImg: HTMLImageElement;
  p1PreviewName: HTMLElement;
  p2PreviewName: HTMLElement;
  p1Ready: HTMLElement;
  p2Ready: HTMLElement;
  p2Label: HTMLElement;
  stageScreen: HTMLElement;
  stageGrid: HTMLElement;
  stageName: HTMLElement;
  restartButton: HTMLButtonElement;
  p1Name: HTMLElement;
  p2Name: HTMLElement;
  p1Health: HTMLElement;
  p2Health: HTMLElement;
  p1Special: HTMLElement;
  p2Special: HTMLElement;
  p1SpecialLabel: HTMLElement;
  p2SpecialLabel: HTMLElement;
  p1Rounds: HTMLElement;
  p2Rounds: HTMLElement;
  timer: HTMLElement;
  banner: HTMLElement;
  message: HTMLElement;
  pauseMenu: HTMLElement;
  pauseOptions: HTMLElement;
  matchWinner: HTMLElement;
  matchWinnerTitle: HTMLElement;
  restartMatch: HTMLButtonElement;
  winnerMainMenu: HTMLButtonElement;
};

const pauseItems: { label: string; action: PauseAction }[] = [
  { label: "Resume", action: "resume" },
  { label: "Restart Round", action: "restart-round" },
  { label: "Character Select", action: "character-select" },
  { label: "Stage Select", action: "stage-select" },
  { label: "Main Menu", action: "main-menu" },
];

export class DomUi {
  private readonly elements: UiElements;
  private selectedStageIndex = 0;
  private pauseIndex = 0;
  private currentSelection: RoundSelection;

  constructor(
    private readonly callbacks: UiCallbacks,
    private readonly fighters: FighterAssetManifest[],
    private readonly stages: StageAssetManifest[],
    private readonly musicChoices: MusicChoice[],
  ) {
    this.elements = this.getElements();
    const firstFighter = fighters[0]?.key ?? "";
    this.currentSelection = {
      mode: "pvp",
      p1FighterKey: firstFighter,
      p2FighterKey: fighters[1]?.key ?? firstFighter,
      stageKey: stages[0]?.key ?? "",
    };
    this.renderFighterGrid();
    this.renderStageGrid();
    this.renderPauseOptions();
    this.elements.titlePvp.addEventListener("click", () => callbacks.chooseMode("pvp"));
    this.elements.titlePvc.addEventListener("click", () => callbacks.chooseMode("pvc"));
    this.elements.titleSettings.addEventListener("click", callbacks.openSettings);
    this.elements.settingsClose.addEventListener("click", callbacks.closeSettings);
    this.elements.musicPrev.addEventListener("click", () => callbacks.changeMusic(-1));
    this.elements.musicNext.addEventListener("click", () => callbacks.changeMusic(1));
    this.elements.restartButton.addEventListener("click", () => callbacks.pauseAction("restart-round"));
    this.elements.restartMatch.addEventListener("click", callbacks.restartMatch);
    this.elements.winnerMainMenu.addEventListener("click", callbacks.mainMenu);
  }

  showMainMenu() {
    this.showOnly("title");
    this.elements.banner.classList.add("hidden");
    this.elements.pauseMenu.classList.add("hidden");
    this.elements.matchWinner.classList.add("hidden");
    this.hideSettingsMenu();
  }

  showSettingsMenu() {
    this.elements.settingsMenu.classList.remove("hidden");
  }

  hideSettingsMenu() {
    this.elements.settingsMenu.classList.add("hidden");
  }

  updateMusicChoice(choiceKey: string) {
    const selected = this.musicChoices.find((choice) => choice.key === choiceKey) ?? this.musicChoices[0];
    this.elements.musicChoice.textContent = selected?.displayName ?? "No Music";
    this.elements.musicChoice.classList.toggle("no-music", selected?.key === "none");
  }

  showCharacterSelect(snapshot: SelectSnapshot) {
    this.showOnly("characters");
    this.updateCharacterSelect(snapshot);
  }

  updateCharacterSelect(snapshot: SelectSnapshot) {
    const p1 = this.fighters[snapshot.p1Index] ?? this.fighters[0];
    const p2 = this.fighters[snapshot.p2Index] ?? this.fighters[0];
    const p1Playable = isFighterPlayable(p1);
    const p2Playable = isFighterPlayable(p2);
    this.elements.selectModeLabel.textContent = snapshot.mode.toUpperCase();
    this.elements.p2Label.textContent = snapshot.mode === "pvc" ? "CPU" : "P2";
    this.setPreviewImage(this.elements.p1PreviewImg, p1);
    this.setPreviewImage(this.elements.p2PreviewImg, p2);
    this.elements.p1PreviewImg.classList.toggle("source-right", (p1.portrait.sourceFacing ?? p1.baseFacing) === "right");
    this.elements.p2PreviewImg.classList.toggle("source-right", (p2.portrait.sourceFacing ?? p2.baseFacing) === "right");
    this.elements.p1PreviewName.textContent = p1.displayName;
    this.elements.p2PreviewName.textContent = p2.displayName;
    this.elements.p1Ready.textContent = p1Playable ? (snapshot.p1Locked ? "Ready" : "Choosing") : "Coming Soon";
    this.elements.p2Ready.textContent = p2Playable ? (snapshot.p2Locked ? "Ready" : "Choosing") : "Coming Soon";
    this.elements.p1Ready.classList.toggle("ready", p1Playable && snapshot.p1Locked);
    this.elements.p2Ready.classList.toggle("ready", p2Playable && snapshot.p2Locked);
    this.elements.p1Ready.classList.toggle("locked", !p1Playable);
    this.elements.p2Ready.classList.toggle("locked", !p2Playable);
    this.elements.p1PreviewImg.parentElement?.classList.toggle("preview-locked", !p1Playable);
    this.elements.p2PreviewImg.parentElement?.classList.toggle("preview-locked", !p2Playable);

    for (const button of this.elements.fighterGrid.querySelectorAll<HTMLButtonElement>(".fighter-cell")) {
      const index = Number(button.dataset.index ?? 0);
      const fighter = this.fighters[index];
      button.classList.toggle("p1-cursor", index === snapshot.p1Index);
      button.classList.toggle("p2-cursor", index === snapshot.p2Index);
      button.classList.toggle("p1-locked", snapshot.p1Locked && index === snapshot.p1Index);
      button.classList.toggle("p2-locked", snapshot.p2Locked && index === snapshot.p2Index);
      button.classList.toggle("locked", fighter ? !isFighterPlayable(fighter) : false);
    }
  }

  showStageSelect(selection: Omit<RoundSelection, "mode">) {
    this.showOnly("stage");
    this.loadStagePreviewImages();
    this.currentSelection = {
      ...this.currentSelection,
      ...selection,
    };
    const stageIndex = Math.max(0, this.stages.findIndex((stage) => stage.key === selection.stageKey));
    this.selectedStageIndex = stageIndex;
    this.updateStageSelect(stageIndex);
  }

  updateStageSelect(index: number) {
    this.selectedStageIndex = clamp(index, 0, Math.max(0, this.stages.length - 1));
    const selected = this.stages[this.selectedStageIndex] ?? this.stages[0];
    this.elements.stageName.textContent = selected.displayName;
    this.currentSelection.stageKey = selected.key;

    for (const button of this.elements.stageGrid.querySelectorAll<HTMLButtonElement>(".stage-cell")) {
      button.classList.toggle("selected", Number(button.dataset.index ?? 0) === this.selectedStageIndex);
    }
  }

  getSelectedStageIndex() {
    return this.selectedStageIndex;
  }

  showGameplay() {
    this.showOnly("gameplay");
    this.elements.pauseMenu.classList.add("hidden");
    this.elements.matchWinner.classList.add("hidden");
  }

  updateHud(snapshot: RoundSnapshot | null, score: MatchScore) {
    this.renderRoundPips(score);

    if (!snapshot) {
      this.elements.p1Health.style.width = "100%";
      this.elements.p2Health.style.width = "100%";
      this.elements.p1Special.style.width = "0%";
      this.elements.p2Special.style.width = "0%";
      this.elements.p1SpecialLabel.textContent = "SPECIAL";
      this.elements.p2SpecialLabel.textContent = "SPECIAL";
      this.setBarState(this.elements.p1Health, false, "danger");
      this.setBarState(this.elements.p2Health, false, "danger");
      this.setBarState(this.elements.p1Special, false, "ready");
      this.setBarState(this.elements.p2Special, false, "ready");
      this.elements.timer.textContent = "120";
      return;
    }

    const { p1, p2 } = snapshot.fighters;
    const p1HealthRatio = p1.health / p1.maxHealth;
    const p2HealthRatio = p2.health / p2.maxHealth;
    this.elements.p1Name.textContent = p1.def.displayName;
    this.elements.p2Name.textContent =
      snapshot.mode === "pvc" ? `${p2.def.displayName} CPU` : p2.def.displayName;
    this.elements.p1Health.style.width = `${Math.max(0, p1HealthRatio * 100)}%`;
    this.elements.p2Health.style.width = `${Math.max(0, p2HealthRatio * 100)}%`;
    this.elements.p1Special.style.width = `${Math.max(0, p1.specialMeter)}%`;
    this.elements.p2Special.style.width = `${Math.max(0, p2.specialMeter)}%`;
    this.elements.p1SpecialLabel.textContent = p1.specialMeter >= 100 ? "SPECIAL READY" : p1.def.special.name;
    this.elements.p2SpecialLabel.textContent = p2.specialMeter >= 100 ? "SPECIAL READY" : p2.def.special.name;
    this.elements.p1SpecialLabel.classList.toggle("ready", p1.specialMeter >= 100);
    this.elements.p2SpecialLabel.classList.toggle("ready", p2.specialMeter >= 100);
    this.setBarState(this.elements.p1Health, p1HealthRatio <= 0.28, "danger");
    this.setBarState(this.elements.p2Health, p2HealthRatio <= 0.28, "danger");
    this.setBarState(this.elements.p1Special, p1.specialMeter >= 100, "ready");
    this.setBarState(this.elements.p2Special, p2.specialMeter >= 100, "ready");
    this.elements.timer.textContent = `${Math.ceil(snapshot.timerMs / 1000)}`;
  }

  showRoundMessage(message: string) {
    this.elements.message.textContent = message;
    this.elements.banner.classList.remove("hidden");
  }

  hideRoundMessage() {
    this.elements.banner.classList.add("hidden");
  }

  showPauseMenu(selectedIndex: number) {
    this.pauseIndex = selectedIndex;
    this.elements.pauseMenu.classList.remove("hidden");
    this.updatePauseMenu(selectedIndex);
  }

  hidePauseMenu() {
    this.elements.pauseMenu.classList.add("hidden");
  }

  updatePauseMenu(selectedIndex: number) {
    this.pauseIndex = wrap(selectedIndex, 0, pauseItems.length);
    for (const button of this.elements.pauseOptions.querySelectorAll<HTMLButtonElement>("button")) {
      button.classList.toggle("selected", Number(button.dataset.index ?? 0) === this.pauseIndex);
    }
  }

  getPauseAction(index = this.pauseIndex): PauseAction {
    return pauseItems[wrap(index, 0, pauseItems.length)].action;
  }

  showMatchWinner(winnerName: string, score: MatchScore) {
    this.showOnly("gameplay");
    this.renderRoundPips(score);
    this.elements.matchWinnerTitle.textContent = `${winnerName} wins the match`;
    this.elements.matchWinner.classList.remove("hidden");
  }

  private showOnly(screen: "title" | "characters" | "stage" | "gameplay") {
    document.body.dataset.screen = screen;
    this.elements.titleScreen.classList.toggle("hidden", screen !== "title");
    this.elements.characterSelect.classList.toggle("hidden", screen !== "characters");
    this.elements.stageScreen.classList.toggle("hidden", screen !== "stage");
    if (screen !== "title") {
      this.hideSettingsMenu();
    }
  }

  private renderFighterGrid() {
    this.elements.fighterGrid.replaceChildren();

    for (const [index, fighter] of this.fighters.entries()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "fighter-cell";
      button.dataset.index = `${index}`;
      const playable = isFighterPlayable(fighter);
      button.classList.toggle("locked", !playable);
      button.disabled = !playable;
      button.setAttribute("aria-disabled", `${!playable}`);
      const img = document.createElement("img");
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      if (fighter.portrait.path) {
        img.src = fighter.portrait.path;
        img.onerror = () => {
          img.removeAttribute("src");
          img.classList.add("missing-portrait");
        };
      } else {
        img.classList.add("missing-portrait");
      }
      const label = document.createElement("span");
      label.textContent = fighter.displayName;
      button.append(img, label);
      if (!playable) {
        const status = document.createElement("small");
        status.textContent = "Coming Soon";
        button.append(status);
      }
      this.elements.fighterGrid.append(button);
    }
  }

  private setPreviewImage(image: HTMLImageElement, fighter: FighterAssetManifest) {
    image.classList.remove("missing-portrait");
    image.onerror = () => {
      image.removeAttribute("src");
      image.classList.add("missing-portrait");
    };
    if (fighter.portrait.path) {
      image.src = fighter.portrait.path;
    } else {
      image.removeAttribute("src");
      image.classList.add("missing-portrait");
    }
  }

  private renderStageGrid() {
    this.elements.stageGrid.replaceChildren();

    for (const [index, stage] of this.stages.entries()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "stage-cell";
      button.dataset.index = `${index}`;
      const img = document.createElement("img");
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.dataset.src = stage.path;
      const label = document.createElement("span");
      label.textContent = stage.displayName;
      button.append(img, label);
      button.addEventListener("click", () => {
        this.updateStageSelect(index);
        this.callbacks.startMatch(this.currentSelection);
      });
      this.elements.stageGrid.append(button);
    }
  }

  private loadStagePreviewImages() {
    for (const image of this.elements.stageGrid.querySelectorAll<HTMLImageElement>("img[data-src]")) {
      if (!image.src) {
        image.src = image.dataset.src ?? "";
      }
    }
  }

  private renderPauseOptions() {
    this.elements.pauseOptions.replaceChildren();

    for (const [index, item] of pauseItems.entries()) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.index = `${index}`;
      button.textContent = item.label;
      button.addEventListener("click", () => this.callbacks.pauseAction(item.action));
      this.elements.pauseOptions.append(button);
    }
  }

  private renderRoundPips(score: MatchScore) {
    this.elements.p1Rounds.replaceChildren(...this.createPips(score.p1));
    this.elements.p2Rounds.replaceChildren(...this.createPips(score.p2));
  }

  private createPips(wins: number) {
    return [0, 1, 2].map((index) => {
      const pip = document.createElement("span");
      pip.className = `round-pip ${index < wins ? "won" : ""}`;
      return pip;
    });
  }

  private setBarState(fill: HTMLElement, enabled: boolean, className: string) {
    fill.parentElement?.classList.toggle(className, enabled);
  }

  private getElements(): UiElements {
    return {
      titleScreen: this.mustGet("title-screen"),
      titlePvp: this.mustGetButton("title-pvp"),
      titlePvc: this.mustGetButton("title-pvc"),
      titleSettings: this.mustGetButton("title-settings"),
      settingsMenu: this.mustGet("settings-menu"),
      settingsClose: this.mustGetButton("settings-close"),
      musicPrev: this.mustGetButton("music-prev"),
      musicNext: this.mustGetButton("music-next"),
      musicChoice: this.mustGet("music-choice"),
      characterSelect: this.mustGet("character-select"),
      selectModeLabel: this.mustGet("select-mode-label"),
      fighterGrid: this.mustGet("fighter-grid"),
      p1PreviewImg: this.mustGetImage("p1-preview-img"),
      p2PreviewImg: this.mustGetImage("p2-preview-img"),
      p1PreviewName: this.mustGet("p1-preview-name"),
      p2PreviewName: this.mustGet("p2-preview-name"),
      p1Ready: this.mustGet("p1-ready"),
      p2Ready: this.mustGet("p2-ready"),
      p2Label: this.mustGet("p2-label"),
      stageScreen: this.mustGet("stage-screen"),
      stageGrid: this.mustGet("stage-grid"),
      stageName: this.mustGet("stage-name"),
      restartButton: this.mustGetButton("restart-round"),
      p1Name: this.mustGet("p1-name"),
      p2Name: this.mustGet("p2-name"),
      p1Health: this.mustGet("p1-health"),
      p2Health: this.mustGet("p2-health"),
      p1Special: this.mustGet("p1-special"),
      p2Special: this.mustGet("p2-special"),
      p1SpecialLabel: this.mustGet("p1-special-label"),
      p2SpecialLabel: this.mustGet("p2-special-label"),
      p1Rounds: this.mustGet("p1-rounds"),
      p2Rounds: this.mustGet("p2-rounds"),
      timer: this.mustGet("timer"),
      banner: this.mustGet("round-banner"),
      message: this.mustGet("round-message"),
      pauseMenu: this.mustGet("pause-menu"),
      pauseOptions: this.mustGet("pause-options"),
      matchWinner: this.mustGet("match-winner"),
      matchWinnerTitle: this.mustGet("match-winner-title"),
      restartMatch: this.mustGetButton("restart-match"),
      winnerMainMenu: this.mustGetButton("winner-main-menu"),
    };
  }

  private mustGet(id: string): HTMLElement {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Missing UI element #${id}`);
    }
    return element;
  }

  private mustGetButton(id: string): HTMLButtonElement {
    const element = this.mustGet(id);
    if (!(element instanceof HTMLButtonElement)) {
      throw new Error(`#${id} must be a button`);
    }
    return element;
  }

  private mustGetImage(id: string): HTMLImageElement {
    const element = this.mustGet(id);
    if (!(element instanceof HTMLImageElement)) {
      throw new Error(`#${id} must be an image`);
    }
    return element;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function wrap(value: number, min: number, max: number) {
  const range = max - min;
  return ((((value - min) % range) + range) % range) + min;
}
