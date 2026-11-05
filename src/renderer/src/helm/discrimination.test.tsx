// @vitest-environment jsdom
/**
 * DO THE ASSERTIONS IN THIS DIRECTORY ACTUALLY DISCRIMINATE?
 *
 * A green suite proves the code passes the tests. It does not prove the tests
 * could ever have failed — and this directory has already produced one that
 * could not: `Helm.styles.test.ts` shipped a `font-weight:\s*(?!var\()` rule
 * that matches nothing, and it passed against a stylesheet it was not reading.
 *
 * Criterion 15 asks for tests "each seen failing first". That is an ordering
 * property of how the code was written and nothing after the fact can
 * reconstruct it — this file does not pretend otherwise, and stages no red run.
 * What it does instead is make the evidence DURABLE: every load-bearing
 * assertion is run twice, once against the real thing and once against
 * something deliberately broken, and the assertion has to tell them apart.
 *
 * Someone arriving cold runs `npx vitest run src/renderer/src/helm` and sees
 * the matrix. Nobody has to trust a transcript.
 *
 * TWO KINDS OF EVIDENCE LIVE HERE:
 *
 *   1. TEXT RULES (`rules.ts`) — the source scan of criterion 2 and the
 *      stylesheet rules of criterion 13. Each carries its own violating and
 *      clean sample; both directions are checked.
 *   2. PANEL PROPERTIES (`probes.ts`) — the DOM statements whose failure would
 *      be a real defect. Each is run against the real `HelmPanel`, then
 *      against the real `HelmPanel` WITH ONE DEFECT INJECTED into the rendered
 *      tree, and must notice the defect.
 *
 * WHY THE DEFECTS ARE DOM MUTATIONS rather than broken copies of the panel: a
 * hand-written broken panel is a second implementation that drifts, and it
 * proves only that the probe rejects THAT panel. Mutating the real tree asks
 * the sharper question — if the panel did this one thing differently, would
 * anything notice? — with no second implementation to maintain.
 */

import { useState, type JSX, type ReactNode } from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PANEL_TEST_IDS } from '../contracts/renderer-panels';
import type { HelmPanelProps, PanelKey } from '../contracts/renderer-panels';
import {
  PanelCloseGuardProvider,
  usePanelCloseGuardHost,
} from '../shell/panel-close-guard';
import { makeStubHelmDocument } from '../test-utils';

import { HelmCloseGuard } from './HelmCloseGuard';
import { HelmPanel } from './HelmPanel';
import {
  CLOSE_CONFIRM_PROPERTIES,
  DISK_MODEL,
  PANEL_PROPERTIES,
  type ConfirmScene,
  type ConfirmScenes,
  type Mount,
  type MountOptions,
} from './probes';
import { SOURCE_RULES, STYLE_RULES } from './rules';
import { HELM_SAFETY_TEST_IDS } from './test-ids';
import { helmActions, helmView } from './test-fixtures';

// `globals: false` means RTL installs no auto-cleanup of its own, and every
// property below mounts more than once.
afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// 1. The text rules tell a violation from a clean sample
// ---------------------------------------------------------------------------

describe('every source rule can fire (criterion 2)', () => {
  it('has a rule set that is not empty', () => {
    expect(SOURCE_RULES.length).toBeGreaterThan(5);
  });

  for (const rule of SOURCE_RULES) {
    it(`catches source that ${rule.name}`, () => {
      expect(rule.violates(rule.violation)).toBe(true);
    });

    it(`does not cry wolf over clean source — ${rule.name}`, () => {
      expect(rule.violates(rule.clean)).toBe(false);
    });
  }
});

describe('every stylesheet rule can fire (criterion 13)', () => {
  it('covers every rule the stylesheet suite applies', () => {
    // The four that were previously unchecked — `rgb(`, `hsl(`, `!important`
    // and `outline: none` — are in here now, which is the point of counting.
    expect(STYLE_RULES.length).toBe(9);
  });

  for (const rule of STYLE_RULES) {
    it(`catches CSS that ${rule.name}`, () => {
      expect(rule.violates(rule.violation)).toBe(true);
    });

    it(`does not cry wolf over tokenised CSS — ${rule.name}`, () => {
      expect(rule.violates(rule.clean)).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. The panel properties tell the real panel from a broken one
// ---------------------------------------------------------------------------

type PanelComponent = (props: HelmPanelProps) => ReactNode;

/** Applied to the rendered tree immediately after commit. */
type Defect = (root: HTMLElement) => void;

function mountWith(Panel: PanelComponent, defect?: Defect): Mount {
  return (options: MountOptions): HTMLElement => {
    const base = makeStubHelmDocument('user');
    const document = makeStubHelmDocument('user', {
      ...(options.parseError === undefined ? {} : { parseError: options.parseError }),
      ...(options.crossSessionInbound === undefined
        ? {}
        : { managed: { ...base.managed, crossSessionInbound: options.crossSessionInbound } }),
    });

    // `incoming` is a SEPARATE document from the one the draft is seeded from,
    // which is the whole point: the two columns must be able to disagree.
    const incoming =
      options.incomingModel === undefined
        ? null
        : makeStubHelmDocument('user', {
            managed: { ...base.managed, model: options.incomingModel },
          });

    const { container } = render(
      <Panel actions={helmActions()} view={helmView({ document, incoming, ...options.view })} />,
    );

    // The one thing a property cannot do for itself: press a button. It is
    // done BEFORE the defect so the defect applies to the tree the property
    // will actually read.
    if (options.requestComparison === true) {
      const asked = container.querySelector(`[data-testid="${HELM_SAFETY_TEST_IDS.compare}"]`);
      if (asked !== null) fireEvent.click(asked);
    }

    // After commit, so React does not overwrite it. Every mount here renders
    // once and never updates after the press above, so the mutation stays put.
    defect?.(container);
    return container;
  };
}

function testIdOf(root: HTMLElement, id: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}

describe('the real panel satisfies every load-bearing property', () => {
  it('covers the properties whose failure would be a real defect', () => {
    expect(PANEL_PROPERTIES.map((property) => property.name)).toEqual([
      'the draft is blocked by an error-severity issue',
      'a save is already in flight',
      'there is nothing to write',
      'a file that would not parse locks the whole form and shows why',
      'an absent crossSessionInbound key selects nothing, and never hold',
      'the scope picker offers no way to type a path',
      'a conflict names the file, says nothing was written, and keeps the draft',
      'every control in the panel has an accessible name',
      'a conflict offers a way to look without discarding, and only a conflict does',
      'the comparison puts the file on disk beside the pending edit, field by field',
      'the comparison declares loading, error and empty states, not just the table',
    ]);
  });

  for (const property of PANEL_PROPERTIES) {
    it(`holds: ${property.name}`, () => {
      expect(property.failures(mountWith(HelmPanel))).toEqual([]);
    });
  }
});

/**
 * One defect each, named by the property that must catch it. A defect nobody
 * catches is a hole in the suite, and this table is where it shows up.
 */
const DEFECTS: readonly { defect: string; breaks: string; apply: Defect }[] = [
  {
    defect: 'Save ignores a blocking validation error',
    breaks: 'the draft is blocked by an error-severity issue',
    apply: (root) => {
      testIdOf(root, PANEL_TEST_IDS.helmSave)?.removeAttribute('disabled');
    },
  },
  {
    defect: 'Save is dead no matter what, so "disabled when blocked" is trivially true',
    breaks: 'the draft is blocked by an error-severity issue',
    apply: (root) => {
      testIdOf(root, PANEL_TEST_IDS.helmSave)?.setAttribute('disabled', '');
    },
  },
  {
    defect: 'a save in flight can be started again',
    breaks: 'a save is already in flight',
    apply: (root) => {
      testIdOf(root, PANEL_TEST_IDS.helmSave)?.removeAttribute('disabled');
    },
  },
  {
    defect: 'an unchanged draft can still be written',
    breaks: 'there is nothing to write',
    apply: (root) => {
      testIdOf(root, PANEL_TEST_IDS.helmSave)?.removeAttribute('disabled');
    },
  },
  {
    defect: 'an unreadable file is still editable',
    breaks: 'a file that would not parse locks the whole form and shows why',
    apply: (root) => {
      for (const field of root.querySelectorAll('input, textarea')) {
        field.removeAttribute('disabled');
      }
    },
  },
  {
    defect: 'the parser message never reaches the user',
    breaks: 'a file that would not parse locks the whole form and shows why',
    apply: (root) => {
      testIdOf(root, PANEL_TEST_IDS.helmReadOnly)?.remove();
    },
  },
  {
    defect: 'hold is preselected for a file that has no such key',
    breaks: 'an absent crossSessionInbound key selects nothing, and never hold',
    apply: (root) => {
      const hold = testIdOf(root, `${PANEL_TEST_IDS.helmCrossSession}:hold`);
      if (hold instanceof HTMLInputElement) hold.checked = true;
    },
  },
  {
    defect: 'the radio group can never show what is already set',
    breaks: 'an absent crossSessionInbound key selects nothing, and never hold',
    apply: (root) => {
      for (const radio of root.querySelectorAll('input[type="radio"]')) {
        if (radio instanceof HTMLInputElement) radio.checked = false;
      }
    },
  },
  {
    defect: 'a text field appears in the scope picker',
    breaks: 'the scope picker offers no way to type a path',
    apply: (root) => {
      const picker = testIdOf(root, PANEL_TEST_IDS.helmScopePath)?.closest('fieldset');
      const planted = root.ownerDocument.createElement('input');
      planted.type = 'text';
      picker?.appendChild(planted);
    },
  },
  {
    defect: 'the conflict banner stops naming the file',
    breaks: 'a conflict names the file, says nothing was written, and keeps the draft',
    apply: (root) => {
      const path = testIdOf(root, PANEL_TEST_IDS.helmScopePath)?.textContent ?? '';
      const banner = testIdOf(root, PANEL_TEST_IDS.helmConflict);
      if (path === '' || banner === null) return;
      for (const line of [...banner.querySelectorAll('p')]) {
        if ((line.textContent ?? '').includes(path)) line.remove();
      }
    },
  },
  {
    defect: 'Reload is offered twice, so a test could not name one',
    breaks: 'a conflict names the file, says nothing was written, and keeps the draft',
    apply: (root) => {
      const reload = testIdOf(root, PANEL_TEST_IDS.helmReload);
      if (reload !== null) root.appendChild(reload.cloneNode(true));
    },
  },
  {
    defect: 'the model field loses its label',
    breaks: 'every control in the panel has an accessible name',
    apply: (root) => {
      root.querySelector('label[for="helm-model-input"]')?.remove();
    },
  },

  // --- session 2026-08-31-orcastrate-helm-draft-safety ---------------------

  {
    defect: 'the conflict banner points at Reload and nothing else, as it used to',
    breaks: 'a conflict offers a way to look without discarding, and only a conflict does',
    apply: (root) => {
      testIdOf(root, HELM_SAFETY_TEST_IDS.compare)?.remove();
    },
  },
  {
    defect: 'the comparison is offered everywhere, so offering it means nothing',
    breaks: 'a conflict offers a way to look without discarding, and only a conflict does',
    apply: (root) => {
      const planted = root.ownerDocument.createElement('button');
      planted.type = 'button';
      planted.dataset.testid = HELM_SAFETY_TEST_IDS.compare;
      planted.textContent = 'Compare';
      root.appendChild(planted);
    },
  },
  {
    defect: 'the side-by-side loses the half that came off disk',
    breaks: 'the comparison puts the file on disk beside the pending edit, field by field',
    apply: (root) => {
      for (const cell of root.querySelectorAll(
        `[data-testid^="${HELM_SAFETY_TEST_IDS.comparisonDisk}:"]`,
      )) {
        cell.remove();
      }
    },
  },
  {
    defect: 'both columns show the draft, so the file is never actually shown',
    breaks: 'the comparison puts the file on disk beside the pending edit, field by field',
    apply: (root) => {
      const disk = testIdOf(root, `${HELM_SAFETY_TEST_IDS.comparisonDisk}:model`);
      const edit = testIdOf(root, `${HELM_SAFETY_TEST_IDS.comparisonDraft}:model`);
      if (disk !== null && edit !== null) disk.textContent = edit.textContent;
    },
  },
  {
    defect: 'an in-flight comparison shows nothing at all',
    breaks: 'the comparison declares loading, error and empty states, not just the table',
    apply: (root) => {
      testIdOf(root, HELM_SAFETY_TEST_IDS.comparisonLoading)?.remove();
    },
  },
  {
    defect: 'a comparison nobody has asked for looks the same as one with no answer',
    breaks: 'the comparison declares loading, error and empty states, not just the table',
    apply: (root) => {
      testIdOf(root, HELM_SAFETY_TEST_IDS.comparisonEmpty)?.remove();
    },
  },
  {
    defect: 'a failed comparison fails silently',
    breaks: 'the comparison declares loading, error and empty states, not just the table',
    apply: (root) => {
      testIdOf(root, HELM_SAFETY_TEST_IDS.comparisonError)?.remove();
    },
  },
];

describe('each property catches the defect it exists for', () => {
  for (const { defect, breaks, apply } of DEFECTS) {
    it(`notices that ${defect}`, () => {
      const property = PANEL_PROPERTIES.find((candidate) => candidate.name === breaks);
      expect(property, `no property named ${breaks}`).toBeDefined();
      expect(property?.failures(mountWith(HelmPanel, apply))).not.toEqual([]);
    });
  }

  /**
   * The control arm. Without this, every "notices that …" test above could be
   * passing because the injection harness itself upsets the panel, and the
   * mutations would be proving nothing. A defect that does nothing has to
   * leave every property satisfied.
   */
  it('reports nothing when the injected defect does nothing', () => {
    const noop: Defect = () => {
      // deliberately empty
    };
    const stillHolding = PANEL_PROPERTIES.filter(
      (property) => property.failures(mountWith(HelmPanel, noop)).length > 0,
    );
    expect(stillHolding.map((property) => property.name)).toEqual([]);
  });

  it('aims every defect at a property that exists', () => {
    const names = new Set(PANEL_PROPERTIES.map((property) => property.name));
    expect(DEFECTS.filter((entry) => !names.has(entry.breaks))).toEqual([]);
  });

  it('leaves no property without a defect to catch', () => {
    const covered = new Set(DEFECTS.map((entry) => entry.breaks));
    expect(PANEL_PROPERTIES.map((property) => property.name).filter((name) => !covered.has(name))).toEqual(
      [],
    );
  });
});

// ---------------------------------------------------------------------------
// 3. The close confirmation tells a protected draft from a lost one
// ---------------------------------------------------------------------------

/**
 * The shell, in miniature: one control that asks to close, and the real
 * `usePanelCloseGuardHost` behind it. Nothing here is a stand-in for the guard
 * itself — `HelmCloseGuard` is the shipped component, registering through the
 * shipped hook. What the harness replaces is only `App`'s `openPanel` state,
 * because rendering `App` would drag in every other panel and the store.
 *
 * IT REPORTS THE TRANSITION rather than the guard's answer, because the answer
 * is not public: `requestClose()` resolves `void`. Settled-and-closed IS the
 * guard having said yes, and settled-and-still-open is it having said no,
 * which is exactly what a user would observe.
 */
function ConfirmHarness({ dirty }: { dirty: boolean }): JSX.Element {
  const [openPanel, setOpenPanel] = useState<PanelKey | null>('helm');
  const [settled, setSettled] = useState(false);
  const host = usePanelCloseGuardHost(openPanel, setOpenPanel);

  return (
    <PanelCloseGuardProvider host={host}>
      <button
        data-testid="confirm-opener"
        onClick={() => {
          void host.controller.requestClose().then(() => {
            setSettled(true);
          });
        }}
        type="button"
      >
        Close the panel
      </button>
      <div
        data-open={String(openPanel !== null)}
        data-settled={String(settled)}
        data-testid="confirm-record"
      />
      {openPanel === 'helm' ? <HelmCloseGuard dirty={dirty} /> : null}
    </PanelCloseGuardProvider>
  );
}

type ConfirmDefect = (scene: ConfirmScene) => void;

function confirmSelector(id: string): string {
  return `[data-testid="${id}"]`;
}

/**
 * Mounts the harness, presses Close, waits for the transition to reach its
 * resting state, applies the defect, and only THEN records focus and outcome —
 * so a defect that moves focus is visible, and so two scenes sharing one
 * document cannot appear to steal focus from each other.
 */
async function confirmScene(dirty: boolean, defect?: ConfirmDefect): Promise<ConfirmScene> {
  const { container } = render(<ConfirmHarness dirty={dirty} />);
  const opener = container.querySelector<HTMLElement>(confirmSelector('confirm-opener'));
  expect(opener).not.toBeNull();
  const raised = opener as HTMLElement;

  raised.focus();
  fireEvent.click(raised);

  const record = (): HTMLElement => {
    const node = container.querySelector<HTMLElement>(confirmSelector('confirm-record'));
    expect(node).not.toBeNull();
    return node as HTMLElement;
  };

  if (dirty) {
    await waitFor(() => {
      expect(
        container.querySelector(confirmSelector(HELM_SAFETY_TEST_IDS.closeConfirm)),
      ).not.toBeNull();
    });
  } else {
    await waitFor(() => {
      expect(record().dataset.settled).toBe('true');
    });
  }

  const scene: ConfirmScene = {
    root: container,
    opener: raised,
    outcome: null,
    focused: null,
  };
  defect?.(scene);

  const settled = record().dataset.settled === 'true';
  const open = record().dataset.open === 'true';
  return {
    ...scene,
    outcome: settled ? !open : null,
    focused: container.ownerDocument.activeElement,
  };
}

async function confirmScenes(defect?: ConfirmDefect): Promise<ConfirmScenes> {
  // Clean first, and captured before the dirty one mounts: the dirty scene
  // moves focus into its dialog, and one document has one focus.
  const clean = await confirmScene(false, defect);
  const dirty = await confirmScene(true, defect);
  return { clean, dirty };
}

describe('the real close guard satisfies every confirmation property', () => {
  it('covers the properties whose failure would lose a draft', () => {
    expect(CLOSE_CONFIRM_PROPERTIES.map((property) => property.name)).toEqual([
      'a clean panel closes as it always did, and a dirty one asks first',
      'the confirmation names itself and offers both ways out, each operable by keyboard',
      'focus moves into the confirmation when it opens, and stays put when none opens',
    ]);
  });

  for (const property of CLOSE_CONFIRM_PROPERTIES) {
    it(`holds: ${property.name}`, async () => {
      expect(property.failures(await confirmScenes())).toEqual([]);
    });
  }
});

const CONFIRM_DEFECTS: readonly { defect: string; breaks: string; apply: ConfirmDefect }[] = [
  {
    defect: 'a dirty draft is closed over with no confirmation — the bug this session is about',
    breaks: 'a clean panel closes as it always did, and a dirty one asks first',
    apply: (scene) => {
      scene.root.querySelector(confirmSelector(HELM_SAFETY_TEST_IDS.closeConfirm))?.remove();
    },
  },
  {
    defect: 'every close is confirmed, even one that would lose nothing',
    breaks: 'a clean panel closes as it always did, and a dirty one asks first',
    apply: (scene) => {
      const already = scene.root.querySelector(
        confirmSelector(HELM_SAFETY_TEST_IDS.closeConfirm),
      );
      if (already !== null) return;
      const planted = scene.root.ownerDocument.createElement('div');
      planted.dataset.testid = HELM_SAFETY_TEST_IDS.closeConfirm;
      scene.root.appendChild(planted);
    },
  },
  {
    defect: 'the confirmation is announced as an unnamed dialog',
    breaks: 'the confirmation names itself and offers both ways out, each operable by keyboard',
    apply: (scene) => {
      scene.root
        .querySelector(confirmSelector(HELM_SAFETY_TEST_IDS.closeConfirm))
        ?.removeAttribute('aria-labelledby');
    },
  },
  {
    defect: 'both ways out are dead controls',
    breaks: 'the confirmation names itself and offers both ways out, each operable by keyboard',
    apply: (scene) => {
      for (const id of [
        HELM_SAFETY_TEST_IDS.closeConfirmKeep,
        HELM_SAFETY_TEST_IDS.closeConfirmDiscard,
      ]) {
        scene.root.querySelector(confirmSelector(id))?.setAttribute('disabled', '');
      }
    },
  },
  {
    defect: 'the discard button leaves the tab order, so keyboard has only one way out',
    breaks: 'the confirmation names itself and offers both ways out, each operable by keyboard',
    apply: (scene) => {
      scene.root
        .querySelector(confirmSelector(HELM_SAFETY_TEST_IDS.closeConfirmDiscard))
        ?.setAttribute('tabindex', '-1');
    },
  },
  {
    defect: 'the dialog opens behind the focus, which never leaves the control that asked',
    breaks: 'focus moves into the confirmation when it opens, and stays put when none opens',
    apply: (scene) => {
      scene.opener.focus();
    },
  },
];

describe('each confirmation property catches the defect it exists for', () => {
  for (const { defect, breaks, apply } of CONFIRM_DEFECTS) {
    it(`notices that ${defect}`, async () => {
      const property = CLOSE_CONFIRM_PROPERTIES.find((candidate) => candidate.name === breaks);
      expect(property, `no property named ${breaks}`).toBeDefined();
      expect(property?.failures(await confirmScenes(apply))).not.toEqual([]);
    });
  }

  it('reports nothing when the injected defect does nothing', async () => {
    const noop: ConfirmDefect = () => {
      // deliberately empty
    };
    const scenes = await confirmScenes(noop);
    const stillHolding = CLOSE_CONFIRM_PROPERTIES.filter(
      (property) => property.failures(scenes).length > 0,
    );
    expect(stillHolding.map((property) => property.name)).toEqual([]);
  });

  it('leaves no confirmation property without a defect to catch', () => {
    const covered = new Set(CONFIRM_DEFECTS.map((entry) => entry.breaks));
    expect(
      CLOSE_CONFIRM_PROPERTIES.map((property) => property.name).filter(
        (name) => !covered.has(name),
      ),
    ).toEqual([]);
  });

  it('aims every confirmation defect at a property that exists', () => {
    const names = new Set(CLOSE_CONFIRM_PROPERTIES.map((property) => property.name));
    expect(CONFIRM_DEFECTS.filter((entry) => !names.has(entry.breaks))).toEqual([]);
  });
});
