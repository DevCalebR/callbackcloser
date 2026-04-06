import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';

const primaryLinks = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/contact', label: 'Contact' },
  { href: '/sms-consent', label: 'SMS Consent' },
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
            <Link className={buttonVariants({ size: 'sm', variant: 'ghost' })} href="/sign-in">
              Sign in
            </Link>
            <Link className={buttonVariants({ size: 'sm' })} href="/sign-up">
              Start pilot
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
