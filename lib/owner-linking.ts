import { clerkClient } from '@clerk/nextjs/server';
import type { Business } from '@prisma/client';

import { isPendingOwnerClerkId } from '@/lib/admin-provisioning-presenters';
import { getBusinessForOwnerClerkId } from '@/lib/business-access';
import { ensureBusinessNotificationSettings } from '@/lib/business-notification-settings';
import { db } from '@/lib/db';
import { recordBusinessOperatorEvent } from '@/lib/operator-events';

type ClerkEmailAddressLike = {
  id?: string | null;
  emailAddress?: string | null;
  verification?: {
    status?: string | null;
  } | null;
};

type ClerkUserLike = {
  id: string;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  primaryEmailAddressId?: string | null;
  publicMetadata?: Record<string, unknown> | null;
  emailAddresses: ClerkEmailAddressLike[];
};

type AutoLinkPendingOwnerResult =
  | { status: 'already_connected'; business: Business }
  | { status: 'linked'; business: Business; matchedEmail: string }
  | { status: 'no_verified_email' | 'no_pending_invite_match' | 'multiple_pending_matches' | 'already_linked_elsewhere' };

function normalizeEmail(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

export function getClerkPrimaryEmailAddress(user: ClerkUserLike | null | undefined) {
  if (!user) return null;

  const primaryEmail = user.primaryEmailAddressId
    ? user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId)?.emailAddress
    : user.emailAddresses[0]?.emailAddress;

  return normalizeEmail(primaryEmail);
}

export function getClerkVerifiedEmailAddresses(user: ClerkUserLike | null | undefined) {
  if (!user) return [];

  return Array.from(
    new Set(
      user.emailAddresses
        .filter((email) => email.verification?.status === 'verified')
        .map((email) => normalizeEmail(email.emailAddress))
        .filter((email): email is string => Boolean(email)),
    ),
  );
}

export function getClerkDisplayName(user: ClerkUserLike | null | undefined) {
  if (!user) return null;
  const displayName = user.fullName?.trim() || [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return displayName || null;
}

export async function findVerifiedClerkUserByEmail(email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const client = await clerkClient();
  const result = await client.users.getUserList({
    emailAddress: [normalized],
    limit: 1,
  });

  const matchedUser = result.data[0] ?? null;
  if (!matchedUser) {
    return null;
  }

  return getClerkVerifiedEmailAddresses(matchedUser).includes(normalized) ? matchedUser : null;
}

export async function autoLinkPendingOwnerInviteForUser(user: ClerkUserLike | null | undefined): Promise<AutoLinkPendingOwnerResult> {
  if (!user?.id) {
    return { status: 'no_verified_email' };
  }

  const existingBusiness = await getBusinessForOwnerClerkId(user.id);
  if (existingBusiness) {
    return { status: 'already_connected', business: existingBusiness };
  }

  const verifiedEmails = getClerkVerifiedEmailAddresses(user);
  if (verifiedEmails.length === 0) {
    return { status: 'no_verified_email' };
  }

  const pendingMatches = await db.business.findMany({
    where: {
      ownerInviteSentAt: { not: null },
      notificationSettings: {
        is: {
          ownerEmail: { in: verifiedEmails },
        },
      },
    },
    include: {
      notificationSettings: {
        select: {
          ownerEmail: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const eligibleMatches = pendingMatches.filter((business) => isPendingOwnerClerkId(business.ownerClerkId));
  if (eligibleMatches.length === 0) {
    return { status: 'no_pending_invite_match' };
  }

  if (eligibleMatches.length > 1) {
    return { status: 'multiple_pending_matches' };
  }

  const matchedBusiness = eligibleMatches[0];
  const existingOwnerBusiness = await db.business.findUnique({
    where: { ownerClerkId: user.id },
    select: { id: true },
  });

  if (existingOwnerBusiness && existingOwnerBusiness.id !== matchedBusiness.id) {
    return { status: 'already_linked_elsewhere' };
  }

  const matchedEmail =
    verifiedEmails.find((email) => email === normalizeEmail(matchedBusiness.notificationSettings?.ownerEmail)) ||
    normalizeEmail(matchedBusiness.notificationSettings?.ownerEmail);

  if (!matchedEmail) {
    return { status: 'no_pending_invite_match' };
  }

  await db.business.update({
    where: { id: matchedBusiness.id },
    data: {
      ownerClerkId: user.id,
      ownerName: getClerkDisplayName(user) || matchedBusiness.ownerName || null,
      ownerInviteSentAt: null,
    },
  });

  await ensureBusinessNotificationSettings(
    {
      id: matchedBusiness.id,
      ownerClerkId: user.id,
      notifyPhone: matchedBusiness.notifyPhone,
    },
    {
      ownerEmail: matchedEmail,
    },
  );

  await recordBusinessOperatorEvent({
    businessId: matchedBusiness.id,
    type: 'onboarding.owner_auto_linked',
    category: 'ONBOARDING',
    status: 'SUCCESS',
    summary: 'Invited owner linked automatically',
    details: {
      ownerClerkId: user.id,
      ownerEmail: matchedEmail,
      source: 'verified_clerk_sign_in',
    },
  });

  return {
    status: 'linked',
    business: await db.business.findUniqueOrThrow({ where: { id: matchedBusiness.id } }),
    matchedEmail,
  };
}

export async function getOwnedBusinessForClerkUser(user: ClerkUserLike | null | undefined) {
  if (!user?.id) return null;

  const existingBusiness = await getBusinessForOwnerClerkId(user.id);
  if (existingBusiness) {
    return existingBusiness;
  }

  const autoLinkResult = await autoLinkPendingOwnerInviteForUser(user);
  if (autoLinkResult.status === 'linked' || autoLinkResult.status === 'already_connected') {
    return autoLinkResult.business;
  }

  return null;
}

export async function getOrCreateOwnedBusinessForClerkUser(user: ClerkUserLike | null | undefined) {
  if (!user?.id) {
    throw new Error('Authenticated Clerk user context is required to create or recover a business.');
  }

  const ownedBusiness = await getOwnedBusinessForClerkUser(user);
  if (ownedBusiness) {
    return ownedBusiness;
  }

  const { ensurePendingBusinessForOwner } = await import('@/lib/customer-setup-handoff');

  return ensurePendingBusinessForOwner(user.id, {
    businessName: user.publicMetadata && typeof user.publicMetadata.businessName === 'string' ? user.publicMetadata.businessName : null,
    ownerEmail: getClerkPrimaryEmailAddress(user),
    ownerName: getClerkDisplayName(user),
  });
}
