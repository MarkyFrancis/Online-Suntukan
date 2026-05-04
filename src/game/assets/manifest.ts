import {
  SPECIAL_FRAME_DURATIONS_MS,
  SPECIAL_IMPACT_HOLD_MS,
  SPECIAL_RECOVERY_MS,
} from "../config/attacks";

export type PoseName = "idle" | "punch" | "kick" | "hurt" | "block" | "ko";
export type SpecialEffectKind = "super-flight" | "ground-smash" | "car-rush" | "fishing-trap" | "barbell" | "rasengan";

export type PoseAsset =
  | {
      type: "image";
      key: string;
      path: string;
      sourceFacing?: "left" | "right";
    }
  | {
      type: "spritesheet";
      key: string;
      path: string;
      frameWidth: number;
      frameHeight: number;
      sourceFacing?: "left" | "right";
      animations: Record<string, { start: number; end: number; frameRate: number; repeat: number }>;
    };

export type SpecialAssetManifest = {
  name: string;
  effect: SpecialEffectKind;
  specialBaseFacing?: "left" | "right";
  asset: {
    key: string;
    path: string;
    sourceFacing?: "left" | "right";
  };
  frameAssets?: {
    key: string;
    path: string;
    sourceFacing?: "left" | "right";
  }[];
  frameDurationsMs?: number[];
  impactFrame?: number;
  impactHoldMs?: number;
  recoveryMs?: number;
  durationMs: number;
  hitAtMs: number;
  range: number;
  height: number;
  knockback: number;
  fullScreen?: boolean;
};

export type FighterAssetManifest = {
  key: string;
  displayName: string;
  baseFacing: "left" | "right";
  portrait: {
    key: string;
    path: string;
    sourceFacing?: "left" | "right";
  };
  scale: number;
  body: {
    width: number;
    height: number;
    drawWidth: number;
    drawHeight: number;
  };
  poses: Record<PoseName, PoseAsset>;
  special: SpecialAssetManifest;
  voices: {
    attack: string[];
    hurt: string[];
    ko: string[];
    special: string[];
  };
};

export type StageAssetManifest = {
  key: string;
  displayName: string;
  path: string;
};

export const stageManifests: StageAssetManifest[] = [
  {
    key: "bsu-cartoon",
    displayName: "BSU Cartoon",
    path: "/assets/stage/bsu_cartoon.jfif",
  },
  {
    key: "taal",
    displayName: "Taal",
    path: "/assets/stage/taal.jpg",
  },
  {
    key: "tanaun-church",
    displayName: "Tanauan Church",
    path: "/assets/stage/tanaunchurch.jpg",
  },
];

export const menuMusicManifest = {
  key: "music-menu",
  path: "/assets/music/menu.mp3",
} as const;

const fighterBase = (key: string) => `/assets/fighters/${key}`;
const defaultSpecialFrameDurations = [...SPECIAL_FRAME_DURATIONS_MS];
const defaultSpecialDurationMs = defaultSpecialFrameDurations.reduce((total, duration) => total + duration, 0);
const defaultSpecialHitAtMs = defaultSpecialFrameDurations.slice(0, 3).reduce((total, duration) => total + duration, 0);

function imagePose(fighterKey: string, poseName: PoseName, sourceFacing?: "left" | "right"): PoseAsset {
  return {
    type: "image",
    key: `${fighterKey}-${poseName}`,
    path: `${fighterBase(fighterKey)}/${fighterKey}_${poseName}.png`,
    sourceFacing,
  };
}

function hitPose(fighterKey: string): PoseAsset {
  return {
    type: "image",
    key: `${fighterKey}-hurt`,
    path: `${fighterBase(fighterKey)}/${fighterKey}_hit.png`,
  };
}

function special(
  fighterKey: string,
  name: string,
  effect: SpecialEffectKind,
  range: number,
  durationMs: number,
  hitAtMs: number,
  knockback: number,
  fullScreen = false,
): SpecialAssetManifest {
  return {
    name,
    effect,
    asset: {
      key: `${fighterKey}-special`,
      path: `${fighterBase(fighterKey)}/special_spritesheet.png`,
    },
    durationMs,
    hitAtMs,
    range,
    height: 170,
    knockback,
    fullScreen,
  };
}

function framedSpecial(
  fighterKey: string,
  name: string,
  effect: SpecialEffectKind,
  folder: string,
  range: number,
  knockback: number,
  fullScreen = false,
  specialBaseFacing?: "left" | "right",
): SpecialAssetManifest {
  return {
    name,
    effect,
    specialBaseFacing,
    asset: {
      key: `${fighterKey}-special`,
      path: `${fighterBase(fighterKey)}/special_spritesheet.png`,
    },
    frameAssets: [1, 2, 3, 4, 5].map((frame) => ({
      key: `${fighterKey}-special-frame-${frame}`,
      path: `${fighterBase(fighterKey)}/${folder}/frame_${frame}.png`,
    })),
    frameDurationsMs: defaultSpecialFrameDurations,
    impactFrame: 4,
    impactHoldMs: SPECIAL_IMPACT_HOLD_MS,
    recoveryMs: SPECIAL_RECOVERY_MS,
    durationMs: defaultSpecialDurationMs,
    hitAtMs: defaultSpecialHitAtMs,
    range,
    height: 170,
    knockback,
    fullScreen,
  };
}

export const fighterManifests: FighterAssetManifest[] = [
  {
    key: "esleigue",
    displayName: "Esleigue",
    baseFacing: "right",
    portrait: {
      key: "esleigue-portrait",
      path: `${fighterBase("esleigue")}/portrait.png`,
      sourceFacing: "right",
    },
    scale: 1,
    body: {
      width: 92,
      height: 190,
      drawWidth: 206,
      drawHeight: 206,
    },
    poses: {
      idle: imagePose("esleigue", "idle", "right"),
      punch: imagePose("esleigue", "punch", "right"),
      kick: imagePose("esleigue", "kick", "left"),
      hurt: imagePose("esleigue", "hurt"),
      block: imagePose("esleigue", "block"),
      ko: imagePose("esleigue", "ko"),
    },
    special: framedSpecial("esleigue", "Super Esleigue", "super-flight", "special_esleigue", 520, 360, false, "right"),
    voices: {
      attack: [`${fighterBase("esleigue")}/bananasaynomre.ogg`],
      hurt: [`${fighterBase("esleigue")}/monkey.m4a`],
      ko: [`${fighterBase("esleigue")}/monkey.m4a`],
      special: [`${fighterBase("esleigue")}/bananasaynomre.ogg`],
    },
  },
  {
    key: "karlo",
    displayName: "Karlo",
    baseFacing: "left",
    portrait: {
      key: "karlo-portrait",
      path: `${fighterBase("karlo")}/portrait.png`,
    },
    scale: 1,
    body: {
      width: 96,
      height: 202,
      drawWidth: 218,
      drawHeight: 218,
    },
    poses: {
      idle: imagePose("karlo", "idle"),
      punch: imagePose("karlo", "punch", "right"),
      kick: imagePose("karlo", "kick"),
      hurt: imagePose("karlo", "hurt"),
      block: imagePose("karlo", "block"),
      ko: imagePose("karlo", "ko"),
    },
    special: framedSpecial("karlo", "Incredible Karlo", "ground-smash", "special_karlo", 190, 430, false, "right"),
    voices: {
      attack: [`${fighterBase("karlo")}/water food please.m4a`],
      hurt: [`${fighterBase("karlo")}/my friend help me.m4a`],
      ko: [`${fighterBase("karlo")}/my friend help me.m4a`],
      special: [`${fighterBase("karlo")}/water food please.m4a`],
    },
  },
  {
    key: "idjao",
    displayName: "Idjao",
    baseFacing: "left",
    portrait: {
      key: "idjao-portrait",
      path: `${fighterBase("idjao")}/portrait.png`,
    },
    scale: 1,
    body: {
      width: 94,
      height: 190,
      drawWidth: 212,
      drawHeight: 212,
    },
    poses: {
      idle: imagePose("idjao", "idle"),
      punch: imagePose("idjao", "punch"),
      kick: imagePose("idjao", "kick"),
      hurt: imagePose("idjao", "hurt"),
      block: imagePose("idjao", "block"),
      ko: imagePose("idjao", "ko"),
    },
    special: framedSpecial("idjao", "Black Wigo Rush", "car-rush", "special_idjao", 860, 390, true, "right"),
    voices: {
      attack: [`${fighterBase("idjao")}/what after I saved u.m4a`],
      hurt: [`${fighterBase("idjao")}/what after I saved u.m4a`],
      ko: [`${fighterBase("idjao")}/special skill.m4a`],
      special: [`${fighterBase("idjao")}/special skill.m4a`],
    },
  },
  {
    key: "dellomas",
    displayName: "Dellomas",
    baseFacing: "right",
    portrait: {
      key: "dellomas-portrait",
      path: `${fighterBase("dellomas")}/portrait.png`,
    },
    scale: 1,
    body: {
      width: 94,
      height: 190,
      drawWidth: 212,
      drawHeight: 212,
    },
    poses: {
      idle: imagePose("dellomas", "idle"),
      punch: imagePose("dellomas", "punch"),
      kick: imagePose("dellomas", "kick"),
      hurt: hitPose("dellomas"),
      block: imagePose("dellomas", "block"),
      ko: imagePose("dellomas", "ko"),
    },
    special: framedSpecial("dellomas", "Fishing Rod Trap", "fishing-trap", "dellomas_special", 360, 270, false, "right"),
    voices: {
      attack: [`${fighterBase("dellomas")}/F.  I judge For The Croc.m4a`],
      hurt: [`${fighterBase("dellomas")}/he hunt me (1).m4a`],
      ko: [`${fighterBase("dellomas")}/he hunt me (1).m4a`],
      special: [`${fighterBase("dellomas")}/F.  I judge For The Croc.m4a`],
    },
  },
  {
    key: "vince",
    displayName: "Vince",
    baseFacing: "right",
    portrait: {
      key: "vince-portrait",
      path: `${fighterBase("vince")}/portrait.png`,
    },
    scale: 1,
    body: {
      width: 98,
      height: 194,
      drawWidth: 218,
      drawHeight: 218,
    },
    poses: {
      idle: imagePose("vince", "idle"),
      punch: imagePose("vince", "punch"),
      kick: imagePose("vince", "kick"),
      hurt: hitPose("vince"),
      block: imagePose("vince", "block"),
      ko: imagePose("vince", "ko"),
    },
    special: framedSpecial("vince", "One-Hand Barbell", "barbell", "special_vince", 190, 450, false, "right"),
    voices: {
      attack: [`${fighterBase("vince")}/five judges.m4a`],
      hurt: [`${fighterBase("vince")}/but wisdom speaks.m4a`],
      ko: [`${fighterBase("vince")}/but wisdom speaks.m4a`],
      special: [`${fighterBase("vince")}/five judges.m4a`],
    },
  },
  {
    key: "mark",
    displayName: "Mark",
    baseFacing: "right",
    portrait: {
      key: "mark-portrait",
      path: `${fighterBase("mark")}/portrait.png`,
    },
    scale: 1,
    body: {
      width: 94,
      height: 190,
      drawWidth: 212,
      drawHeight: 212,
    },
    poses: {
      idle: imagePose("mark", "idle"),
      punch: imagePose("mark", "punch"),
      kick: imagePose("mark", "kick"),
      hurt: imagePose("mark", "hurt"),
      block: imagePose("mark", "block"),
      ko: imagePose("mark", "ko"),
    },
    special: {
      ...special("mark", "Rasengan", "rasengan", 260, defaultSpecialDurationMs, defaultSpecialHitAtMs, 380),
      impactHoldMs: SPECIAL_IMPACT_HOLD_MS,
      recoveryMs: SPECIAL_RECOVERY_MS,
    },
    voices: {
      attack: [`${fighterBase("mark")}/lizzzz.m4a`],
      hurt: [`${fighterBase("mark")}/lizzzz.m4a`],
      ko: [`${fighterBase("mark")}/lizzzz.m4a`],
      special: [`${fighterBase("mark")}/lizzzz.m4a`],
    },
  },
];

export const audioFormats = [".mp3", ".m4a", ".ogg"] as const;

export const sfxManifest = {
  punchHit: { key: "sfx-punch-hit", path: "/assets/sfx/punch_hit.mp3" },
  kickHit: { key: "sfx-kick-hit", path: "/assets/sfx/kick_hit.mp3" },
  whoosh: { key: "sfx-whoosh", path: "/assets/sfx/whoosh.mp3" },
  block: { key: "sfx-block", path: "/assets/sfx/block.mp3" },
  ko: { key: "sfx-ko", path: "/assets/sfx/ko.mp3" },
  menuSelect: { key: "sfx-menu-select", path: "/assets/sfx/menu_select.mp3" },
  roundStart: { key: "sfx-round-start", path: "/assets/sfx/round_start.mp3" },
} as const;

export function allPoseAssets(): PoseAsset[] {
  return fighterManifests.flatMap((fighter) => Object.values(fighter.poses));
}

export function allSpecialAssets(): { key: string; path: string }[] {
  return fighterManifests.flatMap((fighter) => [
    fighter.special.asset,
    ...(fighter.special.frameAssets ?? []),
  ]);
}

export function allPortraitAssets(): { key: string; path: string; sourceFacing?: "left" | "right" }[] {
  return fighterManifests.map((fighter) => fighter.portrait);
}

export function getFighterManifest(key: string): FighterAssetManifest {
  return fighterManifests.find((fighter) => fighter.key === key) ?? fighterManifests[0];
}

export function getStageManifest(key: string): StageAssetManifest {
  return stageManifests.find((stage) => stage.key === key) ?? stageManifests[0];
}

export function allVoicePaths(): string[] {
  return fighterManifests.flatMap((fighter) => [
    ...fighter.voices.attack,
    ...fighter.voices.hurt,
    ...fighter.voices.ko,
    ...fighter.voices.special,
  ]);
}

export function shouldFlipFighterAsset(
  fighter: FighterAssetManifest,
  poseName: PoseName,
  desiredFacing: -1 | 1,
): boolean {
  const sourceFacing = fighter.poses[poseName].sourceFacing ?? fighter.baseFacing;
  const unflippedFacing = sourceFacing === "right" ? 1 : -1;
  return desiredFacing !== unflippedFacing;
}

export function shouldFlipSpecialAsset(fighter: FighterAssetManifest, desiredFacing: -1 | 1): boolean {
  const sourceFacing = fighter.special.asset.sourceFacing ?? fighter.special.specialBaseFacing ?? fighter.baseFacing;
  const unflippedFacing = sourceFacing === "right" ? 1 : -1;
  return desiredFacing !== unflippedFacing;
}

export function shouldFlipSpecialFrameAsset(
  fighter: FighterAssetManifest,
  frameIndex: number,
  desiredFacing: -1 | 1,
): boolean {
  const frame = fighter.special.frameAssets?.[frameIndex];
  const sourceFacing =
    frame?.sourceFacing ?? fighter.special.asset.sourceFacing ?? fighter.special.specialBaseFacing ?? fighter.baseFacing;
  const unflippedFacing = sourceFacing === "right" ? 1 : -1;
  return desiredFacing !== unflippedFacing;
}
