import { createBot } from "./telegram/bot.js";

async function main() {
  const bot = createBot();
  console.log("Project Helium bot starting...");
  await bot.start();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
