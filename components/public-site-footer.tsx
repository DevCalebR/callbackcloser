import Link from 'next/link';

const footerLinks = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/contact', label: 'Contact' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/refund', label: 'Refund' },
  { href: '/sms-consent', label: 'SMS Consent' },
];

export function PublicSiteFooter() {
  return (
    <footer className="border-t bg-muted/20">
      <div className="container flex flex-col gap-4 py-8 text-sm text-muted-foreground lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <p className="font-medium text-foreground">CallbackCloser</p>
          <p>Recover missed calls with fast SMS qualification, owner alerts, and a clearer handoff back to the business.</p>
          <p>White-glove pilot onboarding plus visible pricing, privacy, terms, refund, and SMS consent trust pages.</p>
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
