import { useEffect, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { Bell, ChevronLeft, MessageCircle, Plus, QrCode, RefreshCw, Trash2, UserRound, Watch, X } from 'lucide-react';
import type { AccountProfileResponse, ChatResponse, MessageResponse, SessionStatus } from '@squady/whatsapp-relay';
import type { WatchSendFailure, WatchToast } from '@/hooks/use-demo-state';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

export type WatchAppView = 'devices' | 'wa-login' | 'wa-chats' | 'wa-conversation' | 'wa-profile';

export interface WatchDevice {
  id: string;
  name: string;
  model: string;
  battery: number;
  session_id?: string;
  status: SessionStatus;
  unread_count: number;
  lastNotification?: string;
}

function statusVariant(status: SessionStatus) {
  if (status === 'CONNECTED') return 'default';
  if (status === 'QR_READY' || status === 'PENDING') return 'secondary';
  if (status === 'EXPIRED' || status === 'RELOGIN_REQUIRED') return 'destructive';
  return 'outline';
}

function MiniQrCode({ value, alt = 'WhatsApp QR code' }: { value?: string; alt?: string }) {
  const [dataUrl, setDataUrl] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    if (!value) {
      setDataUrl(undefined);
      return;
    }
    void QRCode.toDataURL(value, { margin: 1, width: 156, errorCorrectionLevel: 'M' }).then((url) => {
      if (!cancelled) setDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <div className="mx-auto grid size-40 place-items-center rounded-4xl bg-white p-3 shadow-lg">
      {dataUrl ? <img src={dataUrl} alt={alt} className="size-34 rounded-xl" /> : <QrCode className="size-14 text-neutral-400" />}
    </div>
  );
}

function WatchFrame({ title, subtitle, onBack, toast, onToastClick, onToastDismiss, footer, children }: { title: string; subtitle?: string; onBack?: () => void; toast?: WatchToast; onToastClick?: () => void; onToastDismiss?: () => void; footer?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid h-full place-items-center overflow-hidden bg-[radial-gradient(circle_at_top,#edf5ea,#dfe5dc_48%,#cfd8cc)] p-6">
      <div className="relative">
        <div className="absolute -top-13.5 left-1/2 h-16 w-28 -translate-x-1/2 rounded-t-4xl bg-neutral-900" />
        <div className="absolute -bottom-13.5 left-1/2 h-16 w-28 -translate-x-1/2 rounded-b-4xl bg-neutral-900" />
        <div className="absolute -right-3 top-28 h-16 w-4 rounded-r-xl bg-neutral-800 shadow" />
        <div className="relative h-130 w-97.5 rounded-[4rem] bg-neutral-950 p-3 shadow-2xl ring-1 ring-neutral-700">
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[3.25rem] bg-black text-white ring-1 ring-white/10">
            <header className="shrink-0 px-6 pb-2 pt-5">
              <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-white/50">
                <span>9:41</span>
                <span>{subtitle}</span>
              </div>
              <div className="flex items-center gap-2">
                {onBack && (
                  <button onClick={onBack} className="grid size-8 place-items-center rounded-full bg-white/10 text-white" aria-label="Back">
                    <ChevronLeft className="size-5" />
                  </button>
                )}
                <h2 className="truncate text-2xl font-bold tracking-[-0.04em]">{title}</h2>
              </div>
            </header>
            <div className="relative min-h-0 flex-1 overflow-y-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {toast && (
                <div className="sticky top-0 z-10 mb-2 rounded-[1.35rem] bg-white/95 p-3 text-left text-black shadow-xl">
                  <button onClick={onToastClick} className="flex w-full items-start gap-2 text-left">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#25d366] text-black"><MessageCircle className="size-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold">WhatsApp · {toast.title}</span>
                      <span className="line-clamp-2 text-xs leading-4 text-black/65">{toast.body}</span>
                    </span>
                  </button>
                  <button onClick={onToastDismiss} className="absolute right-2 top-2 rounded-full p-1 text-black/40 hover:bg-black/5" aria-label="Dismiss notification"><X className="size-3" /></button>
                </div>
              )}
              {children}
            </div>
            {footer}
          </div>
        </div>
      </div>
    </div>
  );
}

function DeviceRow({ device, selected, canDelete, onClick, onDelete }: { device: WatchDevice; selected: boolean; canDelete: boolean; onClick: () => void; onDelete: () => void }) {
  const connected = device.status === 'CONNECTED';
  return (
    <div className={`group flex w-full items-center gap-2 rounded-xl border p-2 transition ${selected ? 'border-primary bg-primary/5' : 'bg-background hover:bg-accent'}`}>
      <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="grid size-11 place-items-center rounded-2xl bg-neutral-950 text-white">
          <Watch className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{device.name}</span>
            {device.unread_count > 0 && <span className="grid size-5 place-items-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">{device.unread_count}</span>}
          </div>
          <p className="truncate text-xs text-muted-foreground">{connected ? device.lastNotification || 'WhatsApp connected' : 'WhatsApp not linked'}</p>
        </div>
        <Badge variant={statusVariant(device.status)} className="font-mono text-[10px]">
          {device.status}
        </Badge>
      </button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onDelete}
        disabled={!canDelete}
        className="size-8 shrink-0 text-muted-foreground opacity-70 hover:text-destructive group-hover:opacity-100 disabled:opacity-25"
        aria-label={`Delete ${device.name}`}
        title={canDelete ? `Delete ${device.name}` : 'At least one watch is required'}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

function WatchHome({ device, onOpenWhatsApp, toast, onToastClick, onToastDismiss }: { device?: WatchDevice; onOpenWhatsApp: () => void; toast?: WatchToast; onToastClick?: () => void; onToastDismiss?: () => void }) {
  return (
    <WatchFrame title="Apps" subtitle={device?.battery ? `${device.battery}%` : undefined} toast={toast} onToastClick={onToastClick} onToastDismiss={onToastDismiss}>
      <div className="space-y-4">
        {device?.lastNotification && (
          <button onClick={onOpenWhatsApp} className="w-full rounded-[1.75rem] bg-white/10 p-4 text-left text-white shadow-inner">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-amber-200">
              <Bell className="size-4" /> WhatsApp
            </div>
            <p className="line-clamp-2 text-sm leading-5 text-white/80">{device.lastNotification}</p>
          </button>
        )}

        <div className="grid grid-cols-3 gap-3 px-2 pt-2">
          <button onClick={onOpenWhatsApp} className="group flex flex-col items-center gap-2">
            <div className="grid size-17 place-items-center rounded-[1.55rem] bg-[#25d366] text-white shadow-lg transition group-hover:scale-105">
              <MessageCircle className="size-8" />
            </div>
            <span className="text-[11px] font-medium text-white/80">WhatsApp</span>
            {device?.unread_count ? <span className="absolute -mt-0.75 ml-12 grid size-5 place-items-center rounded-full bg-red-500 text-[10px] font-bold text-white">{device.unread_count}</span> : null}
          </button>
          <div className="flex flex-col items-center gap-2 opacity-55">
            <div className="grid size-17 place-items-center rounded-[1.55rem] bg-sky-500 text-white">☎</div>
            <span className="text-[11px] text-white/70">Phone</span>
          </div>
          <div className="flex flex-col items-center gap-2 opacity-55">
            <div className="grid size-17 place-items-center rounded-[1.55rem] bg-violet-500 text-white">◎</div>
            <span className="text-[11px] text-white/70">Health</span>
          </div>
        </div>

        <div className="rounded-[1.75rem] bg-white/8 p-4 text-sm text-white/70">
          <div className="font-semibold text-white">{device?.name ?? '未选择手表'}</div>
          <div className="mt-1 text-xs">{device?.model}</div>
          <div className="mt-1 break-all text-[11px] text-white/45">{device?.id}</div>
        </div>

      </div>
    </WatchFrame>
  );
}

function WatchLogin({
  bindingId,
  expiresAt,
  isBinding,
  isPollingBindStatus = false,
  onStartBind,
  onRefreshStatus,
  qrCode,
  sendFailure,
  status,
  onBack,
  toast,
  onToastClick,
  onToastDismiss,
}: {
  bindingId?: string;
  expiresAt?: string;
  isBinding: boolean;
  isPollingBindStatus?: boolean;
  onStartBind: () => void;
  onRefreshStatus: () => void;
  qrCode?: string;
  sendFailure?: WatchSendFailure;
  status: SessionStatus;
  onBack: () => void;
  toast?: WatchToast;
  onToastClick?: () => void;
  onToastDismiss?: () => void;
}) {
  const waiting = status === 'QR_READY' && Boolean(bindingId);
  const waitingReconnect = status === 'DISCONNECTED' || status === 'RECONNECTING';
  const expiryLabel = expiresAt ? new Date(expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined;
  const actionDisabled = isBinding || isPollingBindStatus;
  const actionLabel = waitingReconnect ? '刷新状态' : isBinding ? '正在发起...' : isPollingBindStatus ? '正在轮询...' : qrCode ? '刷新二维码' : '开始绑定';
  const actionHandler = waitingReconnect ? onRefreshStatus : onStartBind;
  const guidance =
    sendFailure ??
    (status === 'RELOGIN_REQUIRED'
      ? { code: status, message: 'WhatsApp 需要重新登录。', action: '重新发起绑定，让用户用手机 WhatsApp 扫码。' }
      : status === 'EXPIRED'
        ? { code: status, message: '当前 Linked Device 会话已失效。', action: '先清理本地状态，再从 auth/status 进入新的绑定流程。' }
        : status === 'DISCONNECTED' || status === 'RECONNECTING'
          ? { code: status, message: status === 'RECONNECTING' ? 'WhatsApp 正在重连。' : 'WhatsApp 当前离线。', action: '每 5s 调 auth/status 刷新状态；只有 can_start_bind=true 时才显示二维码绑定。' }
          : undefined);
  return (
    <WatchFrame title="WhatsApp" subtitle={status} onBack={onBack} toast={toast} onToastClick={onToastClick} onToastDismiss={onToastDismiss}>
      <div className="flex min-h-full flex-col justify-center gap-4 py-2 text-center">
        {waitingReconnect ? (
          <div className="mx-auto grid size-40 place-items-center rounded-4xl bg-white/10 text-white shadow-inner">
            <RefreshCw className={`size-12 ${status === 'RECONNECTING' ? 'animate-spin' : ''}`} />
          </div>
        ) : (
          <MiniQrCode value={qrCode} alt="WhatsApp pairing QR code" />
        )}
        <div>
          <div className="text-lg font-bold tracking-tight">{waitingReconnect ? '等待 WhatsApp 恢复' : '绑定 WhatsApp'}</div>
          <p className="mx-auto mt-1 max-w-65 text-sm leading-5 text-white/60">{waitingReconnect ? '当前 Linked Device 仍保留，不要重新扫码。' : '使用手机 WhatsApp 的已关联设备扫码。手表端只承载配对流程。'}</p>
        </div>
        {guidance && (
          <div className="rounded-[1.45rem] border border-amber-300/30 bg-amber-300/12 p-3 text-left text-xs text-amber-50">
            <div className="font-semibold">{guidance.message}</div>
            <div className="mt-1 leading-4 text-amber-50/65">{guidance.action}</div>
            {guidance.code && <div className="mt-2 font-mono text-[10px] text-amber-50/45">{guidance.code}</div>}
          </div>
        )}
        <div className="rounded-3xl bg-white/8 p-3 text-xs text-white/55" aria-live="polite">
          <div>{waitingReconnect ? '当前会话保留中' : isPollingBindStatus ? '正在轮询绑定状态' : waiting ? `等待手机扫码` : bindingId ? `绑定事务 ${bindingId}` : '暂无绑定事务'}</div>
          <div className="mt-1">{waitingReconnect ? '请求 GET /api/v1/auth/status' : `过期时间 ${expiryLabel ?? '待生成'}`}</div>
          {!waitingReconnect && bindingId && <div className="mt-1 break-all font-mono text-[10px] text-white/40">{bindingId}</div>}
        </div>
        <button
          onClick={actionHandler}
          disabled={actionDisabled}
          className="rounded-full bg-[#25d366] px-5 py-3 text-sm font-bold text-black disabled:opacity-50"
        >
          {actionLabel}
        </button>
      </div>
    </WatchFrame>
  );
}

function accountLabel(profile?: AccountProfileResponse) {
  return profile?.display_name || profile?.push_name || profile?.phone || profile?.wa_jid || 'WhatsApp 账号';
}

function WatchChatList({
  accountProfile,
  chats,
  isLoading,
  isLoadingProfile,
  onBack,
  onOpenProfile,
  onSelectChat,
  toast,
  onToastClick,
  onToastDismiss,
}: {
  accountProfile?: AccountProfileResponse;
  chats: ChatResponse[];
  isLoading: boolean;
  isLoadingProfile: boolean;
  onBack: () => void;
  onOpenProfile: () => void;
  onSelectChat: (id: string) => void;
  toast?: WatchToast;
  onToastClick?: () => void;
  onToastDismiss?: () => void;
}) {
  return (
    <WatchFrame title="WhatsApp" subtitle={`${chats.length} 个会话`} onBack={onBack} toast={toast} onToastClick={onToastClick} onToastDismiss={onToastDismiss}>
      <div className="space-y-2 pb-2">
        <button onClick={onOpenProfile} className="flex w-full items-center gap-3 rounded-[1.45rem] bg-[#123d25] p-3 text-left shadow-inner transition hover:bg-[#174d30]">
          <div className="relative grid size-12 shrink-0 place-items-center rounded-full bg-[#25d366] text-black">
            {accountProfile?.avatar?.url ? <img src={accountProfile.avatar.url} alt="" className="size-full rounded-full object-cover" /> : <UserRound className="size-6" />}
            <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full bg-white text-black"><QrCode className="size-3" /></span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">{accountLabel(accountProfile)}</div>
            <p className="truncate text-xs text-white/55">{isLoadingProfile ? '正在刷新资料' : accountProfile?.contact.qr_kind === 'native_contact_qr' ? 'WhatsApp 二维码' : '联系人二维码'}</p>
          </div>
          <ChevronLeft className="size-4 rotate-180 text-white/40" />
        </button>
        {chats.length === 0 && <div className="rounded-3xl bg-white/8 p-4 text-sm leading-5 text-white/60">{isLoading ? '正在加载会话...' : '暂无会话。新的 WhatsApp 消息会出现在这里。'}</div>}
        {chats.map((chat) => (
          <button key={chat.id} onClick={() => onSelectChat(chat.id)} className="flex w-full items-center gap-3 rounded-[1.35rem] bg-white/8 p-3 text-left transition hover:bg-white/12">
            <div className="grid size-11 place-items-center rounded-full bg-white/15 text-xs font-bold text-white">{chat.avatar}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-white">{chat.name}</span>
                {(chat.unread_count ?? 0) > 0 && <span className="grid size-5 place-items-center rounded-full bg-[#25d366] text-[10px] font-bold text-black">{chat.unread_count ?? 0}</span>}
              </div>
              <p className="truncate text-xs text-white/50">{chat.last_message}</p>
            </div>
          </button>
        ))}
      </div>
    </WatchFrame>
  );
}

function WatchProfile({ profile, isLoading, onBack, onRefresh, toast, onToastClick, onToastDismiss }: { profile?: AccountProfileResponse; isLoading: boolean; onBack: () => void; onRefresh: () => void; toast?: WatchToast; onToastClick?: () => void; onToastDismiss?: () => void }) {
  const label = accountLabel(profile);
  const secondary = profile?.phone || profile?.wa_jid || profile?.session_id;
  const qrPayload = profile?.contact.qr_payload;
  return (
    <WatchFrame title="我的二维码" subtitle={profile?.status ? String(profile.status) : '资料'} onBack={onBack} toast={toast} onToastClick={onToastClick} onToastDismiss={onToastDismiss}>
      <div className="flex min-h-full flex-col items-center justify-center gap-4 py-2 text-center">
        <div className="grid size-18 place-items-center overflow-hidden rounded-full bg-[#25d366] text-black shadow-lg ring-4 ring-white/10">
          {profile?.avatar?.url ? <img src={profile.avatar.url} alt="" className="size-full object-cover" /> : <UserRound className="size-8" />}
        </div>
        <div className="max-w-65">
          <div className="truncate text-xl font-bold tracking-tight">{label}</div>
          {secondary && <div className="mt-1 truncate text-xs text-white/50">{secondary}</div>}
        </div>
        <MiniQrCode value={qrPayload} alt="WhatsApp contact QR code" />
        <div className="w-full rounded-[1.45rem] bg-white/8 p-3 text-left">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white">{profile?.contact.qr_kind === 'native_contact_qr' ? 'WhatsApp 原生二维码' : '联系人链接二维码'}</div>
              <div className="mt-1 truncate text-[11px] text-white/45">{qrPayload || '资料二维码未加载'}</div>
            </div>
            <button onClick={onRefresh} disabled={isLoading} className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-white disabled:opacity-45" aria-label="Refresh account profile">
              <RefreshCw className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>
    </WatchFrame>
  );
}

function WatchConversation({
  chat,
  messages,
  onBack,
  onSend,
  onInbound,
  sendFailure,
  sessionStatus = 'CONNECTED',
  toast,
  onToastClick,
  onToastDismiss,
}: {
  chat?: ChatResponse;
  messages: MessageResponse[];
  onBack: () => void;
  onSend: (body: string) => void;
  onInbound: () => void;
  sendFailure?: WatchSendFailure;
  sessionStatus?: SessionStatus;
  toast?: WatchToast;
  onToastClick?: () => void;
  onToastDismiss?: () => void;
}) {
  const [draft, setDraft] = useState('');
  const canSend = sessionStatus === 'CONNECTED';
  const send = () => {
    if (!draft.trim() || !canSend) return;
    onSend(draft.trim());
    setDraft('');
  };
  const statusFailure =
    sendFailure ??
    (canSend
      ? undefined
      : {
          code: sessionStatus,
          message: sessionStatus === 'RECONNECTING' ? 'WhatsApp 正在重连，暂时不能发送。' : sessionStatus === 'DISCONNECTED' ? 'WhatsApp 当前离线，暂时不能发送。' : '当前会话不可发送消息。',
          action: sessionStatus === 'RELOGIN_REQUIRED' || sessionStatus === 'EXPIRED' ? '返回绑定入口重新扫码。' : '等待 auth/status 或 WebSocket 事件恢复到 CONNECTED。',
        });
  const footer = (
    <div data-testid="watch-message-composer" className="shrink-0 space-y-2 bg-black px-4 pb-4 pt-2">
      <button onClick={onInbound} className="mx-auto block rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/70">
        刷新
      </button>
      <div className="flex gap-2 rounded-full bg-white/10 p-1 shadow-lg backdrop-blur">
        <input value={draft} onChange={(event) => setDraft(event.target.value)} disabled={!canSend} placeholder={canSend ? '回复' : '当前不可发送'} className="min-w-0 flex-1 bg-transparent px-3 text-sm text-white outline-none placeholder:text-white/35 disabled:text-white/35" />
        <button onClick={send} disabled={!canSend} className="rounded-full bg-[#25d366] px-3 text-xs font-bold text-black disabled:bg-white/15 disabled:text-white/35">{canSend ? '发送' : '禁用'}</button>
      </div>
    </div>
  );

  return (
    <WatchFrame title={chat?.name ?? '聊天'} subtitle="WhatsApp" onBack={onBack} toast={toast} onToastClick={onToastClick} onToastDismiss={onToastDismiss} footer={footer}>
      <div className="min-h-full space-y-2 pb-2">
        {statusFailure && (
          <div className="rounded-[1.45rem] border border-red-300/25 bg-red-500/15 p-3 text-xs text-red-50">
            <div className="font-semibold">{statusFailure.message}</div>
            <div className="mt-1 leading-4 text-red-50/70">{statusFailure.action}</div>
            {statusFailure.code && <div className="mt-2 font-mono text-[10px] text-red-50/45">{statusFailure.code}</div>}
          </div>
        )}
        {messages.length === 0 && <div className="rounded-3xl bg-white/8 p-4 text-sm text-white/60">暂无消息。收到 WhatsApp 消息后会出现在这里。</div>}
        {messages.map((message) => (
          <div key={message.id} className={`max-w-[86%] rounded-[1.2rem] px-3 py-2 text-sm leading-5 ${message.direction === 'outbound' ? 'ml-auto bg-[#25d366] text-black' : 'bg-white/12 text-white'}`}>
            <div>{message.body || message.media?.media_type || '媒体消息'}</div>
            <div className={`mt-1 text-[10px] ${message.direction === 'outbound' ? 'text-black/55' : 'text-white/45'}`}>{message.timestamp}{message.status ? ` · ${message.status}` : ''}</div>
          </div>
        ))}
      </div>
    </WatchFrame>
  );
}

export function WatchRelayDemo({
  accountProfile,
  activeView,
  bindingId,
  chats,
  devices,
  expiresAt,
  isBinding,
  isPollingBindStatus,
  isLoadingChats,
  isLoadingProfile,
  messages,
  notificationToast,
  onBackToApps,
  onBackToChats,
  onCreateWatch,
  onDeleteWatch,
  onDeleteWatchAndLogout,
  onInbound,
  onOpenProfile,
  onOpenWhatsApp,
  onNotificationClick,
  onNotificationDismiss,
  onSelectChat,
  onSelectDevice,
  onSend,
  onStartBind,
  onRefreshStatus,
  onRefreshProfile,
  qrCode,
  sendFailure,
  selectedChat,
  selectedDevice,
}: {
  accountProfile?: AccountProfileResponse;
  activeView: WatchAppView;
  bindingId?: string;
  chats: ChatResponse[];
  devices: WatchDevice[];
  expiresAt?: string;
  isBinding: boolean;
  isPollingBindStatus?: boolean;
  isLoadingChats: boolean;
  isLoadingProfile: boolean;
  messages: MessageResponse[];
  notificationToast?: WatchToast;
  onBackToApps: () => void;
  onBackToChats: () => void;
  onCreateWatch: () => void;
  onDeleteWatch: (id: string) => void;
  onDeleteWatchAndLogout: (id: string) => void;
  onInbound: () => void;
  onLogout: () => void;
  onOpenProfile: () => void;
  onOpenWhatsApp: () => void;
  onNotificationClick: () => void;
  onNotificationDismiss: () => void;
  onSelectChat: (id: string) => void;
  onSelectDevice: (id: string) => void;
  onSend: (body: string) => void;
  onStartBind: () => void;
  onRefreshStatus: () => void;
  onRefreshProfile: () => void;
  qrCode?: string;
  sendFailure?: WatchSendFailure;
  selectedChat?: ChatResponse;
  selectedChatId: string;
  selectedDevice?: WatchDevice;
}) {
  const [pendingDelete, setPendingDelete] = useState<WatchDevice>();
  const confirmDelete = (device: WatchDevice) => {
    if (!device.session_id) {
      onDeleteWatch(device.id);
      return;
    }
    setPendingDelete(device);
  };

  return (
    <div className="relative grid h-full min-h-0 grid-cols-[320px_1fr] overflow-hidden bg-white">
      <aside className="flex min-h-0 flex-col border-r bg-card">
        <div className="shrink-0 border-b p-4">
          <div className="text-xs font-medium text-muted-foreground">Supplier fleet</div>
          <div className="mt-1 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Watches</h2>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{devices.length} devices</Badge>
              <Button variant="outline" size="sm" onClick={onCreateWatch} className="h-8 px-2 text-xs">
                <Plus className="size-3.5" />
                Add
              </Button>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {devices.map((device) => (
            <DeviceRow key={device.id} device={device} selected={device.id === selectedDevice?.id} canDelete={devices.length > 1} onClick={() => onSelectDevice(device.id)} onDelete={() => confirmDelete(device)} />
          ))}
        </div>
      </aside>

      {activeView === 'devices' && <WatchHome device={selectedDevice} onOpenWhatsApp={onOpenWhatsApp} toast={notificationToast} onToastClick={onNotificationClick} onToastDismiss={onNotificationDismiss} />}
      {activeView === 'wa-login' && <WatchLogin bindingId={bindingId} expiresAt={expiresAt} isBinding={isBinding} isPollingBindStatus={isPollingBindStatus} onStartBind={onStartBind} onRefreshStatus={onRefreshStatus} qrCode={qrCode} sendFailure={sendFailure} status={selectedDevice?.status ?? 'PENDING'} onBack={onBackToApps} toast={notificationToast} onToastClick={onNotificationClick} onToastDismiss={onNotificationDismiss} />}
      {activeView === 'wa-chats' && <WatchChatList accountProfile={accountProfile} chats={chats} isLoading={isLoadingChats} isLoadingProfile={isLoadingProfile} onBack={onBackToApps} onOpenProfile={onOpenProfile} onSelectChat={onSelectChat} toast={notificationToast} onToastClick={onNotificationClick} onToastDismiss={onNotificationDismiss} />}
      {activeView === 'wa-profile' && <WatchProfile profile={accountProfile} isLoading={isLoadingProfile} onBack={onBackToChats} onRefresh={onRefreshProfile} toast={notificationToast} onToastClick={onNotificationClick} onToastDismiss={onNotificationDismiss} />}
      {activeView === 'wa-conversation' && <WatchConversation chat={selectedChat} messages={messages} onBack={onBackToChats} onSend={onSend} onInbound={onInbound} sendFailure={sendFailure} sessionStatus={selectedDevice?.status} toast={notificationToast} onToastClick={onNotificationClick} onToastDismiss={onNotificationDismiss} />}

      {pendingDelete && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/35 p-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border bg-card p-5 shadow-2xl">
            <div className="text-base font-semibold">Delete linked watch?</div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {pendingDelete.name} is still bound to WhatsApp session <span className="font-mono text-xs">{pendingDelete.session_id}</span>. Delete should logout/unbind first, otherwise the Relay session remains active.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPendingDelete(undefined)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => {
                  onDeleteWatchAndLogout(pendingDelete.id);
                  setPendingDelete(undefined);
                }}
              >
                Logout & delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
