-- CreateEnum
CREATE TYPE "OperatorEventCategory" AS ENUM (
    'PROVISIONING',
    'MESSAGING',
    'VOICE',
    'WEBHOOKS',
    'OWNER_ALERTS',
    'ADMIN_ACTIONS',
    'ONBOARDING',
    'ERRORS'
);

-- CreateEnum
CREATE TYPE "OperatorEventStatus" AS ENUM (
    'SUCCESS',
    'PENDING',
    'WARNING',
    'FAILED',
    'INFO'
);

-- CreateTable
CREATE TABLE "BusinessOperatorEvent" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" "OperatorEventCategory" NOT NULL,
    "status" "OperatorEventStatus" NOT NULL,
    "summary" TEXT NOT NULL,
    "detailsJson" JSONB,
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessOperatorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessOperatorEvent_businessId_createdAt_idx" ON "BusinessOperatorEvent"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessOperatorEvent_businessId_category_createdAt_idx" ON "BusinessOperatorEvent"("businessId", "category", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessOperatorEvent_businessId_status_createdAt_idx" ON "BusinessOperatorEvent"("businessId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "BusinessOperatorEvent" ADD CONSTRAINT "BusinessOperatorEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
