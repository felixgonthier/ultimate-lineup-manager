-- CreateEnum
CREATE TYPE "LineupMode" AS ENUM ('FAIR', 'BALANCED', 'RESULTS');

-- CreateEnum
CREATE TYPE "PlayerPool" AS ENUM ('O', 'D', 'BOTH');

-- CreateEnum
CREATE TYPE "PlayerTier" AS ENUM ('STAR', 'CORE', 'DEPTH');

-- CreateEnum
CREATE TYPE "PlayerVariance" AS ENUM ('LOW', 'HIGH');

-- CreateEnum
CREATE TYPE "WindStrength" AS ENUM ('NONE', 'MODERATE', 'STRONG');

-- CreateEnum
CREATE TYPE "LineRung" AS ENUM ('DEPTH', 'ROTATION', 'STARTING', 'HALF_PUSH', 'FULL_PUSH');

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "pool" "PlayerPool" NOT NULL DEFAULT 'BOTH',
ADD COLUMN     "tier" "PlayerTier" NOT NULL DEFAULT 'CORE',
ADD COLUMN     "variance" "PlayerVariance" NOT NULL DEFAULT 'LOW';

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "lineupMode" "LineupMode" NOT NULL DEFAULT 'BALANCED';

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "lineupMode" "LineupMode",
ADD COLUMN     "windStrength" "WindStrength" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "startAttackingUpwind" BOOLEAN,
ADD COLUMN     "fairnessFloor" INTEGER;

-- AlterTable
ALTER TABLE "Point" ADD COLUMN     "attackingUpwind" BOOLEAN,
ADD COLUMN     "rung" "LineRung";
