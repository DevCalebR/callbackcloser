import { LeadReadiness, LeadStatus, type Lead } from '@prisma/client';

type LeadQualificationFields = Pick<
  Lead,
  | 'serviceType'
  | 'serviceRequested'
  | 'urgency'
  | 'location'
  | 'zipCode'
  | 'callbackRequested'
  | 'callerName'
  | 'contactName'
  | 'bestTime'
  | 'callerPhoneNormalized'
>;

function hasValue(value: string | null | undefined) {
  return Boolean(value && value.trim().length > 0);
}

export function getLeadServiceType(lead: Pick<LeadQualificationFields, 'serviceType' | 'serviceRequested'>) {
  return lead.serviceType || lead.serviceRequested || null;
}

export function getLeadCallerName(lead: Pick<LeadQualificationFields, 'callerName' | 'contactName'>) {
  return lead.callerName || lead.contactName || null;
}

export function getLeadLocation(lead: Pick<LeadQualificationFields, 'location' | 'zipCode'>) {
  return lead.location || lead.zipCode || null;
}

export function getLeadPreferredCallbackTime(lead: Pick<LeadQualificationFields, 'bestTime' | 'callbackRequested'>) {
  if (lead.bestTime) return lead.bestTime;
  if (lead.callbackRequested === false) return 'Text only';
  return null;
}

export function isUrgentLead(lead: Pick<LeadQualificationFields, 'urgency'>) {
  const urgency = lead.urgency?.trim().toLowerCase();
  if (!urgency) return false;
  return urgency.includes('emergency') || urgency.includes('urgent') || urgency.includes('today') || urgency.includes('asap');
}

export function isLeadQualified(
  lead: Pick<LeadQualificationFields, 'serviceType' | 'serviceRequested' | 'urgency' | 'callbackRequested' | 'bestTime'>
) {
  return hasValue(getLeadServiceType(lead)) && hasValue(lead.urgency) && (hasValue(lead.bestTime) || typeof lead.callbackRequested === 'boolean');
}

export function getLeadReadiness(
  lead: Pick<LeadQualificationFields, 'serviceType' | 'serviceRequested' | 'urgency' | 'callbackRequested' | 'bestTime'>
) {
  if (!isLeadQualified(lead)) return LeadReadiness.PENDING;
  return isUrgentLead(lead) ? LeadReadiness.URGENT : LeadReadiness.QUALIFIED;
}

export function getQualifiedLeadStatus(
  lead: Pick<Lead, 'status' | 'notifiedAt'> &
    Pick<LeadQualificationFields, 'serviceType' | 'serviceRequested' | 'urgency' | 'callbackRequested' | 'bestTime'>
) {
  if (lead.status === LeadStatus.CONTACTED || lead.status === LeadStatus.BOOKED || lead.status === LeadStatus.LOST) {
    return lead.status;
  }

  if (!isLeadQualified(lead)) return LeadStatus.NEW;
  if (lead.notifiedAt) return LeadStatus.NOTIFIED;
  return LeadStatus.QUALIFIED;
}

export function buildLeadSummary(lead: LeadQualificationFields) {
  const summaryParts = [
    getLeadServiceType(lead) ? `Service: ${getLeadServiceType(lead)}` : null,
    lead.urgency ? `Urgency: ${lead.urgency}` : null,
    getLeadLocation(lead) ? `Location: ${getLeadLocation(lead)}` : null,
    getLeadPreferredCallbackTime(lead) ? `Callback: ${getLeadPreferredCallbackTime(lead)}` : null,
    typeof lead.callbackRequested === 'boolean'
      ? lead.callbackRequested
        ? 'Callback requested'
        : 'No callback requested'
      : null,
    getLeadCallerName(lead) ? `Name: ${getLeadCallerName(lead)}` : null,
    lead.callerPhoneNormalized ? `Phone: ${lead.callerPhoneNormalized}` : null,
  ].filter(Boolean);

  return summaryParts.join(' | ') || 'Lead is still gathering details.';
}
