// @vitest-environment jsdom
/**
 * The panel close guard, from both sides.
 *
 * The first two describes drive the mechanism through a small harness that
 * stands in for `App`: it owns `openPanel`, hosts the provider, and renders a
 * fake panel that registers whatever guard the test hands it. That is
 * deliberate — the facts under test are about the TRANSITION, and a harness
 * lets a test register a vetoing guard, which no real panel does until T4.
 *
 * The last describe drives the real `App`. Beachcomber is the REAL panel there
 * (it registers nothing, and the point is that it is unchanged); Helm is mocked
 * into a panel that registers the test's guard and holds a text input, because
 * Helm's own registration is T4's work and this suite must not depend on it.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type JSX } from 'react';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';

import {
  PANEL_TEST_IDS,
  type PanelCloseGuard,
  type PanelKey,
} from '../contracts/renderer-panels';
import {
  PanelCloseGuardProvider,
  useRegisterPanelCloseGuard,
  usePanelCloseGuardHost,
} from './panel-close-guard';
import { testId } from './contract-runtime';

// Imported for its `afterEach(cleanup)` side effect.
import '../test-utils';

const helmStub = vi.hoisted(() => ({ guard: null as unknown }));

vi.mock('../helm', async () => {
  const { useRegisterPanelCloseGuard: register } = await import('./panel-close-guard');
  const { PANEL_TEST_IDS: ids } = await import('../contracts/renderer-panels');
  return {
    ConnectedHelmPanel: (): JSX.Element => {
      register(helmStub.guard as PanelCloseGuard | null);
      return (
        <div data-testid={ids.helmPanel}>
          <input aria-label="Draft" data-testid="helm-draft" defaultValue="" />
        </div>
      );
    },
    HelmPanel: (): null => null,
  };
});

import { App } from '../App';
import { WorkspaceProvider } from '../state';
import { registerWorkspaceProvider, renderWithWorkspace } from '../test-utils';

// ---------------------------------------------------------------------------
// Guards the tests hand out
// ---------------------------------------------------------------------------

interface CountedGuard {
  guard: PanelCloseGuard;
  /** How many times `beforeClose` was entered. */
  calls(): number;
}

function settledGuard(answer: boolean): CountedGuard {
  let calls = 0;
  return {
    guard: {
      beforeClose: () => {
        calls += 1;
        return Promise.resolve(answer);
      },
    },
    calls: () => calls,
  };
}

interface DeferredGuard extends CountedGuard {
  settle(answer: boolean): Promise<void>;
}

/** A guard that stays pending until the test answers it — a dialog on screen. */
function deferredGuard(): DeferredGuard {
  let calls = 0;
  let answer: ((value: boolean) => void) | null = null;
  return {
    guard: {
      beforeClose: () => {
        calls += 1;
        return new Promise<boolean>((resolve) => {
          answer = resolve;
        });
      },
    },
    calls: () => calls,
    settle: async (value: boolean) => {
      if (answer === null) throw new Error('the guard was never asked');
      const resolve = answer;
      await act(async () => {
        resolve(value);
      });
    },
  };
}

// ---------------------------------------------------------------------------
// The harness — `App`'s shape, without `App`'s dependencies
// ---------------------------------------------------------------------------

const PANEL_KEYS: PanelKey[] = ['beachcomber', 'helm'];

function FakePanel({
  panelKey,
  guard,
}: {
  panelKey: PanelKey;
  guard: PanelCloseGuard | null;
}): JSX.Element {
  useRegisterPanelCloseGuard(guard);
  return (
    <div data-testid={`fake-panel:${panelKey}`}>
      <input aria-label={`${panelKey} draft`} data-testid={`fake-draft:${panelKey}`} />
    </div>
  );
}

function Harness({
  initial,
  guards,
}: {
  initial: PanelKey | null;
  guards: Partial<Record<PanelKey, PanelCloseGuard>>;
}): JSX.Element {
  const [openPanel, setOpenPanel] = useState<PanelKey | null>(initial);
  const host = usePanelCloseGuardHost(openPanel, setOpenPanel);

  return (
    <PanelCloseGuardProvider host={host}>
      <button
        data-testid="ask-close"
        onClick={() => {
          void host.controller.requestClose();
        }}
        type="button"
      >
        close
      </button>
      {PANEL_KEYS.map((key) => (
        <button
          data-testid={`ask-open:${key}`}
          key={key}
          onClick={() => {
            void host.controller.requestOpen(key);
          }}
          type="button"
        >
          {key}
        </button>
      ))}
      <div data-testid="open-panel">{openPanel ?? 'none'}</div>
      {openPanel === null ? null : (
        <FakePanel guard={guards[openPanel] ?? null} key={openPanel} panelKey={openPanel} />
      )}
    </PanelCloseGuardProvider>
  );
}

function openPanelText(): string {
  return screen.getByTestId('open-panel').textContent ?? '';
}

function clickSync(id: string): void {
  act(() => {
    fireEvent.click(screen.getByTestId(id));
  });
}

// ---------------------------------------------------------------------------
// The transition
// ---------------------------------------------------------------------------

describe('panel close transition', () => {
  it('closes with NO awaited turn when nothing is registered', () => {
    render(<Harness guards={{}} initial="beachcomber" />);
    expect(openPanelText()).toBe('beachcomber');

    // No `await` anywhere in this test. If the controller inserted a microtask
    // before moving `openPanel`, the assertion below would still read
    // 'beachcomber'.
    clickSync('ask-close');

    expect(openPanelText()).toBe('none');
    expect(screen.queryByTestId('fake-panel:beachcomber')).toBeNull();
  });

  it('switches with NO awaited turn when nothing is registered', () => {
    render(<Harness guards={{}} initial="beachcomber" />);

    clickSync('ask-open:helm');

    expect(openPanelText()).toBe('helm');
    expect(screen.getByTestId('fake-panel:helm')).toBeDefined();
  });

  it('opens with NO awaited turn from the closed state', () => {
    render(<Harness guards={{}} initial={null} />);

    clickSync('ask-open:helm');

    expect(openPanelText()).toBe('helm');
  });

  it('a guard resolving false leaves openPanel exactly as it was, panel mounted', async () => {
    const vetoing = settledGuard(false);
    render(<Harness guards={{ helm: vetoing.guard }} initial="helm" />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('ask-close'));
    });

    expect(vetoing.calls()).toBe(1);
    expect(openPanelText()).toBe('helm');
    expect(screen.getByTestId('fake-panel:helm')).toBeDefined();
  });

  it('a guard resolving true closes the panel', async () => {
    const permitting = settledGuard(true);
    render(<Harness guards={{ helm: permitting.guard }} initial="helm" />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('ask-close'));
    });

    expect(permitting.calls()).toBe(1);
    expect(openPanelText()).toBe('none');
    expect(screen.queryByTestId('fake-panel:helm')).toBeNull();
  });

  it('consults the guard EXACTLY ONCE when close is clicked twice while it is pending', async () => {
    const pending = deferredGuard();
    render(<Harness guards={{ helm: pending.guard }} initial="helm" />);

    clickSync('ask-close');
    clickSync('ask-close');

    // A double-click must not raise two dialogs.
    expect(pending.calls()).toBe(1);
    expect(openPanelText()).toBe('helm');

    await pending.settle(true);
    expect(openPanelText()).toBe('none');
  });

  it('shares the in-flight state across BOTH methods and lands on the PENDING destination', async () => {
    const pending = deferredGuard();
    render(<Harness guards={{ helm: pending.guard }} initial="helm" />);

    // A guarded SWITCH to Beachcomber is in flight...
    clickSync('ask-open:beachcomber');
    expect(pending.calls()).toBe(1);

    // ...and the user clicks CLOSE while the dialog is up. Dropped: not queued,
    // not latest-wins, and the guard is not asked a second time.
    clickSync('ask-close');
    expect(pending.calls()).toBe(1);

    // The answer lands on the destination the dialog was raised for.
    await pending.settle(true);
    expect(openPanelText()).toBe('beachcomber');
    expect(screen.getByTestId('fake-panel:beachcomber')).toBeDefined();
  });

  it('treats a guard that REJECTS as a permission to close', async () => {
    let calls = 0;
    const throwing: PanelCloseGuard = {
      beforeClose: () => {
        calls += 1;
        return Promise.reject(new Error('the dialog exploded'));
      },
    };
    render(<Harness guards={{ helm: throwing }} initial="helm" />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('ask-close'));
    });

    expect(calls).toBe(1);
    // Failing OPEN: stranding the user in a panel with no way out is worse.
    expect(openPanelText()).toBe('none');
  });

  it('treats a guard that THROWS SYNCHRONOUSLY as a permission to close', async () => {
    const throwing: PanelCloseGuard = {
      beforeClose: () => {
        throw new Error('the dialog exploded before it returned');
      },
    };
    render(<Harness guards={{ helm: throwing }} initial="helm" />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('ask-close'));
    });

    expect(openPanelText()).toBe('none');
  });

  it('clears the registration on unmount, so an unmounted panel cannot veto a later close', async () => {
    const helmGuard = settledGuard(true);
    render(<Harness guards={{ helm: helmGuard.guard }} initial="helm" />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('ask-close'));
    });
    expect(openPanelText()).toBe('none');
    expect(helmGuard.calls()).toBe(1);

    // A DIFFERENT panel, which registers nothing.
    clickSync('ask-open:beachcomber');
    expect(openPanelText()).toBe('beachcomber');

    // If Helm's registration had survived its unmount, this close would have to
    // await Helm's guard and could not complete inside one synchronous act.
    clickSync('ask-close');
    expect(openPanelText()).toBe('none');
    expect(helmGuard.calls()).toBe(1);
  });

  it('leaves the ORIGINAL panel open, mounted and intact when the guard declines a SWITCH', async () => {
    const vetoing = settledGuard(false);
    render(<Harness guards={{ helm: vetoing.guard }} initial="helm" />);

    const draft = screen.getByTestId('fake-draft:helm') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(draft, { target: { value: 'unsaved work' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('ask-open:beachcomber'));
    });

    expect(vetoing.calls()).toBe(1);
    // NOT closed-then-declined: the original panel never left the screen, so it
    // is the same element and still holds what was typed into it.
    expect(openPanelText()).toBe('helm');
    expect(screen.getByTestId('fake-panel:helm')).toBeDefined();
    expect((screen.getByTestId('fake-draft:helm') as HTMLInputElement).value).toBe('unsaved work');
    expect(screen.getByTestId('fake-draft:helm')).toBe(draft);
    // And the destination was NOT opened.
    expect(screen.queryByTestId('fake-panel:beachcomber')).toBeNull();
  });

  it('does NOT ask the guard when the panel already open is re-opened', async () => {
    const vetoing = settledGuard(false);
    render(<Harness guards={{ helm: vetoing.guard }} initial="helm" />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('ask-open:helm'));
    });

    expect(vetoing.calls()).toBe(0);
    expect(openPanelText()).toBe('helm');
  });
});

// ---------------------------------------------------------------------------
// The shell routes every affordance through the controller
// ---------------------------------------------------------------------------

beforeAll(() => {
  registerWorkspaceProvider(WorkspaceProvider);
});

beforeEach(() => {
  helmStub.guard = null;
});

async function openFromStrip(key: PanelKey): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByTestId(testId(PANEL_TEST_IDS.panelBarOpen, key)));
  await screen.findByTestId(testId(PANEL_TEST_IDS.panelRegion, key));
}

describe('App routes the panel affordances through the controller', () => {
  it('closes the REAL Beachcomber panel inside a single synchronous act', async () => {
    renderWithWorkspace(<App />);
    await waitFor(() => {
      expect(screen.getByTestId(PANEL_TEST_IDS.panelBar)).toBeDefined();
    });
    await openFromStrip('beachcomber');
    expect(screen.getByTestId(PANEL_TEST_IDS.beachcomberPanel)).toBeDefined();

    // Beachcomber registers nothing, so the close is bit-for-bit what it was:
    // one synchronous act, no intervening microtask, no `await`.
    act(() => {
      fireEvent.click(screen.getByTestId(PANEL_TEST_IDS.panelBarClose));
    });

    expect(
      screen.queryByTestId(testId(PANEL_TEST_IDS.panelRegion, 'beachcomber')),
    ).toBeNull();
  });

  it('switches between REAL panels inside a single synchronous act when nothing is registered', async () => {
    renderWithWorkspace(<App />);
    await waitFor(() => {
      expect(screen.getByTestId(PANEL_TEST_IDS.panelBar)).toBeDefined();
    });
    await openFromStrip('beachcomber');

    act(() => {
      fireEvent.click(screen.getByTestId(testId(PANEL_TEST_IDS.panelBarOpen, 'helm')));
    });

    expect(screen.getByTestId(testId(PANEL_TEST_IDS.panelRegion, 'helm'))).toBeDefined();
    expect(
      screen.queryByTestId(testId(PANEL_TEST_IDS.panelRegion, 'beachcomber')),
    ).toBeNull();
  });

  it("guards PanelRegion's ESCAPE path, and leaves focus inside the region", async () => {
    const vetoing = settledGuard(false);
    helmStub.guard = vetoing.guard;
    const user = userEvent.setup();
    renderWithWorkspace(<App />);
    await waitFor(() => {
      expect(screen.getByTestId(PANEL_TEST_IDS.panelBar)).toBeDefined();
    });
    await openFromStrip('helm');

    const region = screen.getByTestId(testId(PANEL_TEST_IDS.panelRegion, 'helm'));
    expect(region.contains(document.activeElement)).toBe(true);

    await user.keyboard('{Escape}');
    await act(async () => {
      await Promise.resolve();
    });

    expect(vetoing.calls()).toBe(1);
    // Still open...
    expect(screen.getByTestId(testId(PANEL_TEST_IDS.panelRegion, 'helm'))).toBeDefined();
    expect(screen.getByTestId(PANEL_TEST_IDS.helmPanel)).toBeDefined();
    // ...and focus did not escape to a control that no longer explains itself.
    expect(region.contains(document.activeElement)).toBe(true);
  });

  it("guards PanelBar's CLOSE button", async () => {
    const vetoing = settledGuard(false);
    helmStub.guard = vetoing.guard;
    const user = userEvent.setup();
    renderWithWorkspace(<App />);
    await waitFor(() => {
      expect(screen.getByTestId(PANEL_TEST_IDS.panelBar)).toBeDefined();
    });
    await openFromStrip('helm');

    await user.click(screen.getByTestId(PANEL_TEST_IDS.panelBarClose));

    expect(vetoing.calls()).toBe(1);
    expect(screen.getByTestId(testId(PANEL_TEST_IDS.panelRegion, 'helm'))).toBeDefined();
  });

  it('keeps Helm open with its typed values when the guard declines a strip SWITCH', async () => {
    const vetoing = settledGuard(false);
    helmStub.guard = vetoing.guard;
    const user = userEvent.setup();
    renderWithWorkspace(<App />);
    await waitFor(() => {
      expect(screen.getByTestId(PANEL_TEST_IDS.panelBar)).toBeDefined();
    });
    await openFromStrip('helm');

    const draft = screen.getByTestId('helm-draft');
    await user.click(draft);
    await user.keyboard('unsaved work');
    expect((draft as HTMLInputElement).value).toBe('unsaved work');

    await user.click(screen.getByTestId(testId(PANEL_TEST_IDS.panelBarOpen, 'beachcomber')));

    expect(vetoing.calls()).toBe(1);
    expect(screen.getByTestId(testId(PANEL_TEST_IDS.panelRegion, 'helm'))).toBeDefined();
    expect(screen.queryByTestId(testId(PANEL_TEST_IDS.panelRegion, 'beachcomber'))).toBeNull();
    // The SAME input node, still holding the draft — the panel never unmounted.
    expect(screen.getByTestId('helm-draft')).toBe(draft);
    expect((screen.getByTestId('helm-draft') as HTMLInputElement).value).toBe('unsaved work');
  });

  it("does not ask the guard when Helm's OWN strip button is re-clicked", async () => {
    const vetoing = settledGuard(false);
    helmStub.guard = vetoing.guard;
    const user = userEvent.setup();
    renderWithWorkspace(<App />);
    await waitFor(() => {
      expect(screen.getByTestId(PANEL_TEST_IDS.panelBar)).toBeDefined();
    });
    await openFromStrip('helm');

    await user.click(screen.getByTestId(testId(PANEL_TEST_IDS.panelBarOpen, 'helm')));

    // No confirmation raised for a click that changes nothing.
    expect(vetoing.calls()).toBe(0);
    expect(screen.getByTestId(testId(PANEL_TEST_IDS.panelRegion, 'helm'))).toBeDefined();
  });
});
