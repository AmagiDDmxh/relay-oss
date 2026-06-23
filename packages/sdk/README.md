# @squady/whatsapp-relay

轻量 TypeScript SDK，用于供应商后端或 Companion App 代理层接入 WhatsApp Relay。

> 安全提示：生产环境不要把长期 `supplierApiKey` 放进真实手表端或公开浏览器环境。浏览器 WebSocket 应优先使用 Relay 签发的短期 `eventToken`。

## 初始化

```ts
import { createRelayClient } from '@squady/whatsapp-relay'

const relay = createRelayClient({
  baseUrl: 'https://relay.example.com',
  supplierApiKey: process.env.RELAY_SUPPLIER_API_KEY!,
  deviceId: 'watch_001',
  ownerUserId: 'user_123',
})
```

## 发送文本回复

```ts
await relay.messages.sendText({
  chatId: '123@s.whatsapp.net',
  body: '收到',
})
```

SDK 会自动带上：

```http
X-Supplier-API-Key: ...
X-Device-ID: watch_001
X-Owner-User-ID: user_123
```

`ownerUserId` 或 `appId` 至少传一个，用来形成 `supplier_id + device_id + owner_context` 归属边界，避免手表转让后沿用上一位用户的数据。

## 绑定与短期事件 Token

```ts
const preflight = await relay.auth.preflight({
  owner_context: { user_id: 'user_123' },
})

if (preflight.can_start_bind) {
  const binding = await relay.auth.startBind({
    owner_context: { user_id: 'user_123' },
  })
  // show binding.qr_code, then poll binding.binding_id
}

const { token: eventToken } = await relay.auth.mintEventToken({
  deviceId: 'watch_001',
  ownerUserId: 'user_123',
  ttl_seconds: 300,
})
```

## 账号资料与二维码

```ts
const profile = await relay.account.profile({
  qrBase64: true,
})
```

`display_name`、`push_name`、`status_text` 和 `avatar` 是 WhatsApp runtime 的 best-effort 字段，可能因为隐私设置或 WhatsApp Web 限制返回 `null`。图片组件不能附带鉴权 header 时，可以传 `qrBase64: true` 使用 `contact.qr_image_base64`。

## 会话与聊天

```ts
const sessions = await relay.sessions.list({ status: 'connected' })
const chats = await relay.chats.list({ sessionId: sessions[0]?.id, limit: 50 })
const messages = await relay.messages.listInChat({
  chatId: chats[0].id,
  limit: 50,
})
```

## 按收件人发送

```ts
await relay.messages.sendTextTo({
  recipient: '15551234567',
  body: '收到',
})
```

`sendTextTo` 会先调用 `contacts.resolve`。如果结果 ambiguous，SDK 会抛 `RelayConflictError`，不会自动猜测收件人。

## 补拉 missed events

```ts
for await (const event of relay.events.catchUp({
  after: lastCursor,
  limit: 100,
})) {
  if (event.cursor && event.event_type !== 'heartbeat') saveCursor(event.cursor)
  // message.new / message.status_updated / session.state_changed
}
```

## 解绑与 WhatsApp Logout

```ts
await relay.auth.unbind({ session_id: 'sess_1' })
await relay.auth.logout({ session_id: 'sess_1' })
```

`unbind` 只清理 Relay 本地 watch/device 路由绑定，不会把 WhatsApp linked device 从用户手机里移除。用户明确选择移除 WhatsApp 账号或退出登录时，使用 `logout`。

## WebSocket 订阅

```ts
import { isMessageNewEvent } from '@squady/whatsapp-relay'

const stream = relay.events.subscribe({ eventToken, after: lastCursor })

for await (const event of stream.filter(isMessageNewEvent)) {
  if (event.cursor) saveCursor(event.cursor)
  console.log(event.data.body)
}
```

首次连接没有 `lastCursor` 时可以省略 `after`；`event_token` 连接会自动补偿 token 签发后已持久化的短窗口事件。后续只保存非 `heartbeat` 且 `cursor` 非空的事件，再把最后一个 cursor 传回 `after`。

如果你在可信的非浏览器客户端里使用 WebSocket auth headers，期望的头是：

```http
X-Supplier-API-Key: ...
X-Device-ID: watch_001
X-Owner-User-ID: user_123
```

浏览器端推荐的 URL 形态是：

```text
/ws/v1/events?event_token=<token>&after=<last_cursor>
```
调用发送接口成功后，事件流也会出现 `direction=outbound` 的 `message.new`，并额外出现 `message.accepted` 表示 Relay 已接受发送请求；后续送达、已读、失败仍以 `message.status_updated` 为准。

## 错误处理

```ts
import { RelayApiError } from '@squady/whatsapp-relay'

try {
  await relay.messages.sendText({ chatId, body })
} catch (error) {
  if (error instanceof RelayApiError) {
    console.log(error.code, error.retryable, error.details)
  }
}
```
