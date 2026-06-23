import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { CheckCircle2, Loader2, QrCode, RefreshCw, Smartphone } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Separator } from './ui/separator';
import type { SessionStatus } from '@squady/whatsapp-relay';

interface LoginPanelProps {
  bindingId?: string;
  expiresAt?: string;
  isBinding: boolean;
  onStartBind: () => void;
  onRefreshStatus?: () => void;
  qrCode?: string;
  status: SessionStatus;
}

function statusVariant(status: SessionStatus) {
  if (status === 'CONNECTED') return 'default';
  if (status === 'RECONNECTING' || status === 'DISCONNECTED') return 'outline';
  if (status === 'QR_READY' || status === 'PENDING') return 'secondary';
  if (status === 'EXPIRED' || status === 'RELOGIN_REQUIRED') return 'destructive';
  return 'outline';
}

function RealQrCode({ value }: { value?: string }) {
  const [dataUrl, setDataUrl] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    if (!value) {
      setDataUrl(undefined);
      return;
    }

    void QRCode.toDataURL(value, { margin: 1, width: 224, errorCorrectionLevel: 'M' }).then((url) => {
      if (!cancelled) setDataUrl(url);
    });

    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <div className="mx-auto grid size-60 place-items-center rounded-xl border bg-background p-4 shadow-xs">
      {dataUrl ? (
        <img src={dataUrl} alt="WhatsApp pairing QR code" className="size-56 rounded-lg" />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-3 rounded-lg bg-muted text-muted-foreground">
          <QrCode className="size-10" />
          <span className="text-xs">Start binding to generate QR</span>
        </div>
      )}
    </div>
  );
}

export function LoginPanel({ bindingId, expiresAt, isBinding, onStartBind, onRefreshStatus, qrCode, status }: LoginPanelProps) {
  const expiryLabel = expiresAt ? new Date(expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : undefined;
  const waiting = status === 'QR_READY' && Boolean(bindingId);
  const waitingReconnect = status === 'RECONNECTING' || status === 'DISCONNECTED';
  const actionHandler = waitingReconnect && onRefreshStatus ? onRefreshStatus : onStartBind;

  return (
    <div className="flex h-full items-center justify-center bg-muted/40 p-8">
      <Card className="w-full max-w-105">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 grid size-10 place-items-center rounded-full bg-primary text-primary-foreground">
            <QrCode />
          </div>
          <Badge variant={statusVariant(status)} className="mx-auto font-mono text-[10px]">
            {status}
          </Badge>
          <CardTitle className="mt-2 text-2xl">{waitingReconnect ? 'Waiting for reconnect' : 'Connect to WhatsApp'}</CardTitle>
          <CardDescription>
            {waitingReconnect ? 'Relay is polling auth/status and will restore the chat view after WhatsApp reconnects.' : 'Scan this QR code from WhatsApp Linked Devices. The demo polls bind/status until whatsmeow reports connected.'}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <RealQrCode value={qrCode} />

          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            {status === 'CONNECTED' ? <CheckCircle2 className="size-4" /> : waiting || waitingReconnect ? <Loader2 className="size-4 animate-spin" /> : <Smartphone className="size-4" />}
            <span>{waitingReconnect ? 'Checking auth/status every 5s' : waiting ? `Waiting for phone scan · ${bindingId}` : bindingId ? `binding_id ${bindingId}` : 'No active binding yet'}</span>
          </div>

          <Separator />

          <div className="rounded-lg bg-muted p-3 font-mono text-[11px] text-muted-foreground">
            <div>POST /api/v1/auth/bind/start</div>
            <div>GET&nbsp; /api/v1/auth/bind/status/:id</div>
            <div className="mt-2 truncate">expires_at {expiryLabel ?? 'pending'}</div>
          </div>
        </CardContent>

        <CardFooter>
          <Button className="w-full" onClick={actionHandler} disabled={isBinding}>
            {isBinding ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <RefreshCw data-icon="inline-start" />}
            {waitingReconnect ? 'Check reconnect status' : bindingId ? 'Refresh binding QR' : 'Start WhatsApp binding'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
