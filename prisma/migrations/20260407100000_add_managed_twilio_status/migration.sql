CREATE TYPE "ManagedTwilioStatus" AS ENUM (
  'DRAFT',
  'PROVISIONING',
  'AWAITING_BUSINESS_VERIFICATION',
  'BRAND_SUBMITTED',
  'CAMPAIGN_SUBMITTED',
  'COMPLIANT_LIVE',
  'PAUSED_NONCOMPLIANT',
  'FAILED_REVIEW'
);

ALTER TABLE "Business"
ADD COLUMN "twilioMessagingServiceSid" TEXT,
ADD COLUMN "twilioPrimaryNumberSid" TEXT,
ADD COLUMN "twilioPrimaryPhoneNumber" TEXT,
ADD COLUMN "a2pCustomerProfileSid" TEXT,
ADD COLUMN "a2pBrandSid" TEXT,
ADD COLUMN "a2pCampaignSid" TEXT,
ADD COLUMN "managedTwilioStatus" "ManagedTwilioStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN "managedTwilioStatusUpdatedAt" TIMESTAMP(3),
ADD COLUMN "a2pFailureReason" TEXT,
ADD COLUMN "twilioProvisioningStartedAt" TIMESTAMP(3),
ADD COLUMN "twilioProvisionedAt" TIMESTAMP(3),
ADD COLUMN "a2pSubmittedAt" TIMESTAMP(3),
ADD COLUMN "a2pApprovedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Business_twilioMessagingServiceSid_key" ON "Business"("twilioMessagingServiceSid");
CREATE UNIQUE INDEX "Business_twilioPrimaryNumberSid_key" ON "Business"("twilioPrimaryNumberSid");
CREATE UNIQUE INDEX "Business_twilioPrimaryPhoneNumber_key" ON "Business"("twilioPrimaryPhoneNumber");
CREATE UNIQUE INDEX "Business_a2pCustomerProfileSid_key" ON "Business"("a2pCustomerProfileSid");
CREATE UNIQUE INDEX "Business_a2pBrandSid_key" ON "Business"("a2pBrandSid");
CREATE UNIQUE INDEX "Business_a2pCampaignSid_key" ON "Business"("a2pCampaignSid");
