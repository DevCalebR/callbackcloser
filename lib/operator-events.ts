import { OperatorEventCategory, OperatorEventStatus, Prisma } from '@prisma/client';

import { db } from '@/lib/db';
import { maskPhoneForAudit } from '@/lib/phone';

const REDACTED_DETAIL_PATTERNS = /(token|secret|password|signature|authorization|recordingurl|webhookurl)/i;

export type OperatorEventCategoryKey =
  | 'PROVISIONING'
  | 'MESSAGING'
  | 'VOICE'
  | 'WEBHOOKS'
  | 'OWNER_ALERTS'
  | 'ADMIN_ACTIONS'
  | 'ONBOARDING'
  | 'ERRORS';

export type OperatorEventStatusKey = 'SUCCESS' | 'PENDING' | 'WARNING' | 'FAILED' | 'INFO';

export type BusinessTimelineFilter = 'all' | 'errors' | 'provisioning' | 'messaging' | 'voice' | 'webhooks' | 'admin';

type OperatorEventDetails =
  | Prisma.InputJsonObject
  | Prisma.InputJsonArray
  | string
  | number
  | boolean
  | null
  | undefined;

type CreateOperatorEventInput = {
  businessId: string;
  type: string;
  category: OperatorEventCategory;
  status: OperatorEventStatus;
  summary: string;
  details?: OperatorEventDetails;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  createdAt?: Date;
};

export const operatorEventCategoryLabels: Record<OperatorEventCategory, string> = {
  PROVISIONING: 'Provisioning',
  MESSAGING: 'Messaging',
  VOICE: 'Voice',
  WEBHOOKS: 'Webhooks',
  OWNER_ALERTS: 'Owner alerts',
  ADMIN_ACTIONS: 'Admin',
  ONBOARDING: 'Onboarding',
  ERRORS: 'Errors',
};

export const operatorEventStatusLabels: Record<OperatorEventStatus, string> = {
  SUCCESS: 'Success',
  PENDING: 'Pending',
  WARNING: 'Warning',
  FAILED: 'Failed',
  INFO: 'Info',
};

export const businessTimelineFilterOptions: Array<{ key: BusinessTimelineFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'errors', label: 'Errors' },
  { key: 'provisioning', label: 'Provisioning' },
  { key: 'messaging', label: 'Messaging' },
  { key: 'voice', label: 'Voice' },
  { key: 'webhooks', label: 'Webhooks' },
  { key: 'admin', label: 'Admin' },
];

function sanitizeText(value: string | null | undefined, maxLength = 240) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}…` : trimmed;
}

export function maskSid(value: string | null | undefined) {
  const trimmed = sanitizeText(value, 128);
  if (!trimmed) return null;
  if (trimmed.length <= 8) return trimmed;
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

function sanitizeJsonValue(value: unknown, depth = 0): Prisma.InputJsonValue | undefined {
  if (value === null) return undefined;
  if (value === undefined) return undefined;

  if (typeof value === 'string') {
    return sanitizeText(value, 500) ?? undefined;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    if (depth >= 3) {
      return value
        .slice(0, 8)
        .map((item) => sanitizeJsonValue(item, depth + 1))
        .filter((item): item is Prisma.InputJsonValue => item !== undefined);
    }

    return value
      .slice(0, 12)
      .map((item) => sanitizeJsonValue(item, depth + 1))
      .filter((item): item is Prisma.InputJsonValue => item !== undefined);
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 20);
    const output: Record<string, Prisma.InputJsonValue> = {};

    for (const [key, raw] of entries) {
      if (REDACTED_DETAIL_PATTERNS.test(key)) {
        output[key] = '[redacted]';
        continue;
      }

      const sanitized = sanitizeJsonValue(raw, depth + 1);
      if (sanitized !== undefined) {
        output[key] = sanitized;
      }
    }

    return output as Prisma.InputJsonObject;
  }

  return sanitizeText(String(value), 200) ?? undefined;
}

export function formatPhoneDetail(value: string | null | undefined) {
  return maskPhoneForAudit(value);
}

export function buildTimelineWhereClause(businessId: string, filter: BusinessTimelineFilter): Prisma.BusinessOperatorEventWhereInput {
  if (filter === 'errors') {
    return {
      businessId,
      status: { in: [OperatorEventStatus.FAILED, OperatorEventStatus.WARNING] },
    };
  }

  if (filter === 'provisioning') {
    return {
      businessId,
      category: { in: [OperatorEventCategory.PROVISIONING, OperatorEventCategory.ONBOARDING] },
    };
  }

  if (filter === 'messaging') {
    return {
      businessId,
      category: { in: [OperatorEventCategory.MESSAGING, OperatorEventCategory.OWNER_ALERTS] },
    };
  }

  if (filter === 'voice') {
    return {
      businessId,
      category: OperatorEventCategory.VOICE,
    };
  }

  if (filter === 'webhooks') {
    return {
      businessId,
      category: OperatorEventCategory.WEBHOOKS,
    };
  }

  if (filter === 'admin') {
    return {
      businessId,
      category: OperatorEventCategory.ADMIN_ACTIONS,
    };
  }

  return { businessId };
}

export function matchesTimelineFilter(
  event: { category: OperatorEventCategory; status: OperatorEventStatus },
  filter: BusinessTimelineFilter
) {
  if (filter === 'all') return true;
  if (filter === 'errors') return event.status === OperatorEventStatus.FAILED || event.status === OperatorEventStatus.WARNING;
  if (filter === 'provisioning') {
    return event.category === OperatorEventCategory.PROVISIONING || event.category === OperatorEventCategory.ONBOARDING;
  }
  if (filter === 'messaging') {
    return event.category === OperatorEventCategory.MESSAGING || event.category === OperatorEventCategory.OWNER_ALERTS;
  }
  if (filter === 'voice') return event.category === OperatorEventCategory.VOICE;
  if (filter === 'webhooks') return event.category === OperatorEventCategory.WEBHOOKS;
  if (filter === 'admin') return event.category === OperatorEventCategory.ADMIN_ACTIONS;
  return true;
}

export function countTimelineFilters(events: Array<{ category: OperatorEventCategory; status: OperatorEventStatus }>) {
  return new Map(
    businessTimelineFilterOptions.map((option) => [
      option.key,
      events.filter((event) => matchesTimelineFilter(event, option.key)).length,
    ])
  );
}

export async function listBusinessOperatorEvents(businessId: string, filter: BusinessTimelineFilter = 'all', take = 120) {
  return db.businessOperatorEvent.findMany({
    where: buildTimelineWhereClause(businessId, filter),
    orderBy: { createdAt: 'desc' },
    take,
  });
}

export async function recordBusinessOperatorEvent(input: CreateOperatorEventInput) {
  try {
    return await db.businessOperatorEvent.create({
      data: {
        businessId: input.businessId,
        type: sanitizeText(input.type, 120) || 'unknown_event',
        category: input.category,
        status: input.status,
        summary: sanitizeText(input.summary, 220) || 'Event recorded',
        detailsJson: sanitizeJsonValue(input.details) ?? undefined,
        relatedEntityType: sanitizeText(input.relatedEntityType, 80),
        relatedEntityId: sanitizeText(input.relatedEntityId, 128),
        createdAt: input.createdAt,
      },
    });
  } catch (error) {
    console.error('operator_event_write_failed', {
      businessId: input.businessId,
      type: input.type,
      category: input.category,
      status: input.status,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
