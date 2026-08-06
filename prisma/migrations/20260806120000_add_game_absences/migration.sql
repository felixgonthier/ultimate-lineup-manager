-- CreateTable
CREATE TABLE "GameAbsence" (
    "gameId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameAbsence_pkey" PRIMARY KEY ("gameId","playerId")
);

-- AddForeignKey
ALTER TABLE "GameAbsence" ADD CONSTRAINT "GameAbsence_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameAbsence" ADD CONSTRAINT "GameAbsence_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
