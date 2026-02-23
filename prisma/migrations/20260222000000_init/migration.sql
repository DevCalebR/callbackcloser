-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('INACTIVE', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'QUALIFIED', 'CONTACTED', 'BOOKED');

-- CreateEnum
CREATE TYPE "SmsConversationState" AS ENUM ('NOT_STARTED', 'AWAITING_SERVICE', 'AWAITING_URGENCY', 'AWAITING_ZIP', 'AWAITING_BEST_TIME', 'AWAITING_NAME', 'COMPLETED');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "MessageParticipant" AS ENUM ('LEAD', 'OWNER');

-- CreateTable
CREATE TABLE "Business" (
  "id" TEXT NOT NULL,
  "ownerClerkId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "forwardingNumber" TEXT NOT NULL,
  "notifyPhone" TEXT,
  "missedCallSeconds" INTEGER NOT NULL DEFAULT 20,
  "serviceLabel1" TEXT NOT NULL DEFAULT 'Repair',
  "serviceLabel2" TEXT NOT NULL DEFAULT 'Install',
  "serviceLabel3" TEXT NOT NULL DEFAULT 'Maintenance',
  "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
  "twilioPhoneNumber" TEXT,
  "twilioPhoneNumberSid" TEXT,
  "stripeCustomerId" TEXT,
  "stripeSubscriptionId" TEXT,
  "stripePriceId" TEXT,
  "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'INACTIVE',
  "subscriptionStatusUpdatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Call" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "twilioCallSid" TEXT NOT NULL,
  "parentCallSid" TEXT,
  "dialCallSid" TEXT,
  "fromPhone" TEXT NOT NULL,
  "fromPhoneNormalized" TEXT NOT NULL,
  "toPhone" TEXT NOT NULL,
  "toPhoneNormalized" TEXT NOT NULL,
  "dialCallStatus" TEXT,
  "status" TEXT NOT NULL,
  "callDurationSeconds" INTEGER,
  "dialCallDurationSeconds" INTEGER,
  "answered" BOOLEAN NOT NULL DEFAULT false,
  "missed" BOOLEAN NOT NULL DEFAULT false,
  "rawPayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "callId" TEXT,
  "callerPhone" TEXT NOT NULL,
  "callerPhoneNormalized" TEXT NOT NULL,
  "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
  "billingRequired" BOOLEAN NOT NULL DEFAULT false,
  "smsState" "SmsConversationState" NOT NULL DEFAULT 'NOT_STARTED',
  "serviceRequested" TEXT,
  "serviceSelectionRaw" TEXT,
  "urgency" TEXT,
  "zipCode" TEXT,
  "bestTime" TEXT,
  "contactName" TEXT,
  "ownerNotifiedAt" TIMESTAMP(3),
  "smsStartedAt" TIMESTAMP(3),
  "smsCompletedAt" TIMESTAMP(3),
  "lastInboundAt" TIMESTAMP(3),
  "lastOutboundAt" TIMESTAMP(3),
  "lastInteractionAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "leadId" TEXT,
  "twilioSid" TEXT,
  "direction" "MessageDirection" NOT NULL,
  "participant" "MessageParticipant" NOT NULL DEFAULT 'LEAD',
  "fromPhone" TEXT NOT NULL,
  "toPhone" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" TEXT,
  "rawPayload" JSONB,
  "twilioCreatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Business_ownerClerkId_key" ON "Business"("ownerClerkId");
CREATE UNIQUE INDEX "Business_twilioPhoneNumber_key" ON "Business"("twilioPhoneNumber");
CREATE UNIQUE INDEX "Business_twilioPhoneNumberSid_key" ON "Business"("twilioPhoneNumberSid");
CREATE UNIQUE INDEX "Business_stripeCustomerId_key" ON "Business"("stripeCustomerId");
CREATE INDEX "Business_subscriptionStatus_idx" ON "Business"("subscriptionStatus");

CREATE UNIQUE INDEX "Call_twilioCallSid_key" ON "Call"("twilioCallSid");
CREATE UNIQUE INDEX "Call_dialCallSid_key" ON "Call"("dialCallSid");
CREATE INDEX "Call_businessId_createdAt_idx" ON "Call"("businessId", "createdAt");
CREATE INDEX "Call_businessId_fromPhoneNormalized_idx" ON "Call"("businessId", "fromPhoneNormalized");

CREATE UNIQUE INDEX "Lead_callId_key" ON "Lead"("callId");
CREATE INDEX "Lead_businessId_status_idx" ON "Lead"("businessId", "status");
CREATE INDEX "Lead_businessId_billingRequired_idx" ON "Lead"("businessId", "billingRequired");
CREATE INDEX "Lead_businessId_callerPhoneNormalized_idx" ON "Lead"("businessId", "callerPhoneNormalized");
CREATE INDEX "Lead_businessId_smsState_idx" ON "Lead"("businessId", "smsState");
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

CREATE UNIQUE INDEX "Message_twilioSid_key" ON "Message"("twilioSid");
CREATE INDEX "Message_businessId_createdAt_idx" ON "Message"("businessId", "createdAt");
CREATE INDEX "Message_leadId_createdAt_idx" ON "Message"("leadId", "createdAt");
CREATE INDEX "Message_direction_idx" ON "Message"("direction");

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
