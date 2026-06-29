import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ChatResponse, MessageResponse } from '@squady/whatsapp-relay';
import App from './App';
import { LogView } from './components/LogView';
import { WatchRelayDemo } from './components/WatchRelayDemo';
import type { DemoLog } from './lib/types';
import type { WatchDevice } from './components/WatchRelayDemo';

const mocks = vi.hoisted(() => ({
  connectEvents: vi.fn(),
  fetchEvents: vi.fn(),
}));

vi.mock('./lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/api')>();
  const relayClient = {
    auth: {
      status: vi.fn().mockResolvedValue({
        phase: 'connected',
        recommended_action: 'show_connected',
        reason_code: 'ACTIVE_SESSION',
        can_start_bind: false,
        device_id: 'watch_demo_001',
        device_binding: { bound: true, state: 'bound', session_id: 'session_demo_001' },
        session: null,
        server_time: '2026-06-08T00:00:00Z',
      }),
      startBind: vi.fn(),
      bindStatus: vi.fn(),
      unbind: vi.fn(),
      unbindAll: vi.fn(),
    },
    account: {
      profile: vi.fn().mockResolvedValue({
        session_id: 'session_demo_001',
        device_id: 'watch_demo_001',
        status: 'CONNECTED',
        phone: '+1 415 555 0198',
        wa_jid: '14155550198@s.whatsapp.net',
        display_name: 'Squady Relay Demo',
        push_name: 'Relay Demo',
        status_text: 'Available',
        avatar: null,
        contact: {
          wa_me_url: 'https://wa.me/14155550198',
          qr_payload: 'https://wa.me/qr/DEMO1234567890',
          qr_image_url: '/api/v1/account/profile/qr.png?session_id=session_demo_001&size=512',
          qr_kind: 'native_contact_qr',
        },
        updated_at: '2026-06-08T00:00:00Z',
      }),
    },
    sessions: { list: vi.fn().mockResolvedValue([]) },
    chats: { list: vi.fn().mockResolvedValue([]) },
    messages: {
      listInChat: vi.fn().mockResolvedValue([]),
      sendText: vi.fn(),
    },
    events: {
      fetchMissed: mocks.fetchEvents,
      subscribe: vi.fn(),
    },
  };
  return { ...actual, relayClient, connectEvents: mocks.connectEvents };
});

beforeEach(async () => {
  window.localStorage.clear();
  mocks.connectEvents.mockReset();
  mocks.connectEvents.mockReturnValue(() => undefined);
  mocks.fetchEvents.mockReset();
  mocks.fetchEvents.mockResolvedValue({ events: [], has_more: false });
  const { relayClient } = await import('./lib/api');
  vi.mocked(relayClient.auth.status).mockResolvedValue({
    phase: 'connected',
    recommended_action: 'show_connected',
    reason_code: 'ACTIVE_SESSION',
    can_start_bind: false,
    device_id: 'watch_demo_001',
    device_binding: { bound: true, state: 'bound', session_id: 'session_demo_001' },
    session: null,
    server_time: '2026-06-08T00:00:00Z',
  });
  vi.mocked(relayClient.account.profile).mockResolvedValue({
    session_id: 'session_demo_001',
    device_id: 'watch_demo_001',
    status: 'CONNECTED',
    phone: '+1 415 555 0198',
    wa_jid: '14155550198@s.whatsapp.net',
    display_name: 'Squady Relay Demo',
    push_name: 'Relay Demo',
    status_text: 'Available',
    avatar: null,
    contact: {
      wa_me_url: 'https://wa.me/14155550198',
      qr_payload: 'https://wa.me/qr/DEMO1234567890',
      qr_image_url: '/api/v1/account/profile/qr.png?session_id=session_demo_001&size=512',
      qr_kind: 'native_contact_qr',
    },
    updated_at: '2026-06-08T00:00:00Z',
  });
  vi.mocked(relayClient.sessions.list).mockResolvedValue([]);
  vi.mocked(relayClient.chats.list).mockResolvedValue([]);
  vi.mocked(relayClient.messages.listInChat).mockResolvedValue([]);
  vi.mocked(relayClient.messages.sendText).mockResolvedValue({
    message_id: 'msg_1',
    status: 'accepted',
    delivery_status: 'pending',
    created_at: '2026-06-08T00:00:00Z',
  });
  vi.mocked(relayClient.auth.startBind).mockResolvedValue({
    binding_id: 'bind_1',
    session_id: 'session_demo_001',
    status: 'QR_READY',
    qr_code: 'qr',
    poll_after_seconds: 5,
  });
  vi.mocked(relayClient.auth.bindStatus).mockResolvedValue({
    binding_id: 'bind_1',
    session_id: 'session_demo_001',
    status: 'QR_READY',
    poll_after_seconds: 5,
  });
  vi.mocked(relayClient.auth.unbind).mockResolvedValue({
    success: true,
    session_id: 'session_demo_001',
    device_binding: { bound: false, state: 'unbound' },
  });
  vi.mocked(relayClient.auth.unbindAll).mockResolvedValue({
    success: true,
    count: 0,
    session_ids: [],
    device_binding: { bound: false, state: 'unbound' },
  });
});

const connectedState: { devices: WatchDevice[]; chatsByDeviceId: Record<string, ChatResponse[]>; messagesByDeviceId: Record<string, Record<string, MessageResponse[]>>; selectedChatIdByDeviceId: Record<string, string>; selectedDeviceId: string; watchView: 'wa-chats' } = {
  devices: [{ id: 'watch_demo_001', name: 'Squady Watch', model: 'Squady Watch Pro', battery: 82, session_id: 'session_demo_001', status: 'CONNECTED', unread_count: 0 }],
  selectedDeviceId: 'watch_demo_001',
  watchView: 'wa-chats',
  chatsByDeviceId: {
    watch_demo_001: [{ id: 'customer-demo', session_id: 'session_demo_001', name: 'Customer Demo', chat_type: 'dm', avatar: 'CD', last_message: 'Can the watch reply now?', last_msg_at: 'now', unread_count: 1 }],
  },
  messagesByDeviceId: {
    watch_demo_001: {
      'customer-demo': [{ id: 'm1', chat_id: 'customer-demo', direction: 'inbound', body: 'Can the watch reply now?', sender: 'Customer', timestamp: '12:41', msg_type: 'text', status: 'delivered', created_at: '2026-06-08T00:00:00Z' }],
    },
  },
  selectedChatIdByDeviceId: { watch_demo_001: 'customer-demo' },
};

describe('WhatsApp Relay demo visual smoke', () => {
  it('renders the multi-watch shell, sessions table, and logout-all control', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /WhatsApp Relay POC Demo/i })).toBeInTheDocument();
    expect(screen.getAllByText('Squady Watch').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Sessions' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Device / Session' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Logout all/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'WhatsApp' })).toBeInTheDocument();
  });

  it('refreshes the pairing QR from bind/status polling updates', async () => {
    const user = userEvent.setup();
    const { relayClient } = await import('./lib/api');
    vi.mocked(relayClient.auth.status).mockResolvedValue({
      phase: 'idle',
      recommended_action: 'start_bind',
      reason_code: 'NO_ACTIVE_SESSION',
      can_start_bind: true,
      device_id: 'watch_demo_001',
      device_binding: { bound: false, state: 'unbound' },
      binding: null,
      session: null,
      server_time: '2026-06-08T00:00:00Z',
    });
    vi.mocked(relayClient.auth.startBind).mockResolvedValue({
      binding_id: 'bind_1',
      session_id: 'session_demo_001',
      status: 'QR_READY',
      qr_code: 'first-qr',
      expires_at: '2026-06-08T00:01:00Z',
      poll_after_seconds: 1,
    });
    vi.mocked(relayClient.auth.bindStatus).mockResolvedValue({
      binding_id: 'bind_1',
      session_id: 'session_demo_001',
      status: 'QR_READY',
      qr_code: 'rotated-qr',
      expires_at: '2026-06-08T00:02:00Z',
      poll_after_seconds: 1,
    });

    render(<App />);

    await user.click(screen.getByRole('button', { name: 'WhatsApp' }));
    await user.click(await screen.findByRole('button', { name: '开始绑定' }));

    const qrImage = (await screen.findByAltText('WhatsApp pairing QR code')) as HTMLImageElement;
    await waitFor(() => expect(qrImage.src).toContain('data:image/png'));
    const firstSrc = qrImage.src;

    await waitFor(() => expect(relayClient.auth.bindStatus).toHaveBeenCalledWith({ bindingId: 'bind_1', deviceId: 'watch_demo_001' }), { timeout: 2500 });

    await waitFor(() => expect(qrImage.src).not.toBe(firstSrc), { timeout: 2500 });
    const refreshedExpiry = new Date('2026-06-08T00:02:00Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    expect(screen.getByText(`过期时间 ${refreshedExpiry}`)).toBeInTheDocument();
  }, 10_000);

  it('ignores heartbeat UI side effects and replays missed events after reconnect', async () => {
    window.localStorage.setItem('whatsapp-relay.event-cursor.v1', 'cursor_1');
    let onEvent: ((event: { event_id: string; event_type: string; cursor?: string; session_id: string; data?: Record<string, unknown> }) => void) | undefined;
    mocks.connectEvents.mockImplementation((_client, handler) => {
      onEvent = handler;
      return () => undefined;
    });
    mocks.fetchEvents.mockResolvedValue({
      events: [
        {
          event_id: 'evt_2',
          event_type: 'message.new',
          cursor: 'cursor_2',
          timestamp: '2026-05-10T00:00:01Z',
          session_id: 'session_demo_001',
          device_id: 'watch_demo_001',
          data: { chat_id: 'customer-demo', chat_name: 'Customer Demo', message_id: 'msg_2', body: 'missed while offline', direction: 'inbound' },
        },
      ],
      next_cursor: 'cursor_2',
      has_more: false,
    });

    render(<App />);

    expect(mocks.connectEvents).toHaveBeenCalledTimes(1);
    onEvent?.({ event_id: 'heartbeat_1', event_type: 'heartbeat', cursor: 'heartbeat_1', session_id: '', data: { server_time: '2026-05-10T00:00:00Z' } });

    expect((await screen.findAllByText('missed while offline')).length).toBeGreaterThan(0);
    expect(mocks.fetchEvents).toHaveBeenCalledWith({ after: 'cursor_1' });
    expect(window.localStorage.getItem('whatsapp-relay.event-cursor.v1')).toBe('cursor_2');
    expect(screen.queryByText(/server_time/)).not.toBeInTheDocument();
  });

  it('logs outbound websocket message events before applying chat state', async () => {
    let onEvent:
      | ((event: { event_id: string; event_type: string; cursor?: string; timestamp?: string; session_id: string; device_id?: string; data?: Record<string, unknown> }) => void)
      | undefined;
    mocks.connectEvents.mockImplementation((_client, handler) => {
      onEvent = handler;
      return () => undefined;
    });

    render(<App />);

    onEvent?.({
      event_id: 'evt_outbound_1',
      event_type: 'message.new',
      cursor: 'cursor_outbound_1',
      timestamp: '2026-05-10T00:00:01Z',
      session_id: 'session_demo_001',
      device_id: 'watch_demo_001',
      data: { chat_id: 'customer-demo', chat_name: 'Customer Demo', message_id: 'msg_outbound_1', body: 'sent from phone', direction: 'outbound', msg_type: 'text' },
    });

    expect(await screen.findByText('Relay event received')).toBeInTheDocument();
    expect(await screen.findByText('Outbound message.new')).toBeInTheDocument();
    expect(screen.getAllByText(/sent from phone/).length).toBeGreaterThan(0);
    expect(window.localStorage.getItem('whatsapp-relay.event-cursor.v1')).toBe('cursor_outbound_1');
  });

  it('reconciles stale local watch state against active sessions after account replacement', async () => {
    window.localStorage.setItem(
      'whatsapp-relay.watch-demo.v1',
      JSON.stringify({
        devices: [
          { id: 'watch_demo_003', name: 'Demo Watch 3', model: 'Squady Watch Pro', battery: 82, session_id: 'sess_old', status: 'CONNECTED', unread_count: 2, lastNotification: 'WhatsApp connected' },
          { id: 'watch_demo_004', name: 'Demo Watch 4', model: 'Squady Watch Mini', battery: 75, session_id: 'sess_new', status: 'CONNECTED', unread_count: 0 },
        ],
        selectedDeviceId: 'watch_demo_003',
        watchView: 'devices',
      }),
    );
    const { relayClient } = await import('./lib/api');
    vi.mocked(relayClient.sessions.list).mockResolvedValue([
      { id: 'sess_new', device_id: 'watch_demo_004', supplier_id: 'supplier_demo', active: true, status: 'CONNECTED', worker_node: 'singleton-api', proxy_address: 'not assigned', created_at: '2026-06-08T00:00:00Z', updated_at: 'now' },
    ]);

    render(<App />);

    expect(await screen.findByText('Session replaced or inactive')).toBeInTheDocument();
    expect(screen.getByText('EXPIRED')).toBeInTheDocument();
    expect(screen.getByText('Demo Watch 4')).toBeInTheDocument();
  });

  it('keeps watch message sending visually wired', async () => {
    const user = userEvent.setup();

    function Harness() {
      const [messages, setMessages] = useState(connectedState.messagesByDeviceId.watch_demo_001['customer-demo']);
      return (
        <WatchRelayDemo
          activeView="wa-conversation"
          chats={connectedState.chatsByDeviceId.watch_demo_001}
          devices={connectedState.devices}
          isBinding={false}
          isLoadingChats={false}
          isLoadingProfile={false}
          messages={messages}
          onBackToApps={vi.fn()}
          onBackToChats={vi.fn()}
          onCreateWatch={vi.fn()}
          onDeleteWatch={vi.fn()}
          onDeleteWatchAndLogout={vi.fn()}
          onInbound={vi.fn()}
          onLogout={vi.fn()}
          onOpenProfile={vi.fn()}
          onOpenWhatsApp={vi.fn()}
          onNotificationClick={vi.fn()}
          onNotificationDismiss={vi.fn()}
          onSelectChat={vi.fn()}
          onSelectDevice={vi.fn()}
          onSend={(body) => setMessages((current) => [...current, { id: 'msg_test', chat_id: 'customer-demo', direction: 'outbound', body, sender: 'Relay', timestamp: 'now', status: 'accepted', msg_type: 'text', created_at: '2026-06-08T00:00:01Z' }])}
          onStartBind={vi.fn()}
          onRefreshStatus={vi.fn()}
          onRefreshProfile={vi.fn()}
          selectedChat={connectedState.chatsByDeviceId.watch_demo_001[0]}
          selectedChatId="customer-demo"
          selectedDevice={connectedState.devices[0]}
        />
      );
    }

    render(<Harness />);
    const composer = screen.getByTestId('watch-message-composer');
    expect(composer).toHaveClass('shrink-0');
    expect(composer).not.toHaveClass('sticky');
    expect(composer).toHaveClass('pb-4');
    await user.type(screen.getByPlaceholderText('回复'), 'hello from test');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(await screen.findByText('hello from test')).toBeInTheDocument();
    expect(await screen.findByText(/accepted/)).toBeInTheDocument();
  });

  it('shows the account QR entry in the watch chat list', async () => {
    const openProfile = vi.fn();
    render(
      <WatchRelayDemo
        accountProfile={{
          session_id: 'session_demo_001',
          device_id: 'watch_demo_001',
          status: 'CONNECTED',
          phone: '+1 415 555 0198',
          display_name: 'Squady Relay Demo',
          avatar: null,
          contact: {
            wa_me_url: 'https://wa.me/14155550198',
            qr_payload: 'https://wa.me/qr/DEMO1234567890',
            qr_image_url: '/api/v1/account/profile/qr.png?session_id=session_demo_001&size=512',
            qr_kind: 'native_contact_qr',
          },
          updated_at: '2026-06-08T00:00:00Z',
        }}
        activeView="wa-chats"
        chats={connectedState.chatsByDeviceId.watch_demo_001}
        devices={connectedState.devices}
        isBinding={false}
        isLoadingChats={false}
        isLoadingProfile={false}
        messages={[]}
        onBackToApps={vi.fn()}
        onBackToChats={vi.fn()}
        onCreateWatch={vi.fn()}
        onDeleteWatch={vi.fn()}
        onDeleteWatchAndLogout={vi.fn()}
        onInbound={vi.fn()}
        onLogout={vi.fn()}
        onOpenProfile={openProfile}
        onOpenWhatsApp={vi.fn()}
        onNotificationClick={vi.fn()}
        onNotificationDismiss={vi.fn()}
        onSelectChat={vi.fn()}
        onSelectDevice={vi.fn()}
        onSend={vi.fn()}
        onStartBind={vi.fn()}
        onRefreshStatus={vi.fn()}
        onRefreshProfile={vi.fn()}
        selectedChat={connectedState.chatsByDeviceId.watch_demo_001[0]}
        selectedChatId="customer-demo"
        selectedDevice={connectedState.devices[0]}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Squady Relay Demo/i }));

    expect(screen.getByText('WhatsApp 二维码')).toBeInTheDocument();
    expect(openProfile).toHaveBeenCalledTimes(1);
  });

  it('refreshes auth status instead of starting binding while disconnected', async () => {
    const refreshStatus = vi.fn();
    const startBind = vi.fn();
    render(
      <WatchRelayDemo
        activeView="wa-login"
        chats={[]}
        devices={[{ ...connectedState.devices[0], status: 'DISCONNECTED', lastNotification: 'WhatsApp 离线，等待重连' }]}
        isBinding={false}
        isLoadingChats={false}
        isLoadingProfile={false}
        messages={[]}
        onBackToApps={vi.fn()}
        onBackToChats={vi.fn()}
        onCreateWatch={vi.fn()}
        onDeleteWatch={vi.fn()}
        onDeleteWatchAndLogout={vi.fn()}
        onInbound={vi.fn()}
        onLogout={vi.fn()}
        onOpenProfile={vi.fn()}
        onOpenWhatsApp={vi.fn()}
        onNotificationClick={vi.fn()}
        onNotificationDismiss={vi.fn()}
        onSelectChat={vi.fn()}
        onSelectDevice={vi.fn()}
        onSend={vi.fn()}
        onStartBind={startBind}
        onRefreshStatus={refreshStatus}
        onRefreshProfile={vi.fn()}
        selectedChatId=""
        selectedDevice={{ ...connectedState.devices[0], status: 'DISCONNECTED', lastNotification: 'WhatsApp 离线，等待重连' }}
      />,
    );

    expect(screen.getByText('等待 WhatsApp 恢复')).toBeInTheDocument();
    expect(screen.getByText('当前会话保留中')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '刷新状态' }));

    expect(refreshStatus).toHaveBeenCalledTimes(1);
    expect(startBind).not.toHaveBeenCalled();
  });

  it('copies log rows without crashing', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const logs: DemoLog[] = [
      {
        id: 'log_1',
        timestamp: '01:23:45 AM',
        kind: 'http',
        method: 'POST',
        title: 'Send message',
        detail: 'POST /api/v1/chats/customer-demo/messages',
        code: 'curl -X POST /api/v1/chats/customer-demo/messages',
        docsHref: 'https://github.com/your-org/whatsapp-relay#readme',
      },
    ];

    render(<LogView logs={logs} selectedLogId="log_1" onSelect={vi.fn()} />);
    await user.click(screen.getByRole('row', { name: /Send message/i }));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('POST Send message'));
  });
});
