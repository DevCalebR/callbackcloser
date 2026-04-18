import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function PublicSmsConsentForm() {
  return (
    <Card className="border-primary/20 bg-card/95">
      <CardHeader>
        <CardTitle>Request SMS updates</CardTitle>
        <CardDescription>
          Enter your phone number and confirm consent to receive service-related SMS messages from CallbackCloser.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sms-consent-phone">Phone number</Label>
            <Input
              autoComplete="tel"
              id="sms-consent-phone"
              inputMode="tel"
              name="phone"
              placeholder="(555) 123-4567"
              type="tel"
            />
          </div>

          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex items-start gap-3 text-sm text-muted-foreground">
              <input
                defaultChecked={false}
                className="mt-1 h-4 w-4 rounded border"
                id="sms-consent-checkbox"
                name="consent"
                type="checkbox"
              />
              <Label className="font-normal leading-6 text-muted-foreground" htmlFor="sms-consent-checkbox">
                I agree to receive SMS messages from CallbackCloser related to my request. Message frequency varies. Message &amp;
                data rates may apply. Reply STOP to opt out or HELP for help.
              </Label>
            </div>
          </div>

          <Button className="w-full sm:w-auto" type="button">
            Continue
          </Button>
        </form>

        <div className="rounded-lg border bg-background/80 p-4 text-sm text-muted-foreground">
          <p>Consent to receive SMS messages is not a condition of purchase.</p>
          <p className="mt-2">
            Contact:{' '}
            <a className="underline underline-offset-4" href="mailto:support@callbackcloser.com">
              support@callbackcloser.com
            </a>
          </p>
          <p className="mt-2">
            Review our{' '}
            <Link className="underline underline-offset-4" href="/privacy">
              Privacy Policy
            </Link>{' '}
            and{' '}
            <Link className="underline underline-offset-4" href="/terms">
              Terms &amp; Conditions
            </Link>
            .
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
