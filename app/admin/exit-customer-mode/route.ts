import { NextResponse } from 'next/server';

import { ADMIN_CUSTOMER_BUSINESS_COOKIE } from '@/lib/admin-customer-context';
import { getAdminSession } from '@/lib/admin';

export async function GET(request: Request) {
  const adminSession = await getAdminSession();
  const requestUrl = new URL(request.url);

  if (!adminSession?.userId) {
    return NextResponse.redirect(new URL('/sign-in', requestUrl));
  }

  if (!adminSession.isAdmin) {
    return NextResponse.redirect(new URL('/app', requestUrl));
  }

  const businessId = requestUrl.searchParams.get('businessId')?.trim();
  const redirectPath = businessId ? `/admin/${businessId}` : '/admin';
  const response = NextResponse.redirect(new URL(redirectPath, requestUrl));

  response.cookies.set(ADMIN_CUSTOMER_BUSINESS_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/app',
    maxAge: 0,
  });

  return response;
}
