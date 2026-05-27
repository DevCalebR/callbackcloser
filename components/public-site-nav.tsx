import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { PUBLIC_CREATE_ACCOUNT_PATH, PUBLIC_SIGN_IN_PATH, PUBLIC_START_FREE_PILOT_PATH } from '@/lib/public-auth-routing';

const primaryLinks = [
  { href: '/demo', label: 'Demo' },
  { href: '/simulator', label: 'Simulator' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/contact', label: 'Contact' },
  { href: '/sms-consent', label: 'SMS Consent' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
];

export function PublicSiteNav() {
  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link className="text-lg font-semibold tracking-tight" href="/">
            CallbackCloser
          </Link>
          <Badge className="hidden sm:inline-flex" variant="outline">
            Built for local service businesses
          </Badge>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <nav className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {primaryLinks.map((link) => (
              <Link key={link.href} className="transition-colors hover:text-foreground" href={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link className={buttonVariants({ size: 'sm', variant: 'ghost' })} href={PUBLIC_SIGN_IN_PATH}>
              Sign in
            </Link>
            <Link className={buttonVariants({ size: 'sm', variant: 'outline' })} href={PUBLIC_CREATE_ACCOUNT_PATH}>
              Create account
            </Link>
            <Link className={buttonVariants({ size: 'sm' })} href={PUBLIC_START_FREE_PILOT_PATH}>
              Start 14-day pilot
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
