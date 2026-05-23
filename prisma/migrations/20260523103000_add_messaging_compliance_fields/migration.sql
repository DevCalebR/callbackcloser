DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MessagingComplianceType') THEN
    CREATE TYPE "MessagingComplianceType" AS ENUM ('UNKNOWN', 'LOCAL_A2P', 'TOLL_FREE_VERIFICATION');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TollFreeVerificationStatus') THEN
    CREATE TYPE "TollFreeVerificationStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'APPROVED', 'REJECTED', 'NEEDS_UPDATE', 'NOT_APPLICABLE');
  END IF;
END $$;

ALTER TABLE "Business"
ADD COLUMN IF NOT EXISTS "messagingComplianceType" "MessagingComplianceType" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN IF NOT EXISTS "tollFreeVerificationStatus" "TollFreeVerificationStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN IF NOT EXISTS "tollFreeVerificationSid" TEXT,
ADD COLUMN IF NOT EXISTS "tollFreeVerificationNote" TEXT;

UPDATE "Business"
SET "messagingComplianceType" = 'LOCAL_A2P'
WHERE "a2pCustomerProfileSid" IS NOT NULL
   OR "a2pBrandSid" IS NOT NULL
   OR "a2pCampaignSid" IS NOT NULL
   OR "a2pFailureReason" IS NOT NULL
   OR "a2pSubmittedAt" IS NOT NULL
   OR "a2pApprovedAt" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Business_tollFreeVerificationSid_key" ON "Business"("tollFreeVerificationSid");
