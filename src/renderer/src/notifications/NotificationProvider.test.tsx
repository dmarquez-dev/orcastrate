// @vitest-environment jsdom
/**
 * The notification region, driven through its public surface alone: the
 * provider, the `Notifier` that `useNotify()` returns, and the DOM guarantees
 * of the frozen contract (`contracts/notifications.ts`).
 *
 * Imports nothing from `../state`, `../test-utils` or `../__tests__`, so this
 * suite cannot read a peer task's in-flight files; it registers its own
 * `cleanup` for the same reason.
 */

import type { JSX, ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import * as notifications from './index';
import {
  NOTIFICATION_TEST_IDS,
  NotificationProvider,
  useNotify,
  type NotificationAction,
  type NotificationKind,
  type NotificationProviderProps,
  type NotificationRequest,
  type Notifier,
} from './index';

const MS = 1000;
const KINDS: readonly NotificationKind[] = ['error', 'info', 'success'];

let captured: Notifier[] = [];

function Capture(): null {
  captured.push(useNotify());
  return null;
}

function latest(): Notifier {
  const notifier = captured[captured.length - 1];
  if (notifier === undefined) throw new Error('no Notifier was captured');
  return notifier;
}

function renderRegion(children?: ReactNode) {
  return render(
    <NotificationProvider autoDismissMs={MS}>
      <Capture />
      {children}
    </NotificationProvider>,
  );
}

function notify(request: NotificationRequest): void {
  act(() => latest().notify(request));
}

function dismiss(key: string): void {
  act(() => latest().dismiss(key));
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function viewport(): HTMLElement {
  return screen.getByTestId(NOTIFICATION_TEST_IDS.viewport);
}

function items(): HTMLElement[] {
  return within(viewport()).queryAllByTestId(NOTIFICATION_TEST_IDS.item);
}

function messageOf(item: HTMLElement): HTMLElement {
  const message = item.querySelector<HTMLElement>('[role="alert"], [role="status"]');
  if (message === null) throw new Error('notification item has no message element');
  return message;
}

function messages(): string[] {
  return items().map((item) => messageOf(item).textContent ?? '');
}

function dismissControlOf(item: HTMLElement): HTMLElement {
  return within(item).getByRole('button', { name: 'Dismiss notification' });
}

function only<T>(list: T[], what: string): T {
  if (list.length !== 1) throw new Error(`expected exactly one ${what}, found ${list.length}`);
  const [one] = list;
  if (one === undefined) throw new Error(`expected exactly one ${what}`);
  return one;
}

function at<T>(list: T[], index: number, what: string): T {
  const one = list[index];
  if (one === undefined) throw new Error(`no ${what} at index ${index}`);
  return one;
}

beforeEach(() => {
  captured = [];
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the public surface (C1)', () => {
  it('ships exactly the contract’s runtime exports, with the contract’s test ids', () => {
    expect(Object.keys(notifications).sort()).toEqual([
      'NOTIFICATION_TEST_IDS',
      'NotificationProvider',
      'useNotify',
    ]);
    expect(NOTIFICATION_TEST_IDS).toEqual({
      viewport: 'notification-viewport',
      item: 'notification',
      dismiss: 'notification-dismiss',
    });
    expect(typeof NotificationProvider).toBe('function');
    expect(typeof useNotify).toBe('function');
  });

  it('declares the contract’s types (checked by the compiler, not at run time)', () => {
    expectTypeOf<NotificationKind>().toEqualTypeOf<'error' | 'info' | 'success'>();
    expectTypeOf<NotificationRequest>().toEqualTypeOf<{
      kind: NotificationKind;
      message: string;
      key?: string;
      action?: NotificationAction;
    }>();
    expectTypeOf<NotificationAction>().toEqualTypeOf<{ label: string; onAction: () => void }>();
    expectTypeOf<Notifier['notify']>().toEqualTypeOf<(request: NotificationRequest) => void>();
    expectTypeOf<Notifier['dismiss']>().toEqualTypeOf<(key: string) => void>();
    expectTypeOf<NotificationProviderProps>().toEqualTypeOf<{
      children: ReactNode;
      autoDismissMs?: number;
    }>();
    expectTypeOf(NotificationProvider).toEqualTypeOf<
      (props: NotificationProviderProps) => JSX.Element
    >();
    expectTypeOf(useNotify).toEqualTypeOf<() => Notifier>();
    expectTypeOf(NOTIFICATION_TEST_IDS).toEqualTypeOf<{
      readonly viewport: 'notification-viewport';
      readonly item: 'notification';
      readonly dismiss: 'notification-dismiss';
    }>();
  });
});

describe('lifetimes', () => {
  it('keeps an error after ten times autoDismissMs (C2)', () => {
    renderRegion();
    notify({ kind: 'error', message: 'Could not save' });
    advance(MS * 10);
    expect(items().map((item) => item.dataset.kind)).toEqual(['error']);
    expect(messages()).toEqual(['Could not save']);
  });

  for (const kind of ['info', 'success'] as const) {
    it(`removes ${kind} at exactly autoDismissMs (${kind === 'info' ? 'C3' : 'C4'})`, () => {
      renderRegion();
      notify({ kind, message: `${kind} message` });
      advance(MS - 1);
      expect(messages()).toEqual([`${kind} message`]);
      advance(1);
      expect(items()).toEqual([]);
    });
  }

  it('restarts a transient’s timer when a keyed replacement lands', () => {
    renderRegion();
    notify({ kind: 'info', message: 'first', key: 'k' });
    advance(MS - 1);
    notify({ kind: 'success', message: 'second', key: 'k' });
    advance(MS - 1);
    expect(messages()).toEqual(['second']);
    advance(1);
    expect(items()).toEqual([]);
  });
});

describe('keys and dismissal', () => {
  it('replaces a keyed item in place, with the second call’s message and kind (C5)', () => {
    renderRegion();
    notify({ kind: 'info', message: 'Saving', key: 'save' });
    notify({ kind: 'success', message: 'Other done' });
    notify({ kind: 'error', message: 'Save failed', key: 'save' });
    const [first, second] = [at(items(), 0, 'item'), at(items(), 1, 'item')];
    expect(items()).toHaveLength(2);
    expect(messages()).toEqual(['Save failed', 'Other done']);
    expect(first.dataset.kind).toBe('error');
    expect(second.dataset.kind).toBe('success');
    expect(messages().filter((text) => text === 'Saving')).toEqual([]);
  });

  it('dismiss(key) removes that item and leaves every other (C6)', () => {
    renderRegion();
    notify({ kind: 'error', message: 'one', key: 'a' });
    notify({ kind: 'error', message: 'two', key: 'b' });
    notify({ kind: 'info', message: 'three' });
    dismiss('a');
    expect(messages()).toEqual(['two', 'three']);
  });

  it('dismiss with a key no live item carries does not throw and changes nothing (C6)', () => {
    renderRegion();
    notify({ kind: 'error', message: 'one', key: 'a' });
    notify({ kind: 'info', message: 'two' });
    const before = items();
    expect(() => dismiss('nobody')).not.toThrow();
    expect(items()).toEqual(before);
    expect(messages()).toEqual(['one', 'two']);
  });
});

describe('item structure', () => {
  it('gives every kind a native dismiss button outside the message, removing that item only (C7)', () => {
    renderRegion();
    for (const kind of KINDS) notify({ kind, message: `${kind} text` });
    for (const kind of KINDS) {
      const item = only(
        items().filter((one) => one.dataset.kind === kind),
        `${kind} item`,
      );
      const button = dismissControlOf(item);
      expect(button.tagName).toBe('BUTTON');
      expect(button.getAttribute('type')).toBe('button');
      expect(button.dataset.testid).toBe(NOTIFICATION_TEST_IDS.dismiss);
      expect(messageOf(item).contains(button)).toBe(false);
    }
    const success = only(
      items().filter((one) => one.dataset.kind === 'success'),
      'success item',
    );
    fireEvent.click(dismissControlOf(success));
    expect(items().map((item) => item.dataset.kind)).toEqual(['error', 'info']);
  });

  it('gives the message element the kind’s live role and the message as its first Text node (C8)', () => {
    renderRegion();
    const expectedRole: Record<NotificationKind, string> = {
      error: 'alert',
      info: 'status',
      success: 'status',
    };
    for (const kind of KINDS) notify({ kind, message: `  ${kind}: exact <text>  ` });
    expect(items()).toHaveLength(KINDS.length);
    for (const item of items()) {
      const kind = KINDS.find((one) => one === item.dataset.kind);
      if (kind === undefined) throw new Error(`item has no known data-kind: ${item.dataset.kind}`);
      const message = messageOf(item);
      const text = `  ${kind}: exact <text>  `;
      expect(message.getAttribute('role')).toBe(expectedRole[kind]);
      expect(message.textContent).toBe(text);
      const first = message.firstChild;
      expect(first).toBeInstanceOf(Text);
      if (!(first instanceof Text)) throw new Error('message element’s first child is not a Text node');
      expect(first.data).toBe(text);
    }
  });

  it('renders an empty message, for every kind, as a message element with no child nodes and empty textContent', () => {
    renderRegion();
    for (const kind of KINDS) notify({ kind, message: '' });
    for (const kind of KINDS) {
      const item = only(
        items().filter((one) => one.dataset.kind === kind),
        `${kind} item`,
      );
      const message = messageOf(item);
      expect(message.childNodes.length).toBe(0);
      expect(message.textContent).toBe('');
    }
  });

  it('marks each kind with data-kind and an aria-hidden glyph that differs per kind (C9)', () => {
    renderRegion();
    for (const kind of KINDS) notify({ kind, message: kind });
    const glyphs = items().map((item) => {
      expect(item.dataset.kind).toBe(messageOf(item).textContent);
      const marker = only(
        [...item.querySelectorAll('[aria-hidden="true"]')].filter(
          (node) => !node.closest('button'),
        ),
        'marker',
      );
      return marker.textContent ?? '';
    });
    expect(glyphs.every((glyph) => glyph.length > 0)).toBe(true);
    expect(new Set(glyphs).size).toBe(3);
  });
});

describe('the viewport', () => {
  it('renders exactly one labelled viewport, empty, after the children (C10)', () => {
    renderRegion(<p data-testid="child">child</p>);
    const found = screen.getAllByTestId(NOTIFICATION_TEST_IDS.viewport);
    expect(found).toHaveLength(1);
    const region = only(found, 'viewport');
    expect(region.getAttribute('aria-label')).toBe('Notifications');
    expect(region.getAttribute('tabindex')).toBe('-1');
    expect(items()).toEqual([]);
    const child = screen.getByTestId('child');
    expect(child.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('the hook', () => {
  it('throws an Error naming NotificationProvider outside a provider (C11)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let thrown: unknown;
    try {
      render(<Capture />);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    if (!(thrown instanceof Error)) throw new Error('useNotify() outside a provider threw no Error');
    expect(thrown.message).toContain('NotificationProvider');
  });

  it('returns the same Notifier across a re-render of its caller (C12)', () => {
    const view = renderRegion();
    view.rerender(
      <NotificationProvider autoDismissMs={MS}>
        <Capture />
      </NotificationProvider>,
    );
    expect(captured.length).toBeGreaterThanOrEqual(2);
    const [first] = captured;
    expect(Object.is(first, latest())).toBe(true);
  });
});

describe('the transient cap', () => {
  it('keeps three of four unkeyed infos, dropping the first raised (C13)', () => {
    renderRegion();
    for (const n of [1, 2, 3, 4]) notify({ kind: 'info', message: `info ${n}` });
    expect(messages()).toEqual(['info 2', 'info 3', 'info 4']);
  });

  it('never evicts a live error (C14)', () => {
    renderRegion();
    notify({ kind: 'error', message: 'broken' });
    for (const n of [1, 2, 3, 4]) notify({ kind: 'info', message: `info ${n}` });
    expect(messages()).toEqual(['broken', 'info 2', 'info 3', 'info 4']);
  });
});

describe('pausing', () => {
  it('holds a transient while the pointer is over the viewport, and removes it after (C15)', () => {
    renderRegion();
    notify({ kind: 'info', message: 'held' });
    fireEvent.mouseEnter(viewport());
    advance(MS);
    expect(messages()).toEqual(['held']);
    fireEvent.mouseLeave(viewport());
    advance(MS);
    expect(items()).toEqual([]);
  });

  it('holds a transient while focus is on its dismiss control (C16)', () => {
    renderRegion();
    notify({ kind: 'info', message: 'held' });
    act(() => dismissControlOf(only(items(), 'item')).focus());
    advance(MS);
    expect(messages()).toEqual(['held']);
  });
});

describe('focus', () => {
  it('never moves focus when notify is called, for any kind (C17)', () => {
    renderRegion(<button type="button">outside</button>);
    const outside = screen.getByRole('button', { name: 'outside' });
    act(() => outside.focus());
    for (const kind of KINDS) {
      notify({ kind, message: kind });
      expect(document.activeElement).toBe(outside);
    }
  });

  it('moves focus to the remaining item’s dismiss control after the first is dismissed (C18)', () => {
    renderRegion();
    notify({ kind: 'error', message: 'first' });
    notify({ kind: 'error', message: 'second' });
    const first = at(items(), 0, 'item');
    act(() => dismissControlOf(first).focus());
    fireEvent.click(dismissControlOf(first));
    const remaining = only(items(), 'remaining item');
    expect(messageOf(remaining).textContent).toBe('second');
    expect(document.activeElement).toBe(dismissControlOf(remaining));
  });

  it('moves focus to the preceding item’s dismiss control when none follows', () => {
    renderRegion();
    notify({ kind: 'error', message: 'first' });
    notify({ kind: 'error', message: 'second' });
    fireEvent.click(dismissControlOf(at(items(), 1, 'item')));
    expect(document.activeElement).toBe(dismissControlOf(only(items(), 'remaining item')));
  });

  it('moves focus to the viewport when the only item is dismissed (C19)', () => {
    renderRegion();
    notify({ kind: 'error', message: 'only' });
    fireEvent.click(dismissControlOf(only(items(), 'item')));
    expect(items()).toEqual([]);
    expect(document.activeElement).toBe(viewport());
  });

  it('resumes timers when a focused item is removed by dismiss(key)', () => {
    renderRegion();
    notify({ kind: 'error', message: 'focused', key: 'e' });
    notify({ kind: 'info', message: 'transient' });
    const focused = at(items(), 0, 'item');
    act(() => dismissControlOf(focused).focus());
    dismiss('e');
    advance(MS);
    expect(items()).toEqual([]);
  });
});

describe('unmount', () => {
  it('leaves no pending timer after unmount with an info live (C20)', () => {
    const view = renderRegion();
    notify({ kind: 'info', message: 'pending' });
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

function itemWith(message: string): HTMLElement {
  return only(
    items().filter((one) => messageOf(one).textContent === message),
    `item with message ${JSON.stringify(message)}`,
  );
}

function actionControlOf(item: HTMLElement, label: string): HTMLElement {
  return within(item).getByRole('button', { name: label });
}

function noop(): void {}

describe('an item without an action', () => {
  it('has, for every kind, exactly a marker, a message element without an id, and a dismiss button, in that order', () => {
    renderRegion();
    for (const kind of KINDS) notify({ kind, message: `${kind} text` });
    for (const kind of KINDS) {
      const item = only(
        items().filter((one) => one.dataset.kind === kind),
        `${kind} item`,
      );
      const children = [...item.children];
      expect(children).toHaveLength(3);
      const [marker, message, dismissButton] = children;
      expect(marker?.tagName).toBe('SPAN');
      expect(marker?.getAttribute('aria-hidden')).toBe('true');
      expect(message).toBe(messageOf(item));
      expect(message?.hasAttribute('id')).toBe(false);
      expect(dismissButton).toBe(dismissControlOf(item));
      expect(item.querySelectorAll('button')).toHaveLength(1);
    }
  });
});

describe('the action control', () => {
  it('renders as a native button labelled only by its text, between the message and the dismiss control', () => {
    renderRegion();
    notify({ kind: 'error', message: 'Could not load lanes', action: { label: 'Retry', onAction: noop } });
    const item = only(items(), 'item');
    const children = [...item.children];
    expect(children).toHaveLength(4);
    const [marker, message, control, dismissButton] = children;
    expect(marker?.tagName).toBe('SPAN');
    expect(marker?.getAttribute('aria-hidden')).toBe('true');
    expect(message).toBe(messageOf(item));
    expect(dismissButton).toBe(dismissControlOf(item));
    expect(control).toBeInstanceOf(HTMLButtonElement);
    expect(control?.getAttribute('type')).toBe('button');
    expect(control?.textContent).toBe('Retry');
    expect(actionControlOf(item, 'Retry')).toBe(control);
    expect(control?.hasAttribute('aria-label')).toBe(false);
    expect(control?.hasAttribute('aria-labelledby')).toBe(false);
    expect(messageOf(item).contains(control ?? null)).toBe(false);
    expect(messageOf(item).textContent).toBe('Could not load lanes');
    expect(messageOf(item).childNodes.length).toBe(1);
  });

  it('describes each of two same-labelled action controls by its own item’s message element', () => {
    renderRegion();
    notify({ kind: 'error', message: 'Lanes failed', action: { label: 'Retry', onAction: noop } });
    notify({ kind: 'error', message: 'Events failed', action: { label: 'Retry', onAction: noop } });
    for (const text of ['Lanes failed', 'Events failed']) {
      const item = itemWith(text);
      const id = actionControlOf(item, 'Retry').getAttribute('aria-describedby') ?? '';
      expect(id).not.toBe('');
      expect(document.getElementById(id)).toBe(messageOf(item));
    }
  });

  it('on click calls onAction once and removes only its own item', () => {
    renderRegion();
    const onAction = vi.fn();
    notify({ kind: 'error', message: 'before' });
    notify({ kind: 'error', message: 'acted on', action: { label: 'Retry', onAction } });
    notify({ kind: 'info', message: 'after' });
    fireEvent.click(actionControlOf(itemWith('acted on'), 'Retry'));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(messages()).toEqual(['before', 'after']);
  });

  it('on click of the middle of three items moves focus to the following item’s dismiss control', () => {
    renderRegion();
    notify({ kind: 'error', message: 'first' });
    notify({ kind: 'error', message: 'middle', action: { label: 'Retry', onAction: noop } });
    notify({ kind: 'error', message: 'last' });
    fireEvent.click(actionControlOf(itemWith('middle'), 'Retry'));
    expect(document.activeElement).toBe(dismissControlOf(itemWith('last')));
  });

  it('on click of the last of two items moves focus to the preceding item’s dismiss control', () => {
    renderRegion();
    notify({ kind: 'error', message: 'first' });
    notify({ kind: 'error', message: 'last', action: { label: 'Retry', onAction: noop } });
    fireEvent.click(actionControlOf(itemWith('last'), 'Retry'));
    expect(document.activeElement).toBe(dismissControlOf(itemWith('first')));
  });

  it('on click of the only item moves focus to the viewport', () => {
    renderRegion();
    notify({ kind: 'error', message: 'only', action: { label: 'Retry', onAction: noop } });
    fireEvent.click(actionControlOf(only(items(), 'item'), 'Retry'));
    expect(items()).toEqual([]);
    expect(document.activeElement).toBe(viewport());
  });

  it('when onAction re-notifies the same key, leaves one item with the new message and action and focuses the viewport', () => {
    renderRegion();
    notify({
      kind: 'error',
      message: 'Could not load',
      key: 'k',
      action: {
        label: 'Retry',
        onAction: () =>
          latest().notify({
            kind: 'error',
            message: 'Still could not load',
            key: 'k',
            action: { label: 'Retry again', onAction: noop },
          }),
      },
    });
    fireEvent.click(actionControlOf(only(items(), 'item'), 'Retry'));
    const item = only(items(), 'item');
    expect(messageOf(item).textContent).toBe('Still could not load');
    expect(actionControlOf(item, 'Retry again')).toBeInstanceOf(HTMLButtonElement);
    expect(document.activeElement).toBe(viewport());
  });
});

describe('the action control under keyed replacement', () => {
  it('takes the replacement’s label and callback, never calling the replaced callback', () => {
    renderRegion();
    const first = vi.fn();
    const second = vi.fn();
    notify({ kind: 'error', message: 'one', key: 'k', action: { label: 'First', onAction: first } });
    notify({ kind: 'error', message: 'two', key: 'k', action: { label: 'Second', onAction: second } });
    const item = only(items(), 'item');
    const control = actionControlOf(item, 'Second');
    expect(control.textContent).toBe('Second');
    fireEvent.click(control);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(0);
  });

  it('is removed when the replacement carries no action, leaving only the dismiss button', () => {
    renderRegion();
    notify({ kind: 'error', message: 'one', key: 'k', action: { label: 'Retry', onAction: noop } });
    notify({ kind: 'error', message: 'two', key: 'k' });
    const item = only(items(), 'item');
    expect(item.querySelectorAll('button')).toHaveLength(1);
    expect(item.querySelector('button')).toBe(dismissControlOf(item));
    expect(messageOf(item).textContent).toBe('two');
  });

  it('is added when the replacement carries an action the replaced item lacked', () => {
    renderRegion();
    notify({ kind: 'error', message: 'one', key: 'k' });
    notify({ kind: 'error', message: 'two', key: 'k', action: { label: 'Retry', onAction: noop } });
    const item = only(items(), 'item');
    expect(actionControlOf(item, 'Retry').textContent).toBe('Retry');
  });
});

describe('the action control and lifetimes', () => {
  it('removes an info with an action at exactly autoDismissMs', () => {
    renderRegion();
    notify({ kind: 'info', message: 'info with action', action: { label: 'Undo', onAction: noop } });
    advance(MS - 1);
    expect(messages()).toEqual(['info with action']);
    advance(1);
    expect(items()).toEqual([]);
  });

  it('keeps an error with an action after ten times autoDismissMs', () => {
    renderRegion();
    notify({ kind: 'error', message: 'error with action', action: { label: 'Retry', onAction: noop } });
    advance(MS * 10);
    expect(messages()).toEqual(['error with action']);
  });
});
