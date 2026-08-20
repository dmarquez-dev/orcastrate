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

import type { ReactNode } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PANEL_TEST_IDS } from '../contracts/renderer-panels';
import type { HelmPanelProps } from '../contracts/renderer-panels';
import { makeStubHelmDocument } from '../test-utils';

import { HelmPanel } from './HelmPanel';
import { PANEL_PROPERTIES, type Mount, type MountOptions } from './probes';
import { SOURCE_RULES, STYLE_RULES } from './rules';
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

    const { container } = render(
      <Panel actions={helmActions()} view={helmView({ document, ...options.view })} />,
    );
    // After commit, so React does not overwrite it. Every mount here renders
    // once and never updates, so the mutation stays put.
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
      'the hold caveat is the frozen constant, character for character',
      'an absent crossSessionInbound key selects nothing, and never hold',
      'the scope picker offers no way to type a path',
      'a conflict names the file, says nothing was written, and keeps the draft',
      'every control in the panel has an accessible name',
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
    defect: 'the hold caveat is paraphrased instead of quoted',
    breaks: 'the hold caveat is the frozen constant, character for character',
    apply: (root) => {
      const caveat = testIdOf(root, PANEL_TEST_IDS.helmCrossSessionCaveat);
      if (caveat !== null) caveat.textContent = 'Might not work in every CLI version.';
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
