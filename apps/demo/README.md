# WhatsApp Relay Demo

Vite + React + TypeScript demo web view for customer POC.

## Current scope

- WhatsApp Web-like flow: QR login first, then chat list + conversation.
- Right-side developer panel: live logs, session state machine timeline, and sessions table.
- shadcn/ui nova preset with native components where possible (`Button`, `Card`, `Badge`, `Table`, `ScrollArea`, `InputGroup`, etc.).
- API calls use the workspace `@squady/whatsapp-relay` SDK directly.
- No runtime mock API is bundled; the demo expects a reachable Relay API.

## Run

```bash
cd apps/demo
npm install
npm run dev
```

Open the printed local URL. If port 5173 is busy, Vite will choose the next available port.

## Build

```bash
npm run build
```

## Docker Compose

```bash
cd apps/demo
# optional: export VITE_RELAY_API_URL / VITE_SUPPLIER_API_KEY / VITE_OWNER_USER_ID / VITE_APP_ID before build
DEMO_PORT=8081 docker compose up --build
```

The container serves the built Vite app with nginx at `http://localhost:8081`.

For Vite dev/preview behind a reverse proxy, set `VITE_ALLOWED_HOSTS` to the hosts you trust. The demo no longer ships with an internal hostname allowlist.

## API integration

```bash
cp .env.example .env.local
# edit VITE_RELAY_API_URL / VITE_SUPPLIER_API_KEY / VITE_OWNER_USER_ID as needed
npm run dev
```

`src/lib/api.ts` creates the shared SDK client with `createRelayClient()` and exports only a small `connectEvents()` helper for the WebSocket subscription. Configure `VITE_RELAY_API_URL` / `VITE_SUPPLIER_API_KEY` for non-local environments; local development defaults to `http://localhost:8080` and `change-me`.

The SDK sends `X-Supplier-API-Key` plus per-device `X-Device-ID` and owner context headers (`X-Owner-User-ID` or `X-App-ID`) where relevant. The demo uses API key auth for WebSocket subscriptions so it stays aligned with the existing integration flow. For trusted non-browser clients that use auth headers, the expected headers are `X-Supplier-API-Key`, `X-Device-ID`, and `X-Owner-User-ID`.

## File map

```text
src/
├── App.tsx
├── components/
│   ├── LoginPanel.tsx          # QR login card
│   ├── WhatsAppShell.tsx       # logged-in shell
│   ├── ChatList.tsx
│   ├── ConversationView.tsx
│   ├── MessageComposer.tsx     # shadcn InputGroup composer
│   ├── DevPanel.tsx
│   ├── LogView.tsx             # shadcn Table + ScrollArea
│   ├── StateMachine.tsx        # lifecycle timeline
│   ├── SessionList.tsx         # shadcn Table + ScrollArea
│   └── ui/                     # shadcn components
├── hooks/use-demo-state.ts
└── lib/
    ├── api.ts                  # SDK client + event subscription helper
    ├── seed-data.ts
    ├── types.ts
    └── utils.ts
```

## Deprecated files removed

The old static prototype files have been removed:

- `app.js`
- `styles.css`

The demo entrypoint is now `src/main.tsx` via Vite.
