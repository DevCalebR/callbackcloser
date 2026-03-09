import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { getCorrelationIdFromRequest, withCorrelationIdHeader } from '@/lib/observability';
import { logTwilioError, logTwilioWarn } from '@/lib/twilio-logging';
import { getTwilioProvisioningBlockReason, linkProvisionedPhoneNumberToBusiness, provisionPhoneNumber } from '@/lib/twilio-provision';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function buildBlockedResponse(blockReason: ReturnType<typeof getTwilioProvisioningBlockReason>) {
  switch (blockReason) {
    case 'already_has_number':
      return NextResponse.json(
        { error: 'This business already has a Twilio phone number.', code: blockReason },
        { status: 409 }
      );
    case 'demo_mode':
      return NextResponse.json(
        { error: 'Twilio number provisioning is disabled while demo mode is enabled.', code: blockReason },
        { status: 409 }
      );
    case 'missing_twilio_credentials':
      return NextResponse.json(
        { error: 'Twilio number provisioning is unavailable until Twilio credentials are configured.', code: blockReason },
        { status: 503 }
      );
    default:
      return NextResponse.json({ error: 'Provisioning is not available.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const correlationId = getCorrelationIdFromRequest(request);
  const withCorrelation = (response: NextResponse) => withCorrelationIdHeader(response, correlationId);

  const { userId } = await auth();
  if (!userId) {
    return withCorrelation(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  }

  const business = await db.business.findUnique({
    where: { ownerClerkId: userId },
    select: {
      id: true,
      name: true,
      twilioPhoneNumber: true,
      twilioPhoneNumberSid: true,
    },
  });

  if (!business) {
    return withCorrelation(NextResponse.json({ error: 'Business not found' }, { status: 404 }));
  }

  const blockReason = getTwilioProvisioningBlockReason(business);
  if (blockReason) {
    logTwilioWarn('provisioning', 'manual_provision_blocked', {
      correlationId,
      businessId: business.id,
      ownerClerkId: userId,
      decision: blockReason,
    });

    return withCorrelation(buildBlockedResponse(blockReason));
  }

  try {
    const provisionedNumber = await provisionPhoneNumber({
      businessName: business.name,
      correlationId,
    });

    await linkProvisionedPhoneNumberToBusiness({
      businessId: business.id,
      phoneNumber: provisionedNumber.phoneNumber,
      phoneNumberSid: provisionedNumber.phoneNumberSid,
      syncedAt: provisionedNumber.syncedAt,
      correlationId,
    });

    return withCorrelation(
      NextResponse.json({
        ok: true,
        phoneNumber: provisionedNumber.phoneNumber,
        phoneNumberSid: provisionedNumber.phoneNumberSid,
      })
    );
  } catch (error) {
    logTwilioError(
      'provisioning',
      'manual_provision_failed',
      {
        correlationId,
        businessId: business.id,
        ownerClerkId: userId,
        decision: 'return_503',
      },
      error
    );

    return withCorrelation(NextResponse.json({ error: 'Failed to provision Twilio number.' }, { status: 503 }));
  }
}
