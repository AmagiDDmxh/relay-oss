import type { AuthStatusResponse, SessionStatus } from '@squady/whatsapp-relay';
import { Badge } from './ui/badge';
import { cn } from '@/lib/utils';

const pollCadence = '每 5s 轮询一次，最多 36 次，约 3 分钟';

const states: Array<{
  status: SessionStatus;
  label: string;
  signal: string;
  description: string;
  request: string;
  appAction: string;
  stopRule: string;
}> = [
  {
    status: 'PENDING',
    label: '待绑定',
    signal: 'start_bind',
    description: '当前手表设备没有已知的绑定事务。',
    request: 'GET /api/v1/auth/status',
    appAction: '先查 auth/status。只有 can_start_bind=true 时才调用 bind/start；客户端丢了 binding_id 时也先用这个接口找回当前状态。',
    stopRule: 'can_start_bind=false 时不要创建新的绑定事务，按 recommended_action 展示已连接、等待重连或继续绑定。',
  },
  {
    status: 'QR_READY',
    label: '二维码',
    signal: 'qr_ready',
    description: '绑定事务已经创建，手表端应展示 WhatsApp 配对二维码。',
    request: 'GET /api/v1/auth/bind/status/{binding_id}',
    appAction: `渲染 qr_code，并按 binding_id 轮询 bind/status。建议节奏：${pollCadence}。`,
    stopRule: '遇到 CONNECTED、RELOGIN_REQUIRED、EXPIRED 或二维码过期就停止轮询。需要重新绑定时，重新创建绑定事务。',
  },
  {
    status: 'CONNECTED',
    label: '已连接',
    signal: 'ConnectedEvent',
    description: 'WhatsApp Linked Device runtime 已连接，可收发消息并查询账号资料。',
    request: 'GET /api/v1/account/profile',
    appAction: '加载 profile、头像和个人二维码，然后进入 chats/messages。保持 WebSocket 或 event replay，用于接收状态和消息更新。',
    stopRule: '发送接口返回离线、已解绑或需要重登类错误码时，先回到 auth/status 判断下一步。',
  },
  {
    status: 'DISCONNECTED',
    label: '离线',
    signal: 'KeepAliveTimeout',
    description: 'WhatsApp runtime 当前离线，但账号可能仍可自动恢复，不一定需要重新扫码。',
    request: 'GET /api/v1/auth/status',
    appAction: '展示离线或重连中的 UI。服务端未明确 relogin 或 expired 前，不要主动 bind/start。',
    stopRule: '等待 reconnecting/connected 事件；只有 auth/status 返回 can_start_bind=true 或 recommended_action=rebind_required 时，才引导用户重登。',
  },
  {
    status: 'RECONNECTING',
    label: '重连中',
    signal: 'backoff.retry',
    description: 'Relay 正在按 backoff 策略重试 WhatsApp 连接。',
    request: 'GET /api/v1/auth/status',
    appAction: '保留当前会话界面，但在重新 CONNECTED 前禁用发送消息。',
    stopRule: '状态没有进入 RELOGIN_REQUIRED 或 EXPIRED 前，不要要求用户扫码。',
  },
  {
    status: 'RELOGIN_REQUIRED',
    label: '需重登',
    signal: 'StreamReplaced',
    description: '当前 Linked Device 会话无法继续，需要用户重新扫码。',
    request: 'POST /api/v1/auth/bind/start',
    appAction: '提示用户：手机端可能退出登录、连接被替换，或 WhatsApp 要求重新建立 Linked Device。',
    stopRule: '清掉本地 binding_id，重新创建绑定事务。',
  },
  {
    status: 'EXPIRED',
    label: '已过期',
    signal: 'LoggedOutEvent',
    description: '这个 Linked Device session 已经终止。',
    request: 'GET /api/v1/auth/status',
    appAction:
      '先查询当前 device_binding 和 session 状态。如果服务端仍显示 device_binding=bound，再调用 unbind 清理本地绑定；之后重新 bind/start。',
    stopRule: '新的 CONNECTED session 出现前，发送消息必须保持禁用。',
  },
];

function statusVariant(status: SessionStatus) {
  if (status === 'CONNECTED') return 'default';
  if (status === 'QR_READY' || status === 'PENDING') return 'secondary';
  return 'outline';
}

function renderTemplate(template: string, bindingId?: string) {
  return template.replace('{binding_id}', bindingId || ':binding_id');
}

export function StateMachine({
  activeSessionId,
  authStatus,
  bindingId,
  deviceId,
  isBinding,
  isPollingBindStatus,
  qrExpiresAt,
  status,
}: {
  activeSessionId?: string;
  authStatus?: AuthStatusResponse;
  bindingId?: string;
  deviceId?: string;
  isBinding?: boolean;
  isPollingBindStatus?: boolean;
  qrExpiresAt?: string;
  status: SessionStatus;
}) {
  const activeIndex = Math.max(states.findIndex((item) => item.status === status), 0);
  const activeState = states[activeIndex];
  const currentRequest = renderTemplate(activeState.request, bindingId);
  const expiryLabel = qrExpiresAt ? new Date(qrExpiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '无';

  return (
    <section className="shrink-0 rounded-none border bg-card text-card-foreground shadow-xs">
      <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
        <div>
          <h2 className="text-sm font-semibold">集成状态</h2>
          <p className="text-xs text-muted-foreground">当前查询、绑定事务、运行态会话</p>
        </div>
        <Badge variant={statusVariant(status)} className="font-mono text-[10px]">
          {status}
        </Badge>
      </div>

      <div className="space-y-3 p-3">
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="min-w-0 rounded-md border bg-background px-2 py-1.5">
            <div className="text-muted-foreground">device_id</div>
            <div className="truncate font-mono">{deviceId || '未填写'}</div>
          </div>
          <div className="min-w-0 rounded-md border bg-background px-2 py-1.5">
            <div className="text-muted-foreground">session_id</div>
            <div className="truncate font-mono">{activeSessionId || authStatus?.session?.id || '无'}</div>
          </div>
          <div className="min-w-0 rounded-md border bg-background px-2 py-1.5">
            <div className="text-muted-foreground">binding_id</div>
            <div className="truncate font-mono">{bindingId || '无'}</div>
          </div>
          <div className="min-w-0 rounded-md border bg-background px-2 py-1.5">
            <div className="text-muted-foreground">auth/status</div>
            <div className="truncate font-mono">{authStatus ? `${authStatus.phase}:${authStatus.recommended_action}` : '未查询'}</div>
          </div>
        </div>

        <div className="relative px-1 pb-1 pt-1">
          <div className="absolute left-5 right-5 top-4 h-px bg-border" />
          <div
            className="absolute left-5 top-4 h-px bg-primary transition-all duration-300"
            style={{ width: activeIndex <= 0 ? 0 : `calc(${(activeIndex / (states.length - 1)) * 100}% - 40px)` }}
          />

          <div className="relative grid grid-cols-7 gap-1">
            {states.map((item, index) => {
              const active = item.status === status;
              const done = index < activeIndex;

              return (
                <div key={item.status} className="min-w-0 text-center">
                  <div
                    className={cn(
                      'mx-auto grid size-7 place-items-center rounded-full border bg-background text-[11px] font-semibold transition-colors',
                      active && 'border-primary bg-primary text-primary-foreground shadow-xs',
                      done && !active && 'border-primary text-primary',
                      !done && !active && 'text-muted-foreground'
                    )}
                  >
                    {index + 1}
                  </div>
                  <div className={cn('mt-2 truncate text-[10px] font-medium', active ? 'text-foreground' : 'text-muted-foreground')}>
                    {item.label}
                  </div>
                  <div className="truncate text-[9px] text-muted-foreground">{item.signal}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border bg-background p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold">下一步请求</span>
            <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{activeState.signal}</code>
          </div>
          <code className="mt-2 block overflow-hidden text-ellipsis whitespace-nowrap rounded-md bg-neutral-950 px-2 py-1.5 text-[11px] text-white">{currentRequest}</code>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{activeState.description}</p>
        </div>

        <div className="grid gap-2 text-xs md:grid-cols-2">
          <div className="rounded-lg bg-muted px-3 py-2">
            <div className="font-medium">App 侧动作</div>
            <p className="mt-1 leading-5 text-muted-foreground">{activeState.appAction}</p>
          </div>
          <div className="rounded-lg bg-muted px-3 py-2">
            <div className="font-medium">停止条件</div>
            <p className="mt-1 leading-5 text-muted-foreground">{activeState.stopRule}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="rounded-md bg-blue-50 px-2 py-1.5 text-blue-900">
            <div className="font-medium">轮询</div>
            <div>{isPollingBindStatus ? pollCadence : '未开始'}</div>
          </div>
          <div className="rounded-md bg-emerald-50 px-2 py-1.5 text-emerald-900">
            <div className="font-medium">QR 过期</div>
            <div>{expiryLabel}</div>
          </div>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs">
          <div className="font-medium">给甲方的对接提示</div>
          <p className="mt-1 leading-5 text-muted-foreground">
            客户端先根据 auth/status 决策：有 binding_id 就轮询 bind/status，show_connected 就加载 profile/chats，relogin 或 expired 就清理后重新 bind/start。
          </p>
          {isBinding && <p className="mt-1 font-medium text-blue-700">正在请求 bind/start</p>}
        </div>
      </div>
    </section>
  );
}
