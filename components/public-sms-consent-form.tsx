'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function PublicSmsConsentForm() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isChecked, setIsChecked] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const canSubmit = phoneNumber.trim().length > 0 && isChecked;

  return (
    <Card className="border-primary/20 bg-card/95">
      <CardHeader>
        <CardTitle>Web-form SMS opt-in</CardTitle>
        <CardDescription>
          Enter your phone number to receive SMS messages related to missed call follow-ups and service updates.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();

            if (!canSubmit) {
              return;
            }

            setSubmitted(true);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="sms-consent-phone">Phone number</Label>
            <Input
              id="sms-consent-phone"
              inputMode="tel"
              name="phone"
              placeholder="+1 555 123 4567"
              type="tel"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">A phone number is required before submission.</p>
          </div>

          <div className="rounded-lg border bg-muted/30 p-4">
            <label className="flex items-start gap-3 text-sm text-muted-foreground" htmlFor="sms-consent-checkbox">
              <input
                checked={isChecked}
                className="mt-1 h-4 w-4 rounded border"
                id="sms-consent-checkbox"
                name="consent"
                type="checkbox"
                onChange={(event) => setIsChecked(event.target.checked)}
              />
              <span>
                By checking this box, you agree to receive SMS messages from CallbackCloser related to customer care and account
                notifications. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. See
                our{' '}
                <Link className="underline underline-offset-4" href="/privacy">
                  Privacy Policy
                </Link>{' '}
                and{' '}
                <Link className="underline underline-offset-4" href="/terms">
                  Terms &amp; Conditions
                </Link>
                .
              </span>
            </label>
            <p className="mt-3 text-xs text-muted-foreground">
              The consent checkbox is unchecked by default and must be selected before submission.
            </p>
          </div>

          <Button disabled={!canSubmit} type="submit">
            Submit consent
          </Button>
        </form>

        <p aria-live="polite" className="text-sm text-muted-foreground">
          {submitted
            ? 'Form requirements met. CallbackCloser uses this consent pattern so web-form opt-in stays clear before submission.'
            : 'The submit button stays disabled until the phone field is filled and consent is checked.'}
        </p>
      </CardContent>
    </Card>
  );
}
