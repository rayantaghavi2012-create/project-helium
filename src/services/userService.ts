import { prisma } from "../db/client.js";
import { characterSeeds } from "../characters/data.js";

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

/** Saves onboarding choices and makes a new player fight-ready immediately. */
export async function completeOnboarding(userId: string, language: SupportedLanguage) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const template = await tx.character.upsert({
      where: { key: starterCharacter.key },
      update: {},
      create: starterCharacter,
    });

    const activeCharacter = await tx.userCharacter.findFirst({
      where: { userId, status: "ACTIVE" },
      orderBy: { acquiredAt: "asc" },
    });

    const selected = activeCharacter ?? await tx.userCharacter.create({
      data: {
        userId,
        characterId: template.id,
        currentHp: template.baseMaxHp,
        maxHp: template.baseMaxHp,
        power: template.basePower,
        speed: template.baseSpeed,
        status: "ACTIVE",
      },
    });

    return tx.user.update({
      where: { id: userId },
      // Never replace a choice made by an existing player. New players have no
      // selection, so their free Starter is selected by default.
      data: { language, selectedUserCharacterId: user.selectedUserCharacterId ?? selected.id },
    });
  });
}
