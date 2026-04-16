import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function PublicSmsConsentForm() {
  return (
    <Card className="border-primary/20 bg-card/95">
      <CardHeader>
        <CardTitle>Consent language reference</CardTitle>
        <CardDescription>
          This page documents the disclosure language CallbackCloser uses for SMS opt-in flows. It does not submit or store phone numbers.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="sms-consent-phone">Example mobile number field</Label>
          <Input defaultValue="+1 555 123 4567" disabled id="sms-consent-phone" inputMode="tel" name="phone" type="tel" />
          <p className="text-xs text-muted-foreground">Use a real phone field in your live signup or intake flow before recording consent.</p>
        </div>

        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <input
              checked={false}
              className="mt-1 h-4 w-4 rounded border"
              disabled
              id="sms-consent-checkbox"
              name="consent"
              readOnly
              type="checkbox"
            />
            <span>
              By checking this box, you agree to receive SMS messages from CallbackCloser related to customer care and account
              notifications. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. See our{' '}
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
          <p className="mt-3 text-xs text-muted-foreground">
            In production, your real consent flow should require an unchecked checkbox and a phone number before submission.
          </p>
        </div>

        <div className="rounded-lg border bg-background/80 p-4 text-sm text-muted-foreground">
          This public page is a compliance reference for buyers, carriers, and reviewers. It does not create a subscription, submit
          consent, or capture any phone number data by itself.
        </div>
      </CardContent>
    </Card>
  );
}
