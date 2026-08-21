import {
  type AttackName,
  SPECIAL_FRAME_DURATIONS_MS,
  SPECIAL_FRAME_MS,
  SPECIAL_IMPACT_HOLD_MS,
  SPECIAL_RECOVERY_MS,
} from "../config/attacks";

export type PoseName = "idle" | "jump" | "punch" | "punch2" | "kick" | "hurt" | "block" | "ko";
export type SpecialEffectKind =
  | "super-flight"
  | "ground-smash"
  | "car-rush"
  | "fishing-trap"
  | "barbell"
  | "rasengan"
  | "kamehameha"
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
  beamAsset?: {
    key: string;
    path: string;
    sourceFacing?: "left" | "right";
  };
  chargeAsset?: {
    key: string;
    path: string;
    sourceFacing?: "left" | "right";
    displayWidth?: number;
    displayHeight?: number;
    offsetX?: number;
    offsetY?: number;
    offsetXByFrame?: number[];
    offsetYByFrame?: number[];
  };
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
  /** Preview-only fighters remain visible in character select but cannot enter a round. */
  selectable?: boolean;
  baseFacing: "left" | "right";
  jumpBaseFacing?: "left" | "right";
  movementAnimation?: MovementAnimationMode;
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
  frameAnimations?: Partial<Record<MovementAnimationName, FrameAnimationManifest>>;
  throw?: ThrowAssetManifest;
  special: SpecialAssetManifest;
  voices: {
    attack: string[];
    hurt: string[];
    ko: string[];
    special: string[];
  };
};

export type MovementAnimationName = "idle" | "walk" | "dash" | "backdash";
export type MovementAnimationMode = "walk" | "dash" | "static";

export type FrameAnimationManifest = {
  key: string;
  frames: {
    key: string;
    path: string;
    sourceFacing?: "left" | "right";
  }[];
  frameMs: number;
};

export type ThrowAssetManifest = {
  frames: {
    key: string;
    path: string;
    sourceFacing?: "left" | "right";
  }[];
  fallback: {
    key: string;
    path: string;
    sourceFacing?: "left" | "right";
  };
};

export type StageAssetManifest = {
  key: string;
  displayName: string;
  path: string;
  floorY?: number;
  usesDomBackground?: boolean;
};

export type MusicTrackManifest = {
  key: string;
  displayName: string;
  path: string;
};

export type MenuLightningAssetManifest = {
  key: string;
  path: string;
};

export type RefereeIntroManifest = {
  frames: {
    key: string;
    path: string;
  }[];
  aura: {
    path: string;
  };
  audio?: {
    key: string;
    path: string;
  };
};

export type EntranceVfxManifest = {
  key: string;
  displayName: string;
  path: string;
  width: number;
  height: number;
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
    floorY: 502,
  },
  {
    key: "tanaun-church",
    displayName: "Tanauan Church",
    path: "/assets/stage/tanaunchurch.jpg",
    floorY: 502,
  },
  {
    key: "dragon-temple",
    displayName: "Dragon Temple",
    path: "/assets/stages/Dragon Temple.gif",
    floorY: 488,
    usesDomBackground: true,
  },
  {
    key: "nigh-forest",
    displayName: "Nigh Forest",
    path: "/assets/stages/Nigh Forest.gif",
    floorY: 488,
    usesDomBackground: true,
  },
  {
    key: "samurai-stage",
    displayName: "Samurai Stage",
    path: "/assets/stages/Samurai Stage.gif",
    floorY: 488,
    usesDomBackground: true,
  },
];

export const menuMusicManifest = {
  key: "music-menu",
  path: "/assets/music/menu.mp3",
} as const;

export const menuMusicTrackManifests: MusicTrackManifest[] = [
  {
    key: "music-taguro-song",
    displayName: "Taguro Song",
    path: "/assets/music/ptangona-remix.mp3",
  },
  {
    key: "music-menu",
    displayName: "Amats",
    path: "/assets/music/menu.mp3",
  },
];

export const menuLightningManifests: MenuLightningAssetManifest[] = [
  { key: "menu-lightning-1", path: "/assets/vfx/lightning/lightning_01.gif" },
  { key: "menu-lightning-2", path: "/assets/vfx/lightning/lightning_02.gif" },
  { key: "menu-lightning-3", path: "/assets/vfx/lightning/lightning_03.gif" },
  { key: "menu-lightning-4", path: "/assets/vfx/lightning/lightning_04.gif" },
];

const fighterBase = (key: string) => `/assets/fighters/${key}`;
const newFighterBase = (key: string) => `/assets/new_fighters/${key}`;
const defaultSpecialFrameDurations = [...SPECIAL_FRAME_DURATIONS_MS];
const defaultSpecialDurationMs = defaultSpecialFrameDurations.reduce((total, duration) => total + duration, 0);
const defaultSpecialHitAtMs = defaultSpecialFrameDurations.slice(0, 3).reduce((total, duration) => total + duration, 0);
const markKamehamehaFrameDurationsMs = [700, 2200, 7100, 4000, 500] as const;
const markKamehamehaReleaseMs = markKamehamehaFrameDurationsMs.slice(0, 3).reduce((total, duration) => total + duration, 0);

function specialFrameNumbers(frameCount: number) {
  return Array.from({ length: frameCount }, (_value, index) => index + 1);
}

function frameDurationsForCount(frameCount: number) {
  return specialFrameNumbers(frameCount).map((_frame, index) => defaultSpecialFrameDurations[index] ?? SPECIAL_FRAME_MS);
}

function lockedPreviewFighter(
  key: string,
  displayName: string,
  portraitPath: string,
): FighterAssetManifest {
  const previewPose = (poseName: PoseName): PoseAsset => ({
    type: "image",
    key: `${key}-locked-${poseName}`,
    path: portraitPath,
  });

  return {
    key,
    displayName,
    selectable: false,
    baseFacing: "left",
    portrait: {
      key: `${key}-portrait`,
      path: portraitPath,
    },
    scale: 1,
    body: { width: 92, height: 190, drawWidth: 206, drawHeight: 206 },
    poses: {
      idle: previewPose("idle"),
      jump: previewPose("jump"),
      punch: previewPose("punch"),
      punch2: previewPose("punch2"),
      kick: previewPose("kick"),
      hurt: previewPose("hurt"),
      block: previewPose("block"),
      ko: previewPose("ko"),
    },
    special: {
      name: "Coming Soon",
      effect: "ground-smash",
      asset: { key: `${key}-locked-special`, path: portraitPath },
      durationMs: 0,
      hitAtMs: 0,
      range: 0,
      height: 0,
      knockback: 0,
    },
    voices: { attack: [], hurt: [], ko: [], special: [] },
  };
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

function exactImagePose(
  fighterKey: string,
  poseName: PoseName,
  path: string,
  sourceFacing?: "left" | "right",
): PoseAsset {
  return {
    type: "image",
    key: `${fighterKey}-${poseName}`,
    path,
    sourceFacing,
  };
}

function frameAnimation(
  fighterKey: string,
  animationKey: MovementAnimationName,
  frameCount: number,
  frameMs: number,
  folder: string,
  filenamePrefix: string,
  sourceFacing?: "left" | "right",
  basePath = fighterBase(fighterKey),
): FrameAnimationManifest {
  return {
    key: `${fighterKey}-${animationKey}`,
    frameMs,
    frames: specialFrameNumbers(frameCount).map((frame) => ({
      key: `${fighterKey}-${animationKey}-frame-${frame}`,
      path: `${basePath}/${folder}/${filenamePrefix}_${String(frame).padStart(2, "0")}.png`,
      sourceFacing,
    })),
  };
}

function frameAnimationFromFiles(
  fighterKey: string,
  animationKey: MovementAnimationName,
  frameMs: number,
  folder: string,
  filenames: string[],
  sourceFacing?: "left" | "right",
  basePath = fighterBase(fighterKey),
): FrameAnimationManifest {
  return {
    key: `${fighterKey}-${animationKey}`,
    frameMs,
    frames: filenames.map((filename, index) => ({
      key: `${fighterKey}-${animationKey}-frame-${index + 1}`,
      path: `${basePath}/${folder}/${filename}`,
      sourceFacing,
    })),
  };
}

function throwFrames(
  fighterKey: string,
  sourceFacing: "left" | "right",
  basePath = fighterBase(fighterKey),
  filenames = ["frame_01.png", "frame_02.png", "frame_03.png"],
): ThrowAssetManifest {
  return {
    frames: filenames.map((filename, index) => ({
      key: `${fighterKey}-throw-frame-${index + 1}`,
      path: `${basePath}/throw/${filename}`,
      sourceFacing,
    })),
    fallback: {
      key: `${fighterKey}-throw-fallback`,
      path: `${basePath}/throw.png`,
      sourceFacing,
    },
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
  frameFilePrefix = "frame_",
  frameFilePad = 0,
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
      path: `${frameBasePath}/${frameFilePrefix}${String(frame).padStart(frameFilePad, "0")}.png`,
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
    jumpBaseFacing: "left",
    movementAnimation: "walk",
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
      jump: exactImagePose("esleigue", "jump", `${fighterBase("esleigue")}/jump.png`, "right"),
      punch: exactImagePose("esleigue", "punch", `${fighterBase("esleigue")}/esleigue_punch.png`, "right"),
      punch2: exactImagePose("esleigue", "punch2", `${fighterBase("esleigue")}/punch2.png`, "right"),
      kick: imagePose("esleigue", "kick", "left"),
      hurt: imagePose("esleigue", "hurt"),
      block: imagePose("esleigue", "block"),
      ko: imagePose("esleigue", "ko"),
    },
    frameAnimations: {
      idle: frameAnimation("esleigue", "idle", 4, 250, "idle_frames", "esleigue_idle", "right"),
      walk: frameAnimation("esleigue", "walk", 8, 115, "walk_frames", "esleigue_walk", "right"),
    },
    throw: throwFrames("esleigue", "right"),
    special: framedSpecial("esleigue", "Super Esleigue", "super-flight", "special_esleigue", 780, 360, false, "right"),
    voices: {
      attack: [`${fighterBase("esleigue")}/bananasaynomre.ogg`],
      hurt: [`${fighterBase("esleigue")}/monkey.m4a`],
      ko: [`${fighterBase("esleigue")}/monkey.m4a`],
      special: [
        `${fighterBase("esleigue")}/special_esleigue/mahirap maging pogi cut.MP3`,
        "/assets/character_sfx/esleigue/superman-intro.mp3",
        `${fighterBase("esleigue")}/bananasaynomre.ogg`,
      ],
    },
  },
  {
    key: "karlo",
    displayName: "Karlo",
    baseFacing: "left",
    jumpBaseFacing: "left",
    movementAnimation: "walk",
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
      jump: exactImagePose("karlo", "jump", `${fighterBase("karlo")}/jump.png`),
      punch: imagePose("karlo", "punch", "right"),
      punch2: exactImagePose("karlo", "punch2", `${fighterBase("karlo")}/punch2.png`, "right"),
      kick: imagePose("karlo", "kick"),
      hurt: imagePose("karlo", "hurt"),
      block: imagePose("karlo", "block"),
      ko: imagePose("karlo", "ko"),
    },
    frameAnimations: {
      idle: frameAnimation("karlo", "idle", 4, 250, "idle_frames", "karlo_idle", "left"),
      walk: frameAnimation("karlo", "walk", 8, 115, "walk_frames", "karlo_walk", "left"),
    },
    throw: throwFrames("karlo", "right", fighterBase("karlo"), ["frame_01.png", "frame_02.png", "new_frame_3.png"]),
    special: framedSpecial("karlo", "Incredible Karlo", "ground-smash", "special_karlo", 190, 430, false, "right"),
    voices: {
      attack: [`${fighterBase("karlo")}/water food please.m4a`],
      hurt: [`${fighterBase("karlo")}/my friend help me.m4a`],
      ko: [`${fighterBase("karlo")}/my friend help me.m4a`],
      special: [`${fighterBase("karlo")}/special_karlo/energygap.MP3`, `${fighterBase("karlo")}/water food please.m4a`],
    },
  },
  {
    key: "idjao",
    displayName: "Idjao",
    baseFacing: "left",
    jumpBaseFacing: "left",
    movementAnimation: "walk",
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
      jump: exactImagePose("idjao", "jump", `${fighterBase("idjao")}/jump.png`),
      punch: imagePose("idjao", "punch"),
      punch2: exactImagePose("idjao", "punch2", `${fighterBase("idjao")}/punch2.png`, "right"),
      kick: imagePose("idjao", "kick"),
      hurt: imagePose("idjao", "hurt"),
      block: imagePose("idjao", "block"),
      ko: imagePose("idjao", "ko"),
    },
    frameAnimations: {
      idle: frameAnimation("idjao", "idle", 4, 250, "idle_frames", "idjao_idle"),
      walk: frameAnimation("idjao", "walk", 6, 120, "walk_frames", "idjao_walk"),
    },
    throw: throwFrames("idjao", "right"),
    special: framedSpecial("idjao", "Black Wigo Rush", "car-rush", "special_idjao", 860, 390, true, "right"),
    voices: {
      attack: [`${fighterBase("idjao")}/what after I saved u.m4a`],
      hurt: [`${fighterBase("idjao")}/what after I saved u.m4a`],
      ko: [`${fighterBase("idjao")}/special skill.m4a`],
      special: [`${fighterBase("idjao")}/special_idjao/alaska.mp3`, `${fighterBase("idjao")}/special skill.m4a`],
    },
  },
  {
    key: "dellomas",
    displayName: "Dellomas",
    baseFacing: "right",
    jumpBaseFacing: "left",
    movementAnimation: "walk",
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
      jump: exactImagePose("dellomas", "jump", `${fighterBase("dellomas")}/jump.png`),
      punch: imagePose("dellomas", "punch"),
      punch2: exactImagePose("dellomas", "punch2", `${fighterBase("dellomas")}/punch2.png`),
      kick: imagePose("dellomas", "kick"),
      hurt: hitPose("dellomas"),
      block: imagePose("dellomas", "block"),
      ko: imagePose("dellomas", "ko"),
    },
    frameAnimations: {
      idle: frameAnimation("dellomas", "idle", 4, 250, "idle_frames", "dellomas_idle", "left"),
      walk: frameAnimation("dellomas", "walk", 5, 120, "walk_frames", "dellomas_walk", "right"),
    },
    throw: throwFrames("dellomas", "right"),
    special: framedSpecial("dellomas", "Fishing Rod Trap", "fishing-trap", "dellomas_special", 360, 270, false, "right"),
    voices: {
      attack: [`${fighterBase("dellomas")}/F.  I judge For The Croc.m4a`],
      hurt: [`${fighterBase("dellomas")}/he hunt me (1).m4a`],
      ko: [`${fighterBase("dellomas")}/he hunt me (1).m4a`],
      special: [`${fighterBase("dellomas")}/dellomas_special/jumbohotdog.MP3`, `${fighterBase("dellomas")}/F.  I judge For The Croc.m4a`],
    },
  },
  {
    key: "vince",
    displayName: "Vince",
    baseFacing: "right",
    jumpBaseFacing: "left",
    movementAnimation: "dash",
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
      jump: exactImagePose("vince", "jump", `${fighterBase("vince")}/jump.png`),
      punch: imagePose("vince", "punch"),
      punch2: exactImagePose("vince", "punch2", `${fighterBase("vince")}/punch2.png`),
      kick: imagePose("vince", "kick"),
      hurt: hitPose("vince"),
      block: imagePose("vince", "block"),
      ko: imagePose("vince", "ko"),
    },
    frameAnimations: {
      idle: frameAnimation("vince", "idle", 4, 250, "idle_frames", "vince_idle", "right"),
      dash: frameAnimationFromFiles("vince", "dash", 90, "dash", ["frame_02.png", "frame_03.png", "frame_04.png"], "right"),
      backdash: frameAnimationFromFiles("vince", "backdash", 90, "backdash", ["frame_02.png", "frame_03.png", "frame_04.png"], "right"),
    },
    throw: throwFrames("vince", "right"),
    special: framedSpecial("vince", "One-Hand Barbell", "barbell", "special_vince", 190, 450, false, "right"),
    voices: {
      attack: [`${fighterBase("vince")}/five judges.m4a`],
      hurt: [`${fighterBase("vince")}/but wisdom speaks.m4a`],
      ko: [`${fighterBase("vince")}/but wisdom speaks.m4a`],
      special: [`${fighterBase("vince")}/special_vince/special_sound.mp3`, "/assets/character_sfx/vince/special_sound.mp3"],
    },
  },
  {
    key: "mark",
    displayName: "Mark",
    baseFacing: "right",
    jumpBaseFacing: "left",
    movementAnimation: "walk",
    portrait: {
      key: "mark-portrait",
      path: `${fighterBase("mark")}/use_this_new_portrait.png`,
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
      jump: exactImagePose("mark", "jump", `${fighterBase("mark")}/jump.png`),
      punch: imagePose("mark", "punch"),
      punch2: exactImagePose("mark", "punch2", `${fighterBase("mark")}/punch2.png`),
      kick: imagePose("mark", "kick"),
      hurt: imagePose("mark", "hurt"),
      block: imagePose("mark", "block"),
      ko: imagePose("mark", "ko"),
    },
    frameAnimations: {
      idle: frameAnimation("mark", "idle", 4, 250, "idle_frames", "mark_idle", "left"),
      walk: frameAnimation("mark", "walk", 4, 120, "idle_frames", "mark_idle", "left"),
    },
    throw: throwFrames("mark", "right"),
    special: {
      ...framedSpecial(
        "mark",
        "Kamehameha",
        "kamehameha",
        "special_mark",
        760,
        420,
        false,
        "right",
        `${fighterBase("mark")}/special`,
        5,
        "frame_",
        2,
      ),
      asset: {
        key: "mark-special",
        path: `${fighterBase("mark")}/special/frame_01.png`,
        sourceFacing: "right",
      },
      beamAsset: {
        key: "mark-kamehameha-beam",
        path: `${fighterBase("mark")}/special/kameha.gif`,
        sourceFacing: "right",
      },
      chargeAsset: {
        key: "mark-kamehameha-charge",
        path: `${fighterBase("mark")}/special/KAMEHAMEHA CHARGE.gif`,
        sourceFacing: "right",
        displayWidth: 165,
        displayHeight: 165,
        offsetX: -82,
        offsetY: -132,
        offsetXByFrame: [-82, -64, -82],
        offsetYByFrame: [-132, -138, -132],
      },
      frameDurationsMs: [...markKamehamehaFrameDurationsMs],
      durationMs: markKamehamehaFrameDurationsMs.reduce((total, duration) => total + duration, 0),
      hitAtMs: markKamehamehaReleaseMs,
      impactFrame: 4,
    },
    voices: {
      attack: [`${fighterBase("mark")}/lizzzz.m4a`],
      hurt: [`${fighterBase("mark")}/lizzzz.m4a`],
      ko: [`${fighterBase("mark")}/lizzzz.m4a`],
      special: [`${fighterBase("mark")}/special/goku_kamehameha_wave.mp3`],
    },
  },
  {
    key: "hernandez",
    displayName: "Hernandez",
    baseFacing: "left",
    jumpBaseFacing: "left",
    movementAnimation: "dash",
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
      jump: exactImagePose("hernandez", "jump", `${newFighterBase("hernandez")}/jump.png`, "left"),
      punch: imagePose("hernandez", "punch", "left", newFighterBase("hernandez")),
      punch2: exactImagePose("hernandez", "punch2", `${newFighterBase("hernandez")}/punch2.png`, "right"),
      kick: imagePose("hernandez", "kick", "left", newFighterBase("hernandez")),
      hurt: imagePose("hernandez", "hurt", "left", newFighterBase("hernandez")),
      block: imagePose("hernandez", "block", "left", newFighterBase("hernandez")),
      ko: imagePose("hernandez", "ko", "left", newFighterBase("hernandez")),
    },
    frameAnimations: {
      idle: frameAnimation("hernandez", "idle", 4, 250, "idle_frames", "hernandez_idle", "left", newFighterBase("hernandez")),
      dash: frameAnimationFromFiles(
        "hernandez",
        "dash",
        90,
        "dash",
        ["frame_02.png", "frame_03.png", "frame_04.png"],
        "right",
        newFighterBase("hernandez"),
      ),
      backdash: frameAnimationFromFiles(
        "hernandez",
        "backdash",
        90,
        "backdash",
        ["frame_02.png", "frame_03.png", "frame_04.png"],
        "right",
        newFighterBase("hernandez"),
      ),
    },
    throw: throwFrames("hernandez", "right", newFighterBase("hernandez")),
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
    jumpBaseFacing: "left",
    movementAnimation: "dash",
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
      jump: exactImagePose("gerald", "jump", `${newFighterBase("gerald")}/jump.png`, "left"),
      punch: imagePose("gerald", "punch", "left", newFighterBase("gerald")),
      punch2: exactImagePose("gerald", "punch2", `${newFighterBase("gerald")}/punch2.png`, "right"),
      kick: imagePose("gerald", "kick", "left", newFighterBase("gerald")),
      hurt: imagePose("gerald", "hurt", "left", newFighterBase("gerald")),
      block: imagePose("gerald", "block", "left", newFighterBase("gerald")),
      ko: imagePose("gerald", "ko", "left", newFighterBase("gerald")),
    },
    frameAnimations: {
      idle: frameAnimation("gerald", "idle", 4, 250, "idle_frames", "gerald_idle", "right", newFighterBase("gerald")),
      dash: frameAnimationFromFiles(
        "gerald",
        "dash",
        90,
        "dash",
        ["frame_02.png", "frame_03.png", "frame_04.png"],
        "right",
        newFighterBase("gerald"),
      ),
      backdash: frameAnimationFromFiles(
        "gerald",
        "backdash",
        90,
        "backdash",
        ["frame_02.png", "frame_03.png", "frame_04.png"],
        "right",
        newFighterBase("gerald"),
      ),
    },
    throw: throwFrames("gerald", "right", newFighterBase("gerald")),
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
  lockedPreviewFighter("joseph", "Joseph", "/assets/fighters/joseph/portrait.png"),
  lockedPreviewFighter("baldesco", "Baldesco", "/assets/fighters/baldesco/portrait.png"),
];

export const audioFormats = [".mp3", ".m4a", ".ogg"] as const;

export const sfxManifest = {
  punchHit: { key: "sfx-punch-hit", path: "/assets/sfx/punch_hit.mp3" },
  kickHit: { key: "sfx-kick-hit", path: "/assets/sfx/kick_hit.mp3" },
  whoosh: { key: "sfx-whoosh", path: "/assets/sfx/whoosh.mp3" },
  block: { key: "sfx-block", path: "/assets/sfx/block.mp3" },
  ko: { key: "sfx-ko", path: "/assets/sfx/ko_new.mp3" },
  menuSelect: { key: "sfx-menu-select", path: "/assets/sfx/menu_select.mp3" },
  roundStart: { key: "sfx-round-start", path: "/assets/sfx/round_start.mp3" },
} as const;

export const extraSfxManifest = {
  spawnEntrance: { key: "sfx-spawn-entrance", path: "/assets/sfx/tp_sound.mp3" },
  refereeAura: { key: "sfx-referee-aura", path: "/assets/referee/super_saiyan_aura.mp3" },
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
  roundAnnouncements: [
    { key: "sfx-round-announcement-1", path: "/assets/sfx/round_announcements/round_1.mp3" },
    { key: "sfx-round-announcement-2", path: "/assets/sfx/round_announcements/round_2.mp3" },
    { key: "sfx-round-announcement-3", path: "/assets/sfx/round_announcements/round_3.mp3" },
    { key: "sfx-round-announcement-4", path: "/assets/sfx/round_announcements/round_4.mp3" },
    { key: "sfx-round-announcement-5", path: "/assets/sfx/round_announcements/round_5.mp3" },
  ],
} as const;

export const refereeIntroManifest: RefereeIntroManifest = {
  frames: Array.from({ length: 6 }, (_value, index) => ({
    key: `referee-round-frame-${index + 1}`,
    path: `/assets/referee/frame_${index + 1}.png`,
  })),
  aura: {
    path: "/assets/referee/aura.gif",
  },
};

export const entranceVfxManifests: EntranceVfxManifest[] = [
  {
    key: "tornado-animation",
    displayName: "Tornado Animation",
    path: "/assets/entrance/tornado_animation.gif",
    width: 290,
    height: 380,
  },
  {
    key: "blue-portal",
    displayName: "Blue Portal",
    path: "/assets/entrance/blue_portal.gif",
    width: 230,
    height: 380,
  },
  {
    key: "purple-thunder-entrance",
    displayName: "Purple Thunder",
    path: "/assets/entrance/purplethunder_for_entrance.gif",
    width: 290,
    height: 380,
  },
];

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

export const attackVfxManifest: Record<AttackName | "block", VfxConfig> = {
  punch: { assetKey: "small-hit", displayWidth: 108, displayHeight: 108, offsetY: -4, flipWithFacing: true },
  punch2: { assetKey: "small-hit", displayWidth: 122, displayHeight: 118, offsetY: 4, flipWithFacing: true },
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
  kamehameha: { assetKey: "impact", displayWidth: 190, displayHeight: 156, offsetY: -12, flipWithFacing: true },
  "mango-projectile": { assetKey: "charged", displayWidth: 150, displayHeight: 170, offsetY: -20, flipWithFacing: true },
  "satellite-strike": { assetKey: "explosion2", displayWidth: 240, displayHeight: 230, offsetY: 26 },
};

export function allPoseAssets(): PoseAsset[] {
  return fighterManifests.filter(isFighterPlayable).flatMap((fighter) => Object.values(fighter.poses));
}

export function allFrameAnimationAssets(): { key: string; path: string; sourceFacing?: "left" | "right" }[] {
  return fighterManifests.filter(isFighterPlayable).flatMap((fighter) =>
    Object.values(fighter.frameAnimations ?? {}).flatMap((animation) => animation?.frames ?? []),
  );
}

export function allThrowAssets(): { key: string; path: string; sourceFacing?: "left" | "right" }[] {
  return fighterManifests
    .filter(isFighterPlayable)
    .flatMap((fighter) => (fighter.throw ? [...fighter.throw.frames, fighter.throw.fallback] : []));
}

export function allSpecialAssets(): { key: string; path: string }[] {
  return fighterManifests.filter(isFighterPlayable).flatMap((fighter) => [
    fighter.special.asset,
    ...(fighter.special.frameAssets ?? []),
    ...(fighter.special.projectileAsset ? [fighter.special.projectileAsset] : []),
  ]);
}

export function allPortraitAssets(): { key: string; path: string; sourceFacing?: "left" | "right" }[] {
  return fighterManifests.filter((fighter) => Boolean(fighter.portrait.path)).map((fighter) => fighter.portrait);
}

export function allExtraSfxAssets(): { key: string; path: string }[] {
  return [
    extraSfxManifest.spawnEntrance,
    extraSfxManifest.refereeAura,
    extraSfxManifest.karloExplosion,
    extraSfxManifest.geraldExplosion,
    extraSfxManifest.idjaoCarCrash,
    ...extraSfxManifest.selectionComplete,
    ...extraSfxManifest.roundOver,
    ...extraSfxManifest.roundAnnouncements,
  ];
}

export function allVfxAssets(): VfxAssetManifest[] {
  return vfxAssetManifests;
}

export function getVfxAsset(key: VfxKey): VfxAssetManifest | undefined {
  return vfxAssetManifests.find((asset) => asset.key === key);
}

export function getFighterManifest(key: string): FighterAssetManifest {
  return fighterManifests.find((fighter) => fighter.key === key && isFighterPlayable(fighter)) ?? fighterManifests.find(isFighterPlayable) ?? fighterManifests[0];
}

export function isFighterPlayable(fighter: FighterAssetManifest): boolean {
  return fighter.selectable !== false;
}

export function getStageManifest(key: string): StageAssetManifest {
  return stageManifests.find((stage) => stage.key === key) ?? stageManifests[0];
}

export function allVoicePaths(): string[] {
  return fighterManifests.filter(isFighterPlayable).flatMap((fighter) => [
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
  const sourceFacing =
    poseName === "jump"
      ? fighter.jumpBaseFacing ?? fighter.poses[poseName].sourceFacing ?? fighter.baseFacing
      : fighter.poses[poseName].sourceFacing ?? fighter.baseFacing;
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
