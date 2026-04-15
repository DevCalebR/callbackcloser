-- CreateEnum
CREATE TYPE "BusinessProvisioningStatus" AS ENUM ('DRAFT', 'ONBOARDING', 'NEEDS_ATTENTION', 'LIVE', 'PAUSED');

-- AlterTable
ALTER TABLE "Business"
ADD COLUMN "internalNotes" TEXT,
ADD COLUMN "ownerInviteSentAt" TIMESTAMP(3),
ADD COLUMN "ownerName" TEXT,
ADD COLUMN "provisioningError" TEXT,
ADD COLUMN "provisioningLastRunAt" TIMESTAMP(3),
ADD COLUMN "provisioningStatus" "BusinessProvisioningStatus" NOT NULL DEFAULT 'DRAFT';
