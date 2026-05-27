import Link from 'next/link';

import { PUBLIC_SIGN_IN_PATH, PUBLIC_START_FREE_PILOT_PATH } from '@/lib/public-auth-routing';

const footerLinks = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/contact', label: 'Contact' },
  { href: '/sms-consent', label: 'SMS Consent' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/refund', label: 'Refund' },
  { href: PUBLIC_SIGN_IN_PATH, label: 'Sign in' },
  { href: PUBLIC_START_FREE_PILOT_PATH, label: 'Start 14-day pilot' },
];

export function PublicSiteFooter() {
  return (
    <footer className="border-t bg-muted/20">
      <div className="container flex flex-col gap-4 py-8 text-sm text-muted-foreground lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <p className="font-medium text-foreground">CallbackCloser</p>
          <p>Stop missed calls from turning into lost jobs with fast follow-up and clearer owner handoff.</p>
          <p>Try the simulator, start a 14-day pilot, and review pricing, contact, refund, privacy, terms, and SMS consent before your workspace goes live.</p>
          <p>
            Contact:{' '}
            <a className="underline underline-offset-4" href="mailto:support@callbackcloser.com">
              support@callbackcloser.com
            </a>
          </p>
        </div>

        <nav className="flex flex-wrap gap-x-4 gap-y-2">
          {footerLinks.map((link) => (
            <Link key={link.href} className="underline underline-offset-4" href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
