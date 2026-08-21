export type AttackName = "punch" | "punch2" | "kick";

export const SPECIAL_DAMAGE = 38;
export const SPECIAL_BLOCK_DAMAGE = 12;
export const SPECIAL_HIT_STUN_MS = 700;
export const SPECIAL_BLOCK_STUN_MS = 360;
export const SPECIAL_METER_MAX = 100;
export const SPECIAL_METER_TIME_GAIN_PER_SECOND = 2.2;
export const SPECIAL_METER_DEAL_GAIN = 16;
export const SPECIAL_METER_BLOCKED_DEAL_GAIN = 8;
export const SPECIAL_METER_TAKE_GAIN = 12;
export const SPECIAL_METER_BLOCK_TAKE_GAIN = 7;
export const SPECIAL_INTRO_PAUSE_MS = 800;
export const SPECIAL_NAME_DISPLAY_MS = 900;
export const SPECIAL_ANIMATION_FRAME_RATE = 6;
export const SPECIAL_RECOVERY_MS = 850;
export const SPECIAL_IMPACT_HOLD_MS = 300;
export const SPECIAL_FRAME_DURATIONS_MS = [450, 500, 550, 650, 450] as const;
export const SPECIAL_FRAME_MS = 500;
export const HIT_STUN_REHIT_REDUCTION = 0.45;
export const HIT_STUN_REHIT_THRESHOLD_MS = 90;
export const PUNCH2_COMBO_WINDOW_MS = 350;

// Throws are intentionally close-range and block-breaking, but leave a clear whiff window.
export const THROW_RANGE = 60;
export const THROW_DAMAGE = 18;
export const THROW_STARTUP_MS = 180;
export const THROW_FRAME_MS = 300;
// Throw impact VFX overlaps the slide instead of pausing the defender in place.
export const THROW_IMPACT_HOLD_MS = 0;
export const THROW_RECOVERY_MS = 760;
export const THROW_HITSTUN_MS = 650;
export const THROW_KNOCKBACK = 230;
export const THROW_COOLDOWN_MS = 900;

export type AttackConfig = {
  name: AttackName;
  damage: number;
  blockDamage: number;
  range: number;
  height: number;
  startupMs: number;
  activeMs: number;
  recoveryMs: number;
  cooldownMs: number;
  hitStunMs: number;
  blockStunMs: number;
  knockback: number;
};

export const attacks: Record<AttackName, AttackConfig> = {
  punch: {
    name: "punch",
    damage: 7,
    blockDamage: 2,
    range: 66,
    height: 82,
    startupMs: 80,
    activeMs: 95,
    recoveryMs: 210,
    cooldownMs: 430,
    hitStunMs: 250,
    blockStunMs: 150,
    knockback: 105,
  },
  punch2: {
    name: "punch2",
    damage: 9,
    blockDamage: 3,
    range: 82,
    height: 78,
    startupMs: 115,
    activeMs: 105,
    recoveryMs: 260,
    cooldownMs: 560,
    hitStunMs: 310,
    blockStunMs: 175,
    knockback: 130,
  },
  kick: {
    name: "kick",
    damage: 13,
    blockDamage: 4,
    range: 112,
    height: 70,
    startupMs: 165,
    activeMs: 120,
    recoveryMs: 360,
    cooldownMs: 720,
    hitStunMs: 400,
    blockStunMs: 220,
    knockback: 175,
  },
};
