import { RelayConnectionError } from './errors';
import type {
  HeartbeatEvent,
  MessageNewEvent,
  MessageStatusUpdatedEvent,
  RelayEvent,
  SessionStateChangedEvent,
  WebSocketLike,
} from './types';

type StreamSource<T> = AsyncIterable<T> | WebSocketLike;

export class RelayEventStream<T = RelayEvent> implements AsyncIterable<T> {
  private readonly source: AsyncIterable<T>;
  private readonly cleanup: (() => void | Promise<void>) | undefined;
  private closed = false;
  private consumed = false;
  private cancelWaiter: (() => void) | undefined;

  constructor(source: StreamSource<T>, cleanup?: (() => void | Promise<void>) | undefined) {
    if (isWebSocketLike(source)) {
      const socket = source;
      this.source = socketEvents<T>(socket);
      this.cleanup = () => socket.close();
    } else {
      this.source = source;
      this.cleanup = cleanup;
    }
  }

  on(callback: (event: T) => void | Promise<void>, onError?: (error: unknown) => void): () => void {
    this.claimConsumer();
    let stopped = false;

    const run = async () => {
      const iterator = this.iterate();
      try {
        for (;;) {
          const next = await iterator.next();
          if (next.done || stopped) break;
          await callback(next.value);
        }
      } finally {
        await iterator.return?.(undefined);
      }
    };

    run().catch((error) => {
      if (onError) {
        onError(error);
        return;
      }
      queueMicrotask(() => {
        throw error;
      });
    });

    return () => {
      stopped = true;
      void this.close();
    };
  }

  filter<S extends T>(predicate: (event: T) => event is S): RelayEventStream<S>;
  filter(predicate: (event: T) => boolean): RelayEventStream<T>;
  filter(predicate: (event: T) => boolean): RelayEventStream<T> {
    const parent = this;
    async function* filtered() {
      for await (const event of parent) {
        if (predicate(event)) yield event;
      }
    }
    return new RelayEventStream<T>(filtered(), () => parent.close());
  }

  map<U>(transform: (event: T) => U): RelayEventStream<U> {
    const parent = this;
    async function* mapped() {
      for await (const event of parent) yield transform(event);
    }
    return new RelayEventStream<U>(mapped(), () => parent.close());
  }

  take(count: number): RelayEventStream<T> {
    const parent = this;
    async function* taken() {
      if (count <= 0) return;
      let remaining = count;
      for await (const event of parent) {
        yield event;
        remaining -= 1;
        if (remaining <= 0) break;
      }
    }
    return new RelayEventStream<T>(taken(), () => parent.close());
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.cancelWaiter?.();
    await this.cleanup?.();
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    this.claimConsumer();
    return this.iterate();
  }

  private claimConsumer(): void {
    if (this.closed) throw new Error('Cannot consume a closed RelayEventStream');
    if (this.consumed) throw new Error('RelayEventStream already has a consumer');
    this.consumed = true;
  }

  private async *iterate(): AsyncGenerator<T> {
    const iterator = this.source[Symbol.asyncIterator]();
    try {
      while (!this.closed) {
        const nextPromise = iterator.next();
        const result = await Promise.race([nextPromise, this.cancelPromise()]);
        if (result === undefined || this.closed) {
          nextPromise.catch(() => undefined);
          break;
        }
        if (result.done) break;
        yield result.value;
      }
    } finally {
      await iterator.return?.(undefined);
    }
  }

  private cancelPromise(): Promise<undefined> {
    if (this.closed) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      this.cancelWaiter = () => resolve(undefined);
    });
  }
}

export function isMessageNewEvent(event: RelayEvent): event is MessageNewEvent {
  return event.event_type === 'message.new';
}

export function isMessageStatusUpdatedEvent(event: RelayEvent): event is MessageStatusUpdatedEvent {
  return event.event_type === 'message.status_updated';
}

export function isSessionStateChangedEvent(event: RelayEvent): event is SessionStateChangedEvent {
  return event.event_type === 'session.state_changed';
}

export function isHeartbeatEvent(event: RelayEvent): event is HeartbeatEvent {
  return event.event_type === 'heartbeat';
}

function isWebSocketLike<T>(source: StreamSource<T>): source is WebSocketLike {
  return typeof (source as WebSocketLike).close === 'function' && 'onmessage' in source;
}

function socketEvents<T>(socket: WebSocketLike): AsyncIterable<T> {
  const queue: T[] = [];
  const waiters: Array<{ resolve: (value: IteratorResult<T>) => void; reject: (error: unknown) => void }> = [];
  let closed = false;
  let failure: unknown;

  function push(event: T): void {
    if (closed) return;
    const waiter = waiters.shift();
    if (waiter) {
      waiter.resolve({ done: false, value: event });
      return;
    }
    queue.push(event);
  }

  function finish(error?: unknown): void {
    if (closed) return;
    closed = true;
    failure = error;
    for (const waiter of waiters.splice(0)) {
      if (error) {
        waiter.reject(error);
      } else {
        waiter.resolve({ done: true, value: undefined });
      }
    }
  }

  socket.onmessage = (message) => {
    try {
      push(JSON.parse(String(message.data)) as T);
    } catch (error) {
      finish(new RelayConnectionError('failed to parse event stream message', { cause: String(error) }));
    }
  };
  socket.onerror = () => finish(new RelayConnectionError('event stream socket error'));
  socket.onclose = () => finish();

  return {
    [Symbol.asyncIterator]() {
      return {
        next() {
          const event = queue.shift();
          if (event) return Promise.resolve({ done: false, value: event });
          if (failure) return Promise.reject(failure);
          if (closed) return Promise.resolve({ done: true, value: undefined });
          return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
        },
        return() {
          finish();
          return Promise.resolve({ done: true, value: undefined });
        },
      };
    },
  };
}
