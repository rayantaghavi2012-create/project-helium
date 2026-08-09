import { gameConfig } from "../config/index.js";

export interface ScoreInput {
  correctCount: number;
  totalPuzzles: number;
  totalTimeMs: number;
  puzzleTimeLimitMs?: number;
  weights?: { accuracy: number; speed: number };
}

/**
 * Transparent, server-only scoring: accuracy is the majority weight, speed is a
 * minor tiebreaker-ish contribution. Both sub-scores are normalized to 0-100
 * before weighting so the formula stays stable regardless of puzzle count.
 */
export function calculateScore(input: ScoreInput): number {
  const {
    correctCount,
    totalPuzzles,
    totalTimeMs,
    puzzleTimeLimitMs = gameConfig.fight.puzzleTimeLimitMs,
    weights = gameConfig.fight.scoringWeights,
  } = input;

  if (totalPuzzles <= 0) return 0;

  const accuracyScore = (correctCount / totalPuzzles) * 100;

  const avgTimeMs = totalTimeMs / totalPuzzles;
  const maxTimeMs = puzzleTimeLimitMs;
  const speedScore = Math.max(0, Math.min(100, 100 - (avgTimeMs / maxTimeMs) * 100));

  const score = accuracyScore * weights.accuracy + speedScore * weights.speed;
  return Math.round(score * 10) / 10;
}

export function pickWinnerSlot(
  score1: number,
  score2: number,
  tiebreak: { correct1: number; correct2: number; time1: number; time2: number }
): 1 | 2 | null {
  if (score1 > score2) return 1;
  if (score2 > score1) return 2;
  if (tiebreak.correct1 !== tiebreak.correct2) return tiebreak.correct1 > tiebreak.correct2 ? 1 : 2;
  if (tiebreak.time1 !== tiebreak.time2) return tiebreak.time1 < tiebreak.time2 ? 1 : 2;
  return null; // true draw
}

/** Random 1-100 roll used only to decide who takes the first turn. */
export function rollStartingNumber(): number {
  return Math.floor(Math.random() * 100) + 1;
}
