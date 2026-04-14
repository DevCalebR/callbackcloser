import { randomUUID } from 'node:crypto';

import {
  LeadReadiness,
  LeadStatus,
  ManagedTwilioStatus,
  MessageDirection,
  MessageParticipant,
  OwnerNotificationChannel,
  OwnerNotificationStatus,
  SmsConversationState,
  SubscriptionStatus,
} from '@prisma/client';

import { db } from '../lib/db.ts';

function uniqueDigits(seed: string) {
  return seed.replace(/\D/g, '').padEnd(10, '7').slice(0, 10);
}

function makePhone(seed: string, suffix: string) {
  return `+1${uniqueDigits(`${seed}${suffix}`)}`;
}

function makeSid(prefix: string, seed: string) {
  return `${prefix}${seed.replace(/-/g, '').padEnd(32, '0').slice(0, 32)}`;
}

export async function seedTenantFixtures() {
  const seed = randomUUID();
  const now = new Date();
  const ownerA = `tenant-user-a-${seed}`;
  const ownerB = `tenant-user-b-${seed}`;

  const businessA = await db.business.create({
    data: {
      ownerClerkId: ownerA,
      name: `Tenant A ${seed.slice(0, 6)}`,
      forwardingNumber: makePhone(seed, '101'),
      notifyPhone: makePhone(seed, '201'),
      missedCallSeconds: 18,
      timezone: 'America/New_York',
      serviceLabel1: 'Repair',
      serviceLabel2: 'Install',
      serviceLabel3: 'Tune-up',
      twilioPhoneNumber: makePhone(seed, '301'),
      twilioPhoneNumberSid: makeSid('PN', `${seed}a`),
      twilioPrimaryPhoneNumber: makePhone(seed, '301'),
      twilioPrimaryNumberSid: makeSid('PN', `${seed}b`),
      twilioMessagingServiceSid: makeSid('MG', `${seed}c`),
      twilioSubaccountSid: makeSid('AC', `${seed}d`),
      stripeCustomerId: `cus_${seed.replace(/-/g, '').slice(0, 10)}a`,
      stripeSubscriptionId: `sub_${seed.replace(/-/g, '').slice(0, 10)}a`,
      stripePriceId: 'price_starter_fixture',
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      managedTwilioStatus: ManagedTwilioStatus.COMPLIANT_LIVE,
      managedTwilioStatusUpdatedAt: now,
      twilioWebhookSyncedAt: now,
    },
  });

  const businessB = await db.business.create({
    data: {
      ownerClerkId: ownerB,
      name: `Tenant B ${seed.slice(0, 6)}`,
      forwardingNumber: makePhone(seed, '102'),
      notifyPhone: makePhone(seed, '202'),
      missedCallSeconds: 25,
      timezone: 'America/Chicago',
      serviceLabel1: 'Drain',
      serviceLabel2: 'Leak',
      serviceLabel3: 'Replacement',
      twilioPhoneNumber: makePhone(seed, '302'),
      twilioPhoneNumberSid: makeSid('PN', `${seed}e`),
      twilioPrimaryPhoneNumber: makePhone(seed, '302'),
      twilioPrimaryNumberSid: makeSid('PN', `${seed}f`),
      twilioMessagingServiceSid: makeSid('MG', `${seed}g`),
      twilioSubaccountSid: makeSid('AC', `${seed}h`),
      stripeCustomerId: `cus_${seed.replace(/-/g, '').slice(0, 10)}b`,
      stripeSubscriptionId: `sub_${seed.replace(/-/g, '').slice(0, 10)}b`,
      stripePriceId: 'price_growth_fixture',
      subscriptionStatus: SubscriptionStatus.PAST_DUE,
      managedTwilioStatus: ManagedTwilioStatus.AWAITING_BUSINESS_VERIFICATION,
      managedTwilioStatusUpdatedAt: now,
      twilioWebhookSyncedAt: now,
    },
  });

  await db.businessNotificationSettings.createMany({
    data: [
      {
        businessId: businessA.id,
        ownerPhone: businessA.notifyPhone,
        ownerEmail: `tenant-a-${seed.slice(0, 6)}@example.com`,
        notifySms: true,
        notifyEmail: true,
        notifyInApp: true,
        urgentOnly: false,
      },
      {
        businessId: businessB.id,
        ownerPhone: businessB.notifyPhone,
        ownerEmail: `tenant-b-${seed.slice(0, 6)}@example.com`,
        notifySms: false,
        notifyEmail: true,
        notifyInApp: false,
        urgentOnly: true,
      },
    ],
  });

  const callA = await db.call.create({
    data: {
      businessId: businessA.id,
      twilioCallSid: makeSid('CA', `${seed}i`),
      fromPhone: makePhone(seed, '401'),
      fromPhoneNormalized: makePhone(seed, '401'),
      toPhone: businessA.twilioPrimaryPhoneNumber!,
      toPhoneNormalized: businessA.twilioPrimaryPhoneNumber!,
      status: 'MISSED',
      missed: true,
      recordingUrl: 'https://api.twilio.com/2010-04-01/Accounts/AC123/Recordings/RE123',
      recordingStatus: 'completed',
      createdAt: now,
    },
  });

  const callB = await db.call.create({
    data: {
      businessId: businessB.id,
      twilioCallSid: makeSid('CA', `${seed}j`),
      fromPhone: makePhone(seed, '402'),
      fromPhoneNormalized: makePhone(seed, '402'),
      toPhone: businessB.twilioPrimaryPhoneNumber!,
      toPhoneNormalized: businessB.twilioPrimaryPhoneNumber!,
      status: 'MISSED',
      missed: true,
      recordingUrl: 'https://api.twilio.com/2010-04-01/Accounts/AC123/Recordings/RE999',
      recordingStatus: 'completed',
      createdAt: now,
    },
  });

  const leadA = await db.lead.create({
    data: {
      businessId: businessA.id,
      callId: callA.id,
      callerPhone: callA.fromPhone,
      callerPhoneNormalized: callA.fromPhoneNormalized,
      status: LeadStatus.NOTIFIED,
      readiness: LeadReadiness.URGENT,
      billingRequired: false,
      smsState: SmsConversationState.AWAITING_BEST_TIME,
      serviceType: 'Emergency AC repair',
      location: 'Austin, TX',
      zipCode: '78704',
      callerName: 'Alice Tenant',
      callbackRequested: true,
      summary: 'Tenant A urgent HVAC lead',
      qualifiedAt: now,
      notifiedAt: now,
      ownerNotifiedAt: now,
      lastInboundAt: now,
      lastOutboundAt: now,
      lastInteractionAt: now,
      createdAt: now,
      updatedAt: now,
    },
  });

  const leadB = await db.lead.create({
    data: {
      businessId: businessB.id,
      callId: callB.id,
      callerPhone: callB.fromPhone,
      callerPhoneNormalized: callB.fromPhoneNormalized,
      status: LeadStatus.QUALIFIED,
      readiness: LeadReadiness.QUALIFIED,
      billingRequired: true,
      smsState: SmsConversationState.AWAITING_BEST_TIME,
      serviceType: 'Main line clog',
      location: 'Dallas, TX',
      zipCode: '75201',
      callerName: 'Bob Tenant',
      callbackRequested: false,
      summary: 'Tenant B plumbing lead',
      qualifiedAt: now,
      notifiedAt: now,
      ownerNotifiedAt: now,
      lastInboundAt: now,
      lastOutboundAt: now,
      lastInteractionAt: now,
      createdAt: now,
      updatedAt: now,
    },
  });

  await db.message.createMany({
    data: [
      {
        businessId: businessA.id,
        leadId: leadA.id,
        direction: MessageDirection.OUTBOUND,
        participant: MessageParticipant.LEAD,
        fromPhone: businessA.twilioPrimaryPhoneNumber!,
        toPhone: leadA.callerPhoneNormalized,
        body: 'Tenant A outbound intro',
        status: 'delivered',
        createdAt: now,
      },
      {
        businessId: businessA.id,
        leadId: leadA.id,
        direction: MessageDirection.INBOUND,
        participant: MessageParticipant.LEAD,
        fromPhone: leadA.callerPhoneNormalized,
        toPhone: businessA.twilioPrimaryPhoneNumber!,
        body: 'Tenant A reply',
        status: 'received',
        createdAt: now,
      },
      {
        businessId: businessB.id,
        leadId: leadB.id,
        direction: MessageDirection.OUTBOUND,
        participant: MessageParticipant.LEAD,
        fromPhone: businessB.twilioPrimaryPhoneNumber!,
        toPhone: leadB.callerPhoneNormalized,
        body: 'Tenant B outbound intro',
        status: 'delivered',
        createdAt: now,
      },
      {
        businessId: businessB.id,
        leadId: leadB.id,
        direction: MessageDirection.INBOUND,
        participant: MessageParticipant.LEAD,
        fromPhone: leadB.callerPhoneNormalized,
        toPhone: businessB.twilioPrimaryPhoneNumber!,
        body: 'Tenant B reply',
        status: 'received',
        createdAt: now,
      },
    ],
  });

  await db.ownerNotification.createMany({
    data: [
      {
        businessId: businessA.id,
        leadId: leadA.id,
        channel: OwnerNotificationChannel.SMS,
        status: OwnerNotificationStatus.SENT,
        destination: businessA.notifyPhone,
        body: 'Tenant A owner SMS',
        sentAt: now,
      },
      {
        businessId: businessB.id,
        leadId: leadB.id,
        channel: OwnerNotificationChannel.EMAIL,
        status: OwnerNotificationStatus.SENT,
        destination: `tenant-b-${seed.slice(0, 6)}@example.com`,
        body: 'Tenant B owner email',
        subject: 'Lead ready',
        sentAt: now,
      },
    ],
  });

  await db.simulatorRun.createMany({
    data: [
      {
        publicId: `sim_a_${seed.replace(/-/g, '').slice(0, 10)}`,
        businessId: businessA.id,
        leadId: leadA.id,
        callerPhone: leadA.callerPhoneNormalized,
      },
      {
        publicId: `sim_b_${seed.replace(/-/g, '').slice(0, 10)}`,
        businessId: businessB.id,
        leadId: leadB.id,
        callerPhone: leadB.callerPhoneNormalized,
      },
    ],
  });

  await db.smsConsent.createMany({
    data: [
      {
        businessId: businessA.id,
        phoneNormalized: leadA.callerPhoneNormalized,
        phoneRawLastSeen: leadA.callerPhone,
        optedInAt: now,
      },
      {
        businessId: businessB.id,
        phoneNormalized: leadB.callerPhoneNormalized,
        phoneRawLastSeen: leadB.callerPhone,
        optedOut: true,
        optedOutAt: now,
      },
    ],
  });

  return {
    seed,
    ownerA,
    ownerB,
    businessA,
    businessB,
    callA,
    callB,
    leadA,
    leadB,
  };
}

export async function cleanupTenantFixtures(input: {
  businessAId: string;
  businessBId: string;
}) {
  await db.business.deleteMany({
    where: {
      id: {
        in: [input.businessAId, input.businessBId],
      },
    },
  });
}
