/**
 * The streaming-input generator behind `PodRunner.send()`.
 *
 * This is the object that makes one Pod one long-lived session: `query()` is
 * handed this queue ONCE as its `prompt`, and every subsequent `send()` pushes
 * into it. Calling `query()` per message would start a new CLI process per
 * message and lose the conversation.
 *
 * Ordering is FIFO and is the whole point of the buffer: `send()` may be called
 * while the CLI is mid-turn and not yet pulling, so pushes queue rather than
 * being dropped or reordered.
 */

export interface QueuedUserMessage {
  type: 'user';
  message: { role: 'user'; content: string };
  parent_tool_use_id: null;
}

export function userMessage(text: string): QueuedUserMessage {
  return { type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null };
}

export class InputQueue<T> implements AsyncIterable<T> {
  #buffered: T[] = [];
  #waiting: ((result: IteratorResult<T>) => void)[] = [];
  #closed = false;

  get closed(): boolean {
    return this.#closed;
  }

  /** Number of items pushed but not yet pulled. Diagnostics only. */
  get pending(): number {
    return this.#buffered.length;
  }

  push(item: T): void {
    if (this.#closed) return;
    const waiter = this.#waiting.shift();
    if (waiter) {
      waiter({ value: item, done: false });
      return;
    }
    this.#buffered.push(item);
  }

  /** Ends the input stream. Idempotent. Buffered items are still delivered. */
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const waiter of this.#waiting.splice(0)) {
      waiter({ value: undefined, done: true });
    }
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T, void> {
    for (;;) {
      const buffered = this.#buffered.shift();
      if (buffered !== undefined) {
        yield buffered;
        continue;
      }
      if (this.#closed) return;
      const next = await new Promise<IteratorResult<T>>((resolve) => {
        this.#waiting.push(resolve);
      });
      if (next.done) return;
      yield next.value;
    }
  }
}
