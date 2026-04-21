-- CreateEnum
CREATE TYPE "TwilioAccountMode" AS ENUM (
    'MAIN_ACCOUNT',
    'BUSINESS_SUBACCOUNT'
);

-- CreateEnum
CREATE TYPE "TwilioNumberSetupMode" AS ENUM (
    'NEW_NUMBER',
    'EXISTING_NUMBER'
);

-- AlterTable
ALTER TABLE "Business"
ADD COLUMN "twilioAccountMode" "TwilioAccountMode" NOT NULL DEFAULT 'BUSINESS_SUBACCOUNT',
ADD COLUMN "twilioNumberSetupMode" "TwilioNumberSetupMode" NOT NULL DEFAULT 'NEW_NUMBER';
