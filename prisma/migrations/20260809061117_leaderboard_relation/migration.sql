-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LeaderboardEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "heliumEarned" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "puzzlesSolved" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LeaderboardEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_LeaderboardEntry" ("heliumEarned", "id", "losses", "puzzlesSolved", "updatedAt", "userId", "weekKey", "wins") SELECT "heliumEarned", "id", "losses", "puzzlesSolved", "updatedAt", "userId", "weekKey", "wins" FROM "LeaderboardEntry";
DROP TABLE "LeaderboardEntry";
ALTER TABLE "new_LeaderboardEntry" RENAME TO "LeaderboardEntry";
CREATE INDEX "LeaderboardEntry_weekKey_heliumEarned_idx" ON "LeaderboardEntry"("weekKey", "heliumEarned");
CREATE UNIQUE INDEX "LeaderboardEntry_userId_weekKey_key" ON "LeaderboardEntry"("userId", "weekKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
