import type { ChatResponse, MessageResponse } from '@squady/whatsapp-relay';
import { ChatList } from './ChatList';
import { ConversationView } from './ConversationView';

export function WhatsAppShell({
  chats,
  selectedChat,
  selectedChatId,
  messages,
  isLoadingChats,
  onSelectChat,
  onSend,
  onLogout,
  onInbound,
}: {
  chats: ChatResponse[];
  selectedChat?: ChatResponse;
  selectedChatId: string;
  messages: MessageResponse[];
  isLoadingChats: boolean;
  onSelectChat: (id: string) => void;
  onSend: (body: string) => void;
  onLogout: () => void;
  onInbound: () => void;
}) {
  return (
    <div className="flex h-full overflow-hidden bg-white">
      <ChatList chats={chats} selectedChatId={selectedChatId} onSelect={onSelectChat} onLogout={onLogout} isLoading={isLoadingChats} />
      <ConversationView chat={selectedChat} messages={messages} onSend={onSend} onInbound={onInbound} isLoadingChats={isLoadingChats} />
    </div>
  );
}
