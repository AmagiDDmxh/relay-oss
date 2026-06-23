import { BookOpen, Wifi } from 'lucide-react';
import { DevPanel } from './components/DevPanel';
import { Badge } from './components/ui/badge';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from './components/ui/resizable';
import { Toaster } from './components/ui/sonner';
import { WatchRelayDemo } from './components/WatchRelayDemo';
import { useDemoState } from './hooks/use-demo-state';
import { relayDocsUrl } from './lib/links';

function statusTone(status: string) {
  if (status === 'CONNECTED') return 'success';
  if (status === 'QR_READY') return 'blue';
  if (status === 'RELOGIN_REQUIRED' || status === 'EXPIRED') return 'error';
  return 'warning';
}

export default function App() {
  const demo = useDemoState();

  return (
    <>
      <div className="h-screen overflow-hidden bg-[#f2f3f5] text-neutral-950">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-5">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-2xl bg-black text-xs font-extrabold text-white">WR</div>
          <div>
            <h1 className="text-base font-extrabold tracking-[-0.05em]">WhatsApp Relay POC Demo</h1>
            <p className="text-xs text-neutral-500">Multi-watch companion app · QR bind · notification to chat view</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={relayDocsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            <BookOpen className="h-4 w-4" />
            Docs
          </a>
          <Badge tone={statusTone(demo.status)}>{demo.status}</Badge>
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-500">
            <Wifi className="h-4 w-4" /> local-poc
          </div>
        </div>
      </header>

      <ResizablePanelGroup
        orientation="horizontal"
        resizeTargetMinimumSize={{ fine: 18, coarse: 28 }}
        className="h-[calc(100vh-56px)] min-h-0 overflow-hidden"
      >
        <ResizablePanel id="demo-main" minSize="720px" className="min-h-0 min-w-0 overflow-hidden">
          <WatchRelayDemo
            accountProfile={demo.accountProfile}
            activeView={demo.watchView}
            bindingId={demo.bindingId}
            chats={demo.chats}
            devices={demo.devices}
            expiresAt={demo.qrExpiresAt}
            isBinding={demo.isBinding}
            isLoadingChats={demo.isLoadingChats}
            isLoadingProfile={demo.isLoadingProfile}
            isPollingBindStatus={demo.isPollingBindStatus}
            messages={demo.selectedMessages}
            notificationToast={demo.watchToast}
            onBackToApps={demo.backToApps}
            onBackToChats={demo.backToChats}
            onCreateWatch={demo.createWatch}
            onDeleteWatch={demo.deleteWatch}
            onDeleteWatchAndLogout={demo.deleteWatchAndLogout}
            onInbound={demo.simulateInbound}
            onLogout={demo.logout}
            onOpenProfile={demo.openAccountProfile}
            onOpenWhatsApp={demo.openWhatsApp}
            onNotificationClick={demo.openNotification}
            onNotificationDismiss={demo.clearWatchToast}
            onSelectChat={demo.selectChat}
            onSelectDevice={demo.selectDevice}
            onSend={demo.sendMessage}
            onStartBind={demo.startBind}
            onRefreshStatus={demo.refreshCurrentAuthStatus}
            onRefreshProfile={demo.refreshAccountProfile}
            qrCode={demo.qrCode}
            sendFailure={demo.sendFailure}
            selectedChat={demo.selectedChat}
            selectedChatId={demo.selectedChatId}
            selectedDevice={demo.selectedDevice}
          />
        </ResizablePanel>
        <ResizableHandle withHandle className="w-1 bg-transparent transition-colors hover:bg-primary/20 data-[separator=active]:bg-primary/20 [&>div]:bg-border" />
        <ResizablePanel
          id="demo-dev-panel"
          defaultSize="560px"
          minSize="420px"
          maxSize="860px"
          groupResizeBehavior="preserve-pixel-size"
          className="min-h-0 min-w-0 overflow-hidden"
        >
          <DevPanel
            activeSessionId={demo.activeSessionId}
            authStatus={demo.authStatus}
            bindingId={demo.bindingId}
            deviceId={demo.selectedDeviceId}
            isBinding={demo.isBinding}
            isPollingBindStatus={demo.isPollingBindStatus}
            logs={demo.logs}
            qrExpiresAt={demo.qrExpiresAt}
            selectedLogId={demo.selectedLogId}
            onSelectLog={demo.setSelectedLogId}
            status={demo.status}
            sessions={demo.sessions}
            onDisconnect={demo.simulateDisconnect}
            onReconnect={demo.simulateReconnect}
            onRelogin={demo.simulateRelogin}
            onLogoutAllSessions={demo.logoutAllSessions}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
      </div>
      <Toaster position="bottom-right" />
    </>
  );
}
