-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FightParticipant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fightId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "userCharacterId" TEXT,
    "hintUsesLeft" INTEGER NOT NULL DEFAULT 1,
    "speedUsesLeft" INTEGER NOT NULL DEFAULT 1,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "totalTimeMs" INTEGER NOT NULL DEFAULT 0,
    "score" REAL,
    CONSTRAINT "FightParticipant_fightId_fkey" FOREIGN KEY ("fightId") REFERENCES "Fight" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FightParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FightParticipant_userCharacterId_fkey" FOREIGN KEY ("userCharacterId") REFERENCES "UserCharacter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FightParticipant" ("correctCount", "fightId", "hintUsesLeft", "id", "score", "slot", "speedUsesLeft", "totalTimeMs", "userCharacterId", "userId") SELECT "correctCount", "fightId", "hintUsesLeft", "id", "score", "slot", "speedUsesLeft", "totalTimeMs", "userCharacterId", "userId" FROM "FightParticipant";
DROP TABLE "FightParticipant";
ALTER TABLE "new_FightParticipant" RENAME TO "FightParticipant";
CREATE INDEX "FightParticipant_userId_idx" ON "FightParticipant"("userId");
CREATE UNIQUE INDEX "FightParticipant_fightId_slot_key" ON "FightParticipant"("fightId", "slot");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
