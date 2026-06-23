import { useEffect, useMemo, useRef, useState } from 'react';
import type { AccountProfileResponse, AuthStatusResponse, BindStartResponse, BindStatusResponse, ChatResponse, MessageResponse, RelayEvent, SendMessageResponse, SessionResponse, SessionStatus } from '@squady/whatsapp-relay';
import { connectEvents, relayClient, RelayApiError } from '@/lib/api';
import { relayDocsUrl } from '@/lib/links';
import { initialLogs, initialSessions } from '@/lib/seed-data';
import { isConnectedStatus, normalizeSessionStatus } from '@/lib/status';
import type { WatchAppView, WatchDevice } from '@/components/WatchRelayDemo';
import type { DemoLog } from '@/lib/types';

const time = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const docsTag = (tag: string) => `${relayDocsUrl}/api#tag/${tag}`;
const stateDocs = docsTag('Events');
const defaultPollAfterSeconds = 5;
const reconnectPollAfterSeconds = 5;
const maxPollAttempts = 36;
const watchDemoStorageKey = 'whatsapp-relay.watch-demo.v1';
const eventCursorStorageKey = 'whatsapp-relay.event-cursor.v1';
type DemoPhase = 'login' | 'connected';
type DemoEventSource = 'websocket' | 'replay';
function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export interface WatchToast { id: string; device_id: string; title: string; body: string; chat_id?: string; }
export interface WatchSendFailure { code?: string; message: string; action: string; }

const initialWatchDevices: WatchDevice[] = [
  { id: 'watch_demo_001', name: 'Squady Watch', model: 'Squady Watch Pro', battery: 82, session_id: initialSessions[0].id, status: 'PENDING', unread_count: 0 },
  { id: 'watch_demo_002', name: 'Field Test Watch', model: 'Squady Watch Mini', battery: 61, status: 'PENDING', unread_count: 0 },
];

interface PersistedWatchDemoState {
  devices?: WatchDevice[];
  selectedDeviceId?: string;
  watchView?: WatchAppView;
  chatsByDeviceId?: Record<string, ChatResponse[]>;
  messagesByDeviceId?: Record<string, Record<string, MessageResponse[]>>;
  selectedChatIdByDeviceId?: Record<string, string>;
  readChatIdsByDeviceId?: Record<string, string[]>;
}

function loadPersistedWatchDemoState(): PersistedWatchDemoState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(watchDemoStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PersistedWatchDemoState;
    const validDevices = Array.isArray(parsed.devices)
      ? parsed.devices.filter((device): device is WatchDevice => typeof device?.id === 'string' && typeof device?.name === 'string')
      : undefined;
    return {
      devices: validDevices?.length ? validDevices : undefined,
      selectedDeviceId: typeof parsed.selectedDeviceId === 'string' ? parsed.selectedDeviceId : undefined,
      watchView: parsed.watchView === 'wa-login' || parsed.watchView === 'wa-chats' || parsed.watchView === 'wa-conversation' || parsed.watchView === 'wa-profile' || parsed.watchView === 'devices' ? parsed.watchView : undefined,
      chatsByDeviceId: parsed.chatsByDeviceId && typeof parsed.chatsByDeviceId === 'object' ? parsed.chatsByDeviceId : undefined,
      messagesByDeviceId: parsed.messagesByDeviceId && typeof parsed.messagesByDeviceId === 'object' ? parsed.messagesByDeviceId : undefined,
      selectedChatIdByDeviceId: parsed.selectedChatIdByDeviceId && typeof parsed.selectedChatIdByDeviceId === 'object' ? parsed.selectedChatIdByDeviceId : undefined,
      readChatIdsByDeviceId: parsed.readChatIdsByDeviceId && typeof parsed.readChatIdsByDeviceId === 'object' ? parsed.readChatIdsByDeviceId : undefined,
    };
  } catch {
    return {};
  }
}

function loadPersistedEventCursor() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(eventCursorStorageKey) ?? '';
}

function persistEventCursor(cursor: string) {
  if (typeof window === 'undefined' || !cursor) return;
  window.localStorage.setItem(eventCursorStorageKey, cursor);
}


function log(
  kind: DemoLog['kind'],
  title: string,
  detail: string,
  code: string,
  method?: string,
  docsHref = stateDocs,
): DemoLog {
  return { id: `log_${Date.now()}_${Math.random()}`, timestamp: time(), kind, method, title, detail, code, docsHref };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSessionId(binding?: Pick<BindStartResponse, 'session_id'>) {
  return binding?.session_id ?? initialSessions[0].id;
}

function pollDelayMs(seconds?: number) {
  return Math.max(1_000, (seconds ?? defaultPollAfterSeconds) * 1000);
}

function normalizeBindStartStatus(binding: BindStartResponse): SessionStatus {
  if (binding.qr_code) return 'QR_READY';
  return normalizeSessionStatus(binding.status);
}

function normalizeBindStatus(binding: BindStatusResponse): SessionStatus {
  return normalizeSessionStatus(binding.status);
}

function sendFailureFromError(error: unknown): WatchSendFailure & { status?: SessionStatus } {
  const code = error instanceof RelayApiError ? error.code : undefined;
  const message = errorMessage(error);
  switch (code) {
    case 'DEVICE_UNBOUND':
      return { code, message: '手表绑定已解除，当前设备不能继续发送消息。', action: '返回绑定入口，重新调用 auth/status 判断是否可以绑定。', status: 'PENDING' };
    case 'SESSION_RELOGIN_REQUIRED':
    case 'WHATSAPP_LOGGED_OUT':
      return { code, message: 'WhatsApp Linked Device 已失效，需要重新扫码。', action: '清理本地 binding_id 后重新 bind/start。', status: 'RELOGIN_REQUIRED' };
    case 'SESSION_DISCONNECTED':
      return { code, message: '账号当前离线，消息没有发送成功。', action: '先调用 auth/status，等待重连或根据 recommended_action 引导重登。', status: 'DISCONNECTED' };
    default:
      return { code, message, action: '保留当前会话，提示用户稍后重试，并把错误 code 上报给甲方后端。' };
  }
}

function statusFromRelayEvent(event: RelayEvent): SessionStatus | undefined {
  const dataStatus = typeof event.data?.status === 'string' ? normalizeSessionStatus(event.data.status) : undefined;
  if (dataStatus && dataStatus !== 'PENDING') return dataStatus;
  switch (event.event_type) {
    case 'session.connected':
      return 'CONNECTED';
    case 'session.disconnected':
      return 'DISCONNECTED';
    case 'session.reconnecting':
      return 'RECONNECTING';
    case 'session.relogin_required':
      return 'RELOGIN_REQUIRED';
    case 'session.expired':
    case 'whatsapp.logged_out':
      return 'EXPIRED';
    case 'device.unbound':
      return 'PENDING';
    default:
      return undefined;
  }
}

function makeSession(sessionId: string, status: SessionStatus, reason: string, phone?: string): SessionResponse {
  return {
    ...initialSessions[0],
    id: sessionId,
    phone,
    status,
    last_event: reason,
    updated_at: 'now',
  };
}

function stringData(data: Record<string, unknown> | undefined, key: string) {
  const value = data?.[key];
  return typeof value === 'string' ? value : undefined;
}

function messageFromEvent(event: RelayEvent): MessageResponse | undefined {
  if (event.event_type !== 'message.new') return undefined;
  const chatId = stringData(event.data, 'chat_id');
  const messageId = stringData(event.data, 'message_id') || event.event_id;
  const body = stringData(event.data, 'body') || '';
  if (!chatId || !messageId) return undefined;
  return {
    id: messageId,
    chat_id: chatId,
    direction: stringData(event.data, 'direction') === 'outbound' ? 'outbound' : 'inbound',
    body,
    sender: stringData(event.data, 'sender') || stringData(event.data, 'chat_name') || chatId,
    timestamp: event.timestamp ? new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : time(),
    status: (stringData(event.data, 'status') as MessageResponse['status']) || (stringData(event.data, 'direction') === 'outbound' ? 'accepted' : 'delivered'),
    msg_type: stringData(event.data, 'msg_type') || 'text',
    created_at: event.timestamp ?? new Date().toISOString(),
  };
}

function chatFromEvent(event: RelayEvent, message: MessageResponse): ChatResponse {
  const chatName = stringData(event.data, 'chat_name') || message.sender || message.chat_id || '';
  const chatType = stringData(event.data, 'chat_type') === 'group' ? 'group' : 'dm';
  return {
    id: message.chat_id ?? '',
    session_id: event.session_id ?? '',
    name: chatName,
    chat_type: chatType,
    avatar: chatName.slice(0, 2).toUpperCase(),
    last_message: message.body ?? '',
    last_msg_at: 'now',
    unread_count: message.direction === 'inbound' ? 1 : 0,
  };
}

function relayEventLogPayload(event: RelayEvent, targetDeviceId?: string) {
  return JSON.stringify(
    {
      source_event_id: event.event_id,
      event_type: event.event_type,
      cursor: event.cursor,
      session_id: event.session_id,
      device_id: event.device_id ?? targetDeviceId,
      chat_id: stringData(event.data, 'chat_id'),
      message_id: stringData(event.data, 'message_id'),
      direction: stringData(event.data, 'direction'),
      msg_type: stringData(event.data, 'msg_type'),
      raw_kind: stringData(event.data, 'raw_kind'),
    },
    null,
    2,
  );
}

function mergeMessage(messages: MessageResponse[] | undefined, message: MessageResponse) {
  const current = messages ?? [];
  if (current.some((item) => item.id === message.id)) return current;
  return [...current, message];
}

function readSetFromPersisted(value: string[] | undefined) {
  return new Set(value ?? []);
}

function markChatReadInList(chats: ChatResponse[] | undefined, chatId?: string) {
  const current = chats ?? [];
  if (!chatId) return current.map((chat) => ({ ...chat, unread_count: 0 }));
  return current.map((chat) => (chat.id === chatId ? { ...chat, unread_count: 0 } : chat));
}

function unreadTotal(chats: ChatResponse[] | undefined) {
  return (chats ?? []).reduce((sum, chat) => sum + (chat.unread_count ?? 0), 0);
}

function activeSessionsOnly(sessions: SessionResponse[]) {
  return sessions.filter((session) => session.active !== false);
}

function reconcileDevicesWithActiveSessions(devices: WatchDevice[], activeSessions: SessionResponse[]) {
  const usableSessions = activeSessionsOnly(activeSessions);
  const sessionsByDeviceId = new Map(usableSessions.filter((session) => session.device_id).map((session) => [session.device_id, session]));
  const sessionsById = new Map(usableSessions.map((session) => [session.id, session]));
  return devices.map((device) => {
    const ownedSession = sessionsByDeviceId.get(device.id) ?? (device.session_id ? sessionsById.get(device.session_id) : undefined);
    if (ownedSession) {
      const ownedStatus = normalizeSessionStatus(ownedSession.status);
      return {
        ...device,
        session_id: ownedSession.id,
        status: ownedStatus,
        lastNotification: ownedStatus === 'CONNECTED' ? 'WhatsApp connected' : device.lastNotification,
      };
    }
    if (device.session_id && device.status !== 'PENDING' && device.status !== 'QR_READY') {
      return {
        ...device,
        session_id: undefined,
        status: 'EXPIRED' as SessionStatus,
        unread_count: 0,
        lastNotification: 'Session replaced or inactive',
      };
    }
    return device;
  });
}

function initialChatState(): ChatResponse[] {
  return [];
}

function initialMessageState(): Record<string, MessageResponse[]> {
  return {};
}

function makeInitialChatsByDeviceId(devices: WatchDevice[]) {
  return Object.fromEntries(devices.map((device) => [device.id, initialChatState()]));
}

function makeInitialMessagesByDeviceId(devices: WatchDevice[]) {
  return Object.fromEntries(devices.map((device) => [device.id, initialMessageState()]));
}

function makeInitialSelectedChatIdByDeviceId(devices: WatchDevice[]) {
  return Object.fromEntries(devices.map((device) => [device.id, '']));
}

export function useDemoState() {
  const persistedWatchState = useMemo(loadPersistedWatchDemoState, []);
  const initialDevices = persistedWatchState.devices ?? initialWatchDevices;
  const initialSelectedDeviceId = persistedWatchState.selectedDeviceId && initialDevices.some((device) => device.id === persistedWatchState.selectedDeviceId) ? persistedWatchState.selectedDeviceId : initialDevices[0].id;
  const [phase, setPhase] = useState<DemoPhase>(() => (initialDevices.some((device) => device.status === 'CONNECTED' && device.session_id) ? 'connected' : 'login'));
  const [watchView, setWatchView] = useState<WatchAppView>(persistedWatchState.watchView ?? 'devices');
  const [devices, setDevices] = useState<WatchDevice[]>(initialDevices);
  const [selectedDeviceId, setSelectedDeviceId] = useState(initialSelectedDeviceId);
  const [status, setStatus] = useState<SessionStatus>('PENDING');
  const [sessions, setSessions] = useState<SessionResponse[]>([{ ...initialSessions[0], status: 'PENDING', last_event: 'ready to bind' }]);
  const [activeSessionId, setActiveSessionId] = useState(initialSessions[0].id);
  const [bindingIdByDeviceId, setBindingIdByDeviceId] = useState<Record<string, string | undefined>>({});
  const [qrCodeByDeviceId, setQrCodeByDeviceId] = useState<Record<string, string | undefined>>({});
  const [qrExpiresAtByDeviceId, setQrExpiresAtByDeviceId] = useState<Record<string, string | undefined>>({});
  const [pollingBindingIdByDeviceId, setPollingBindingIdByDeviceId] = useState<Record<string, string | undefined>>({});
  const [authStatusByDeviceId, setAuthStatusByDeviceId] = useState<Record<string, AuthStatusResponse | undefined>>({});
  const [isBinding, setIsBinding] = useState(false);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [chatsByDeviceId, setChatsByDeviceId] = useState<Record<string, ChatResponse[]>>(() => persistedWatchState.chatsByDeviceId ?? makeInitialChatsByDeviceId(initialDevices));
  const [accountProfileByDeviceId, setAccountProfileByDeviceId] = useState<Record<string, AccountProfileResponse | undefined>>({});
  const [sendFailureByDeviceId, setSendFailureByDeviceId] = useState<Record<string, WatchSendFailure | undefined>>({});
  const [selectedChatIdByDeviceId, setSelectedChatIdByDeviceId] = useState<Record<string, string>>(() => persistedWatchState.selectedChatIdByDeviceId ?? makeInitialSelectedChatIdByDeviceId(initialDevices));
  const [messagesByDeviceId, setMessagesByDeviceId] = useState<Record<string, Record<string, MessageResponse[]>>>(() => persistedWatchState.messagesByDeviceId ?? makeInitialMessagesByDeviceId(initialDevices));
  const [readChatIdsByDeviceId, setReadChatIdsByDeviceId] = useState<Record<string, Set<string>>>(() =>
    Object.fromEntries(initialDevices.map((device) => [device.id, readSetFromPersisted(persistedWatchState.readChatIdsByDeviceId?.[device.id])])),
  );
  const [watchToast, setWatchToast] = useState<WatchToast>();
  const [logs, setLogs] = useState<DemoLog[]>(initialLogs);
  const [selectedLogId, setSelectedLogId] = useState(initialLogs[0]?.id);
  const selectedDevice = useMemo(() => devices.find((device) => device.id === selectedDeviceId) ?? devices[0], [devices, selectedDeviceId]);
  const bindingId = bindingIdByDeviceId[selectedDeviceId];
  const qrCode = qrCodeByDeviceId[selectedDeviceId];
  const qrExpiresAt = qrExpiresAtByDeviceId[selectedDeviceId];
  const pollingBindingId = pollingBindingIdByDeviceId[selectedDeviceId];
  const isPollingBindStatus = Boolean(bindingId && pollingBindingId === bindingId);
  const authStatus = authStatusByDeviceId[selectedDeviceId];
  const chats = chatsByDeviceId[selectedDeviceId] ?? [];
  const accountProfile = accountProfileByDeviceId[selectedDeviceId];
  const selectedChatId = selectedChatIdByDeviceId[selectedDeviceId] ?? '';
  const messagesByChatId = messagesByDeviceId[selectedDeviceId] ?? {};
  const selectedChat = useMemo(() => chats.find((c) => c.id === selectedChatId) ?? chats[0], [chats, selectedChatId]);
  const selectedMessages = selectedChatId ? messagesByChatId[selectedChatId] ?? [] : [];
  const sendFailure = sendFailureByDeviceId[selectedDeviceId];

  useEffect(() => {
    const readChatIds = Object.fromEntries(Object.entries(readChatIdsByDeviceId).map(([deviceId, ids]) => [deviceId, Array.from(ids)]));
    window.localStorage.setItem(watchDemoStorageKey, JSON.stringify({ devices, selectedDeviceId, watchView, chatsByDeviceId, messagesByDeviceId, selectedChatIdByDeviceId, readChatIdsByDeviceId: readChatIds }));
  }, [devices, selectedDeviceId, watchView, chatsByDeviceId, messagesByDeviceId, selectedChatIdByDeviceId, readChatIdsByDeviceId]);

  const selectedLogIdRef = useRef<string | undefined>(selectedLogId);
  const activeSessionIdRef = useRef(activeSessionId);
  const selectedChatIdRef = useRef(selectedChatId);
  const selectedDeviceIdRef = useRef(selectedDeviceId);
  const lastEventCursorRef = useRef(loadPersistedEventCursor());
  const selectedChatIdByDeviceIdRef = useRef(selectedChatIdByDeviceId);
  const devicesRef = useRef(devices);
  const readChatIdsByDeviceIdRef = useRef(readChatIdsByDeviceId);
  const watchViewRef = useRef(watchView);
  const bindingPollTokenRef = useRef(0);
  const reconnectPollTokenRef = useRef(0);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    selectedChatIdRef.current = selectedChatId;
  }, [selectedChatId]);

  useEffect(() => {
    selectedDeviceIdRef.current = selectedDeviceId;
  }, [selectedDeviceId]);

  useEffect(() => {
    selectedChatIdByDeviceIdRef.current = selectedChatIdByDeviceId;
  }, [selectedChatIdByDeviceId]);

  useEffect(() => {
    devicesRef.current = devices;
  }, [devices]);

  useEffect(() => {
    readChatIdsByDeviceIdRef.current = readChatIdsByDeviceId;
  }, [readChatIdsByDeviceId]);

  useEffect(() => {
    watchViewRef.current = watchView;
  }, [watchView]);

  useEffect(() => {
    selectedLogIdRef.current = selectedLogId;
  }, [selectedLogId]);

  useEffect(() => {
    return () => {
      bindingPollTokenRef.current += 1;
      reconnectPollTokenRef.current += 1;
    };
  }, []);

  const addLog = (entry: DemoLog) => {
    setLogs((prev) => [entry, ...prev]);
    setSelectedLogId(entry.id);
  };

  const clearWatchToast = () => setWatchToast(undefined);

  const markChatRead = (deviceId: string, chatId?: string) => {
    setReadChatIdsByDeviceId((prev) => {
      const nextSet = new Set(prev[deviceId] ?? []);
      if (chatId) nextSet.add(chatId);
      else (chatsByDeviceId[deviceId] ?? []).forEach((chat) => nextSet.add(chat.id));
      return { ...prev, [deviceId]: nextSet };
    });
    setChatsByDeviceId((prev) => {
      const nextChats = markChatReadInList(prev[deviceId], chatId);
      return { ...prev, [deviceId]: nextChats };
    });
    setDevices((prev) =>
      prev.map((device) =>
        device.id === deviceId ? { ...device, unread_count: chatId ? Math.max(0, device.unread_count - ((chatsByDeviceId[deviceId] ?? []).find((chat) => chat.id === chatId)?.unread_count ?? 0)) : 0 } : device,
      ),
    );
  };

  const applyRelayEvent = (event: RelayEvent, source: DemoEventSource = 'websocket') => {
    if (event.event_type === 'heartbeat') {
      return;
    }
    if (event.cursor) {
      lastEventCursorRef.current = event.cursor;
      persistEventCursor(event.cursor);
    }
    addLog(log('event', 'Relay event received', `${source} · ${event.event_type}`, relayEventLogPayload(event), 'GET'));
    const sessionStatus = statusFromRelayEvent(event);
    if (sessionStatus) {
      const currentDevices = devicesRef.current;
      const currentSelectedDeviceId = selectedDeviceIdRef.current;
      const targetDevice =
        (event.device_id ? currentDevices.find((device) => device.id === event.device_id) : undefined) ??
        currentDevices.find((device) => device.session_id === event.session_id) ??
        currentDevices.find((device) => device.id === currentSelectedDeviceId);
      const targetDeviceId = targetDevice?.id ?? currentSelectedDeviceId;
      const terminal = sessionStatus === 'PENDING' || sessionStatus === 'EXPIRED' || sessionStatus === 'RELOGIN_REQUIRED';
      setStatus((current) => (targetDeviceId === currentSelectedDeviceId ? sessionStatus : current));
      setDevices((prev) =>
        prev.map((device) =>
          device.id === targetDeviceId
            ? {
                ...device,
                status: sessionStatus,
                session_id: terminal && event.event_type === 'device.unbound' ? undefined : event.session_id || device.session_id,
                unread_count: terminal ? 0 : device.unread_count,
                lastNotification:
                  sessionStatus === 'CONNECTED'
                    ? 'WhatsApp connected'
                    : sessionStatus === 'DISCONNECTED'
                      ? 'WhatsApp 离线，等待重连'
                      : sessionStatus === 'RECONNECTING'
                        ? 'WhatsApp 正在重连'
                        : terminal
                          ? '需要重新绑定 WhatsApp'
                          : device.lastNotification,
              }
            : device,
        ),
      );
      setSessions((prev) =>
        prev.map((session) => (session.id === event.session_id ? { ...session, status: sessionStatus, last_event: event.event_type, updated_at: 'now' } : session)),
      );
      if (terminal) {
        setBindingIdByDeviceId((prev) => ({ ...prev, [targetDeviceId]: undefined }));
        setQrCodeByDeviceId((prev) => ({ ...prev, [targetDeviceId]: undefined }));
        setQrExpiresAtByDeviceId((prev) => ({ ...prev, [targetDeviceId]: undefined }));
        setPollingBindingIdByDeviceId((prev) => ({ ...prev, [targetDeviceId]: undefined }));
        setSendFailureByDeviceId((prev) => ({
          ...prev,
          [targetDeviceId]: {
            code: event.event_type,
            message: event.event_type === 'device.unbound' ? '手表绑定已解除，需要重新绑定。' : 'WhatsApp 会话已失效，需要重新扫码。',
            action: '先调用 auth/status 获取当前 recommended_action，再决定是否 bind/start。',
          },
        }));
        if (targetDeviceId === currentSelectedDeviceId) setWatchView('wa-login');
      } else if (sessionStatus === 'CONNECTED') {
        setSendFailureByDeviceId((prev) => ({ ...prev, [targetDeviceId]: undefined }));
      }
      addLog(
        log(
          'event',
          'Session state event',
          `${event.event_type} · ${sessionStatus}`,
          JSON.stringify({ event_id: event.event_id, event_type: event.event_type, session_id: event.session_id, device_id: event.device_id ?? targetDeviceId, status: sessionStatus }, null, 2),
        ),
      );
      if (event.event_type !== 'message.status_updated') return;
    }
    if (event.event_type === 'message.status_updated') {
      const messageId = typeof event.data?.message_id === 'string' ? event.data.message_id : '';
      const nextStatus = typeof event.data?.status === 'string' ? event.data.status : '';
      if (!messageId || !nextStatus) return;
      const targetDevice = (event.device_id ? devicesRef.current.find((device) => device.id === event.device_id) : undefined) ?? devicesRef.current.find((device) => device.session_id === event.session_id);
      const targetDeviceId = targetDevice?.id;
      setMessagesByDeviceId((prev) => {
        const entries = targetDeviceId ? [[targetDeviceId, prev[targetDeviceId] ?? {}] as const] : Object.entries(prev);
        const next = { ...prev };
        for (const [deviceId, chatsForDevice] of entries) {
          const nextChatsForDevice = { ...chatsForDevice };
          for (const [chatId, messages] of Object.entries(chatsForDevice)) {
            const updated = messages.map((message) => (message.id === messageId ? { ...message, status: nextStatus as MessageResponse['status'] } : message));
            if (updated !== messages) nextChatsForDevice[chatId] = updated;
          }
          next[deviceId] = nextChatsForDevice;
        }
        return next;
      });
      addLog(log('event', 'Message status updated', `${messageId} · ${nextStatus}`, JSON.stringify({ event_id: event.event_id, session_id: event.session_id, device_id: event.device_id ?? targetDeviceId, message_id: messageId, status: nextStatus }, null, 2)));
      return;
    }
    if (event.event_type !== 'message.new') return;
    const msg = messageFromEvent(event);
    if (!msg) return;
    const eventSessionId = event.session_id ?? (activeSessionId || initialSessions[0].id);
    const nextChat = chatFromEvent(event, msg);
    setActiveSessionId((current) => current || eventSessionId);
    setPhase('connected');
    setStatus((current) => (current === 'PENDING' || current === 'QR_READY' ? 'CONNECTED' : current));
    setSessions((prev) => {
      if (prev.some((session) => session.id === eventSessionId)) {
        return prev.map((session) => (session.id === eventSessionId ? { ...session, status: 'CONNECTED', last_event: 'message.new', updated_at: 'now' } : session));
      }
      return [makeSession(eventSessionId, 'CONNECTED', 'message.new'), ...prev];
    });
    const currentDevices = devicesRef.current;
    const currentSelectedDeviceId = selectedDeviceIdRef.current;
    const targetDevice = (event.device_id ? currentDevices.find((device) => device.id === event.device_id) : undefined) ?? currentDevices.find((device) => device.session_id === event.session_id) ?? currentDevices.find((device) => device.id === currentSelectedDeviceId);
    const targetDeviceId = targetDevice?.id ?? currentSelectedDeviceId;
    const targetSelectedChatId = selectedChatIdByDeviceIdRef.current[targetDeviceId] ?? '';
    const isViewingTargetConversation = targetDeviceId === currentSelectedDeviceId && watchViewRef.current === 'wa-conversation' && targetSelectedChatId === msg.chat_id;
    const messageChatId = msg.chat_id ?? '';
    const isRead = isViewingTargetConversation || readChatIdsByDeviceIdRef.current[targetDeviceId]?.has(messageChatId) === true;
    if (msg.direction === 'inbound' && !isRead) {
      const toast: WatchToast = { id: `toast_${Date.now()}`, device_id: targetDeviceId, title: nextChat.name ?? nextChat.id, body: msg.body || 'New WhatsApp message', chat_id: messageChatId };
      setWatchToast(toast);
      window.setTimeout(() => {
        setWatchToast((current) => (current?.id === toast.id ? undefined : current));
      }, 4_000);
    }
    setDevices((prev) =>
      prev.map((device) =>
        device.id === targetDeviceId
          ? { ...device, session_id: eventSessionId, status: 'CONNECTED', unread_count: device.unread_count + (msg.direction === 'inbound' && !isRead ? 1 : 0), lastNotification: msg.direction === 'inbound' ? `${nextChat.name ?? nextChat.id}: ${msg.body ?? ''}` : device.lastNotification }
          : device,
      ),
    );
    setChatsByDeviceId((prevAll) => {
      const prev = prevAll[targetDeviceId] ?? [];
      const existing = prev.find((chat) => chat.id === nextChat.id);
      const merged: ChatResponse = existing
        ? {
            ...existing,
            name: existing.name || nextChat.name || nextChat.id,
            avatar: existing.avatar || nextChat.avatar,
            chat_type: existing.chat_type || nextChat.chat_type,
            last_message: nextChat.last_message ?? '',
            last_msg_at: nextChat.last_msg_at,
            unread_count: msg.direction === 'inbound' && !isRead ? (existing.unread_count ?? 0) + 1 : existing.unread_count ?? 0,
          }
        : { ...nextChat, unread_count: msg.direction === 'inbound' && !isRead ? nextChat.unread_count : 0 };
      return { ...prevAll, [targetDeviceId]: [merged, ...prev.filter((chat) => chat.id !== nextChat.id)] };
    });
    setMessagesByDeviceId((prev) => ({ ...prev, [targetDeviceId]: { ...(prev[targetDeviceId] ?? {}), [messageChatId]: mergeMessage(prev[targetDeviceId]?.[messageChatId], msg) } }));
    if (!targetSelectedChatId && messageChatId) setSelectedChatIdByDeviceId((prev) => ({ ...prev, [targetDeviceId]: messageChatId }));
    if (targetDeviceId === currentSelectedDeviceId && watchViewRef.current === 'devices') setWatchView('wa-chats');
    addLog(
      log(
        'event',
        msg.direction === 'outbound' ? 'Outbound message.new' : 'Inbound message.new',
        `${source} event · ${nextChat.name ?? nextChat.id}`,
        JSON.stringify({ event_id: event.event_id, event_type: event.event_type, session_id: event.session_id, device_id: event.device_id ?? targetDeviceId, chat_id: messageChatId, message_id: msg.id }, null, 2),
      ),
    );
  };

  useEffect(() => {
    let closed = false;
    let disconnect: () => void = () => undefined;
    addLog(log('event', 'Connect event stream', 'Opening /ws/v1/events with API key auth for the demo', JSON.stringify({ supplier_api_key: 'X-Supplier-API-Key', after: lastEventCursorRef.current || undefined }, null, 2), 'GET', docsTag('Events')));
    disconnect = connectEvents(relayClient, (event) => applyRelayEvent(event, 'websocket'), {
      supplierApiKeyInQuery: true,
      after: lastEventCursorRef.current || undefined,
    });
    void replayMissedEvents();
    void restorePersistedSession();

    return () => {
      closed = true;
      disconnect();
    };
    // relayClient is a module singleton; reconnecting on each render would duplicate streams.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const replayMissedEvents = async () => {
    const cursor = lastEventCursorRef.current;
    if (!cursor) {
      addLog(log('event', 'Replay check skipped', 'No saved event cursor yet', JSON.stringify({ after: undefined }, null, 2), 'GET'));
      return;
    }
    addLog(log('event', 'Event stream reconnecting', `Fetching missed events after ${cursor}`, JSON.stringify({ after: cursor }, null, 2), 'GET'));
    try {
      const replay = await relayClient.events.fetchMissed({ after: cursor });
      replay.events.forEach((event) => applyRelayEvent(event, 'replay'));
      if (replay.next_cursor) {
        lastEventCursorRef.current = replay.next_cursor;
        persistEventCursor(replay.next_cursor);
      }
      addLog(log('event', 'Replayed missed events', `Replayed ${replay.events.length} missed events`, JSON.stringify({ after: cursor, next_cursor: replay.next_cursor, replayed: replay.events.length, has_more: replay.has_more }, null, 2), 'GET'));
    } catch (error) {
      addLog(log('event', 'Replay missed events failed', errorMessage(error), JSON.stringify({ after: cursor }, null, 2), 'GET'));
    }
  };

  const refreshAuthStatus = async (deviceId = selectedDeviceId, title = 'Current auth status') => {
    addLog(log('http', title, 'GET /api/v1/auth/status', JSON.stringify({ device_id: deviceId }, null, 2), 'GET', docsTag('Authentication')));
    try {
      const current = await relayClient.auth.status({ deviceId });
      setAuthStatusByDeviceId((prev) => ({ ...prev, [deviceId]: current }));
      if (current.session) {
        replaceActiveSession(current.session.id, normalizeSessionStatus(current.session.status), current.reason_code || current.recommended_action, current.session.phone, deviceId);
      } else if (current.can_start_bind && current.recommended_action === 'start_bind') {
        setStatus('PENDING');
        setDevices((prev) => prev.map((device) => (device.id === deviceId && !device.session_id ? { ...device, status: 'PENDING' } : device)));
      }
      addLog(
        log(
          'state',
          'Auth status resolved',
          `${current.phase} · ${current.recommended_action}`,
          JSON.stringify({ phase: current.phase, recommended_action: current.recommended_action, reason_code: current.reason_code, can_start_bind: current.can_start_bind, device_binding: current.device_binding, session_id: current.session?.id }, null, 2),
          undefined,
          docsTag('Authentication'),
        ),
      );
      return current;
    } catch (error) {
      addLog(log('http', 'Current auth status failed', errorMessage(error), 'GET /api/v1/auth/status failed', 'GET', docsTag('Authentication')));
      return undefined;
    }
  };

  const beginReconnectPolling = (deviceId = selectedDeviceId, sessionId?: string) => {
    const pollToken = reconnectPollTokenRef.current + 1;
    reconnectPollTokenRef.current = pollToken;
    addLog(
      log(
        'state',
        'Reconnect status polling',
        `GET auth/status every ${reconnectPollAfterSeconds}s while Relay waits for WhatsApp reconnect`,
        JSON.stringify({ device_id: deviceId, session_id: sessionId, poll_after_seconds: reconnectPollAfterSeconds }, null, 2),
        undefined,
        docsTag('Authentication'),
      ),
    );
    const poll = async () => {
      await sleep(pollDelayMs(reconnectPollAfterSeconds));
      if (reconnectPollTokenRef.current !== pollToken) return;
      const current = await refreshAuthStatus(deviceId, 'Reconnect status check');
      if (reconnectPollTokenRef.current !== pollToken || !current) return;
      if (current.recommended_action === 'wait_reconnect') {
        void poll();
        return;
      }
      reconnectPollTokenRef.current += 1;
      if (current.recommended_action === 'show_connected' && current.session?.id) {
        setWatchView('wa-chats');
        await refreshRuntimeData(current.session.id, undefined, deviceId);
        return;
      }
      if (current.can_start_bind || current.recommended_action === 'rebind_required' || current.recommended_action === 'start_bind') {
        setWatchView('wa-login');
      }
    };
    void poll();
  };

  const hydrateSessions = async () => {
    try {
      const nextSessions = await relayClient.sessions.list();
      setSessions(nextSessions);
      setDevices((prev) => reconcileDevicesWithActiveSessions(prev, nextSessions));
      return nextSessions;
    } catch (error) {
      addLog(log('http', 'Load sessions failed', errorMessage(error), 'GET /api/v1/sessions failed', 'GET'));
      return [];
    }
  };

  const restorePersistedSession = async () => {
    await refreshAuthStatus(selectedDeviceIdRef.current, 'Current dialog lookup');
    const nextSessions = await hydrateSessions();
    const activeSessions = activeSessionsOnly(nextSessions);
    const restored = activeSessions.find((session) => normalizeSessionStatus(session.status) !== 'EXPIRED') ?? activeSessions[0];
    if (!restored) {
      setPhase('login');
      setStatus('PENDING');
      setActiveSessionId(initialSessions[0].id);
      return;
    }
    const currentDevices = devicesRef.current;
    const selected = currentDevices.find((device) => device.id === selectedDeviceIdRef.current);
    const selectedOwnedSession = activeSessions.find((session) => session.device_id === selectedDeviceIdRef.current);
    const restoredForSelected = selectedOwnedSession ?? (selected?.session_id ? activeSessions.find((session) => session.id === selected.session_id) : undefined) ?? restored;
    const restoreDeviceId = restoredForSelected.device_id ?? selected?.id ?? selectedDeviceIdRef.current;
    setActiveSessionId(restoredForSelected.id);
    const restoredStatus = normalizeSessionStatus(restoredForSelected.status);
    setStatus(restoredStatus);
    if (restoredStatus !== 'EXPIRED') setPhase('connected');
    setDevices((prev) => prev.map((device) => (device.id === restoreDeviceId ? { ...device, session_id: restoredForSelected.id, status: restoredStatus } : device)));
    setWatchView('devices');
    addLog(
      log(
        'state',
        'Restored existing session',
        `Found persisted session ${restoredForSelected.id} · ${restoredForSelected.status}`,
        JSON.stringify({ session_id: restoredForSelected.id, device_id: restoreDeviceId, status: restoredForSelected.status, phone: restoredForSelected.phone }, null, 2),
      ),
    );
    await hydrateChats(restoreDeviceId, restoredForSelected.id);
  };

  const hydrateChats = async (deviceId = selectedDeviceId, sessionId?: string, preferredChatId?: string) => {
    setIsLoadingChats(true);
    try {
      const nextChatsRaw = await relayClient.chats.list({ deviceId, sessionId });
      const readSet = readChatIdsByDeviceId[deviceId] ?? new Set<string>();
      const nextChats = nextChatsRaw.map((chat) => (readSet.has(chat.id) ? { ...chat, unread_count: 0 } : chat));
      setChatsByDeviceId((prev) => ({ ...prev, [deviceId]: nextChats }));
      const nextSelectedId = preferredChatId && nextChats.some((chat) => chat.id === preferredChatId) ? preferredChatId : nextChats[0]?.id ?? '';
      setSelectedChatIdByDeviceId((prev) => ({ ...prev, [deviceId]: nextSelectedId }));
      if (nextSelectedId) {
        const messages = await relayClient.messages.listInChat({ chatId: nextSelectedId, deviceId, sessionId });
        setMessagesByDeviceId((prev) => ({ ...prev, [deviceId]: { ...(prev[deviceId] ?? {}), [nextSelectedId]: messages } }));
      }
      addLog(
        log(
          'http',
          'Load runtime chats',
          `GET /api/v1/chats · ${nextChats.length} chats`,
          JSON.stringify({ session_id: sessionId, chats: nextChats.length }, null, 2),
          'GET',
          docsTag('Chats'),
        ),
      );
    } catch (error) {
      addLog(log('http', 'Load chats failed', errorMessage(error), 'GET /api/v1/chats failed', 'GET'));
    } finally {
      setIsLoadingChats(false);
    }
  };

  const hydrateAccountProfile = async (deviceId = selectedDeviceId, sessionId = activeSessionId) => {
    if (!sessionId) return;
    setIsLoadingProfile(true);
    addLog(
      log(
        'http',
        'Load account profile',
        'GET /api/v1/account/profile',
        JSON.stringify({ device_id: deviceId, session_id: sessionId }, null, 2),
        'GET',
        docsTag('Account'),
      ),
    );
    try {
      const profile = await relayClient.account.profile({ deviceId, sessionId, qrBase64: true });
      setAccountProfileByDeviceId((prev) => ({ ...prev, [deviceId]: profile }));
      addLog(
        log(
          'state',
          'Account QR ready',
          `${profile.contact.qr_kind} · ${profile.display_name ?? profile.push_name ?? profile.phone ?? profile.wa_jid ?? profile.session_id}`,
          JSON.stringify({ session_id: profile.session_id, device_id: profile.device_id, qr_kind: profile.contact.qr_kind, qr_payload: profile.contact.qr_payload, qr_image_url: profile.contact.qr_image_url }, null, 2),
          undefined,
          docsTag('Account'),
        ),
      );
    } catch (error) {
      addLog(log('http', 'Load account profile failed', errorMessage(error), 'GET /api/v1/account/profile failed', 'GET', docsTag('Account')));
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const refreshRuntimeData = async (sessionId?: string, preferredChatId?: string, deviceId = selectedDeviceId) => {
    reconnectPollTokenRef.current += 1;
    await hydrateSessions();
    await hydrateChats(deviceId, sessionId, preferredChatId);
    if (sessionId) await hydrateAccountProfile(deviceId, sessionId);
  };

  const replaceActiveSession = (sessionId: string, nextStatus: SessionStatus, reason: string, phone?: string, deviceId = selectedDeviceId) => {
    setActiveSessionId(sessionId);
    setStatus(nextStatus);
    if (isConnectedStatus(nextStatus)) setPhase('connected');
    if (isConnectedStatus(nextStatus)) setSendFailureByDeviceId((prev) => ({ ...prev, [deviceId]: undefined }));
    setSessions((prev) => {
      const nextSession = makeSession(sessionId, nextStatus, reason, phone);
      const rest = prev.filter((session) => session.id !== sessionId);
      return [nextSession, ...rest];
    });
    setDevices((prev) => prev.map((device) => (device.id === deviceId ? { ...device, session_id: sessionId, status: nextStatus, lastNotification: isConnectedStatus(nextStatus) ? 'WhatsApp connected' : device.lastNotification } : device)));
  };

  const updateStatus = (next: SessionStatus, reason: string, sessionId = activeSessionId, phone?: string, deviceId = selectedDeviceId) => {
    const prev = status;
    replaceActiveSession(sessionId, next, reason, phone, deviceId);
    addLog(log('state', 'State transition', `${prev} → ${next} · ${reason}`, `{ "from": "${prev}", "to": "${next}", "reason": "${reason}" }`));
  };

  const startBind = async () => {
    if (isBinding || isPollingBindStatus) return;
    setIsBinding(true);
    setSendFailureByDeviceId((prev) => ({ ...prev, [selectedDeviceId]: undefined }));
    addLog(
      log(
        'http',
        'Start binding',
        'POST /api/v1/auth/bind/start',
        `curl -X POST /api/v1/auth/bind/start -H 'X-Supplier-API-Key: ***' -H 'X-Device-ID: ${selectedDeviceId}' -d '{}'`,
        'POST',
        docsTag('Authentication'),
      ),
    );
    try {
      const current = await refreshAuthStatus(selectedDeviceId, 'Pre-bind current status');
      if (current && !current.can_start_bind) {
        addLog(
          log(
            'state',
            'Bind start skipped',
            `auth/status returned can_start_bind=false · ${current.recommended_action}`,
            JSON.stringify({ phase: current.phase, recommended_action: current.recommended_action, session_id: current.session?.id }, null, 2),
            undefined,
            docsTag('Authentication'),
          ),
        );
        if (current.recommended_action === 'show_connected' && current.session?.id) {
          setWatchView('wa-chats');
          await refreshRuntimeData(current.session.id, undefined, selectedDeviceId);
        } else if (current.recommended_action === 'wait_reconnect') {
          if (current.session?.id) {
            setWatchView('wa-chats');
            beginReconnectPolling(selectedDeviceId, current.session.id);
          } else {
            setWatchView('devices');
            beginReconnectPolling(selectedDeviceId);
          }
        }
        return;
      }
      const binding = await relayClient.auth.startBind({ deviceId: selectedDeviceId });
      const nextBindingId = binding.binding_id ?? 'bind_demo_001';
      const sessionId = normalizeSessionId(binding);
      const nextStatus = normalizeBindStartStatus(binding);
      const bindDeviceId = selectedDeviceId;
      setBindingIdByDeviceId((prev) => ({ ...prev, [bindDeviceId]: nextBindingId }));
      setQrCodeByDeviceId((prev) => ({ ...prev, [bindDeviceId]: binding.qr_code }));
      setQrExpiresAtByDeviceId((prev) => ({ ...prev, [bindDeviceId]: binding.expires_at }));
      replaceActiveSession(sessionId, nextStatus, 'QR generated', undefined, bindDeviceId);
      addLog(
        log(
          'event',
          'Binding ready',
          `binding ${nextBindingId} · session ${sessionId}`,
          JSON.stringify({ binding_id: nextBindingId, session_id: sessionId, status: nextStatus, has_qr: Boolean(binding.qr_code) }, null, 2),
        ),
      );

      if (isConnectedStatus(nextStatus)) {
        updateStatus('CONNECTED', 'WhatsApp ConnectedEvent received', sessionId, undefined, bindDeviceId);
        await refreshRuntimeData(sessionId, undefined, bindDeviceId);
        if (bindDeviceId === selectedDeviceIdRef.current) setWatchView('wa-chats');
        return;
      }

      beginBindStatusPolling(nextBindingId, sessionId, bindDeviceId, binding.poll_after_seconds);
    } catch (error) {
      addLog(log('http', 'Binding failed', errorMessage(error), 'bind/start failed', 'POST'));
    } finally {
      setIsBinding(false);
    }
  };

  const beginBindStatusPolling = (nextBindingId: string, fallbackSessionId: string, deviceId: string, pollAfterSeconds?: number) => {
    const pollToken = bindingPollTokenRef.current + 1;
    bindingPollTokenRef.current = pollToken;
    setPollingBindingIdByDeviceId((prev) => ({ ...prev, [deviceId]: nextBindingId }));
    addLog(
      log(
        'state',
        'Binding status polling',
        `GET bind/status every ${pollAfterSeconds ?? defaultPollAfterSeconds}s · max ${maxPollAttempts * (pollAfterSeconds ?? defaultPollAfterSeconds)}s`,
        JSON.stringify({ binding_id: nextBindingId, session_id: fallbackSessionId, device_id: deviceId, poll_after_seconds: pollAfterSeconds ?? defaultPollAfterSeconds, max_attempts: maxPollAttempts }, null, 2),
        undefined,
        docsTag('Authentication'),
      ),
    );
    void pollBindStatus(nextBindingId, fallbackSessionId, deviceId, pollAfterSeconds, pollToken);
  };

  const pollBindStatus = async (nextBindingId: string, fallbackSessionId: string, deviceId: string, pollAfterSeconds = defaultPollAfterSeconds, pollToken: number) => {
    let nextDelayMs = pollDelayMs(pollAfterSeconds);
    const clearPolling = () => {
      if (bindingPollTokenRef.current === pollToken) setPollingBindingIdByDeviceId((prev) => ({ ...prev, [deviceId]: undefined }));
    };
    for (let attempt = 1; attempt <= maxPollAttempts; attempt += 1) {
      await sleep(nextDelayMs);
      if (bindingPollTokenRef.current !== pollToken) return;
      try {
        const binding = await relayClient.auth.bindStatus({ bindingId: nextBindingId, deviceId });
        if (bindingPollTokenRef.current !== pollToken) return;
        nextDelayMs = pollDelayMs(binding.poll_after_seconds);
        const nextStatus = normalizeBindStatus(binding);
        const sessionId = binding.session_id ?? fallbackSessionId;
        const phone = binding.phone;
        addLog(
          log(
            'http',
            'Poll binding status',
            `GET /api/v1/auth/bind/status/${nextBindingId} · ${nextStatus}`,
            JSON.stringify({ binding_id: nextBindingId, session_id: sessionId, status: nextStatus, attempt, next_poll_after_seconds: binding.poll_after_seconds ?? defaultPollAfterSeconds }, null, 2),
            'GET',
            docsTag('Authentication'),
          ),
        );
        replaceActiveSession(sessionId, nextStatus, `bind/status poll #${attempt}`, phone, deviceId);
        if (isConnectedStatus(nextStatus)) {
          clearPolling();
          updateStatus('CONNECTED', 'WhatsApp ConnectedEvent received', sessionId, phone, deviceId);
          addLog(log('whatsapp', 'WhatsApp linked', `Active session replaced with ${sessionId}`, `client.AddEventHandler(*events.Connected)`));
          await refreshRuntimeData(sessionId, undefined, deviceId);
          void refreshAuthStatus(deviceId, 'Post-bind current status');
          if (deviceId === selectedDeviceIdRef.current) setWatchView('wa-chats');
          return;
        }
        if (nextStatus === 'EXPIRED' || nextStatus === 'RELOGIN_REQUIRED') {
          clearPolling();
          return;
        }
      } catch (error) {
        addLog(log('http', 'Poll binding status failed', errorMessage(error), `GET /api/v1/auth/bind/status/${nextBindingId} failed`, 'GET', docsTag('Authentication')));
        clearPolling();
        return;
      }
    }
    if (bindingPollTokenRef.current === pollToken) {
      addLog(log('state', 'Binding still pending', `Stopped polling ${nextBindingId} after ${maxPollAttempts} attempts`, JSON.stringify({ binding_id: nextBindingId, max_attempts: maxPollAttempts }, null, 2)));
      clearPolling();
    }
  };

  const simulateDisconnect = () => updateStatus('DISCONNECTED', 'KeepAliveTimeout');
  const simulateReconnect = () => {
    updateStatus('RECONNECTING', 'exponential backoff started');
    setTimeout(() => updateStatus('CONNECTED', 'reconnect success'), 650);
  };
  const simulateRelogin = () => updateStatus('RELOGIN_REQUIRED', 'StreamReplacedEvent');

  const selectChat = async (chatId: string) => {
    setSelectedChatIdByDeviceId((prev) => ({ ...prev, [selectedDeviceId]: chatId }));
    setWatchView('wa-conversation');
    markChatRead(selectedDeviceId, chatId);
    addLog(
      log(
        'http',
        'Load messages',
        `GET /api/v1/chats/${chatId}/messages`,
        `curl -H 'X-Supplier-API-Key: ***' -H 'X-Device-ID: ${selectedDeviceId}' /api/v1/chats/${chatId}/messages`,
        'GET',
        docsTag('Messages'),
      ),
    );
    const messages = await relayClient.messages.listInChat({ chatId, deviceId: selectedDeviceId });
    setMessagesByDeviceId((prev) => ({ ...prev, [selectedDeviceId]: { ...(prev[selectedDeviceId] ?? {}), [chatId]: messages } }));
  };

  const sendMessage = async (body: string) => {
    const trimmed = body.trim();
    if (!trimmed || !selectedChat) return;
    const deviceId = selectedDeviceId;
    const chatId = selectedChatId;
    addLog(
      log(
        'http',
        'Send message',
        `POST /api/v1/chats/${chatId}/messages`,
        `curl -X POST /api/v1/chats/${chatId}/messages -H 'X-Device-ID: ${deviceId}' -d '${JSON.stringify({ msg_type: 'text', body: trimmed })}'`,
        'POST',
        docsTag('Messages'),
      ),
    );
    try {
      const resp: SendMessageResponse = await relayClient.messages.sendText({ chatId, body: trimmed, deviceId });
      const createdAt = resp.created_at ?? new Date().toISOString();
      const ts = new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const msg: MessageResponse = { id: resp.message_id, chat_id: chatId, direction: 'outbound', body: trimmed, sender: 'Relay', timestamp: ts, status: 'accepted', msg_type: 'text', created_at: createdAt };
      setSendFailureByDeviceId((prev) => ({ ...prev, [deviceId]: undefined }));
      setMessagesByDeviceId((prev) => ({ ...prev, [deviceId]: { ...(prev[deviceId] ?? {}), [chatId]: [...(prev[deviceId]?.[chatId] ?? []), msg] } }));
      setChatsByDeviceId((prev) => ({ ...prev, [deviceId]: (prev[deviceId] ?? []).map((c) => (c.id === chatId ? { ...c, last_message: trimmed, last_msg_at: 'now' } : c)) }));
      addLog(
        log(
          'whatsapp',
          'whatsmeow SendMessage()',
          `client.SendMessage(${chatId})`,
          `waClient.SendMessage(ctx, recipientJID, &waE2E.Message{Conversation: proto.String("${trimmed}")})`,
        ),
      );
      addLog(
        log(
          'event',
          'Message accepted',
          'message.accepted — Relay accepted the send request',
          `{ "event_type": "message.accepted", "message_id": "${resp.message_id}", "chat_id": "${chatId}" }`,
        ),
      );
      addLog(
        log(
          'event',
          'Delivery status update',
          'message.status_updated — outbound message delivery tracking',
          `{ "event_type": "message.status_updated", "message_id": "${resp.message_id}", "chat_id": "${chatId}", "delivery_status": "${resp.delivery_status}", "status": "${resp.status}" }`,
        ),
      );
    } catch (error) {
      const failure = sendFailureFromError(error);
      const failedMessage: MessageResponse = {
        id: `failed_${Date.now()}`,
        chat_id: chatId,
        direction: 'outbound',
        body: trimmed,
        sender: 'Relay',
        timestamp: time(),
        status: 'failed',
        msg_type: 'text',
        created_at: new Date().toISOString(),
      };
      setSendFailureByDeviceId((prev) => ({ ...prev, [deviceId]: { code: failure.code, message: failure.message, action: failure.action } }));
      setMessagesByDeviceId((prev) => ({ ...prev, [deviceId]: { ...(prev[deviceId] ?? {}), [chatId]: [...(prev[deviceId]?.[chatId] ?? []), failedMessage] } }));
      if (failure.status) {
        setStatus(failure.status);
        setDevices((prev) =>
          prev.map((device) =>
            device.id === deviceId
              ? {
                  ...device,
                  status: failure.status ?? device.status,
                  session_id: failure.status === 'PENDING' ? undefined : device.session_id,
                  lastNotification: failure.message,
                }
              : device,
          ),
        );
        if (failure.status === 'PENDING' || failure.status === 'RELOGIN_REQUIRED' || failure.status === 'EXPIRED') setWatchView('wa-login');
      }
      void refreshAuthStatus(deviceId, 'Send failure status check');
      addLog(
        log(
          'http',
          'Send message failed',
          `${failure.code ?? 'SEND_FAILED'} · ${failure.message}`,
          JSON.stringify({ code: failure.code, message: errorMessage(error), action: failure.action, mapped_status: failure.status }, null, 2),
          'POST',
          docsTag('Messages'),
        ),
      );
    }
  };

  const simulateInbound = () => {
    void hydrateChats(selectedDeviceId, undefined, selectedChatId);
  };

  const logout = async () => {
    const sessionID = activeSessionId;
    addLog(log('http', 'Logout', `POST /api/v1/auth/unbind · ${sessionID}`, JSON.stringify({ session_id: sessionID }, null, 2), 'POST', docsTag('Authentication')));
    try {
      await relayClient.auth.unbind({ session_id: sessionID, deviceId: selectedDeviceId });
      reconnectPollTokenRef.current += 1;
      setPhase('login');
      setStatus('PENDING');
      setBindingIdByDeviceId((prev) => ({ ...prev, [selectedDeviceId]: undefined }));
      setQrCodeByDeviceId((prev) => ({ ...prev, [selectedDeviceId]: undefined }));
      setQrExpiresAtByDeviceId((prev) => ({ ...prev, [selectedDeviceId]: undefined }));
      setPollingBindingIdByDeviceId((prev) => ({ ...prev, [selectedDeviceId]: undefined }));
      setAuthStatusByDeviceId((prev) => ({ ...prev, [selectedDeviceId]: undefined }));
      setActiveSessionId(initialSessions[0].id);
      setSessions((prev) => prev.filter((session) => session.id !== sessionID));
      setDevices((prev) => prev.map((device) => (device.id === selectedDeviceId ? { ...device, status: 'PENDING', session_id: undefined, unread_count: 0, lastNotification: undefined } : device)));
      setWatchView('wa-login');
      setChatsByDeviceId((prev) => ({ ...prev, [selectedDeviceId]: initialChatState() }));
      setSelectedChatIdByDeviceId((prev) => ({ ...prev, [selectedDeviceId]: initialChatState()[0]?.id ?? '' }));
      setMessagesByDeviceId((prev) => ({ ...prev, [selectedDeviceId]: initialMessageState() }));
      setAccountProfileByDeviceId((prev) => ({ ...prev, [selectedDeviceId]: undefined }));
      setSendFailureByDeviceId((prev) => ({ ...prev, [selectedDeviceId]: undefined }));
      addLog(log('state', 'Logged out', 'Demo returned to QR login. WhatsApp session was explicitly unbound.', `{ "session_id": "${sessionID}", "action": "logout" }`));
    } catch (error) {
      addLog(log('http', 'Logout failed', errorMessage(error), 'POST /api/v1/auth/unbind failed', 'POST'));
    }
  };



  const logoutAllSessions = async () => {
    addLog(log('http', 'Logout all sessions', 'POST /api/v1/auth/unbind', JSON.stringify({}, null, 2), 'POST', docsTag('Authentication')));
    try {
      const result = await relayClient.auth.unbindAll();
      reconnectPollTokenRef.current += 1;
      setPhase('login');
      setStatus('PENDING');
      setActiveSessionId(initialSessions[0].id);
      setSessions([]);
      setDevices((prev) => prev.map((device) => ({ ...device, status: 'PENDING', session_id: undefined, unread_count: 0, lastNotification: undefined })));
      setBindingIdByDeviceId({});
      setQrCodeByDeviceId({});
      setQrExpiresAtByDeviceId({});
      setPollingBindingIdByDeviceId({});
      setAuthStatusByDeviceId({});
      setChatsByDeviceId({});
      setMessagesByDeviceId({});
      setAccountProfileByDeviceId({});
      setSendFailureByDeviceId({});
      setSelectedChatIdByDeviceId({});
      setWatchView('wa-login');
      addLog(log('state', 'Logged out all sessions', `${result.count ?? result.session_ids?.length ?? 0} sessions unbound`, JSON.stringify(result, null, 2)));
    } catch (error) {
      addLog(log('http', 'Logout all failed', errorMessage(error), 'POST /api/v1/auth/unbind failed', 'POST'));
    }
  };

  const selectDevice = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    const device = devices.find((item) => item.id === deviceId);
    if (device?.session_id) {
      setActiveSessionId(device.session_id);
      setStatus(device.status);
      setPhase('connected');
      if ((chatsByDeviceId[deviceId] ?? []).length === 0) void hydrateChats(deviceId, device.session_id);
      if (!accountProfileByDeviceId[deviceId]) void hydrateAccountProfile(deviceId, device.session_id);
    } else {
      setStatus('PENDING');
      setActiveSessionId(initialSessions[0].id);
      setPhase('login');
      setSelectedChatIdByDeviceId((prev) => ({ ...prev, [deviceId]: prev[deviceId] ?? '' }));
      setChatsByDeviceId((prev) => ({ ...prev, [deviceId]: prev[deviceId] ?? [] }));
      setMessagesByDeviceId((prev) => ({ ...prev, [deviceId]: prev[deviceId] ?? {} }));
    }
    setWatchView('devices');
  };

  const createWatch = () => {
    const nextIndex = Math.max(0, ...devices.map((device) => Number.parseInt(device.id.replace(/^watch_demo_/, ''), 10)).filter(Number.isFinite)) + 1;
    const next: WatchDevice = {
      id: `watch_demo_${String(nextIndex).padStart(3, '0')}`,
      name: `Demo Watch ${nextIndex}`,
      model: nextIndex % 2 === 0 ? 'Squady Watch Mini' : 'Squady Watch Pro',
      battery: 70 + (nextIndex % 3) * 7,
      status: 'PENDING',
      unread_count: 0,
    };
    setDevices((prev) => [...prev, next]);
    setChatsByDeviceId((prev) => ({ ...prev, [next.id]: [] }));
    setMessagesByDeviceId((prev) => ({ ...prev, [next.id]: {} }));
    setSelectedChatIdByDeviceId((prev) => ({ ...prev, [next.id]: '' }));
    setReadChatIdsByDeviceId((prev) => ({ ...prev, [next.id]: new Set<string>() }));
    setAccountProfileByDeviceId((prev) => ({ ...prev, [next.id]: undefined }));
    setSendFailureByDeviceId((prev) => ({ ...prev, [next.id]: undefined }));
    setSelectedDeviceId(next.id);
    setStatus('PENDING');
    setPhase('login');
    setWatchView('devices');
    setBindingIdByDeviceId((prev) => ({ ...prev, [next.id]: undefined }));
    setQrCodeByDeviceId((prev) => ({ ...prev, [next.id]: undefined }));
    setQrExpiresAtByDeviceId((prev) => ({ ...prev, [next.id]: undefined }));
    addLog(log('state', 'Create watch device', `${next.name} · ${next.id}`, JSON.stringify({ device_id: next.id }, null, 2)));
  };


  const removeWatchFromFleet = (deviceId: string, logTitle = 'Delete watch device') => {
    if (devices.length <= 1) {
      addLog(log('state', 'Delete watch skipped', 'At least one demo watch must remain.', JSON.stringify({ device_id: deviceId }, null, 2)));
      return;
    }
    const deleted = devices.find((device) => device.id === deviceId);
    const nextDevices = devices.filter((device) => device.id !== deviceId);
    const nextSelected = deviceId === selectedDeviceId ? nextDevices[0] : selectedDevice;
    setDevices(nextDevices);
    setChatsByDeviceId((prev) => { const next = { ...prev }; delete next[deviceId]; return next; });
    setMessagesByDeviceId((prev) => { const next = { ...prev }; delete next[deviceId]; return next; });
    setSelectedChatIdByDeviceId((prev) => { const next = { ...prev }; delete next[deviceId]; return next; });
    setReadChatIdsByDeviceId((prev) => { const next = { ...prev }; delete next[deviceId]; return next; });
    setAccountProfileByDeviceId((prev) => { const next = { ...prev }; delete next[deviceId]; return next; });
    setSendFailureByDeviceId((prev) => { const next = { ...prev }; delete next[deviceId]; return next; });
    setBindingIdByDeviceId((prev) => { const next = { ...prev }; delete next[deviceId]; return next; });
    setQrCodeByDeviceId((prev) => { const next = { ...prev }; delete next[deviceId]; return next; });
    setQrExpiresAtByDeviceId((prev) => { const next = { ...prev }; delete next[deviceId]; return next; });
    setPollingBindingIdByDeviceId((prev) => { const next = { ...prev }; delete next[deviceId]; return next; });
    setAuthStatusByDeviceId((prev) => { const next = { ...prev }; delete next[deviceId]; return next; });
    if (nextSelected) {
      setSelectedDeviceId(nextSelected.id);
      setActiveSessionId(nextSelected.session_id ?? initialSessions[0].id);
      setStatus(nextSelected.status ?? 'PENDING');
    }
    if (deviceId === selectedDeviceId) {
      setPhase(nextSelected?.session_id ? 'connected' : 'login');
      setWatchView('devices');
      setSelectedChatIdByDeviceId((prev) => ({ ...prev, [nextSelected?.id ?? '']: prev[nextSelected?.id ?? ''] ?? '' }));
    }
    addLog(log('state', logTitle, `${deleted?.name ?? deviceId} removed from demo fleet`, JSON.stringify({ device_id: deviceId, remaining: nextDevices.length }, null, 2)));
  };

  const deleteWatch = (deviceId: string) => {
    const target = devices.find((device) => device.id === deviceId);
    if (target?.session_id) {
      addLog(log('state', 'Delete watch needs confirmation', `${target.name} is linked. Confirm logout/unbind before deleting.`, JSON.stringify({ device_id: deviceId, session_id: target.session_id }, null, 2)));
      return;
    }
    removeWatchFromFleet(deviceId);
  };

  const deleteWatchAndLogout = async (deviceId: string) => {
    const target = devices.find((device) => device.id === deviceId);
    if (!target?.session_id) {
      removeWatchFromFleet(deviceId);
      return;
    }
    addLog(log('http', 'Delete watch with logout', `POST /api/v1/auth/unbind · ${target.session_id}`, JSON.stringify({ device_id: deviceId, session_id: target.session_id }, null, 2), 'POST', docsTag('Authentication')));
    try {
      await relayClient.auth.unbind({ session_id: target.session_id, deviceId });
      removeWatchFromFleet(deviceId, 'Delete watch after logout');
    } catch (error) {
      addLog(log('http', 'Delete watch logout failed', errorMessage(error), 'POST /api/v1/auth/unbind failed', 'POST'));
    }
  };

  const openNotification = () => {
    const toast = watchToast;
    if (!toast) return;
    setSelectedDeviceId(toast.device_id);
    const target = devices.find((device) => device.id === toast.device_id);
    if (target?.session_id) {
      setActiveSessionId(target.session_id);
      setStatus(target.status);
      setPhase('connected');
    }
    clearWatchToast();
    if (toast.chat_id) {
      setSelectedChatIdByDeviceId((prev) => ({ ...prev, [toast.device_id]: toast.chat_id ?? '' }));
      markChatRead(toast.device_id, toast.chat_id);
      setWatchView('wa-conversation');
    } else {
      markChatRead(toast.device_id);
      setWatchView('wa-chats');
    }
  };

  const openWhatsApp = () => {
    if (selectedDevice?.status === 'CONNECTED' && selectedDevice.session_id) {
      setActiveSessionId(selectedDevice.session_id);
      setStatus('CONNECTED');
      setPhase('connected');
      setWatchView('wa-chats');
      markChatRead(selectedDevice.id);
      void hydrateChats(selectedDevice.id, selectedDevice.session_id, selectedChatId);
      if (!accountProfileByDeviceId[selectedDevice.id]) void hydrateAccountProfile(selectedDevice.id, selectedDevice.session_id);
      return;
    }
    setWatchView('wa-login');
  };

  const openAccountProfile = () => {
    if (!selectedDevice?.session_id || selectedDevice.status !== 'CONNECTED') {
      setWatchView('wa-login');
      return;
    }
    setActiveSessionId(selectedDevice.session_id);
    setStatus('CONNECTED');
    setPhase('connected');
    setWatchView('wa-profile');
    void hydrateAccountProfile(selectedDevice.id, selectedDevice.session_id);
  };

  const refreshAccountProfile = () => {
    if (!selectedDevice?.session_id) return;
    void hydrateAccountProfile(selectedDevice.id, selectedDevice.session_id);
  };
  const refreshCurrentAuthStatus = () => {
    void refreshAuthStatus(selectedDeviceIdRef.current, 'Manual auth status refresh');
  };

  const backToApps = () => setWatchView('devices');
  const backToChats = () => {
    if (selectedChatId) markChatRead(selectedDeviceId, selectedChatId);
    setWatchView('wa-chats');
  };

  return {
    status,
    sessions,
    devices,
    selectedDevice,
    selectedDeviceId,
    watchView,
    activeSessionId,
    authStatus,
    bindingId,
    qrCode,
    qrExpiresAt,
    isBinding,
    isPollingBindStatus,
    isLoadingChats,
    isLoadingProfile,
    isConnectedView: phase === 'connected',
    chats,
    accountProfile,
    sendFailure,
    selectedChat,
    selectedChatId,
    selectedMessages,
    watchToast,
    clearWatchToast,
    logs,
    selectedLog: logs.find((l) => l.id === selectedLogId) ?? logs[0],
    selectedLogId,
    setSelectedLogId,
    startBind,
    selectDevice,
    createWatch,
    deleteWatch,
    deleteWatchAndLogout,
    openWhatsApp,
    openNotification,
    backToApps,
    backToChats,
    openAccountProfile,
    refreshAccountProfile,
    refreshCurrentAuthStatus,
    simulateDisconnect,
    simulateReconnect,
    simulateRelogin,
    selectChat,
    sendMessage,
    logout,
    logoutAllSessions,
    simulateInbound,
  };
}
