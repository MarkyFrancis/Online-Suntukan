import type { PlayerInput } from "../input/bindings";
import { emptyInput } from "../input/bindings";
import type { AiDifficulty } from "../config/ai";
import type { FighterState } from "./types";

export class FighterAi {
  private elapsedSinceDecision = Number.POSITIVE_INFINITY;
  private currentInput: PlayerInput = emptyInput();

  constructor(private readonly difficulty: AiDifficulty) {}

  reset() {
    this.elapsedSinceDecision = Number.POSITIVE_INFINITY;
    this.currentInput = emptyInput();
  }

  decide(dtMs: number, ai: FighterState, target: FighterState): PlayerInput {
    this.elapsedSinceDecision += dtMs;

    if (ai.health <= 0 || ai.hitStunMs > 0 || ai.activeAttack) {
      this.currentInput = emptyInput();
      return this.currentInput;
    }

    if (this.elapsedSinceDecision < this.difficulty.reactionTimeMs) {
      return this.currentInput;
    }

    this.elapsedSinceDecision = 0;
    const next = emptyInput();
    const distance = Math.abs(target.x - ai.x);
    const targetIsRight = target.x > ai.x;
    const contactDistance = Math.max(0, distance - (ai.def.body.width + target.def.body.width) / 2);
    const canThrow =
      ai.grounded &&
      target.grounded &&
      target.health > 0 &&
      ai.throwCooldownMs <= 0 &&
      Boolean(ai.def.throw) &&
      contactDistance <= this.difficulty.throwRange;
    const targetIsVulnerableToThrow = target.blocking || (!target.activeAttack && Math.abs(target.vx) < 18);

    if (
      canThrow &&
      targetIsVulnerableToThrow &&
      Math.random() < this.difficulty.throwChance * (target.blocking ? 1.35 : 1)
    ) {
      next.throw = true;
    } else if (distance > this.difficulty.farRange) {
      if (Math.random() < this.difficulty.aggression) {
        next.left = !targetIsRight;
        next.right = targetIsRight;
      }
    } else if (distance < this.difficulty.closeRange && Math.random() < this.difficulty.backUpChance) {
      next.left = targetIsRight;
      next.right = !targetIsRight;
    } else if (
      distance <= this.difficulty.attackRange + 36 &&
      target.activeAttack &&
      target.activeAttack.elapsedMs < target.activeAttack.config.startupMs + target.activeAttack.config.activeMs &&
      Math.random() < this.difficulty.blockChance
    ) {
      next.block = true;
    } else if (
      target.activeAttack &&
      target.activeAttack.elapsedMs >= target.activeAttack.config.startupMs + target.activeAttack.config.activeMs &&
      distance <= this.difficulty.attackRange + 30 &&
      Math.random() < this.difficulty.punishChance
    ) {
      if (distance <= this.difficulty.attackRange * 0.62 && Math.random() < 0.52) {
        next.punch = true;
      } else if (Math.random() < 0.46) {
        next.punch2 = true;
      } else {
        next.kick = true;
      }
    } else if (
      ai.specialMeter >= 100 &&
      distance <= Math.max(this.difficulty.specialRange, ai.def.special.range) &&
      Math.random() < this.difficulty.specialChance
    ) {
      next.special = true;
    } else if (distance <= this.difficulty.attackRange && Math.random() < this.difficulty.attackChance) {
      const roll = Math.random();
      if (roll < 0.5) {
        next.punch = true;
      } else if (roll < 0.74) {
        next.punch2 = true;
      } else {
        next.kick = true;
      }
    } else if (Math.random() < this.difficulty.aggression * 0.52) {
      next.left = !targetIsRight;
      next.right = targetIsRight;
    }

    if (ai.grounded && distance > 150 && Math.random() < 0.08) {
      next.jump = true;
    }

    this.currentInput = next;
    return next;
  }
}
