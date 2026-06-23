import { MoreHorizontal, QrCode, RefreshCw, Trash2, Unlink } from 'lucide-react';
import type { SessionResponse } from '@squady/whatsapp-relay';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

const variant = (status: SessionResponse['status']) => (String(status).toUpperCase() === 'CONNECTED' ? 'default' : String(status).toUpperCase() === 'QR_READY' ? 'secondary' : 'outline');

function sessionActions(status: SessionResponse['status']) {
  const normalized = String(status).toUpperCase();
  if (normalized === 'CONNECTED') return [{ label: 'Unbind', icon: Unlink }];
  if (normalized === 'DISCONNECTED' || normalized === 'RECONNECTING') return [{ label: 'Reconnect', icon: RefreshCw }];
  if (normalized === 'RELOGIN_REQUIRED' || normalized === 'EXPIRED') return [{ label: 'Relogin', icon: QrCode }];
  if (normalized === 'QR_READY' || normalized === 'PENDING') return [{ label: 'Cancel', icon: Trash2 }];
  return [{ label: 'More', icon: MoreHorizontal }];
}

export function SessionList({ sessions, onLogoutAll }: { sessions: SessionResponse[]; onLogoutAll?: () => void }) {
  return (
    <section className="flex min-h-65 flex-1 flex-col rounded-none border bg-card text-card-foreground shadow-xs">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2">
        <div>
          <h2 className="text-sm font-semibold">Sessions</h2>
          <p className="text-xs text-muted-foreground">Linked-device workers</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{sessions.length} total</Badge>
          {onLogoutAll ? (
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onLogoutAll} disabled={sessions.length === 0}>
              <Unlink className="size-3.5" />
              Logout all
            </Button>
          ) : null}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Device / Session</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => (
              <TableRow key={session.id}>
                <TableCell className="max-w-37.5">
                  <div className="truncate font-mono text-xs font-medium">{session.device_id ?? 'device pending'}</div>
                  <div className="truncate font-mono text-[10px] text-muted-foreground">{session.id}</div>
                  <div className="truncate text-xs text-muted-foreground">{session.phone ?? 'phone pending'}</div>
                </TableCell>
                <TableCell>
                  <Badge variant={variant(session.status)} className="font-mono text-[10px]">
                    {session.status}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  {sessionActions(session.status).map(({ label, icon: Icon }) => (
                    <Button key={label} variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled title="Wire backend action next">
                      <Icon className="size-3.5" />
                      {label}
                    </Button>
                  ))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </section>
  );
}
