import { randomInt } from "node:crypto";
import { describe, it, expect } from "vitest";
import { prisma } from "../src/db/client.js";
import { bumpLeaderboard, getWeeklyLeaderboard, getPlayerRank, currentWeekKey } from "../src/services/leaderboardService.js";
import { makeUser } from "./testUtils.js";

describe("leaderboardService", () => {
  it("aggregates helium/wins/losses per user for the current week", async () => {
    const user = await makeUser();
    await bumpLeaderboard(prisma, user.id, { heliumEarned: 100, wins: 1 });
    await bumpLeaderboard(prisma, user.id, { heliumEarned: 50, losses: 1 });

    const entry = await prisma.leaderboardEntry.findUniqueOrThrow({
      where: { userId_weekKey: { userId: user.id, weekKey: currentWeekKey() } },
    });
    expect(entry.heliumEarned).toBe(150);
    expect(entry.wins).toBe(1);
    expect(entry.losses).toBe(1);
  });

  it("ranks players by helium earned, descending", async () => {
    const low = await makeUser();
    const high = await makeUser();
    // Randomized rather than a fixed magic number: this suite has been run
    // multiple times against the same persistent DB, and a fixed value here
    // previously tied with a leftover row from an earlier run, making the
    // "top" ordering between equal values non-deterministic.
    const highValue = 1_000_000 + randomInt(1_000_000);
    await bumpLeaderboard(prisma, low.id, { heliumEarned: 10 });
    await bumpLeaderboard(prisma, high.id, { heliumEarned: highValue });

    // Query rank directly rather than relying on a fixed-size top-N containing
    // both users — the shared test DB accumulates rows across the whole suite.
    const highRank = await getPlayerRank(high.id);
    const lowRank = await getPlayerRank(low.id);
    expect(highRank!.rank).toBeLessThan(lowRank!.rank);

    // A very large earner should still show up in a reasonably sized top list.
    const top = await getWeeklyLeaderboard(10);
    expect(top[0]?.userId).toBe(high.id);
  });

  it("computes a player's rank relative to everyone this week", async () => {
    const user = await makeUser();
    await bumpLeaderboard(prisma, user.id, { heliumEarned: 5 });
    const rank = await getPlayerRank(user.id);
    expect(rank).not.toBeNull();
    expect(rank!.rank).toBeGreaterThanOrEqual(1);
  });
});
