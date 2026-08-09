import type { Api } from "grammy";
import { prisma } from "../db/client.js";
import { presentNextPuzzle } from "../services/fightService.js";
import { puzzleAnswerKeyboard, doubleChallengeKeyboard, backToMenuKeyboard } from "./keyboards.js";
import { gameConfig } from "../config/index.js";

type FightWithParticipants = NonNullable<Awaited<ReturnType<typeof loadFight>>>;
type Participant = FightWithParticipants["participants"][number];

function loadFight(fightId: string) {
  return prisma.fight.findUniqueOrThrow({
    where: { id: fightId },
    include: {
      participants: { include: { user: true, userCharacter: { include: { character: true } } } },
    },
  });
}

/** Pushes whatever the fight needs next (a puzzle, a wait notice, or final results) to both players. */
export async function announceFightState(api: Api, fightId: string) {
  const fight = await loadFight(fightId);

  if (fight.state === "PLAYER_1_TURN" || fight.state === "PLAYER_2_TURN") {
    const activeSlot = fight.state === "PLAYER_1_TURN" ? 1 : 2;
    const active = fight.participants.find((p) => p.slot === activeSlot)!;
    const waiting = fight.participants.find((p) => p.slot !== activeSlot)!;

    await safeSend(api, waiting.user.telegramId, "⏳ Waiting for your opponent's move...");
    await sendNextPuzzleTo(api, fightId, active);
    return;
  }

  if (fight.state === "FINISHED") {
    const p1 = fight.participants.find((p) => p.slot === 1)!;
    const p2 = fight.participants.find((p) => p.slot === 2)!;
    const totalPuzzles = gameConfig.fight.puzzlesPerTurn * gameConfig.fight.roundsPerFight;

    const summarize = (p: Participant) =>
      `✅ ${p.correctCount}/${totalPuzzles}\n⏱️ ${(p.totalTimeMs / 1000).toFixed(1)}s\nScore: ${p.score ?? 0}`;

    const winnerLine = fight.winnerId
      ? fight.winnerId === p1.userId
        ? "🏆 PLAYER 1 WINS"
        : "🏆 PLAYER 2 WINS"
      : "🤝 DRAW — no winner this time";

    for (const p of fight.participants) {
      const opponent = p.slot === 1 ? p2 : p1;
      let text =
        `⚔️ *FIGHT COMPLETE*\n\n` +
        `YOU\n${summarize(p)}\n\n` +
        `OPPONENT\n${summarize(opponent)}\n\n` +
        winnerLine;

      let keyboard = backToMenuKeyboard;
      if (fight.winnerId === p.userId) {
        text += `\n\n🏆 YOU WIN!\n💰 +${gameConfig.fight.winReward} Helium`;
        keyboard = doubleChallengeKeyboard(fight.id) as unknown as typeof backToMenuKeyboard;
      }
      if (fight.winnerId && fight.winnerId !== p.userId && p.userCharacter) {
        text += `\n\nYour ${p.userCharacter.character.name} took damage.\n❤️ HP: ${p.userCharacter.currentHp}/${p.userCharacter.maxHp}`;
        if (p.userCharacter.status === "DEFEATED") {
          text += `\n💀 ${p.userCharacter.character.name} is defeated. Upgrade its HP to bring it back into action.`;
        }
      }
      await safeSend(api, p.user.telegramId, text, keyboard);
    }
  }
}

async function sendNextPuzzleTo(api: Api, fightId: string, participant: Participant) {
  const next = await presentNextPuzzle(fightId, participant.userId);
  const hpLine = participant.userCharacter
    ? `${participant.userCharacter.character.name} ❤️ ${participant.userCharacter.currentHp}/${participant.userCharacter.maxHp}\n`
    : "";
  const text =
    `⚔️ *YOUR TURN*\n\n${hpLine}Puzzle ${next.puzzleNumber}/${next.puzzlesPerTurn} (${next.puzzle.difficulty})\n\n${next.puzzle.question}`;
  const allowHint = next.hintUsesLeft > 0;
  await safeSend(
    api,
    participant.user.telegramId,
    text,
    puzzleAnswerKeyboard(next.fightAnswerId, next.puzzle.answerA, next.puzzle.answerB, allowHint)
  );
}

export async function sendNextPuzzleForTurn(api: Api, fightId: string, userId: string) {
  const fight = await loadFight(fightId);
  const participant = fight.participants.find((p) => p.userId === userId);
  if (!participant) return;
  await sendNextPuzzleTo(api, fightId, participant);
}

async function safeSend(api: Api, telegramId: string, text: string, keyboard?: unknown) {
  try {
    await api.sendMessage(telegramId, text, {
      parse_mode: "Markdown",
      ...(keyboard ? { reply_markup: keyboard as never } : {}),
    });
  } catch {
    // Opponent may not have started a chat with the bot yet, or blocked it — non-fatal.
  }
}
