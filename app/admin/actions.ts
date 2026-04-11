'use server';

import { ManagedTwilioStatus, SubscriptionStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { normalizePhoneNumber } from '@/lib/phone';

const DEMO_OWNER_CLERK_ID = 'simulator_demo_callbackcloser';
const DEFAULT_DEMO_NAME = 'CallbackCloser Demo';
const DEFAULT_DEMO_TEXTING_NUMBER = '+15005550006';
const DEFAULT_DEMO_FORWARDING_NUMBER = '+15005550001';

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export async function createDemoBusinessAction(formData: FormData) {
  const admin = await requireAdmin();
  const ownerPhone = normalizePhoneNumber(getString(formData, 'ownerPhone')) || null;
  const ownerEmail = getString(formData, 'ownerEmail').toLowerCase() || admin.email || null;
  const forwardingNumber = normalizePhoneNumber(getString(formData, 'forwardingNumber')) || ownerPhone || DEFAULT_DEMO_FORWARDING_NUMBER;
  const existingBusiness = await db.business.findUnique({ where: { ownerClerkId: DEMO_OWNER_CLERK_ID } });
  const demoTextingNumber = existingBusiness?.twilioPrimaryPhoneNumber || DEFAULT_DEMO_TEXTING_NUMBER;

  const business = await db.business.upsert({
    where: { ownerClerkId: DEMO_OWNER_CLERK_ID },
    create: {
      ownerClerkId: DEMO_OWNER_CLERK_ID,
      name: DEFAULT_DEMO_NAME,
      forwardingNumber,
      notifyPhone: ownerPhone,
      missedCallSeconds: 20,
      serviceLabel1: 'Repair',
      serviceLabel2: 'Install',
      serviceLabel3: 'Maintenance',
      timezone: 'America/New_York',
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      subscriptionStatusUpdatedAt: new Date(),
      managedTwilioStatus: ManagedTwilioStatus.DRAFT,
      managedTwilioStatusUpdatedAt: new Date(),
      twilioPrimaryPhoneNumber: demoTextingNumber,
    },
    update: {
      name: DEFAULT_DEMO_NAME,
      forwardingNumber,
      notifyPhone: ownerPhone,
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      subscriptionStatusUpdatedAt: new Date(),
      managedTwilioStatusUpdatedAt: new Date(),
      twilioPrimaryPhoneNumber: demoTextingNumber,
    },
  });

  await db.businessNotificationSettings.upsert({
    where: { businessId: business.id },
    create: {
      businessId: business.id,
      ownerPhone,
      ownerEmail,
      notifySms: true,
      notifyEmail: true,
      notifyInApp: true,
      urgentOnly: false,
    },
    update: {
      ownerPhone,
      ownerEmail,
      notifySms: true,
      notifyEmail: true,
      notifyInApp: true,
      urgentOnly: false,
    },
  });

  revalidatePath('/admin');
  revalidatePath(`/admin/${business.id}`);
  redirect(`/admin?createdDemo=1&businessId=${encodeURIComponent(business.id)}`);
}
