import Phaser from "phaser";
import type { FighterAssetManifest } from "../assets/manifest";
import type { AttackName } from "../config/attacks";
import {
  SPECIAL_ANIMATION_FRAME_RATE,
  SPECIAL_DAMAGE,
  SPECIAL_BLOCK_DAMAGE,
  SPECIAL_BLOCK_STUN_MS,
  SPECIAL_HIT_STUN_MS,
  SPECIAL_METER_BLOCK_TAKE_GAIN,
  SPECIAL_METER_BLOCKED_DEAL_GAIN,
  SPECIAL_INTRO_PAUSE_MS,
  SPECIAL_METER_DEAL_GAIN,
  SPECIAL_METER_MAX,
  SPECIAL_METER_TAKE_GAIN,
  SPECIAL_METER_TIME_GAIN_PER_SECOND,
  SPECIAL_RECOVERY_MS,
  HIT_STUN_REHIT_REDUCTION,
  HIT_STUN_REHIT_THRESHOLD_MS,
  PUNCH2_COMBO_WINDOW_MS,
  THROW_COOLDOWN_MS,
  THROW_DAMAGE,
  THROW_FRAME_MS,
  THROW_HITSTUN_MS,
  THROW_KNOCKBACK,
  THROW_RANGE,
  THROW_RECOVERY_MS,
  THROW_STARTUP_MS,
  attacks,
} from "../config/attacks";
import type { PlayerInput } from "../input/bindings";
import { emptyInput } from "../input/bindings";
import type { FighterId, FighterState, GameMode, RoundSnapshot, SpecialSequenceState, ThrowSequenceState } from "./types";

const defaultGroundY = 474;
const stageLeft = 72;
const stageRight = 888;
const gravity = 1850;
const jumpVelocity = -720;
const moveSpeed = 270;
const blockMoveMultiplier = 0.42;
const friction = 0.78;
const maxHealth = 200;
const roundLengthMs = 120_000;
const specialImpactHoldMs = 180;
const throwLiftHeight = 86;
const throwImpactAtMs = Math.round(THROW_FRAME_MS * 0.72);

export type RoundEvents = {
  onAttack?: (fighter: FighterState, attackName: AttackName) => void;
  onHit?: (attacker: FighterState, victim: FighterState, attackName: AttackName) => void;
  onBlock?: (attacker: FighterState, victim: FighterState, attackName: AttackName) => void;
  onSpecialStart?: (fighter: FighterState, victim: FighterState) => void;
  onSpecialHit?: (attacker: FighterState, victim: FighterState) => void;
  onSpecialEnd?: () => void;
  onThrowStart?: (attacker: FighterState, victim: FighterState, success: boolean) => void;
  onThrowImpact?: (attacker: FighterState, victim: FighterState) => void;
  onThrowEnd?: () => void;
  onKo?: (winner: FighterId | "draw") => void;
};

export type RoundOptions = {
  groundY?: number;
};

export class RoundSimulation {
  private snapshotValue: RoundSnapshot;
  private readonly groundY: number;

  constructor(
    mode: GameMode,
    p1Def: FighterAssetManifest,
    p2Def: FighterAssetManifest,
    private readonly events: RoundEvents = {},
    options: RoundOptions = {},
  ) {
    this.groundY = options.groundY ?? defaultGroundY;
    this.snapshotValue = {
      mode,
      status: "playing",
      winner: null,
      timerMs: roundLengthMs,
      fighters: {
        p1: this.createFighter("p1", p1Def, 260, 1),
        p2: this.createFighter("p2", p2Def, 700, -1),
      },
      specialSequence: this.createIdleSpecialSequence(),
      throwSequence: this.createIdleThrowSequence(),
    };
  }

  get snapshot(): RoundSnapshot {
    return this.snapshotValue;
  }

  cancelSpecialSequence() {
    const wasThrowing = this.snapshotValue.throwSequence.phase !== "idle";
    for (const fighter of Object.values(this.snapshotValue.fighters)) {
      fighter.activeAttack = null;
      fighter.vx = 0;
      fighter.vy = 0;
      fighter.blocking = false;
      fighter.hitStunMs = 0;
      if (wasThrowing) {
        fighter.y = this.groundY;
        fighter.grounded = true;
      }
      if (fighter.health > 0) {
        fighter.pose = "idle";
      }
    }
    this.snapshotValue.specialSequence = this.createIdleSpecialSequence();
    this.snapshotValue.throwSequence = this.createIdleThrowSequence();
  }

  update(dtMs: number, inputs: { p1: PlayerInput; p2: PlayerInput }) {
    if (this.snapshotValue.status !== "playing") {
      return;
    }

    if (this.snapshotValue.specialSequence.phase !== "idle") {
      this.updateSpecialSequence(dtMs);
      this.updateFacing();
      this.updatePoses();
      this.checkEndState();
      return;
    }

    if (this.snapshotValue.throwSequence.phase !== "idle") {
      this.updateThrowSequence(dtMs);
      this.updateFacing();
      this.updatePoses();
      this.checkEndState();
      return;
    }

    const dt = dtMs / 1000;
    this.snapshotValue.timerMs = Math.max(0, this.snapshotValue.timerMs - dtMs);

    this.updateFighter(this.snapshotValue.fighters.p1, inputs.p1, dt, dtMs);
    if (
      this.snapshotValue.throwSequence.phase === "idle" ||
      !this.snapshotValue.throwSequence.success
    ) {
      this.updateFighter(this.snapshotValue.fighters.p2, inputs.p2, dt, dtMs);
    }
    this.updateFacing();
    if (this.snapshotValue.throwSequence.phase !== "idle") {
      this.updatePoses();
      this.checkEndState();
      return;
    }
    this.resolveBodyPush();
    this.resolveAttack(this.snapshotValue.fighters.p1, this.snapshotValue.fighters.p2);
    this.resolveAttack(this.snapshotValue.fighters.p2, this.snapshotValue.fighters.p1);
    this.updatePoses();
    this.checkEndState();
  }

  private createIdleSpecialSequence(): SpecialSequenceState {
    return {
      phase: "idle",
      casterId: null,
      victimId: null,
      elapsedMs: 0,
      phaseElapsedMs: 0,
      hasHit: false,
    };
  }

  private createIdleThrowSequence(): ThrowSequenceState {
    return {
      phase: "idle",
      casterId: null,
      victimId: null,
      phaseElapsedMs: 0,
      success: false,
      impactApplied: false,
      slideStartX: null,
      slideTargetX: null,
    };
  }

  private createFighter(
    id: FighterId,
    def: FighterAssetManifest,
    x: number,
    facing: -1 | 1,
  ): FighterState {
    return {
      id,
      def,
      x,
      y: this.groundY,
      vx: 0,
      vy: 0,
      facing,
      health: maxHealth,
      maxHealth,
      grounded: true,
      pose: "idle",
      hitStunMs: 0,
      blocking: false,
      throwCooldownMs: 0,
      attackCooldowns: {
        punch: 0,
        punch2: 0,
        kick: 0,
      },
      activeAttack: null,
      specialMeter: 0,
    };
  }

  private updateFighter(fighter: FighterState, input: PlayerInput, dt: number, dtMs: number) {
    fighter.hitStunMs = Math.max(0, fighter.hitStunMs - dtMs);
    fighter.attackCooldowns.punch = Math.max(0, fighter.attackCooldowns.punch - dtMs);
    fighter.attackCooldowns.punch2 = Math.max(0, fighter.attackCooldowns.punch2 - dtMs);
    fighter.attackCooldowns.kick = Math.max(0, fighter.attackCooldowns.kick - dtMs);
    fighter.throwCooldownMs = Math.max(0, fighter.throwCooldownMs - dtMs);

    if (fighter.health > 0) {
      fighter.specialMeter = Math.min(
        SPECIAL_METER_MAX,
        fighter.specialMeter + SPECIAL_METER_TIME_GAIN_PER_SECOND * dt,
      );
    }

    if (fighter.activeAttack) {
      fighter.activeAttack.elapsedMs += dtMs;
      const attack = fighter.activeAttack.config;
      if (fighter.activeAttack.elapsedMs >= attack.startupMs + attack.activeMs + attack.recoveryMs) {
        fighter.activeAttack = null;
      }
    }

    if (input.punch && this.canComboIntoPunch2(fighter)) {
      this.startAttack(fighter, "punch2");
    }

    const lockedByAction = fighter.activeAttack !== null;
    const canMove = fighter.hitStunMs <= 0 && !lockedByAction;
    fighter.blocking = canMove && fighter.grounded && input.block;

    if (canMove) {
      const horizontal = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      fighter.vx = fighter.blocking ? horizontal * moveSpeed * blockMoveMultiplier : horizontal * moveSpeed;

      if (input.jump && fighter.grounded) {
        fighter.vy = jumpVelocity;
        fighter.grounded = false;
      }

      if (input.punch) {
        this.tryStartAttack(fighter, "punch");
      } else if (input.punch2) {
        this.tryStartAttack(fighter, "punch2");
      } else if (input.kick) {
        this.tryStartAttack(fighter, "kick");
      } else if (input.throw) {
        this.tryStartThrow(fighter);
      } else if (input.special) {
        this.tryStartSpecial(fighter);
      }
    } else if (fighter.grounded) {
      fighter.vx *= friction;
    }

    fighter.vy += gravity * dt;
    fighter.x = Phaser.Math.Clamp(fighter.x + fighter.vx * dt, stageLeft, stageRight);
    fighter.y += fighter.vy * dt;

    if (fighter.y >= this.groundY) {
      fighter.y = this.groundY;
      fighter.vy = 0;
      fighter.grounded = true;
    }
  }

  private tryStartAttack(fighter: FighterState, attackName: AttackName) {
    if (
      fighter.attackCooldowns[attackName] > 0 ||
      fighter.activeAttack ||
      this.snapshotValue.specialSequence.phase !== "idle" ||
      fighter.health <= 0
    ) {
      return;
    }

    this.startAttack(fighter, attackName);
  }

  private startAttack(fighter: FighterState, attackName: AttackName) {
    fighter.activeAttack = {
      config: attacks[attackName],
      elapsedMs: 0,
      hasHit: false,
    };
    fighter.attackCooldowns[attackName] = attacks[attackName].cooldownMs;
    fighter.pose = attackName;
    this.events.onAttack?.(fighter, attackName);
  }

  private canComboIntoPunch2(fighter: FighterState) {
    const activeAttack = fighter.activeAttack;
    if (
      !activeAttack ||
      activeAttack.config.name !== "punch" ||
      fighter.attackCooldowns.punch2 > 0 ||
      this.snapshotValue.specialSequence.phase !== "idle" ||
      fighter.hitStunMs > 0 ||
      fighter.blocking ||
      fighter.health <= 0
    ) {
      return false;
    }

    const activeEndMs = activeAttack.config.startupMs + activeAttack.config.activeMs;
    return activeAttack.elapsedMs <= PUNCH2_COMBO_WINDOW_MS && activeAttack.elapsedMs <= activeEndMs;
  }

  private tryStartSpecial(fighter: FighterState) {
    if (
      fighter.specialMeter < SPECIAL_METER_MAX ||
      fighter.activeAttack ||
      this.snapshotValue.specialSequence.phase !== "idle" ||
      fighter.hitStunMs > 0 ||
      fighter.health <= 0
    ) {
      return;
    }

    fighter.specialMeter = 0;
    fighter.activeAttack = null;
    fighter.vx = 0;
    fighter.vy = 0;

    const victimId = fighter.id === "p1" ? "p2" : "p1";
    const victim = this.snapshotValue.fighters[victimId];
    victim.activeAttack = null;
    victim.vx = 0;
    victim.vy = 0;

    this.snapshotValue.specialSequence = {
      phase: "intro",
      casterId: fighter.id,
      victimId,
      elapsedMs: 0,
      phaseElapsedMs: 0,
      hasHit: false,
    };
    this.events.onSpecialStart?.(fighter, victim);
  }

  private tryStartThrow(fighter: FighterState) {
    if (
      !fighter.def.throw ||
      !fighter.grounded ||
      fighter.blocking ||
      fighter.hitStunMs > 0 ||
      fighter.activeAttack ||
      fighter.throwCooldownMs > 0 ||
      fighter.health <= 0 ||
      this.snapshotValue.specialSequence.phase !== "idle" ||
      this.snapshotValue.throwSequence.phase !== "idle"
    ) {
      return;
    }

    const victimId: FighterId = fighter.id === "p1" ? "p2" : "p1";
    const victim = this.snapshotValue.fighters[victimId];
    const centerDistance = Math.abs(victim.x - fighter.x);
    const contactDistance = Math.max(0, centerDistance - (fighter.def.body.width + victim.def.body.width) / 2);
    const victimInFront = fighter.facing * (victim.x - fighter.x) >= -8;
    const success =
      victim.grounded &&
      victim.health > 0 &&
      this.snapshotValue.specialSequence.phase === "idle" &&
      contactDistance <= THROW_RANGE &&
      victimInFront;

    fighter.throwCooldownMs = THROW_COOLDOWN_MS;
    fighter.activeAttack = null;
    fighter.vx = 0;
    fighter.vy = 0;
    fighter.blocking = false;

    if (success) {
      victim.activeAttack = null;
      victim.vx = 0;
      victim.vy = 0;
      victim.blocking = false;
      victim.grounded = true;
    }

    this.snapshotValue.throwSequence = {
      phase: success ? "startup" : "whiff",
      casterId: fighter.id,
      victimId: success ? victim.id : null,
      phaseElapsedMs: 0,
      success,
      impactApplied: false,
      slideStartX: null,
      slideTargetX: null,
    };
    this.events.onThrowStart?.(fighter, victim, success);
  }

  private updateThrowSequence(dtMs: number) {
    const sequence = this.snapshotValue.throwSequence;
    if (sequence.phase === "idle" || !sequence.casterId) {
      return;
    }

    const caster = this.snapshotValue.fighters[sequence.casterId];
    const victim = sequence.victimId ? this.snapshotValue.fighters[sequence.victimId] : null;
    caster.vx = 0;
    caster.vy = 0;
    caster.blocking = false;
    sequence.phaseElapsedMs += dtMs;

    if (!sequence.success || !victim) {
      if (sequence.phaseElapsedMs >= THROW_STARTUP_MS + THROW_RECOVERY_MS) {
        this.snapshotValue.throwSequence = this.createIdleThrowSequence();
        this.events.onThrowEnd?.();
      }
      return;
    }

    victim.vx = 0;
    victim.vy = 0;
    victim.blocking = false;
    const grabX = caster.x + caster.facing * Math.max(34, (caster.def.body.width + victim.def.body.width) * 0.3);

    if (sequence.phase === "startup") {
      const progress = Math.min(1, sequence.phaseElapsedMs / THROW_STARTUP_MS);
      victim.x = Phaser.Math.Linear(victim.x, grabX, progress);
      victim.y = this.groundY;
      victim.grounded = true;
      if (sequence.phaseElapsedMs >= THROW_STARTUP_MS) {
        this.advanceThrowPhase("lift");
      }
      return;
    }

    if (sequence.phase === "lift") {
      const progress = Math.min(1, sequence.phaseElapsedMs / THROW_FRAME_MS);
      victim.x = grabX;
      victim.y = this.groundY - throwLiftHeight * progress;
      victim.grounded = false;
      if (sequence.phaseElapsedMs >= THROW_FRAME_MS) {
        this.advanceThrowPhase("slam");
      }
      return;
    }

    if (sequence.phase === "slam") {
      const progress = Math.min(1, sequence.phaseElapsedMs / THROW_FRAME_MS);
      victim.x = grabX + caster.facing * 12 * progress;
      if (sequence.impactApplied) {
        victim.y = this.groundY;
        victim.grounded = true;
      } else {
        victim.y = this.groundY - throwLiftHeight * (1 - progress);
        victim.grounded = false;

        if (sequence.phaseElapsedMs >= throwImpactAtMs) {
          sequence.impactApplied = true;
          victim.y = this.groundY;
          victim.grounded = true;
          victim.health = Math.max(0, victim.health - THROW_DAMAGE);
          victim.hitStunMs = THROW_HITSTUN_MS;
          victim.vx = caster.facing * THROW_KNOCKBACK;
          victim.specialMeter = Math.min(SPECIAL_METER_MAX, victim.specialMeter + SPECIAL_METER_TAKE_GAIN);
          caster.specialMeter = Math.min(SPECIAL_METER_MAX, caster.specialMeter + Math.max(1, SPECIAL_METER_DEAL_GAIN * 0.55));
          victim.pose = victim.health <= 0 ? "ko" : "hurt";
          sequence.slideStartX = victim.x;
          sequence.slideTargetX = Phaser.Math.Clamp(
            victim.x + caster.facing * THROW_KNOCKBACK,
            stageLeft,
            stageRight,
          );
          this.events.onThrowImpact?.(caster, victim);
          this.advanceThrowPhase("recovery");
        }
      }
      if (sequence.phaseElapsedMs >= THROW_FRAME_MS) {
        victim.y = this.groundY;
        victim.grounded = true;
        this.advanceThrowPhase("impact");
      }
      return;
    }

    if (sequence.phase === "recovery") {
      const slideProgress = Math.min(1, sequence.phaseElapsedMs / THROW_RECOVERY_MS);
      const slideEase = Phaser.Math.Easing.Sine.InOut(slideProgress);
      const slideStartX = sequence.slideStartX ?? victim.x;
      const slideTargetX = sequence.slideTargetX ?? slideStartX;
      victim.x = Phaser.Math.Linear(slideStartX, slideTargetX, slideEase);
      victim.y = this.groundY;
      victim.grounded = true;
      victim.vx = 0;

      if (sequence.phaseElapsedMs >= THROW_RECOVERY_MS) {
        this.snapshotValue.throwSequence = this.createIdleThrowSequence();
        this.events.onThrowEnd?.();
      }
    }
  }

  private advanceThrowPhase(phase: ThrowSequenceState["phase"]) {
    this.snapshotValue.throwSequence.phase = phase;
    this.snapshotValue.throwSequence.phaseElapsedMs = 0;
  }

  private updateSpecialSequence(dtMs: number) {
    const sequence = this.snapshotValue.specialSequence;
    if (sequence.phase === "idle" || !sequence.casterId || !sequence.victimId) {
      return;
    }

    const caster = this.snapshotValue.fighters[sequence.casterId];
    const victim = this.snapshotValue.fighters[sequence.victimId];
    caster.vx = 0;
    caster.vy = 0;
    victim.vx = 0;
    victim.vy = 0;

    sequence.elapsedMs += dtMs;
    sequence.phaseElapsedMs += dtMs;

    if (sequence.phase === "intro" && sequence.phaseElapsedMs >= SPECIAL_INTRO_PAUSE_MS) {
      this.advanceSpecialPhase("active");
      return;
    }

    if (sequence.phase === "active") {
      const activeMs = this.getSpecialActiveMs(caster);
      const hitAtMs = Math.min(caster.def.special.hitAtMs, Math.max(0, activeMs - 1));
      if (!sequence.hasHit && sequence.phaseElapsedMs >= hitAtMs) {
        sequence.hasHit = true;
        this.applySpecialImpact(caster, victim);
      }
      if (sequence.phaseElapsedMs >= activeMs) {
        sequence.hasHit = true;
        this.advanceSpecialPhase("impact");
      }
      return;
    }

    if (sequence.phase === "impact" && sequence.phaseElapsedMs >= (caster.def.special.impactHoldMs ?? specialImpactHoldMs)) {
      this.advanceSpecialPhase("recovery");
      return;
    }

    if (sequence.phase === "recovery" && sequence.phaseElapsedMs >= (caster.def.special.recoveryMs ?? SPECIAL_RECOVERY_MS)) {
      this.advanceSpecialPhase("cleanup");
      return;
    }

    if (sequence.phase === "cleanup") {
      caster.hitStunMs = 0;
      caster.blocking = false;
      victim.blocking = false;
      this.snapshotValue.specialSequence = this.createIdleSpecialSequence();
      this.events.onSpecialEnd?.();
    }
  }

  private getSpecialActiveMs(caster: FighterState) {
    const framePacedMinimum = Math.ceil(6 * (1000 / SPECIAL_ANIMATION_FRAME_RATE));
    return Math.max(caster.def.special.durationMs, framePacedMinimum);
  }

  private advanceSpecialPhase(phase: SpecialSequenceState["phase"]) {
    this.snapshotValue.specialSequence.phase = phase;
    this.snapshotValue.specialSequence.phaseElapsedMs = 0;
  }

  private applySpecialImpact(attacker: FighterState, victim: FighterState) {
    const special = attacker.def.special;
    const horizontalDistance = Math.abs(victim.x - attacker.x);
    const victimInFront = attacker.facing === 1 ? victim.x >= attacker.x - 8 : victim.x <= attacker.x + 8;
    const verticalOverlap = Math.abs(victim.y - attacker.y) <= special.height;
    const inRange = (special.fullScreen || horizontalDistance <= special.range) && victimInFront && verticalOverlap;

    if (!inRange || victim.health <= 0) {
      return;
    }

    if (victim.blocking && victim.grounded && victim.facing === -attacker.facing) {
      victim.health = Math.max(0, victim.health - SPECIAL_BLOCK_DAMAGE);
      victim.specialMeter = Math.min(SPECIAL_METER_MAX, victim.specialMeter + SPECIAL_METER_BLOCK_TAKE_GAIN);
      victim.hitStunMs = this.nextHitStun(victim, SPECIAL_BLOCK_STUN_MS);
      victim.vx = attacker.facing * (special.knockback * blockMoveMultiplier);
      victim.pose = victim.health <= 0 ? "ko" : "block";
      this.events.onBlock?.(attacker, victim, "kick");
      return;
    }

    victim.health = Math.max(0, victim.health - SPECIAL_DAMAGE);
    victim.hitStunMs = this.nextHitStun(victim, SPECIAL_HIT_STUN_MS);
    victim.vx = attacker.facing * special.knockback;
    victim.vy = special.effect === "ground-smash" ? -250 : victim.vy;
    victim.pose = victim.health <= 0 ? "ko" : "hurt";
    victim.specialMeter = Math.min(SPECIAL_METER_MAX, victim.specialMeter + SPECIAL_METER_TAKE_GAIN);
    this.events.onSpecialHit?.(attacker, victim);
  }

  private updateFacing() {
    const p1 = this.snapshotValue.fighters.p1;
    const p2 = this.snapshotValue.fighters.p2;
    p1.facing = p1.x <= p2.x ? 1 : -1;
    p2.facing = p2.x <= p1.x ? 1 : -1;
  }

  private resolveBodyPush() {
    const p1 = this.snapshotValue.fighters.p1;
    const p2 = this.snapshotValue.fighters.p2;
    const minDistance = (p1.def.body.width + p2.def.body.width) / 2;
    const distance = p2.x - p1.x;
    const overlap = minDistance - Math.abs(distance);

    if (overlap <= 0) {
      return;
    }

    const push = overlap / 2;
    const direction = distance >= 0 ? 1 : -1;
    p1.x = Phaser.Math.Clamp(p1.x - direction * push, stageLeft, stageRight);
    p2.x = Phaser.Math.Clamp(p2.x + direction * push, stageLeft, stageRight);
  }

  private resolveAttack(attacker: FighterState, victim: FighterState) {
    if (!attacker.activeAttack || attacker.activeAttack.hasHit || victim.health <= 0) {
      return;
    }

    const { config, elapsedMs } = attacker.activeAttack;
    const activeStart = config.startupMs;
    const activeEnd = config.startupMs + config.activeMs;

    if (elapsedMs < activeStart || elapsedMs > activeEnd) {
      return;
    }

    const attackLeft =
      attacker.facing === 1
        ? attacker.x + attacker.def.body.width * 0.2
        : attacker.x - attacker.def.body.width * 0.2 - config.range;
    const attackRight = attackLeft + config.range;
    const attackTop = attacker.y - attacker.def.body.height * 0.72;
    const attackBottom = attackTop + config.height;
    const victimLeft = victim.x - victim.def.body.width / 2;
    const victimRight = victim.x + victim.def.body.width / 2;
    const victimTop = victim.y - victim.def.body.height;
    const victimBottom = victim.y;

    const overlaps =
      attackLeft < victimRight &&
      attackRight > victimLeft &&
      attackTop < victimBottom &&
      attackBottom > victimTop;

    if (!overlaps) {
      return;
    }

    attacker.activeAttack.hasHit = true;

    if (victim.blocking && victim.grounded && victim.facing === -attacker.facing) {
      victim.health = Math.max(0, victim.health - config.blockDamage);
      attacker.specialMeter = Math.min(SPECIAL_METER_MAX, attacker.specialMeter + Math.max(1, SPECIAL_METER_BLOCKED_DEAL_GAIN * 0.5));
      victim.specialMeter = Math.min(SPECIAL_METER_MAX, victim.specialMeter + Math.max(1, SPECIAL_METER_BLOCK_TAKE_GAIN * 0.5));
      victim.hitStunMs = this.nextHitStun(victim, config.blockStunMs);
      victim.vx = attacker.facing * (config.knockback * 0.42);
      victim.pose = victim.health <= 0 ? "ko" : "block";
      this.events.onBlock?.(attacker, victim, config.name);
      return;
    }

    victim.health = Math.max(0, victim.health - config.damage);
    attacker.specialMeter = Math.min(SPECIAL_METER_MAX, attacker.specialMeter + SPECIAL_METER_DEAL_GAIN);
    victim.specialMeter = Math.min(SPECIAL_METER_MAX, victim.specialMeter + SPECIAL_METER_TAKE_GAIN);
    victim.hitStunMs = this.nextHitStun(victim, config.hitStunMs);
    victim.vx = attacker.facing * config.knockback;
    victim.pose = victim.health <= 0 ? "ko" : "hurt";
    this.events.onHit?.(attacker, victim, config.name);
  }

  private nextHitStun(victim: FighterState, baseMs: number) {
    if (victim.hitStunMs > HIT_STUN_REHIT_THRESHOLD_MS) {
      return Math.max(victim.hitStunMs, Math.round(baseMs * HIT_STUN_REHIT_REDUCTION));
    }
    return baseMs;
  }

  private updatePoses() {
    const sequence = this.snapshotValue.specialSequence;
    const throwSequence = this.snapshotValue.throwSequence;
    for (const fighter of Object.values(this.snapshotValue.fighters)) {
      if (fighter.health <= 0) {
        fighter.pose = "ko";
      } else if (throwSequence.phase !== "idle" && throwSequence.casterId === fighter.id) {
        fighter.pose = "idle";
      } else if (throwSequence.success && throwSequence.victimId === fighter.id) {
        fighter.pose = "hurt";
      } else if (sequence.phase !== "idle" && sequence.casterId === fighter.id) {
        fighter.pose = "idle";
      } else if (fighter.blocking) {
        fighter.pose = "block";
      } else if (fighter.hitStunMs > 0) {
        fighter.pose = "hurt";
      } else if (fighter.activeAttack) {
        fighter.pose = fighter.activeAttack.config.name;
      } else if (!fighter.grounded) {
        fighter.pose = "jump";
      } else {
        fighter.pose = "idle";
      }
    }
  }

  private checkEndState() {
    const { p1, p2 } = this.snapshotValue.fighters;

    if (p1.health <= 0 || p2.health <= 0) {
      const winner = p1.health <= 0 && p2.health <= 0 ? "draw" : p1.health > 0 ? "p1" : "p2";
      this.snapshotValue.status = "ko";
      this.snapshotValue.winner = winner;
      this.events.onKo?.(winner);
      return;
    }

    if (this.snapshotValue.timerMs <= 0) {
      this.snapshotValue.status = "time";
      this.snapshotValue.winner = p1.health === p2.health ? "draw" : p1.health > p2.health ? "p1" : "p2";
      this.events.onKo?.(this.snapshotValue.winner);
    }
  }
}

export function stoppedInputs() {
  return {
    p1: emptyInput(),
    p2: emptyInput(),
  };
}
