type AuditEventInput = {
  event: string;
  actorType: 'user' | 'system' | 'provider';
  actorId?: string | null;
  businessId?: string | null;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  correlationId?: string | null;
};

function sanitize(value: string | null | undefined, maxLength = 256) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) return trimmed.slice(0, maxLength);
  return trimmed;
}

export function logAuditEvent(input: AuditEventInput) {
  const payload = {
    event: sanitize(input.event, 128) || 'unknown_event',
    actorType: input.actorType,
    actorId: sanitize(input.actorId),
    businessId: sanitize(input.businessId),
    targetType: sanitize(input.targetType, 128) || 'unknown_target',
    targetId: sanitize(input.targetId),
    metadata: input.metadata ?? {},
    correlationId: sanitize(input.correlationId, 128),
    timestamp: new Date().toISOString(),
  };

  console.info('app.audit', payload);
}
