import { Composer } from "grammy";
import type { BotContext } from "../session.js";
import { backToMenuKeyboard, fightMenuKeyboard, selectCharacterKeyboard } from "../keyboards.js";
import { getOrCreateUser } from "../../services/userService.js";
import { listOwnedCharacters } from "../../services/characterService.js";
import { setSelectedCharacter, setAwaitingFriendUsername, clearAwaitingFriendUsername } from "../../services/stateService.js";
import { createInvite, cancelInvite, InviteError } from "../../services/inviteService.js";
import {
  FightError,
  createFriendFight,
  requestRandomFight,
  cancelRandomFight,
  submitAnswer,
  useHint,
  cashOut,
  startDoubleChallenge,
  resolveDoubleChallenge,
} from "../../services/fightService.js";
import { announceFightState } from "../fightFlow.js";
import { prisma } from "../../db/client.js";

export const fightComposer = new Composer<BotContext>();

fightComposer.callbackQuery("menu:fight", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getOrCreateUser(String(ctx.from.id), ctx.from.username, ctx.from.first_name);
  const activeChar = user.selectedUserCharacterId ? "✅ character selected" : "⚠️ no character selected yet";
  await ctx.editMessageText(`⚔️ *Fight Menu*\n\n${activeChar}`, {
    parse_mode: "Markdown",
    reply_markup: fightMenuKeyboard,
  });
});

fightComposer.callbackQuery("fight:select_character", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getOrCreateUser(String(ctx.from.id), ctx.from.username, ctx.from.first_name);
  const owned = (await listOwnedCharacters(user.id)).filter((uc) => uc.status === "ACTIVE");

  if (owned.length === 0) {
    await ctx.editMessageText("You have no active characters. Buy one in the Shop first.", {
      reply_markup: backToMenuKeyboard,
    });
    return;
  }

  await ctx.editMessageText("Choose your fighter:", {
    reply_markup: selectCharacterKeyboard(
      owned.map((uc) => ({ id: uc.id, name: `${uc.character.name} (${uc.currentHp}/${uc.maxHp} HP)` })),
      "fight:pick"
    ),
  });
});

fightComposer.callbackQuery(/^fight:pick:(.+)$/, async (ctx) => {
  const [, userCharacterId] = ctx.match as unknown as [string, string];
  const user = await getOrCreateUser(String(ctx.from.id), ctx.from.username, ctx.from.first_name);
  await setSelectedCharacter(user.id, userCharacterId);
  await ctx.answerCallbackQuery({ text: "Character selected!" });
  await ctx.editMessageText("✅ Fighter selected.", { reply_markup: fightMenuKeyboard });
});

fightComposer.callbackQuery("fight:friend", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getOrCreateUser(String(ctx.from.id), ctx.from.username, ctx.from.first_name);
  if (!user.selectedUserCharacterId) {
    await ctx.editMessageText("Select a character first.", { reply_markup: fightMenuKeyboard });
    return;
  }

  const invite = await createInvite(user.id, user.selectedUserCharacterId);
  const botUsername = ctx.me.username;
  const link = `https://t.me/${botUsername}?start=invite_${invite.code}`;

  await ctx.editMessageText(
    `⚔️ *Challenge created!*\n\nSend this link to your friend — it expires in 15 minutes and works once:\n${link}\n\nOr they can also just @${ctx.from.username ?? "you"} you by username if they've already started this bot.`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "❌ Cancel Invite", callback_data: `fight:cancel_invite:${invite.code}` }],
          [{ text: "⬅️ Main Menu", callback_data: "menu:main" }],
        ],
      },
    }
  );
});

fightComposer.callbackQuery(/^fight:cancel_invite:(.+)$/, async (ctx) => {
  const [, code] = ctx.match as unknown as [string, string];
  const user = await getOrCreateUser(String(ctx.from.id), ctx.from.username, ctx.from.first_name);

  try {
    await cancelInvite(user.id, code);
    await ctx.answerCallbackQuery({ text: "Invite cancelled." });
    await ctx.editMessageText("❌ Invite cancelled.", { reply_markup: backToMenuKeyboard });
  } catch (err) {
    if (err instanceof InviteError) {
      await ctx.answerCallbackQuery({ text: err.message, show_alert: true });
      return;
    }
    throw err;
  }
});

fightComposer.on("message:text").filter(
  async (ctx) => {
    const user = await getOrCreateUser(String(ctx.from.id), ctx.from.username, ctx.from.first_name);
    return user.awaitingFriendUsername;
  },
  async (ctx) => {
    const challenger = await getOrCreateUser(String(ctx.from.id), ctx.from.username, ctx.from.first_name);
    await clearAwaitingFriendUsername(challenger.id);
    const username = ctx.message.text.replace(/^@/, "").trim();

    const opponent = await prisma.user.findFirst({ where: { username } });
    if (!opponent) {
      await ctx.reply("Couldn't find that player. They need to /start the bot first.", {
        reply_markup: backToMenuKeyboard,
      });
      return;
    }
    if (opponent.id === challenger.id) {
      await ctx.reply("You can't fight yourself.", { reply_markup: backToMenuKeyboard });
      return;
    }

    const opponentChar = (await listOwnedCharacters(opponent.id)).find((uc) => uc.status === "ACTIVE");
    if (!opponentChar) {
      await ctx.reply("That player has no active character to fight with.", {
        reply_markup: backToMenuKeyboard,
      });
      return;
    }

    try {
      const fight = await createFriendFight(
        challenger.id,
        opponent.id,
        challenger.selectedUserCharacterId!,
        opponentChar.id
      );
      await ctx.reply("⚔️ Fight started!", { reply_markup: backToMenuKeyboard });
      await announceFightState(ctx.api, fight.id);
    } catch (err) {
      if (err instanceof FightError) {
        await ctx.reply(`⚠️ ${err.message}`, { reply_markup: backToMenuKeyboard });
        return;
      }
      throw err;
    }
  }
);

fightComposer.callbackQuery("fight:friend_username", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getOrCreateUser(String(ctx.from.id), ctx.from.username, ctx.from.first_name);
  if (!user.selectedUserCharacterId) {
    await ctx.editMessageText("Select a character first.", { reply_markup: fightMenuKeyboard });
    return;
  }
  await setAwaitingFriendUsername(user.id, user.selectedUserCharacterId);
  await ctx.editMessageText("Send your friend's @username (they must have started this bot already).", {
    reply_markup: backToMenuKeyboard,
  });
});

fightComposer.callbackQuery("fight:random", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await getOrCreateUser(String(ctx.from.id), ctx.from.username, ctx.from.first_name);

  if (!user.selectedUserCharacterId) {
    await ctx.editMessageText("Select a character first.", { reply_markup: fightMenuKeyboard });
    return;
  }

  try {
    const fight = await requestRandomFight(user.id, user.selectedUserCharacterId);
    if (fight.state === "WAITING") {
      await ctx.editMessageText("🎲 Searching for an opponent... you'll be notified when a match is found.", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "❌ Cancel Search", callback_data: `fight:cancel_random:${fight.id}` }],
            [{ text: "⬅️ Main Menu", callback_data: "menu:main" }],
          ],
        },
      });
      return;
    }
    await ctx.editMessageText("🎲 Match found! Fight starting...", { reply_markup: backToMenuKeyboard });
    await announceFightState(ctx.api, fight.id);
  } catch (err) {
    if (err instanceof FightError) {
      await ctx.editMessageText(`⚠️ ${err.message}`, { reply_markup: backToMenuKeyboard });
      return;
    }
    throw err;
  }
});

fightComposer.callbackQuery(/^fight:cancel_random:(.+)$/, async (ctx) => {
  const [, fightId] = ctx.match as unknown as [string, string];
  const user = await getOrCreateUser(String(ctx.from.id), ctx.from.username, ctx.from.first_name);

  try {
    await cancelRandomFight(user.id, fightId);
    await ctx.answerCallbackQuery({ text: "Search cancelled." });
    await ctx.editMessageText("❌ Search cancelled.", { reply_markup: backToMenuKeyboard });
  } catch (err) {
    if (err instanceof FightError) {
      await ctx.answerCallbackQuery({ text: err.message, show_alert: true });
      return;
    }
    throw err;
  }
});

fightComposer.callbackQuery(/^ans:(.+):(A|B)$/, async (ctx) => {
  const [, fightAnswerId, selected] = ctx.match as unknown as [string, string, "A" | "B"];
  const user = await getOrCreateUser(String(ctx.from.id), ctx.from.username, ctx.from.first_name);

  const answer = await prisma.fightAnswer.findUnique({
    where: { id: fightAnswerId },
    include: { fightTurn: true },
  });
  if (!answer) {
    await ctx.answerCallbackQuery({ text: "This puzzle expired." });
    return;
  }

  try {
    const result = await submitAnswer({
      fightId: answer.fightTurn.fightId,
      userId: user.id,
      fightAnswerId,
      selected,
    });
    await ctx.answerCallbackQuery({ text: result.correct ? "✅ Correct!" : "❌ Incorrect" });
    await ctx.editMessageText(result.correct ? "✅ Correct!" : "❌ Incorrect.", { reply_markup: undefined });

    if (result.turnComplete) {
      await announceFightState(ctx.api, answer.fightTurn.fightId);
    }
  } catch (err) {
    if (err instanceof FightError) {
      await ctx.answerCallbackQuery({ text: err.message, show_alert: true });
      return;
    }
    throw err;
  }
});

fightComposer.callbackQuery(/^hint:(.+)$/, async (ctx) => {
  const [, fightAnswerId] = ctx.match as unknown as [string, string];
  const user = await getOrCreateUser(String(ctx.from.id), ctx.from.username, ctx.from.first_name);

  const answer = await prisma.fightAnswer.findUnique({
    where: { id: fightAnswerId },
    include: { fightTurn: true },
  });
  if (!answer) {
    await ctx.answerCallbackQuery({ text: "This puzzle expired." });
    return;
  }

  try {
    const { eliminated } = await useHint(answer.fightTurn.fightId, user.id, fightAnswerId);
    await ctx.answerCallbackQuery({
      text: `💡 HINT: Option ${eliminated} is incorrect.`,
      show_alert: true,
    });
  } catch (err) {
    if (err instanceof FightError) {
      await ctx.answerCallbackQuery({ text: err.message, show_alert: true });
      return;
    }
    throw err;
  }
});

fightComposer.callbackQuery(/^double:cashout:(.+)$/, async (ctx) => {
  const [, fightId] = ctx.match as unknown as [string, string];
  const user = await getOrCreateUser(String(ctx.from.id), ctx.from.username, ctx.from.first_name);

  try {
    const { amount } = await cashOut(fightId, user.id);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(`💰 Cashed out +${amount} Helium.`, { reply_markup: backToMenuKeyboard });
  } catch (err) {
    if (err instanceof FightError) {
      await ctx.answerCallbackQuery({ text: err.message, show_alert: true });
      return;
    }
    throw err;
  }
});

fightComposer.callbackQuery(/^double:start:(.+)$/, async (ctx) => {
  const [, fightId] = ctx.match as unknown as [string, string];
  const user = await getOrCreateUser(String(ctx.from.id), ctx.from.username, ctx.from.first_name);

  try {
    const challenge = await startDoubleChallenge(fightId, user.id);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `🎲 *Double or Nothing*\n\nThis uses only your in-game Helium — no real money, no deposits.\nAnswer correctly to double your reward, or get nothing extra.\n\n${challenge.question}`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: `A) ${challenge.answerA}`, callback_data: `double:ans:${fightId}:${challenge.puzzleId}:A` },
              { text: `B) ${challenge.answerB}`, callback_data: `double:ans:${fightId}:${challenge.puzzleId}:B` },
            ],
          ],
        },
      }
    );
  } catch (err) {
    if (err instanceof FightError) {
      await ctx.answerCallbackQuery({ text: err.message, show_alert: true });
      return;
    }
    throw err;
  }
});

fightComposer.callbackQuery(/^double:ans:(.+):(.+):(A|B)$/, async (ctx) => {
  const [, fightId, puzzleId, selected] = ctx.match as unknown as [string, string, string, "A" | "B"];
  const user = await getOrCreateUser(String(ctx.from.id), ctx.from.username, ctx.from.first_name);

  try {
    const { correct, totalReward } = await resolveDoubleChallenge(fightId, user.id, puzzleId, selected);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      correct
        ? `🎉 Correct! Total reward: +${totalReward} Helium`
        : `😬 Wrong. You keep your original reward: +${totalReward} Helium`,
      { reply_markup: backToMenuKeyboard }
    );
  } catch (err) {
    if (err instanceof FightError) {
      await ctx.answerCallbackQuery({ text: err.message, show_alert: true });
      return;
    }
    throw err;
  }
});
