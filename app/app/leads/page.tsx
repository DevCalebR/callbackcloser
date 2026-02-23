import Link from 'next/link';
import { LeadStatus } from '@prisma/client';

import { UpgradeBanner } from '@/components/upgrade-banner';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireBusiness } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatPhoneForDisplay } from '@/lib/phone';
import { formatDateTime, leadStatusLabels, leadStatusOrder, smsStateLabels } from '@/lib/lead-presenters';
import { isSubscriptionActive } from '@/lib/subscription';
import { cn } from '@/lib/utils';

export default async function LeadsPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const business = await requireBusiness();
  const rawFilter = typeof searchParams?.status === 'string' ? searchParams.status.toUpperCase() : 'ALL';
  const statusFilter = Object.values(LeadStatus).includes(rawFilter as LeadStatus) ? (rawFilter as LeadStatus) : null;
  const error = typeof searchParams?.error === 'string' ? searchParams.error : undefined;

  const [leads, blockedCount] = await Promise.all([
    db.lead.findMany({
      where: {
        businessId: business.id,
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    }),
    db.lead.count({ where: { businessId: business.id, billingRequired: true } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard (Leads)</h1>
          <p className="text-sm text-muted-foreground">Missed-call leads, SMS progress, and booking status.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/app/leads"
            className={cn('rounded-md border px-3 py-1.5 text-sm', !statusFilter && 'bg-muted')}
          >
            All
          </Link>
          {leadStatusOrder.map((status) => (
            <Link
              key={status}
              href={`/app/leads?status=${status.toLowerCase()}`}
              className={cn('rounded-md border px-3 py-1.5 text-sm', statusFilter === status && 'bg-muted')}
            >
              {leadStatusLabels[status]}
            </Link>
          ))}
        </div>
      </div>

      {!isSubscriptionActive(business.subscriptionStatus) && blockedCount > 0 ? <UpgradeBanner blockedCount={blockedCount} /> : null}
      {error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}

      <Card>
        <CardHeader>
          <CardTitle>Leads</CardTitle>
          <CardDescription>{leads.length} result{leads.length === 1 ? '' : 's'}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-2 py-2 font-medium">Caller</th>
                <th className="px-2 py-2 font-medium">Captured</th>
                <th className="px-2 py-2 font-medium">SMS State</th>
                <th className="px-2 py-2 font-medium">Lead Status</th>
                <th className="px-2 py-2 font-medium">Flags</th>
                <th className="px-2 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-2 py-3">
                    <Link href={`/app/leads/${lead.id}`} className="font-medium hover:underline">
                      {formatPhoneForDisplay(lead.callerPhoneNormalized || lead.callerPhone)}
                    </Link>
                    <div className="text-xs text-muted-foreground">{lead.contactName || 'No name yet'}</div>
                  </td>
                  <td className="px-2 py-3 text-muted-foreground">
                    <div>{lead.serviceRequested || '-'}</div>
                    <div>{lead.zipCode || '-'}</div>
                  </td>
                  <td className="px-2 py-3">{smsStateLabels[lead.smsState]}</td>
                  <td className="px-2 py-3">
                    <Badge variant={lead.status === 'BOOKED' ? 'success' : lead.status === 'NEW' ? 'outline' : 'secondary'}>
                      {leadStatusLabels[lead.status]}
                    </Badge>
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex flex-wrap gap-1">
                      {lead.billingRequired ? <Badge variant="destructive">billing_required</Badge> : null}
                      {lead.ownerNotifiedAt ? <Badge variant="secondary">owner_notified</Badge> : null}
                    </div>
                  </td>
                  <td className="px-2 py-3 text-muted-foreground">{formatDateTime(lead.createdAt)}</td>
                </tr>
              ))}
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-2 py-8 text-center text-muted-foreground">
                    No leads yet. Missed calls to your Twilio number will appear here.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
