import { Composer } from "grammy";
import type { BotContext } from "../session.js";
import { mainMenuKeyboard, backToMenuKeyboard, fightMenuKeyboard } from "../keyboards.js";
import { getOrCreateUser } from "../../services/userService.js";
import { getWeeklyLeaderboard, getPlayerRank } from "../../services/leaderboardService.js";
import { prisma } from "../../db/client.js";
import { acceptInvite, InviteError } from "../../services/inviteService.js";
import { announceFightState } from "../fightFlow.js";

export const menuComposer = new Composer<BotContext>();

const WELCOME =
  "🧩 *Project Helium*\n\nSolve puzzles, earn Helium, collect characters, and fight your way up the leaderboard.";

menuComposer.command("start", async (ctx) => {
  const user = await getOrCreateUser(String(ctx.from!.id), ctx.from?.username, ctx.from?.first_name);

  const payload = ctx.match;
  if (typeof payload === "string" && payload.startsWith("invite_")) {
    const code = payload.slice("invite_".length);
    if (!user.selectedUserCharacterId) {
      await ctx.reply("Select a character first (⚔️ Fight → Select Character), then tap the invite link again.", {
        reply_markup: fightMenuKeyboard,
      });
      return;
    }
    try {
      const fight = await acceptInvite(code, user.id, user.selectedUserCharacterId);
      await ctx.reply("⚔️ Challenge accepted! Fight starting...", { reply_markup: backToMenuKeyboard });
      await announceFightState(ctx.api, fight.id);
      return;
    } catch (err) {
      if (err instanceof InviteError) {
        await ctx.reply(`⚠️ ${err.message}`, { reply_markup: backToMenuKeyboard });
        return;
      }
      throw err;
    }
  }

  await ctx.reply(WELCOME, { parse_mode: "Markdown", reply_markup: mainMenuKeyboard });
});

menuComposer.callbackQuery("menu:main", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(WELCOME, { parse_mode: "Markdown", reply_markup: mainMenuKeyboard });
});

menuComposer.callbackQuery("menu:wallet", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getOrCreateUser(String(ctx.from.id), ctx.from.username, ctx.from.first_name);
  const recent = await prisma.currencyTransaction.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const reasonLabel: Record<string, string> = {
    PUZZLE_REWARD: "Puzzle",
    FIGHT_WIN: "Fight Win",
    DAILY_BOX: "Daily Box",
    DOUBLE_CHALLENGE: "Double Reward",
    CHARACTER_PURCHASE: "Character Purchase",
    CHARACTER_UPGRADE: "Character Upgrade",
    ADMIN: "Admin Adjustment",
  };

  let text = `💰 *Wallet*\n\nBalance: *${user.heliumBalance} Helium*\n\n`;
  if (recent.length === 0) {
    text += "No transactions yet.";
  } else {
    text += "Recent transactions:\n";
    text += recent
      .map((t) => `${t.amount > 0 ? "+" : ""}${t.amount} ${reasonLabel[t.reason] ?? t.reason}`)
      .join("\n");
  }

  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: backToMenuKeyboard });
});

menuComposer.callbackQuery("menu:profile", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getOrCreateUser(String(ctx.from.id), ctx.from.username, ctx.from.first_name);
  const winRate =
    user.fightsWon + user.fightsLost > 0
      ? ((user.fightsWon / (user.fightsWon + user.fightsLost)) * 100).toFixed(1)
      : "0.0";
  const characterCount = await prisma.userCharacter.count({ where: { userId: user.id } });
  const rank = await getPlayerRank(user.id);

  const text =
    `👤 *Profile*\n\n` +
    `💰 Helium: *${user.heliumBalance}*\n` +
    `🧩 Puzzles solved: *${user.puzzlesSolved}*\n` +
    `⚔️ Fights: *${user.fightsWon + user.fightsLost}*\n` +
    `🏆 Wins: *${user.fightsWon}*\n` +
    `💀 Losses: *${user.fightsLost}*\n` +
    `Win rate: *${winRate}%*\n` +
    `🧑‍🚀 Characters: *${characterCount}*\n` +
    `🏆 Rank: *${rank ? `#${rank.rank}` : "unranked"}*`;
  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: backToMenuKeyboard });
});

menuComposer.callbackQuery("menu:leaderboard", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getOrCreateUser(String(ctx.from.id), ctx.from.username, ctx.from.first_name);
  const top = await getWeeklyLeaderboard(10);
  const medals = ["🥇", "🥈", "🥉"];

  let text = "🏆 *HELIUM RANKING*\n\n";
  top.forEach((entry, i) => {
    const medal = medals[i] ?? `${i + 1}.`;
    const name = entry.user.displayName ?? entry.user.username ?? "Player";
    text += `${medal} ${name} — ${entry.heliumEarned}\n`;
  });

  const rank = await getPlayerRank(user.id);
  if (rank) {
    text += `\n👤 You — ${rank.entry.heliumEarned} (#${rank.rank})`;
  } else {
    text += `\n👤 You — 0 (unranked this week)`;
  }

  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: backToMenuKeyboard });
});
