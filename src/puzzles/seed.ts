import { prisma } from "../db/client.js";
import { puzzleSeeds } from "./data.js";
import { characterSeeds } from "../characters/data.js";

async function main() {
  for (const p of puzzleSeeds) {
    const existing = await prisma.puzzle.findFirst({ where: { question: p.question } });
    if (existing) continue;
    await prisma.puzzle.create({ data: { ...p } });
  }

  for (const c of characterSeeds) {
    await prisma.character.upsert({
      where: { key: c.key },
      update: { ...c },
      create: { ...c },
    });
  }

  console.log(`Seeded ${puzzleSeeds.length} puzzles and ${characterSeeds.length} characters.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
