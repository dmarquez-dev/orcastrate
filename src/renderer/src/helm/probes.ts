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

import { COMPARISON_FIELDS } from './comparison';
import { HELM_SAFETY_TEST_IDS, comparisonCellId } from './test-ids';

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
  /**
   * Sets `view.incoming` to the ready document with THIS model and nothing
   * else changed. Left out, `incoming` stays null. A property asks for it
   * rather than assembling a document, for the same reason `parseError` is a
   * string here: how a fixture is built is the caller's business.
   */
  incomingModel?: string;
  /**
   * Presses the compare affordance after mounting and lets the panel settle,
   * so the property sees the panel in the state a user reaches by ASKING for a
   * comparison. The caller does the pressing because it is the one holding a
   * test library; nothing in this module dispatches an event.
   */
  requestComparison?: boolean;
}

/** The model a property plants in `incoming`, so the disk column is nameable. */
export const DISK_MODEL = 'claude-model-read-from-disk';

/** The message a failed comparison carries, verbatim, in the property below. */
export const COMPARE_FAILURE = 'EACCES: permission denied';

/** A conflict message, so the banner that carries the affordance is on screen. */
export const CONFLICT_MESSAGE = 'The settings file changed on disk. Nothing was written.';

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

  // -------------------------------------------------------------------------
  // Session 2026-08-31-orcastrate-helm-draft-safety
  // -------------------------------------------------------------------------

  {
    /**
     * The conflict banner used to point at Reload and nothing else — the one
     * action documented as discarding the draft. A user following the banner's
     * own advice lost the edits the banner had just called safe. This is that
     * defect, written as a property.
     */
    name: 'a conflict offers a way to look without discarding, and only a conflict does',
    failures(mount) {
      const out: string[] = [];
      const root = mount({
        view: { conflict: CONFLICT_MESSAGE, actionError: CONFLICT_MESSAGE, dirty: true },
      });

      const offered = [
        ...root.querySelectorAll<HTMLElement>(
          `[data-testid="${HELM_SAFETY_TEST_IDS.compare}"]`,
        ),
      ];
      if (offered.length !== 1) {
        out.push(`the comparison is offered ${String(offered.length)} times, not once`);
      }

      const button = offered[0];
      if (button !== undefined) {
        const banner = byTestId(root, PANEL_TEST_IDS.helmConflict);
        if (banner === null) out.push('no conflict banner to carry the affordance');
        else if (!banner.contains(button)) out.push('the affordance is not on the conflict banner');
        if (button.tagName !== 'BUTTON') out.push('the affordance is not a button');
        if (button instanceof HTMLButtonElement && button.disabled) {
          out.push('the affordance is offered but dead');
        }
        if (!hasAccessibleName(root, button)) out.push('the affordance has no accessible name');
      }

      // The other direction. Without it a panel that offered the comparison
      // unconditionally would satisfy the half above and say nothing about the
      // case the amended docblock is actually written for.
      const calm = mount({});
      const uncalled = calm.querySelectorAll(
        `[data-testid="${HELM_SAFETY_TEST_IDS.compare}"]`,
      ).length;
      if (uncalled !== 0) out.push(`the comparison is offered ${String(uncalled)} times with no conflict`);
      return out;
    },
  },

  {
    /**
     * The side-by-side `helm.ts` has promised since it froze: the file's
     * current contents BESIDE the pending edit, not instead of it. The draft
     * half is read out of the model input rather than out of a fixture, so the
     * property is comparing what is on screen with what is on screen.
     */
    name: 'the comparison puts the file on disk beside the pending edit, field by field',
    failures(mount) {
      const out: string[] = [];
      const root = mount({ incomingModel: DISK_MODEL });

      if (byTestId(root, HELM_SAFETY_TEST_IDS.comparisonTable) === null) {
        return ['no side-by-side was rendered for a fetched document'];
      }

      for (const field of COMPARISON_FIELDS) {
        const disk = byTestId(root, comparisonCellId(HELM_SAFETY_TEST_IDS.comparisonDisk, field));
        const edit = byTestId(root, comparisonCellId(HELM_SAFETY_TEST_IDS.comparisonDraft, field));
        if (disk === null) out.push(`no on-disk value for ${field}`);
        if (edit === null) out.push(`no pending-edit value for ${field}`);
      }

      const diskModel = byTestId(
        root,
        comparisonCellId(HELM_SAFETY_TEST_IDS.comparisonDisk, 'model'),
      );
      const editModel = byTestId(
        root,
        comparisonCellId(HELM_SAFETY_TEST_IDS.comparisonDraft, 'model'),
      );
      const typed = (byTestId(root, PANEL_TEST_IDS.helmModel) as HTMLInputElement | null)?.value;

      if (diskModel !== null && !(diskModel.textContent ?? '').includes(DISK_MODEL)) {
        out.push('the on-disk column does not carry what was read from disk');
      }
      if (typed === undefined || typed === '') out.push('the draft has no model to be compared');
      else if (editModel !== null && !(editModel.textContent ?? '').includes(typed)) {
        out.push('the pending-edit column does not carry what the form holds');
      } else if (typed === DISK_MODEL) {
        out.push('the fixture cannot tell the two columns apart');
      }

      // And no side-by-side when nothing has been fetched, or "beside" would
      // be satisfied by a table that is always there showing the draft twice.
      if (byTestId(mount({}), HELM_SAFETY_TEST_IDS.comparisonTable) !== null) {
        out.push('a side-by-side was rendered with nothing to compare against');
      }
      return out;
    },
  },

  {
    /**
     * The frontend discipline: "a component that renders only the success path
     * is unfinished". All four states, each exclusive of the others.
     */
    name: 'the comparison declares loading, error and empty states, not just the table',
    failures(mount) {
      const out: string[] = [];

      const shown = (root: HTMLElement): string[] =>
        [
          HELM_SAFETY_TEST_IDS.comparisonLoading,
          HELM_SAFETY_TEST_IDS.comparisonError,
          HELM_SAFETY_TEST_IDS.comparisonEmpty,
          HELM_SAFETY_TEST_IDS.comparisonTable,
        ].filter((id) => byTestId(root, id) !== null);

      const loading = shown(mount({ view: { comparing: true } }));
      if (loading.join() !== HELM_SAFETY_TEST_IDS.comparisonLoading) {
        out.push(`an in-flight comparison showed ${JSON.stringify(loading)}`);
      }

      const empty = shown(mount({}));
      if (empty.join() !== HELM_SAFETY_TEST_IDS.comparisonEmpty) {
        out.push(`an unasked comparison showed ${JSON.stringify(empty)}`);
      }

      const errored = mount({
        requestComparison: true,
        view: { conflict: CONFLICT_MESSAGE, actionError: COMPARE_FAILURE, dirty: true },
      });
      const failure = shown(errored);
      if (failure.join() !== HELM_SAFETY_TEST_IDS.comparisonError) {
        out.push(`a failed comparison showed ${JSON.stringify(failure)}`);
      } else {
        const text = byTestId(errored, HELM_SAFETY_TEST_IDS.comparisonError)?.textContent ?? '';
        if (!text.includes(COMPARE_FAILURE)) {
          out.push('the failure was reworded instead of printed verbatim');
        }
      }

      const ready = shown(mount({ incomingModel: DISK_MODEL }));
      if (ready.join() !== HELM_SAFETY_TEST_IDS.comparisonTable) {
        out.push(`a fetched comparison showed ${JSON.stringify(ready)}`);
      }
      return out;
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

// ---------------------------------------------------------------------------
// The close confirmation (session 2026-08-31-orcastrate-helm-draft-safety)
// ---------------------------------------------------------------------------

/**
 * WHY THESE ARE A SECOND FAMILY rather than more `PANEL_PROPERTIES`.
 *
 * A `PanelProperty` is handed a `mount` it can call as often as it likes,
 * synchronously. The confirmation cannot be reached that way: it exists only
 * once the shell has ASKED to close, the asking is a promise, and whether a
 * clean draft was let through is only knowable after that promise settles. So
 * the caller does the asking and the awaiting, and hands both settled scenes
 * in.
 *
 * Everything else is the same bargain as above: no test library is imported
 * here, the properties are plain functions over DOM nodes, and every one of
 * them is run against a deliberately broken scene in `discrimination.test.tsx`
 * and has to notice.
 */

export interface ConfirmScene {
  /** The container the panel and its guard rendered into. */
  root: HTMLElement;
  /** The control that asked to close, and that held focus when it did. */
  opener: HTMLElement;
  /** What the guard resolved, or `null` while it has not answered. */
  outcome: boolean | null;
  /**
   * `document.activeElement` AT THE MOMENT THIS SCENE WAS CAPTURED, not read
   * live. Two scenes share one document and a document has one focus, so the
   * second one mounted would otherwise appear to have stolen focus from the
   * first. The caller records this after applying any injected defect, which
   * is what lets a defect move focus and be noticed.
   */
  focused: Element | null;
}

export interface ConfirmScenes {
  /** A CLEAN draft was asked about, and the request has settled. */
  clean: ConfirmScene;
  /** A DIRTY draft was asked about, and nothing has been answered yet. */
  dirty: ConfirmScene;
}

export interface ConfirmProperty {
  name: string;
  failures(scenes: ConfirmScenes): string[];
}

function confirmDialog(scene: ConfirmScene): HTMLElement | null {
  return byTestId(scene.root, HELM_SAFETY_TEST_IDS.closeConfirm);
}

export const CLOSE_CONFIRM_PROPERTIES: readonly ConfirmProperty[] = [
  {
    /**
     * BOTH HALVES MATTER. A panel that always confirmed would satisfy "a dirty
     * draft is protected" and would make every clean close a dialog to
     * dismiss; a panel that never confirmed would satisfy "a clean panel is
     * unchanged" and would be the bug this session exists to fix.
     */
    name: 'a clean panel closes as it always did, and a dirty one asks first',
    failures({ clean, dirty }) {
      const out: string[] = [];

      if (confirmDialog(clean) !== null) out.push('a clean panel raised a confirmation');
      if (clean.outcome !== true) {
        out.push(`a clean panel answered ${JSON.stringify(clean.outcome)} instead of letting go`);
      }

      if (confirmDialog(dirty) === null) out.push('a dirty panel was closed with no confirmation');
      if (dirty.outcome !== null) {
        out.push(`a dirty panel answered ${JSON.stringify(dirty.outcome)} before the user did`);
      }
      return out;
    },
  },

  {
    name: 'the confirmation names itself and offers both ways out, each operable by keyboard',
    failures({ dirty }) {
      const dialog = confirmDialog(dirty);
      if (dialog === null) return ['no confirmation to inspect'];

      const out: string[] = [];
      if (dialog.getAttribute('role') !== 'dialog') out.push('the confirmation is not a dialog');
      if (!hasAccessibleName(dirty.root, dialog)) out.push('the confirmation has no accessible name');

      for (const id of [
        HELM_SAFETY_TEST_IDS.closeConfirmKeep,
        HELM_SAFETY_TEST_IDS.closeConfirmDiscard,
      ]) {
        const control = byTestId(dirty.root, id);
        if (control === null) {
          out.push(`no ${id}`);
          continue;
        }
        // A real button needs no key handling of its own to be operable, and
        // cannot be skipped by Tab unless someone takes it out of the order.
        if (control.tagName !== 'BUTTON') out.push(`${id} is not a button`);
        if (control instanceof HTMLButtonElement && control.disabled) out.push(`${id} is dead`);
        if (control.tabIndex < 0) out.push(`${id} is out of the tab order`);
        if (!hasAccessibleName(dirty.root, control)) out.push(`${id} has no accessible name`);
      }
      return out;
    },
  },

  {
    name: 'focus moves into the confirmation when it opens, and stays put when none opens',
    failures({ clean, dirty }) {
      const out: string[] = [];

      const dialog = confirmDialog(dirty);
      if (dialog === null) return ['no confirmation to move focus into'];
      const landed = dirty.focused;
      if (!(landed instanceof HTMLElement) || !dialog.contains(landed)) {
        out.push('focus never entered the confirmation');
      }

      // The other direction: a close with nothing to confirm must not move
      // focus anywhere, or "focus moved" would be satisfied by a panel that
      // throws focus around on every close.
      if (clean.focused !== clean.opener) {
        out.push('a clean close moved focus off the control that asked');
      }
      return out;
    },
  },
];
