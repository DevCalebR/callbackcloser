import { LeadReadiness, LeadStatus, OwnerNotificationChannel, OwnerNotificationStatus, type Business, type Lead } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { isBusinessAutomationPaused } from '@/lib/admin-dashboard';
import { getEffectiveBusinessNotificationSettings } from '@/lib/business-notification-settings';
import { db } from '@/lib/db';
import { sendTransactionalEmail } from '@/lib/email';
import { buildLeadSummary, getLeadServiceType, isLeadQualified } from '@/lib/lead-qualification';
import { formatPhoneDetail, recordBusinessOperatorEvent } from '@/lib/operator-events';
import { formatPhoneForDisplay } from '@/lib/phone';
import { logTwilioError, logTwilioInfo, logTwilioWarn } from '@/lib/twilio-logging';
import { sendAndPersistOutboundMessage } from '@/lib/twilio-messaging';
import { absoluteUrl } from '@/lib/url';

type NotificationLeadRecord = Lead & {
  business: Pick<
    Business,
    | 'id'
    | 'name'
    | 'ownerClerkId'
    | 'notifyPhone'
    | 'twilioAccountMode'
    | 'twilioSubaccountSid'
    | 'twilioMessagingServiceSid'
    | 'twilioPrimaryPhoneNumber'
    | 'twilioPhoneNumber'
    | 'messagingSetupMode'
    | 'managedTwilioStatus'
    | 'messagingComplianceType'
    | 'a2pFailureReason'
    | 'tollFreeVerificationStatus'
    | 'tollFreeVerificationSid'
    | 'tollFreeVerificationNote'
  >;
};

function compactSummary(value: string, maxLength = 280) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function buildLeadUrl(leadId: string) {
  return absoluteUrl(`/app/leads/${leadId}`);
}

function buildOwnerSmsBody(lead: NotificationLeadRecord) {
  const serviceType = getLeadServiceType(lead) || 'Service request';
  const readinessLabel =
    lead.readiness === LeadReadiness.URGENT ? 'Urgent' : lead.readiness === LeadReadiness.QUALIFIED ? 'Qualified' : 'Pending';
  const leadUrl = buildLeadUrl(lead.id);

  return compactSummary(
    `CallbackCloser lead for ${lead.business.name}: ${serviceType}. ${lead.urgency ? `Urgency: ${lead.urgency}. ` : ''}${
      lead.location || lead.zipCode ? `Location: ${lead.location || lead.zipCode}. ` : ''
    }${lead.callbackRequested === false ? 'Callback not requested. ' : ''}Readiness: ${readinessLabel}. Open lead: ${leadUrl}`
  );
}

function buildOwnerEmailContent(lead: NotificationLeadRecord) {
  const leadUrl = buildLeadUrl(lead.id);
  const summary = buildLeadSummary(lead);
  const subject = `CallbackCloser lead: ${getLeadServiceType(lead) || 'Missed call follow-up'} for ${lead.business.name}`;
  const text = [
    `CallbackCloser qualified a missed-call lead for ${lead.business.name}.`,
    '',
    summary,
    '',
    `Caller: ${formatPhoneForDisplay(lead.callerPhoneNormalized || lead.callerPhone)}`,
    `Lead status: ${lead.status}`,
    `Open lead: ${leadUrl}`,
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>CallbackCloser qualified a missed-call lead</h2>
      <p><strong>Business:</strong> ${lead.business.name}</p>
      <p><strong>Summary:</strong> ${summary}</p>
      <p><strong>Caller:</strong> ${formatPhoneForDisplay(lead.callerPhoneNormalized || lead.callerPhone)}</p>
      <p><strong>Lead status:</strong> ${lead.status}</p>
      <p><a href="${leadUrl}">Open lead in CallbackCloser</a></p>
    </div>
  `;

  return { subject, text, html };
}

async function createNotificationRecord(params: {
  businessId: string;
  leadId: string;
  channel: OwnerNotificationChannel;
  destination?: string | null;
  body: string;
  subject?: string | null;
}) {
  try {
    return await db.ownerNotification.create({
      data: {
        businessId: params.businessId,
        leadId: params.leadId,
        channel: params.channel,
        destination: params.destination ?? null,
        body: params.body,
        subject: params.subject ?? null,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return db.ownerNotification.findUniqueOrThrow({
        where: { leadId_channel: { leadId: params.leadId, channel: params.channel } },
      });
    }
    throw error;
  }
}

async function markNotificationResult(
  leadId: string,
  channel: OwnerNotificationChannel,
  input: { status: OwnerNotificationStatus; error?: string | null; metadata?: Prisma.InputJsonValue; sentAt?: Date | null }
) {
  await db.ownerNotification.update({
    where: { leadId_channel: { leadId, channel } },
    data: {
      status: input.status,
      error: input.error ?? null,
      metadata: input.metadata,
      sentAt: input.sentAt ?? (input.status === OwnerNotificationStatus.SENT ? new Date() : null),
    },
  });
}

async function getLeadForOwnerNotifications(leadId: string) {
  return db.lead.findUnique({
    where: { id: leadId },
    include: {
      business: {
        select: {
          id: true,
          name: true,
          ownerClerkId: true,
          notifyPhone: true,
          twilioAccountMode: true,
          twilioSubaccountSid: true,
          twilioMessagingServiceSid: true,
          twilioPrimaryPhoneNumber: true,
          twilioPhoneNumber: true,
          messagingSetupMode: true,
          managedTwilioStatus: true,
          messagingComplianceType: true,
          a2pFailureReason: true,
          tollFreeVerificationStatus: true,
          tollFreeVerificationSid: true,
          tollFreeVerificationNote: true,
          provisioningStatus: true,
          archivedAt: true,
        },
      },
    },
  });
}

export async function sendOwnerLeadSms(leadId: string) {
  const lead = await getLeadForOwnerNotifications(leadId);
  if (!lead) throw new Error('Lead not found for SMS owner notification');

  const settings = await getEffectiveBusinessNotificationSettings(lead.business);
  const destination = settings.ownerPhone;
  const body = buildOwnerSmsBody(lead);
  await createNotificationRecord({
    businessId: lead.businessId,
    leadId,
    channel: OwnerNotificationChannel.SMS,
    destination,
    body,
  });

  if (!settings.notifySms) {
    await markNotificationResult(leadId, OwnerNotificationChannel.SMS, {
      status: OwnerNotificationStatus.SKIPPED,
      error: 'SMS notifications disabled',
    });
    await recordBusinessOperatorEvent({
      businessId: lead.businessId,
      type: 'owner_alert.sms_skipped',
      category: 'OWNER_ALERTS',
      status: 'WARNING',
      summary: 'Owner SMS alert skipped',
      details: {
        reason: 'SMS notifications disabled',
        destinationPhone: formatPhoneDetail(destination),
      },
      relatedEntityType: 'lead',
      relatedEntityId: leadId,
    });
    return { status: 'skipped' as const };
  }

  if (!destination || !(lead.business.twilioPrimaryPhoneNumber || lead.business.twilioPhoneNumber)) {
    await markNotificationResult(leadId, OwnerNotificationChannel.SMS, {
      status: OwnerNotificationStatus.SKIPPED,
      error: 'Missing owner phone or business texting number',
    });
    await recordBusinessOperatorEvent({
      businessId: lead.businessId,
      type: 'owner_alert.sms_skipped',
      category: 'OWNER_ALERTS',
      status: 'WARNING',
      summary: 'Owner SMS alert skipped',
      details: {
        reason: 'Missing owner phone or business texting number',
        destinationPhone: formatPhoneDetail(destination),
      },
      relatedEntityType: 'lead',
      relatedEntityId: leadId,
    });
    return { status: 'skipped' as const };
  }

  if (lead.isSimulator) {
    await markNotificationResult(leadId, OwnerNotificationChannel.SMS, {
      status: OwnerNotificationStatus.SENT,
      metadata: { simulated: true, preview: true },
    });
    await recordBusinessOperatorEvent({
      businessId: lead.businessId,
      type: 'owner_alert.sms_sent',
      category: 'OWNER_ALERTS',
      status: 'SUCCESS',
      summary: 'Owner SMS alert recorded for simulator',
      details: {
        destinationPhone: formatPhoneDetail(destination),
        simulated: true,
      },
      relatedEntityType: 'lead',
      relatedEntityId: leadId,
    });
    return { status: 'simulated' as const };
  }

  try {
    const result = await sendAndPersistOutboundMessage({
      businessId: lead.businessId,
      leadId,
      fromPhone: lead.business.twilioPrimaryPhoneNumber || lead.business.twilioPhoneNumber!,
      toPhone: destination,
      body,
      participant: 'OWNER',
      context: 'owner_alert',
      twilioSubaccountSid: lead.business.twilioAccountMode === 'MAIN_ACCOUNT' ? null : lead.business.twilioSubaccountSid,
      messagingServiceSid: lead.business.twilioMessagingServiceSid,
      messagingSetupMode: lead.business.messagingSetupMode,
      managedTwilioStatus: lead.business.managedTwilioStatus,
      a2pFailureReason: lead.business.a2pFailureReason,
      messagingComplianceType: lead.business.messagingComplianceType,
      tollFreeVerificationStatus: lead.business.tollFreeVerificationStatus,
      tollFreeVerificationSid: lead.business.tollFreeVerificationSid,
      tollFreeVerificationNote: lead.business.tollFreeVerificationNote,
    });

    if (result.suppressed) {
      await markNotificationResult(leadId, OwnerNotificationChannel.SMS, {
        status: OwnerNotificationStatus.SKIPPED,
        error: result.reason,
      });
      await recordBusinessOperatorEvent({
        businessId: lead.businessId,
        type: 'owner_alert.sms_skipped',
        category: 'OWNER_ALERTS',
        status: 'WARNING',
        summary: 'Owner SMS alert skipped',
        details: {
          reason: result.reason,
          destinationPhone: formatPhoneDetail(destination),
        },
        relatedEntityType: 'lead',
        relatedEntityId: leadId,
      });
      logTwilioWarn('sms', 'owner_lead_sms_skipped', { leadId, businessId: lead.businessId, decision: result.reason });
      return { status: 'skipped' as const };
    }

    await markNotificationResult(leadId, OwnerNotificationChannel.SMS, {
      status: OwnerNotificationStatus.SENT,
      metadata: { twilioSid: result.sent.sid, provider: 'twilio' },
    });
    await recordBusinessOperatorEvent({
      businessId: lead.businessId,
      type: 'owner_alert.sms_sent',
      category: 'OWNER_ALERTS',
      status: 'SUCCESS',
      summary: 'Owner SMS alert sent',
      details: {
        destinationPhone: formatPhoneDetail(destination),
      },
      relatedEntityType: 'lead',
      relatedEntityId: leadId,
    });

    return { status: 'sent' as const };
  } catch (error) {
    await markNotificationResult(leadId, OwnerNotificationChannel.SMS, {
      status: OwnerNotificationStatus.FAILED,
      error: error instanceof Error ? error.message : String(error),
    });
    await recordBusinessOperatorEvent({
      businessId: lead.businessId,
      type: 'owner_alert.sms_failed',
      category: 'OWNER_ALERTS',
      status: 'FAILED',
      summary: 'Owner SMS alert failed',
      details: {
        destinationPhone: formatPhoneDetail(destination),
        error: error instanceof Error ? error.message : String(error),
      },
      relatedEntityType: 'lead',
      relatedEntityId: leadId,
    });
    logTwilioError('sms', 'owner_lead_sms_failed', { leadId, businessId: lead.businessId, decision: 'owner_sms_failed' }, error);
    return { status: 'failed' as const };
  }
}

export async function sendOwnerLeadEmail(leadId: string) {
  const lead = await getLeadForOwnerNotifications(leadId);
  if (!lead) throw new Error('Lead not found for email owner notification');

  const settings = await getEffectiveBusinessNotificationSettings(lead.business);
  const { subject, text, html } = buildOwnerEmailContent(lead);
  await createNotificationRecord({
    businessId: lead.businessId,
    leadId,
    channel: OwnerNotificationChannel.EMAIL,
    destination: settings.ownerEmail,
    body: text,
    subject,
  });

  if (!settings.notifyEmail) {
    await markNotificationResult(leadId, OwnerNotificationChannel.EMAIL, {
      status: OwnerNotificationStatus.SKIPPED,
      error: 'Email notifications disabled',
    });
    await recordBusinessOperatorEvent({
      businessId: lead.businessId,
      type: 'owner_alert.email_skipped',
      category: 'OWNER_ALERTS',
      status: 'WARNING',
      summary: 'Owner email alert skipped',
      details: {
        reason: 'Email notifications disabled',
        destinationEmail: settings.ownerEmail,
      },
      relatedEntityType: 'lead',
      relatedEntityId: leadId,
    });
    return { status: 'skipped' as const };
  }

  if (!settings.ownerEmail) {
    await markNotificationResult(leadId, OwnerNotificationChannel.EMAIL, {
      status: OwnerNotificationStatus.SKIPPED,
      error: 'Missing owner email',
    });
    await recordBusinessOperatorEvent({
      businessId: lead.businessId,
      type: 'owner_alert.email_skipped',
      category: 'OWNER_ALERTS',
      status: 'WARNING',
      summary: 'Owner email alert skipped',
      details: {
        reason: 'Missing owner email',
      },
      relatedEntityType: 'lead',
      relatedEntityId: leadId,
    });
    return { status: 'skipped' as const };
  }

  if (lead.isSimulator) {
    await markNotificationResult(leadId, OwnerNotificationChannel.EMAIL, {
      status: OwnerNotificationStatus.SENT,
      metadata: { simulated: true, preview: true },
    });
    await recordBusinessOperatorEvent({
      businessId: lead.businessId,
      type: 'owner_alert.email_sent',
      category: 'OWNER_ALERTS',
      status: 'SUCCESS',
      summary: 'Owner email alert recorded for simulator',
      details: {
        destinationEmail: settings.ownerEmail,
        simulated: true,
      },
      relatedEntityType: 'lead',
      relatedEntityId: leadId,
    });
    return { status: 'simulated' as const };
  }

  const result = await sendTransactionalEmail({ to: settings.ownerEmail, subject, text, html });
  if (!result.ok) {
    await markNotificationResult(leadId, OwnerNotificationChannel.EMAIL, {
      status: result.reason === 'missing_config' ? OwnerNotificationStatus.SKIPPED : OwnerNotificationStatus.FAILED,
      error: result.error || result.reason,
    });
    await recordBusinessOperatorEvent({
      businessId: lead.businessId,
      type: result.reason === 'missing_config' ? 'owner_alert.email_skipped' : 'owner_alert.email_failed',
      category: 'OWNER_ALERTS',
      status: result.reason === 'missing_config' ? 'WARNING' : 'FAILED',
      summary: result.reason === 'missing_config' ? 'Owner email alert skipped' : 'Owner email alert failed',
      details: {
        destinationEmail: settings.ownerEmail,
        error: result.error || result.reason,
      },
      relatedEntityType: 'lead',
      relatedEntityId: leadId,
    });
    return { status: result.reason === 'missing_config' ? 'skipped' as const : 'failed' as const };
  }

  await markNotificationResult(leadId, OwnerNotificationChannel.EMAIL, {
    status: OwnerNotificationStatus.SENT,
    metadata: { provider: result.provider },
  });
  await recordBusinessOperatorEvent({
    businessId: lead.businessId,
    type: 'owner_alert.email_sent',
    category: 'OWNER_ALERTS',
    status: 'SUCCESS',
    summary: 'Owner email alert sent',
    details: {
      destinationEmail: settings.ownerEmail,
      provider: result.provider,
    },
    relatedEntityType: 'lead',
    relatedEntityId: leadId,
  });
  return { status: 'sent' as const };
}

export async function createOwnerInAppNotification(leadId: string) {
  const lead = await getLeadForOwnerNotifications(leadId);
  if (!lead) throw new Error('Lead not found for in-app owner notification');

  const settings = await getEffectiveBusinessNotificationSettings(lead.business);
  const leadUrl = buildLeadUrl(lead.id);
  await createNotificationRecord({
    businessId: lead.businessId,
    leadId,
    channel: OwnerNotificationChannel.IN_APP,
    body: `${buildLeadSummary(lead)}\n\nOpen lead: ${leadUrl}`,
    subject: `Lead ready for ${lead.business.name}`,
  });

  if (!settings.notifyInApp) {
    await markNotificationResult(leadId, OwnerNotificationChannel.IN_APP, {
      status: OwnerNotificationStatus.SKIPPED,
      error: 'In-app notifications disabled',
    });
    await recordBusinessOperatorEvent({
      businessId: lead.businessId,
      type: 'owner_alert.in_app_skipped',
      category: 'OWNER_ALERTS',
      status: 'WARNING',
      summary: 'In-app owner alert skipped',
      details: {
        reason: 'In-app notifications disabled',
      },
      relatedEntityType: 'lead',
      relatedEntityId: leadId,
    });
    return { status: 'skipped' as const };
  }

  await markNotificationResult(leadId, OwnerNotificationChannel.IN_APP, {
    status: OwnerNotificationStatus.SENT,
    metadata: { dashboardVisible: true },
  });
  await recordBusinessOperatorEvent({
    businessId: lead.businessId,
    type: 'owner_alert.in_app_sent',
    category: 'OWNER_ALERTS',
    status: 'SUCCESS',
    summary: 'In-app owner alert created',
    details: {
      dashboardVisible: true,
    },
    relatedEntityType: 'lead',
    relatedEntityId: leadId,
  });
  return { status: 'sent' as const };
}

export async function notifyQualifiedLeadIfNeeded(leadId: string) {
  const lead = await getLeadForOwnerNotifications(leadId);
  if (!lead) return { notified: false, reason: 'lead_not_found' as const };
  if (!isLeadQualified(lead)) return { notified: false, reason: 'lead_not_qualified' as const };
  if (lead.notifiedAt) return { notified: false, reason: 'already_notified' as const };
  if (isBusinessAutomationPaused(lead.business)) {
    return { notified: false, reason: 'business_paused' as const };
  }

  const settings = await getEffectiveBusinessNotificationSettings(lead.business);
  if (settings.urgentOnly && lead.readiness !== LeadReadiness.URGENT) {
    return { notified: false, reason: 'waiting_for_urgent_readiness' as const };
  }

  const claimed = await db.lead.updateMany({
    where: {
      id: leadId,
      notifiedAt: null,
      status: { in: [LeadStatus.NEW, LeadStatus.QUALIFIED] },
    },
    data: {
      notifiedAt: new Date(),
      ownerNotifiedAt: new Date(),
      status: LeadStatus.NOTIFIED,
      lastInteractionAt: new Date(),
    },
  });

  if (claimed.count === 0) {
    return { notified: false, reason: 'already_claimed' as const };
  }

  const [sms, email, inApp] = await Promise.all([
    sendOwnerLeadSms(leadId),
    sendOwnerLeadEmail(leadId),
    createOwnerInAppNotification(leadId),
  ]);

  logTwilioInfo('messaging', 'qualified_lead_notifications_processed', {
    leadId,
    businessId: lead.businessId,
    smsStatus: sms.status,
    emailStatus: email.status,
    inAppStatus: inApp.status,
    decision: 'notify_owner_once',
  });

  return { notified: true, sms, email, inApp };
}
