import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveAdminOwnerState } from '../lib/admin-provisioning-presenters.ts';

test('owner state is invite-ready when contact info exists but no account is linked yet', () => {
  const state = deriveAdminOwnerState({
    ownerClerkId: 'pending_owner_fixture',
    ownerName: 'Casey Owner',
    ownerEmail: 'owner@example.com',
    ownerInviteSentAt: null,
  });

  assert.equal(state.status, 'invite_ready');
  assert.equal(state.statusLabel, 'Invite ready to send');
});

test('owner state shows accepted invite waiting for manual link when a user now exists', () => {
  const state = deriveAdminOwnerState({
    ownerClerkId: 'pending_owner_fixture',
    ownerName: 'Casey Owner',
    ownerEmail: 'owner@example.com',
    ownerInviteSentAt: new Date('2026-04-16T00:00:00.000Z'),
    existingUserIdByEmail: 'user_123',
    invitation: {
      id: 'inv_123',
      status: 'pending',
      createdAt: new Date('2026-04-16T00:00:00.000Z'),
    },
  });

  assert.equal(state.status, 'accepted_needs_connection');
  assert.equal(state.matchedUserId, 'user_123');
  assert.match(state.detail, /Connect existing owner/i);
});

test('owner state shows pending invitation truthfully before acceptance', () => {
  const state = deriveAdminOwnerState({
    ownerClerkId: 'pending_owner_fixture',
    ownerName: 'Casey Owner',
    ownerEmail: 'owner@example.com',
    ownerInviteSentAt: new Date('2026-04-16T00:00:00.000Z'),
    invitation: {
      id: 'inv_456',
      status: 'pending',
      createdAt: new Date('2026-04-16T00:00:00.000Z'),
    },
  });

  assert.equal(state.status, 'invitation_pending');
  assert.equal(state.pending, true);
  assert.match(state.detail, /Wait for the owner to accept/i);
});

test('owner state distinguishes connected owners from broken stored links', () => {
  const connected = deriveAdminOwnerState({
    ownerClerkId: 'user_123',
    ownerName: 'Casey Owner',
    ownerEmail: 'owner@example.com',
    ownerInviteSentAt: null,
    linkedUserId: 'user_123',
    linkedUserEmail: 'owner@example.com',
  });

  assert.equal(connected.status, 'connected');
  assert.equal(connected.connected, true);

  const broken = deriveAdminOwnerState({
    ownerClerkId: 'user_stale',
    ownerName: 'Casey Owner',
    ownerEmail: 'owner@example.com',
    ownerInviteSentAt: null,
  });

  assert.equal(broken.status, 'connection_broken');
  assert.equal(broken.badgeVariant, 'destructive');
});
