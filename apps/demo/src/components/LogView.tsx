import { toast } from 'sonner';
import { Copy } from 'lucide-react';
import type { DemoLog } from '@/lib/types';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Table, TableBody, TableCell, TableRow } from './ui/table';

function methodLabel(log: DemoLog) {
  return log.method ?? log.kind.toUpperCase();
}

function logText(log: DemoLog) {
  return [`[${log.timestamp}] ${methodLabel(log)} ${log.title}`, log.detail, '', log.code].filter(Boolean).join('\n');
}

async function copyLog(log: DemoLog) {
  const text = logText(log);
  await navigator.clipboard.writeText(text);
  toast.success('Log copied', { description: log.title });
}

export function LogView({ logs, selectedLogId, onSelect }: { logs: DemoLog[]; selectedLogId?: string; onSelect: (id: string) => void }) {
  return (
    <section className="flex h-70 shrink-0 flex-col rounded-none border bg-card text-card-foreground shadow-xs">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2">
        <div>
          <h2 className="text-sm font-semibold">Live logs</h2>
          <p className="text-xs text-muted-foreground">HTTP requests and WhatsApp events</p>
        </div>
        <Badge variant="secondary">stream</Badge>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <Table>
          <TableBody>
            {logs.map((log) => {
              const active = log.id === selectedLogId;
              return (
                <TableRow
                  key={log.id}
                  data-state={active ? 'selected' : undefined}
                  className="group cursor-pointer"
                  onClick={() => {
                    onSelect(log.id);
                    void copyLog(log);
                  }}
                >
                  <TableCell className="w-14.5 whitespace-nowrap font-mono text-[11px] text-muted-foreground">{log.timestamp}</TableCell>
                  <TableCell className="w-13 whitespace-nowrap">
                    <Badge variant={log.kind === 'http' ? 'default' : 'outline'} className="px-1.5 py-0 font-mono text-[10px]">
                      {methodLabel(log)}
                    </Badge>
                  </TableCell>
                  <TableCell className="min-w-0 whitespace-normal text-xs">
                    <div className="whitespace-normal break-words leading-relaxed">
                      <span className="font-medium">{log.title}</span>
                      <span className="text-muted-foreground"> · {log.detail}</span>
                    </div>
                  </TableCell>
                  <TableCell className="w-11 whitespace-nowrap text-right">
                    <a
                      href={log.docsHref}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-primary opacity-0 underline-offset-4 transition-opacity hover:underline focus-visible:opacity-100 group-hover:opacity-100"
                      onClick={(event) => event.stopPropagation()}
                    >
                      Docs
                    </a>
                    <Copy className="ml-2 inline size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-70" aria-hidden="true" />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </ScrollArea>
    </section>
  );
}
