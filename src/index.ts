import { createBot } from "./telegram/bot.js";
import { expireTimedOutFights } from "./services/fightService.js";
import { announceFightState } from "./telegram/fightFlow.js";

async function main() {
  const bot = createBot();
  console.log("Project Helium bot starting...");
  const expireAndAnnounce = async () => {
    const expiredIds = await expireTimedOutFights();
    await Promise.all(expiredIds.map((fightId) => announceFightState(bot.api, fightId)));
  };
  await expireAndAnnounce(); // also clears matches that expired while the app was offline
  setInterval(() => void expireAndAnnounce().catch((err) => console.error("Fight timeout sweep failed:", err)), 5_000);
  await bot.start();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
