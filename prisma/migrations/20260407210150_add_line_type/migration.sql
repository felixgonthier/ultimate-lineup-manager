-- CreateEnum
CREATE TYPE "LineType" AS ENUM ('NORMAL', 'POWER');

-- AlterTable
ALTER TABLE "Line" ADD COLUMN     "type" "LineType" NOT NULL DEFAULT 'NORMAL';
