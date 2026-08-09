import { prisma } from "../db/client.js";
import { gameConfig } from "../config/index.js";
import { applyCurrencyTransaction, InsufficientBalanceError } from "./walletService.js";

export class UpgradeError extends Error {}

export type UpgradeStat = "hp" | "power" | "speed";

function statConfig(stat: UpgradeStat) {
  return gameConfig.characterUpgrades[stat];
}

export function previewUpgrade(currentLevel: number, stat: UpgradeStat) {
  const { maxLevel } = gameConfig.characterUpgrades;
  const nextLevel = currentLevel + 1;
  if (nextLevel > maxLevel) return null;
  const cfg = statConfig(stat);
  const cost = cfg.costToReach[nextLevel];
  return { nextLevel, cost };
}

/** Idempotent per (userId, refId): a duplicated tap (same callback id) can't double-spend or grant an extra level. */
export async function upgradeCharacter(userId: string, userCharacterId: string, stat: UpgradeStat, refId: string) {
  return prisma.$transaction(async (tx) => {
    const uc = await tx.userCharacter.findUniqueOrThrow({ where: { id: userCharacterId } });
    if (uc.userId !== userId) throw new UpgradeError("You do not own this character.");

    const currentLevel = stat === "hp" ? uc.hpLevel : stat === "power" ? uc.powerLevel : uc.speedLevel;
    const preview = previewUpgrade(currentLevel, stat);
    if (!preview) throw new UpgradeError("This stat is already at max level.");

    // This exact refId (e.g. a Telegram callback_query id) identifies one tap.
    // If it was already used for a charge, this call is a replay of that same
    // tap (or a reused/stale id) — return the character unchanged rather than
    // charging again or advancing a further level for free.
    const existingCharge = await tx.currencyTransaction.findUnique({
      where: { userId_reason_refId: { userId, reason: "CHARACTER_UPGRADE", refId } },
    });
    if (existingCharge) return uc;

    try {
      await applyCurrencyTransaction(
        { userId, amount: -preview.cost, reason: "CHARACTER_UPGRADE", refId },
        tx
      );
    } catch (err) {
      if (err instanceof InsufficientBalanceError) throw err;
      throw err;
    }

    if (stat === "hp") {
      const bonus = gameConfig.characterUpgrades.hp.bonusAtLevel[preview.nextLevel] ?? 0;
      const prevBonus = gameConfig.characterUpgrades.hp.bonusAtLevel[currentLevel] ?? 0;
      const delta = bonus - prevBonus;
      const newMaxHp = uc.maxHp + delta;
      const newCurrentHp = Math.min(newMaxHp, uc.currentHp + delta);
      return tx.userCharacter.update({
        where: { id: userCharacterId },
        data: {
          hpLevel: preview.nextLevel,
          maxHp: newMaxHp,
          currentHp: newCurrentHp,
          status: newCurrentHp > 0 ? "ACTIVE" : uc.status,
        },
      });
    }

    if (stat === "power") {
      return tx.userCharacter.update({
        where: { id: userCharacterId },
        data: { powerLevel: preview.nextLevel, power: preview.nextLevel },
      });
    }

    return tx.userCharacter.update({
      where: { id: userCharacterId },
      data: { speedLevel: preview.nextLevel, speed: preview.nextLevel },
    });
  });
}

export function hintUsesForLevel(powerLevel: number): number {
  return gameConfig.characterUpgrades.power.hintUsesAtLevel[powerLevel] ?? 1;
}

export function speedBonusMsForLevel(speedLevel: number): number {
  return gameConfig.characterUpgrades.speed.speedBonusMsAtLevel[speedLevel] ?? gameConfig.fight.speedBonusMs;
}
