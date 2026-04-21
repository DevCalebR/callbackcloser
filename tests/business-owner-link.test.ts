import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { BusinessProvisioningStatus } from '@prisma/client';

import { buildPendingOwnerClerkId } from '../lib/admin-provisioning-presenters.ts';
import { autoLinkPendingBusinessOwner } from '../lib/business-owner-link.ts';
import { db } from '../lib/db.ts';

function createOwnerEmail(seed: string) {
  return `owner-${seed.slice(0, 8)}@example.com`;
}

test('autoLinkPendingBusinessOwner links an accepted owner and clears owner-specific admin blockers', async () => {
  const seed = randomUUID();
  const ownerEmail = createOwnerEmail(seed);
  const business = await db.business.create({
    data: {
      ownerClerkId: buildPendingOwnerClerkId(),
      ownerName: 'Casey Owner',
      name: `Auto Link HVAC ${seed.slice(0, 6)}`,
      forwardingNumber: '+15125550100',
      notifyPhone: '+15125550101',
      provisioningStatus: BusinessProvisioningStatus.NEEDS_ATTENTION,
      provisioningError: 'Owner setup failed after business creation',
      ownerInviteSentAt: new Date('2026-04-20T12:00:00.000Z'),
      notificationSettings: {
        create: {
          ownerEmail,
          ownerPhone: '+15125550101',
        },
      },
    },
    include: {
      notificationSettings: true,
    },
  });

  try {
    const result = await autoLinkPendingBusinessOwner({
      clerkUserId: `user_${seed.replace(/-/g, '')}`,
      emailAddresses: [ownerEmail],
      ownerName: 'Casey Accepted',
    });

    assert.equal(result.status, 'connected');
    assert.equal(result.businessId, business.id);

    const refreshed = await db.business.findUniqueOrThrow({
      where: { id: business.id },
      include: {
        notificationSettings: true,
      },
    });
    const operatorEvents = await db.businessOperatorEvent.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: 'asc' },
    });

    assert.equal(refreshed.ownerClerkId, `user_${seed.replace(/-/g, '')}`);
    assert.equal(refreshed.ownerName, 'Casey Accepted');
    assert.equal(refreshed.ownerInviteSentAt, null);
    assert.equal(refreshed.provisioningStatus, BusinessProvisioningStatus.ONBOARDING);
    assert.equal(refreshed.provisioningError, null);
    assert.equal(refreshed.notificationSettings?.ownerEmail, ownerEmail);
    assert.equal(operatorEvents.some((event) => event.type === 'onboarding.owner_invite_accepted'), true);
    assert.equal(operatorEvents.some((event) => event.type === 'onboarding.owner_connected'), true);
  } finally {
    await db.business.delete({ where: { id: business.id } });
  }
});

test('autoLinkPendingBusinessOwner surfaces repair when multiple pending businesses share the invited email', async () => {
  const seed = randomUUID();
  const ownerEmail = createOwnerEmail(seed);
  const businessIds: string[] = [];

  try {
    for (const suffix of ['a', 'b']) {
      const business = await db.business.create({
        data: {
          ownerClerkId: buildPendingOwnerClerkId(),
          ownerName: `Casey Owner ${suffix.toUpperCase()}`,
          name: `Repair ${suffix.toUpperCase()} ${seed.slice(0, 6)}`,
          forwardingNumber: '+15125550200',
          ownerInviteSentAt: new Date('2026-04-20T12:00:00.000Z'),
          notificationSettings: {
            create: {
              ownerEmail,
            },
          },
        },
      });
      businessIds.push(business.id);
    }

    const result = await autoLinkPendingBusinessOwner({
      clerkUserId: `user_${seed.replace(/-/g, '')}`,
      emailAddresses: [ownerEmail],
      ownerName: 'Casey Accepted',
    });

    assert.equal(result.status, 'needs_repair');
    assert.match(result.reason, /multiple pending businesses/i);

    const refreshed = await db.business.findMany({
      where: { id: { in: businessIds } },
      orderBy: { id: 'asc' },
    });

    assert.equal(refreshed.every((business) => business.ownerClerkId.startsWith('pending_owner_')), true);
  } finally {
    await db.business.deleteMany({ where: { id: { in: businessIds } } });
  }
});
