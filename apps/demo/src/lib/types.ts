export interface DemoLog {
  id: string;
  timestamp: string;
  kind: 'http' | 'event' | 'whatsapp' | 'state';
  method?: string;
  title: string;
  detail: string;
  docsHref: string;
  code: string;
}
