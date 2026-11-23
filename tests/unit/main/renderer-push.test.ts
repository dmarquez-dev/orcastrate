/**
 * The renderer broadcast and the `render-process-gone` logger, exercised
 * against plain fake windows. Every fake RECORDS the sends it receives, so an
 * assertion that a window was skipped reads an empty recording rather than
 * trusting that nothing went wrong.
 */

import { describe, expect, it } from 'vitest';

import {
  createRenderProcessGoneLogger,
  createRendererPush,
  type PushFrame,
  type PushWebContents,
  type PushWindow,
} from '../../../src/main/renderer-push';

interface FakeOptions {
  id?: number;
  windowDestroyed?: boolean;
  contentsDestroyed?: boolean;
  crashed?: boolean;
  frameDestroyed?: boolean;
  frameDetached?: boolean;
  /** When set, reading `mainFrame` throws this error. */
  frameGetterThrows?: Error;
  /** When set, `send` throws this error. */
  sendThrows?: Error;
}

interface Fake {
  window: PushWindow;
  sends: unknown[][];
  /** Live state: changing a field changes what the next push sees. */
  state: FakeOptions;
}

function makeFake(options: FakeOptions = {}): Fake {
  const state: FakeOptions = { ...options };
  const sends: unknown[][] = [];
  const frame: PushFrame = {
    isDestroyed: () => state.frameDestroyed ?? false,
    get detached(): boolean {
      return state.frameDetached ?? false;
    },
  };
  const contents: PushWebContents = {
    id: state.id ?? 1,
    isDestroyed: () => state.contentsDestroyed ?? false,
    isCrashed: () => state.crashed ?? false,
    get mainFrame(): PushFrame {
      if (state.frameGetterThrows !== undefined) throw state.frameGetterThrows;
      return frame;
    },
    send: (channel: string, ...args: unknown[]): void => {
      if (state.sendThrows !== undefined) throw state.sendThrows;
      sends.push([channel, ...args]);
    },
  };
  const window: PushWindow = {
    isDestroyed: () => state.windowDestroyed ?? false,
    webContents: contents,
  };
  return { window, sends, state };
}

function build(windows: readonly PushWindow[]): {
  push: (channel: string, payload: unknown) => void;
  lines: string[];
} {
  const lines: string[] = [];
  const push = createRendererPush({
    getWindows: () => windows,
    log: (line) => {
      lines.push(line);
    },
  });
  return { push, lines };
}

const CHANNEL = 'test:channel';

describe('createRendererPush', () => {
  it('C9: a healthy window receives exactly one send with the arguments unchanged', () => {
    const fake = makeFake();
    const payload = { a: 1 };
    const { push, lines } = build([fake.window]);
    push(CHANNEL, payload);
    expect(fake.sends).toHaveLength(1);
    expect(fake.sends[0]?.[0]).toBe(CHANNEL);
    expect(fake.sends[0]?.[1]).toBe(payload);
    expect(lines).toEqual([]);
  });

  it('C2: returns without throwing when send throws', () => {
    const fake = makeFake({ sendThrows: new Error('Render frame was disposed') });
    const { push } = build([fake.window]);
    expect(() => push(CHANNEL, 'x')).not.toThrow();
  });

  it('C3: a second window still receives the push when the first throws', () => {
    const bad = makeFake({ id: 1, sendThrows: new Error('boom') });
    const good = makeFake({ id: 2 });
    const payload = { b: 2 };
    const { push } = build([bad.window, good.window]);
    push(CHANNEL, payload);
    expect(good.sends).toEqual([[CHANNEL, payload]]);
  });

  it('C4: a crashed webContents is skipped', () => {
    const fake = makeFake({ crashed: true });
    const { push, lines } = build([fake.window]);
    push(CHANNEL, 'x');
    expect(fake.sends).toEqual([]);
    expect(lines).toEqual([]);
  });

  it('C5: a destroyed main frame is skipped', () => {
    const fake = makeFake({ frameDestroyed: true });
    const { push, lines } = build([fake.window]);
    push(CHANNEL, 'x');
    expect(fake.sends).toEqual([]);
    expect(lines).toEqual([]);
  });

  it('C6: a detached main frame is skipped', () => {
    const fake = makeFake({ frameDetached: true });
    const { push, lines } = build([fake.window]);
    push(CHANNEL, 'x');
    expect(fake.sends).toEqual([]);
    expect(lines).toEqual([]);
  });

  it('C7: a throwing mainFrame getter is skipped without throwing', () => {
    const fake = makeFake({ frameGetterThrows: new Error('frame gone') });
    const { push } = build([fake.window]);
    expect(() => push(CHANNEL, 'x')).not.toThrow();
    expect(fake.sends).toEqual([]);
  });

  it('C8: a destroyed window and a destroyed webContents are each skipped', () => {
    const destroyedWindow = makeFake({ id: 1, windowDestroyed: true });
    const destroyedContents = makeFake({ id: 2, contentsDestroyed: true });
    const { push, lines } = build([destroyedWindow.window, destroyedContents.window]);
    push(CHANNEL, 'x');
    expect(destroyedWindow.sends).toEqual([]);
    expect(destroyedContents.sends).toEqual([]);
    expect(lines).toEqual([]);
  });

  it('C10: one webContents failing on three consecutive broadcasts logs once', () => {
    const fake = makeFake({ sendThrows: new Error('boom') });
    const { push, lines } = build([fake.window]);
    push(CHANNEL, 1);
    push(CHANNEL, 2);
    push(CHANNEL, 3);
    expect(lines).toHaveLength(1);
  });

  it('C10: a skip that throws nothing neither logs nor clears the failing mark', () => {
    const fake = makeFake({ sendThrows: new Error('boom') });
    const { push, lines } = build([fake.window]);
    push(CHANNEL, 1);
    fake.state.crashed = true;
    push(CHANNEL, 2);
    fake.state.crashed = false;
    push(CHANNEL, 3);
    expect(lines).toHaveLength(1);
  });

  it('C11: fail, succeed, fail logs twice', () => {
    const fake = makeFake({ sendThrows: new Error('boom') });
    const { push, lines } = build([fake.window]);
    push(CHANNEL, 1);
    fake.state.sendThrows = undefined;
    push(CHANNEL, 2);
    expect(fake.sends).toEqual([[CHANNEL, 2]]);
    fake.state.sendThrows = new Error('boom again');
    push(CHANNEL, 3);
    expect(lines).toHaveLength(2);
  });

  it('C12: two failing webContents with different ids log one line each', () => {
    const first = makeFake({ id: 7, sendThrows: new Error('one') });
    const second = makeFake({ id: 8, frameGetterThrows: new Error('two') });
    const { push, lines } = build([first.window, second.window]);
    push(CHANNEL, 'x');
    expect(lines).toHaveLength(2);
  });

  it('C13: the log line names the channel, id and message, and never the payload', () => {
    const SENTINEL = 'SENTINEL-PAYLOAD-7f3a';
    const fake = makeFake({ id: 42, sendThrows: new Error('Render frame was disposed') });
    const logged: unknown[][] = [];
    const push = createRendererPush({
      getWindows: () => [fake.window],
      log: (...args: unknown[]) => {
        logged.push(args);
      },
    });
    push(CHANNEL, { secret: SENTINEL });
    expect(logged).toHaveLength(1);
    const line = String(logged[0]?.[0]);
    expect(line).toContain(CHANNEL);
    expect(line).toContain('42');
    expect(line).toContain('Render frame was disposed');
    for (const arg of logged.flat()) {
      expect(JSON.stringify(arg) ?? String(arg)).not.toContain(SENTINEL);
    }
  });
});

describe('createRenderProcessGoneLogger', () => {
  it('C15: logs the reason, exit code and webContents id', () => {
    const lines: string[] = [];
    const listener = createRenderProcessGoneLogger((line) => {
      lines.push(line);
    });
    listener({}, { id: 31 }, { reason: 'crashed', exitCode: -1073741819 });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('crashed');
    expect(lines[0]).toContain('-1073741819');
    expect(lines[0]).toContain('31');
  });
});
