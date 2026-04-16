import Link from 'next/link';

import {
  createAdminBusinessAction,
  createDemoBusinessAction,
  provisionBusinessAction,
  resyncBusinessWebhooksAction,
  setBusinessProvisioningStatusAction,
} from '@/app/admin/actions';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { requireAdmin } from '@/lib/admin';
import {
  adminProvisioningStatusLabels,
  getAdminProvisioningStatusVariant,
  isPendingOwnerClerkId,
} from '@/lib/admin-provisioning';
import { searchBusinessesForAdmin } from '@/lib/business';
import { db } from '@/lib/db';
import { formatDateTime } from '@/lib/lead-presenters';
import { getManagedTextingNumber, getManagedTwilioStatusSummary } from '@/lib/managed-twilio';
import { formatPhoneForDisplay } from '@/lib/phone';

export const dynamic = 'force-dynamic';

function getQueryValue(searchParams: Record<string, string | string[] | undefined> | undefined, key: string) {
  const value = searchParams?.[key];
  return typeof value === 'string' ? value : null;
}

export default async function AdminPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const admin = await requireAdmin();
  const createdDemo = getQueryValue(searchParams, 'createdDemo') === '1';
  const createdBusinessId = getQueryValue(searchParams, 'businessId');
  const error = getQueryValue(searchParams, 'error');
  const query = getQueryValue(searchParams, 'q')?.trim() || '';
  const adminBusiness = await db.business.findUnique({ where: { ownerClerkId: admin.userId } });

  const [businesses, leadCounts] = await Promise.all([
    query
      ? searchBusinessesForAdmin(query)
      : db.business.findMany({
          orderBy: { updatedAt: 'desc' },
          include: {
            notificationSettings: true,
          },
        }),
    db.lead.groupBy({
      by: ['businessId'],
      _count: { _all: true },
    }),
  ]);

  const leadCountMap = new Map(leadCounts.map((item) => [item.businessId, item._count._all]));

  return (
    <div className="container space-y-6 py-8">
      <div className="space-y-2">
        <Badge variant="outline">Internal Admin</Badge>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Business provisioning dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Create business workspaces, connect owners, provision Twilio, and fix webhook drift without touching the customer dashboard.
          </p>
        </div>
      </div>

      {error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
      {createdDemo && createdBusinessId ? (
        <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">
          Demo business ready. Use <code className="rounded bg-background px-1 py-0.5">{createdBusinessId}</code> as `SIMULATOR_BUSINESS_ID`, or open the
          workspace below.
        </div>
      ) : null}

      <Card className="bg-card/90">
        <CardHeader>
          <CardTitle>Internal database lookup</CardTitle>
          <CardDescription>
            Search by business name, owner email, Twilio number, Twilio number SID, or business ID. This tool is internal-only and stays behind the admin
            dashboard guard.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <Input
              aria-label="Search businesses"
              defaultValue={query}
              name="q"
              placeholder="Search name, owner email, +18777480449, PN..., or business ID"
            />
            <Button type="submit" variant="outline">
              Search
            </Button>
            {query ? (
              <Link className={buttonVariants({ variant: 'ghost' })} href="/admin">
                Clear
              </Link>
            ) : null}
          </form>
          <div className="rounded-xl border bg-background/80 p-4 text-sm text-muted-foreground">
            {query ? (
              <>
                Showing {businesses.length} result{businesses.length === 1 ? '' : 's'} for <span className="font-medium text-foreground">{query}</span>.
              </>
            ) : (
              <>Search is empty, so the full business list is shown below.</>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle>Create customer business</CardTitle>
            <CardDescription>
              Save the business workspace, owner contact details, and default routing in one pass. CallbackCloser will connect an existing Clerk owner by
              email when possible, or send an owner invite and keep the workspace in a pending-owner state.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createAdminBusinessAction} className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Business name</Label>
                <Input id="name" name="name" placeholder="Acme Plumbing" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ownerName">Owner name</Label>
                <Input id="ownerName" name="ownerName" placeholder="Casey Owner" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ownerEmail">Owner email</Label>
                <Input id="ownerEmail" name="ownerEmail" type="email" placeholder="owner@business.com" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ownerPhone">Owner alert phone</Label>
                <Input id="ownerPhone" name="ownerPhone" type="tel" placeholder="+1 555 123 4567" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="forwardingNumber">Forwarding number</Label>
                <Input id="forwardingNumber" name="forwardingNumber" type="tel" placeholder="+1 555 111 0000" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Input id="timezone" name="timezone" defaultValue="America/New_York" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="missedCallSeconds">Missed-call timeout</Label>
                <Input id="missedCallSeconds" name="missedCallSeconds" type="number" min={5} max={90} defaultValue={20} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="serviceLabel1">Primary service label</Label>
                <Input id="serviceLabel1" name="serviceLabel1" defaultValue="Repair" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="serviceLabel2">Secondary service label</Label>
                <Input id="serviceLabel2" name="serviceLabel2" defaultValue="Install" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="serviceLabel3">Tertiary service label</Label>
                <Input id="serviceLabel3" name="serviceLabel3" defaultValue="Maintenance" />
              </div>
              <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                <Button type="submit">Create business workspace</Button>
                <p className="text-sm text-muted-foreground">If the owner already exists in Clerk, CallbackCloser will connect that account automatically.</p>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle>Create dedicated simulator workspace</CardTitle>
            <CardDescription>
              Keeps public simulator traffic isolated from real customer accounts while still using the same missed-call workflow.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createDemoBusinessAction} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="demoOwnerPhone">Owner phone for previews</Label>
                <Input
                  id="demoOwnerPhone"
                  name="ownerPhone"
                  type="tel"
                  defaultValue={adminBusiness?.notifyPhone || ''}
                  placeholder="+1 555 123 4567"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="demoOwnerEmail">Owner email for previews</Label>
                <Input
                  id="demoOwnerEmail"
                  name="ownerEmail"
                  type="email"
                  defaultValue={admin.email || ''}
                  placeholder="owner@callbackcloser.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="demoForwardingNumber">Forwarding number</Label>
                <Input
                  id="demoForwardingNumber"
                  name="forwardingNumber"
                  type="tel"
                  defaultValue={adminBusiness?.forwardingNumber || ''}
                  placeholder="+1 555 000 0001"
                />
              </div>
              <Button type="submit">Create Demo Business</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/90">
        <CardHeader>
          <CardTitle>{query ? 'Search results' : 'All businesses'}</CardTitle>
          <CardDescription>Operational view of owner state, provisioning progress, Twilio setup, and live readiness.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {businesses.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
              No businesses matched this lookup. Try the exact business ID, owner email, or normalized Twilio number.
            </div>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-3 py-3 font-medium">Business</th>
                  <th className="px-3 py-3 font-medium">Owner</th>
                  <th className="px-3 py-3 font-medium">Business status</th>
                  <th className="px-3 py-3 font-medium">Provisioning</th>
                  <th className="px-3 py-3 font-medium">Twilio</th>
                  <th className="px-3 py-3 font-medium">Phone + webhooks</th>
                  <th className="px-3 py-3 font-medium">Messaging</th>
                  <th className="px-3 py-3 font-medium">Live</th>
                  <th className="px-3 py-3 font-medium">Updated</th>
                  <th className="px-3 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {businesses.map((business) => {
                const managedSummary = getManagedTwilioStatusSummary(business);
                const ownerEmail = business.notificationSettings?.ownerEmail || 'Owner email missing';
                const leadCount = leadCountMap.get(business.id) ?? 0;
                const hasNumber = Boolean(getManagedTextingNumber(business));
                const ownerPending = isPendingOwnerClerkId(business.ownerClerkId);

                return (
                  <tr key={business.id} className="border-b align-top last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-3">
                      <Link className="font-medium hover:underline" href={`/admin/${business.id}`}>
                        {business.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{business.id}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{leadCount} lead{leadCount === 1 ? '' : 's'}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium">{business.ownerName || 'Owner name missing'}</div>
                      <div className="text-xs text-muted-foreground">{ownerEmail}</div>
                      <div className="mt-1">
                        <Badge variant={ownerPending ? 'outline' : 'secondary'}>{ownerPending ? 'Pending owner' : 'Owner linked'}</Badge>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={getAdminProvisioningStatusVariant(business.provisioningStatus)}>
                        {adminProvisioningStatusLabels[business.provisioningStatus]}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium">{managedSummary.label}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{managedSummary.nextStep}</div>
                      {business.provisioningError ? <div className="mt-1 text-xs text-destructive">{business.provisioningError}</div> : null}
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={business.twilioSubaccountSid ? 'success' : 'outline'}>
                        {business.twilioSubaccountSid ? 'Subaccount ready' : 'Subaccount missing'}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium">{hasNumber ? formatPhoneForDisplay(getManagedTextingNumber(business)) : 'No number assigned'}</div>
                      <div className="text-xs text-muted-foreground">
                        {business.twilioWebhookSyncedAt ? `Synced ${formatDateTime(business.twilioWebhookSyncedAt)}` : 'Webhook sync needed'}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={managedSummary.messagingReady ? 'success' : managedSummary.onboardingReady ? 'secondary' : 'outline'}>
                        {managedSummary.messagingReady ? 'Approved' : managedSummary.onboardingReady ? 'A2P pending' : 'Setup pending'}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={business.provisioningStatus === 'LIVE' ? 'success' : 'outline'}>
                        {business.provisioningStatus === 'LIVE' ? 'Yes' : 'No'}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{formatDateTime(business.updatedAt)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-2">
                        <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href={`/admin/${business.id}`}>
                          Open
                        </Link>
                        {!hasNumber ? (
                          <form action={provisionBusinessAction}>
                            <input type="hidden" name="businessId" value={business.id} />
                            <input type="hidden" name="mode" value="NEW_NUMBER" />
                            <Button size="sm" type="submit">Provision</Button>
                          </form>
                        ) : (
                          <form action={resyncBusinessWebhooksAction}>
                            <input type="hidden" name="businessId" value={business.id} />
                            <input type="hidden" name="target" value="ALL" />
                            <Button size="sm" type="submit" variant="outline">Re-sync webhooks</Button>
                          </form>
                        )}
                        <form action={setBusinessProvisioningStatusAction}>
                          <input type="hidden" name="businessId" value={business.id} />
                          <input type="hidden" name="status" value={business.provisioningStatus === 'PAUSED' ? 'ONBOARDING' : 'PAUSED'} />
                          <Button size="sm" type="submit" variant="ghost">
                            {business.provisioningStatus === 'PAUSED' ? 'Resume' : 'Pause'}
                          </Button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
