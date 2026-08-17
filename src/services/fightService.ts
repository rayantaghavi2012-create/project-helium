import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../db/client.js";
import { gameConfig } from "../config/index.js";
import { calculateScore, pickWinnerSlot, rollStartingNumber } from "./scoringService.js";
import { applyCurrencyTransaction } from "./walletService.js";
import { applyDamage } from "./characterService.js";
import { bumpLeaderboard } from "./leaderboardService.js";
import { hintUsesForLevel, speedBonusMsForLevel } from "./upgradeService.js";

type Db = PrismaClient | Prisma.TransactionClient;

const ACTIVE_STATES = ["WAITING", "STARTING", "PLAYER_1_TURN", "PLAYER_2_TURN", "CALCULATING"];

export class FightError extends Error {}

async function hintUsesFor(db: Db, userCharacterId: string): Promise<number> {
  const uc = await db.userCharacter.findUnique({ where: { id: userCharacterId } });
  return hintUsesForLevel(uc?.powerLevel ?? 1);
}

async function assertNoActiveFight(userId: string, db: Db) {
  const active = await db.fight.findFirst({
    where: {
      state: { in: ACTIVE_STATES },
      OR: [{ player1Id: userId }, { player2Id: userId }],
    },
  });
  if (active) throw new FightError("You already have an active fight in progress.");
}

async function assertUsableCharacter(db: Db, userId: string, userCharacterId: string) {
  const uc = await db.userCharacter.findUnique({ where: { id: userCharacterId } });
  if (!uc || uc.userId !== userId) throw new FightError("You do not own that character.");
  if (uc.status !== "ACTIVE") throw new FightError("That character is defeated and cannot fight right now.");
}

export async function createFriendFight(
  challengerId: string,
  opponentId: string,
  challengerCharacterId: string,
  opponentCharacterId: string
) {
  if (challengerId === opponentId) throw new FightError("You cannot fight yourself.");

  return prisma.$transaction(async (tx) => {
    await assertUsableCharacter(tx, challengerId, challengerCharacterId);
    await assertUsableCharacter(tx, opponentId, opponentCharacterId);
    await assertNoActiveFight(challengerId, tx);
    await assertNoActiveFight(opponentId, tx);

    const fight = await tx.fight.create({
      data: {
        mode: "FRIEND",
        state: "WAITING",
        player1Id: challengerId,
        player2Id: opponentId,
      },
    });

    await tx.fightParticipant.create({
      data: {
        fightId: fight.id,
        userId: challengerId,
        slot: 1,
        userCharacterId: challengerCharacterId,
        hintUsesLeft: await hintUsesFor(tx, challengerCharacterId),
        speedUsesLeft: gameConfig.fight.startingSpeedUses,
      },
    });
    await tx.fightParticipant.create({
      data: {
        fightId: fight.id,
        userId: opponentId,
        slot: 2,
        userCharacterId: opponentCharacterId,
        hintUsesLeft: await hintUsesFor(tx, opponentCharacterId),
        speedUsesLeft: gameConfig.fight.startingSpeedUses,
      },
    });

    return startFight(fight.id, tx);
  });
}

/** Matchmaking: joins an already-waiting random fight, or opens a new one. */
export async function requestRandomFight(userId: string, userCharacterId: string) {
  return prisma.$transaction(async (tx) => {
    await assertUsableCharacter(tx, userId, userCharacterId);

    const queueCutoff = new Date(Date.now() - gameConfig.fight.randomQueueTtlMs);
    // Stale WAITING entries are auto-cancelled here (not just skipped) so they
    // don't linger and get matched later, and so their creator isn't left
    // permanently blocked from starting a new search by assertNoActiveFight.
    await tx.fight.updateMany({
      where: { mode: "RANDOM", state: "WAITING", createdAt: { lt: queueCutoff } },
      data: { state: "CANCELLED" },
    });

    await assertNoActiveFight(userId, tx);

    const waiting = await tx.fight.findFirst({
      where: { mode: "RANDOM", state: "WAITING", player2Id: null, player1Id: { not: userId } },
      orderBy: { createdAt: "asc" },
    });

    if (!waiting) {
      const fight = await tx.fight.create({
        data: { mode: "RANDOM", state: "WAITING", player1Id: userId },
      });
      await tx.fightParticipant.create({
        data: {
          fightId: fight.id,
          userId,
          slot: 1,
          userCharacterId,
          hintUsesLeft: await hintUsesFor(tx, userCharacterId),
          speedUsesLeft: gameConfig.fight.startingSpeedUses,
        },
      });
      return fight;
    }

    // Guard against joining a fight that another concurrent request already filled.
    const fresh = await tx.fight.findUniqueOrThrow({ where: { id: waiting.id } });
    if (fresh.state !== "WAITING" || fresh.player2Id) {
      throw new FightError("That match was just taken. Try again.");
    }

    await tx.fight.update({ where: { id: waiting.id }, data: { player2Id: userId } });
    await tx.fightParticipant.create({
      data: {
        fightId: waiting.id,
        userId,
        slot: 2,
        userCharacterId,
        hintUsesLeft: await hintUsesFor(tx, userCharacterId),
        speedUsesLeft: gameConfig.fight.startingSpeedUses,
      },
    });

    return startFight(waiting.id, tx);
  });
}

/** Lets a seeker cancel their own still-unmatched random-fight search. */
export async function cancelRandomFight(userId: string, fightId: string) {
  return prisma.$transaction(async (tx) => {
    const fight = await tx.fight.findUniqueOrThrow({ where: { id: fightId } });
    if (fight.mode !== "RANDOM") throw new FightError("This isn't a random-matchmaking search.");
    if (fight.player1Id !== userId) throw new FightError("You can only cancel your own search.");
    if (fight.state !== "WAITING") throw new FightError("This search is no longer waiting for a match.");

    const claim = await tx.fight.updateMany({
      where: { id: fightId, state: "WAITING" },
      data: { state: "CANCELLED" },
    });
    if (claim.count === 0) throw new FightError("This search was just matched or already cancelled.");

    return tx.fight.findUniqueOrThrow({ where: { id: fightId } });
  });
}

/** Ends an in-progress fight immediately and awards the win to the opponent. */
export async function forfeitFight(fightId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const fight = await tx.fight.findUniqueOrThrow({
      where: { id: fightId },
      include: { participants: true },
    });
    if (!["PLAYER_1_TURN", "PLAYER_2_TURN"].includes(fight.state)) {
      throw new FightError("This fight can no longer be left.");
    }

    const forfeitingPlayer = fight.participants.find((participant) => participant.userId === userId);
    const winner = fight.participants.find((participant) => participant.userId !== userId);
    if (!forfeitingPlayer || !winner) throw new FightError("You are not a participant in this fight.");

    // Claim the active state so a simultaneous answer cannot also finish and pay this fight.
    const claimed = await tx.fight.updateMany({
      where: { id: fightId, state: { in: ["PLAYER_1_TURN", "PLAYER_2_TURN"] } },
      data: {
        state: "FINISHED",
        winnerId: winner.userId,
        rewardGranted: true,
        finishedAt: new Date(),
      },
    });
    if (claimed.count === 0) throw new FightError("This fight was just completed.");

    await applyCurrencyTransaction(
      { userId: winner.userId, amount: gameConfig.fight.winReward, reason: "FIGHT_WIN", refId: fightId },
      tx
    );
    await tx.user.update({ where: { id: winner.userId }, data: { fightsWon: { increment: 1 } } });
    await tx.user.update({ where: { id: forfeitingPlayer.userId }, data: { fightsLost: { increment: 1 } } });
    await bumpLeaderboard(tx, winner.userId, { wins: 1, heliumEarned: gameConfig.fight.winReward });
    await bumpLeaderboard(tx, forfeitingPlayer.userId, { losses: 1 });

    return tx.fight.findUniqueOrThrow({ where: { id: fightId } });
  });
}

export async function startFight(fightId: string, db: Db = prisma) {
  const roll1 = rollStartingNumber();
  let roll2 = rollStartingNumber();
  while (roll2 === roll1) roll2 = rollStartingNumber(); // avoid an undecided tie on turn order

  const startingPlayer = roll1 > roll2 ? 1 : 2;

  const fight = await db.fight.update({
    where: { id: fightId },
    data: {
      state: startingPlayer === 1 ? "PLAYER_1_TURN" : "PLAYER_2_TURN",
      player1Roll: roll1,
      player2Roll: roll2,
      startingPlayer,
      currentTurn: startingPlayer,
      currentRound: 1,
    },
  });

  await db.fightTurn.create({
    data: { fightId, slot: startingPlayer, round: 1, status: "ACTIVE" },
  });

  return fight;
}

function slotStateName(slot: number) {
  return slot === 1 ? "PLAYER_1_TURN" : "PLAYER_2_TURN";
}

export async function presentNextPuzzle(fightId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const fight = await tx.fight.findUniqueOrThrow({ where: { id: fightId } });
    if (!ACTIVE_STATES.includes(fight.state) || !fight.currentTurn) {
      throw new FightError("Fight is not accepting puzzles right now.");
    }

    const participant = await tx.fightParticipant.findUniqueOrThrow({
      where: { fightId_slot: { fightId, slot: fight.currentTurn } },
    });
    if (participant.userId !== userId) throw new FightError("It is not your turn.");
    if (fight.state !== slotStateName(fight.currentTurn)) {
      throw new FightError("It is not your turn.");
    }

    let turn = await tx.fightTurn.findFirst({
      where: { fightId, slot: fight.currentTurn, round: fight.currentRound, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    });
    if (!turn) {
      turn = await tx.fightTurn.create({
        data: { fightId, slot: fight.currentTurn, round: fight.currentRound, status: "ACTIVE" },
      });
    }

    const presentedCount = await tx.fightAnswer.count({ where: { fightTurnId: turn.id } });
    if (presentedCount >= gameConfig.fight.puzzlesPerTurn) {
      throw new FightError("This turn's puzzles have already been presented.");
    }

    const usedPuzzleIds = (
      await tx.fightAnswer.findMany({
        where: { fightTurn: { fightId } },
        select: { puzzleId: true },
      })
    ).map((a) => a.puzzleId);

    const pool = await tx.puzzle.findMany({
      where: { active: true, id: { notIn: usedPuzzleIds } },
    });
    if (pool.length === 0) throw new FightError("No puzzles available.");
    const puzzle = pool[Math.floor(Math.random() * pool.length)];

    const fightAnswer = await tx.fightAnswer.create({
      data: {
        fightTurnId: turn.id,
        puzzleId: puzzle.id,
        slot: fight.currentTurn,
        selected: null,
        correct: false,
        responseMs: 0,
        difficulty: puzzle.difficulty,
      },
    });

    return {
      fightAnswerId: fightAnswer.id,
      puzzle: {
        id: puzzle.id,
        question: puzzle.question,
        answerA: puzzle.answerA,
        answerB: puzzle.answerB,
        hint: puzzle.hint,
        difficulty: puzzle.difficulty,
      },
      timeLimitMs: gameConfig.fight.puzzleTimeLimitMs,
      hintUsesLeft: participant.hintUsesLeft,
      speedUsesLeft: participant.speedUsesLeft,
      puzzleNumber: presentedCount + 1,
      puzzlesPerTurn: gameConfig.fight.puzzlesPerTurn,
    };
  });
}

export async function submitAnswer(params: {
  fightId: string;
  userId: string;
  fightAnswerId: string;
  selected: "A" | "B" | null;
  useSpeedBonus?: boolean;
}) {
  const { fightId, userId, fightAnswerId, selected, useSpeedBonus } = params;

  return prisma.$transaction(async (tx) => {
    const fight = await tx.fight.findUniqueOrThrow({ where: { id: fightId } });
    const answer = await tx.fightAnswer.findUniqueOrThrow({
      where: { id: fightAnswerId },
      include: { fightTurn: true, puzzle: true },
    });
    if (answer.fightTurn.fightId !== fightId) throw new FightError("Puzzle does not belong to this fight.");
    if (answer.answeredAt) throw new FightError("This puzzle was already answered."); // replay guard
    if (fight.currentTurn !== answer.slot || fight.state !== slotStateName(answer.slot)) {
      throw new FightError("It is no longer your turn for this puzzle.");
    }

    const participant = await tx.fightParticipant.findUniqueOrThrow({
      where: { fightId_slot: { fightId, slot: answer.slot } },
    });
    if (participant.userId !== userId) throw new FightError("This is not your answer to submit.");

    const now = new Date();
    let responseMs = now.getTime() - answer.presentedAt.getTime();
    const timedOut = responseMs > gameConfig.fight.puzzleTimeLimitMs;
    const effectiveSelected = timedOut ? null : selected;

    let speedBonusMs = 0;
    if (useSpeedBonus && !timedOut && participant.speedUsesLeft > 0) {
      const uc = participant.userCharacterId
        ? await tx.userCharacter.findUnique({ where: { id: participant.userCharacterId } })
        : null;
      speedBonusMs = speedBonusMsForLevel(uc?.speedLevel ?? 1);
      responseMs = Math.max(0, responseMs - speedBonusMs);
      await tx.fightParticipant.update({
        where: { id: participant.id },
        data: { speedUsesLeft: { decrement: 1 } },
      });
    }

    const correct = effectiveSelected === answer.puzzle.correct;

    await tx.fightAnswer.update({
      where: { id: answer.id },
      data: { selected: effectiveSelected, correct, responseMs, speedBonusMs, answeredAt: now },
    });

    await tx.fightParticipant.update({
      where: { id: participant.id },
      data: {
        correctCount: correct ? { increment: 1 } : undefined,
        totalTimeMs: { increment: responseMs },
      },
    });

    if (correct) {
      await tx.user.update({ where: { id: userId }, data: { puzzlesSolved: { increment: 1 } } });
      await bumpLeaderboard(tx, userId, { puzzlesSolved: 1 });
    }

    const answeredCount = await tx.fightAnswer.count({
      where: { fightTurnId: answer.fightTurnId, answeredAt: { not: null } },
    });

    let turnComplete = false;
    if (answeredCount >= gameConfig.fight.puzzlesPerTurn) {
      await tx.fightTurn.update({ where: { id: answer.fightTurnId }, data: { status: "COMPLETE" } });
      turnComplete = true;
      await advanceFight(fightId, tx);
    }

    return { correct, timedOut, responseMs, turnComplete };
  });
}

export async function useHint(fightId: string, userId: string, fightAnswerId: string) {
  return prisma.$transaction(async (tx) => {
    const answer = await tx.fightAnswer.findUniqueOrThrow({
      where: { id: fightAnswerId },
      include: { fightTurn: true, puzzle: true },
    });
    if (answer.fightTurn.fightId !== fightId) throw new FightError("Puzzle does not belong to this fight.");
    if (answer.answeredAt) throw new FightError("Too late to use a hint on this puzzle.");

    const participant = await tx.fightParticipant.findUniqueOrThrow({
      where: { fightId_slot: { fightId, slot: answer.slot } },
    });
    if (participant.userId !== userId) throw new FightError("Not your puzzle.");
    if (participant.hintUsesLeft <= 0) throw new FightError("No hint uses left.");

    await tx.fightParticipant.update({
      where: { id: participant.id },
      data: { hintUsesLeft: { decrement: 1 } },
    });
    await tx.fightAnswer.update({ where: { id: answer.id }, data: { hintUsed: true } });

    const wrongOption = answer.puzzle.correct === "A" ? "B" : "A";
    return { eliminated: wrongOption };
  });
}

async function advanceFight(fightId: string, tx: Prisma.TransactionClient) {
  const fight = await tx.fight.findUniqueOrThrow({ where: { id: fightId } });
  if (!fight.currentTurn || !fight.startingPlayer) return;

  const otherSlot = fight.currentTurn === 1 ? 2 : 1;
  const isSecondPlayerOfRound = fight.currentTurn !== fight.startingPlayer;

  if (!isSecondPlayerOfRound) {
    // First player of this round just finished; hand the round to the other player.
    await tx.fight.update({
      where: { id: fightId },
      data: { currentTurn: otherSlot, state: slotStateName(otherSlot) },
    });
    await tx.fightTurn.create({
      data: { fightId, slot: otherSlot, round: fight.currentRound, status: "ACTIVE" },
    });
    return;
  }

  if (fight.currentRound < gameConfig.fight.roundsPerFight) {
    const nextRound = fight.currentRound + 1;
    await tx.fight.update({
      where: { id: fightId },
      data: { currentRound: nextRound, currentTurn: fight.startingPlayer, state: slotStateName(fight.startingPlayer) },
    });
    await tx.fightTurn.create({
      data: { fightId, slot: fight.startingPlayer, round: nextRound, status: "ACTIVE" },
    });
    return;
  }

  await tx.fight.update({ where: { id: fightId }, data: { state: "CALCULATING" } });
  await finishFight(fightId, tx);
}

async function finishFight(fightId: string, tx: Prisma.TransactionClient) {
  const [p1, p2] = await Promise.all([
    tx.fightParticipant.findUniqueOrThrow({ where: { fightId_slot: { fightId, slot: 1 } } }),
    tx.fightParticipant.findUniqueOrThrow({ where: { fightId_slot: { fightId, slot: 2 } } }),
  ]);

  const totalPuzzles = gameConfig.fight.puzzlesPerTurn * gameConfig.fight.roundsPerFight;
  const score1 = calculateScore({ correctCount: p1.correctCount, totalPuzzles, totalTimeMs: p1.totalTimeMs });
  const score2 = calculateScore({ correctCount: p2.correctCount, totalPuzzles, totalTimeMs: p2.totalTimeMs });

  await tx.fightParticipant.update({ where: { id: p1.id }, data: { score: score1 } });
  await tx.fightParticipant.update({ where: { id: p2.id }, data: { score: score2 } });

  const winnerSlot = pickWinnerSlot(score1, score2, {
    correct1: p1.correctCount,
    correct2: p2.correctCount,
    time1: p1.totalTimeMs,
    time2: p2.totalTimeMs,
  });

  const winner = winnerSlot === 1 ? p1 : winnerSlot === 2 ? p2 : null;
  const loser = winnerSlot === 1 ? p2 : winnerSlot === 2 ? p1 : null;

  if (winner && loser) {
    if (loser.userCharacterId) {
      const wrongAnswers = await tx.fightAnswer.findMany({
        where: { fightTurn: { fightId }, slot: loser.slot, correct: false },
      });
      const damage = wrongAnswers.reduce(
        (sum, a) => sum + (gameConfig.fight.damageByDifficulty[a.difficulty] ?? 0),
        0
      );
      if (damage > 0) await applyDamage(loser.userCharacterId, damage, tx);
    }

    await applyCurrencyTransaction(
      { userId: winner.userId, amount: gameConfig.fight.winReward, reason: "FIGHT_WIN", refId: fightId },
      tx
    );

    await tx.user.update({ where: { id: winner.userId }, data: { fightsWon: { increment: 1 } } });
    await tx.user.update({ where: { id: loser.userId }, data: { fightsLost: { increment: 1 } } });
    await bumpLeaderboard(tx, winner.userId, { wins: 1, heliumEarned: gameConfig.fight.winReward });
    await bumpLeaderboard(tx, loser.userId, { losses: 1 });
  }

  await tx.fight.update({
    where: { id: fightId },
    data: {
      state: "FINISHED",
      winnerId: winner?.userId ?? null,
      rewardGranted: !!winner,
      finishedAt: new Date(),
    },
  });
}

export async function cashOut(fightId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const fight = await tx.fight.findUniqueOrThrow({ where: { id: fightId } });
    if (fight.winnerId !== userId) throw new FightError("Only the winner can cash out.");
    if (fight.state !== "FINISHED") throw new FightError("Nothing to cash out.");
    if (fight.doubleChallengeUsed) throw new FightError("This reward was already resolved.");

    await tx.fight.update({ where: { id: fightId }, data: { state: "CASHOUT", doubleChallengeUsed: true } });
    return { amount: gameConfig.fight.winReward };
  });
}

export async function startDoubleChallenge(fightId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const fight = await tx.fight.findUniqueOrThrow({ where: { id: fightId } });
    if (fight.winnerId !== userId) throw new FightError("Only the winner can double the reward.");
    if (fight.state !== "FINISHED") throw new FightError("Nothing to double.");
    if (fight.doubleChallengeUsed) throw new FightError("This reward was already resolved.");

    await tx.fight.update({ where: { id: fightId }, data: { state: "DOUBLE_CHALLENGE" } });

    const activeCount = await tx.puzzle.count({ where: { active: true } });
    if (activeCount === 0) throw new FightError("No puzzle available for the challenge.");
    const [puzzle] = await tx.puzzle.findMany({
      where: { active: true },
      take: 1,
      skip: Math.floor(Math.random() * activeCount),
    });
    if (!puzzle) throw new FightError("No puzzle available for the challenge.");

    return {
      puzzleId: puzzle.id,
      question: puzzle.question,
      answerA: puzzle.answerA,
      answerB: puzzle.answerB,
      timeLimitMs: gameConfig.fight.puzzleTimeLimitMs,
    };
  });
}

export async function resolveDoubleChallenge(
  fightId: string,
  userId: string,
  puzzleId: string,
  selected: "A" | "B" | null
) {
  return prisma.$transaction(async (tx) => {
    const fight = await tx.fight.findUniqueOrThrow({ where: { id: fightId } });
    if (fight.winnerId !== userId) throw new FightError("Only the winner can resolve this challenge.");
    if (fight.state !== "DOUBLE_CHALLENGE") throw new FightError("No active double challenge.");

    const puzzle = await tx.puzzle.findUniqueOrThrow({ where: { id: puzzleId } });
    const correct = selected === puzzle.correct;

    if (correct) {
      const bonus = gameConfig.fight.doubleChallengeReward - gameConfig.fight.winReward;
      await applyCurrencyTransaction(
        { userId, amount: bonus, reason: "DOUBLE_CHALLENGE", refId: fightId },
        tx
      );
    }

    await tx.fight.update({
      where: { id: fightId },
      data: { state: "FINISHED", doubleChallengeUsed: true },
    });

    return { correct, totalReward: correct ? gameConfig.fight.doubleChallengeReward : gameConfig.fight.winReward };
  });
}
