export const stageWorldDefaults = {
  visibleWidth: 960,
  visibleHeight: 540,
  stageWidth: 2400,
  stageHeight: 540,
  edgePadding: 72,
  fighterGroundOffset: 18,
  maxFighterSeparation: 760,
  cameraFollowLerp: 0.14,
} as const;

export type StageBackgroundScaleMode = "tile" | "stretch" | "cover";
