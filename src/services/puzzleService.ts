import { prisma } from "../db/client.js";
import { gameConfig } from "../config/index.js";
import { applyCurrencyTransaction } from "./walletService.js";
import { bumpLeaderboard } from "./leaderboardService.js";

export async function getRandomPuzzle(difficulty?: string, excludeIds: string[] = []) {
  const where = {
    active: true,
    ...(difficulty ? { difficulty } : {}),
    ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
  };
  const count = await prisma.puzzle.count({ where });
  if (count === 0) return null;
  const skip = Math.floor(Math.random() * count);
  const [puzzle] = await prisma.puzzle.findMany({ where, take: 1, skip });
  return puzzle ?? null;
}

export function isCorrectAnswer(puzzle: { correct: string }, selected: "A" | "B" | null): boolean {
  return selected === puzzle.correct;
}

/**
 * Solving the standalone "daily puzzle" (outside of a fight) earns Helium directly.
 * Idempotent per (userId, puzzleId, day) via refId so a duplicated callback can't pay twice.
 */
export async function rewardDailyPuzzleSolve(userId: string, puzzleId: string, difficulty: string) {
  const amount = gameConfig.puzzleRewards[difficulty] ?? gameConfig.puzzleRewards.EASY;
  const dayKey = new Date().toISOString().slice(0, 10);
  const refId = `${puzzleId}:${dayKey}`;
  const tx = await applyCurrencyTransaction({
    userId,
    amount,
    reason: "PUZZLE_REWARD",
    refId,
  });
  await prisma.user.update({ where: { id: userId }, data: { puzzlesSolved: { increment: 1 } } });
  await bumpLeaderboard(prisma, userId, { heliumEarned: amount, puzzlesSolved: 1 });
  return { amount, transaction: tx };
}
