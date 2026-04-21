import type { Business, Prisma } from '@prisma/client';

import { db } from '@/lib/db';

export const DEMO_OWNER_CLERK_ID = 'simulator_demo_callbackcloser';
export const BULK_TEST_DATA_RESET_CONFIRMATION = 'DELETE TEST BUSINESSES';

type TestDemoBusinessMarker = Pick<Business, 'isTestBusiness' | 'ownerClerkId'>;

export type TestDemoBusinessResetCandidate = Pick<Business, 'id' | 'name' | 'isTestBusiness' | 'ownerClerkId' | 'archivedAt'>;

function normalizeConfirmation(value: string | null | undefined) {
  return value?.trim().toUpperCase() || '';
}

export function isTestDemoBusiness(business: TestDemoBusinessMarker) {
  return business.isTestBusiness || business.ownerClerkId === DEMO_OWNER_CLERK_ID;
}

export function buildTestDemoBusinessWhere(): Prisma.BusinessWhereInput {
  return {
    OR: [{ isTestBusiness: true }, { ownerClerkId: DEMO_OWNER_CLERK_ID }],
  };
}

export async function listTestDemoBusinessesForReset(candidateIds?: string[]) {
  return db.business.findMany({
    where: {
      AND: [
        buildTestDemoBusinessWhere(),
        candidateIds?.length
          ? {
              id: {
                in: candidateIds,
              },
            }
          : {},
      ],
    },
    orderBy: [{ isTestBusiness: 'desc' }, { updatedAt: 'desc' }],
    select: {
      id: true,
      name: true,
      isTestBusiness: true,
      ownerClerkId: true,
      archivedAt: true,
    },
  });
}

export async function bulkDeleteTestDemoBusinesses(params: { confirmation: string; candidateIds?: string[] }) {
  if (normalizeConfirmation(params.confirmation) !== BULK_TEST_DATA_RESET_CONFIRMATION) {
    throw new Error(`Type ${BULK_TEST_DATA_RESET_CONFIRMATION} to confirm deleting all test/demo businesses.`);
  }

  const candidates = await listTestDemoBusinessesForReset(params.candidateIds);
  const candidateIds = candidates.map((business) => business.id);
  if (candidateIds.length === 0) {
    return {
      deletedCount: 0,
      deletedBusinessNames: [] as string[],
    };
  }

  const result = await db.business.deleteMany({
    where: {
      id: {
        in: candidateIds,
      },
    },
  });

  return {
    deletedCount: result.count,
    deletedBusinessNames: candidates.map((business) => business.name),
  };
}
