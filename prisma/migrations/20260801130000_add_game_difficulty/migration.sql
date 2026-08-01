-- CreateEnum
CREATE TYPE "GameDifficulty" AS ENUM ('EASY', 'EVEN', 'TOUGH');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "difficulty" "GameDifficulty";
ALTER TABLE "Game" ADD COLUMN     "excludeFromStats" BOOLEAN NOT NULL DEFAULT false;
