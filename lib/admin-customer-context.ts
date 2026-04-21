import { cookies } from 'next/headers';

import { getAdminSession } from '@/lib/admin';
import { resolveSafeAdminCustomerAppPath } from '@/lib/admin-customer-paths';
import { db } from '@/lib/db';

export const ADMIN_CUSTOMER_BUSINESS_COOKIE = 'cc_admin_customer_business';

export async function getAdminCustomerActingContext() {
  const actingBusinessId = cookies().get(ADMIN_CUSTOMER_BUSINESS_COOKIE)?.value?.trim();
  if (!actingBusinessId) {
    return null;
  }

  const adminSession = await getAdminSession();
  if (!adminSession?.isAdmin) {
    return null;
  }

  const business = await db.business.findUnique({
    where: { id: actingBusinessId },
  });

  if (!business) {
    return null;
  }

  return {
    business,
    adminUserId: adminSession.userId,
    adminEmail: adminSession.email,
  };
}
