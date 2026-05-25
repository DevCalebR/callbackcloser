import { OperatorEventCategory, OperatorEventStatus, Prisma, type Message } from '@prisma/client';

export type OutboundMessageContext = 'lead_recovery' | 'owner_alert' | 'admin_test';

type OperatorMessageRecord = Pick<Message, 'leadId' | 'participant' | 'body' | 'rawPayload'>;

const ADMIN_TEST_PREFIXES = ['CallbackCloser admin test:', 'CallbackCloser setup test:'];

function readRawPayloadContext(rawPayload: Prisma.JsonValue | null | undefined) {
  if (!rawPayload || Array.isArray(rawPayload) || typeof rawPayload !== 'object') {
    return null;
  }

  const context = (rawPayload as Record<string, unknown>).context;
  return typeof context === 'string' ? context.trim().toLowerCase() : null;
}

export function normalizeOutboundMessageStatus(status: string | null | undefined) {
  const normalized = status?.trim().toLowerCase();
  return normalized || null;
}

export function isTerminalOutboundMessageStatus(status: string | null | undefined) {
  const normalized = normalizeOutboundMessageStatus(status);
  return normalized === 'delivered' || normalized === 'failed' || normalized === 'undelivered';
}

export function isFailedOutboundMessageStatus(status: string | null | undefined) {
  const normalized = normalizeOutboundMessageStatus(status);
  return normalized === 'failed' || normalized === 'undelivered';
}

export function getOutboundMessageContext(message: OperatorMessageRecord): OutboundMessageContext {
  const rawPayloadContext = readRawPayloadContext(message.rawPayload);
  const isAdminTestBody = ADMIN_TEST_PREFIXES.some((prefix) => message.body.startsWith(prefix));

  if (!message.leadId && message.participant === 'OWNER' && (rawPayloadContext === 'admin_test' || isAdminTestBody)) {
    return 'admin_test';
  }

  if (message.participant === 'OWNER') {
    return 'owner_alert';
  }

  return 'lead_recovery';
}

export function buildOutboundMessageStatusEvent(
  message: OperatorMessageRecord,
  status: string | null | undefined
): {
  type: string;
  category: OperatorEventCategory;
  status: OperatorEventStatus;
  summary: string;
} | null {
  const normalized = normalizeOutboundMessageStatus(status);
  if (!isTerminalOutboundMessageStatus(normalized)) {
    return null;
  }

  const failed = isFailedOutboundMessageStatus(normalized);
  const context = getOutboundMessageContext(message);

  if (context === 'admin_test') {
    return failed
      ? {
          type: 'admin.test_sms_delivery_failed',
          category: OperatorEventCategory.ADMIN_ACTIONS,
          status: OperatorEventStatus.FAILED,
          summary: 'Test SMS delivery failed',
        }
      : {
          type: 'admin.test_sms_delivered',
          category: OperatorEventCategory.ADMIN_ACTIONS,
          status: OperatorEventStatus.SUCCESS,
          summary: 'Test SMS delivered',
        };
  }

  if (context === 'owner_alert') {
    return failed
      ? {
          type: 'owner_alert.sms_delivery_failed',
          category: OperatorEventCategory.OWNER_ALERTS,
          status: OperatorEventStatus.FAILED,
          summary: 'Owner SMS alert delivery failed',
        }
      : {
          type: 'owner_alert.sms_delivered',
          category: OperatorEventCategory.OWNER_ALERTS,
          status: OperatorEventStatus.SUCCESS,
          summary: 'Owner SMS alert delivered',
        };
  }

  return failed
    ? {
        type: 'messaging.outbound_sms_delivery_failed',
        category: OperatorEventCategory.MESSAGING,
        status: OperatorEventStatus.FAILED,
        summary: 'Outbound lead SMS delivery failed',
      }
    : {
        type: 'messaging.outbound_sms_delivered',
        category: OperatorEventCategory.MESSAGING,
        status: OperatorEventStatus.SUCCESS,
        summary: 'Outbound lead SMS delivered',
      };
}
