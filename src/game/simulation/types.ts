import type { FighterAssetManifest, PoseName } from "../assets/manifest";
import type { AttackConfig, AttackName } from "../config/attacks";

export type GameMode = "pvp" | "pvc";
export type Facing = -1 | 1;
export type RoundStatus = "menu" | "playing" | "ko" | "time";
export type FighterId = "p1" | "p2";
export type SpecialPhase = "idle" | "intro" | "active" | "impact" | "recovery" | "cleanup";
export type ThrowPhase = "idle" | "startup" | "lift" | "slam" | "impact" | "recovery" | "whiff";
export type AssistPhase = "idle" | "entrance" | "active" | "impact" | "recovery";

export type ActiveAttack = {
  config: AttackConfig;
  elapsedMs: number;
  hasHit: boolean;
};

export type SpecialSequenceState = {
  phase: SpecialPhase;
  casterId: FighterId | null;
  victimId: FighterId | null;
  elapsedMs: number;
  phaseElapsedMs: number;
  hasHit: boolean;
};

export type ThrowSequenceState = {
  phase: ThrowPhase;
  casterId: FighterId | null;
  victimId: FighterId | null;
  phaseElapsedMs: number;
  success: boolean;
  impactApplied: boolean;
  slideStartX: number | null;
  slideTargetX: number | null;
};

export type AssistSequenceState = {
  phase: AssistPhase;
  callerId: FighterId | null;
  victimId: FighterId | null;
  elapsedMs: number;
  phaseElapsedMs: number;
  hasHit: boolean;
};

export type FighterState = {
  id: FighterId;
  def: FighterAssetManifest;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: Facing;
  health: number;
  maxHealth: number;
  grounded: boolean;
  pose: PoseName;
  hitStunMs: number;
  blocking: boolean;
  throwCooldownMs: number;
  attackCooldowns: Record<AttackName, number>;
  activeAttack: ActiveAttack | null;
  specialMeter: number;
  assistMeter: number;
};

export type RoundSnapshot = {
  mode: GameMode;
  status: RoundStatus;
  winner: FighterId | "draw" | null;
  timerMs: number;
  fighters: Record<FighterId, FighterState>;
  specialSequence: SpecialSequenceState;
  throwSequence: ThrowSequenceState;
  assistSequence: AssistSequenceState;
};
