import { describe, expect, it, vi } from 'vitest';
import {
  createRelayClient,
  isWhatsAppSendRejectedError,
  isMessageNewEvent,
  RelayAuthError,
  RelayConflictError,
  RelayEventStream,
  RelayRateLimitError,
  RelayValidationError,
} from './index';
import type { WebSocketLike } from './types';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function collectAsync<T>(source: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of source) values.push(value);
  return values;
}

describe('createRelayClient', () => {
  it('sends text with supplier key, device id, and owner headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message_id: 'msg_1', status: 'accepted', delivery_status: 'pending' }));
    const client = createRelayClient({ baseUrl: 'https://relay.example.com', supplierApiKey: 'sk_test', deviceId: 'watch_1', ownerUserId: 'user_1', fetch: fetchMock });

    await client.messages.sendText({ chatId: '123@s.whatsapp.net', body: '你好' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://relay.example.com/api/v1/chats/123%40s.whatsapp.net/messages');
    const headers = init.headers as Headers;
    expect(headers.get('X-Supplier-API-Key')).toBe('sk_test');
    expect(headers.get('X-Device-ID')).toBe('watch_1');
    expect(headers.get('X-Owner-User-ID')).toBe('user_1');
    expect(init.body).toBe(JSON.stringify({ msg_type: 'text', body: '你好' }));
  });

  it('fetches missed events by cursor', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ events: [{ event_type: 'message.new', cursor: 'cur_2' }], next_cursor: 'cur_2', has_more: false }));
    const client = createRelayClient({ baseUrl: 'https://relay.example.com/', supplierApiKey: 'sk_test', fetch: fetchMock });

    const result = await client.events.fetchMissed({ after: 'cur_1', limit: 50, sessionId: 'sess_1' });

    expect(result.next_cursor).toBe('cur_2');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://relay.example.com/api/v1/events?after=cur_1&limit=50&session_id=sess_1');
  });

  it('fetches current auth status with supplier and device scope only', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        phase: 'connected',
        recommended_action: 'show_connected',
        reason_code: 'ACTIVE_SESSION',
        can_start_bind: false,
        device_id: 'watch_1',
        device_binding: { bound: true, state: 'bound', session_id: 'sess_1' },
        session: { id: 'sess_1', status: 'connected' },
        server_time: '2026-06-08T00:00:00Z',
      }),
    );
    const client = createRelayClient({ baseUrl: 'https://relay.example.com', supplierApiKey: 'sk_test', deviceId: 'watch_1', fetch: fetchMock });

    const result = await client.auth.status();

    expect(result.reason_code).toBe('ACTIVE_SESSION');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://relay.example.com/api/v1/auth/status');
    const headers = init.headers as Headers;
    expect(headers.get('X-Supplier-API-Key')).toBe('sk_test');
    expect(headers.get('X-Device-ID')).toBe('watch_1');
    expect(headers.has('X-Owner-User-ID')).toBe(false);
  });

  it('starts and polls a bind dialog with device headers', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          binding_id: 'bind_1',
          session_id: 'sess_1',
          status: 'qr_ready',
          qr_code: 'qr',
          expires_at: '2026-06-08T00:01:00Z',
          poll_after_seconds: 5,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          binding_id: 'bind_1',
          session_id: 'sess_1',
          status: 'connected',
          poll_after_seconds: 5,
        }),
      );
    const client = createRelayClient({ baseUrl: 'https://relay.example.com', supplierApiKey: 'sk_test', deviceId: 'watch_1', ownerUserId: 'user_1', fetch: fetchMock });

    const start = await client.auth.startBind({ owner_context: { user_id: 'user_1' }, geo_hint: { country: 'US' } });
    const status = await client.auth.bindStatus({ bindingId: 'bind_1' });

    expect(start.poll_after_seconds).toBe(5);
    expect(status.status).toBe('connected');
    const [startUrl, startInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(startUrl).toBe('https://relay.example.com/api/v1/auth/bind/start');
    expect(startInit.method).toBe('POST');
    expect(startInit.body).toBe(JSON.stringify({ owner_context: { user_id: 'user_1' }, geo_hint: { country: 'US' } }));
    const startHeaders = startInit.headers as Headers;
    expect(startHeaders.get('X-Device-ID')).toBe('watch_1');
    expect(startHeaders.get('X-Owner-User-ID')).toBe('user_1');
    const [statusUrl, statusInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(statusUrl).toBe('https://relay.example.com/api/v1/auth/bind/status/bind_1');
    const statusHeaders = statusInit.headers as Headers;
    expect(statusHeaders.get('X-Device-ID')).toBe('watch_1');
  });

  it('preflights bind eligibility with owner context and device scope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        can_start_bind: true,
        recommended_action: 'start_bind',
        reason_code: 'NO_ACTIVE_SESSION',
        device_id: 'watch_1',
        owner_context: { user_id: 'user_1' },
      }),
    );
    const client = createRelayClient({ baseUrl: 'https://relay.example.com', supplierApiKey: 'sk_test', deviceId: 'watch_1', ownerUserId: 'user_1', fetch: fetchMock });

    const result = await client.auth.preflight({ owner_context: { user_id: 'user_1' }, geo_hint: { country: 'US' }, client_state: { cached_phase: 'unknown' } });

    expect(result.recommended_action).toBe('start_bind');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://relay.example.com/api/v1/auth/bind/preflight');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ owner_context: { user_id: 'user_1' }, geo_hint: { country: 'US' }, client_state: { cached_phase: 'unknown' } }));
    const headers = init.headers as Headers;
    expect(headers.get('X-Device-ID')).toBe('watch_1');
    expect(headers.get('X-Owner-User-ID')).toBe('user_1');
  });

  it('unbinds one session or all active supplier bindings', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, session_id: 'sess_1' }))
      .mockResolvedValueOnce(jsonResponse({ success: true, session_ids: ['sess_1', 'sess_2'], count: 2 }));
    const client = createRelayClient({ baseUrl: 'https://relay.example.com', supplierApiKey: 'sk_test', deviceId: 'watch_1', ownerUserId: 'user_1', fetch: fetchMock });

    await client.auth.unbind({ session_id: 'sess_1' });
    await client.auth.unbindAll();

    const [unbindUrl, unbindInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(unbindUrl).toBe('https://relay.example.com/api/v1/auth/unbind');
    expect(unbindInit.method).toBe('POST');
    expect(unbindInit.body).toBe(JSON.stringify({ session_id: 'sess_1' }));
    const headers = unbindInit.headers as Headers;
    expect(headers.get('X-Device-ID')).toBe('watch_1');

    const [unbindAllUrl, unbindAllInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(unbindAllUrl).toBe('https://relay.example.com/api/v1/auth/unbind');
    expect(unbindAllInit.body).toBe(JSON.stringify({}));
  });

  it('logs out a WhatsApp linked device explicitly', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, session_id: 'sess_1', device_binding: { bound: false, state: 'unbound' } }));
    const client = createRelayClient({ baseUrl: 'https://relay.example.com', supplierApiKey: 'sk_test', deviceId: 'watch_1', ownerUserId: 'user_1', fetch: fetchMock });

    const result = await client.auth.logout({ session_id: 'sess_1' });

    expect(result.device_binding?.state).toBe('unbound');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://relay.example.com/api/v1/auth/logout');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ session_id: 'sess_1' }));
    const headers = init.headers as Headers;
    expect(headers.get('X-Device-ID')).toBe('watch_1');
    expect(headers.get('X-Owner-User-ID')).toBe('user_1');
  });

  it('mints event tokens without putting supplier key in the body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ token: 'evt_token', expires_at: '2026-06-08T00:05:00Z' }));
    const client = createRelayClient({ baseUrl: 'https://relay.example.com', supplierApiKey: 'sk_test', fetch: fetchMock });

    const result = await client.auth.mintEventToken({ session_id: 'sess_1', ttl_seconds: 120, deviceId: 'watch_1', ownerUserId: 'user_1' });

    expect(result.token).toBe('evt_token');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://relay.example.com/api/v1/auth/events/token');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ session_id: 'sess_1', ttl_seconds: 120 }));
    const headers = init.headers as Headers;
    expect(headers.get('X-Supplier-API-Key')).toBe('sk_test');
    expect(headers.get('X-Device-ID')).toBe('watch_1');
    expect(headers.get('X-Owner-User-ID')).toBe('user_1');
  });

  it('fetches account profile with optional session id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        session_id: 'sess_1',
        device_id: 'watch_1',
        status: 'connected',
        phone: '+15551234567',
        wa_jid: '15551234567@s.whatsapp.net',
        avatar: null,
        contact: {
          wa_me_url: 'https://wa.me/15551234567',
          qr_payload: 'https://wa.me/qr/native-code',
          qr_image_url: '/api/v1/account/profile/qr.png?session_id=sess_1&size=512',
          qr_kind: 'native_contact_qr',
        },
        updated_at: '2026-06-08T00:00:00Z',
      }),
    );
    const client = createRelayClient({ baseUrl: 'https://relay.example.com', supplierApiKey: 'sk_test', deviceId: 'watch_1', fetch: fetchMock });

    const result = await client.account.profile({ sessionId: 'sess_1', qrBase64: true });

    expect(result.contact.qr_payload).toBe('https://wa.me/qr/native-code');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://relay.example.com/api/v1/account/profile?session_id=sess_1&qr_base64=true');
    const headers = init.headers as Headers;
    expect(headers.get('X-Supplier-API-Key')).toBe('sk_test');
    expect(headers.get('X-Device-ID')).toBe('watch_1');
  });

  it('lists, gets, and deletes sessions', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([{ id: 'sess_1', status: 'connected', created_at: '2026-06-08T00:00:00Z' }]))
      .mockResolvedValueOnce(jsonResponse({ id: 'sess_1', status: 'connected', created_at: '2026-06-08T00:00:00Z' }))
      .mockResolvedValueOnce(jsonResponse({ success: true, deleted_id: 'sess_1' }));
    const client = createRelayClient({ baseUrl: 'https://relay.example.com', supplierApiKey: 'sk_test', fetch: fetchMock });

    const sessions = await client.sessions.list({ status: 'connected', limit: 20, offset: 5 });
    const session = await client.sessions.get({ sessionId: 'sess_1' });
    const deleted = await client.sessions.delete({ sessionId: 'sess_1' });

    expect(sessions[0]?.id).toBe('sess_1');
    expect(session.status).toBe('connected');
    expect(deleted.deleted_id).toBe('sess_1');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://relay.example.com/api/v1/sessions?status=connected&limit=20&offset=5');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://relay.example.com/api/v1/sessions/sess_1');
    const [deleteUrl, deleteInit] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(deleteUrl).toBe('https://relay.example.com/api/v1/sessions/sess_1');
    expect(deleteInit.method).toBe('DELETE');
  });

  it('lists chats and messages with device scope', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([{ id: '123@s.whatsapp.net', chat_type: 'dm', name: 'Alice' }]))
      .mockResolvedValueOnce(jsonResponse([{ id: 'msg_1', direction: 'inbound', msg_type: 'text', status: 'delivered', body: 'hi', created_at: '2026-06-08T00:00:00Z' }]));
    const client = createRelayClient({ baseUrl: 'https://relay.example.com', supplierApiKey: 'sk_test', deviceId: 'watch_1', fetch: fetchMock });

    await client.chats.list({ sessionId: 'sess_1', chat_type: 'dm', limit: 10, offset: 0 });
    await client.messages.listInChat({ chatId: '123@s.whatsapp.net', sessionId: 'sess_1', before: '2026-06-08T00:00:00Z', limit: 10 });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://relay.example.com/api/v1/chats?session_id=sess_1&chat_type=dm&limit=10&offset=0');
    const headers = (fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Headers;
    expect(headers.get('X-Device-ID')).toBe('watch_1');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://relay.example.com/api/v1/chats/123%40s.whatsapp.net/messages?session_id=sess_1&before=2026-06-08T00%3A00%3A00Z&limit=10');
  });

  it('resolves recipients and sends text by recipient when unambiguous', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ query: '15551234567', ambiguous: false, matches: [{ jid: '15551234567@s.whatsapp.net', type: 'contact', display_name: 'Alice', chat_id: '15551234567@s.whatsapp.net', confidence: 1 }] }))
      .mockResolvedValueOnce(jsonResponse({ message_id: 'msg_1', status: 'accepted', delivery_status: 'pending' }));
    const client = createRelayClient({ baseUrl: 'https://relay.example.com', supplierApiKey: 'sk_test', deviceId: 'watch_1', fetch: fetchMock });

    await client.messages.sendTextTo({ recipient: '15551234567', body: 'hello', sessionId: 'sess_1' });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://relay.example.com/api/v1/contacts/resolve?session_id=sess_1&query=15551234567');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://relay.example.com/api/v1/chats/15551234567%40s.whatsapp.net/messages?session_id=sess_1');
    const sendInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(sendInit.body).toBe(JSON.stringify({ msg_type: 'text', body: 'hello', recipient_jid: '15551234567@s.whatsapp.net', session_id: 'sess_1' }));
  });

  it('refuses ambiguous recipient sends', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ query: 'Alice', ambiguous: true, matches: [{ jid: '1@s.whatsapp.net', type: 'contact', display_name: 'Alice A', confidence: 0.8 }] }));
    const client = createRelayClient({ baseUrl: 'https://relay.example.com', supplierApiKey: 'sk_test', fetch: fetchMock });

    await expect(client.messages.sendTextTo({ recipient: 'Alice', body: 'hello' })).rejects.toThrow(RelayConflictError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends replies with quote metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message_id: 'msg_2', status: 'accepted', delivery_status: 'pending' }));
    const client = createRelayClient({ baseUrl: 'https://relay.example.com', supplierApiKey: 'sk_test', fetch: fetchMock });

    await client.messages.sendReply({ chatId: '123@s.whatsapp.net', body: 'reply', reply_to_message_id: 'msg_1' });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBe(JSON.stringify({ msg_type: 'reply', body: 'reply', reply_to_message_id: 'msg_1' }));
  });

  it('catches up event pages until the server cursor head', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ events: [{ event_id: 'evt_1', event_type: 'message.new', cursor: 'cur_1', timestamp: '2026-06-08T00:00:00Z', data: { body: 'hi' } }], next_cursor: 'cur_1', has_more: true }))
      .mockResolvedValueOnce(jsonResponse({ events: [{ event_id: 'evt_2', event_type: 'heartbeat', cursor: 'cur_2', timestamp: '2026-06-08T00:00:01Z', data: { server_time: '2026-06-08T00:00:01Z' } }], next_cursor: 'cur_2', has_more: false }));
    const client = createRelayClient({ baseUrl: 'https://relay.example.com', supplierApiKey: 'sk_test', fetch: fetchMock });

    const events = await collectAsync(client.events.catchUp({ after: 'cur_0', limit: 1 }));

    expect(events.map((event) => event.event_id)).toEqual(['evt_1', 'evt_2']);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://relay.example.com/api/v1/events?after=cur_0&limit=1');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://relay.example.com/api/v1/events?after=cur_1&limit=1');
  });

  it('throws mapped API error subclasses', async () => {
    const validationFetch = vi.fn().mockResolvedValue(jsonResponse({ code: 'INVALID_REQUEST', message: 'bad input', retryable: false }, 400));
    const authFetch = vi.fn().mockResolvedValue(jsonResponse({ code: 'UNAUTHORIZED', message: 'bad key', retryable: false }, 401));
    const rateFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 'RATE_LIMITED', message: 'slow down', retryable: true }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': '12' },
      }),
    );

    await expect(createRelayClient({ baseUrl: 'https://relay.example.com', supplierApiKey: 'sk_test', fetch: validationFetch }).events.fetchMissed()).rejects.toMatchObject({ name: 'RelayValidationError', status: 400 });
    await expect(createRelayClient({ baseUrl: 'https://relay.example.com', supplierApiKey: 'sk_test', fetch: authFetch }).events.fetchMissed()).rejects.toThrow(RelayAuthError);
    await expect(createRelayClient({ baseUrl: 'https://relay.example.com', supplierApiKey: 'sk_test', fetch: rateFetch }).events.fetchMissed()).rejects.toMatchObject({ name: 'RelayRateLimitError', retryAfterSeconds: 12 });
  });

  it('throws typed retryable API errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ code: 'SEND_TIMEOUT', message: '发送超时', retryable: true, details: { reason: 'timeout', retry_after_seconds: 8 } }, 504));
    const client = createRelayClient({ baseUrl: 'https://relay.example.com', supplierApiKey: 'sk_test', fetch: fetchMock });

    await expect(client.events.fetchMissed()).rejects.toMatchObject({ name: 'RelayApiError', status: 504, code: 'SEND_TIMEOUT', retryable: true, retryAfterSeconds: 8, message: '发送超时' });
  });

  it('exposes the canonical WhatsApp send rejected recovery contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'WHATSAPP_SEND_REJECTED',
          message: 'WhatsApp rejected the message recipient',
          retryable: true,
          details: {
            failure_code: 'WHATSAPP_SEND_REJECTED',
            trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
            request_id: 'req_123',
            recommended_action: 'retry_send_after_recovery',
            recovery: 'privacy_token_refresh_started',
            retry_after_seconds: 3,
            privacy_token_status: 'missing',
            attempted_recipients: ['38543741202681@lid', '8615838371220@s.whatsapp.net'],
          },
        }),
        { status: 409, headers: { 'Content-Type': 'application/json', 'Retry-After': '3' } },
      ),
    );
    const client = createRelayClient({ baseUrl: 'https://relay.example.com', supplierApiKey: 'sk_test', fetch: fetchMock });

    let caught: unknown;
    try {
      await client.messages.sendText({ chatId: '38543741202681@lid', body: 'hello' });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RelayConflictError);
    expect(isWhatsAppSendRejectedError(caught)).toBe(true);
    if (!isWhatsAppSendRejectedError(caught)) throw new Error('expected WhatsApp send rejected error');
    expect(caught.retryAfterSeconds).toBe(3);
    expect(caught.failureCode).toBe('WHATSAPP_SEND_REJECTED');
    expect(caught.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(caught.requestId).toBe('req_123');
    expect(caught.details.recommended_action).toBe('retry_send_after_recovery');
    expect(caught.details.recovery).toBe('privacy_token_refresh_started');
    expect(caught.details.privacy_token_status).toBe('missing');
  });

  it('validates required config and request fields before fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));

    expect(() => createRelayClient({ baseUrl: ' ', supplierApiKey: 'sk_test', fetch: fetchMock })).toThrow(RelayValidationError);
    expect(() => createRelayClient({ baseUrl: 'https://relay.example.com', supplierApiKey: ' ', fetch: fetchMock })).toThrow(RelayValidationError);

    const client = createRelayClient({ baseUrl: 'https://relay.example.com', supplierApiKey: 'sk_test', fetch: fetchMock });

    expect(() => client.auth.bindStatus({ bindingId: ' ' })).toThrow(RelayValidationError);
    expect(() => client.auth.logout({ session_id: ' ' })).toThrow(RelayValidationError);
    expect(() => client.messages.sendText({ chatId: '123@s.whatsapp.net', body: ' ' })).toThrow(RelayValidationError);
    expect(() => client.auth.mintEventToken({ ttl_seconds: 301 })).toThrow(RelayValidationError);
    expect(() => client.sessions.get({ sessionId: ' ' })).toThrow(RelayValidationError);
    expect(() => client.sessions.list({ limit: 101 })).toThrow(RelayValidationError);
    expect(() => client.sessions.list({ offset: -1 })).toThrow(RelayValidationError);
    expect(() => client.chats.list({ limit: 101 })).toThrow(RelayValidationError);
    expect(() => client.contacts.resolve({ query: ' ' })).toThrow(RelayValidationError);
    expect(() => client.messages.listInChat({ chatId: ' ', limit: 10 })).toThrow(RelayValidationError);
    expect(() => client.messages.sendReply({ chatId: '123@s.whatsapp.net', body: 'ok', reply_to_message_id: ' ' })).toThrow(RelayValidationError);
    expect(() => client.events.fetchPage({ limit: 501 })).toThrow(RelayValidationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates websocket event stream with event token', () => {
    const sockets: string[] = [];
    const socket: WebSocketLike = { onopen: null, onmessage: null, onerror: null, onclose: null, close: vi.fn() };
    const client = createRelayClient({
      baseUrl: 'https://relay.example.com',
      supplierApiKey: 'sk_test',
      webSocketFactory: (url) => {
        sockets.push(url);
        return socket;
      },
    });

    const stream = client.events.subscribe({ eventToken: 'evt_token', sessionId: 'sess_1' });

    expect(stream).toBeInstanceOf(RelayEventStream);
    expect(sockets[0]).toBe('wss://relay.example.com/ws/v1/events?event_token=evt_token');
  });

  it('creates websocket event stream with replay cursor', () => {
    const sockets: string[] = [];
    const socket: WebSocketLike = { onopen: null, onmessage: null, onerror: null, onclose: null, close: vi.fn() };
    const client = createRelayClient({
      baseUrl: 'https://relay.example.com',
      supplierApiKey: 'sk_test',
      webSocketFactory: (url) => {
        sockets.push(url);
        return socket;
      },
    });

    client.events.subscribe({ eventToken: 'evt_token', sessionId: 'sess_1', after: 'cur_1' });

    expect(sockets[0]).toBe('wss://relay.example.com/ws/v1/events?event_token=evt_token&after=cur_1');
  });

  it('creates websocket event stream with auth headers when using header mode', () => {
    const sockets: string[] = [];
    const initHeaders: Headers[] = [];
    const socket: WebSocketLike = { onopen: null, onmessage: null, onerror: null, onclose: null, close: vi.fn() };
    const client = createRelayClient({
      baseUrl: 'https://relay.example.com',
      supplierApiKey: 'sk_test',
      deviceId: 'watch_1',
      ownerUserId: 'user_1',
      webSocketFactory: (url, init) => {
        sockets.push(url);
        if (init?.headers) initHeaders.push(new Headers(init.headers));
        return socket;
      },
    });

    client.events.subscribe({ sessionId: 'sess_1' });

    expect(sockets[0]).toBe('wss://relay.example.com/ws/v1/events?session_id=sess_1');
    expect(initHeaders[0]?.get('X-Supplier-API-Key')).toBe('sk_test');
    expect(initHeaders[0]?.get('X-Device-ID')).toBe('watch_1');
    expect(initHeaders[0]?.get('X-Owner-User-ID')).toBe('user_1');
  });

  it('streams events with async backpressure and stream helpers', async () => {
    const source = (async function* () {
      yield { event_id: 'evt_1', event_type: 'heartbeat', timestamp: '2026-06-08T00:00:00Z', data: {} };
      yield { event_id: 'evt_2', event_type: 'message.new', timestamp: '2026-06-08T00:00:01Z', data: { body: 'hi' } };
      yield { event_id: 'evt_3', event_type: 'message.new', timestamp: '2026-06-08T00:00:02Z', data: { body: 'again' } };
    })();
    const stream = new RelayEventStream(source);
    const bodies = await collectAsync(stream.filter(isMessageNewEvent).map((event) => event.data.body).take(2));

    expect(bodies).toEqual(['hi', 'again']);

    const callbackOrder: string[] = [];
    const callbackStream = new RelayEventStream(
      (async function* () {
        yield { event_id: 'evt_4', event_type: 'message.new', timestamp: '2026-06-08T00:00:03Z', data: { body: 'first' } };
        yield { event_id: 'evt_5', event_type: 'message.new', timestamp: '2026-06-08T00:00:04Z', data: { body: 'second' } };
      })(),
    );
    callbackStream.on(async (event) => {
      callbackOrder.push(`start:${event.event_id}`);
      await Promise.resolve();
      callbackOrder.push(`end:${event.event_id}`);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(callbackOrder).toEqual(['start:evt_4', 'end:evt_4', 'start:evt_5', 'end:evt_5']);
  });

  it('surfaces websocket parse errors to stream consumers', async () => {
    const socket: WebSocketLike = { onopen: null, onmessage: null, onerror: null, onclose: null, close: vi.fn() };
    const stream = new RelayEventStream(socket);
    const next = stream[Symbol.asyncIterator]().next();

    socket.onmessage?.({ data: '{bad json' } as MessageEvent);

    await expect(next).rejects.toMatchObject({ name: 'RelayConnectionError' });
  });
});
