import { prisma } from "../db/client.js";
import { characterSeeds } from "../characters/data.js";
import type { Prisma } from "@prisma/client";

export type SupportedLanguage = "fa" | "en";

const starterCharacter = characterSeeds.find((character) => character.key === "starter")!;

export async function getOrCreateUser(telegramId: string, username?: string, displayName?: string) {
  const existing = await prisma.user.findUnique({ where: { telegramId } });
  if (existing) return existing;

  try {
    return await prisma.user.create({
      data: { telegramId, username, displayName },
    });
  } catch {
    // Concurrent creation race — the unique constraint on telegramId lost, fetch the winner.
    return prisma.user.findUniqueOrThrow({ where: { telegramId } });
  }
}

async function ensureStarterSelection(tx: Prisma.TransactionClient, user: { id: string; selectedUserCharacterId: string | null }) {
  const template = await tx.character.upsert({
      where: { key: starterCharacter.key },
      update: {},
      create: starterCharacter,
  });

  const selectedActiveCharacter = user.selectedUserCharacterId
    ? await tx.userCharacter.findFirst({
        where: { id: user.selectedUserCharacterId, userId: user.id, status: "ACTIVE" },
      })
    : null;
  const activeCharacter = await tx.userCharacter.findFirst({
    where: { userId: user.id, status: "ACTIVE" },
    orderBy: { acquiredAt: "asc" },
  });

  const selected = activeCharacter ?? await tx.userCharacter.create({
    data: {
      userId: user.id,
      characterId: template.id,
      currentHp: template.baseMaxHp,
      maxHp: template.baseMaxHp,
      power: template.basePower,
      speed: template.baseSpeed,
      status: "ACTIVE",
    },
  });
  return selectedActiveCharacter?.id ?? selected.id;
}

/** Grants and selects the free Starter before language onboarding is complete. */
export async function ensureDefaultCharacter(userId: string) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const selectedUserCharacterId = await ensureStarterSelection(tx, user);
    return tx.user.update({
      where: { id: userId },
      data: { selectedUserCharacterId },
    });
  });
}

/** Saves onboarding choices and makes a new player fight-ready immediately. */
export async function completeOnboarding(userId: string, language: SupportedLanguage) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const selectedUserCharacterId = await ensureStarterSelection(tx, user);
    return tx.user.update({ where: { id: userId }, data: { language, selectedUserCharacterId } });
  });
}
