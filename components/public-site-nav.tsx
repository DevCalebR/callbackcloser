import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { PUBLIC_SIGN_IN_PATH, PUBLIC_START_FREE_PILOT_PATH } from '@/lib/public-auth-routing';

const primaryLinks = [
  { href: '/simulator', label: 'Simulator' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/contact', label: 'Contact' },
];

export function PublicSiteNav() {
  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <Link className="text-lg font-semibold tracking-tight" href="/">
              CallbackCloser
            </Link>
            <Badge className="w-fit" variant="outline">
              Built for local service businesses
            </Badge>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              {primaryLinks.map((link) => (
                <Link key={link.href} className="transition-colors hover:text-foreground" href={link.href}>
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="flex flex-wrap items-center gap-2">
              <Link className={buttonVariants({ size: 'sm', variant: 'ghost' })} href={PUBLIC_SIGN_IN_PATH}>
                Sign in
              </Link>
              <Link className={buttonVariants({ size: 'sm' })} href={PUBLIC_START_FREE_PILOT_PATH}>
                Start 14-day pilot
              </Link>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
