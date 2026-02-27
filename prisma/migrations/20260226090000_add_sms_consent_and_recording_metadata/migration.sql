-- AlterTable
ALTER TABLE "Call"
ADD COLUMN "recordingSid" TEXT,
ADD COLUMN "recordingUrl" TEXT,
ADD COLUMN "recordingStatus" TEXT,
ADD COLUMN "recordingDurationSeconds" INTEGER;

-- CreateTable
CREATE TABLE "SmsConsent" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "phoneNormalized" TEXT NOT NULL,
  "phoneRawLastSeen" TEXT,
  "optedOut" BOOLEAN NOT NULL DEFAULT false,
  "optedOutAt" TIMESTAMP(3),
  "optedInAt" TIMESTAMP(3),
  "lastKeyword" TEXT,
  "lastMessageSid" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SmsConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SmsConsent_businessId_phoneNormalized_key" ON "SmsConsent"("businessId", "phoneNormalized");
CREATE INDEX "SmsConsent_businessId_optedOut_idx" ON "SmsConsent"("businessId", "optedOut");
CREATE INDEX "SmsConsent_phoneNormalized_idx" ON "SmsConsent"("phoneNormalized");
CREATE INDEX "Call_recordingSid_idx" ON "Call"("recordingSid");

-- AddForeignKey
ALTER TABLE "SmsConsent"
ADD CONSTRAINT "SmsConsent_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
