'use client';

import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { usePathname } from 'next/navigation';
import type { Business } from '@prisma/client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/app/leads', label: 'Dashboard' },
  { href: '/app/settings', label: 'Business Settings' },
  { href: '/app/billing', label: 'Billing' },
];

export function AppNav({ business, demoMode = false }: { business: Business | null; demoMode?: boolean }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur">
      <div className="container flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/app" className="font-semibold tracking-tight">
            CallbackCloser
          </Link>
          {business ? (
            <Badge variant={business.subscriptionStatus === 'ACTIVE' ? 'success' : 'outline'}>
              {business.subscriptionStatus.toLowerCase()}
            </Badge>
          ) : (
            <Badge variant="outline">onboarding</Badge>
          )}
        </div>
        <nav className="hidden items-center gap-2 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted',
                pathname.startsWith(item.href) && 'bg-muted text-foreground',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          {business && <p className="hidden text-sm text-muted-foreground sm:block">{business.name}</p>}
          {demoMode ? (
            <div className="rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
              Demo Workspace
            </div>
          ) : (
            <UserButton afterSignOutUrl="/" />
          )}
        </div>
      </div>
      <div className="container flex gap-2 pb-3 md:hidden">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted',
              pathname.startsWith(item.href) && 'bg-muted text-foreground',
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </header>
  );
}
