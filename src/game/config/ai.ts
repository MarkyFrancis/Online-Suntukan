export type AiDifficulty = {
  reactionTimeMs: number;
  attackChance: number;
  moveSpeed: number;
  aggression: number;
  backUpChance: number;
  farRange: number;
  closeRange: number;
  attackRange: number;
  specialChance: number;
  specialRange: number;
  blockChance: number;
  punishChance: number;
};

export const aiDifficulty: AiDifficulty = {
  reactionTimeMs: 420,
  attackChance: 0.46,
  moveSpeed: 0.9,
  aggression: 0.72,
  backUpChance: 0.28,
  farRange: 190,
  closeRange: 72,
  attackRange: 118,
  specialChance: 0.18,
  specialRange: 300,
  blockChance: 0.5,
  punishChance: 0.38,
};
