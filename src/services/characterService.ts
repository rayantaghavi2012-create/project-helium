import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../db/client.js";
import { applyCurrencyTransaction, InsufficientBalanceError } from "./walletService.js";

type Db = PrismaClient | Prisma.TransactionClient;

export async function listShopCharacters() {
  return prisma.character.findMany({ orderBy: { price: "asc" } });
}

export async function listOwnedCharacters(userId: string) {
  return prisma.userCharacter.findMany({
    where: { userId },
    include: { character: true },
    orderBy: { acquiredAt: "asc" },
  });
}

/** Purchases are idempotent per (userId, characterKey) purchase attempt id (refId). */
export async function purchaseCharacter(userId: string, characterKey: string, refId: string) {
  const template = await prisma.character.findUniqueOrThrow({ where: { key: characterKey } });

  return prisma.$transaction(async (tx) => {
    try {
      await applyCurrencyTransaction(
        { userId, amount: -template.price, reason: "CHARACTER_PURCHASE", refId },
        tx
      );
    } catch (err) {
      if (err instanceof InsufficientBalanceError) throw err;
      throw err;
    }

    const alreadyGranted = await tx.userCharacter.findFirst({
      where: { userId, characterId: template.id },
    });
    // A duplicate purchase callback replays the currency transaction (no-op, idempotent)
    // but must not grant a second copy of the character.
    if (alreadyGranted) return alreadyGranted;

    return grantCharacter(userId, template.id, tx);
  });
}

export async function grantCharacter(userId: string, characterId: string, db: Db = prisma) {
  const template = await db.character.findUniqueOrThrow({ where: { id: characterId } });
  return db.userCharacter.create({
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
}

export async function grantRandomCharacterByRarity(userId: string, rarity: string, db: Db = prisma) {
  const pool = await db.character.findMany({ where: { rarity } });
  if (pool.length === 0) return null;
  const template = pool[Math.floor(Math.random() * pool.length)];
  return grantCharacter(userId, template.id, db);
}

export async function applyDamage(userCharacterId: string, damage: number, db: Db = prisma) {
  const uc = await db.userCharacter.findUniqueOrThrow({ where: { id: userCharacterId } });
  const newHp = Math.max(0, uc.currentHp - damage);
  return db.userCharacter.update({
    where: { id: userCharacterId },
    data: {
      currentHp: newHp,
      status: newHp === 0 ? "DEFEATED" : uc.status,
    },
  });
}
