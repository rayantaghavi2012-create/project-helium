import { Bot } from "grammy";
import { env } from "../config/index.js";
import { type BotContext } from "./session.js";
import { menuComposer } from "./handlers/menu.js";
import { puzzleComposer } from "./handlers/puzzle.js";
import { dailyBoxComposer } from "./handlers/dailybox.js";
import { charactersComposer } from "./handlers/characters.js";
import { fightComposer } from "./handlers/fight.js";
import { adminComposer } from "./handlers/admin.js";

export function createBot(): Bot<BotContext> {
  if (!env.botToken) throw new Error("TELEGRAM_BOT_TOKEN is not set");

  const bot = new Bot<BotContext>(env.botToken);

  bot.use(adminComposer);
  bot.use(menuComposer);
  bot.use(puzzleComposer);
  bot.use(dailyBoxComposer);
  bot.use(charactersComposer);
  bot.use(fightComposer);

  bot.catch((err) => {
    console.error("Unhandled bot error:", err.error);
  });

  return bot;
}
