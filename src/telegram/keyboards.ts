import { InlineKeyboard } from "grammy";

export const mainMenuKeyboard = new InlineKeyboard()
  .text("🧩 Daily Puzzle", "menu:puzzle")
  .text("🎁 Daily Box", "menu:dailybox")
  .row()
  .text("🧑‍🚀 Characters", "menu:characters")
  .text("⚔️ Fight", "menu:fight")
  .row()
  .text("🏆 Leaderboard", "menu:leaderboard")
  .text("💰 Wallet", "menu:wallet")
  .row()
  .text("📖 Profile", "menu:profile");

export const backToMenuKeyboard = new InlineKeyboard().text("⬅️ Main Menu", "menu:main");

export const fightMenuKeyboard = new InlineKeyboard()
  .text("⚔️ Fight Friend (link)", "fight:friend")
  .text("👤 Fight Friend (@username)", "fight:friend_username")
  .row()
  .text("🎲 Random Fight", "fight:random")
  .row()
  .text("🧑‍🚀 Select Character", "fight:select_character")
  .row()
  .text("⬅️ Main Menu", "menu:main");

export const characterMenuKeyboard = new InlineKeyboard()
  .text("🧑‍🚀 My Characters", "char:mine")
  .text("🛒 Shop", "char:shop")
  .row()
  .text("⬆️ Upgrade", "char:upgrade_pick")
  .row()
  .text("⬅️ Main Menu", "menu:main");

export function upgradeCharacterKeyboard(userCharacterId: string, options: { stat: string; label: string; disabled: boolean }[]) {
  const kb = new InlineKeyboard();
  for (const o of options) {
    kb.text(o.disabled ? `${o.label} (MAX)` : o.label, `char:upgrade:${userCharacterId}:${o.stat}`).row();
  }
  kb.text("⬅️ Characters", "menu:characters");
  return kb;
}

export function puzzleAnswerKeyboard(fightAnswerId: string, a: string, b: string, allowHint: boolean) {
  const kb = new InlineKeyboard()
    .text(`A) ${a}`, `ans:${fightAnswerId}:A`)
    .text(`B) ${b}`, `ans:${fightAnswerId}:B`);
  if (allowHint) kb.row().text("💡 Use Hint", `hint:${fightAnswerId}`);
  return kb;
}

export function dailyPuzzleAnswerKeyboard(puzzleId: string, a: string, b: string) {
  return new InlineKeyboard()
    .text(`A) ${a}`, `dpans:${puzzleId}:A`)
    .text(`B) ${b}`, `dpans:${puzzleId}:B`);
}

export const dailyBoxKeyboard = new InlineKeyboard().text("🎁 OPEN BOX", "dailybox:open");

export function doubleChallengeKeyboard(fightId: string) {
  return new InlineKeyboard()
    .text("💰 CASH OUT", `double:cashout:${fightId}`)
    .text("🎲 DOUBLE THE REWARD", `double:start:${fightId}`);
}

export function shopKeyboard(items: { key: string; name: string; price: number }[]) {
  const kb = new InlineKeyboard();
  for (const item of items) {
    kb.text(`${item.name} — ${item.price} He`, `char:buy:${item.key}`).row();
  }
  kb.text("⬅️ Characters", "menu:characters");
  return kb;
}

export function selectCharacterKeyboard(chars: { id: string; name: string }[], prefix: string) {
  const kb = new InlineKeyboard();
  for (const c of chars) {
    kb.text(c.name, `${prefix}:${c.id}`).row();
  }
  kb.text("⬅️ Main Menu", "menu:main");
  return kb;
}
