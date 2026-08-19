// @vitest-environment jsdom
/**
 * Inline permission cards (spec 5.4).
 *
 * Pure props in, callbacks out — no context, no `window.orcastrate` — so these
 * mount the subject with plain RTL. `Harness` below plays the state layer
 * where a test needs one, and does exactly what the frozen contract says the
 * state layer does, including NEVER removing a card on click.
 */

import { useState, type JSX } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { IpcError } from '@shared/contracts/ipc';
import type { PermissionCardVm } from '../contracts/renderer-state';
import type { PermissionRespondArgs } from '../contracts/renderer-view';
import { TEST_IDS } from '../contracts/renderer-view';

import { PermissionCardList } from './PermissionCardList';
import { clockTime, formatInput } from './PermissionCard';

afterEach(() => {
  cleanup();
});

function makeCard(overrides: Partial<PermissionCardVm> = {}): PermissionCardVm {
  return {
    podId: 'pod-1',
    laneId: 'lane-matriarch',
    requestId: 'req-1',
    toolName: 'Bash',
    input: { command: 'rm -rf build' },
    receivedAt: '2026-08-19T10:00:00.000Z',
    submitting: false,
    error: null,
    ...overrides,
  };
}

const cardFor = (requestId: string): HTMLElement =>
  screen.getByTestId(`${TEST_IDS.permissionCard}:${requestId}`);

describe('PermissionCardList — inline, never a modal (criterion 6)', () => {
  it('renders in document flow with no dialog role, no modal, no backdrop', () => {
    const { container } = render(
      <div>
        <button type="button">behind the card</button>
        <PermissionCardList cards={[makeCard()]} onRespond={vi.fn()} />
      </div>,
    );

    expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(0);
    expect(container.querySelectorAll('[role="alertdialog"]')).toHaveLength(0);
    expect(container.querySelectorAll('[aria-modal]')).toHaveLength(0);
    expect(container.querySelectorAll('dialog')).toHaveLength(0);
    expect(document.body.querySelectorAll('[aria-hidden="true"][data-testid]')).toHaveLength(0);

    // Nothing is lifted out of flow by an inline style either.
    for (const el of container.querySelectorAll<HTMLElement>('*')) {
      expect(el.style.position).not.toBe('fixed');
      expect(el.style.zIndex).toBe('');
    }
  });

  it('leaves the content behind it reachable and operable', async () => {
    const user = userEvent.setup();
    const behind = vi.fn();
    render(
      <div>
        <button type="button" onClick={behind}>
          behind the card
        </button>
        <PermissionCardList cards={[makeCard()]} onRespond={vi.fn()} />
      </div>,
    );

    // Clickable: no overlay is intercepting the pointer.
    await user.click(screen.getByRole('button', { name: 'behind the card' }));
    expect(behind).toHaveBeenCalledTimes(1);

    // And keyboard-reachable: focus leaves the card freely, which is exactly
    // what a focus-trapping dialog would prevent.
    screen.getByTestId(TEST_IDS.permissionAllow).focus();
    await user.tab({ shift: true });
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'behind the card' }));
  });

  it('is announced without a focus trap', () => {
    render(<PermissionCardList cards={[makeCard()]} onRespond={vi.fn()} />);
    const region = screen.getByTestId('permission-card-list');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('aria-label')).toBe('Permission requests');
  });

  it('renders nothing at all when there are no pending requests', () => {
    const { container } = render(<PermissionCardList cards={[]} onRespond={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('PermissionCardList — what a card shows and offers (criteria 7, 12)', () => {
  it('shows the tool name and the request input, and exactly three actions', () => {
    render(<PermissionCardList cards={[makeCard()]} onRespond={vi.fn()} />);
    const card = cardFor('req-1');

    expect(within(card).getByRole('heading').textContent).toBe('Bash');
    expect(within(card).getByTestId('permission-card-input').textContent).toContain('rm -rf build');
    expect(within(card).getAllByRole('button')).toHaveLength(3);
    expect(within(card).getByTestId(TEST_IDS.permissionAllow).textContent).toBe('Allow');
    expect(within(card).getByTestId(TEST_IDS.permissionAllowAlways).textContent).toBe('Allow always');
    expect(within(card).getByTestId(TEST_IDS.permissionDeny).textContent).toBe('Deny');
    expect(within(card).getByTestId(TEST_IDS.permissionDenyReason)).toBeTruthy();
  });

  it('labels the deny-reason field programmatically', () => {
    render(<PermissionCardList cards={[makeCard()]} onRespond={vi.fn()} />);
    expect(screen.getByLabelText('Reason (required to deny)')).toBe(
      screen.getByTestId(TEST_IDS.permissionDenyReason),
    );
  });

  it.each([
    ['allow' as const, TEST_IDS.permissionAllow],
    ['allow_always' as const, TEST_IDS.permissionAllowAlways],
  ])('sends %s with no reason', async (decision, testid) => {
    const user = userEvent.setup();
    const onRespond = vi.fn<(req: PermissionRespondArgs) => void>();
    render(<PermissionCardList cards={[makeCard()]} onRespond={onRespond} />);

    await user.click(screen.getByTestId(testid));

    expect(onRespond).toHaveBeenCalledTimes(1);
    const arg = onRespond.mock.calls[0]?.[0] as PermissionRespondArgs;
    expect(arg).toEqual({ podId: 'pod-1', requestId: 'req-1', decision });
    expect('reason' in arg).toBe(false);
  });

  it('renders a non-JSON input without throwing', () => {
    render(<PermissionCardList cards={[makeCard({ input: 'literal string input' })]} onRespond={vi.fn()} />);
    expect(screen.getByTestId('permission-card-input').textContent).toBe('literal string input');
    expect(formatInput(undefined)).toBe('(no input)');
    expect(clockTime('2026-08-19T10:04:31.000Z')).toBe('10:04:31');
    expect(clockTime('not a timestamp')).toBe('not a timestamp');
  });
});

describe('PermissionCardList — Deny needs a reason (criterion 8)', () => {
  it('stays disabled for an empty reason and for a whitespace-only one, then sends it trimmed', async () => {
    const user = userEvent.setup();
    const onRespond = vi.fn<(req: PermissionRespondArgs) => void>();
    render(<PermissionCardList cards={[makeCard()]} onRespond={onRespond} />);

    const deny = screen.getByTestId(TEST_IDS.permissionDeny) as HTMLButtonElement;
    const reason = screen.getByTestId(TEST_IDS.permissionDenyReason) as HTMLInputElement;

    expect(deny.disabled).toBe(true);

    await user.type(reason, '   ');
    expect(deny.disabled).toBe(true);
    // A click on a whitespace-only reason must not reach the callback even if
    // the pointer gets through — main would answer INVALID_ARGUMENT.
    fireEvent.click(deny);
    expect(onRespond).not.toHaveBeenCalled();

    await user.type(reason, '  not on this branch  ');
    expect(deny.disabled).toBe(false);

    await user.click(deny);
    expect(onRespond).toHaveBeenCalledTimes(1);
    expect(onRespond.mock.calls[0]?.[0]).toEqual({
      podId: 'pod-1',
      requestId: 'req-1',
      decision: 'deny',
      reason: 'not on this branch',
    });
  });

  it('says in words why Deny is unavailable — colour is not the only carrier', () => {
    render(<PermissionCardList cards={[makeCard()]} onRespond={vi.fn()} />);
    const deny = screen.getByTestId(TEST_IDS.permissionDeny);
    const hintId = deny.getAttribute('aria-describedby');
    expect(hintId).toBeTruthy();
    expect(document.getElementById(hintId as string)?.textContent).toContain('reason');
  });
});

describe('PermissionCardList — one decision per request (criterion 9)', () => {
  it('disables all three buttons while submitting, so a double click sends once', async () => {
    const user = userEvent.setup();
    const onRespond = vi.fn<(req: PermissionRespondArgs) => void>();

    function Harness(): JSX.Element {
      // The state layer's job: flip `submitting`, never remove the card.
      const [cards, setCards] = useState<PermissionCardVm[]>([makeCard()]);
      return (
        <PermissionCardList
          cards={cards}
          onRespond={(req) => {
            onRespond(req);
            setCards((prev) => prev.map((c) => ({ ...c, submitting: true })));
          }}
        />
      );
    }

    render(<Harness />);
    const allow = screen.getByTestId(TEST_IDS.permissionAllow) as HTMLButtonElement;

    await user.click(allow);
    await user.click(allow);
    fireEvent.click(allow);

    expect(onRespond).toHaveBeenCalledTimes(1);
    expect((screen.getByTestId(TEST_IDS.permissionAllow) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId(TEST_IDS.permissionAllowAlways) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId(TEST_IDS.permissionDeny) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId(TEST_IDS.permissionDenyReason) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByTestId('permission-card-submitting')).toBeTruthy();
  });

  it('keeps focus on the card rather than dropping it on the body', async () => {
    const user = userEvent.setup();
    render(<PermissionCardList cards={[makeCard()]} onRespond={vi.fn()} />);

    await user.click(screen.getByTestId(TEST_IDS.permissionAllow));
    expect(document.activeElement).toBe(cardFor('req-1'));
  });
});

describe('PermissionCardList — a card is never removed by this component (criterion 10)', () => {
  it('stays on screen after Allow: only `permissionResolved` removes it', async () => {
    const user = userEvent.setup();

    function Harness(): JSX.Element {
      const [cards, setCards] = useState<PermissionCardVm[]>([makeCard()]);
      return (
        <div>
          <button
            type="button"
            onClick={() => setCards([])}
            data-testid="simulate-permission-resolved"
          >
            resolved push
          </button>
          <PermissionCardList
            cards={cards}
            onRespond={() => setCards((prev) => prev.map((c) => ({ ...c, submitting: true })))}
          />
        </div>
      );
    }

    render(<Harness />);
    await user.click(screen.getByTestId(TEST_IDS.permissionAllow));
    expect(cardFor('req-1')).toBeTruthy();

    // ...and it goes when — and only when — the state layer drops it.
    await user.click(screen.getByTestId('simulate-permission-resolved'));
    expect(screen.queryByTestId(`${TEST_IDS.permissionCard}:req-1`)).toBeNull();
  });

  it('shows the error verbatim, stays on screen, and re-enables its buttons', () => {
    const error: IpcError = { code: 'NOT_FOUND', message: 'That request is no longer known.' };
    render(<PermissionCardList cards={[makeCard({ error })]} onRespond={vi.fn()} />);

    const card = cardFor('req-1');
    const shown = within(card).getByTestId('permission-card-error');
    expect(shown.textContent).toContain('That request is no longer known.');
    expect(shown.getAttribute('role')).toBe('alert');
    expect((within(card).getByTestId(TEST_IDS.permissionAllow) as HTMLButtonElement).disabled).toBe(false);
    expect((within(card).getByTestId(TEST_IDS.permissionAllowAlways) as HTMLButtonElement).disabled).toBe(false);
    expect((within(card).getByTestId(TEST_IDS.permissionDenyReason) as HTMLInputElement).disabled).toBe(false);
  });
});

describe('PermissionCardList — ordering and identity (criterion 11)', () => {
  const older = makeCard({ requestId: 'req-old', receivedAt: '2026-08-19T10:00:00.000Z', toolName: 'Read' });
  const newer = makeCard({ requestId: 'req-new', receivedAt: '2026-08-19T10:05:00.000Z', toolName: 'Write' });

  it('renders oldest first regardless of the order it was handed', () => {
    render(<PermissionCardList cards={[newer, older]} onRespond={vi.fn()} />);
    const rendered = screen.getAllByTestId(/^permission-card:/);
    expect(rendered.map((el) => el.getAttribute('data-testid'))).toEqual([
      'permission-card:req-old',
      'permission-card:req-new',
    ]);
  });

  it('keys by requestId, so resolving one card does not remount its sibling', async () => {
    const user = userEvent.setup();

    function Harness(): JSX.Element {
      const [cards, setCards] = useState<PermissionCardVm[]>([older, newer]);
      return (
        <div>
          <button type="button" onClick={() => setCards([newer])} data-testid="resolve-older">
            resolve the older one
          </button>
          <PermissionCardList cards={cards} onRespond={vi.fn()} />
        </div>
      );
    }

    render(<Harness />);
    const reasonField = within(cardFor('req-new')).getByTestId(
      TEST_IDS.permissionDenyReason,
    ) as HTMLInputElement;
    await user.type(reasonField, 'half typed');

    await user.click(screen.getByTestId('resolve-older'));

    // A remount would have thrown the half-typed reason away.
    const survivor = within(cardFor('req-new')).getByTestId(
      TEST_IDS.permissionDenyReason,
    ) as HTMLInputElement;
    expect(survivor.value).toBe('half typed');
    expect(screen.queryByTestId('permission-card:req-old')).toBeNull();
  });
});
