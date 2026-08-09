import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  adminTelegramIds: (process.env.ADMIN_TELEGRAM_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

export function requireBotToken(): string {
  return requireEnv("TELEGRAM_BOT_TOKEN");
}

export type DailyBoxReward =
  | { key: string; kind: "HELIUM"; amount: number; weight: number }
  | { key: string; kind: "CHARACTER"; rarity: string; weight: number }
  | { key: string; kind: "ITEM"; weight: number };

// All game balance numbers live here so nothing is hardcoded in handlers/services.
export const gameConfig = {
  puzzleRewards: {
    EASY: 20,
    MEDIUM: 40,
    HARD: 80,
    SPECIAL: 150,
  } as Record<string, number>,

  dailyBox: {
    cooldownHours: 24,
    // weight = relative probability; must be > 0
    rewardTable: [
      { key: "HELIUM_20", kind: "HELIUM", amount: 20, weight: 30 },
      { key: "HELIUM_50", kind: "HELIUM", amount: 50, weight: 20 },
      { key: "HELIUM_100", kind: "HELIUM", amount: 100, weight: 8 },
      { key: "CHARACTER_COMMON", kind: "CHARACTER", rarity: "COMMON", weight: 25 },
      { key: "CHARACTER_RARE", kind: "CHARACTER", rarity: "RARE", weight: 12 },
      { key: "CHARACTER_EPIC", kind: "CHARACTER", rarity: "EPIC", weight: 4 },
      { key: "MYSTERY_ITEM", kind: "ITEM", weight: 1 },
    ] as DailyBoxReward[],
  },

  fight: {
    puzzlesPerTurn: 2,
    // Assumption: one turn each (2 puzzles per player, 4 total) per fight,
    // matching the worked example in the spec. Configurable if fights should
    // run multiple rounds later.
    roundsPerFight: 1,
    puzzleTimeLimitMs: 20_000,
    startingHintUses: 1,
    startingSpeedUses: 1,
    // A WAITING random-matchmaking entry older than this is treated as stale
    // (e.g. the seeker's client crashed) and skipped/cleaned up rather than matched.
    randomQueueTtlMs: 10 * 60 * 1000,
    speedBonusMs: 1000,
    scoringWeights: {
      accuracy: 0.7,
      speed: 0.3,
    },
    winReward: 50,
    doubleChallengeReward: 100,
    damageByDifficulty: {
      EASY: 10,
      MEDIUM: 15,
      HARD: 20,
      SPECIAL: 25,
    } as Record<string, number>,
  },

  characterShop: {
    startingHeliumGrant: 100,
  },

  // Upgrade levels are 1 (base, free) through maxLevel. costToReach[level] is the
  // Helium cost to go from level-1 to level. Speed bonus and hint uses scale with
  // level so higher levels stay a modest edge, never a guaranteed win.
  characterUpgrades: {
    maxLevel: 3,
    hp: {
      costToReach: { 2: 250, 3: 600 } as Record<number, number>,
      bonusAtLevel: { 1: 0, 2: 10, 3: 25 } as Record<number, number>,
    },
    power: {
      costToReach: { 2: 300, 3: 700 } as Record<number, number>,
      // Hint uses granted per fight at this power level.
      hintUsesAtLevel: { 1: 1, 2: 2, 3: 2 } as Record<number, number>,
    },
    speed: {
      costToReach: { 2: 200, 3: 500 } as Record<number, number>,
      speedBonusMsAtLevel: { 1: 1000, 2: 1500, 3: 2000 } as Record<number, number>,
    },
  },
};
