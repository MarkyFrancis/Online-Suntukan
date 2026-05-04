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

    if (this.elapsedSinceDecision < this.difficulty.reactionTimeMs) {
      return this.currentInput;
    }

    this.elapsedSinceDecision = 0;
    const next = emptyInput();
    const distance = Math.abs(target.x - ai.x);
    const targetIsRight = target.x > ai.x;

    if (distance > this.difficulty.farRange) {
      if (Math.random() < this.difficulty.aggression) {
        next.left = !targetIsRight;
        next.right = targetIsRight;
      }
    } else if (distance < this.difficulty.closeRange && Math.random() < this.difficulty.backUpChance) {
      next.left = targetIsRight;
      next.right = !targetIsRight;
    } else if (
      ai.specialMeter >= 100 &&
      distance <= Math.max(this.difficulty.specialRange, ai.def.special.range) &&
      Math.random() < this.difficulty.specialChance
    ) {
      next.special = true;
    } else if (distance <= this.difficulty.attackRange && Math.random() < this.difficulty.attackChance) {
      if (Math.random() < 0.56) {
        next.punch = true;
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
