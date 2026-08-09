import { describe, it, expect } from "vitest";
import { upgradeCharacter, previewUpgrade, UpgradeError } from "../src/services/upgradeService.js";
import { InsufficientBalanceError, applyCurrencyTransaction, getBalance } from "../src/services/walletService.js";
import { prisma } from "../src/db/client.js";
import { makeUserWithCharacter, makeUser } from "./testUtils.js";

describe("upgradeService", () => {
  it("upgrades HP, increases current HP, and charges the configured cost exactly once", async () => {
    const { user, userCharacter } = await makeUserWithCharacter();
    const preview = previewUpgrade(userCharacter.hpLevel, "hp")!;
    await applyCurrencyTransaction({ userId: user.id, amount: preview.cost, reason: "ADMIN", refId: "grant" });

    const refId = "upgrade-1";
    const updated = await upgradeCharacter(user.id, userCharacter.id, "hp", refId);
    expect(updated.hpLevel).toBe(preview.nextLevel);
    expect(updated.maxHp).toBeGreaterThan(userCharacter.maxHp);
    expect(await getBalance(user.id)).toBe(0);

    // Replaying the same refId must not charge or level up again.
    const replayed = await upgradeCharacter(user.id, userCharacter.id, "hp", refId);
    expect(replayed.hpLevel).toBe(preview.nextLevel);
    expect(await getBalance(user.id)).toBe(0);
  });

  it("revives a defeated character when its HP upgrade lands", async () => {
    const { user, userCharacter } = await makeUserWithCharacter();
    await prisma.userCharacter.update({ where: { id: userCharacter.id }, data: { currentHp: 0, status: "DEFEATED" } });

    const preview = previewUpgrade(userCharacter.hpLevel, "hp")!;
    await applyCurrencyTransaction({ userId: user.id, amount: preview.cost, reason: "ADMIN", refId: "grant2" });
    const updated = await upgradeCharacter(user.id, userCharacter.id, "hp", "upgrade-revive");

    expect(updated.currentHp).toBeGreaterThan(0);
    expect(updated.status).toBe("ACTIVE");
  });

  it("rejects upgrading a character you don't own", async () => {
    const owner = await makeUserWithCharacter();
    const stranger = await makeUser();
    await expect(
      upgradeCharacter(stranger.id, owner.userCharacter.id, "hp", "steal-1")
    ).rejects.toBeInstanceOf(UpgradeError);
  });

  it("rejects upgrades beyond max level", async () => {
    const { user, userCharacter } = await makeUserWithCharacter();
    await prisma.userCharacter.update({ where: { id: userCharacter.id }, data: { speedLevel: 3, speed: 3 } });
    await expect(upgradeCharacter(user.id, userCharacter.id, "speed", "max-1")).rejects.toBeInstanceOf(UpgradeError);
  });

  it("rejects an upgrade when the wallet can't cover the cost", async () => {
    const { user, userCharacter } = await makeUserWithCharacter();
    await expect(upgradeCharacter(user.id, userCharacter.id, "power", "poor-1")).rejects.toBeInstanceOf(
      InsufficientBalanceError
    );
  });

  it("does not let a stale refId be replayed later to grant a free extra level", async () => {
    const { user, userCharacter } = await makeUserWithCharacter();
    const level2 = previewUpgrade(userCharacter.hpLevel, "hp")!;
    const level3Cost = previewUpgrade(userCharacter.hpLevel + 1, "hp")!.cost;
    await applyCurrencyTransaction({
      userId: user.id,
      amount: level2.cost + level3Cost,
      reason: "ADMIN",
      refId: "grant3",
    });

    const staleRefId = "tap-1";
    const afterFirst = await upgradeCharacter(user.id, userCharacter.id, "hp", staleRefId);
    expect(afterFirst.hpLevel).toBe(level2.nextLevel);
    const balanceAfterFirst = await getBalance(user.id);

    // Reusing the same refId for what would now be a level-3 upgrade must be a no-op.
    const replay = await upgradeCharacter(user.id, userCharacter.id, "hp", staleRefId);
    expect(replay.hpLevel).toBe(level2.nextLevel);
    expect(await getBalance(user.id)).toBe(balanceAfterFirst);
  });
});
