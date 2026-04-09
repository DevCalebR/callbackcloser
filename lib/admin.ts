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

export async function requireAdmin() {
  const { userId } = await auth();
  if (!userId) {
    redirect('/sign-in');
  }

  const user = await currentUser();
  const primaryEmail =
    user?.primaryEmailAddress?.emailAddress?.trim().toLowerCase() ||
    user?.emailAddresses[0]?.emailAddress?.trim().toLowerCase() ||
    null;
  const adminEmailAllowlist = parseEmailAllowlist(process.env.ADMIN_EMAIL_ALLOWLIST);
  const founderUserId = process.env.FOUNDER_CLERK_USER_ID?.trim();
  const isAllowed =
    (founderUserId && userId === founderUserId) ||
    (primaryEmail ? adminEmailAllowlist.has(primaryEmail) : false);

  if (!isAllowed) {
    redirect('/app');
  }

  return {
    userId,
    email: primaryEmail,
  };
}
