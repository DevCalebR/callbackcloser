import { NextResponse } from 'next/server';

import { ADMIN_CUSTOMER_BUSINESS_COOKIE } from '@/lib/admin-customer-context';
import { resolveSafeAdminCustomerAppPath } from '@/lib/admin-customer-paths';
import { getAdminSession } from '@/lib/admin';
import { db } from '@/lib/db';

export async function GET(request: Request, { params }: { params: { businessId: string } }) {
  const adminSession = await getAdminSession();
  const requestUrl = new URL(request.url);

  if (!adminSession?.userId) {
    return NextResponse.redirect(new URL('/sign-in', requestUrl));
  }

  if (!adminSession.isAdmin) {
    return NextResponse.redirect(new URL('/app', requestUrl));
  }

  const business = await db.business.findUnique({
    where: { id: params.businessId },
    select: { id: true },
  });

  if (!business) {
    return NextResponse.redirect(new URL('/admin?error=Business%20not%20found.', requestUrl));
  }

  const nextPath = resolveSafeAdminCustomerAppPath(requestUrl.searchParams.get('path'));
  const response = NextResponse.redirect(new URL(nextPath, requestUrl));

  response.cookies.set(ADMIN_CUSTOMER_BUSINESS_COOKIE, business.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/app',
  });

  return response;
}
