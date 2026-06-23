import { describe, expect, it, vi } from 'vitest';
import type { RelayEvent } from '@squady/whatsapp-relay';
import { connectEvents } from './api';

describe('connectEvents', () => {
  it('subscribes with supplier-key query auth and forwards runtime events', () => {
    const unsubscribe = vi.fn();
    const event: RelayEvent = {
      event_id: 'evt_1',
      event_type: 'message.new',
      timestamp: '2026-06-08T00:00:00Z',
      session_id: 'sess_1',
      data: { chat_id: 'chat_1', message_id: 'msg_1', body: 'hello' },
    };
    const stream = {
      on: vi.fn((onEvent: (nextEvent: RelayEvent) => void) => {
        onEvent(event);
        return unsubscribe;
      }),
    };
    const client = {
      events: {
        subscribe: vi.fn(() => stream),
      },
    };
    const onEvent = vi.fn();

    const disconnect = connectEvents(client, onEvent);

    expect(client.events.subscribe).toHaveBeenCalledWith({ supplierApiKeyInQuery: true });
    expect(onEvent).toHaveBeenCalledWith(event);
    disconnect();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('passes through a short-lived event token when provided', () => {
    const stream = { on: vi.fn(() => vi.fn()) };
    const client = {
      events: {
        subscribe: vi.fn(() => stream),
      },
    };

    connectEvents(client, vi.fn(), { eventToken: 'evt_token', after: 'cur_1' });

    expect(client.events.subscribe).toHaveBeenCalledWith({ eventToken: 'evt_token', after: 'cur_1' });
  });
});
