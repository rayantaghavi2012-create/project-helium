import { Composer } from "grammy";
import type { BotContext } from "../session.js";
import { backToMenuKeyboard, dailyBoxKeyboard } from "../keyboards.js";
import { getOrCreateUser } from "../../services/userService.js";
import { claimDailyBox, DailyBoxOnCooldownError } from "../../services/dailyBoxService.js";

export const dailyBoxComposer = new Composer<BotContext>();

dailyBoxComposer.callbackQuery("menu:dailybox", async (ctx) => {
  await ctx.answerCallbackQuery();
  await getOrCreateUser(String(ctx.from.id), ctx.from.username, ctx.from.first_name);
  await ctx.editMessageText("🎁 *DAILY BOX*\n\nOne free box every 24 hours.", {
    parse_mode: "Markdown",
    reply_markup: dailyBoxKeyboard,
  });
});

dailyBoxComposer.callbackQuery("dailybox:open", async (ctx) => {
  const user = await getOrCreateUser(String(ctx.from.id), ctx.from.username, ctx.from.first_name);

  try {
    const { reward, grantedCharacter } = await claimDailyBox(user.id);
    await ctx.answerCallbackQuery();

    if (reward.kind === "HELIUM") {
      await ctx.editMessageText(`✨ *REWARD*\n\n+${reward.amount} Helium`, {
        parse_mode: "Markdown",
        reply_markup: backToMenuKeyboard,
      });
    } else if (reward.kind === "CHARACTER" && grantedCharacter) {
      const { prisma } = await import("../../db/client.js");
      const template = await prisma.character.findUnique({ where: { id: grantedCharacter.characterId } });
      await ctx.editMessageText(
        `🧑‍🚀 *NEW CHARACTER*\n\n${template?.name}\n${template?.rarity}`,
        { parse_mode: "Markdown", reply_markup: backToMenuKeyboard }
      );
    } else {
      await ctx.editMessageText("✨ *REWARD*\n\nMystery item! (check your inventory later)", {
        parse_mode: "Markdown",
        reply_markup: backToMenuKeyboard,
      });
    }
  } catch (err) {
    await ctx.answerCallbackQuery();
    if (err instanceof DailyBoxOnCooldownError) {
      const hoursLeft = Math.ceil((err.nextAvailableAt.getTime() - Date.now()) / (60 * 60 * 1000));
      await ctx.editMessageText(`⏳ You already opened today's box. Try again in ~${hoursLeft}h.`, {
        reply_markup: backToMenuKeyboard,
      });
      return;
    }
    throw err;
  }
});
