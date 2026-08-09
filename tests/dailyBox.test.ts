import { describe, it, expect } from "vitest";
import { claimDailyBox, DailyBoxOnCooldownError } from "../src/services/dailyBoxService.js";
import { makeUser } from "./testUtils.js";

describe("dailyBoxService", () => {
  it("allows exactly one claim per 24h window", async () => {
    const user = await makeUser();
    const result = await claimDailyBox(user.id);
    expect(result.reward).toBeDefined();

    await expect(claimDailyBox(user.id)).rejects.toBeInstanceOf(DailyBoxOnCooldownError);
  });

  it("rejects concurrent duplicate claims (only one succeeds)", async () => {
    const user = await makeUser();
    const results = await Promise.allSettled([
      claimDailyBox(user.id),
      claimDailyBox(user.id),
      claimDailyBox(user.id),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled.length).toBe(1);
  });

  it("reports a sensible next-available time on cooldown", async () => {
    const user = await makeUser();
    await claimDailyBox(user.id);
    try {
      await claimDailyBox(user.id);
      throw new Error("expected cooldown error");
    } catch (err) {
      expect(err).toBeInstanceOf(DailyBoxOnCooldownError);
      const cooldownErr = err as DailyBoxOnCooldownError;
      expect(cooldownErr.nextAvailableAt.getTime()).toBeGreaterThan(Date.now());
    }
  });
});
