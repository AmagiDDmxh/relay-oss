import { LogOut, Search } from 'lucide-react';
import type { ChatResponse } from '@squady/whatsapp-relay';
import { DemoAvatar } from './ui/avatar';
import { Button } from './ui/button';
import { Input } from './ui/input';

export function ChatList({
  chats,
  selectedChatId,
  onSelect,
  onLogout,
  isLoading,
}: {
  chats: ChatResponse[];
  selectedChatId: string;
  onSelect: (id: string) => void;
  onLogout: () => void;
  isLoading: boolean;
}) {
  return (
    <aside className="flex h-full w-[34%] min-w-75 flex-col border-r bg-card">
      <div className="shrink-0 border-b p-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Chats</h2>
          <Button variant="ghost" size="sm" onClick={onLogout} className="h-8 px-2 text-xs" aria-label="Logout WhatsApp session">
            <LogOut className="size-3.5" />
            Logout
          </Button>
        </div>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search chats" />
        </div>
        <div className="mt-3 flex gap-2 text-xs font-medium">
          <span className="rounded-full bg-primary px-3 py-1 text-primary-foreground">All</span>
          <span className="rounded-full bg-secondary px-3 py-1 text-muted-foreground">Unread</span>
          <span className="rounded-full bg-secondary px-3 py-1 text-muted-foreground">Groups</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {chats.length === 0 && (
          <div className="rounded-xl border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
            {isLoading ? 'Loading runtime chats…' : 'No chats yet. Send a WhatsApp message to this linked account; the runtime event stream will add it here.'}
          </div>
        )}
        {chats.map((chat) => (
          <button
            key={chat.id}
            onClick={() => onSelect(chat.id)}
            className={`flex w-full items-center gap-3 rounded-lg p-3 text-left transition ${
              chat.id === selectedChatId ? 'bg-accent' : 'hover:bg-accent/70'
            }`}
          >
            <DemoAvatar label={chat.avatar ?? chat.name ?? chat.id} />
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-2">
                <span className="truncate text-sm font-medium">{chat.name ?? chat.id}</span>
                <span className="text-xs text-muted-foreground">{chat.last_msg_at ?? ''}</span>
              </div>
              <p className="truncate text-sm text-muted-foreground">{chat.last_message ?? ''}</p>
            </div>
            {(chat.unread_count ?? 0) > 0 && (
              <span className="grid size-5 place-items-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
                {chat.unread_count ?? 0}
              </span>
            )}
          </button>
        ))}
      </div>
    </aside>
  );
}
