import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function PublicSmsConsentForm() {
  return (
    <Card className="border-primary/20 bg-card/95">
      <CardHeader>
        <CardTitle>Consent disclosure</CardTitle>
        <CardDescription>
          By providing a phone number and agreeing to this disclosure, a user consents to receive SMS messages from CallbackCloser
          related to callback coordination, customer support, service updates, and account or service notifications related to the
          user&apos;s request.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <input
              defaultChecked={false}
              className="mt-1 h-4 w-4 rounded border"
              id="sms-consent-checkbox"
              name="consent"
              type="checkbox"
            />
            <span>
              I agree to receive SMS messages from CallbackCloser related to my request. Message frequency varies. Message &amp; data
              rates may apply. Reply STOP to opt out or HELP for help. See our{' '}
              <Link className="underline underline-offset-4" href="/privacy">
                Privacy Policy
              </Link>{' '}
              and{' '}
              <Link className="underline underline-offset-4" href="/terms">
                Terms &amp; Conditions
              </Link>
              .
            </span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Consent to receive SMS messages is not a condition of purchase.</p>
        </div>

        <div className="rounded-lg border bg-background/80 p-4 text-sm text-muted-foreground">
          Support contact:{' '}
          <a className="underline underline-offset-4" href="mailto:support@callbackcloser.com">
            support@callbackcloser.com
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
