import type { Business } from '@prisma/client';

import { canDeleteTestBusiness, getDeleteTestBusinessBlockedReason } from '@/lib/admin-dashboard';
import { db } from '@/lib/db';

export const FOUNDER_DELETE_ALL_BUSINESSES_CONFIRMATION = 'DELETE ALL BUSINESSES';

export type FounderBusinessResetCandidate = Pick<Business, 'id' | 'name' | 'isTestBusiness' | 'archivedAt'>;

function normalizeConfirmation(value: string | null | undefined) {
  return value?.trim().toUpperCase() || '';
}

export async function listBusinessesForFounderReset(candidateIds?: string[]) {
  return db.business.findMany({
    where: candidateIds?.length
      ? {
          id: {
            in: candidateIds,
          },
        }
      : undefined,
    orderBy: [{ archivedAt: 'asc' }, { updatedAt: 'desc' }],
    select: {
      id: true,
      name: true,
      isTestBusiness: true,
      archivedAt: true,
    },
  });
}

export async function deleteAllBusinessesForFounderReset(params: { confirmation: string; candidateIds?: string[] }) {
  if (normalizeConfirmation(params.confirmation) !== FOUNDER_DELETE_ALL_BUSINESSES_CONFIRMATION) {
    throw new Error(`Type ${FOUNDER_DELETE_ALL_BUSINESSES_CONFIRMATION} to confirm deleting all current businesses.`);
  }

  return db.$transaction(async (tx) => {
    const candidates = await tx.business.findMany({
      where: params.candidateIds?.length
        ? {
            id: {
              in: params.candidateIds,
            },
          }
        : undefined,
      orderBy: [{ archivedAt: 'asc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        name: true,
        isTestBusiness: true,
        archivedAt: true,
      },
    });

    if (candidates.length === 0) {
      return {
        deletedCount: 0,
        deletedBusinessNames: [] as string[],
      };
    }

    const result = await tx.business.deleteMany({
      where: {
        id: {
          in: candidates.map((business) => business.id),
        },
      },
    });

    return {
      deletedCount: result.count,
      deletedBusinessNames: candidates.map((business) => business.name),
    };
  });
}

export async function deleteDeletableTestBusiness(businessId: string) {
  const business = await db.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      isTestBusiness: true,
      ownerClerkId: true,
      archivedAt: true,
    },
  });

  if (!business) {
    throw new Error('Business not found.');
  }

  const blockedReason = getDeleteTestBusinessBlockedReason(business);
  if (blockedReason || !canDeleteTestBusiness(business)) {
    throw new Error(blockedReason || 'Only archived demo/test businesses can be deleted.');
  }

  return db.business.delete({
    where: { id: business.id },
    select: {
      id: true,
      name: true,
      isTestBusiness: true,
    },
  });
}
