'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const CONSENT_COPY =
  'By providing your phone number and submitting this form, you agree to receive SMS messages from CallbackCloser related to callback coordination, customer support, service updates, and account or service notifications. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help.';

export function PublicSmsConsentForm() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isChecked, setIsChecked] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const canSubmit = phoneNumber.trim().length > 0 && isChecked;

  return (
    <Card className="border-primary/20 bg-card/95">
      <CardHeader>
        <CardTitle>Web-form opt-in example</CardTitle>
        <CardDescription>
          This public form shows the CallbackCloser SMS consent disclosure used for Twilio review. It is visual-only today and does
          not store phone numbers or create an account.
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
              <span>{CONSENT_COPY}</span>
            </label>
          </div>

          <Button disabled={!canSubmit} type="submit">
            Submit consent
          </Button>
        </form>

        <p aria-live="polite" className="text-sm text-muted-foreground">
          {submitted
            ? 'Demo consent captured visually for compliance review only. CallbackCloser does not store this form submission in the current pilot.'
            : 'The submit button stays disabled until the phone field is filled and consent is checked.'}
        </p>
      </CardContent>
    </Card>
  );
}
