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
