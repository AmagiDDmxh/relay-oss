export type MessageStatus = 'accepted' | 'sent' | 'delivered' | 'read' | 'failed' | 'revoked';
export type SessionStatus = 'pending' | 'qr_ready' | 'connected' | 'disconnected' | 'relogin_required' | 'expired' | string;
export type ChatType = 'dm' | 'group' | string;
export type MessageType =
  | 'text'
  | 'reply'
  | 'image'
  | 'voice'
  | 'video'
  | 'document'
  | 'sticker'
  | 'contact'
  | 'location'
  | 'reaction'
  | 'poll'
  | 'poll_update'
  | 'call_log'
  | 'scheduled_call'
  | 'scheduled_call_update'
  | 'protocol'
  | 'unsupported'
  | string;
export type ExtensibleString<T extends string> = T | (string & {});
export type SendFailureRecommendedAction = ExtensibleString<'retry_send' | 'retry_send_after_recovery' | 'wait_reconnect' | 'retry_after'>;
export type WhatsAppSendRejectedRecommendedAction = 'retry_send_after_recovery';
export type SendFailureRecovery = ExtensibleString<'privacy_token_refresh_started'>;
export type PrivacyTokenStatus = ExtensibleString<'available' | 'missing' | 'expired' | 'unavailable'>;

export interface RelayClientConfig {
  baseUrl: string;
  supplierApiKey: string;
  deviceId?: string;
  ownerUserId?: string;
  appId?: string;
  fetch?: typeof fetch;
  webSocketFactory?: (url: string, init?: WebSocketRequestInit) => WebSocketLike;
}

export interface SendTextInput {
  chatId: string;
  body: string;
  recipient_jid?: string;
  mention_jids?: string[];
  deviceId?: string;
  ownerUserId?: string;
  appId?: string;
  sessionId?: string;
}

export interface SendReplyInput extends SendTextInput {
  reply_to_message_id: string;
}

export interface SendTextToInput {
  recipient: string;
  body: string;
  deviceId?: string;
  ownerUserId?: string;
  appId?: string;
  sessionId?: string;
  mention_jids?: string[];
}

export interface SendMessageResponse {
  message_id: string;
  status: 'accepted';
  delivery_status: 'pending';
  created_at?: string;
  wa_msg_id?: string;
  session_id?: string;
  trace_id?: string;
  request_id?: string;
}

export interface SendFailureDetails extends Record<string, unknown> {
  phase?: string;
  session_status?: string;
  recommended_action?: SendFailureRecommendedAction;
  auth_recommended_action?: string;
  reason_code?: string;
  session_id?: string;
  chat_id?: string;
  resolved_recipient?: string;
  attempted_recipients?: string[];
  reason?: string;
  failure_code?: string;
  trace_id?: string;
  request_id?: string;
  retry_after_seconds?: number;
  recovery?: SendFailureRecovery;
  wa_recipient?: string;
  lid_recipient?: string;
  pn_recipient?: string;
  privacy_token_status?: PrivacyTokenStatus;
  privacy_token_jid?: string;
  privacy_token_timestamp?: string;
}

export interface WhatsAppSendRejectedDetails extends SendFailureDetails {
  recommended_action: WhatsAppSendRejectedRecommendedAction;
  recovery: 'privacy_token_refresh_started';
  retry_after_seconds: number;
}

export interface OwnerContext {
  user_id?: string;
  app_id?: string;
}

export interface GeoHint {
  country?: string;
  region?: string;
  city?: string;
  timezone?: string;
}

export interface BindStartInput {
  deviceId?: string;
  ownerUserId?: string;
  appId?: string;
  owner_context?: OwnerContext;
  geo_hint?: GeoHint;
  proxy_address?: string;
}

export interface BindPreflightInput {
  deviceId?: string;
  ownerUserId?: string;
  appId?: string;
  owner_context: OwnerContext;
  geo_hint?: GeoHint;
  client_state?: Record<string, unknown>;
}

export interface BindPreflightResponse {
  can_start_bind: boolean;
  recommended_action: string;
  reason_code: string;
  device_id: string;
  owner_context: OwnerContext;
  binding?: Record<string, unknown> | null;
  session?: AuthStatusSession | null;
  server_time?: string;
}

export interface BindStartResponse {
  binding_id: string;
  session_id: string;
  device_id?: string;
  owner_context?: OwnerContext;
  status: string;
  qr_code?: string;
  expires_at?: string;
  poll_after_seconds: number;
  attempt_id?: string;
  attempt_seq?: number;
  created_at?: string;
  updated_at?: string;
}

export interface BindStatusInput {
  bindingId: string;
  deviceId?: string;
  ownerUserId?: string;
  appId?: string;
}

export interface BindStatusResponse {
  binding_id: string;
  status: string;
  session_id?: string;
  device_id?: string;
  owner_context?: OwnerContext;
  phone?: string;
  error?: string;
  poll_after_seconds: number;
  attempt_id?: string;
  attempt_seq?: number;
  created_at?: string;
  updated_at?: string;
}

export interface DeviceBindingStatus {
  bound: boolean;
  state: 'bound' | 'unbound' | 'binding' | 'unknown' | string;
  session_id?: string;
}

export interface AuthStatusSession {
  id: string;
  status: string;
  phone?: string;
  wa_jid?: string;
  updated_at?: string;
}

export interface AuthStatusResponse {
  phase: string;
  recommended_action: string;
  reason_code: string;
  can_start_bind: boolean;
  device_id: string;
  owner_context?: OwnerContext;
  device_binding: DeviceBindingStatus;
  binding?: Record<string, unknown> | null;
  session?: AuthStatusSession | null;
  server_time: string;
}

export interface AuthStatusInput {
  deviceId?: string;
  ownerUserId?: string;
  appId?: string;
}

export interface UnbindInput {
  session_id?: string;
  deviceId?: string;
  ownerUserId?: string;
  appId?: string;
}

export interface LogoutInput extends UnbindInput {}

export interface UnbindResponse {
  success: boolean;
  session_id?: string;
  device_binding?: DeviceBindingStatus;
  session_ids?: string[];
  count?: number;
}

export interface EventTokenInput {
  deviceId?: string;
  ownerUserId?: string;
  appId?: string;
  session_id?: string;
  ttl_seconds?: number;
}

export interface EventTokenResponse {
  token: string;
  expires_at: string;
}

export interface ListSessionsInput {
  status?: SessionStatus;
  limit?: number;
  offset?: number;
}

export interface GetSessionInput {
  sessionId: string;
}

export interface DeleteSessionInput {
  sessionId: string;
}

export interface SessionResponse {
  id: string;
  phone?: string;
  status: SessionStatus;
  wa_jid?: string;
  worker_node?: string;
  proxy_address?: string;
  device_id?: string;
  owner_context?: OwnerContext;
  supplier_id?: string;
  active?: boolean;
  last_event?: string;
  last_connected_at?: string;
  last_disconnected_at?: string;
  disconnect_reason?: string;
  created_at: string;
  updated_at?: string;
}

export interface DeleteResponse {
  success: boolean;
  deleted_id?: string;
}

export interface ListChatsInput {
  sessionId?: string;
  chat_type?: 'dm' | 'group';
  limit?: number;
  offset?: number;
  deviceId?: string;
  ownerUserId?: string;
  appId?: string;
}

export interface ChatResponse {
  id: string;
  session_id?: string;
  chat_type: ChatType;
  name?: string;
  avatar?: string;
  last_message?: string;
  last_msg_at?: string;
  unread_count?: number;
}

export interface MessageMedia {
  policy: 'metadata_only' | string;
  download_status: 'skipped' | string;
  media_type: 'image' | 'voice' | 'video' | 'document' | 'sticker' | 'contact' | 'location' | string;
  mime_type?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  sha256?: string | null;
  duration_seconds?: number | null;
  width?: number | null;
  height?: number | null;
}

export interface QuotedMessage {
  message_id?: string;
  sender?: string;
  body?: string | null;
  msg_type?: MessageType;
  media?: MessageMedia;
}

export interface MessageResponse {
  id: string;
  wa_msg_id?: string;
  chat_id?: string;
  direction: 'inbound' | 'outbound';
  sender?: string;
  msg_type: MessageType;
  body?: string | null;
  media?: MessageMedia;
  reply_to_message_id?: string;
  quoted_message?: QuotedMessage;
  status: MessageStatus;
  wa_timestamp?: string;
  timestamp?: string;
  created_at: string;
  updated_at?: string;
}

export interface ListMessagesInput {
  chatId: string;
  sessionId?: string;
  before?: string;
  limit?: number;
  deviceId?: string;
  ownerUserId?: string;
  appId?: string;
}

export interface ResolveRecipientInput {
  query: string;
  sessionId?: string;
  limit?: number;
  deviceId?: string;
  ownerUserId?: string;
  appId?: string;
}

export interface RecipientMatch {
  jid: string;
  type: 'contact' | 'group' | 'chat' | string;
  display_name: string;
  chat_id?: string | null;
  confidence: number;
}

export interface RecipientResolveResponse {
  query: string;
  ambiguous: boolean;
  matches: RecipientMatch[];
  unresolved_reason?: string;
  recommended_action?: 'refresh_chat_and_retry' | string;
}

export interface AccountContact {
  wa_me_url?: string | null;
  qr_payload: string;
  qr_image_url: string;
  qr_image_base64?: string | null;
  qr_kind: 'native_contact_qr' | 'contact_link' | string;
}

export interface AccountAvatar {
  url?: string;
  id?: string;
  type?: string;
  preview?: boolean;
}

export interface AccountProfileResponse {
  session_id: string;
  device_id: string;
  owner_context?: OwnerContext;
  status: string;
  phone?: string;
  wa_jid?: string;
  display_name?: string | null;
  push_name?: string | null;
  status_text?: string | null;
  avatar?: AccountAvatar | null;
  avatar_status?: 'available' | 'unavailable' | 'failed' | string;
  avatar_error_code?: string | null;
  contact: AccountContact;
  updated_at: string;
}

export interface AccountProfileInput {
  sessionId?: string;
  qrBase64?: boolean;
  deviceId?: string;
  ownerUserId?: string;
  appId?: string;
}

export interface RelayEventBase<TType extends string = string, TData extends Record<string, unknown> = Record<string, unknown>> {
  event_id: string;
  event_type: TType;
  protocol?: 'whatsapp' | string;
  cursor?: string;
  timestamp: string;
  session_id?: string;
  device_id?: string;
  owner_context?: { user_id?: string; app_id?: string };
  data: TData;
}

export interface MessageEventData extends Record<string, unknown> {
  message_id?: string;
  chat_id?: string;
  chat_name?: string;
  chat_type?: ChatType;
  direction?: 'inbound' | 'outbound';
  is_from_me?: boolean;
  body?: string | null;
  sender?: string;
  msg_type?: MessageType;
  status?: MessageStatus;
  media?: MessageMedia;
  reply_to_message_id?: string;
  quoted_message?: QuotedMessage;
  raw_kind?: string;
  wa_message_type?: string;
  wa_media_type?: string;
  unsupported_reason?: string;
}

export interface SessionStateChangedData extends Record<string, unknown> {
  previous_status?: string;
  status?: string;
  reason?: string;
}

export interface ChatUpdatedData extends Record<string, unknown> {
  chat_id?: string;
  chat_name?: string;
  chat_type?: ChatType;
  avatar?: string;
  name_source?: 'contact' | 'push_name' | 'business_name' | string;
}

export interface HeartbeatData extends Record<string, unknown> {
  server_time?: string;
}

export interface ErrorEventData extends Record<string, unknown> {
  code?: string;
  message?: string;
}

export type MessageNewEvent = RelayEventBase<'message.new', MessageEventData>;
export type MessageReceivedEvent = RelayEventBase<'message.received', MessageEventData>;
export type MessageAcceptedEvent = RelayEventBase<'message.accepted', MessageEventData>;
export type MessageStatusUpdatedEvent = RelayEventBase<'message.status_updated', MessageEventData>;
export type SessionStateChangedEvent = RelayEventBase<'session.state_changed', SessionStateChangedData>;
export type DeviceUnboundEvent = RelayEventBase<'device.unbound'>;
export type DeviceBindingChangedEvent = RelayEventBase<'device.binding_changed'>;
export type WhatsAppUnboundEvent = RelayEventBase<'whatsapp.unbound'>;
export type WhatsAppLogoutFailedEvent = RelayEventBase<'whatsapp.logout_failed'>;
export type ChatUpdatedEvent = RelayEventBase<'chat.updated', ChatUpdatedData>;
export type HeartbeatEvent = RelayEventBase<'heartbeat', HeartbeatData>;
export type ErrorEvent = RelayEventBase<'error', ErrorEventData>;

export type RelayEvent =
  | MessageNewEvent
  | MessageReceivedEvent
  | MessageAcceptedEvent
  | MessageStatusUpdatedEvent
  | SessionStateChangedEvent
  | DeviceUnboundEvent
  | DeviceBindingChangedEvent
  | WhatsAppUnboundEvent
  | WhatsAppLogoutFailedEvent
  | ChatUpdatedEvent
  | HeartbeatEvent
  | ErrorEvent
  | RelayEventBase;

export interface FetchEventsInput {
  after?: string;
  limit?: number;
  sessionId?: string;
}

export interface CatchUpEventsInput extends FetchEventsInput {}

export interface FetchEventsResponse {
  events: RelayEvent[];
  next_cursor?: string | null;
  has_more: boolean;
}

export interface SubscribeEventsInput {
  sessionId?: string;
  after?: string;
  eventToken?: string;
  supplierApiKeyInQuery?: boolean;
  signal?: AbortSignal;
}

export interface WebSocketRequestInit {
  headers?: HeadersInit;
}

export interface WebSocketLike {
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  close(code?: number, reason?: string): void;
}
