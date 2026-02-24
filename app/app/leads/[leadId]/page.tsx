import { notFound } from 'next/navigation';

import { updateLeadStatusAction } from '@/app/app/leads/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { requireBusiness } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatDateTime, leadStatusLabels, leadStatusOrder, smsStateLabels } from '@/lib/lead-presenters';
import { formatPhoneForDisplay } from '@/lib/phone';
import { getPortfolioDemoLeadDetail, isPortfolioDemoMode } from '@/lib/portfolio-demo';

export default async function LeadDetailPage({ params, searchParams }: { params: { leadId: string }; searchParams?: Record<string, string | string[] | undefined> }) {
  const business = await requireBusiness();
  const lead = isPortfolioDemoMode()
    ? getPortfolioDemoLeadDetail(params.leadId)
    : await db.lead.findFirst({
        where: { id: params.leadId, businessId: business.id },
        include: {
          call: true,
          messages: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });

  if (!lead) notFound();

  const saved = searchParams?.saved === '1';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Lead Detail</h1>
          <p className="text-sm text-muted-foreground">{formatPhoneForDisplay(lead.callerPhoneNormalized || lead.callerPhone)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={lead.billingRequired ? 'destructive' : 'secondary'}>
            {lead.billingRequired ? 'billing_required' : 'billing_ok'}
          </Badge>
          <Badge variant={lead.status === 'BOOKED' ? 'success' : 'outline'}>{leadStatusLabels[lead.status]}</Badge>
        </div>
      </div>

      {saved ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Lead status updated.</div> : null}

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Captured Details</CardTitle>
              <CardDescription>Fields collected from the SMS workflow.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2"><span className="text-muted-foreground">Service</span><span>{lead.serviceRequested || '-'}</span></div>
              <div className="grid grid-cols-2 gap-2"><span className="text-muted-foreground">Urgency</span><span>{lead.urgency || '-'}</span></div>
              <div className="grid grid-cols-2 gap-2"><span className="text-muted-foreground">ZIP</span><span>{lead.zipCode || '-'}</span></div>
              <div className="grid grid-cols-2 gap-2"><span className="text-muted-foreground">Best Time</span><span>{lead.bestTime || '-'}</span></div>
              <div className="grid grid-cols-2 gap-2"><span className="text-muted-foreground">Name</span><span>{lead.contactName || '-'}</span></div>
              <div className="grid grid-cols-2 gap-2"><span className="text-muted-foreground">SMS State</span><span>{smsStateLabels[lead.smsState]}</span></div>
              <div className="grid grid-cols-2 gap-2"><span className="text-muted-foreground">Created</span><span>{formatDateTime(lead.createdAt)}</span></div>
              <div className="grid grid-cols-2 gap-2"><span className="text-muted-foreground">Owner Notified</span><span>{formatDateTime(lead.ownerNotifiedAt)}</span></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Lead Status</CardTitle>
              <CardDescription>Internal pipeline status for your team.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={updateLeadStatusAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <input type="hidden" name="leadId" value={lead.id} />
                <div className="w-full sm:max-w-xs">
                  <Label htmlFor="status">Status</Label>
                  <Select id="status" name="status" defaultValue={lead.status}>
                    {leadStatusOrder.map((status) => (
                      <option key={status} value={status}>
                        {leadStatusLabels[status]}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button type="submit">Update</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Call Record</CardTitle>
              <CardDescription>Twilio voice callback data for the originating call.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {lead.call ? (
                <>
                  <div className="grid grid-cols-2 gap-2"><span className="text-muted-foreground">Call SID</span><span className="break-all">{lead.call.twilioCallSid}</span></div>
                  <div className="grid grid-cols-2 gap-2"><span className="text-muted-foreground">Dial status</span><span>{lead.call.dialCallStatus || '-'}</span></div>
                  <div className="grid grid-cols-2 gap-2"><span className="text-muted-foreground">Answered</span><span>{lead.call.answered ? 'Yes' : 'No'}</span></div>
                  <div className="grid grid-cols-2 gap-2"><span className="text-muted-foreground">Missed</span><span>{lead.call.missed ? 'Yes' : 'No'}</span></div>
                  <div className="grid grid-cols-2 gap-2"><span className="text-muted-foreground">Duration</span><span>{lead.call.callDurationSeconds ?? 0}s</span></div>
                </>
              ) : (
                <p className="text-muted-foreground">No call record linked.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Transcript</CardTitle>
            <CardDescription>Inbound and outbound Twilio messages for this lead.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {lead.messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No messages yet.</p>
            ) : (
              lead.messages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-lg border p-3 text-sm ${message.direction === 'OUTBOUND' ? 'bg-primary/5' : 'bg-card'}`}
                >
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>
                      {message.direction.toLowerCase()} | {message.participant.toLowerCase()}
                    </span>
                    <span>{formatDateTime(message.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap">{message.body}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
