import Link from 'next/link';
import { notFound } from 'next/navigation';

import { requireAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { formatDateTime } from '@/lib/lead-presenters';
import { getManagedTextingNumber, getManagedTwilioStatusSummary } from '@/lib/managed-twilio';
import { formatPhoneForDisplay } from '@/lib/phone';
import { getBusinessBillingAccessState } from '@/lib/subscription';
import { getAdminBusinessStatus, getCustomerSystemStatus } from '@/lib/system-status';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function AdminBusinessDetailPage({ params }: { params: { businessId: string } }) {
  await requireAdmin();

  const [business, successfulLeadCount, leadCount, callCount, messageCount] = await Promise.all([
    db.business.findUnique({ where: { id: params.businessId } }),
    db.lead.count({ where: { businessId: params.businessId, ownerNotifiedAt: { not: null } } }),
    db.lead.count({ where: { businessId: params.businessId } }),
    db.call.count({ where: { businessId: params.businessId } }),
    db.message.count({ where: { businessId: params.businessId } }),
  ]);

  if (!business) notFound();

  const rolloutStatus = getAdminBusinessStatus(business, successfulLeadCount);
  const customerStatus = getCustomerSystemStatus(business, successfulLeadCount);
  const managedSummary = getManagedTwilioStatusSummary(business);
  const billingAccess = getBusinessBillingAccessState(business);

  return (
    <div className="container space-y-6 py-8">
      <div className="space-y-2">
        <Link className="text-sm text-muted-foreground underline underline-offset-4" href="/admin">
          Back to admin dashboard
        </Link>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{business.name}</h1>
            <p className="text-sm text-muted-foreground">Internal rollout detail for activation, messaging readiness, and business health.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={rolloutStatus.badgeVariant}>{rolloutStatus.label}</Badge>
            <Badge variant={customerStatus.badgeVariant}>{customerStatus.label}</Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          { label: 'Leads', value: leadCount },
          { label: 'Calls', value: callCount },
          { label: 'Messages', value: messageCount },
          { label: 'Successful test leads', value: successfulLeadCount },
          { label: 'Billing', value: billingAccess.billingActive ? 'Active' : business.subscriptionStatus.toLowerCase() },
        ].map((item) => (
          <Card key={item.label} className="bg-card/90">
            <CardHeader className="pb-2">
              <CardDescription>{item.label}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-semibold">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle>Business status</CardTitle>
            <CardDescription>Customer-visible rollout state and what still blocks go-live.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-xl border bg-background/80 p-4">
              <p className="font-medium">Customer-facing system status</p>
              <p className="mt-2 text-muted-foreground">{customerStatus.description}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium">Messaging status</p>
                <p className="mt-2 text-muted-foreground">{managedSummary.messagingServiceReady ? 'Active' : 'Provisioning'}</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium">Compliance status</p>
                <p className="mt-2 text-muted-foreground">{managedSummary.complianceReady ? 'Approved' : managedSummary.label}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle>Business profile and routing</CardTitle>
            <CardDescription>Operational detail for launch and support.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium text-foreground">Created</p>
                <p className="mt-2">{formatDateTime(business.createdAt)}</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium text-foreground">Timezone</p>
                <p className="mt-2">{business.timezone}</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium text-foreground">Forwarding number</p>
                <p className="mt-2">{formatPhoneForDisplay(business.forwardingNumber)}</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium text-foreground">Owner alert number</p>
                <p className="mt-2">{formatPhoneForDisplay(business.notifyPhone)}</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium text-foreground">Primary texting number</p>
                <p className="mt-2">{formatPhoneForDisplay(getManagedTextingNumber(business))}</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium text-foreground">Missed-call timeout</p>
                <p className="mt-2">{business.missedCallSeconds} seconds</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/90 xl:col-span-2">
          <CardHeader>
            <CardTitle>Twilio and rollout detail</CardTitle>
            <CardDescription>Internal-only identifiers and status for operations.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-xl border bg-background/80 p-4">
              <p className="font-medium text-foreground">Managed Twilio status</p>
              <p className="mt-2">{business.managedTwilioStatus}</p>
            </div>
            <div className="rounded-xl border bg-background/80 p-4">
              <p className="font-medium text-foreground">Subaccount SID</p>
              <p className="mt-2 break-all">{business.twilioSubaccountSid || 'Not created yet'}</p>
            </div>
            <div className="rounded-xl border bg-background/80 p-4">
              <p className="font-medium text-foreground">Messaging Service SID</p>
              <p className="mt-2 break-all">{business.twilioMessagingServiceSid || 'Not created yet'}</p>
            </div>
            <div className="rounded-xl border bg-background/80 p-4">
              <p className="font-medium text-foreground">Primary number SID</p>
              <p className="mt-2 break-all">{business.twilioPrimaryNumberSid || 'Not assigned yet'}</p>
            </div>
            <div className="rounded-xl border bg-background/80 p-4">
              <p className="font-medium text-foreground">A2P campaign SID</p>
              <p className="mt-2 break-all">{business.a2pCampaignSid || 'Not submitted yet'}</p>
            </div>
            <div className="rounded-xl border bg-background/80 p-4">
              <p className="font-medium text-foreground">Last webhook sync</p>
              <p className="mt-2">{formatDateTime(business.twilioWebhookSyncedAt)}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
