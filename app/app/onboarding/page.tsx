import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { saveOnboardingAction } from '@/app/app/onboarding/actions';
import { SetupChecklist } from '@/components/setup-checklist';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { db } from '@/lib/db';

const DEFAULT_POST_ONBOARDING_REDIRECT = '/app/settings';

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

  const checklistItems = [
    {
      key: 'routing',
      label: 'Connect phone / routing',
      detail: 'Create the business first, then confirm which line should ring while CallbackCloser sets up the texting line that covers missed calls.',
      complete: false,
    },
    {
      key: 'sms',
      label: 'Verify SMS template',
      detail: 'Check the first automated text and the qualification prompts before live traffic starts.',
      complete: false,
    },
    {
      key: 'alerts',
      label: 'Verify owner notifications',
      detail: 'Add the owner mobile number so lead summaries reach the right phone immediately.',
      complete: false,
    },
    {
      key: 'test',
      label: 'Run test lead',
      detail: 'Place a missed-call test after settings and billing are complete so you can confirm the full handoff.',
      complete: false,
    },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-2">
        <Badge variant="outline">Activation</Badge>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Create your business workspace</h1>
          <p className="text-sm text-muted-foreground">
            Start with the business details now. Next, you will land in Business Settings where CallbackCloser helps set up your texting line, routing, owner alerts, billing, and first missed-call test.
          </p>
        </div>
      </div>

      <SetupChecklist
        title="First successful activation path"
        description="CallbackCloser works best when the first missed-call test is treated like a guided rollout, not a blind setup sprint."
        items={checklistItems}
      />

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle>What happens after this form</CardTitle>
          <CardDescription>Reduce onboarding drag by keeping the next steps explicit.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
          <div className="rounded-xl border bg-background/80 p-4">1. Business Settings opens so you can confirm routing and we can provision your business texting line.</div>
          <div className="rounded-xl border bg-background/80 p-4">2. Billing is activated so live missed calls can trigger automated SMS follow-up.</div>
          <div className="rounded-xl border bg-background/80 p-4">3. You run the missed-call test and confirm the owner alert arrives with a ready-to-call summary.</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Business profile and defaults</CardTitle>
          <CardDescription>Set the core business details so we can get your missed-call coverage live fast.</CardDescription>
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
              <p className="mt-1 text-xs text-muted-foreground">Recommended. Ready-to-close lead summaries are sent here.</p>
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
              <Button type="submit">Create Business and Continue Setup</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
