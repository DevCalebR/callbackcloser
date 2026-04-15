import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { getLeadRecordingForOwnerClerkId } from '@/lib/business-access';
import { getTwilioRecordingMediaUrl, resolveRecordingAccessReason } from '@/lib/recording-access';
import { absoluteUrl } from '@/lib/url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { leadId: string } }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(absoluteUrl('/sign-in'), { status: 303 });
  }

  const lead = await getLeadRecordingForOwnerClerkId({
    leadId: params.leadId,
    ownerClerkId: userId,
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

  const mediaUrl = getTwilioRecordingMediaUrl(lead.call!.recordingUrl!);
  if (!mediaUrl) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    console.error('recording.proxy.misconfigured', { leadId: lead.id });
    return NextResponse.json({ error: 'Recording unavailable' }, { status: 503 });
  }

  let twilioResponse: Response;
  try {
    twilioResponse = await fetch(mediaUrl.toString(), {
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        Accept: 'audio/mpeg,audio/wav,*/*',
      },
      cache: 'no-store',
    });
  } catch (error) {
    console.error('recording.proxy.fetch_error', {
      leadId: lead.id,
      host: mediaUrl.hostname,
      error: error instanceof Error ? error.message : 'unknown_error',
    });
    return NextResponse.json({ error: 'Recording unavailable' }, { status: 502 });
  }

  if (twilioResponse.status === 404) {
    return NextResponse.json({ error: 'Recording not available for this lead' }, { status: 404 });
  }

  if (!twilioResponse.ok || !twilioResponse.body) {
    console.error('recording.proxy.upstream_error', {
      leadId: lead.id,
      status: twilioResponse.status,
      statusText: twilioResponse.statusText,
      host: mediaUrl.hostname,
    });
    return NextResponse.json({ error: 'Recording unavailable' }, { status: 502 });
  }

  const headers = new Headers();
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Content-Type', twilioResponse.headers.get('content-type') ?? 'audio/mpeg');
  headers.set('X-Content-Type-Options', 'nosniff');

  const contentLength = twilioResponse.headers.get('content-length');
  if (contentLength) {
    headers.set('Content-Length', contentLength);
  }

  const contentDisposition = twilioResponse.headers.get('content-disposition');
  if (contentDisposition) {
    headers.set('Content-Disposition', contentDisposition);
  }

  return new NextResponse(twilioResponse.body, { status: 200, headers });
}
