import type { SessionResponse } from '@squady/whatsapp-relay';
import type { DemoLog } from './types';

export const initialSessions: SessionResponse[] = [
  {
    id: 'session_demo_001',
    phone: undefined,
    status: 'QR_READY',
    worker_node: 'local-poc',
    proxy_address: 'socks5-demo-01',
    last_event: 'qr.generated',
    created_at: new Date(0).toISOString(),
    updated_at: 'now',
  },
];

export const initialLogs: DemoLog[] = [];
