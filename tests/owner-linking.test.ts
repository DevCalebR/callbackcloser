import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { buildPendingOwnerClerkId } from '../lib/admin-provisioning-presenters.ts';
import { db } from '../lib/db.ts';
import {
  autoLinkPendingOwnerInviteForUser,
  getClerkVerifiedEmailAddresses,
  getOrCreateOwnedBusinessForClerkUser,
  getOwnedBusinessForClerkUser,
} from '../lib/owner-linking.ts';

function buildUser(params: {
  id: string;
  verifiedEmail?: string | null;
  primaryEmail?: string | null;
  unverifiedEmail?: string | null;
  fullName?: string | null;
}) {
  const emailAddresses = [];

  if (params.verifiedEmail) {
    emailAddresses.push({
      id: 'email_verified',
      emailAddress: params.verifiedEmail,
      verification: { status: 'verified' as const },
    });
  }

  if (params.unverifiedEmail) {
    emailAddresses.push({
      id: 'email_unverified',
      emailAddress: params.unverifiedEmail,
      verification: { status: 'unverified' as const },
    });
  }

  return {
    id: params.id,
    fullName: params.fullName || 'Casey Owner',
    primaryEmailAddressId:
      params.primaryEmail === params.unverifiedEmail && params.unverifiedEmail
        ? 'email_unverified'
        : params.verifiedEmail
          ? 'email_verified'
          : null,
    emailAddresses,
    publicMetadata: {},
  };
}

async function createPendingInviteBusiness(seed: string, ownerEmail: string, ownerInviteSentAt: Date | null = new Date()) {
  return db.business.create({
    data: {
      ownerClerkId: buildPendingOwnerClerkId(),
      name: `Invite Test ${seed.slice(0, 8)}`,
      ownerName: 'Pending Owner',
      forwardingNumber: '+15125550123',
      ownerInviteSentAt,
      notificationSettings: {
        create: {
          ownerEmail,
          ownerPhone: '+15125550124',
        },
      },
    },
    include: {
      notificationSettings: true,
    },
  });
}

test('verified Clerk emails are the only ones eligible for auto-link matching', () => {
  const emails = getClerkVerifiedEmailAddresses(
    buildUser({
      id: 'user_verified_only',
      verifiedEmail: 'owner@example.com',
      unverifiedEmail: 'owner+stale@example.com',
      fullName: 'Casey Owner',
    }),
  );

  assert.deepEqual(emails, ['owner@example.com']);
});

test('auto-link promotes a verified invited owner into the durable business owner link', async () => {
  const seed = randomUUID();
  const ownerEmail = `owner-${seed.slice(0, 8)}@example.com`;
  const business = await createPendingInviteBusiness(seed, ownerEmail);

  try {
    const result = await autoLinkPendingOwnerInviteForUser(
      buildUser({
        id: `user_${seed}`,
        verifiedEmail: ownerEmail,
        fullName: 'Casey Owner',
      }),
    );

    assert.equal(result.status, 'linked');

    const updated = await db.business.findUniqueOrThrow({
      where: { id: business.id },
      include: { notificationSettings: true },
    });

    assert.equal(updated.ownerClerkId, `user_${seed}`);
    assert.equal(updated.ownerInviteSentAt, null);
    assert.equal(updated.ownerName, 'Casey Owner');
    assert.equal(updated.notificationSettings?.ownerEmail, ownerEmail);

    const operatorEvent = await db.businessOperatorEvent.findFirst({
      where: { businessId: business.id, type: 'onboarding.owner_auto_linked' },
      orderBy: { createdAt: 'desc' },
    });

    assert.equal(operatorEvent?.summary, 'Invited owner linked automatically');
  } finally {
    await db.business.delete({ where: { id: business.id } });
  }
});

test('auto-link refuses mismatched emails and keeps the pending invite untouched', async () => {
  const seed = randomUUID();
  const business = await createPendingInviteBusiness(seed, `owner-${seed.slice(0, 8)}@example.com`);

  try {
    const result = await autoLinkPendingOwnerInviteForUser(
      buildUser({
        id: `user_${seed}`,
        verifiedEmail: `different-${seed.slice(0, 8)}@example.com`,
      }),
    );

    assert.equal(result.status, 'no_pending_invite_match');

    const unchanged = await db.business.findUniqueOrThrow({ where: { id: business.id } });
    assert.equal(unchanged.ownerClerkId, business.ownerClerkId);
    assert.notEqual(unchanged.ownerInviteSentAt, null);
  } finally {
    await db.business.delete({ where: { id: business.id } });
  }
});

test('auto-link does not bypass the separate connect-existing-owner flow when no invite is pending', async () => {
  const seed = randomUUID();
  const ownerEmail = `owner-${seed.slice(0, 8)}@example.com`;
  const business = await createPendingInviteBusiness(seed, ownerEmail, null);

  try {
    const result = await autoLinkPendingOwnerInviteForUser(
      buildUser({
        id: `user_${seed}`,
        verifiedEmail: ownerEmail,
      }),
    );

    assert.equal(result.status, 'no_pending_invite_match');

    const unchanged = await db.business.findUniqueOrThrow({ where: { id: business.id } });
    assert.equal(unchanged.ownerClerkId, business.ownerClerkId);
    assert.equal(unchanged.ownerInviteSentAt, null);
  } finally {
    await db.business.delete({ where: { id: business.id } });
  }
});

test('owned business lookup reuses the linked invited business instead of creating a duplicate workspace', async () => {
  const seed = randomUUID();
  const ownerEmail = `owner-${seed.slice(0, 8)}@example.com`;
  const business = await createPendingInviteBusiness(seed, ownerEmail);
  const user = buildUser({
    id: `user_${seed}`,
    verifiedEmail: ownerEmail,
    fullName: 'Casey Owner',
  });

  try {
    const linkedBusiness = await getOwnedBusinessForClerkUser(user);
    const resolvedBusiness = await getOrCreateOwnedBusinessForClerkUser(user);

    assert.equal(linkedBusiness?.id, business.id);
    assert.equal(resolvedBusiness?.id, business.id);

    const ownedBusinesses = await db.business.findMany({
      where: {
        OR: [{ id: business.id }, { ownerClerkId: user.id }],
      },
      select: { id: true },
    });

    assert.deepEqual(
      ownedBusinesses.map((item) => item.id).sort(),
      [business.id],
    );
  } finally {
    await db.business.delete({ where: { id: business.id } });
  }
});
