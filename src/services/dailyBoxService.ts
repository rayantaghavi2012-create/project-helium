import { prisma } from "../db/client.js";
import { gameConfig } from "../config/index.js";
import { applyCurrencyTransaction } from "./walletService.js";
import { grantRandomCharacterByRarity } from "./characterService.js";

export class DailyBoxOnCooldownError extends Error {
  constructor(public readonly nextAvailableAt: Date) {
    super("Daily box already claimed in the last 24 hours");
    this.name = "DailyBoxOnCooldownError";
  }
}

function pickWeightedReward() {
  const table = gameConfig.dailyBox.rewardTable;
  const totalWeight = table.reduce((sum, r) => sum + r.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const reward of table) {
    roll -= reward.weight;
    if (roll <= 0) return reward;
  }
  return table[table.length - 1];
}

/**
 * Rolling 24h window (not calendar-day) so there's no timezone-boundary exploit
 * and no reset-at-midnight edge case.
 */
export async function claimDailyBox(userId: string) {
  return prisma.$transaction(async (tx) => {
    const cutoff = new Date(Date.now() - gameConfig.dailyBox.cooldownHours * 60 * 60 * 1000);
    const last = await tx.dailyBox.findFirst({
      where: { userId, claimedAt: { gte: cutoff } },
      orderBy: { claimedAt: "desc" },
    });
    if (last) {
      const nextAvailableAt = new Date(
        last.claimedAt.getTime() + gameConfig.dailyBox.cooldownHours * 60 * 60 * 1000
      );
      throw new DailyBoxOnCooldownError(nextAvailableAt);
    }

    const reward = pickWeightedReward();
    const box = await tx.dailyBox.create({ data: { userId, rewardKey: reward.key } });

    let grantedCharacter = null;
    if (reward.kind === "HELIUM" && reward.amount) {
      await applyCurrencyTransaction(
        { userId, amount: reward.amount, reason: "DAILY_BOX", refId: box.id },
        tx
      );
    } else if (reward.kind === "CHARACTER" && "rarity" in reward) {
      grantedCharacter = await grantRandomCharacterByRarity(userId, reward.rarity, tx);
    }
    // ITEM (mystery item) rewards are recorded via the Reward ledger only for now.

    await tx.reward.create({
      data: {
        userId,
        sourceType: "DAILY_BOX",
        sourceId: box.id,
        kind: reward.kind,
        amount: reward.kind === "HELIUM" ? reward.amount : null,
        characterKey: grantedCharacter ? grantedCharacter.characterId : null,
      },
    });

    return { box, reward, grantedCharacter };
  });
}
