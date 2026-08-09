import { Composer } from "grammy";
import type { BotContext } from "../session.js";
import { backToMenuKeyboard, characterMenuKeyboard, shopKeyboard, selectCharacterKeyboard, upgradeCharacterKeyboard } from "../keyboards.js";
import { getOrCreateUser } from "../../services/userService.js";
import {
  listOwnedCharacters,
  listShopCharacters,
  purchaseCharacter,
} from "../../services/characterService.js";
import { InsufficientBalanceError } from "../../services/walletService.js";
import { previewUpgrade, upgradeCharacter, UpgradeError, UpgradeStat } from "../../services/upgradeService.js";
import { prisma } from "../../db/client.js";

export const charactersComposer = new Composer<BotContext>();

charactersComposer.callbackQuery("menu:characters", async (ctx) => {
  await ctx.answerCallbackQuery();
  await getOrCreateUser(String(ctx.from.id), ctx.from.username, ctx.from.first_name);
  await ctx.editMessageText("🧑‍🚀 *Characters*", { parse_mode: "Markdown", reply_markup: characterMenuKeyboard });
});

charactersComposer.callbackQuery("char:mine", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getOrCreateUser(String(ctx.from.id), ctx.from.username, ctx.from.first_name);
  const owned = await listOwnedCharacters(user.id);

  if (owned.length === 0) {
    await ctx.editMessageText("You don't own any characters yet. Visit the Shop!", {
      reply_markup: backToMenuKeyboard,
    });
    return;
  }

  const text = owned
    .map(
      (uc) =>
        `🧑‍🚀 *${uc.character.name}* (${uc.character.rarity})\n` +
        `❤️ HP: ${uc.currentHp}/${uc.maxHp}  ⚡ Speed: ${uc.speed}  💥 Power: ${uc.power}\n` +
        `Status: ${uc.status}`
    )
    .join("\n\n");

  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: backToMenuKeyboard });
});

charactersComposer.callbackQuery("char:shop", async (ctx) => {
  await ctx.answerCallbackQuery();
  const templates = await listShopCharacters();
  await ctx.editMessageText("🛒 *Character Shop*", {
    parse_mode: "Markdown",
    reply_markup: shopKeyboard(templates.map((t) => ({ key: t.key, name: t.name, price: t.price }))),
  });
});

charactersComposer.callbackQuery(/^char:buy:(.+)$/, async (ctx) => {
  const [, key] = ctx.match as unknown as [string, string];
  const user = await getOrCreateUser(String(ctx.from.id), ctx.from.username, ctx.from.first_name);

  // The callback_query id is unique per tap, so it's a safe idempotency key
  // against Telegram redelivering/duplicating the same callback.
  const refId = ctx.callbackQuery.id;

  try {
    await purchaseCharacter(user.id, key, refId);
    await ctx.answerCallbackQuery({ text: "Purchased!" });
    await ctx.editMessageText("✅ Character purchased! Check 'My Characters'.", {
      reply_markup: backToMenuKeyboard,
    });
  } catch (err) {
    if (err instanceof InsufficientBalanceError) {
      await ctx.answerCallbackQuery({ text: "Not enough Helium.", show_alert: true });
      return;
    }
    throw err;
  }
});

charactersComposer.callbackQuery("char:upgrade_pick", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getOrCreateUser(String(ctx.from.id), ctx.from.username, ctx.from.first_name);
  const owned = await listOwnedCharacters(user.id);

  if (owned.length === 0) {
    await ctx.editMessageText("You don't own any characters yet.", { reply_markup: backToMenuKeyboard });
    return;
  }

  await ctx.editMessageText("Choose a character to upgrade:", {
    reply_markup: selectCharacterKeyboard(
      owned.map((uc) => ({ id: uc.id, name: uc.character.name })),
      "char:upgrade_view"
    ),
  });
});

async function renderUpgradeScreen(ctx: BotContext, userCharacterId: string) {
  const uc = await prisma.userCharacter.findUniqueOrThrow({
    where: { id: userCharacterId },
    include: { character: true },
  });

  const stats: { stat: UpgradeStat; label: string; level: number; current: number }[] = [
    { stat: "hp", label: "HP", level: uc.hpLevel, current: uc.maxHp },
    { stat: "power", label: "Power", level: uc.powerLevel, current: uc.power },
    { stat: "speed", label: "Speed", level: uc.speedLevel, current: uc.speed },
  ];

  let text = `🧑‍🚀 *${uc.character.name}* (Lv. HP ${uc.hpLevel} / Pwr ${uc.powerLevel} / Spd ${uc.speedLevel})\n\n`;
  const options: { stat: string; label: string; disabled: boolean }[] = [];

  for (const s of stats) {
    const preview = previewUpgrade(s.level, s.stat);
    if (!preview) {
      text += `${s.label}: ${s.current} (MAX)\n`;
      options.push({ stat: s.stat, label: `⬆️ ${s.label}`, disabled: true });
    } else {
      text += `${s.label}: level ${s.level} → ${preview.nextLevel} — Cost: ${preview.cost} Helium\n`;
      options.push({ stat: s.stat, label: `⬆️ ${s.label} (${preview.cost} He)`, disabled: false });
    }
  }

  await ctx.editMessageText(text, {
    parse_mode: "Markdown",
    reply_markup: upgradeCharacterKeyboard(userCharacterId, options),
  });
}

charactersComposer.callbackQuery(/^char:upgrade_view:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const [, userCharacterId] = ctx.match as unknown as [string, string];
  await renderUpgradeScreen(ctx, userCharacterId);
});

charactersComposer.callbackQuery(/^char:upgrade:(.+):(hp|power|speed)$/, async (ctx) => {
  const [, userCharacterId, stat] = ctx.match as unknown as [string, string, UpgradeStat];
  const user = await getOrCreateUser(String(ctx.from.id), ctx.from.username, ctx.from.first_name);
  const refId = ctx.callbackQuery.id;

  try {
    await upgradeCharacter(user.id, userCharacterId, stat, refId);
    await ctx.answerCallbackQuery({ text: "Upgraded!" });
    await renderUpgradeScreen(ctx, userCharacterId);
  } catch (err) {
    if (err instanceof InsufficientBalanceError) {
      await ctx.answerCallbackQuery({ text: "Not enough Helium.", show_alert: true });
      return;
    }
    if (err instanceof UpgradeError) {
      await ctx.answerCallbackQuery({ text: err.message, show_alert: true });
      return;
    }
    throw err;
  }
});
