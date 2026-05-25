-- CreateEnum
CREATE TYPE "ForwardedCallAnswerMode" AS ENUM ('PRESS_1_REQUIRED', 'DIRECT_CONNECT');

-- CreateEnum
CREATE TYPE "MessagingSetupMode" AS ENUM ('PER_BUSINESS_TWILIO', 'SHARED_PILOT_MESSAGING_SERVICE');

-- AlterTable
ALTER TABLE "Business"
ADD COLUMN     "forwardedCallAnswerMode" "ForwardedCallAnswerMode" NOT NULL DEFAULT 'PRESS_1_REQUIRED',
ADD COLUMN     "messagingSetupMode" "MessagingSetupMode" NOT NULL DEFAULT 'PER_BUSINESS_TWILIO';

-- AlterTable
ALTER TABLE "Call"
ADD COLUMN     "answerConfirmationRequested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "humanAccepted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "humanAcceptedAt" TIMESTAMP(3);
