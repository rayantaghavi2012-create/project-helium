-- Store the moment a match actually starts, so waiting for random matchmaking
-- does not consume the two-minute fight clock.
ALTER TABLE "Fight" ADD COLUMN "startedAt" TIMESTAMP(3);
