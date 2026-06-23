import { errorFromResponse, RelayConnectionError, RelayValidationError } from './errors';
import type { RelayClientConfig } from './types';

export interface AuthScope {
  deviceId?: string;
  ownerUserId?: string;
  appId?: string;
}

export type RelayRequestInit = Omit<RequestInit, 'headers'> & {
  headers?: HeadersInit;
  scope?: AuthScope;
};

export interface RelayRequester {
  request<T>(path: string, init?: RelayRequestInit): Promise<T>;
}

export function createRequester(config: RelayClientConfig): RelayRequester {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const supplierApiKey = requiredString(config.supplierApiKey, 'supplierApiKey');
  const fetchImpl = config.fetch ?? globalThis.fetch;
  if (!fetchImpl) throw new RelayValidationError('fetch is required', { field: 'fetch' });

  const defaultScope = normalizeScope(config);

  return {
    async request<T>(path: string, init: RelayRequestInit = {}) {
      const headers = buildAuthHeaders(supplierApiKey, { ...defaultScope, ...normalizeScope(init.scope ?? {}) }, init.headers);
      if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

      const { scope: _scope, ...fetchInit } = init;
      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}${path}`, { ...fetchInit, headers });
      } catch (error) {
        throw new RelayConnectionError('request failed', { cause: String(error) });
      }
      if (!response.ok) throw await errorFromResponse(response);
      return (await response.json()) as T;
    },
  };
}

export function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const suffix = search.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export function scopeFrom(input: AuthScope): AuthScope {
  return normalizeScope(input);
}

export function buildAuthHeaders(supplierApiKey: string, scope: AuthScope, headers?: HeadersInit): Headers {
  const next = new Headers(headers);
  next.set('X-Supplier-API-Key', requiredString(supplierApiKey, 'supplierApiKey'));
  applyAuthScope(next, normalizeScope(scope));
  return next;
}

export function requiredString(value: string, field: string): string {
  if (typeof value !== 'string') throw new RelayValidationError(`${field} must be a string`, { field });
  const trimmed = value.trim();
  if (!trimmed) throw new RelayValidationError(`${field} must not be empty`, { field });
  return trimmed;
}

export function requireNonEmptyBody(value: string): string {
  if (typeof value !== 'string') throw new RelayValidationError('body must be a string', { field: 'body' });
  if (!value.trim()) throw new RelayValidationError('body must not be empty', { field: 'body' });
  return value;
}

export function optionalString(value: string | undefined, field: string): string | undefined {
  return value === undefined ? undefined : requiredString(value, field);
}

export function optionalIntegerInRange(value: number | undefined, field: string, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RelayValidationError(`${field} must be an integer between ${min} and ${max}`, { field, min, max });
  }
  return value;
}

export function optionalNonNegativeInteger(value: number | undefined, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 0) {
    throw new RelayValidationError(`${field} must be a non-negative integer`, { field });
  }
  return value;
}

function normalizeBaseUrl(value: string): string {
  const baseUrl = requiredString(value, 'baseUrl');
  return baseUrl.replace(/\/$/, '');
}

function normalizeScope(scope: AuthScope): AuthScope {
  const normalized: AuthScope = {};
  const deviceId = optionalString(scope.deviceId, 'deviceId');
  if (deviceId) normalized.deviceId = deviceId;
  const ownerUserId = optionalString(scope.ownerUserId, 'ownerUserId');
  if (ownerUserId) normalized.ownerUserId = ownerUserId;
  const appId = optionalString(scope.appId, 'appId');
  if (appId) normalized.appId = appId;
  return normalized;
}

function applyAuthScope(headers: Headers, scope: AuthScope): void {
  if (scope.deviceId) headers.set('X-Device-ID', scope.deviceId);
  if (scope.ownerUserId) headers.set('X-Owner-User-ID', scope.ownerUserId);
  if (scope.appId) headers.set('X-App-ID', scope.appId);
}
