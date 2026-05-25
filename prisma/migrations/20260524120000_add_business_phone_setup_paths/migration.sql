CREATE TYPE "BusinessPhoneSetupPath" AS ENUM ('CURRENT_NUMBER_FORWARDING', 'PORT_EXISTING_NUMBER', 'NEW_TWILIO_NUMBER');

CREATE TYPE "ForwardingVerificationStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'VERIFIED');

CREATE TYPE "PortingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED');

ALTER TABLE "Business"
ADD COLUMN "publicBusinessPhone" TEXT,
ADD COLUMN "phoneSetupPath" "BusinessPhoneSetupPath" NOT NULL DEFAULT 'NEW_TWILIO_NUMBER',
ADD COLUMN "forwardingVerificationStatus" "ForwardingVerificationStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN "forwardingVerifiedAt" TIMESTAMP(3),
ADD COLUMN "forwardingVerificationNote" TEXT,
ADD COLUMN "portingStatus" "PortingStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN "portingNotes" TEXT,
ADD COLUMN "portingCompletedAt" TIMESTAMP(3);

UPDATE "Business"
SET "publicBusinessPhone" = COALESCE("twilioPrimaryPhoneNumber", "twilioPhoneNumber")
WHERE "publicBusinessPhone" IS NULL;
