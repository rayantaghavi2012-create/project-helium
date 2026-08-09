import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../db/client.js";

type Db = PrismaClient | Prisma.TransactionClient;

export function currentWeekKey(date = new Date()): string {
  // ISO week number, computed in UTC so it's stable regardless of server timezone.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export async function bumpLeaderboard(
  db: Db,
  userId: string,
  delta: { wins?: number; losses?: number; heliumEarned?: number; puzzlesSolved?: number }
) {
  const weekKey = currentWeekKey();
  await db.leaderboardEntry.upsert({
    where: { userId_weekKey: { userId, weekKey } },
    create: {
      userId,
      weekKey,
      wins: delta.wins ?? 0,
      losses: delta.losses ?? 0,
      heliumEarned: delta.heliumEarned ?? 0,
      puzzlesSolved: delta.puzzlesSolved ?? 0,
    },
    update: {
      wins: { increment: delta.wins ?? 0 },
      losses: { increment: delta.losses ?? 0 },
      heliumEarned: { increment: delta.heliumEarned ?? 0 },
      puzzlesSolved: { increment: delta.puzzlesSolved ?? 0 },
    },
  });
}

export async function getWeeklyLeaderboard(limit = 10, weekKey = currentWeekKey()) {
  return prisma.leaderboardEntry.findMany({
    where: { weekKey },
    orderBy: { heliumEarned: "desc" },
    take: limit,
    include: { user: true },
  });
}

export async function getPlayerRank(userId: string, weekKey = currentWeekKey()) {
  const entry = await prisma.leaderboardEntry.findUnique({ where: { userId_weekKey: { userId, weekKey } } });
  if (!entry) return null;

  const betterCount = await prisma.leaderboardEntry.count({
    where: { weekKey, heliumEarned: { gt: entry.heliumEarned } },
  });

  return { entry, rank: betterCount + 1 };
}
