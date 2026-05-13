import {
  SPECIAL_FRAME_DURATIONS_MS,
  SPECIAL_FRAME_MS,
  SPECIAL_IMPACT_HOLD_MS,
  SPECIAL_RECOVERY_MS,
} from "../config/attacks";

export type PoseName = "idle" | "punch" | "kick" | "hurt" | "block" | "ko";
export type SpecialEffectKind =
  | "super-flight"
  | "ground-smash"
  | "car-rush"
  | "fishing-trap"
  | "barbell"
  | "rasengan"
  | "mango-projectile"
  | "satellite-strike";
export type VfxKey =
  | "small-hit"
  | "big-hit"
  | "impact"
  | "electric-shield"
  | "explosion2"
  | "hyperspeed"
  | "charged";

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
  specialFrameCount?: number;
  projectileAsset?: {
    key: string;
    path: string;
    sourceFacing?: "left" | "right";
  };
  projectileSpawnFrame?: number;
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

export type VfxAssetManifest = {
  key: VfxKey;
  path: string;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  frameRate: number;
};

export type VfxConfig = {
  assetKey: VfxKey;
  displayWidth: number;
  displayHeight: number;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  flipWithFacing?: boolean;
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
const newFighterBase = (key: string) => `/assets/new_fighters/${key}`;
const defaultSpecialFrameDurations = [...SPECIAL_FRAME_DURATIONS_MS];
const defaultSpecialDurationMs = defaultSpecialFrameDurations.reduce((total, duration) => total + duration, 0);
const defaultSpecialHitAtMs = defaultSpecialFrameDurations.slice(0, 3).reduce((total, duration) => total + duration, 0);

function specialFrameNumbers(frameCount: number) {
  return Array.from({ length: frameCount }, (_value, index) => index + 1);
}

function frameDurationsForCount(frameCount: number) {
  return specialFrameNumbers(frameCount).map((_frame, index) => defaultSpecialFrameDurations[index] ?? SPECIAL_FRAME_MS);
}

function imagePose(
  fighterKey: string,
  poseName: PoseName,
  sourceFacing?: "left" | "right",
  basePath = fighterBase(fighterKey),
): PoseAsset {
  return {
    type: "image",
    key: `${fighterKey}-${poseName}`,
    path: `${basePath}/${fighterKey}_${poseName}.png`,
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
  frameBasePath = `${fighterBase(fighterKey)}/${folder}`,
  specialFrameCount = 5,
): SpecialAssetManifest {
  const frameDurationsMs = frameDurationsForCount(specialFrameCount);
  return {
    name,
    effect,
    specialBaseFacing,
    asset: {
      key: `${fighterKey}-special`,
      path: `${fighterBase(fighterKey)}/special_spritesheet.png`,
    },
    frameAssets: specialFrameNumbers(specialFrameCount).map((frame) => ({
      key: `${fighterKey}-special-frame-${frame}`,
      path: `${frameBasePath}/frame_${frame}.png`,
    })),
    specialFrameCount,
    frameDurationsMs,
    impactFrame: 4,
    impactHoldMs: SPECIAL_IMPACT_HOLD_MS,
    recoveryMs: SPECIAL_RECOVERY_MS,
    durationMs: frameDurationsMs.reduce((total, duration) => total + duration, 0),
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
      special: ["/assets/character_sfx/esleigue/superman-intro.mp3", `${fighterBase("esleigue")}/bananasaynomre.ogg`],
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
      special: ["/assets/character_sfx/vince/special_sound.mp3"],
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
      ...framedSpecial("mark", "Rasengan", "rasengan", "special_mark", 260, 380, false, "right", "/assets/vfx/mark_special"),
    },
    voices: {
      attack: [`${fighterBase("mark")}/lizzzz.m4a`],
      hurt: [`${fighterBase("mark")}/lizzzz.m4a`],
      ko: [`${fighterBase("mark")}/lizzzz.m4a`],
      special: [`${fighterBase("mark")}/lizzzz.m4a`],
    },
  },
  {
    key: "hernandez",
    displayName: "Hernandez",
    baseFacing: "left",
    portrait: {
      key: "hernandez-portrait",
      path: `${newFighterBase("hernandez")}/portrait.png`,
      sourceFacing: "right",
    },
    scale: 1,
    body: {
      width: 96,
      height: 194,
      drawWidth: 218,
      drawHeight: 218,
    },
    poses: {
      idle: imagePose("hernandez", "idle", "left", newFighterBase("hernandez")),
      punch: imagePose("hernandez", "punch", "left", newFighterBase("hernandez")),
      kick: imagePose("hernandez", "kick", "left", newFighterBase("hernandez")),
      hurt: imagePose("hernandez", "hurt", "left", newFighterBase("hernandez")),
      block: imagePose("hernandez", "block", "left", newFighterBase("hernandez")),
      ko: imagePose("hernandez", "ko", "left", newFighterBase("hernandez")),
    },
    special: {
      ...framedSpecial(
        "hernandez",
        "Mangoe Namo",
        "mango-projectile",
        "special",
        880,
        360,
        false,
        "right",
        `${newFighterBase("hernandez")}/special`,
        6,
      ),
      impactFrame: 5,
      projectileSpawnFrame: 5,
      hitAtMs: 2700,
      projectileAsset: {
        key: "hernandez-mango-projectile",
        path: `${newFighterBase("hernandez")}/special/mango_projectile.png`,
        sourceFacing: "right",
      },
    },
    voices: {
      attack: [],
      hurt: [],
      ko: [],
      special: [`${newFighterBase("hernandez")}/special/wag-kang-bastos-reloaded.mp3`],
    },
  },
  {
    key: "gerald",
    displayName: "Gerald",
    baseFacing: "left",
    portrait: {
      key: "gerald-portrait",
      path: `${newFighterBase("gerald")}/portrait.png`,
      sourceFacing: "right",
    },
    scale: 1,
    body: {
      width: 96,
      height: 194,
      drawWidth: 218,
      drawHeight: 218,
    },
    poses: {
      idle: imagePose("gerald", "idle", "left", newFighterBase("gerald")),
      punch: imagePose("gerald", "punch", "left", newFighterBase("gerald")),
      kick: imagePose("gerald", "kick", "left", newFighterBase("gerald")),
      hurt: imagePose("gerald", "hurt", "left", newFighterBase("gerald")),
      block: imagePose("gerald", "block", "left", newFighterBase("gerald")),
      ko: imagePose("gerald", "ko", "left", newFighterBase("gerald")),
    },
    special: {
      ...framedSpecial(
        "gerald",
        "Supa Hacka",
        "satellite-strike",
        "special",
        920,
        420,
        true,
        "right",
        `${newFighterBase("gerald")}/special`,
      ),
      projectileAsset: {
        key: "gerald-satellite",
        path: `${newFighterBase("gerald")}/special/satellite.png`,
        sourceFacing: "right",
      },
    },
    voices: {
      attack: [],
      hurt: [],
      ko: [],
      special: [`${newFighterBase("gerald")}/special/gerald_specialsound.mp3`],
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

export const extraSfxManifest = {
  karloExplosion: { key: "sfx-karlo-explosion", path: "/assets/fighters/karlo/special_karlo/explosion.mp3" },
  geraldExplosion: { key: "sfx-gerald-explosion", path: "/assets/new_fighters/gerald/special/explosion.mp3" },
  idjaoCarCrash: { key: "sfx-idjao-car-crash", path: "/assets/character_sfx/idjao/car_crash.mp3" },
  selectionComplete: [
    { key: "sfx-selection-complete-1", path: "/assets/sfx/selection_complete/complete_1.mp3" },
    { key: "sfx-selection-complete-2", path: "/assets/sfx/selection_complete/complete_2.mp3" },
  ],
  roundOver: [
    { key: "sfx-round-over-1", path: "/assets/sfx/round_over/round_over_1.mp3" },
    { key: "sfx-round-over-2", path: "/assets/sfx/round_over/round_over_2.mp3" },
    { key: "sfx-round-over-3", path: "/assets/sfx/round_over/round_over_3.mp3" },
  ],
} as const;

export const vfxAssetManifests: VfxAssetManifest[] = [
  {
    key: "small-hit",
    path: "/assets/vfx/free_pack/small_hit.png",
    frameWidth: 532,
    frameHeight: 528,
    frames: 30,
    frameRate: 30,
  },
  {
    key: "big-hit",
    path: "/assets/vfx/free_pack/big_hit.png",
    frameWidth: 557,
    frameHeight: 553,
    frames: 30,
    frameRate: 30,
  },
  {
    key: "impact",
    path: "/assets/vfx/free_pack/impact.png",
    frameWidth: 291,
    frameHeight: 301,
    frames: 30,
    frameRate: 30,
  },
  {
    key: "electric-shield",
    path: "/assets/vfx/free_pack/electric_shield.png",
    frameWidth: 265,
    frameHeight: 265,
    frames: 30,
    frameRate: 30,
  },
  {
    key: "explosion2",
    path: "/assets/vfx/free_pack/explosion2.png",
    frameWidth: 355,
    frameHeight: 355,
    frames: 30,
    frameRate: 30,
  },
  {
    key: "hyperspeed",
    path: "/assets/vfx/free_pack/hyperspeed.png",
    frameWidth: 517,
    frameHeight: 515,
    frames: 30,
    frameRate: 30,
  },
  {
    key: "charged",
    path: "/assets/vfx/free_pack/charged.png",
    frameWidth: 321,
    frameHeight: 371,
    frames: 42,
    frameRate: 30,
  },
];

export const attackVfxManifest: Record<"punch" | "kick" | "block", VfxConfig> = {
  punch: { assetKey: "small-hit", displayWidth: 108, displayHeight: 108, offsetY: -4, flipWithFacing: true },
  kick: { assetKey: "big-hit", displayWidth: 138, displayHeight: 136, offsetY: 6, flipWithFacing: true },
  block: { assetKey: "electric-shield", displayWidth: 116, displayHeight: 116, offsetY: -4 },
};

export const specialVfxManifest: Record<SpecialEffectKind, VfxConfig> = {
  "super-flight": { assetKey: "hyperspeed", displayWidth: 220, displayHeight: 180, offsetY: -18, flipWithFacing: true },
  "ground-smash": { assetKey: "explosion2", displayWidth: 230, displayHeight: 210, offsetY: 22 },
  "car-rush": { assetKey: "impact", displayWidth: 180, displayHeight: 150, offsetY: -8, flipWithFacing: true },
  "fishing-trap": { assetKey: "impact", displayWidth: 138, displayHeight: 120, offsetY: -12, flipWithFacing: true },
  barbell: { assetKey: "big-hit", displayWidth: 190, displayHeight: 184, offsetY: 0, flipWithFacing: true },
  rasengan: { assetKey: "charged", displayWidth: 172, displayHeight: 196, offsetY: -14, flipWithFacing: true },
  "mango-projectile": { assetKey: "charged", displayWidth: 150, displayHeight: 170, offsetY: -20, flipWithFacing: true },
  "satellite-strike": { assetKey: "explosion2", displayWidth: 240, displayHeight: 230, offsetY: 26 },
};

export function allPoseAssets(): PoseAsset[] {
  return fighterManifests.flatMap((fighter) => Object.values(fighter.poses));
}

export function allSpecialAssets(): { key: string; path: string }[] {
  return fighterManifests.flatMap((fighter) => [
    fighter.special.asset,
    ...(fighter.special.frameAssets ?? []),
    ...(fighter.special.projectileAsset ? [fighter.special.projectileAsset] : []),
  ]);
}

export function allPortraitAssets(): { key: string; path: string; sourceFacing?: "left" | "right" }[] {
  return fighterManifests.map((fighter) => fighter.portrait);
}

export function allExtraSfxAssets(): { key: string; path: string }[] {
  return [
    extraSfxManifest.karloExplosion,
    extraSfxManifest.geraldExplosion,
    extraSfxManifest.idjaoCarCrash,
    ...extraSfxManifest.selectionComplete,
    ...extraSfxManifest.roundOver,
  ];
}

export function allVfxAssets(): VfxAssetManifest[] {
  return vfxAssetManifests;
}

export function getVfxAsset(key: VfxKey): VfxAssetManifest | undefined {
  return vfxAssetManifests.find((asset) => asset.key === key);
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
