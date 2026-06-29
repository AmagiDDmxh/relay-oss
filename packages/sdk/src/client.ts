import { RelayEventStream } from './events';
import { RelayConflictError, RelayValidationError } from './errors';
import { buildAuthHeaders, createRequester, optionalIntegerInRange, optionalNonNegativeInteger, requireNonEmptyBody, requiredString, scopeFrom, withQuery } from './internal';
import type {
  AccountProfileInput,
  AccountProfileResponse,
  BindPreflightInput,
  BindPreflightResponse,
  BindStartInput,
  BindStartResponse,
  BindStatusInput,
  BindStatusResponse,
  DeleteResponse,
  DeleteSessionInput,
  AuthStatusInput,
  AuthStatusResponse,
  CatchUpEventsInput,
  ChatResponse,
  EventTokenInput,
  EventTokenResponse,
  FetchEventsInput,
  FetchEventsResponse,
  GetSessionInput,
  ListChatsInput,
  ListMessagesInput,
  ListSessionsInput,
  LogoutInput,
  MessageResponse,
  RecipientResolveResponse,
  RelayClientConfig,
  SessionResponse,
  ResolveRecipientInput,
  SendReplyInput,
  SendMessageResponse,
  SendTextInput,
  SendTextToInput,
  SubscribeEventsInput,
  UnbindInput,
  UnbindResponse,
} from './types';

export interface RelayClient {
  auth: {
    status(input?: AuthStatusInput): Promise<AuthStatusResponse>;
    preflight(input: BindPreflightInput): Promise<BindPreflightResponse>;
    startBind(input?: BindStartInput): Promise<BindStartResponse>;
    bindStatus(input: BindStatusInput): Promise<BindStatusResponse>;
    unbind(input?: UnbindInput): Promise<UnbindResponse>;
    unbindAll(input?: Omit<UnbindInput, 'session_id'>): Promise<UnbindResponse>;
    logout(input?: LogoutInput): Promise<UnbindResponse>;
    mintEventToken(input?: EventTokenInput): Promise<EventTokenResponse>;
  };
  account: {
    profile(input?: AccountProfileInput): Promise<AccountProfileResponse>;
  };
  sessions: {
    list(input?: ListSessionsInput): Promise<SessionResponse[]>;
    get(input: GetSessionInput): Promise<SessionResponse>;
    delete(input: DeleteSessionInput): Promise<DeleteResponse>;
  };
  chats: {
    list(input?: ListChatsInput): Promise<ChatResponse[]>;
  };
  contacts: {
    resolve(input: ResolveRecipientInput): Promise<RecipientResolveResponse>;
  };
  messages: {
    listInChat(input: ListMessagesInput): Promise<MessageResponse[]>;
    sendText(input: SendTextInput): Promise<SendMessageResponse>;
    sendReply(input: SendReplyInput): Promise<SendMessageResponse>;
    sendTextTo(input: SendTextToInput): Promise<SendMessageResponse>;
  };
  events: {
    fetchPage(input?: FetchEventsInput): Promise<FetchEventsResponse>;
    fetchMissed(input?: FetchEventsInput): Promise<FetchEventsResponse>;
    catchUp(input?: CatchUpEventsInput): AsyncIterable<import('./types').RelayEvent>;
    subscribe(input?: SubscribeEventsInput): RelayEventStream;
  };
}

export function createRelayClient(config: RelayClientConfig): RelayClient {
  const requester = createRequester(config);
  const baseUrl = requiredString(config.baseUrl, 'baseUrl').replace(/\/$/, '');
  const defaultScope: { deviceId?: string; ownerUserId?: string; appId?: string } = {};
  if (config.deviceId) defaultScope.deviceId = config.deviceId;
  if (config.ownerUserId) defaultScope.ownerUserId = config.ownerUserId;
  if (config.appId) defaultScope.appId = config.appId;

  function fetchEventsPage(input: FetchEventsInput = {}): Promise<FetchEventsResponse> {
    return requester.request<FetchEventsResponse>(
      withQuery('/api/v1/events', {
        after: input.after,
        limit: optionalIntegerInRange(input.limit, 'limit', 1, 500),
        session_id: input.sessionId,
      }),
    );
  }

  function resolveRecipient(input: ResolveRecipientInput): Promise<RecipientResolveResponse> {
    const query = requiredString(input.query, 'query');
    return requester.request<RecipientResolveResponse>(
      withQuery('/api/v1/contacts/resolve', {
        session_id: input.sessionId,
        query,
        limit: optionalIntegerInRange(input.limit, 'limit', 1, 20),
      }),
      { scope: scopeFrom(input) },
    );
  }

  function sendText(input: SendTextInput): Promise<SendMessageResponse> {
    const chatId = requiredString(input.chatId, 'chatId');
    const body: Record<string, unknown> = {
      msg_type: 'text',
      body: requireNonEmptyBody(input.body),
    };
    if (input.recipient_jid) body.recipient_jid = requiredString(input.recipient_jid, 'recipient_jid');
    if (input.mention_jids) body.mention_jids = input.mention_jids;
    if (input.sessionId) body.session_id = input.sessionId;
    return requester.request<SendMessageResponse>(
      withQuery(`/api/v1/chats/${encodeURIComponent(chatId)}/messages`, {
        session_id: input.sessionId,
      }),
      {
        method: 'POST',
        body: JSON.stringify(body),
        scope: scopeFrom(input),
      },
    );
  }

  return {
    auth: {
      status(input = {}) {
        return requester.request<AuthStatusResponse>('/api/v1/auth/status', {
          scope: scopeFrom(input),
        });
      },
      preflight(input) {
        const body: Record<string, unknown> = {
          owner_context: input.owner_context,
        };
        if (input.geo_hint) body.geo_hint = input.geo_hint;
        if (input.client_state) body.client_state = input.client_state;
        return requester.request<BindPreflightResponse>('/api/v1/auth/bind/preflight', {
          method: 'POST',
          body: JSON.stringify(body),
          scope: scopeFrom(input),
        });
      },
      startBind(input = {}) {
        const body: Record<string, unknown> = {};
        if (input.owner_context) body.owner_context = input.owner_context;
        if (input.geo_hint) body.geo_hint = input.geo_hint;
        if (input.proxy_address) body.proxy_address = input.proxy_address;
        return requester.request<BindStartResponse>('/api/v1/auth/bind/start', {
          method: 'POST',
          body: JSON.stringify(body),
          scope: scopeFrom(input),
        });
      },
      bindStatus(input) {
        const bindingId = requiredString(input.bindingId, 'bindingId');
        return requester.request<BindStatusResponse>(`/api/v1/auth/bind/status/${encodeURIComponent(bindingId)}`, {
          scope: scopeFrom(input),
        });
      },
      unbind(input = {}) {
        const body: Record<string, unknown> = {};
        if (input.session_id) body.session_id = requiredString(input.session_id, 'session_id');
        return requester.request<UnbindResponse>('/api/v1/auth/unbind', {
          method: 'POST',
          body: JSON.stringify(body),
          scope: scopeFrom(input),
        });
      },
      unbindAll(input = {}) {
        return requester.request<UnbindResponse>('/api/v1/auth/unbind', {
          method: 'POST',
          body: JSON.stringify({}),
          scope: scopeFrom(input),
        });
      },
      logout(input = {}) {
        const body: Record<string, unknown> = {};
        if (input.session_id) body.session_id = requiredString(input.session_id, 'session_id');
        return requester.request<UnbindResponse>('/api/v1/auth/logout', {
          method: 'POST',
          body: JSON.stringify(body),
          scope: scopeFrom(input),
        });
      },
      mintEventToken(input = {}) {
        const body: EventTokenInput = {};
        if (input.session_id) body.session_id = requiredString(input.session_id, 'session_id');
        const ttlSeconds = optionalIntegerInRange(input.ttl_seconds, 'ttl_seconds', 1, 300);
        if (ttlSeconds !== undefined) body.ttl_seconds = ttlSeconds;
        return requester.request<EventTokenResponse>('/api/v1/auth/events/token', {
          method: 'POST',
          body: JSON.stringify(body),
          scope: scopeFrom(input),
        });
      },
    },
    account: {
      profile(input = {}) {
        return requester.request<AccountProfileResponse>(
          withQuery('/api/v1/account/profile', {
            session_id: input.sessionId,
            qr_base64: input.qrBase64 ? 'true' : undefined,
          }),
          { scope: scopeFrom(input) },
        );
      },
    },
    sessions: {
      list(input = {}) {
        return requester.request<SessionResponse[]>(
          withQuery('/api/v1/sessions', {
            status: input.status,
            limit: optionalIntegerInRange(input.limit, 'limit', 1, 100),
            offset: optionalNonNegativeInteger(input.offset, 'offset'),
          }),
        );
      },
      get(input) {
        const sessionId = requiredString(input.sessionId, 'sessionId');
        return requester.request<SessionResponse>(`/api/v1/sessions/${encodeURIComponent(sessionId)}`);
      },
      delete(input) {
        const sessionId = requiredString(input.sessionId, 'sessionId');
        return requester.request<DeleteResponse>(`/api/v1/sessions/${encodeURIComponent(sessionId)}`, {
          method: 'DELETE',
        });
      },
    },
    chats: {
      list(input = {}) {
        return requester.request<ChatResponse[]>(
          withQuery('/api/v1/chats', {
            session_id: input.sessionId,
            chat_type: input.chat_type,
            limit: optionalIntegerInRange(input.limit, 'limit', 1, 100),
            offset: optionalNonNegativeInteger(input.offset, 'offset'),
          }),
          { scope: scopeFrom(input) },
        );
      },
    },
    contacts: {
      resolve: resolveRecipient,
    },
    messages: {
      listInChat(input) {
        const chatId = requiredString(input.chatId, 'chatId');
        return requester.request<MessageResponse[]>(
          withQuery(`/api/v1/chats/${encodeURIComponent(chatId)}/messages`, {
            session_id: input.sessionId,
            before: input.before,
            limit: optionalIntegerInRange(input.limit, 'limit', 1, 100),
          }),
          { scope: scopeFrom(input) },
        );
      },
      sendText,
      sendReply(input) {
        const chatId = requiredString(input.chatId, 'chatId');
        const replyToMessageId = requiredString(input.reply_to_message_id, 'reply_to_message_id');
        const body: Record<string, unknown> = {
          msg_type: 'reply',
          body: requireNonEmptyBody(input.body),
          reply_to_message_id: replyToMessageId,
        };
        if (input.recipient_jid) body.recipient_jid = requiredString(input.recipient_jid, 'recipient_jid');
        if (input.mention_jids) body.mention_jids = input.mention_jids;
        if (input.sessionId) body.session_id = input.sessionId;
        return requester.request<SendMessageResponse>(
          withQuery(`/api/v1/chats/${encodeURIComponent(chatId)}/messages`, {
            session_id: input.sessionId,
          }),
          {
            method: 'POST',
            body: JSON.stringify(body),
            scope: scopeFrom(input),
          },
        );
      },
      async sendTextTo(input) {
        const resolveInput: ResolveRecipientInput = { query: input.recipient };
        if (input.sessionId) resolveInput.sessionId = input.sessionId;
        if (input.deviceId) resolveInput.deviceId = input.deviceId;
        if (input.ownerUserId) resolveInput.ownerUserId = input.ownerUserId;
        if (input.appId) resolveInput.appId = input.appId;
        const resolved = await resolveRecipient(resolveInput);
        if (resolved.ambiguous || resolved.matches.length !== 1) {
          throw new RelayConflictError('recipient is ambiguous', {
            status: 0,
            code: 'AMBIGUOUS_RECIPIENT',
            retryable: false,
            details: { query: resolved.query, matches: resolved.matches },
          });
        }
        const match = resolved.matches[0];
        if (!match) {
          throw new RelayConflictError('recipient was not resolved', {
            status: 0,
            code: 'AMBIGUOUS_RECIPIENT',
            retryable: false,
            details: { query: resolved.query, matches: resolved.matches },
          });
        }
        const sendInput: SendTextInput = {
          chatId: match.chat_id ?? match.jid,
          body: input.body,
          recipient_jid: match.jid,
        };
        if (input.mention_jids) sendInput.mention_jids = input.mention_jids;
        if (input.sessionId) sendInput.sessionId = input.sessionId;
        if (input.deviceId) sendInput.deviceId = input.deviceId;
        if (input.ownerUserId) sendInput.ownerUserId = input.ownerUserId;
        if (input.appId) sendInput.appId = input.appId;
        return sendText(sendInput);
      },
    },
    events: {
      fetchPage: fetchEventsPage,
      fetchMissed(input = {}) {
        return fetchEventsPage(input);
      },
      async *catchUp(input = {}) {
        let after = input.after;
        for (;;) {
          const pageInput: FetchEventsInput = {};
          if (after) pageInput.after = after;
          if (input.limit !== undefined) pageInput.limit = input.limit;
          if (input.sessionId) pageInput.sessionId = input.sessionId;
          const page = await fetchEventsPage(pageInput);
          for (const event of page.events) yield event;
          if (!page.has_more || !page.next_cursor) break;
          after = page.next_cursor;
        }
      },
      subscribe(input = {}) {
        const hasCustomWebSocketFactory = config.webSocketFactory !== undefined;
        const wsFactory = config.webSocketFactory ?? ((url: string) => new WebSocket(url));
        const wsBase = baseUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
        const params = new URLSearchParams();
        if (input.eventToken) {
          params.set('event_token', input.eventToken);
          if (input.after) params.set('after', input.after);
        } else if (input.supplierApiKeyInQuery) {
          if (input.after) params.set('after', input.after);
          if (input.sessionId) params.set('session_id', input.sessionId);
          params.set('supplier_api_key', config.supplierApiKey);
        } else if (hasCustomWebSocketFactory) {
          if (input.after) params.set('after', input.after);
          if (input.sessionId) params.set('session_id', input.sessionId);
        } else {
          throw new RelayValidationError(
            'events.subscribe requires eventToken or supplierApiKeyInQuery when using the default browser WebSocket factory',
            { field: 'eventToken' },
          );
        }
        const suffix = params.toString() ? `?${params}` : '';
        const headers = input.eventToken || input.supplierApiKeyInQuery || !hasCustomWebSocketFactory ? undefined : buildAuthHeaders(config.supplierApiKey, defaultScope);
        const stream = new RelayEventStream(wsFactory(`${wsBase}/ws/v1/events${suffix}`, headers ? { headers } : undefined));
        input.signal?.addEventListener('abort', () => void stream.close(), { once: true });
        return stream;
      },
    },
  };
}
