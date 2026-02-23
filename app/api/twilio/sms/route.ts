import { LeadStatus } from '@prisma/client';
import { NextResponse } from 'next/server';

import { findBusinessByTwilioNumber } from '@/lib/business';
import { db } from '@/lib/db';
import { normalizePhoneNumber } from '@/lib/phone';
import { advanceLeadConversation } from '@/lib/sms-state-machine';
import { isSubscriptionActive } from '@/lib/subscription';
import { buildOwnerNotificationMessage, persistInboundMessage, sendAndPersistOutboundMessage } from '@/lib/twilio-messaging';
import { hasValidTwilioWebhookToken } from '@/lib/twilio-webhook';
import { messagingTwiML } from '@/lib/twiml';
import { absoluteUrl } from '@/lib/url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function formField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function xmlOk() {
  return new NextResponse(messagingTwiML(), { headers: { 'Content-Type': 'text/xml' } });
}

export async function POST(request: Request) {
  if (!hasValidTwilioWebhookToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const payload = Object.fromEntries(formData.entries()) as Record<string, string>;

  const to = normalizePhoneNumber(formField(formData, 'To'));
  const from = normalizePhoneNumber(formField(formData, 'From'));
  const body = formField(formData, 'Body');
  const messageSid = formField(formData, 'MessageSid') || formField(formData, 'SmsSid');

  if (!to || !from) {
    return xmlOk();
  }

  const business = await findBusinessByTwilioNumber(to);
  if (!business) {
    return xmlOk();
  }

  const lead =
    (await db.lead.findFirst({
      where: {
        businessId: business.id,
        callerPhoneNormalized: from,
        smsState: { not: 'COMPLETED' },
      },
      orderBy: { createdAt: 'desc' },
    })) ||
    (await db.lead.findFirst({
      where: { businessId: business.id, callerPhoneNormalized: from },
      orderBy: { createdAt: 'desc' },
    }));

  const inbound = await persistInboundMessage({
    businessId: business.id,
    leadId: lead?.id,
    twilioSid: messageSid || null,
    fromPhone: from,
    toPhone: to,
    body,
    rawPayload: payload,
  });

  if (inbound.duplicate) {
    return xmlOk();
  }

  if (!lead) {
    return xmlOk();
  }

  await db.lead.update({
    where: { id: lead.id },
    data: {
      lastInboundAt: new Date(),
      lastInteractionAt: new Date(),
    },
  });

  if (!isSubscriptionActive(business.subscriptionStatus) || lead.billingRequired || !business.twilioPhoneNumber) {
    return xmlOk();
  }

  const transition = advanceLeadConversation(lead, body, business);
  const now = new Date();
  const updatedLead = await db.lead.update({
    where: { id: lead.id },
    data: {
      ...(transition.nextState ? { smsState: transition.nextState } : {}),
      ...(transition.leadUpdates ?? {}),
      ...(transition.markQualified && lead.status === 'NEW' ? { status: LeadStatus.QUALIFIED } : {}),
      ...(transition.completed ? { smsCompletedAt: now } : {}),
      lastInboundAt: now,
      lastInteractionAt: now,
    },
  });

  if (transition.notifyOwner && !updatedLead.ownerNotifiedAt && business.notifyPhone) {
    try {
      const leadUrl = absoluteUrl(`/app/leads/${updatedLead.id}`);
      const ownerMsg = buildOwnerNotificationMessage({
        businessName: business.name,
        leadId: updatedLead.id,
        callerPhone: updatedLead.callerPhoneNormalized,
        serviceRequested: updatedLead.serviceRequested,
        urgency: updatedLead.urgency,
        zipCode: updatedLead.zipCode,
        bestTime: updatedLead.bestTime,
        leadUrl,
      });

      await sendAndPersistOutboundMessage({
        businessId: business.id,
        leadId: updatedLead.id,
        fromPhone: business.twilioPhoneNumber,
        toPhone: business.notifyPhone,
        body: ownerMsg,
        participant: 'OWNER',
      });

      await db.lead.update({ where: { id: updatedLead.id }, data: { ownerNotifiedAt: new Date(), lastOutboundAt: new Date() } });
    } catch (error) {
      console.error('Failed to send owner notification SMS', error);
    }
  }

  try {
    await sendAndPersistOutboundMessage({
      businessId: business.id,
      leadId: updatedLead.id,
      fromPhone: business.twilioPhoneNumber,
      toPhone: updatedLead.callerPhoneNormalized,
      body: transition.responseText,
    });

    await db.lead.update({
      where: { id: updatedLead.id },
      data: {
        lastOutboundAt: new Date(),
        lastInteractionAt: new Date(),
      },
    });
  } catch (error) {
    console.error('Failed to send conversational SMS', error);
  }

  return xmlOk();
}
