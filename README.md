# WhatsApp Relay OSS

Open-source workspace for the WhatsApp Relay SDK and demo app.

## Layout

- `packages/sdk` - TypeScript SDK for supplier-side and companion-app integrations
- `apps/demo` - Vite + React demo that exercises the SDK against a Relay API

## Install

```bash
npm install
```

## Run the demo

```bash
npm run dev:demo
```

The demo reads configuration from `apps/demo/.env.local` or the shell environment. `apps/demo/.env.example` contains safe placeholders.

## SDK usage

```ts
import { createRelayClient } from '@squady/whatsapp-relay';

const relay = createRelayClient({
  baseUrl: 'https://relay.example.com',
  supplierApiKey: process.env.RELAY_SUPPLIER_API_KEY!,
  deviceId: 'device_demo_001',
  ownerUserId: 'user_demo',
});
```

For trusted clients, the WebSocket auth headers are:

- `X-Supplier-API-Key`
- `X-Device-ID`
- `X-Owner-User-ID`

## WebSocket cursor rules

- Use API key auth for the demo and for trusted clients that stay inside your backend boundary.
- If you adopt `event_token` later for browser-safe subscriptions, connect with `?event_token=<token>&after=<last_cursor>`.
- Only persist cursors for events that are not `heartbeat` and whose `cursor` is non-empty.
- Reconnect with the last saved cursor, not every received event.

## Safety note

Do not ship a long-lived `X-Supplier-API-Key` in a public browser client or other public frontend bundle. Keep it on a trusted backend or gate browser access with a short-lived token if you later add that flow.
