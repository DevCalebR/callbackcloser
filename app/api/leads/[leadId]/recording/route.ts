import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { resolveRecordingAccessReason } from '@/lib/recording-access';
import { absoluteUrl } from '@/lib/url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { leadId: string } }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(absoluteUrl('/sign-in'), { status: 303 });
  }

  const lead = await db.lead.findUnique({
    where: { id: params.leadId },
    select: {
      id: true,
      business: {
        select: {
          ownerClerkId: true,
        },
      },
      call: {
        select: {
          recordingUrl: true,
        },
      },
    },
  });

  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  const accessReason = resolveRecordingAccessReason({
    requestUserId: userId,
    businessOwnerClerkId: lead.business.ownerClerkId,
    recordingUrl: lead.call?.recordingUrl ?? null,
  });

  if (accessReason === 'wrong_business') {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  if (accessReason === 'recording_unavailable') {
    return NextResponse.json({ error: 'Recording not available for this lead' }, { status: 404 });
  }

  if (accessReason !== 'ok') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.redirect(lead.call!.recordingUrl!, { status: 303 });
}
