import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { saveOnboardingAction } from '@/app/app/onboarding/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { db } from '@/lib/db';

export default async function OnboardingPage({ searchParams }: { searchParams?: { error?: string } }) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const existing = await db.business.findUnique({ where: { ownerClerkId: userId } });
  if (existing) redirect('/app/leads');

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create your business</h1>
        <p className="text-sm text-muted-foreground">This creates the owner-linked business record used by Twilio and Stripe.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Business Settings</CardTitle>
          <CardDescription>Set the call forwarding and SMS qualification defaults.</CardDescription>
        </CardHeader>
        <CardContent>
          {searchParams?.error ? (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {searchParams.error}
            </div>
          ) : null}
          <form action={saveOnboardingAction} className="grid gap-4 sm:grid-cols-2">
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
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
