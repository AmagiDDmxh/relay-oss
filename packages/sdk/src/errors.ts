import type { WhatsAppSendRejectedDetails } from './types';

export interface RelayErrorBody {
  code?: string;
  error?: string;
  message?: string;
  retryable?: boolean;
  failure_code?: string;
  trace_id?: string;
  request_id?: string;
  details?: Record<string, unknown>;
}

export interface RelayApiErrorOptions {
  status: number;
  code?: string | undefined;
  retryable?: boolean | undefined;
  retryAfterSeconds?: number | undefined;
  failureCode?: string | undefined;
  traceId?: string | undefined;
  requestId?: string | undefined;
  details?: Record<string, unknown> | undefined;
}

export class RelayApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | undefined;
  readonly failureCode: string | undefined;
  readonly traceId: string | undefined;
  readonly requestId: string | undefined;
  readonly details: Record<string, unknown> | undefined;

  constructor(message: string, options: RelayApiErrorOptions) {
    super(message);
    this.name = 'RelayApiError';
    this.status = options.status;
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.failureCode = options.failureCode;
    this.traceId = options.traceId;
    this.requestId = options.requestId;
    this.details = options.details;
  }
}

export class RelayValidationError extends RelayApiError {
  constructor(message: string, details?: Record<string, unknown> | undefined, options: { status?: number; code?: string; retryable?: boolean } = {}) {
    super(message, {
      status: options.status ?? 0,
      code: options.code ?? 'INVALID_SDK_INPUT',
      retryable: options.retryable ?? false,
      details,
    });
    this.name = 'RelayValidationError';
  }
}

export class RelayAuthError extends RelayApiError {
  constructor(message: string, options: RelayApiErrorOptions) {
    super(message, options);
    this.name = 'RelayAuthError';
  }
}

export class RelayNotFoundError extends RelayApiError {
  constructor(message: string, options: RelayApiErrorOptions) {
    super(message, options);
    this.name = 'RelayNotFoundError';
  }
}

export class RelayConflictError extends RelayApiError {
  constructor(message: string, options: RelayApiErrorOptions) {
    super(message, options);
    this.name = 'RelayConflictError';
  }
}

export class RelayRateLimitError extends RelayApiError {
  constructor(message: string, options: RelayApiErrorOptions) {
    super(message, options);
    this.name = 'RelayRateLimitError';
  }
}

export class RelayConnectionError extends RelayApiError {
  constructor(message: string, details?: Record<string, unknown> | undefined) {
    super(message, {
      status: 0,
      code: 'CONNECTION_ERROR',
      retryable: true,
      details,
    });
    this.name = 'RelayConnectionError';
  }
}

export function isWhatsAppSendRejectedError(error: unknown): error is RelayConflictError & {
  readonly code: 'WHATSAPP_SEND_REJECTED';
  readonly retryable: true;
  readonly details: WhatsAppSendRejectedDetails;
} {
  const details = error instanceof RelayApiError ? error.details : undefined;
  return (
    error instanceof RelayApiError &&
    error.code === 'WHATSAPP_SEND_REJECTED' &&
    error.retryable === true &&
    details?.recommended_action === 'retry_send_after_recovery' &&
    details.recovery === 'privacy_token_refresh_started' &&
    typeof details.retry_after_seconds === 'number'
  );
}

export async function errorFromResponse(response: Response): Promise<RelayApiError> {
  let body: RelayErrorBody = {};
  try {
    body = (await response.json()) as RelayErrorBody;
  } catch {
    // Keep default body for non-JSON errors.
  }
  const message = (body.message ?? body.error ?? response.statusText) || `HTTP ${response.status}`;
  const retryAfterSeconds = parseRetryAfter(response.headers.get('Retry-After')) ?? numberDetail(body.details, 'retry_after_seconds');
  const failureCode = body.failure_code ?? stringDetail(body.details, 'failure_code') ?? body.code;
  const traceId = body.trace_id ?? stringDetail(body.details, 'trace_id');
  const requestId = body.request_id ?? stringDetail(body.details, 'request_id') ?? response.headers.get('X-Request-ID') ?? undefined;
  const options = {
    status: response.status,
    code: body.code,
    retryable: body.retryable,
    retryAfterSeconds,
    failureCode,
    traceId,
    requestId,
    details: body.details,
  };
  if (response.status === 400) {
    const validationOptions: { status?: number; code?: string; retryable?: boolean } = { status: response.status };
    if (body.code) validationOptions.code = body.code;
    if (body.retryable !== undefined) validationOptions.retryable = body.retryable;
    return new RelayValidationError(message, body.details, validationOptions);
  }
  if (response.status === 401 || response.status === 403) return new RelayAuthError(message, options);
  if (response.status === 404) return new RelayNotFoundError(message, options);
  if (response.status === 409) return new RelayConflictError(message, options);
  if (response.status === 429) return new RelayRateLimitError(message, options);
  return new RelayApiError(message, options);
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number.parseInt(value, 10);
  return Number.isFinite(seconds) ? seconds : undefined;
}

function numberDetail(details: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = details?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringDetail(details: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = details?.[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
}
