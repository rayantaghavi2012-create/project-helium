-- CreateTable
CREATE TABLE "FightInvite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "creatorCharacterId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "fightId" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FightInvite_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "telegramId" TEXT NOT NULL,
    "username" TEXT,
    "displayName" TEXT,
    "heliumBalance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "puzzlesSolved" INTEGER NOT NULL DEFAULT 0,
    "fightsWon" INTEGER NOT NULL DEFAULT 0,
    "fightsLost" INTEGER NOT NULL DEFAULT 0,
    "heliumEarnedWeek" INTEGER NOT NULL DEFAULT 0,
    "selectedUserCharacterId" TEXT,
    "awaitingFriendUsername" BOOLEAN NOT NULL DEFAULT false,
    "pendingFriendCharacterId" TEXT
);
INSERT INTO "new_User" ("createdAt", "displayName", "fightsLost", "fightsWon", "heliumBalance", "heliumEarnedWeek", "id", "puzzlesSolved", "telegramId", "updatedAt", "username") SELECT "createdAt", "displayName", "fightsLost", "fightsWon", "heliumBalance", "heliumEarnedWeek", "id", "puzzlesSolved", "telegramId", "updatedAt", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");
CREATE INDEX "User_telegramId_idx" ON "User"("telegramId");
CREATE INDEX "User_heliumEarnedWeek_idx" ON "User"("heliumEarnedWeek");
CREATE TABLE "new_UserCharacter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "currentHp" INTEGER NOT NULL,
    "maxHp" INTEGER NOT NULL,
    "power" INTEGER NOT NULL,
    "speed" INTEGER NOT NULL,
    "hpLevel" INTEGER NOT NULL DEFAULT 1,
    "powerLevel" INTEGER NOT NULL DEFAULT 1,
    "speedLevel" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "acquiredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserCharacter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UserCharacter_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_UserCharacter" ("acquiredAt", "characterId", "currentHp", "id", "maxHp", "power", "speed", "status", "userId") SELECT "acquiredAt", "characterId", "currentHp", "id", "maxHp", "power", "speed", "status", "userId" FROM "UserCharacter";
DROP TABLE "UserCharacter";
ALTER TABLE "new_UserCharacter" RENAME TO "UserCharacter";
CREATE INDEX "UserCharacter_userId_idx" ON "UserCharacter"("userId");
CREATE INDEX "UserCharacter_status_idx" ON "UserCharacter"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "FightInvite_code_key" ON "FightInvite"("code");

-- CreateIndex
CREATE INDEX "FightInvite_code_idx" ON "FightInvite"("code");

-- CreateIndex
CREATE INDEX "FightInvite_creatorId_status_idx" ON "FightInvite"("creatorId", "status");
