export type AttackName = "punch" | "kick";

export const SPECIAL_DAMAGE = 35;
export const SPECIAL_METER_MAX = 100;
export const SPECIAL_METER_TIME_GAIN_PER_SECOND = 2.8;
export const SPECIAL_METER_DEAL_GAIN = 18;
export const SPECIAL_METER_TAKE_GAIN = 14;
export const SPECIAL_INTRO_PAUSE_MS = 800;
export const SPECIAL_NAME_DISPLAY_MS = 900;
export const SPECIAL_ANIMATION_FRAME_RATE = 6;
export const SPECIAL_RECOVERY_MS = 300;
export const SPECIAL_IMPACT_HOLD_MS = 300;
export const SPECIAL_FRAME_DURATIONS_MS = [450, 500, 550, 650, 450] as const;
export const SPECIAL_FRAME_MS = 500;

export type AttackConfig = {
  name: AttackName;
  damage: number;
  range: number;
  height: number;
  startupMs: number;
  activeMs: number;
  recoveryMs: number;
  cooldownMs: number;
  knockback: number;
};

export const attacks: Record<AttackName, AttackConfig> = {
  punch: {
    name: "punch",
    damage: 9,
    range: 70,
    height: 82,
    startupMs: 90,
    activeMs: 120,
    recoveryMs: 180,
    cooldownMs: 360,
    knockback: 120,
  },
  kick: {
    name: "kick",
    damage: 14,
    range: 94,
    height: 70,
    startupMs: 140,
    activeMs: 135,
    recoveryMs: 260,
    cooldownMs: 520,
    knockback: 165,
  },
};
