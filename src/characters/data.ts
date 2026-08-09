export interface CharacterSeed {
  key: string;
  name: string;
  rarity: "COMMON" | "RARE" | "EPIC" | "LEGENDARY";
  price: number;
  baseMaxHp: number;
  basePower: number;
  baseSpeed: number;
  ability: "POWER" | "SPEED" | "NONE";
  description: string;
}

// Strategic tradeoff: POWER characters lean on hints (accuracy), SPEED characters
// lean on time bonus. Neither strictly dominates, and price scales with rarity
// rather than raw stats, so a cheap character stays viable.
export const characterSeeds: CharacterSeed[] = [
  {
    key: "rookie",
    name: "Rookie",
    rarity: "COMMON",
    price: 500,
    baseMaxHp: 100,
    basePower: 1,
    baseSpeed: 1,
    ability: "NONE",
    description: "A balanced starter with no special ability.",
  },
  {
    key: "scout",
    name: "Scout",
    rarity: "COMMON",
    price: 600,
    baseMaxHp: 90,
    basePower: 1,
    baseSpeed: 2,
    ability: "SPEED",
    description: "Quick reflexes shave time off recorded answers.",
  },
  {
    key: "analyst",
    name: "Analyst",
    rarity: "RARE",
    price: 1200,
    baseMaxHp: 110,
    basePower: 2,
    baseSpeed: 1,
    ability: "POWER",
    description: "Sharp intuition can eliminate a wrong answer.",
  },
  {
    key: "sprinter",
    name: "Sprinter",
    rarity: "RARE",
    price: 1300,
    baseMaxHp: 95,
    basePower: 1,
    baseSpeed: 3,
    ability: "SPEED",
    description: "Built for speed, fragile under pressure.",
  },
  {
    key: "strategist",
    name: "Strategist",
    rarity: "EPIC",
    price: 2500,
    baseMaxHp: 130,
    basePower: 3,
    baseSpeed: 2,
    ability: "POWER",
    description: "A master tactician with powerful hints.",
  },
  {
    key: "phantom",
    name: "Phantom",
    rarity: "EPIC",
    price: 2600,
    baseMaxHp: 115,
    basePower: 2,
    baseSpeed: 3,
    ability: "SPEED",
    description: "Elusive and fast, rarely caught off guard.",
  },
];
