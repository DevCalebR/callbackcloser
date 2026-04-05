import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { saveOnboardingAction } from '@/app/app/onboarding/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { db } from '@/lib/db';

const DEFAULT_POST_ONBOARDING_REDIRECT = '/app/leads';

function resolveSafeNextPath(value: string | undefined) {
  const nextPath = value?.trim();
  if (!nextPath || !nextPath.startsWith('/') || nextPath.startsWith('//')) {
    return DEFAULT_POST_ONBOARDING_REDIRECT;
  }

  if (nextPath === '/app') return DEFAULT_POST_ONBOARDING_REDIRECT;
  if (!nextPath.startsWith('/app/')) return DEFAULT_POST_ONBOARDING_REDIRECT;
  return nextPath;
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const existing = await db.business.findUnique({ where: { ownerClerkId: userId } });
  if (existing) redirect('/app/leads');
  const error = typeof searchParams?.error === 'string' ? searchParams.error : undefined;
  const nextPath = resolveSafeNextPath(typeof searchParams?.next === 'string' ? searchParams.next : undefined);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create your business</h1>
        <p className="text-sm text-muted-foreground">
          Start with the business record now. After this step, connect or buy your Twilio number in Settings and activate billing
          before live missed-call follow-up is turned on.
        </p>
      </div>
      <Card className="border-primary/20 bg-muted/30">
        <CardHeader>
          <CardTitle>Pilot setup steps</CardTitle>
          <CardDescription>These are the three items that make the live missed-call workflow demo-ready.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
          <div className="rounded-lg border bg-card p-4">1. Create the business record and owner notification phone.</div>
          <div className="rounded-lg border bg-card p-4">2. Connect or buy the Twilio number that will receive inbound calls and texts.</div>
          <div className="rounded-lg border bg-card p-4">3. Activate billing so automated SMS follow-up can run on live missed calls.</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Business Settings</CardTitle>
          <CardDescription>Set the call forwarding and SMS qualification defaults.</CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}
          <form action={saveOnboardingAction} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="next" value={nextPath} />
            <div className="sm:col-span-2">
              <Label htmlFor="name">Business name</Label>
              <Input id="name" name="name" required placeholder="Acme Plumbing" />
            </div>
            <div>
              <Label htmlFor="forwardingNumber">Forwarding number</Label>
              <Input id="forwardingNumber" name="forwardingNumber" required placeholder="+15551234567" />
            </div>
            <div>
              <Label htmlFor="notifyPhone">Owner notify phone</Label>
              <Input id="notifyPhone" name="notifyPhone" placeholder="+15559876543" />
              <p className="mt-1 text-xs text-muted-foreground">Recommended. Lead summary texts go here once the prospect shares their ZIP code.</p>
            </div>
            <div>
              <Label htmlFor="missedCallSeconds">Missed-call timeout (seconds)</Label>
              <Input id="missedCallSeconds" name="missedCallSeconds" type="number" min={5} max={90} defaultValue={20} required />
            </div>
            <div>
              <Label htmlFor="timezone">Timezone</Label>
              <Input id="timezone" name="timezone" defaultValue="America/New_York" required />
            </div>
            <div>
              <Label htmlFor="serviceLabel1">Service option 1</Label>
              <Input id="serviceLabel1" name="serviceLabel1" defaultValue="Repair" required />
            </div>
            <div>
              <Label htmlFor="serviceLabel2">Service option 2</Label>
              <Input id="serviceLabel2" name="serviceLabel2" defaultValue="Install" required />
            </div>
            <div>
              <Label htmlFor="serviceLabel3">Service option 3</Label>
              <Input id="serviceLabel3" name="serviceLabel3" defaultValue="Maintenance" required />
            </div>
            <div className="sm:col-span-2 pt-2">
              <Button type="submit">Create Business</Button>
            </div>
            <p className="sm:col-span-2 text-xs text-muted-foreground">
              You can fine-tune service labels later. The next setup step after this form is Twilio number connection and billing activation.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
