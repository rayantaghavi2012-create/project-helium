-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "telegramId" TEXT NOT NULL,
    "username" TEXT,
    "displayName" TEXT,
    "heliumBalance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "puzzlesSolved" INTEGER NOT NULL DEFAULT 0,
    "fightsWon" INTEGER NOT NULL DEFAULT 0,
    "fightsLost" INTEGER NOT NULL DEFAULT 0,
    "heliumEarnedWeek" INTEGER NOT NULL DEFAULT 0,
    "selectedUserCharacterId" TEXT,
    "awaitingFriendUsername" BOOLEAN NOT NULL DEFAULT false,
    "pendingFriendCharacterId" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "baseMaxHp" INTEGER NOT NULL,
    "basePower" INTEGER NOT NULL,
    "baseSpeed" INTEGER NOT NULL,
    "ability" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCharacter" (
    "id" TEXT NOT NULL,
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
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCharacter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Puzzle" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answerA" TEXT NOT NULL,
    "answerB" TEXT NOT NULL,
    "correct" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "explanation" TEXT,
    "hint" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" TEXT,

    CONSTRAINT "Puzzle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fight" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'WAITING',
    "player1Id" TEXT NOT NULL,
    "player2Id" TEXT,
    "player1Roll" INTEGER,
    "player2Roll" INTEGER,
    "startingPlayer" INTEGER,
    "currentTurn" INTEGER,
    "currentRound" INTEGER NOT NULL DEFAULT 1,
    "winnerId" TEXT,
    "rewardGranted" BOOLEAN NOT NULL DEFAULT false,
    "doubleChallengeUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Fight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FightParticipant" (
    "id" TEXT NOT NULL,
    "fightId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "userCharacterId" TEXT,
    "hintUsesLeft" INTEGER NOT NULL DEFAULT 1,
    "speedUsesLeft" INTEGER NOT NULL DEFAULT 1,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "totalTimeMs" INTEGER NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION,

    CONSTRAINT "FightParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FightTurn" (
    "id" TEXT NOT NULL,
    "fightId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "round" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FightTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FightAnswer" (
    "id" TEXT NOT NULL,
    "fightTurnId" TEXT NOT NULL,
    "puzzleId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "selected" TEXT,
    "correct" BOOLEAN NOT NULL,
    "responseMs" INTEGER NOT NULL,
    "difficulty" TEXT NOT NULL,
    "hintUsed" BOOLEAN NOT NULL DEFAULT false,
    "speedBonusMs" INTEGER NOT NULL DEFAULT 0,
    "presentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "FightAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FightInvite" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "creatorCharacterId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "fightId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FightInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyBox" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rewardKey" TEXT NOT NULL,

    CONSTRAINT "DailyBox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reward" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" INTEGER,
    "characterKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurrencyTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CurrencyTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaderboardEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "heliumEarned" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "puzzlesSolved" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaderboardEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE INDEX "User_telegramId_idx" ON "User"("telegramId");

-- CreateIndex
CREATE INDEX "User_heliumEarnedWeek_idx" ON "User"("heliumEarnedWeek");

-- CreateIndex
CREATE UNIQUE INDEX "Character_key_key" ON "Character"("key");

-- CreateIndex
CREATE INDEX "UserCharacter_userId_idx" ON "UserCharacter"("userId");

-- CreateIndex
CREATE INDEX "UserCharacter_status_idx" ON "UserCharacter"("status");

-- CreateIndex
CREATE INDEX "Puzzle_difficulty_idx" ON "Puzzle"("difficulty");

-- CreateIndex
CREATE INDEX "Puzzle_category_idx" ON "Puzzle"("category");

-- CreateIndex
CREATE INDEX "Puzzle_active_idx" ON "Puzzle"("active");

-- CreateIndex
CREATE INDEX "Fight_state_idx" ON "Fight"("state");

-- CreateIndex
CREATE INDEX "Fight_mode_state_idx" ON "Fight"("mode", "state");

-- CreateIndex
CREATE INDEX "FightParticipant_userId_idx" ON "FightParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FightParticipant_fightId_slot_key" ON "FightParticipant"("fightId", "slot");

-- CreateIndex
CREATE INDEX "FightTurn_fightId_idx" ON "FightTurn"("fightId");

-- CreateIndex
CREATE INDEX "FightAnswer_fightTurnId_idx" ON "FightAnswer"("fightTurnId");

-- CreateIndex
CREATE UNIQUE INDEX "FightAnswer_fightTurnId_puzzleId_key" ON "FightAnswer"("fightTurnId", "puzzleId");

-- CreateIndex
CREATE UNIQUE INDEX "FightInvite_code_key" ON "FightInvite"("code");

-- CreateIndex
CREATE INDEX "FightInvite_code_idx" ON "FightInvite"("code");

-- CreateIndex
CREATE INDEX "FightInvite_creatorId_status_idx" ON "FightInvite"("creatorId", "status");

-- CreateIndex
CREATE INDEX "DailyBox_userId_claimedAt_idx" ON "DailyBox"("userId", "claimedAt");

-- CreateIndex
CREATE INDEX "Reward_userId_idx" ON "Reward"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Reward_sourceType_sourceId_kind_key" ON "Reward"("sourceType", "sourceId", "kind");

-- CreateIndex
CREATE INDEX "CurrencyTransaction_userId_idx" ON "CurrencyTransaction"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CurrencyTransaction_userId_reason_refId_key" ON "CurrencyTransaction"("userId", "reason", "refId");

-- CreateIndex
CREATE INDEX "LeaderboardEntry_weekKey_heliumEarned_idx" ON "LeaderboardEntry"("weekKey", "heliumEarned");

-- CreateIndex
CREATE UNIQUE INDEX "LeaderboardEntry_userId_weekKey_key" ON "LeaderboardEntry"("userId", "weekKey");

-- AddForeignKey
ALTER TABLE "UserCharacter" ADD CONSTRAINT "UserCharacter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCharacter" ADD CONSTRAINT "UserCharacter_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fight" ADD CONSTRAINT "Fight_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fight" ADD CONSTRAINT "Fight_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FightParticipant" ADD CONSTRAINT "FightParticipant_fightId_fkey" FOREIGN KEY ("fightId") REFERENCES "Fight"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FightParticipant" ADD CONSTRAINT "FightParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FightParticipant" ADD CONSTRAINT "FightParticipant_userCharacterId_fkey" FOREIGN KEY ("userCharacterId") REFERENCES "UserCharacter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FightTurn" ADD CONSTRAINT "FightTurn_fightId_fkey" FOREIGN KEY ("fightId") REFERENCES "Fight"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FightAnswer" ADD CONSTRAINT "FightAnswer_fightTurnId_fkey" FOREIGN KEY ("fightTurnId") REFERENCES "FightTurn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FightAnswer" ADD CONSTRAINT "FightAnswer_puzzleId_fkey" FOREIGN KEY ("puzzleId") REFERENCES "Puzzle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FightInvite" ADD CONSTRAINT "FightInvite_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyBox" ADD CONSTRAINT "DailyBox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrencyTransaction" ADD CONSTRAINT "CurrencyTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaderboardEntry" ADD CONSTRAINT "LeaderboardEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

