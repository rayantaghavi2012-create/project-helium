import { randomUUID } from "node:crypto";
import { prisma } from "../src/db/client.js";
import { getOrCreateUser } from "../src/services/userService.js";
import { grantCharacter } from "../src/services/characterService.js";

export async function makeUser() {
  return getOrCreateUser(`tg-${randomUUID()}`, `user_${randomUUID().slice(0, 8)}`);
}

export async function ensureTemplateCharacter() {
  const key = "test-rookie";
  return prisma.character.upsert({
    where: { key },
    update: {},
    create: {
      key,
      name: "Test Rookie",
      rarity: "COMMON",
      price: 100,
      baseMaxHp: 100,
      basePower: 1,
      baseSpeed: 1,
      ability: "NONE",
    },
  });
}

export async function makeUserWithCharacter() {
  const user = await makeUser();
  const template = await ensureTemplateCharacter();
  const uc = await grantCharacter(user.id, template.id);
  return { user, userCharacter: uc };
}

export async function ensurePuzzles(minCount = 20) {
  const count = await prisma.puzzle.count({ where: { active: true } });
  if (count >= minCount) return;
  const toCreate = minCount - count;
  for (let i = 0; i < toCreate; i++) {
    await prisma.puzzle.create({
      data: {
        question: `Test puzzle ${randomUUID()}: 2+2?`,
        answerA: "4",
        answerB: "5",
        correct: "A",
        difficulty: "EASY",
        category: "Logic",
      },
    });
  }
}
