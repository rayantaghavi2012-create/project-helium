import { describe, it, expect } from "vitest";
import { applyCurrencyTransaction, InsufficientBalanceError, getBalance } from "../src/services/walletService.js";
import { makeUser } from "./testUtils.js";

describe("walletService", () => {
  it("credits and debits balance correctly", async () => {
    const user = await makeUser();
    await applyCurrencyTransaction({ userId: user.id, amount: 100, reason: "ADMIN", refId: "t1" });
    expect(await getBalance(user.id)).toBe(100);

    await applyCurrencyTransaction({ userId: user.id, amount: -40, reason: "ADMIN", refId: "t2" });
    expect(await getBalance(user.id)).toBe(60);
  });

  it("prevents the balance from going negative", async () => {
    const user = await makeUser();
    await applyCurrencyTransaction({ userId: user.id, amount: 10, reason: "ADMIN", refId: "a1" });
    await expect(
      applyCurrencyTransaction({ userId: user.id, amount: -50, reason: "ADMIN", refId: "a2" })
    ).rejects.toBeInstanceOf(InsufficientBalanceError);
    expect(await getBalance(user.id)).toBe(10);
  });

  it("is idempotent for a duplicated refId (no double-credit)", async () => {
    const user = await makeUser();
    const refId = "duplicate-callback";
    await applyCurrencyTransaction({ userId: user.id, amount: 50, reason: "PUZZLE_REWARD", refId });
    await applyCurrencyTransaction({ userId: user.id, amount: 50, reason: "PUZZLE_REWARD", refId });
    await applyCurrencyTransaction({ userId: user.id, amount: 50, reason: "PUZZLE_REWARD", refId });
    expect(await getBalance(user.id)).toBe(50);
  });

  it("processes concurrent duplicate calls without double-crediting (race condition guard)", async () => {
    const user = await makeUser();
    const refId = "race-test";
    await Promise.all(
      Array.from({ length: 5 }, () =>
        applyCurrencyTransaction({ userId: user.id, amount: 20, reason: "FIGHT_WIN", refId })
      )
    );
    expect(await getBalance(user.id)).toBe(20);
  });
});
