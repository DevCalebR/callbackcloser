import 'server-only';

import {
  BusinessPhoneSetupPath,
  BusinessProvisioningStatus,
  ForwardedCallAnswerMode,
  ForwardingVerificationStatus,
  ManagedTwilioStatus,
  MessagingSetupMode,
  SubscriptionStatus,
  TwilioAccountMode,
  TwilioNumberSetupMode,
} from '@prisma/client';

import { ensureBusinessNotificationSettings } from '@/lib/business-notification-settings';
import { db } from '@/lib/db';
import { sendTransactionalEmail } from '@/lib/email';
import { formatPhoneDetail, recordBusinessOperatorEvent } from '@/lib/operator-events';
import { absoluteUrl } from '@/lib/url';

type ManagedSetupOwnerProfile = {
  businessName?: string | null;
  ownerEmail?: string | null;
  ownerName?: string | null;
  ownerPhone?: string | null;
};

function parseAdminEmailAllowlist(value: string | undefined) {
  return Array.from(
    new Set(
      (value ?? '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function buildManagedSetupBusinessName(profile: ManagedSetupOwnerProfile) {
  const businessName = profile.businessName?.trim();
  if (businessName) return businessName;

  const ownerName = profile.ownerName?.trim();
  if (ownerName) return `${ownerName} Business`;

  return 'New CallbackCloser signup';
}

function buildFounderSetupNotification(params: {
  adminBusinessUrl: string;
  businessName: string;
  ownerEmail: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
}) {
  const lines = [
    'New CallbackCloser signup needs setup.',
    '',
    `Business: ${params.businessName}`,
    `Owner: ${params.ownerName || 'Not provided yet'}`,
    `Email: ${params.ownerEmail || 'Not provided yet'}`,
    `Phone: ${params.ownerPhone || 'Not provided yet'}`,
    '',
    'Open admin to finish setup:',
    params.adminBusinessUrl,
  ];

  return {
    subject: 'New CallbackCloser signup needs setup',
    text: lines.join('\n'),
  };
}

function buildCustomerReadyNotification(loginUrl: string) {
  const lines = [
    'Your CallbackCloser account is ready.',
    '',
    'Your missed-call recovery system is set up and ready to help recover leads. You can now log in to view your Lead Recovery Command Center.',
    '',
    loginUrl,
  ];

  return {
    subject: 'Your CallbackCloser account is ready',
    text: lines.join('\n'),
  };
}

async function notifyFounderOfPendingSignup(params: {
  adminBusinessUrl: string;
  businessId: string;
  businessName: string;
  ownerEmail: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
}) {
  const emailRecipients = parseAdminEmailAllowlist(process.env.ADMIN_EMAIL_ALLOWLIST);
  const message = buildFounderSetupNotification(params);

  const results = await Promise.all(
    emailRecipients.map((recipient) =>
      sendTransactionalEmail({
        to: recipient,
        subject: message.subject,
        text: message.text,
      }),
    ),
  );

  await recordBusinessOperatorEvent({
    businessId: params.businessId,
    type: 'onboarding.customer_signup_pending_setup',
    category: 'ONBOARDING',
    status: 'INFO',
    summary: 'New customer signup is waiting for founder setup',
    details: {
      businessName: params.businessName,
      ownerName: params.ownerName,
      ownerEmail: params.ownerEmail,
      ownerPhone: formatPhoneDetail(params.ownerPhone),
      adminBusinessUrl: params.adminBusinessUrl,
      founderEmailsConfigured: emailRecipients.length > 0,
      founderEmailsAttempted: emailRecipients.length,
      founderEmailsDelivered: results.filter((result) => result.ok).length,
    },
  });
}

export async function ensurePendingBusinessForOwner(ownerClerkId: string, profile: ManagedSetupOwnerProfile = {}) {
  const existing = await db.business.findUnique({
    where: { ownerClerkId },
    include: { notificationSettings: true },
  });

  if (existing) {
    if ((profile.ownerName && !existing.ownerName) || (profile.businessName && existing.name === 'New CallbackCloser signup')) {
      await db.business.update({
        where: { id: existing.id },
        data: {
          ownerName: existing.ownerName || profile.ownerName?.trim() || null,
          name: existing.name === 'New CallbackCloser signup' ? buildManagedSetupBusinessName(profile) : existing.name,
        },
      });
    }

    await ensureBusinessNotificationSettings(existing, {
      ownerEmail: profile.ownerEmail || null,
      ownerPhone: profile.ownerPhone || null,
    });

    return db.business.findUniqueOrThrow({ where: { id: existing.id } });
  }

  const business = await db.business.create({
    data: {
      ownerClerkId,
      name: buildManagedSetupBusinessName(profile),
      ownerName: profile.ownerName?.trim() || null,
      forwardingNumber: '',
      notifyPhone: profile.ownerPhone?.trim() || null,
      provisioningStatus: BusinessProvisioningStatus.DRAFT,
      twilioAccountMode: TwilioAccountMode.BUSINESS_SUBACCOUNT,
      phoneSetupPath: BusinessPhoneSetupPath.NEW_TWILIO_NUMBER,
      forwardedCallAnswerMode: ForwardedCallAnswerMode.PRESS_1_REQUIRED,
      messagingSetupMode: MessagingSetupMode.PER_BUSINESS_TWILIO,
      twilioNumberSetupMode: TwilioNumberSetupMode.NEW_NUMBER,
      forwardingVerificationStatus: ForwardingVerificationStatus.NOT_STARTED,
      missedCallSeconds: 20,
      serviceLabel1: 'Repair',
      serviceLabel2: 'Install',
      serviceLabel3: 'Maintenance',
      timezone: 'America/New_York',
      subscriptionStatus: SubscriptionStatus.INACTIVE,
      managedTwilioStatus: ManagedTwilioStatus.DRAFT,
      managedTwilioStatusUpdatedAt: new Date(),
    },
  });

  await ensureBusinessNotificationSettings(business, {
    ownerEmail: profile.ownerEmail || null,
    ownerPhone: profile.ownerPhone || null,
  });

  await notifyFounderOfPendingSignup({
    adminBusinessUrl: absoluteUrl(`/admin/${business.id}`),
    businessId: business.id,
    businessName: business.name,
    ownerEmail: profile.ownerEmail?.trim().toLowerCase() || null,
    ownerName: profile.ownerName?.trim() || null,
    ownerPhone: profile.ownerPhone?.trim() || null,
  });

  return business;
}

export async function sendCustomerReadyNotification(businessId: string) {
  const business = await db.business.findUnique({
    where: { id: businessId },
    include: { notificationSettings: true },
  });

  if (!business) {
    return { ok: false as const, reason: 'business_not_found' as const };
  }

  const ownerEmail = business.notificationSettings?.ownerEmail?.trim().toLowerCase() || null;
  const loginUrl = absoluteUrl('/sign-in');

  if (!ownerEmail) {
    await recordBusinessOperatorEvent({
      businessId,
      type: 'onboarding.customer_ready_notification_missing_email',
      category: 'ONBOARDING',
      status: 'WARNING',
      summary: 'Customer ready notification skipped because no owner email is saved',
      details: { loginUrl },
    });

    return { ok: false as const, reason: 'missing_owner_email' as const };
  }

  const message = buildCustomerReadyNotification(loginUrl);
  const result = await sendTransactionalEmail({
    to: ownerEmail,
    subject: message.subject,
    text: message.text,
  });

  await recordBusinessOperatorEvent({
    businessId,
    type: 'onboarding.customer_ready_notification_sent',
    category: 'ONBOARDING',
    status: result.ok ? 'SUCCESS' : 'WARNING',
    summary: result.ok ? 'Customer ready notification sent' : 'Customer ready notification could not be delivered',
    details: {
      ownerEmail,
      loginUrl,
      deliveryStatus: result.ok ? 'sent' : result.reason,
    },
  });

  return result.ok ? { ok: true as const } : { ok: false as const, reason: result.reason };
}
