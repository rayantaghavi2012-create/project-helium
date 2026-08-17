import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { gameConfig } from "../src/config/index.js";
import {
  createFriendFight,
  requestRandomFight,
  cancelRandomFight,
  presentNextPuzzle,
  submitAnswer,
  cashOut,
  startDoubleChallenge,
  resolveDoubleChallenge,
  forfeitFight,
  FightError,
} from "../src/services/fightService.js";
import { getBalance } from "../src/services/walletService.js";
import { makeUserWithCharacter, ensurePuzzles } from "./testUtils.js";

// Isolate matchmaking tests from any WAITING fights left behind by other tests
// sharing this DB — otherwise a fresh seeker can match a stale leftover instead
// of getting the WAITING state the test expects.
async function clearStaleWaitingRandomFights() {
  const stale = await prisma.fight.findMany({ where: { mode: "RANDOM", state: "WAITING" } });
  await prisma.fightParticipant.deleteMany({ where: { fightId: { in: stale.map((f) => f.id) } } });
  await prisma.fight.deleteMany({ where: { id: { in: stale.map((f) => f.id) } } });
}

async function playFullFight(p1Wins: boolean) {
  await ensurePuzzles(30);
  const a = await makeUserWithCharacter();
  const b = await makeUserWithCharacter();

  const fight = await createFriendFight(a.user.id, b.user.id, a.userCharacter.id, b.userCharacter.id);
  const fresh = await prisma.fight.findUniqueOrThrow({ where: { id: fight.id } });
  expect(["PLAYER_1_TURN", "PLAYER_2_TURN"]).toContain(fresh.state);
  expect(fresh.player1Roll).not.toBeNull();
  expect(fresh.player2Roll).not.toBeNull();
  expect(fresh.player1Roll).not.toBe(fresh.player2Roll);

  const players = [
    { user: a.user, wantsCorrect: p1Wins },
    { user: b.user, wantsCorrect: !p1Wins },
  ];

  let current = await prisma.fight.findUniqueOrThrow({ where: { id: fight.id } });
  let guard = 0;
  while (current.state === "PLAYER_1_TURN" || current.state === "PLAYER_2_TURN") {
    guard++;
    if (guard > 20) throw new Error("fight did not converge");
    const slot = current.state === "PLAYER_1_TURN" ? 0 : 1;
    const player = players[slot];
    const next = await presentNextPuzzle(fight.id, player.user.id);
    const puzzle = await prisma.puzzle.findUniqueOrThrow({ where: { id: next.puzzle.id } });
    const selected = (player.wantsCorrect ? puzzle.correct : puzzle.correct === "A" ? "B" : "A") as "A" | "B";
    await submitAnswer({ fightId: fight.id, userId: player.user.id, fightAnswerId: next.fightAnswerId, selected });
    current = await prisma.fight.findUniqueOrThrow({ where: { id: fight.id } });
  }

  return { fight: current, a, b };
}

describe("fightService", () => {
  it("rejects fighting yourself", async () => {
    const a = await makeUserWithCharacter();
    await expect(
      createFriendFight(a.user.id, a.user.id, a.userCharacter.id, a.userCharacter.id)
    ).rejects.toBeInstanceOf(FightError);
  });

  it("runs a full fight to completion, picks a winner by score, and pays the reward once", async () => {
    const { fight, a } = await playFullFight(true);
    expect(fight.state).toBe("FINISHED");
    expect(fight.winnerId).toBe(a.user.id);

    const balance = await getBalance(a.user.id);
    expect(balance).toBe(gameConfig.fight.winReward);

    // Re-finishing must not double-pay (idempotency on refId=fightId is exercised
    // implicitly since finishFight only runs once per fight via the state machine).
    const winnerTx = await prisma.currencyTransaction.findMany({
      where: { userId: a.user.id, reason: "FIGHT_WIN" },
    });
    expect(winnerTx.length).toBe(1);
  });

  it("damages the losing character and never drops HP below zero", async () => {
    const { b } = await playFullFight(true);
    const uc = await prisma.userCharacter.findUniqueOrThrow({ where: { id: b.userCharacter.id } });
    expect(uc.currentHp).toBeLessThanOrEqual(b.userCharacter.currentHp);
    expect(uc.currentHp).toBeGreaterThanOrEqual(0);
  });

  it("prevents answering the same puzzle twice (replay guard)", async () => {
    await ensurePuzzles(10);
    const a = await makeUserWithCharacter();
    const b = await makeUserWithCharacter();
    const fight = await createFriendFight(a.user.id, b.user.id, a.userCharacter.id, b.userCharacter.id);
    const current = await prisma.fight.findUniqueOrThrow({ where: { id: fight.id } });
    const firstSlotUser = current.state === "PLAYER_1_TURN" ? a.user : b.user;

    const next = await presentNextPuzzle(fight.id, firstSlotUser.id);
    await submitAnswer({ fightId: fight.id, userId: firstSlotUser.id, fightAnswerId: next.fightAnswerId, selected: "A" });

    await expect(
      submitAnswer({ fightId: fight.id, userId: firstSlotUser.id, fightAnswerId: next.fightAnswerId, selected: "B" })
    ).rejects.toBeInstanceOf(FightError);
  });

  it("rejects an answer submitted by the wrong player", async () => {
    await ensurePuzzles(10);
    const a = await makeUserWithCharacter();
    const b = await makeUserWithCharacter();
    const fight = await createFriendFight(a.user.id, b.user.id, a.userCharacter.id, b.userCharacter.id);
    const current = await prisma.fight.findUniqueOrThrow({ where: { id: fight.id } });
    const activeUser = current.state === "PLAYER_1_TURN" ? a.user : b.user;
    const bystander = current.state === "PLAYER_1_TURN" ? b.user : a.user;

    const next = await presentNextPuzzle(fight.id, activeUser.id);
    await expect(
      submitAnswer({ fightId: fight.id, userId: bystander.id, fightAnswerId: next.fightAnswerId, selected: "A" })
    ).rejects.toBeInstanceOf(FightError);
  });

  it("double-challenge grants the doubled reward only on a correct answer, once", async () => {
    const { fight, a } = await playFullFight(true);

    const challenge = await startDoubleChallenge(fight.id, a.user.id);
    const puzzle = await prisma.puzzle.findUniqueOrThrow({ where: { id: challenge.puzzleId } });

    const { correct, totalReward } = await resolveDoubleChallenge(fight.id, a.user.id, challenge.puzzleId, puzzle.correct as "A" | "B");
    expect(correct).toBe(true);
    expect(totalReward).toBe(gameConfig.fight.doubleChallengeReward);
    expect(await getBalance(a.user.id)).toBe(gameConfig.fight.doubleChallengeReward);

    // Cannot resolve or cash out again after it's already been resolved.
    await expect(cashOut(fight.id, a.user.id)).rejects.toBeInstanceOf(FightError);
    await expect(startDoubleChallenge(fight.id, a.user.id)).rejects.toBeInstanceOf(FightError);
  });

  it("cash out keeps the original reward and blocks a later double attempt", async () => {
    const { fight, a } = await playFullFight(true);
    const { amount } = await cashOut(fight.id, a.user.id);
    expect(amount).toBe(gameConfig.fight.winReward);
    expect(await getBalance(a.user.id)).toBe(gameConfig.fight.winReward);
    await expect(startDoubleChallenge(fight.id, a.user.id)).rejects.toBeInstanceOf(FightError);
  });

  it("lets a player leave an active fight and awards the opponent a single forfeit win", async () => {
    await ensurePuzzles(10);
    const a = await makeUserWithCharacter();
    const b = await makeUserWithCharacter();
    const fight = await createFriendFight(a.user.id, b.user.id, a.userCharacter.id, b.userCharacter.id);

    const completed = await forfeitFight(fight.id, a.user.id);
    expect(completed.state).toBe("FINISHED");
    expect(completed.winnerId).toBe(b.user.id);
    expect(await getBalance(b.user.id)).toBe(gameConfig.fight.winReward);
    await expect(forfeitFight(fight.id, a.user.id)).rejects.toBeInstanceOf(FightError);
  });
});

describe("random matchmaking", () => {
  it("puts the first seeker in WAITING, then matches the second seeker and starts the fight", async () => {
    await ensurePuzzles(10);
    await clearStaleWaitingRandomFights();
    const a = await makeUserWithCharacter();
    const b = await makeUserWithCharacter();

    const first = await requestRandomFight(a.user.id, a.userCharacter.id);
    expect(first.state).toBe("WAITING");
    expect(first.player2Id).toBeNull();

    const second = await requestRandomFight(b.user.id, b.userCharacter.id);
    expect(["PLAYER_1_TURN", "PLAYER_2_TURN"]).toContain(second.state);
    expect(second.id).toBe(first.id);
  });

  it("prevents a user from having two active fights at once", async () => {
    await ensurePuzzles(10);
    await clearStaleWaitingRandomFights();

    const a = await makeUserWithCharacter();
    const b = await makeUserWithCharacter();
    const c = await makeUserWithCharacter();

    await requestRandomFight(a.user.id, a.userCharacter.id); // a is now WAITING
    await requestRandomFight(b.user.id, b.userCharacter.id); // matches with a, fight starts

    await expect(requestRandomFight(a.user.id, a.userCharacter.id)).rejects.toBeInstanceOf(FightError);
    await expect(requestRandomFight(c.user.id, c.userCharacter.id)).resolves.toBeDefined();
  });

  it("lets a seeker cancel their own waiting search and immediately search again", async () => {
    await clearStaleWaitingRandomFights();
    const a = await makeUserWithCharacter();
    const search = await requestRandomFight(a.user.id, a.userCharacter.id);
    expect(search.state).toBe("WAITING");

    const cancelled = await cancelRandomFight(a.user.id, search.id);
    expect(cancelled.state).toBe("CANCELLED");

    // No longer blocked by assertNoActiveFight since CANCELLED isn't an active state.
    const again = await requestRandomFight(a.user.id, a.userCharacter.id);
    expect(again.state).toBe("WAITING");
  });

  it("rejects cancelling someone else's search", async () => {
    const a = await makeUserWithCharacter();
    const b = await makeUserWithCharacter();
    const search = await requestRandomFight(a.user.id, a.userCharacter.id);
    await expect(cancelRandomFight(b.user.id, search.id)).rejects.toBeInstanceOf(FightError);
  });

  it("treats a stale WAITING search as expired and skips/cancels it during matchmaking", async () => {
    await clearStaleWaitingRandomFights();
    const a = await makeUserWithCharacter();
    const b = await makeUserWithCharacter();
    const search = await requestRandomFight(a.user.id, a.userCharacter.id);

    const staleCutoff = new Date(Date.now() - gameConfig.fight.randomQueueTtlMs - 1000);
    await prisma.fight.update({ where: { id: search.id }, data: { createdAt: staleCutoff } });

    // b's search should NOT match the stale entry — it should start its own new WAITING search.
    const bResult = await requestRandomFight(b.user.id, b.userCharacter.id);
    expect(bResult.id).not.toBe(search.id);
    expect(bResult.state).toBe("WAITING");

    const staleAfter = await prisma.fight.findUniqueOrThrow({ where: { id: search.id } });
    expect(staleAfter.state).toBe("CANCELLED");
  });
});
