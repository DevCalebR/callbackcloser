import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

function parseEmailAllowlist(value: string | undefined) {
  return new Set(
    (value ?? '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

function isAllowedAdminUser(params: { userId: string; email: string | null }) {
  const adminEmailAllowlist = parseEmailAllowlist(process.env.ADMIN_EMAIL_ALLOWLIST);
  const founderUserId = process.env.FOUNDER_CLERK_USER_ID?.trim();

  return (founderUserId && params.userId === founderUserId) || (params.email ? adminEmailAllowlist.has(params.email) : false);
}

export function isFounderUserId(userId: string | null | undefined, env: Readonly<Record<string, string | undefined>> = process.env) {
  const founderUserId = env.FOUNDER_CLERK_USER_ID?.trim();
  if (!founderUserId || !userId) return false;
  return userId === founderUserId;
}

export async function getAdminSession() {
  const { userId } = await auth();
  if (!userId) {
    return null;
  }

  const user = await currentUser();
  const primaryEmail =
    user?.primaryEmailAddress?.emailAddress?.trim().toLowerCase() ||
    user?.emailAddresses[0]?.emailAddress?.trim().toLowerCase() ||
    null;

  return {
    userId,
    email: primaryEmail,
    isAdmin: isAllowedAdminUser({ userId, email: primaryEmail }),
    isFounder: isFounderUserId(userId),
  };
}

export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session?.userId) {
    redirect('/sign-in');
  }

  if (!session.isAdmin) {
    redirect('/app');
  }

  return {
    userId: session.userId,
    email: session.email,
    isFounder: session.isFounder,
  };
}

export async function requireFounderAdmin() {
  const admin = await requireAdmin();

  if (!admin.isFounder) {
    redirect('/admin?error=Founder-only+cleanup+action.');
  }

  return admin;
}
