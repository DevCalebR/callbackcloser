import Link from 'next/link';

import { PUBLIC_CREATE_ACCOUNT_PATH, PUBLIC_SIGN_IN_PATH, PUBLIC_START_FREE_PILOT_PATH } from '@/lib/public-auth-routing';

const footerLinks = [
  { href: PUBLIC_CREATE_ACCOUNT_PATH, label: 'Create account' },
  { href: PUBLIC_START_FREE_PILOT_PATH, label: 'Start 14-day pilot' },
  { href: PUBLIC_SIGN_IN_PATH, label: 'Sign in' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/demo', label: 'Missed-Call Demo' },
  { href: '/contact', label: 'Contact' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms & Conditions' },
  { href: '/refund', label: 'Refund' },
  { href: '/sms-consent', label: 'SMS Consent' },
];

export function PublicSiteFooter() {
  return (
    <footer className="border-t bg-muted/20">
      <div className="container flex flex-col gap-4 py-8 text-sm text-muted-foreground lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <p className="font-medium text-foreground">CallbackCloser</p>
          <p>Stop missed calls from turning into lost jobs with fast follow-up and clearer owner handoff.</p>
          <p>Try the simulator, start a 14-day pilot, and let CallbackCloser handle the setup before your workspace goes live.</p>
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
