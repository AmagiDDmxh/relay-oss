import { Mic, Plus, Send, Smile } from 'lucide-react';
import { useState } from 'react';
import { Button } from './ui/button';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from './ui/input-group';

export function MessageComposer({ onSend }: { onSend: (body: string) => void }) {
  const [value, setValue] = useState('');
  const canSend = value.trim().length > 0;

  const submit = () => {
    if (!canSend) return;
    onSend(value);
    setValue('');
  };

  return (
    <form
      className="flex shrink-0 items-center gap-2 border-t bg-muted/60 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Button variant="ghost" size="icon" type="button" aria-label="Attach file">
        <Plus />
      </Button>
      <InputGroup className="h-11 rounded-full bg-background shadow-xs">
        <InputGroupAddon>
          <InputGroupButton size="icon-sm" aria-label="Emoji">
            <Smile />
          </InputGroupButton>
        </InputGroupAddon>
        <InputGroupInput value={value} onChange={(event) => setValue(event.target.value)} placeholder="Type a message" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-sm" aria-label={canSend ? 'Send message' : 'Record voice'} onClick={submit}>
            {canSend ? <Send /> : <Mic />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}
