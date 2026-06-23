import type { AuthStatusResponse, SessionResponse, SessionStatus } from '@squady/whatsapp-relay';
import type { DemoLog } from '@/lib/types';
import { Button } from './ui/button';
import { LogView } from './LogView';
import { SessionList } from './SessionList';
import { StateMachine } from './StateMachine';

export function DevPanel({
  logs,
  selectedLogId,
  onSelectLog,
  activeSessionId,
  authStatus,
  bindingId,
  deviceId,
  isBinding,
  isPollingBindStatus,
  qrExpiresAt,
  status,
  sessions,
  onDisconnect,
  onReconnect,
  onRelogin,
  onLogoutAllSessions,
}: {
  logs: DemoLog[];
  selectedLogId?: string;
  onSelectLog: (id: string) => void;
  activeSessionId?: string;
  authStatus?: AuthStatusResponse;
  bindingId?: string;
  deviceId?: string;
  isBinding?: boolean;
  isPollingBindStatus?: boolean;
  qrExpiresAt?: string;
  status: SessionStatus;
  sessions: SessionResponse[];
  onDisconnect: () => void;
  onReconnect: () => void;
  onRelogin: () => void;
  onLogoutAllSessions?: () => void;
}) {
  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col gap-2 overflow-x-hidden overflow-y-auto border-l border-neutral-200 bg-[#f7f8fa] p-0 pb-16 [scrollbar-gutter:stable]">
      <LogView logs={logs} selectedLogId={selectedLogId} onSelect={onSelectLog} />
      <StateMachine
        activeSessionId={activeSessionId}
        authStatus={authStatus}
        bindingId={bindingId}
        deviceId={deviceId}
        isBinding={isBinding}
        isPollingBindStatus={isPollingBindStatus}
        qrExpiresAt={qrExpiresAt}
        status={status}
      />
      <div className="grid shrink-0 grid-cols-3 gap-2 px-2 py-0">
        <Button variant="outline" size="sm" onClick={onDisconnect}>
          断开
        </Button>
        <Button variant="outline" size="sm" onClick={onReconnect}>
          重连
        </Button>
        <Button variant="outline" size="sm" onClick={onRelogin}>
          重登
        </Button>
      </div>
      <SessionList sessions={sessions} onLogoutAll={onLogoutAllSessions} />
    </aside>
  );
}
