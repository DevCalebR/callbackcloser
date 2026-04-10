DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'LeadStatus' AND e.enumlabel = 'NOTIFIED'
  ) THEN
    ALTER TYPE "LeadStatus" ADD VALUE 'NOTIFIED';
  END IF;
END $$;

CREATE TYPE "LeadReadiness" AS ENUM ('PENDING', 'QUALIFIED', 'URGENT');
CREATE TYPE "OwnerNotificationChannel" AS ENUM ('SMS', 'EMAIL', 'IN_APP');
CREATE TYPE "OwnerNotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');
CREATE TYPE "SimulatorRunStatus" AS ENUM ('ACTIVE', 'QUALIFIED', 'COMPLETED');

ALTER TABLE "Call"
ADD COLUMN "isSimulator" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Lead"
ADD COLUMN "readiness" "LeadReadiness" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "serviceType" TEXT,
ADD COLUMN "location" TEXT,
ADD COLUMN "callerName" TEXT,
ADD COLUMN "callbackRequested" BOOLEAN,
ADD COLUMN "summary" TEXT,
ADD COLUMN "qualifiedAt" TIMESTAMP(3),
ADD COLUMN "notifiedAt" TIMESTAMP(3),
ADD COLUMN "isSimulator" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Message"
ADD COLUMN "isSimulator" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "OwnerNotification" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "channel" "OwnerNotificationChannel" NOT NULL,
  "status" "OwnerNotificationStatus" NOT NULL DEFAULT 'PENDING',
  "destination" TEXT,
  "body" TEXT NOT NULL,
  "subject" TEXT,
  "error" TEXT,
  "metadata" JSONB,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OwnerNotification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BusinessNotificationSettings" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "ownerPhone" TEXT,
  "ownerEmail" TEXT,
  "notifySms" BOOLEAN NOT NULL DEFAULT true,
  "notifyEmail" BOOLEAN NOT NULL DEFAULT true,
  "notifyInApp" BOOLEAN NOT NULL DEFAULT true,
  "urgentOnly" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BusinessNotificationSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SimulatorRun" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "callerPhone" TEXT NOT NULL,
  "status" "SimulatorRunStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SimulatorRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OwnerNotification_leadId_channel_key" ON "OwnerNotification"("leadId", "channel");
CREATE INDEX "OwnerNotification_businessId_createdAt_idx" ON "OwnerNotification"("businessId", "createdAt");
CREATE INDEX "OwnerNotification_leadId_status_idx" ON "OwnerNotification"("leadId", "status");

CREATE UNIQUE INDEX "BusinessNotificationSettings_businessId_key" ON "BusinessNotificationSettings"("businessId");

CREATE UNIQUE INDEX "SimulatorRun_publicId_key" ON "SimulatorRun"("publicId");
CREATE UNIQUE INDEX "SimulatorRun_leadId_key" ON "SimulatorRun"("leadId");
CREATE INDEX "SimulatorRun_businessId_createdAt_idx" ON "SimulatorRun"("businessId", "createdAt");

CREATE INDEX "Lead_businessId_readiness_idx" ON "Lead"("businessId", "readiness");
CREATE INDEX "Lead_businessId_isSimulator_createdAt_idx" ON "Lead"("businessId", "isSimulator", "createdAt");

ALTER TABLE "OwnerNotification"
ADD CONSTRAINT "OwnerNotification_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OwnerNotification"
ADD CONSTRAINT "OwnerNotification_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BusinessNotificationSettings"
ADD CONSTRAINT "BusinessNotificationSettings_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SimulatorRun"
ADD CONSTRAINT "SimulatorRun_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SimulatorRun"
ADD CONSTRAINT "SimulatorRun_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
