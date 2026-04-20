import { canDeleteTestBusiness, getDeleteTestBusinessBlockedReason } from '@/lib/admin-dashboard';
import { db } from '@/lib/db';

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
