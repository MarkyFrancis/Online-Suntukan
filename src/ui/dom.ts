import type { FighterAssetManifest, StageAssetManifest } from "../game/assets/manifest";
import type { FighterId, GameMode, RoundSnapshot } from "../game/simulation/types";

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
  pauseAction: (action: PauseAction) => void;
  restartMatch: () => void;
  mainMenu: () => void;
};

type UiElements = {
  titleScreen: HTMLElement;
  titlePvp: HTMLButtonElement;
  titlePvc: HTMLButtonElement;
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
    this.elements.restartButton.addEventListener("click", () => callbacks.pauseAction("restart-round"));
    this.elements.restartMatch.addEventListener("click", callbacks.restartMatch);
    this.elements.winnerMainMenu.addEventListener("click", callbacks.mainMenu);
  }

  showMainMenu() {
    this.showOnly("title");
    this.elements.banner.classList.add("hidden");
    this.elements.pauseMenu.classList.add("hidden");
    this.elements.matchWinner.classList.add("hidden");
  }

  showCharacterSelect(snapshot: SelectSnapshot) {
    this.showOnly("characters");
    this.updateCharacterSelect(snapshot);
  }

  updateCharacterSelect(snapshot: SelectSnapshot) {
    const p1 = this.fighters[snapshot.p1Index] ?? this.fighters[0];
    const p2 = this.fighters[snapshot.p2Index] ?? this.fighters[0];
    this.elements.selectModeLabel.textContent = snapshot.mode.toUpperCase();
    this.elements.p2Label.textContent = snapshot.mode === "pvc" ? "CPU" : "P2";
    this.elements.p1PreviewImg.onerror = () => {
      this.elements.p1PreviewImg.src = p1.poses.idle.path;
    };
    this.elements.p2PreviewImg.onerror = () => {
      this.elements.p2PreviewImg.src = p2.poses.idle.path;
    };
    this.elements.p1PreviewImg.src = p1.portrait.path;
    this.elements.p2PreviewImg.src = p2.portrait.path;
    this.elements.p1PreviewImg.classList.toggle("source-right", (p1.portrait.sourceFacing ?? p1.baseFacing) === "right");
    this.elements.p2PreviewImg.classList.toggle("source-right", (p2.portrait.sourceFacing ?? p2.baseFacing) === "right");
    this.elements.p1PreviewName.textContent = p1.displayName;
    this.elements.p2PreviewName.textContent = p2.displayName;
    this.elements.p1Ready.textContent = snapshot.p1Locked ? "Ready" : "Choosing";
    this.elements.p2Ready.textContent = snapshot.p2Locked ? "Ready" : "Choosing";
    this.elements.p1Ready.classList.toggle("ready", snapshot.p1Locked);
    this.elements.p2Ready.classList.toggle("ready", snapshot.p2Locked);

    for (const button of this.elements.fighterGrid.querySelectorAll<HTMLButtonElement>(".fighter-cell")) {
      const index = Number(button.dataset.index ?? 0);
      button.classList.toggle("p1-cursor", index === snapshot.p1Index);
      button.classList.toggle("p2-cursor", index === snapshot.p2Index);
      button.classList.toggle("p1-locked", snapshot.p1Locked && index === snapshot.p1Index);
      button.classList.toggle("p2-locked", snapshot.p2Locked && index === snapshot.p2Index);
    }
  }

  showStageSelect(selection: Omit<RoundSelection, "mode">) {
    this.showOnly("stage");
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
      this.elements.timer.textContent = "120";
      return;
    }

    const { p1, p2 } = snapshot.fighters;
    this.elements.p1Name.textContent = p1.def.displayName;
    this.elements.p2Name.textContent =
      snapshot.mode === "pvc" ? `${p2.def.displayName} CPU` : p2.def.displayName;
    this.elements.p1Health.style.width = `${Math.max(0, (p1.health / p1.maxHealth) * 100)}%`;
    this.elements.p2Health.style.width = `${Math.max(0, (p2.health / p2.maxHealth) * 100)}%`;
    this.elements.p1Special.style.width = `${Math.max(0, p1.specialMeter)}%`;
    this.elements.p2Special.style.width = `${Math.max(0, p2.specialMeter)}%`;
    this.elements.p1SpecialLabel.textContent = p1.specialMeter >= 100 ? "SPECIAL READY" : p1.def.special.name;
    this.elements.p2SpecialLabel.textContent = p2.specialMeter >= 100 ? "SPECIAL READY" : p2.def.special.name;
    this.elements.p1SpecialLabel.classList.toggle("ready", p1.specialMeter >= 100);
    this.elements.p2SpecialLabel.classList.toggle("ready", p2.specialMeter >= 100);
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
  }

  private renderFighterGrid() {
    this.elements.fighterGrid.replaceChildren();

    for (const [index, fighter] of this.fighters.entries()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "fighter-cell";
      button.dataset.index = `${index}`;
      const img = document.createElement("img");
      img.alt = "";
      img.src = fighter.portrait.path;
      img.onerror = () => {
        img.src = fighter.poses.idle.path;
      };
      const label = document.createElement("span");
      label.textContent = fighter.displayName;
      button.append(img, label);
      this.elements.fighterGrid.append(button);
    }
  }

  private renderStageGrid() {
    this.elements.stageGrid.replaceChildren();

    for (const [index, stage] of this.stages.entries()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "stage-cell";
      button.dataset.index = `${index}`;
      button.innerHTML = `<img src="${stage.path}" alt="" /><span>${stage.displayName}</span>`;
      button.addEventListener("click", () => {
        this.updateStageSelect(index);
        this.callbacks.startMatch(this.currentSelection);
      });
      this.elements.stageGrid.append(button);
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

  private getElements(): UiElements {
    return {
      titleScreen: this.mustGet("title-screen"),
      titlePvp: this.mustGetButton("title-pvp"),
      titlePvc: this.mustGetButton("title-pvc"),
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
