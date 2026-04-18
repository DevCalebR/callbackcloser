-- AlterTable
ALTER TABLE "Business"
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "isTestBusiness" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Business_archivedAt_idx" ON "Business"("archivedAt");

-- CreateIndex
CREATE INDEX "Business_isTestBusiness_idx" ON "Business"("isTestBusiness");
