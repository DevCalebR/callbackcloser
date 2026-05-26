import Link from 'next/link';
import { LeadReadiness, LeadStatus } from '@prisma/client';

import { Badge } from '@/components/ui/badge';
import {
  formatRelativeTime,
  getLeadNextStepLabel,
  getLeadStatusBadgeVariant,
  isLeadOpenStatus,
  leadReadinessLabels,
  leadStatusLabels,
} from '@/lib/lead-presenters';
import { formatPhoneForDisplay } from '@/lib/phone';
import { cn } from '@/lib/utils';

type CustomerLeadRowLead = {
  id: string;
  callerName: string | null;
  contactName: string | null;
  callerPhoneNormalized: string | null;
  callerPhone: string;
  serviceType: string | null;
  serviceRequested: string | null;
  urgency: string | null;
  location: string | null;
  zipCode: string | null;
  status: LeadStatus;
  readiness: LeadReadiness;
  createdAt: Date;
  lastInteractionAt: Date | null;
};

function getPrimaryLabel(lead: CustomerLeadRowLead) {
  return lead.callerName || lead.contactName || formatPhoneForDisplay(lead.callerPhoneNormalized || lead.callerPhone);
}

function getSecondaryLabel(lead: CustomerLeadRowLead) {
  if (lead.callerName || lead.contactName) {
    return formatPhoneForDisplay(lead.callerPhoneNormalized || lead.callerPhone);
  }

  return 'Name not captured yet';
}

function getServiceLabel(lead: CustomerLeadRowLead) {
  return lead.serviceType || lead.serviceRequested || 'Service not captured yet';
}

function getUrgencyLabel(lead: CustomerLeadRowLead) {
  return lead.urgency || 'Urgency pending';
}

function getLocationLabel(lead: CustomerLeadRowLead) {
  return lead.location || lead.zipCode || 'Location pending';
}

function getReadinessVariant(readiness: LeadReadiness) {
  if (readiness === LeadReadiness.URGENT) return 'destructive';
  if (readiness === LeadReadiness.QUALIFIED) return 'secondary';
  return 'outline';
}

export function CustomerLeadRow({
  lead,
  href,
  compact = false,
}: {
  lead: CustomerLeadRowLead;
  href: string;
  compact?: boolean;
}) {
  const isOpen = isLeadOpenStatus(lead.status);
  const nextStep = getLeadNextStepLabel(lead.status);
  const activityAt = lead.lastInteractionAt || lead.createdAt;

  return (
    <Link
      className={cn(
        'group block rounded-2xl border bg-background/90 transition-colors hover:bg-muted/20',
        isOpen && 'border-primary/20',
        compact ? 'p-4' : 'p-4 sm:p-5',
      )}
      href={href}
    >
      <div className={cn('flex flex-col gap-4', compact ? 'lg:grid lg:grid-cols-[minmax(0,1.1fr)_auto] lg:items-center' : 'lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_auto] lg:items-center')}>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {lead.status === LeadStatus.NEW ? <span className="h-2.5 w-2.5 rounded-full bg-primary" aria-hidden="true" /> : null}
            <p className="font-medium text-foreground">{getPrimaryLabel(lead)}</p>
            {lead.status === LeadStatus.NEW ? <Badge variant="secondary">New lead</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">{getSecondaryLabel(lead)}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>{getServiceLabel(lead)}</span>
            <span>{getUrgencyLabel(lead)}</span>
            <span>{getLocationLabel(lead)}</span>
            <span>{formatRelativeTime(activityAt)}</span>
          </div>
        </div>

        {!compact ? (
          <div className="space-y-1 text-sm">
            <p className="font-medium text-foreground">{nextStep}</p>
            <p className="text-muted-foreground">{isOpen ? 'Open the lead to call back or update the outcome.' : 'Closed lead for reference.'}</p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <Badge variant={getLeadStatusBadgeVariant(lead.status)}>{leadStatusLabels[lead.status]}</Badge>
          <Badge variant={getReadinessVariant(lead.readiness)}>{leadReadinessLabels[lead.readiness]}</Badge>
        </div>
      </div>
    </Link>
  );
}
