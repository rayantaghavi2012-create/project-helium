import { Composer } from "grammy";
import type { BotContext } from "../session.js";
import { env } from "../../config/index.js";
import { prisma } from "../../db/client.js";

export const adminComposer = new Composer<BotContext>();

function isAdmin(ctx: BotContext): boolean {
  const id = ctx.from?.id;
  return !!id && env.adminTelegramIds.includes(String(id));
}

adminComposer.command("addpuzzle", async (ctx, next) => {
  if (!isAdmin(ctx)) return next();

  const body = ctx.match?.toString().trim();
  if (!body) {
    await ctx.reply(
      "Usage:\n/addpuzzle Question|AnswerA|AnswerB|Correct(A/B)|Difficulty|Category|Explanation|Hint(optional)"
    );
    return;
  }

  const parts = body.split("|").map((p) => p.trim());
  const [question, answerA, answerB, correctRaw, difficultyRaw, category, explanation, hint] = parts;
  const correct = correctRaw?.toUpperCase();
  const difficulty = difficultyRaw?.toUpperCase();

  if (!question || !answerA || !answerB || (correct !== "A" && correct !== "B") || !category) {
    await ctx.reply("Invalid format. See /addpuzzle with no arguments for usage.");
    return;
  }
  if (!["EASY", "MEDIUM", "HARD", "SPECIAL"].includes(difficulty ?? "")) {
    await ctx.reply("Difficulty must be EASY, MEDIUM, HARD, or SPECIAL.");
    return;
  }

  const puzzle = await prisma.puzzle.create({
    data: { question, answerA, answerB, correct, difficulty, category, explanation: explanation || null, hint: hint || null },
  });
  await ctx.reply(`✅ Puzzle created: ${puzzle.id}`);
});

adminComposer.command("deactivatepuzzle", async (ctx, next) => {
  if (!isAdmin(ctx)) return next();
  const id = ctx.match?.toString().trim();
  if (!id) {
    await ctx.reply("Usage: /deactivatepuzzle <puzzleId>");
    return;
  }
  const puzzle = await prisma.puzzle.findUnique({ where: { id } });
  if (!puzzle) {
    await ctx.reply("No puzzle with that id.");
    return;
  }
  await prisma.puzzle.update({ where: { id }, data: { active: false } });
  await ctx.reply(`✅ Puzzle ${id} deactivated.`);
});

adminComposer.command("activatepuzzle", async (ctx, next) => {
  if (!isAdmin(ctx)) return next();
  const id = ctx.match?.toString().trim();
  if (!id) {
    await ctx.reply("Usage: /activatepuzzle <puzzleId>");
    return;
  }
  const puzzle = await prisma.puzzle.findUnique({ where: { id } });
  if (!puzzle) {
    await ctx.reply("No puzzle with that id.");
    return;
  }
  await prisma.puzzle.update({ where: { id }, data: { active: true } });
  await ctx.reply(`✅ Puzzle ${id} activated.`);
});

adminComposer.command("inspectpuzzle", async (ctx, next) => {
  if (!isAdmin(ctx)) return next();
  const id = ctx.match?.toString().trim();
  if (!id) {
    await ctx.reply("Usage: /inspectpuzzle <puzzleId>");
    return;
  }
  const puzzle = await prisma.puzzle.findUnique({ where: { id } });
  if (!puzzle) {
    await ctx.reply("No puzzle with that id.");
    return;
  }
  await ctx.reply(
    `ID: ${puzzle.id}\nActive: ${puzzle.active}\nDifficulty: ${puzzle.difficulty}\nCategory: ${puzzle.category}\n\n` +
      `Q: ${puzzle.question}\nA) ${puzzle.answerA}\nB) ${puzzle.answerB}\nCorrect: ${puzzle.correct}\n` +
      `Explanation: ${puzzle.explanation ?? "-"}\nHint: ${puzzle.hint ?? "-"}`
  );
});

adminComposer.command("puzzlestats", async (ctx, next) => {
  if (!isAdmin(ctx)) return next();
  const total = await prisma.puzzle.count();
  const active = await prisma.puzzle.count({ where: { active: true } });
  const byDifficulty = await prisma.puzzle.groupBy({ by: ["difficulty"], _count: true });
  const lines = byDifficulty.map((d) => `${d.difficulty}: ${d._count}`).join("\n");
  await ctx.reply(`Total: ${total}\nActive: ${active}\n\n${lines}`);
});
