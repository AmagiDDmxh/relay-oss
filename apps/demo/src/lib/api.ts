import { createRelayClient, RelayApiError } from '@squady/whatsapp-relay';
import type { RelayClient, RelayEvent } from '@squady/whatsapp-relay';

export { RelayApiError };

const relayBaseUrl = import.meta.env.VITE_RELAY_API_URL || 'http://localhost:8080';
const supplierApiKey = import.meta.env.VITE_SUPPLIER_API_KEY || 'change-me';

export const relayClient: RelayClient = createRelayClient({
  baseUrl: relayBaseUrl,
  supplierApiKey,
  deviceId: import.meta.env.VITE_DEVICE_ID,
  ownerUserId: import.meta.env.VITE_OWNER_USER_ID,
  appId: import.meta.env.VITE_APP_ID,
});

type RelayEventSubscription = {
  on(callback: (event: RelayEvent) => void | Promise<void>, onError?: (error: unknown) => void): () => void;
};

type RelayEventSource = {
  events: {
    subscribe(input?: Parameters<RelayClient['events']['subscribe']>[0]): RelayEventSubscription;
  };
};

export function connectEvents(
  client: RelayEventSource,
  onEvent: (event: RelayEvent) => void,
  input?: Parameters<RelayClient['events']['subscribe']>[0],
): () => void {
  let closed = false;
  const stream = client.events.subscribe(input ?? { supplierApiKeyInQuery: true });
  const unsubscribe = stream.on(
    (event) => {
      if (!closed) onEvent(event);
    },
    (error) => {
      if (!closed) console.warn('Relay event stream failed', error);
    },
  );
  return () => {
    closed = true;
    unsubscribe();
  };
}
