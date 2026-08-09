import { describe, it, expect } from "vitest";
import { calculateScore, pickWinnerSlot, rollStartingNumber } from "../src/services/scoringService.js";

describe("scoringService", () => {
  it("gives full accuracy weight to a perfect, instant run", () => {
    const score = calculateScore({ correctCount: 4, totalPuzzles: 4, totalTimeMs: 0 });
    expect(score).toBe(100);
  });

  it("gives zero score for zero correct answers with no speed bonus available", () => {
    const score = calculateScore({ correctCount: 0, totalPuzzles: 4, totalTimeMs: 4 * 20_000 });
    expect(score).toBe(0);
  });

  it("rewards accuracy more than speed (weights 70/30)", () => {
    const accurateButSlow = calculateScore({
      correctCount: 4,
      totalPuzzles: 4,
      totalTimeMs: 4 * 19_000, // just under the 20s limit
    });
    const fastButInaccurate = calculateScore({
      correctCount: 1,
      totalPuzzles: 4,
      totalTimeMs: 0,
    });
    expect(accurateButSlow).toBeGreaterThan(fastButInaccurate);
  });

  it("does not let winner be decided purely by speed", () => {
    // Player A: fewer correct but very fast. Player B: more correct but slower.
    const playerA = calculateScore({ correctCount: 2, totalPuzzles: 4, totalTimeMs: 0 });
    const playerB = calculateScore({ correctCount: 4, totalPuzzles: 4, totalTimeMs: 4 * 15_000 });
    expect(playerB).toBeGreaterThan(playerA);
  });

  it("pickWinnerSlot resolves ties by correct count then by time", () => {
    expect(pickWinnerSlot(80, 80, { correct1: 3, correct2: 2, time1: 100, time2: 100 })).toBe(1);
    expect(pickWinnerSlot(80, 80, { correct1: 2, correct2: 2, time1: 50, time2: 100 })).toBe(1);
    expect(pickWinnerSlot(80, 80, { correct1: 2, correct2: 2, time1: 100, time2: 100 })).toBeNull();
  });

  it("pickWinnerSlot picks the strictly higher score", () => {
    expect(pickWinnerSlot(90, 70, { correct1: 0, correct2: 0, time1: 0, time2: 0 })).toBe(1);
    expect(pickWinnerSlot(60, 95, { correct1: 0, correct2: 0, time1: 0, time2: 0 })).toBe(2);
  });

  it("rollStartingNumber stays within 1-100", () => {
    for (let i = 0; i < 200; i++) {
      const roll = rollStartingNumber();
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(100);
    }
  });
});
