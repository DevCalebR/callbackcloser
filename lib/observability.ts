type ErrorReportPayload = {
  source: string;
  event: string;
  correlationId: string;
  error: string;
  metadata: Record<string, unknown>;
  timestamp: string;
};

type ReportErrorInput = {
  source: string;
  event: string;
  correlationId: string;
  error?: unknown;
  metadata?: Record<string, unknown>;
  alert?: boolean;
};

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function sanitizeCorrelationId(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.length > 128) return trimmed.slice(0, 128);
  return trimmed;
}

function generateCorrelationId() {
  return `req_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function buildAlertPayload(payload: ErrorReportPayload) {
  return {
    text: `[CallbackCloser] ${payload.source}.${payload.event} (${payload.correlationId})`,
    ...payload,
  };
}

async function dispatchAlert(payload: ErrorReportPayload) {
  const webhookUrl = process.env.ALERT_WEBHOOK_URL?.trim();
  if (!webhookUrl) return;

  const timeoutMsRaw = process.env.ALERT_WEBHOOK_TIMEOUT_MS?.trim();
  const timeoutMs = timeoutMsRaw ? Number.parseInt(timeoutMsRaw, 10) : 4_000;
  const token = process.env.ALERT_WEBHOOK_TOKEN?.trim();

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(buildAlertPayload(payload)),
      signal: AbortSignal.timeout(Number.isFinite(timeoutMs) ? Math.max(timeoutMs, 1_000) : 4_000),
    });
  } catch (error) {
    console.error('app.alert_dispatch_failed', {
      source: payload.source,
      event: payload.event,
      correlationId: payload.correlationId,
      error: toErrorMessage(error),
    });
  }
}

export function getCorrelationIdFromRequest(request: Pick<Request, 'headers'>) {
  return (
    sanitizeCorrelationId(request.headers.get('x-correlation-id')) ||
    sanitizeCorrelationId(request.headers.get('x-request-id')) ||
    generateCorrelationId()
  );
}

export function withCorrelationIdHeader<T extends Response>(response: T, correlationId: string) {
  response.headers.set('X-Correlation-Id', correlationId);
  return response;
}

export function reportApplicationError(input: ReportErrorInput) {
  const errorMessage = input.error === undefined ? 'unknown_error' : toErrorMessage(input.error);
  const payload: ErrorReportPayload = {
    source: input.source,
    event: input.event,
    correlationId: input.correlationId,
    error: errorMessage,
    metadata: input.metadata ?? {},
    timestamp: new Date().toISOString(),
  };

  console.error('app.error', payload);

  if (input.alert === false) return;
  void dispatchAlert(payload);
}
