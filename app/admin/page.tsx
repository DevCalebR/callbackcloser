import Link from 'next/link';

import { requireAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { formatDateTime } from '@/lib/lead-presenters';
import { getManagedTwilioStatusSummary } from '@/lib/managed-twilio';
import { getAdminBusinessStatus } from '@/lib/system-status';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  await requireAdmin();

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
