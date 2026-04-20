-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('NORMAL', 'ADMIN');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "type" "UserType" NOT NULL DEFAULT 'NORMAL';
