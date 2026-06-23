import type { ChatResponse, MessageResponse } from '@squady/whatsapp-relay';
import { DemoAvatar } from './ui/avatar';
import { MessageComposer } from './MessageComposer';

export function ConversationView({
  chat,
  messages,
  onSend,
  onInbound,
  isLoadingChats,
}: {
  chat?: ChatResponse;
  messages: MessageResponse[];
  onSend: (body: string) => void;
  onInbound: () => void;
  isLoadingChats: boolean;
}) {
  if (!chat) {
    return (
      <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#efeae2]">
        <div className="grid flex-1 place-items-center p-8 text-center">
          <div className="max-w-sm rounded-2xl bg-background/90 p-6 shadow-xs">
            <h3 className="text-sm font-semibold">Waiting for WhatsApp messages</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {isLoadingChats
                ? 'Loading runtime chats…'
                : 'After QR login, send a message to this linked WhatsApp account. The demo will list the real chat here so you can reply.'}
            </p>
            <button onClick={onInbound} className="mt-4 rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs hover:bg-accent">
              Refresh chats
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#efeae2]">
      <header className="flex h-14 shrink-0 items-center border-b bg-card px-4">
        <div className="flex min-w-0 items-center gap-3">
          <DemoAvatar label={chat.avatar ?? chat.name ?? chat.id} />
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{chat.name ?? chat.id}</h3>
            <p className="truncate text-xs text-muted-foreground">online · {chat.chat_type === 'group' ? 'group chat' : 'direct message'}</p>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,#efeae2,#e9e2d8)] p-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-2">
          <div className="mx-auto mb-4 rounded-full bg-background/80 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-xs">
            Today · runtime WhatsApp messages
          </div>
          {messages.length === 0 && (
            <div className="mx-auto rounded-xl border border-dashed bg-background/80 px-4 py-3 text-sm text-muted-foreground">
              No messages captured for this chat yet.
            </div>
          )}
          {messages.map((message) => (
            <div
              key={message.id}
              className={`max-w-[72%] rounded-lg px-3 py-2 text-sm shadow-xs ${
                message.direction === 'outbound' ? 'ml-auto rounded-tr-sm bg-[#d9fdd3]' : 'rounded-tl-sm bg-background'
              }`}
            >
              {message.media ? (
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 text-base">🖼️</span>
                  <div className="min-w-0">
                    <div className="text-xs font-medium">{message.media.media_type}</div>
                    {message.media.file_name && <div className="truncate text-[11px] text-muted-foreground">{message.media.file_name}</div>}
                    {message.media.file_size && <div className="text-[11px] text-muted-foreground">{(message.media.file_size / 1024).toFixed(0)} KB</div>}
                    {message.body && <div className="mt-1 leading-5">{message.body}</div>}
                    <div className="mt-0.5 text-[10px] text-muted-foreground italic">media metadata only · not downloaded</div>
                  </div>
                </div>
              ) : (
                <div className="leading-5">{message.body}</div>
              )}
              <div className="mt-1 text-right text-[10px] text-muted-foreground">
                {message.timestamp ?? message.wa_timestamp ?? message.created_at ?? ''}
                {message.status ? ` · ${message.status}` : ''}
              </div>
            </div>
          ))}
          <button
            onClick={onInbound}
            className="mx-auto mt-4 rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs hover:bg-accent"
          >
            Refresh runtime messages
          </button>
        </div>
      </div>

      <MessageComposer onSend={onSend} />
    </section>
  );
}
