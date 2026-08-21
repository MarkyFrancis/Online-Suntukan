export const specialIntroPresentation = {
  specialIntroScaleEffect: false,
  specialIntroTint: null as number | null,
  specialIntroGlow: false,
  specialIntroFlash: false,
} as const;

export const menuLightningConfig = {
  enabled: true,
  minDelayMs: 2000,
  maxDelayMs: 6000,
  lifetimeMs: 720,
  maxBolts: 2,
  minWidthPx: 190,
  maxWidthPx: 390,
  minAlpha: 0.42,
  maxAlpha: 0.72,
} as const;

// The referee GIF stays in the DOM layer so browsers keep the supplied aura animated.
export const refereeRoundIntroPresentation = {
  descentMs: 1900,
  frameDurationsMs: [650, 650, 700, 800, 900, 450],
  exitMs: 1000,
  fightMessageMs: 620,
  refereeWidth: 200,
  auraWidth: 360,
  auraAlpha: 0.64,
  stageX: 480,
  stageY: 330,
  startY: -175,
  auraOffsetY: -16,
} as const;

export const spawnEntrancePresentation = {
  enableSpawnEntrances: true,
  playSpawnEntranceEveryRound: false,
  entranceVfxMode: "random" as const,
  allowSameEntranceVfxForBothPlayers: true,
  introMs: 900,
  revealMs: 450,
  playerIntroGapMs: 400,
  revealEffectAlpha: 0.18,
  fallbackFlashMs: 520,
  fallbackColor: 0x65d9ff,
} as const;
