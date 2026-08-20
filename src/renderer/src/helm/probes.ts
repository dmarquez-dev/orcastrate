/**
 * THE LOAD-BEARING PROPERTIES OF THE PANEL, WRITTEN ONCE.
 *
 * Each entry is a property whose failure would be a real defect — a settings
 * editor that saves over a file it could not read, a Save button that ignores
 * a blocking error, a caveat quietly reworded. `HelmPanel.test.tsx` runs them
 * against the real panel and expects no failures; `discrimination.test.tsx`
 * runs them against the real panel WITH ONE DEFECT INJECTED and expects the
 * matching property to notice.
 *
 * WHY THE PROPERTIES DO THE MOUNTING. Most of them are not statements about
 * one screen — they are statements about a DIFFERENCE between two. "Save is
 * disabled when blocked" is only worth asserting alongside "and enabled when
 * it is not"; a panel that disabled Save unconditionally would satisfy the
 * first half and be useless. So a property is handed a `mount` callback and
 * renders whatever it needs, which also means the same property text covers
 * both directions and neither can be dropped without the other noticing.
 *
 * NO TEST LIBRARY IS IMPORTED HERE. `mount` is supplied by the caller, so
 * React Testing Library stays in the test files and this module is a plain
 * function over a DOM node.
 */

import type { CrossSessionInbound } from '@shared/contracts/helm';
import type { HelmView } from '../contracts/renderer-panels';
import { CROSS_SESSION_HOLD_CAVEAT, PANEL_TEST_IDS } from '../contracts/renderer-panels';

/**
 * What a property can ask for. `view` is merged over a ready fixture; the
 * other two reach into the DOCUMENT, which the caller then reseeds the draft
 * from — a property should not have to know how a fixture is assembled.
 */
export interface MountOptions {
  view?: Partial<HelmView>;
  /** Sets `document.parseError`. */
  parseError?: string;
  /** Sets `managed.crossSessionInbound` on both document and draft. */
  crossSessionInbound?: CrossSessionInbound | null;
}

/** Renders the panel under test and returns the container it went into. */
export type Mount = (options: MountOptions) => HTMLElement;

export interface PanelProperty {
  name: string;
  /** Empty when the property holds. Each entry says what went wrong. */
  failures(mount: Mount): string[];
}

// ---------------------------------------------------------------------------
// DOM helpers — no library, so this module stays importable from anywhere
// ---------------------------------------------------------------------------

function byTestId(root: HTMLElement, id: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}

function controls(root: HTMLElement): (HTMLInputElement | HTMLTextAreaElement)[] {
  return [...root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')];
}

function saveButton(root: HTMLElement): HTMLButtonElement | null {
  return root.querySelector<HTMLButtonElement>(`[data-testid="${PANEL_TEST_IDS.helmSave}"]`);
}

function saveIsOff(root: HTMLElement): boolean | null {
  const save = saveButton(root);
  return save === null ? null : save.disabled;
}

/** One reason Save is off, checked in BOTH directions from one fixture. */
function saveReason(
  name: string,
  off: Partial<HelmView>,
  on: Partial<HelmView>,
): PanelProperty {
  return {
    name,
    failures(mount) {
      const out: string[] = [];
      const whenOff = saveIsOff(mount({ view: off }));
      const whenOn = saveIsOff(mount({ view: on }));
      if (whenOff === null || whenOn === null) return ['no Save button was rendered'];
      if (!whenOff) out.push(`Save was ENABLED although ${name}`);
      if (whenOn) out.push(`Save was DISABLED although nothing should have stopped it`);
      return out;
    },
  };
}

// ---------------------------------------------------------------------------
// The properties
// ---------------------------------------------------------------------------

const PARSE_ERROR = 'Unexpected end of JSON input';

export const PANEL_PROPERTIES: readonly PanelProperty[] = [
  saveReason(
    'the draft is blocked by an error-severity issue',
    { dirty: true, blocked: true },
    { dirty: true, blocked: false },
  ),
  saveReason(
    'a save is already in flight',
    { dirty: true, saving: true },
    { dirty: true, saving: false },
  ),
  saveReason(
    'there is nothing to write',
    { dirty: false },
    { dirty: true },
  ),

  {
    name: 'a file that would not parse locks the whole form and shows why',
    failures(mount) {
      const out: string[] = [];
      const broken = mount({
        parseError: PARSE_ERROR,
        view: {
          issues: [{ field: 'parseError', severity: 'error', message: PARSE_ERROR }],
          blocked: true,
          dirty: true,
        },
      });

      const banner = byTestId(broken, PANEL_TEST_IDS.helmReadOnly);
      if (banner === null) out.push('no read-only banner for a document with a parseError');
      else if (!(banner.textContent ?? '').includes(PARSE_ERROR)) {
        out.push('the read-only banner did not carry the parser message');
      }

      const fields = controls(broken);
      if (fields.length === 0) out.push('no form controls were rendered at all');
      const live = fields.filter((field) => !field.disabled);
      if (live.length > 0) out.push(`${String(live.length)} control(s) still editable`);
      if (saveIsOff(broken) !== true) out.push('Save was enabled over an unreadable file');

      // The other direction: a healthy document must NOT be locked, or the
      // property above would be satisfied by a panel that is always read-only.
      const healthy = mount({});
      if (byTestId(healthy, PANEL_TEST_IDS.helmReadOnly) !== null) {
        out.push('a healthy document was reported as unreadable');
      }
      if (controls(healthy).every((field) => field.disabled)) {
        out.push('a healthy document rendered no editable control');
      }
      return out;
    },
  },

  {
    name: 'the hold caveat is the frozen constant, character for character',
    failures(mount) {
      const caveat = byTestId(mount({}), PANEL_TEST_IDS.helmCrossSessionCaveat);
      if (caveat === null) return ['no caveat was rendered beside hold'];
      const text = caveat.textContent ?? '';
      if (text !== CROSS_SESSION_HOLD_CAVEAT) {
        return [`the caveat was reworded: ${JSON.stringify(text)}`];
      }
      return [];
    },
  },

  {
    name: 'an absent crossSessionInbound key selects nothing, and never hold',
    failures(mount) {
      const out: string[] = [];
      const absent = mount({ crossSessionInbound: null });
      for (const value of ['accept', 'hold', 'refuse']) {
        const radio = byTestId(
          absent,
          `${PANEL_TEST_IDS.helmCrossSession}:${value}`,
        ) as HTMLInputElement | null;
        if (radio === null) out.push(`no radio for ${value}`);
        else if (radio.checked) out.push(`${value} was preselected for an absent key`);
      }

      // And a present key really does select — otherwise "nothing is checked"
      // would be satisfied by a group that can never be checked at all.
      const present = mount({ crossSessionInbound: 'refuse' });
      const refuse = byTestId(
        present,
        `${PANEL_TEST_IDS.helmCrossSession}:refuse`,
      ) as HTMLInputElement | null;
      if (refuse !== null && !refuse.checked) out.push('a present key selected nothing');
      return out;
    },
  },

  {
    name: 'the scope picker offers no way to type a path',
    failures(mount) {
      const root = mount({});
      const path = byTestId(root, PANEL_TEST_IDS.helmScopePath);
      if (path === null) return ['no scope path was rendered'];

      const out: string[] = [];
      if (path.tagName === 'INPUT' || path.tagName === 'TEXTAREA') {
        out.push('the path itself is an editable control');
      }
      const picker = path.closest('fieldset');
      if (picker === null) out.push('the path is not inside the picker');
      else if (picker.querySelectorAll('input, textarea').length > 0) {
        out.push('the scope picker contains a text control');
      }
      return out;
    },
  },

  {
    name: 'a conflict names the file, says nothing was written, and keeps the draft',
    failures(mount) {
      const conflict = 'settings.json changed on disk. Nothing was written.';
      const root = mount({
        view: { conflict, actionError: conflict, dirty: true, stale: true },
      });
      const out: string[] = [];

      const banner = byTestId(root, PANEL_TEST_IDS.helmConflict);
      if (banner === null) return ['no conflict banner'];
      const text = banner.textContent ?? '';
      if (!text.includes(conflict)) out.push('the conflict message was not shown verbatim');
      if (!/nothing was written/i.test(text)) out.push('the banner never says nothing was written');

      const path = byTestId(root, PANEL_TEST_IDS.helmScopePath)?.textContent ?? '';
      if (path === '' || !text.includes(path)) out.push('the banner does not name the file');

      const model = byTestId(root, PANEL_TEST_IDS.helmModel) as HTMLInputElement | null;
      if (model === null) out.push('the draft is gone after a conflict');
      else if (model.disabled) out.push('the draft is on screen but no longer editable');

      const reloads = root.querySelectorAll(`[data-testid="${PANEL_TEST_IDS.helmReload}"]`);
      if (reloads.length !== 1) {
        out.push(`Reload is offered ${String(reloads.length)} times, not once`);
      }
      return out;
    },
  },

  {
    name: 'every control in the panel has an accessible name',
    failures(mount) {
      const root = mount({});
      const named = [...root.querySelectorAll<HTMLElement>('input, textarea, select, button')];
      if (named.length < 10) return ['too few controls rendered to be the real panel'];

      return named
        .filter((control) => !hasAccessibleName(root, control))
        .map((control) => `unnamed: ${control.outerHTML.slice(0, 120)}`);
    },
  },
];

/**
 * A name from `aria-label`, from `aria-labelledby`, from a `<label for>`, or —
 * for a button ONLY — from its own text.
 *
 * The button exception is deliberate and narrow. An earlier version of this
 * check accepted any non-empty `textContent`, which let a `<select>` pass on
 * the text of its own `<option>`s: a select with no label at all would have
 * looked named. Nothing was actually wrong, but the check read stronger than
 * it was.
 */
export function hasAccessibleName(root: HTMLElement, control: HTMLElement): boolean {
  const label = control.getAttribute('aria-label');
  if (label !== null && label.trim() !== '') return true;

  const labelledBy = control.getAttribute('aria-labelledby');
  if (labelledBy !== null) {
    const named = labelledBy
      .split(' ')
      .filter((id) => id !== '')
      .some((id) => (root.querySelector(`#${id}`)?.textContent ?? '').trim() !== '');
    if (named) return true;
  }

  const id = control.getAttribute('id');
  if (id !== null && root.querySelector(`label[for="${id}"]`) !== null) return true;

  if (control.tagName === 'BUTTON') return (control.textContent ?? '').trim() !== '';
  return false;
}
