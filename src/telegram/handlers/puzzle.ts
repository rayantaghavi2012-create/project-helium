import { Composer } from "grammy";
import type { BotContext } from "../session.js";
import { backToMenuKeyboard, dailyPuzzleAnswerKeyboard } from "../keyboards.js";
import { getOrCreateUser } from "../../services/userService.js";
import { getRandomPuzzle, rewardDailyPuzzleSolve } from "../../services/puzzleService.js";
import { prisma } from "../../db/client.js";

export const puzzleComposer = new Composer<BotContext>();

puzzleComposer.callbackQuery("menu:puzzle", async (ctx) => {
  await ctx.answerCallbackQuery();
  await getOrCreateUser(String(ctx.from.id), ctx.from.username, ctx.from.first_name);

  const puzzle = await getRandomPuzzle();
  if (!puzzle) {
    await ctx.editMessageText("No puzzles available right now.", { reply_markup: backToMenuKeyboard });
    return;
  }

  await ctx.editMessageText(`🧩 *Puzzle* (${puzzle.difficulty})\n\n${puzzle.question}`, {
    parse_mode: "Markdown",
    reply_markup: dailyPuzzleAnswerKeyboard(puzzle.id, puzzle.answerA, puzzle.answerB),
  });
});

puzzleComposer.callbackQuery(/^dpans:(.+):(A|B)$/, async (ctx) => {
  const [, puzzleId, selected] = ctx.match as unknown as [string, string, "A" | "B"];
  const user = await getOrCreateUser(String(ctx.from.id), ctx.from.username, ctx.from.first_name);
  await ctx.answerCallbackQuery();

  const p = await prisma.puzzle.findUnique({ where: { id: puzzleId } });
  if (!p) {
    await ctx.editMessageText("This puzzle is no longer available.", { reply_markup: backToMenuKeyboard });
    return;
  }

  const correct = selected === p.correct;
  if (correct) {
    const { amount } = await rewardDailyPuzzleSolve(user.id, p.id, p.difficulty);
    await ctx.editMessageText(`✅ *Correct!*\n\n+${amount} Helium`, {
      parse_mode: "Markdown",
      reply_markup: backToMenuKeyboard,
    });
  } else {
    await ctx.editMessageText(
      `❌ *Not quite.*\n\nCorrect answer: ${p.correct}\n${p.explanation ?? ""}`.trim(),
      { parse_mode: "Markdown", reply_markup: backToMenuKeyboard }
    );
  }
});
