import { clerkClient } from '@clerk/nextjs/server';
import { BusinessProvisioningStatus, type Business, type BusinessNotificationSettings } from '@prisma/client';

import { isPendingOwnerClerkId, PENDING_OWNER_PREFIX } from '@/lib/admin-provisioning-presenters';
import { ensureBusinessNotificationSettings } from '@/lib/business-notification-settings';
import { db } from '@/lib/db';
import { recordBusinessOperatorEvent } from '@/lib/operator-events';

type ClerkEmailAddressLike = {
  id?: string | null;
  emailAddress?: string | null;
};

type ClerkUserLike = {
  id?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  primaryEmailAddressId?: string | null;
  emailAddresses?: ClerkEmailAddressLike[] | null;
};

type OwnerStateBusiness = Pick<Business, 'id' | 'ownerClerkId' | 'ownerName' | 'ownerInviteSentAt'>;

type SyncOwnerBusiness = Pick<
  Business,
  'id' | 'name' | 'ownerClerkId' | 'ownerName' | 'ownerInviteSentAt' | 'notifyPhone' | 'provisioningStatus' | 'provisioningError'
> & {
  notificationSettings: Pick<BusinessNotificationSettings, 'ownerEmail'> | null;
};

export type OwnerLinkStatus = 'pending_invite' | 'account_ready' | 'connected' | 'needs_repair';

export type OwnerLinkState = {
  status: OwnerLinkStatus;
  connected: boolean;
  pending: boolean;
  accountReady: boolean;
  needsRepair: boolean;
  invitedAt: Date | null;
  clerkUserId: string | null;
  name: string | null;
  email: string | null;
  detail: string;
};

export type OwnerAutoLinkResult =
  | { status: 'connected'; businessId: string }
  | { status: 'needs_repair'; businessId: string | null; reason: string }
  | { status: 'no_match'; reason: string };

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

function normalizeEmailList(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => normalizeEmail(value)).filter((value): value is string => Boolean(value))));
}

function getPrimaryEmailAddress(user: ClerkUserLike | null | undefined) {
  if (!user?.emailAddresses?.length) {
    return null;
  }

  const primary = user.primaryEmailAddressId
    ? user.emailAddresses.find((emailAddress) => emailAddress.id === user.primaryEmailAddressId)?.emailAddress
    : user.emailAddresses[0]?.emailAddress;

  return normalizeEmail(primary);
}

function getDisplayName(user: ClerkUserLike | null | undefined, fallbackName: string | null = null) {
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
  return name || fallbackName || null;
}

function buildOwnerLinkState(input: {
  status: OwnerLinkStatus;
  invitedAt: Date | null;
  clerkUserId?: string | null;
  name?: string | null;
  email?: string | null;
  detail: string;
}) {
  return {
    status: input.status,
    connected: input.status === 'connected',
    pending: input.status === 'pending_invite',
    accountReady: input.status === 'account_ready',
    needsRepair: input.status === 'needs_repair',
    invitedAt: input.invitedAt,
    clerkUserId: input.clerkUserId ?? null,
    name: input.name ?? null,
    email: input.email ?? null,
    detail: input.detail,
  } satisfies OwnerLinkState;
}

function shouldClearOwnerProvisioningError(message: string | null | undefined) {
  const normalized = message?.trim().toLowerCase() || '';
  if (!normalized) return false;

  return normalized.includes('owner') || normalized.includes('clerk') || normalized.includes('invite');
}

async function countOtherPendingBusinessesForOwnerEmail(businessId: string, ownerEmail: string) {
  return db.business.count({
    where: {
      id: { not: businessId },
      ownerClerkId: { startsWith: PENDING_OWNER_PREFIX },
      notificationSettings: {
        is: {
          ownerEmail,
        },
      },
    },
  });
}

async function findExistingBusinessForOwnerClerkId(ownerClerkId: string) {
  return db.business.findUnique({
    where: { ownerClerkId },
    select: { id: true, name: true },
  });
}

async function buildPendingOwnerState(
  business: OwnerStateBusiness & { id: string },
  ownerEmail: string | null
): Promise<OwnerLinkState> {
  if (!ownerEmail) {
    return buildOwnerLinkState({
      status: 'pending_invite',
      invitedAt: business.ownerInviteSentAt,
      name: business.ownerName?.trim() || null,
      email: null,
      detail: 'Owner invite is pending, but the invited email is missing from notification settings.',
    });
  }

  const matchedUser = await findClerkUserByEmail(ownerEmail);
  if (!matchedUser) {
    return buildOwnerLinkState({
      status: 'pending_invite',
      invitedAt: business.ownerInviteSentAt,
      name: business.ownerName?.trim() || null,
      email: ownerEmail,
      detail: 'Owner invite is still pending acceptance in Clerk.',
    });
  }

  const [attachedBusiness, duplicatePendingCount] = await Promise.all([
    findExistingBusinessForOwnerClerkId(matchedUser.id),
    countOtherPendingBusinessesForOwnerEmail(business.id, ownerEmail),
  ]);

  const primaryEmail = getPrimaryEmailAddress(matchedUser) || ownerEmail;
  const displayName = getDisplayName(matchedUser, business.ownerName?.trim() || null);

  if (attachedBusiness && attachedBusiness.id !== business.id) {
    return buildOwnerLinkState({
      status: 'needs_repair',
      invitedAt: business.ownerInviteSentAt,
      clerkUserId: matchedUser.id,
      name: displayName,
      email: primaryEmail,
      detail: `Accepted owner exists in Clerk, but that user is already attached to ${attachedBusiness.name}.`,
    });
  }

  if (duplicatePendingCount > 0) {
    return buildOwnerLinkState({
      status: 'needs_repair',
      invitedAt: business.ownerInviteSentAt,
      clerkUserId: matchedUser.id,
      name: displayName,
      email: primaryEmail,
      detail: 'Accepted owner exists in Clerk, but multiple pending businesses still share that invited email.',
    });
  }

  return buildOwnerLinkState({
    status: 'account_ready',
    invitedAt: business.ownerInviteSentAt,
    clerkUserId: matchedUser.id,
    name: displayName,
    email: primaryEmail,
    detail: 'Accepted owner account was found in Clerk and is ready to connect.',
  });
}

export function getClerkUserEmailAddresses(user: ClerkUserLike | null | undefined) {
  return normalizeEmailList((user?.emailAddresses || []).map((emailAddress) => emailAddress.emailAddress));
}

export function getClerkUserDisplayName(user: ClerkUserLike | null | undefined, fallbackName: string | null = null) {
  return getDisplayName(user, fallbackName);
}

export async function findClerkUserByEmail(email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const client = await clerkClient();
  const result = await client.users.getUserList({
    emailAddress: [normalized],
    limit: 1,
  });

  return result.data[0] ?? null;
}

export async function getOwnerLinkStateForBusiness(
  business: OwnerStateBusiness,
  notificationSettings: Pick<BusinessNotificationSettings, 'ownerEmail'> | null
): Promise<OwnerLinkState> {
  const ownerEmail = normalizeEmail(notificationSettings?.ownerEmail);

  if (isPendingOwnerClerkId(business.ownerClerkId)) {
    return buildPendingOwnerState(business, ownerEmail);
  }

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(business.ownerClerkId);

    return buildOwnerLinkState({
      status: 'connected',
      invitedAt: business.ownerInviteSentAt,
      clerkUserId: user.id,
      name: getDisplayName(user, business.ownerName?.trim() || null),
      email: getPrimaryEmailAddress(user) || ownerEmail,
      detail: 'A Clerk owner is linked to this business.',
    });
  } catch {
    const matchedUser = ownerEmail ? await findClerkUserByEmail(ownerEmail) : null;

    return buildOwnerLinkState({
      status: 'needs_repair',
      invitedAt: business.ownerInviteSentAt,
      clerkUserId: matchedUser?.id || business.ownerClerkId,
      name: getDisplayName(matchedUser, business.ownerName?.trim() || null),
      email: getPrimaryEmailAddress(matchedUser) || ownerEmail,
      detail: matchedUser
        ? 'A Clerk owner account was found for the invited email, but the saved owner link is stale and needs repair.'
        : 'The saved Clerk owner link could not be verified and needs repair.',
    });
  }
}

export async function autoLinkPendingBusinessOwner(params: {
  clerkUserId: string;
  emailAddresses: string[];
  ownerName?: string | null;
}) {
  const ownerEmails = normalizeEmailList(params.emailAddresses);
  if (!params.clerkUserId.trim() || ownerEmails.length === 0) {
    return { status: 'no_match', reason: 'No verified Clerk email address was available for owner auto-linking.' } satisfies OwnerAutoLinkResult;
  }

  const existingBusiness = await findExistingBusinessForOwnerClerkId(params.clerkUserId);
  if (existingBusiness) {
    return { status: 'connected', businessId: existingBusiness.id } satisfies OwnerAutoLinkResult;
  }

  const matchingBusinesses = await db.business.findMany({
    where: {
      ownerClerkId: { startsWith: PENDING_OWNER_PREFIX },
      notificationSettings: {
        is: {
          ownerEmail: {
            in: ownerEmails,
          },
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
    orderBy: {
      ownerInviteSentAt: 'desc',
    },
  });

  if (matchingBusinesses.length === 0) {
    return { status: 'no_match', reason: 'No pending owner invitation matched the authenticated Clerk email address.' } satisfies OwnerAutoLinkResult;
  }

  if (matchingBusinesses.length > 1) {
    return {
      status: 'needs_repair',
      businessId: null,
      reason: 'Multiple pending businesses matched the accepted owner email. Manual admin repair is required.',
    } satisfies OwnerAutoLinkResult;
  }

  const business = matchingBusinesses[0] as SyncOwnerBusiness;
  const ownerEmail = normalizeEmail(business.notificationSettings?.ownerEmail) || ownerEmails[0];
  const ownerName = params.ownerName?.trim() || business.ownerName?.trim() || null;
  const clearOwnerError = shouldClearOwnerProvisioningError(business.provisioningError);

  await db.business.update({
    where: { id: business.id },
    data: {
      ownerClerkId: params.clerkUserId,
      ownerName,
      ownerInviteSentAt: null,
      ...(clearOwnerError
        ? {
            provisioningStatus:
              business.provisioningStatus === BusinessProvisioningStatus.NEEDS_ATTENTION
                ? BusinessProvisioningStatus.ONBOARDING
                : business.provisioningStatus,
            provisioningError: null,
          }
        : {}),
    },
  });

  await ensureBusinessNotificationSettings(
    {
      id: business.id,
      ownerClerkId: params.clerkUserId,
      notifyPhone: business.notifyPhone,
    },
    {
      ownerEmail,
    }
  );

  await recordBusinessOperatorEvent({
    businessId: business.id,
    type: 'onboarding.owner_invite_accepted',
    category: 'ONBOARDING',
    status: 'SUCCESS',
    summary: 'Owner invitation accepted in Clerk',
    details: {
      ownerClerkId: params.clerkUserId,
      ownerEmail,
    },
  });

  await recordBusinessOperatorEvent({
    businessId: business.id,
    type: 'onboarding.owner_connected',
    category: 'ONBOARDING',
    status: 'SUCCESS',
    summary: 'Owner connected to business',
    details: {
      ownerClerkId: params.clerkUserId,
      ownerEmail,
      autoLinked: true,
    },
  });

  return { status: 'connected', businessId: business.id } satisfies OwnerAutoLinkResult;
}
