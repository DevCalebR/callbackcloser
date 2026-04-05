ALTER TABLE "Business" ADD COLUMN     "twilioSubaccountSid" TEXT;

CREATE UNIQUE INDEX "Business_twilioSubaccountSid_key" ON "Business"("twilioSubaccountSid");
