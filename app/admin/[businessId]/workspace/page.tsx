import Link from 'next/link';
import { notFound } from 'next/navigation';

import { buildAdminNextStep } from '@/lib/admin-dashboard';
import { requireAdmin } from '@/lib/admin';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { db } from '@/lib/db';
import {
  formatDateTime,
  formatMessageStatus,
  formatRelativeTime,
  getLeadCallbackState,
  getLeadStatusBadgeVariant,
  leadReadinessLabels,
  leadStatusLabels,
} from '@/lib/lead-presenters';
import { getManagedTwilioStatusSummary } from '@/lib/managed-twilio';
import { formatPhoneForDisplay } from '@/lib/phone';
import { getBusinessBillingAccessState } from '@/lib/subscription';

export const dynamic = 'force-dynamic';

function getNextStepBadgeVariant(tone: 'healthy' | 'pending' | 'attention' | 'paused') {
  if (tone === 'healthy') return 'success' as const;
  if (tone === 'attention') return 'destructive' as const;
  if (tone === 'paused') return 'outline' as const;
  return 'secondary' as const;
}

export default async function AdminBusinessWorkspacePage({ params }: { params: { businessId: string } }) {
  await requireAdmin();

  const [business, recentLeads, recentOwnerNotifications, recentMessages] = await Promise.all([
    db.business.findUnique({
      where: { id: params.businessId },
      include: {
        notificationSettings: true,
      },
    }),
    db.lead.findMany({
      where: { businessId: params.businessId },
      orderBy: [{ lastInteractionAt: 'desc' }, { createdAt: 'desc' }],
      take: 8,
    }),
    db.ownerNotification.findMany({
      where: { businessId: params.businessId },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    db.message.findMany({
      where: { businessId: params.businessId },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
  ]);

  if (!business) notFound();

  const successfulLeadCount = recentLeads.filter((lead) => lead.ownerNotifiedAt || lead.notifiedAt).length;
  const nextStep = buildAdminNextStep({
    business,
    notificationSettings: business.notificationSettings,
    ownerConnected: !business.ownerClerkId.startsWith('pending_owner_'),
  });
  const managedSummary = getManagedTwilioStatusSummary(business);
  const billingAccess = getBusinessBillingAccessState(business);

  return (
    <div className="container space-y-6 py-8">
      <div className="space-y-2">
        <Link className="text-sm text-muted-foreground underline underline-offset-4" href={`/admin/${business.id}`}>
          Back to operator page
        </Link>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{business.name} support workspace</h1>
            <p className="text-sm text-muted-foreground">
              Read-only snapshot of the customer-facing workspace so the founder can orient quickly without impersonation.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className={buttonVariants({ variant: 'default' })} href={`/admin/${business.id}`}>
              Open operator controls
            </Link>
            <Link className={buttonVariants({ variant: 'outline' })} href="/admin">
              Back to board
            </Link>
          </div>
        </div>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle>Support snapshot</CardTitle>
          <CardDescription>What matters first when the founder needs to step into a customer’s world.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-xl border bg-background/80 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={getNextStepBadgeVariant(nextStep.tone)}>{nextStep.title}</Badge>
              <Badge variant={managedSummary.messagingReady ? 'success' : managedSummary.attentionRequired ? 'destructive' : 'secondary'}>
                {managedSummary.label}
              </Badge>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{nextStep.detail}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border bg-background/80 p-4 text-sm">
              <p className="font-medium">Lead handoffs</p>
              <p className="mt-2 text-2xl font-semibold">{successfulLeadCount}</p>
            </div>
            <div className="rounded-xl border bg-background/80 p-4 text-sm">
              <p className="font-medium">Billing</p>
              <p className="mt-2 text-muted-foreground">{billingAccess.billingActive ? 'Active' : 'Inactive'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="bg-card/90" id="recent-leads">
          <CardHeader>
            <CardTitle>Recent leads</CardTitle>
            <CardDescription>Support-friendly snapshot of where the current inbox stands.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentLeads.length === 0 ? (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No leads yet.</div>
            ) : (
              recentLeads.map((lead) => (
                <div key={lead.id} className="rounded-xl border bg-background/80 p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={getLeadStatusBadgeVariant(lead.status)}>{leadStatusLabels[lead.status]}</Badge>
                    <Badge variant={lead.readiness === 'URGENT' ? 'destructive' : lead.readiness === 'QUALIFIED' ? 'secondary' : 'outline'}>
                      {leadReadinessLabels[lead.readiness]}
                    </Badge>
                  </div>
                  <p className="mt-3 font-medium">{getLeadCallbackState(lead)}</p>
                  <p className="mt-2 text-muted-foreground">{lead.summary || 'Lead summary not captured yet.'}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(lead.lastInteractionAt || lead.createdAt)}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="bg-card/90">
            <CardHeader>
              <CardTitle>Business settings snapshot</CardTitle>
              <CardDescription>The customer context the founder usually has to hunt down.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium">Owner alerts</p>
                <p className="mt-2 text-muted-foreground">
                  {formatPhoneForDisplay(business.notificationSettings?.ownerPhone || business.notifyPhone)} · {business.notificationSettings?.ownerEmail || 'No owner email'}
                </p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium">Forwarding number</p>
                <p className="mt-2 text-muted-foreground">{formatPhoneForDisplay(business.forwardingNumber)}</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium">Texting line</p>
                <p className="mt-2 text-muted-foreground">
                  {formatPhoneForDisplay(business.twilioPrimaryPhoneNumber || business.twilioPhoneNumber)}
                </p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium">Internal notes</p>
                <p className="mt-2 text-muted-foreground">{business.internalNotes || 'No internal notes recorded.'}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/90">
            <CardHeader>
              <CardTitle>Recent notifications and SMS</CardTitle>
              <CardDescription>Quick visibility into the latest customer-visible activity.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {recentOwnerNotifications.slice(0, 4).map((notification) => (
                <div key={notification.id} className="rounded-xl border bg-background/80 p-4">
                  <p className="font-medium">
                    Owner {notification.channel.toLowerCase()} alert · {notification.status.toLowerCase()}
                  </p>
                  <p className="mt-2 text-muted-foreground">{notification.error || notification.destination || 'No extra detail recorded.'}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{formatRelativeTime(notification.createdAt)}</p>
                </div>
              ))}
              {recentMessages.slice(0, 4).map((message) => (
                <div key={message.id} className="rounded-xl border bg-background/80 p-4">
                  <p className="font-medium">
                    {message.participant === 'OWNER' ? 'Owner SMS' : 'Lead SMS'} · {message.direction.toLowerCase()}
                    {message.status ? ` · ${formatMessageStatus(message.status)}` : ''}
                  </p>
                  <p className="mt-2 text-muted-foreground">{message.body}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{formatRelativeTime(message.createdAt)}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
