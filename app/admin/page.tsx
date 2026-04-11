import Link from 'next/link';

import { createDemoBusinessAction } from '@/app/admin/actions';
import { requireAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { formatDateTime } from '@/lib/lead-presenters';
import { getManagedTwilioStatusSummary } from '@/lib/managed-twilio';
import { getAdminBusinessStatus } from '@/lib/system-status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const dynamic = 'force-dynamic';

export default async function AdminPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const admin = await requireAdmin();
  const createdDemo = searchParams?.createdDemo === '1';
  const createdBusinessId = typeof searchParams?.businessId === 'string' ? searchParams.businessId : null;
  const adminBusiness = await db.business.findUnique({ where: { ownerClerkId: admin.userId } });

  const [businesses, successfulLeadCounts] = await Promise.all([
    db.business.findMany({
      orderBy: { createdAt: 'desc' },
    }),
    db.lead.groupBy({
      by: ['businessId'],
      where: {
        OR: [{ ownerNotifiedAt: { not: null } }, { notifiedAt: { not: null } }],
      },
      _count: { _all: true },
    }),
  ]);

  const successfulLeadCountMap = new Map(successfulLeadCounts.map((item) => [item.businessId, item._count._all]));

  return (
    <div className="container space-y-6 py-8">
      <div className="space-y-2">
        <Badge variant="outline">Internal Admin</Badge>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Business rollout dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Internal view of business activation, messaging readiness, and compliance status across the workspace.
          </p>
        </div>
      </div>

      {createdDemo && createdBusinessId ? (
        <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">
          Demo business ready. Use <code className="rounded bg-background px-1 py-0.5">{createdBusinessId}</code> as `SIMULATOR_BUSINESS_ID`, or open the
          workspace below.
        </div>
      ) : null}

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle>Create dedicated simulator workspace</CardTitle>
          <CardDescription>
            Creates or refreshes a safe business named <strong>CallbackCloser Demo</strong> with a synthetic owner account so it never replaces a real
            customer workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createDemoBusinessAction} className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="ownerPhone">Owner phone for previews</Label>
              <Input
                id="ownerPhone"
                name="ownerPhone"
                type="tel"
                defaultValue={adminBusiness?.notifyPhone || ''}
                placeholder="+1 555 123 4567"
              />
              <p className="text-xs text-muted-foreground">Used for demo owner-alert previews and settings defaults.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ownerEmail">Owner email for previews</Label>
              <Input
                id="ownerEmail"
                name="ownerEmail"
                type="email"
                defaultValue={admin.email || ''}
                placeholder="owner@callbackcloser.com"
              />
              <p className="text-xs text-muted-foreground">Used for demo email-alert previews and notification defaults.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="forwardingNumber">Forwarding number</Label>
              <Input
                id="forwardingNumber"
                name="forwardingNumber"
                type="tel"
                defaultValue={adminBusiness?.forwardingNumber || ''}
                placeholder="+1 555 000 0001"
              />
              <p className="text-xs text-muted-foreground">Optional. If blank, CallbackCloser uses your owner phone or a safe demo fallback.</p>
            </div>
            <div className="lg:col-span-3 flex flex-wrap items-center gap-3">
              <Button type="submit">Create Demo Business</Button>
              <p className="text-sm text-muted-foreground">
                The created workspace always uses the fixed name <strong>CallbackCloser Demo</strong> and a demo-safe texting line placeholder so it stays
                isolated from real businesses.
              </p>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="bg-card/90">
        <CardHeader>
          <CardTitle>All businesses</CardTitle>
          <CardDescription>{businesses.length} business{businesses.length === 1 ? '' : 'es'} in the current workspace.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-3 py-3 font-medium">Business name</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Messaging status</th>
                <th className="px-3 py-3 font-medium">Compliance status</th>
                <th className="px-3 py-3 font-medium">Created date</th>
              </tr>
            </thead>
            <tbody>
              {businesses.map((business) => {
                const successfulLeadCount = successfulLeadCountMap.get(business.id) ?? 0;
                const rolloutStatus = getAdminBusinessStatus(business, successfulLeadCount);
                const managedSummary = getManagedTwilioStatusSummary(business);

                return (
                  <tr key={business.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-3 align-top">
                      <Link className="font-medium hover:underline" href={`/admin/${business.id}`}>
                        {business.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{business.id}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <Badge variant={rolloutStatus.badgeVariant}>{rolloutStatus.label}</Badge>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <Badge variant={managedSummary.messagingServiceReady ? 'success' : 'outline'}>
                        {managedSummary.messagingServiceReady ? 'Active' : 'Provisioning'}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <Badge variant={managedSummary.complianceReady ? 'success' : rolloutStatus.key === 'blocked' ? 'destructive' : 'outline'}>
                        {managedSummary.complianceReady ? 'Approved' : managedSummary.label}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 align-top text-muted-foreground">{formatDateTime(business.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
