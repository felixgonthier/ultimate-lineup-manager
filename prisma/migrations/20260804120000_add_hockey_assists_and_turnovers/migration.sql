-- AlterTable
ALTER TABLE "Point" ADD COLUMN "hockeyAssistPlayerId" TEXT;

-- AlterTable
ALTER TABLE "PointPlayer" ADD COLUMN "turnovers" INTEGER NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "Point" ADD CONSTRAINT "Point_hockeyAssistPlayerId_fkey" FOREIGN KEY ("hockeyAssistPlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
