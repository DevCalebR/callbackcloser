'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const SMS_CONSENT_SUPPORT_EMAIL = 'support@callbackcloser.com';

export function buildSmsConsentMailtoHref(phone: string) {
  const trimmedPhone = phone.trim();
  const subject = encodeURIComponent('SMS consent request');
  const body = encodeURIComponent(
    `Please confirm SMS consent for this phone number:\n\n${trimmedPhone}\n\nI understand message frequency varies, message and data rates may apply, and I can reply STOP or HELP at any time.`
  );

  return `mailto:${SMS_CONSENT_SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}

export function PublicSmsConsentForm() {
  const [phone, setPhone] = useState('');
  const [consentChecked, setConsentChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      setError('Enter the phone number that should receive SMS updates.');
      return;
    }

    if (!consentChecked) {
      setError('Confirm SMS consent before continuing.');
      return;
    }

    setError(null);
    window.location.href = buildSmsConsentMailtoHref(trimmedPhone);
  }

  return (
    <Card className="border-primary/20 bg-card/95">
      <CardHeader>
        <CardTitle>Request SMS updates</CardTitle>
        <CardDescription>
          Enter your phone number and confirm consent to email CallbackCloser support with the consent request details.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="sms-consent-phone">Phone number</Label>
            <Input
              autoComplete="tel"
              id="sms-consent-phone"
              inputMode="tel"
              name="phone"
              onChange={(event) => {
                setPhone(event.currentTarget.value);
                if (error) setError(null);
              }}
              placeholder="(555) 123-4567"
              type="tel"
              value={phone}
            />
          </div>

          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex items-start gap-3 text-sm text-muted-foreground">
              <input
                checked={consentChecked}
                className="mt-1 h-4 w-4 rounded border"
                id="sms-consent-checkbox"
                name="consent"
                onChange={(event) => {
                  setConsentChecked(event.currentTarget.checked);
                  if (error) setError(null);
                }}
                type="checkbox"
              />
              <Label className="font-normal leading-6 text-muted-foreground" htmlFor="sms-consent-checkbox">
                I agree to receive SMS messages from CallbackCloser related to my request. Message frequency varies. Message &amp;
                data rates may apply. Reply STOP to opt out or HELP for help.
              </Label>
            </div>
          </div>

          {error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}

          <Button className="w-full sm:w-auto" type="submit">
            Email support to confirm consent
          </Button>
        </form>

        <div className="rounded-lg border bg-background/80 p-4 text-sm text-muted-foreground">
          <p>Consent to receive SMS messages is not a condition of purchase.</p>
          <p className="mt-2">
            Contact:{' '}
            <a className="underline underline-offset-4" href={`mailto:${SMS_CONSENT_SUPPORT_EMAIL}`}>
              {SMS_CONSENT_SUPPORT_EMAIL}
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
