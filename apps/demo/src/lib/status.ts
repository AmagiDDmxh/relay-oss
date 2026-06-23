import type { SessionStatus } from '@squady/whatsapp-relay';

export function normalizeSessionStatus(status?: SessionStatus | string): SessionStatus {
  if (!status) return 'PENDING';
  switch (status?.toUpperCase()) {
    case 'PENDING':
      return 'PENDING';
    case 'CONNECTING':
    case 'SCANNING':
    case 'PAIRING':
    case 'QR':
    case 'CODE':
      return 'QR_READY';
    case 'QR_READY':
      return 'QR_READY';
    case 'CONNECTED':
      return 'CONNECTED';
    case 'DISCONNECTED':
      return 'DISCONNECTED';
    case 'RECONNECTING':
      return 'RECONNECTING';
    case 'RELOGIN_REQUIRED':
      return 'RELOGIN_REQUIRED';
    case 'EXPIRED':
      return 'EXPIRED';
    default:
      return 'PENDING';
  }
}

export function isConnectedStatus(status: SessionStatus) {
  return status === 'CONNECTED';
}
