// @vitest-environment jsdom
/**
 * Helm, driven through `PANEL_TEST_IDS` and asserted on observable output —
 * what is on screen, what is disabled, and which callback ran with what.
 * Nothing here reaches into a component's internals, so the markup can be
 * rewritten without touching this file.
 *
 * `HelmPanel` takes props, so these tests need no provider and no stub bridge.
 * That is the point of the presentation boundary: the only component in this
 * directory that calls a hook is `ConnectedHelmPanel`.
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { HelmValidationIssue } from '@shared/contracts/helm';
import { CROSS_SESSION_HOLD_CAVEAT, PANEL_TEST_IDS } from '../contracts/renderer-panels';
import type { HelmActions, HelmView } from '../contracts/renderer-panels';
import { ipcError, makeStubHelmDocument, makeStubHelmScopes } from '../test-utils';

import { COPY } from './copy';
import { HelmPanel } from './HelmPanel';
import { hasAccessibleName } from './probes';
import { helmActions, helmView } from './test-fixtures';

function renderPanel(
  view: Partial<HelmView> = {},
  actions: Partial<HelmActions> = {},
): { actions: HelmActions } {
  const resolved = helmActions(actions);
  render(<HelmPanel actions={resolved} view={helmView(view)} />);
  return { actions: resolved };
}

function save(): HTMLButtonElement {
  return screen.getByTestId(PANEL_TEST_IDS.helmSave) as HTMLButtonElement;
}

// ---------------------------------------------------------------------------
// Criterion 2 — the renderer cannot name a file
// ---------------------------------------------------------------------------

describe('the scope picker', () => {
  it('lists every scope by label and shows the path read-only, never as an input', () => {
    renderPanel();

    for (const scope of makeStubHelmScopes()) {
      const option = screen.getByTestId(`${PANEL_TEST_IDS.helmScopeOption}:${scope.id}`);
      expect(option.textContent).toContain(scope.label);
    }

    const path = screen.getByTestId(PANEL_TEST_IDS.helmScopePath);
    expect(path.tagName).toBe('P');
    expect(path.textContent).toBe(makeStubHelmDocument('user').scope.displayPath);
    // Nothing in the picker accepts typed text at all.
    const picker = path.closest('fieldset');
    expect(picker?.querySelectorAll('input, textarea').length).toBe(0);
  });

  it('hands selectScope the opaque scope id that came out of the list', () => {
    const { actions } = renderPanel();

    fireEvent.change(screen.getByTestId(PANEL_TEST_IDS.helmScopeSelect), {
      target: { value: 'project:pod-1' },
    });

    expect(actions.selectScope).toHaveBeenCalledTimes(1);
    expect(actions.selectScope).toHaveBeenCalledWith('project:pod-1');
  });

  it('says a scope that does not exist yet will be created rather than calling it an error', () => {
    renderPanel({
      document: makeStubHelmDocument('projectLocal:pod-1'),
      selectedScopeId: 'projectLocal:pod-1',
    });

    expect(screen.getByText(COPY.scopeAbsent)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Criterion 3 — the design's five fields, every control labelled
// ---------------------------------------------------------------------------

describe('the form', () => {
  it('surfaces exactly the design fields, each with a programmatic label', () => {
    renderPanel();

    expect(screen.getByLabelText(COPY.modelLabel)).not.toBeNull();
    // Two rules in the stub allow list, one in the deny list, one env pair.
    expect(screen.getByLabelText(`${COPY.allowItemLabel} 1`)).not.toBeNull();
    expect(screen.getByLabelText(`${COPY.allowItemLabel} 2`)).not.toBeNull();
    expect(screen.getByLabelText(`${COPY.denyItemLabel} 1`)).not.toBeNull();
    expect(screen.getByLabelText(`${COPY.envNameLabel} 1`)).not.toBeNull();
    expect(screen.getByLabelText(`${COPY.envValueLabel} 1`)).not.toBeNull();
    expect(screen.getByLabelText(COPY.hooksLabel)).not.toBeNull();
  });

  it('leaves no control in the form without an accessible name', () => {
    renderPanel();
    const panel = screen.getByTestId(PANEL_TEST_IDS.helmPanel);
    const controls = [...panel.querySelectorAll<HTMLElement>('input, textarea, select, button')];

    expect(controls.length).toBeGreaterThan(10);
    // `hasAccessibleName` is the shared rule, and it accepts a control's own
    // text ONLY for a button. An earlier version of this sweep accepted any
    // non-empty `textContent`, which would have let a `<select>` pass on the
    // text of its own options — nothing was wrong, but the check read stronger
    // than it was. `discrimination.test.tsx` proves the rule notices a control
    // whose label has been taken away.
    const unnamed = controls.filter((control) => !hasAccessibleName(panel, control));
    expect(unnamed.map((control) => control.outerHTML)).toEqual([]);
  });

  it('edits the draft rather than the document', () => {
    const { actions } = renderPanel();

    fireEvent.change(screen.getByTestId(PANEL_TEST_IDS.helmModel), {
      target: { value: 'claude-opus-4-9' },
    });

    expect(actions.edit).toHaveBeenCalledTimes(1);
    const patch = vi.mocked(actions.edit).mock.calls[0]?.[0];
    expect(patch?.managed?.model).toBe('claude-opus-4-9');
  });

  it('maps a cleared model field to an absent key, not to an empty string', () => {
    const { actions } = renderPanel();

    fireEvent.change(screen.getByTestId(PANEL_TEST_IDS.helmModel), { target: { value: '' } });

    expect(vi.mocked(actions.edit).mock.calls[0]?.[0]?.managed?.model).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Criterion 4 — crossSessionInbound
// ---------------------------------------------------------------------------

describe('crossSessionInbound', () => {
  it('offers all three values and carries the hold caveat verbatim', () => {
    renderPanel();

    for (const value of ['accept', 'hold', 'refuse']) {
      expect(screen.getByTestId(`${PANEL_TEST_IDS.helmCrossSession}:${value}`)).not.toBeNull();
    }
    expect(screen.getByTestId(PANEL_TEST_IDS.helmCrossSessionCaveat).textContent).toBe(
      CROSS_SESSION_HOLD_CAVEAT,
    );
  });

  it('describes hold with the caveat, so the uncertainty reaches a screen reader', () => {
    renderPanel();
    const hold = screen.getByTestId(`${PANEL_TEST_IDS.helmCrossSession}:hold`);
    const described = hold.getAttribute('aria-describedby') ?? '';
    const caveatId = screen.getByTestId(PANEL_TEST_IDS.helmCrossSessionCaveat).getAttribute('id');

    expect(caveatId).not.toBeNull();
    expect(described.split(' ')).toContain(caveatId);
  });

  it('selects NOTHING when the key is absent, and never preselects hold', () => {
    const document = makeStubHelmDocument('user', {
      managed: { ...makeStubHelmDocument('user').managed, crossSessionInbound: null },
    });
    renderPanel({ document });

    for (const value of ['accept', 'hold', 'refuse']) {
      const radio = screen.getByTestId(
        `${PANEL_TEST_IDS.helmCrossSession}:${value}`,
      ) as HTMLInputElement;
      expect(radio.checked).toBe(false);
    }
  });

  it('sends the chosen value up as a draft patch', () => {
    const { actions } = renderPanel();

    fireEvent.click(screen.getByTestId(`${PANEL_TEST_IDS.helmCrossSession}:hold`));

    expect(vi.mocked(actions.edit).mock.calls[0]?.[0]?.managed?.crossSessionInbound).toBe('hold');
  });
});

// ---------------------------------------------------------------------------
// Criterion 5 — hooks are a validated raw-JSON pane
// ---------------------------------------------------------------------------

describe('the hooks pane', () => {
  it('is a textarea over the raw JSON, and no builder', () => {
    renderPanel();
    const hooks = screen.getByTestId(PANEL_TEST_IDS.helmHooksJson);

    expect(hooks.tagName).toBe('TEXTAREA');
    expect((hooks as HTMLTextAreaElement).value).toContain('PreToolUse');
  });

  it("renders the parser's own message and blocks Save when the JSON is invalid", () => {
    const issue: HelmValidationIssue = {
      field: 'hooksJson',
      severity: 'error',
      message: 'Unexpected token } in JSON at position 12',
    };
    renderPanel({ issues: [issue], blocked: true, dirty: true });

    expect(screen.getByTestId(PANEL_TEST_IDS.helmHooksError).textContent).toContain(issue.message);
    expect(save().disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Criterion 6 — a file Helm could not read
// ---------------------------------------------------------------------------

describe('a document that would not parse', () => {
  it('goes read-only, shows the parser message, and offers no enabled Save', () => {
    const parseError = 'Unexpected end of JSON input';
    const document = makeStubHelmDocument('user', { parseError });
    renderPanel({
      document,
      issues: [{ field: 'parseError', severity: 'error', message: parseError }],
      blocked: true,
      dirty: true,
    });

    expect(screen.getByTestId(PANEL_TEST_IDS.helmReadOnly).textContent).toContain(parseError);
    expect(save().disabled).toBe(true);

    const panel = screen.getByTestId(PANEL_TEST_IDS.helmPanel);
    const fields = [
      ...panel.querySelectorAll<HTMLInputElement>('input, textarea'),
    ];
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.filter((field) => !field.disabled)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Criterion 7 — errors and conflicts
// ---------------------------------------------------------------------------

describe('the error surfaces', () => {
  it('renders a load failure verbatim at helmError', () => {
    const error = ipcError('INTERNAL', 'EACCES: permission denied, open settings.json');
    renderPanel({ phase: 'error', value: [], error, actionError: error.message });

    expect(screen.getByTestId(PANEL_TEST_IDS.helmError).textContent).toContain(error.message);
  });

  it('renders an action failure verbatim at helmError even while the panel is ready', () => {
    renderPanel({ actionError: 'EROFS: read-only file system' });

    expect(screen.getByTestId(PANEL_TEST_IDS.helmError).textContent).toContain(
      'EROFS: read-only file system',
    );
  });

  it('states nothing was written, names the file, and keeps the draft editable', () => {
    const conflict = 'settings.json changed on disk. Nothing was written.';
    const { actions } = renderPanel({
      conflict,
      actionError: conflict,
      stale: true,
      dirty: true,
    });

    const banner = screen.getByTestId(PANEL_TEST_IDS.helmConflict);
    expect(banner.textContent).toContain(COPY.conflictHeading);
    expect(banner.textContent).toContain(conflict);
    expect(banner.textContent).toContain(makeStubHelmDocument('user').scope.displayPath);

    // The draft is still on screen and still takes an edit.
    const model = screen.getByTestId(PANEL_TEST_IDS.helmModel) as HTMLInputElement;
    expect(model.disabled).toBe(false);
    fireEvent.change(model, { target: { value: 'claude-haiku-4-6' } });
    expect(actions.edit).toHaveBeenCalledTimes(1);

    // And Reload is offered, exactly once.
    expect(screen.getAllByTestId(PANEL_TEST_IDS.helmReload).length).toBe(1);
    fireEvent.click(screen.getByTestId(PANEL_TEST_IDS.helmReload));
    expect(actions.reload).toHaveBeenCalledTimes(1);
  });

  it('does not print the conflict message twice when it is also the action error', () => {
    const conflict = 'settings.json changed on disk. Nothing was written.';
    renderPanel({ conflict, actionError: conflict, dirty: true });

    expect(screen.queryByTestId(PANEL_TEST_IDS.helmError)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Criterion 8 — stale is advisory
// ---------------------------------------------------------------------------

describe('the stale banner', () => {
  it('advises, offers Reload, and never disables Save', () => {
    renderPanel({ stale: true, dirty: true });

    expect(screen.getByTestId(PANEL_TEST_IDS.helmStale).textContent).toContain(COPY.staleHeading);
    expect(screen.getByTestId(PANEL_TEST_IDS.helmReload)).not.toBeNull();
    expect(save().disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Criterion 9 — the backup path
// ---------------------------------------------------------------------------

describe('after a successful save', () => {
  it('shows the backup path and any non-blocking warning beside it', () => {
    const warning: HelmValidationIssue = {
      field: 'crossSessionInbound',
      severity: 'warning',
      message: CROSS_SESSION_HOLD_CAVEAT,
    };
    renderPanel({
      lastSave: {
        document: makeStubHelmDocument('user'),
        backupDisplayPath: 'settings.json.2026-08-19T101500.bak',
        warnings: [warning],
      },
    });

    const banner = screen.getByTestId(PANEL_TEST_IDS.helmBackupPath);
    expect(banner.textContent).toContain('settings.json.2026-08-19T101500.bak');
    expect(banner.textContent).toContain(warning.message);
  });

  it('hides a backup path that belongs to a different file', () => {
    renderPanel({
      selectedScopeId: 'project:pod-1',
      lastSave: {
        document: makeStubHelmDocument('user'),
        backupDisplayPath: 'settings.json.2026-08-19T101500.bak',
        warnings: [],
      },
    });

    expect(screen.queryByTestId(PANEL_TEST_IDS.helmBackupPath)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Criterion 10 — three independent reasons Save is off
// ---------------------------------------------------------------------------

describe('Save', () => {
  it('is enabled when the draft is dirty, unblocked and idle', () => {
    renderPanel({ dirty: true });
    expect(save().disabled).toBe(false);
  });

  it('is disabled by blocked alone', () => {
    renderPanel({ dirty: true, blocked: true });
    expect(save().disabled).toBe(true);
  });

  it('is disabled by saving alone', () => {
    renderPanel({ dirty: true, saving: true });
    expect(save().disabled).toBe(true);
  });

  it('is disabled by a clean draft alone', () => {
    renderPanel({ dirty: false });
    expect(save().disabled).toBe(true);
  });

  it('calls save exactly once when pressed', () => {
    const { actions } = renderPanel({ dirty: true });
    fireEvent.click(save());
    expect(actions.save).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Criterion 11 — loading, error and empty
// ---------------------------------------------------------------------------

describe('the non-success states', () => {
  it('says the scope list is loading', () => {
    renderPanel({ phase: 'loading', value: [], document: null, draft: null });
    expect(screen.getByText(COPY.loadingScopes)).not.toBeNull();
  });

  it('says the document is loading', () => {
    renderPanel({ loadingDocument: true });
    expect(screen.getByText(COPY.loadingDocument)).not.toBeNull();
  });

  it('asks for a choice before a scope is picked', () => {
    renderPanel({ selectedScopeId: null, document: null, draft: null });
    expect(screen.getByText(COPY.scopeUnchosen)).not.toBeNull();
    expect(screen.getByText(COPY.scopePathUnchosen)).not.toBeNull();
    expect(screen.queryByTestId(PANEL_TEST_IDS.helmModel)).toBeNull();
  });

  it('says so on a machine with no Pods yet, where only the user scope exists', () => {
    const scopes = makeStubHelmScopes().slice(0, 1);
    renderPanel({ value: scopes });

    expect(screen.getByText(COPY.scopeOnlyUser)).not.toBeNull();
  });

  it('says so when there is nothing to edit at all', () => {
    renderPanel({ value: [], selectedScopeId: null, document: null, draft: null });
    expect(screen.getByText(COPY.scopeNone)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The upstream finding: an issue whose field nobody claimed
// ---------------------------------------------------------------------------

describe('an issue with an unexpected field name', () => {
  it('still reaches the screen, so blocked is never a dead button with no cause', () => {
    const issue: HelmValidationIssue = {
      field: 'permissionsDenyPattern',
      severity: 'error',
      message: 'That rule is not a pattern Claude Code understands.',
    };
    renderPanel({ issues: [issue], blocked: true, dirty: true });

    expect(screen.getByText(issue.message)).not.toBeNull();
    expect(save().disabled).toBe(true);
  });

  it('does not repeat the parse error the read-only banner already shows', () => {
    const parseError = 'Unexpected end of JSON input';
    renderPanel({
      document: makeStubHelmDocument('user', { parseError }),
      issues: [{ field: 'parseError', severity: 'error', message: parseError }],
      blocked: true,
    });

    const shown = screen.getAllByText(parseError);
    expect(shown.length).toBe(1);
    expect(within(screen.getByTestId(PANEL_TEST_IDS.helmReadOnly)).getByText(parseError)).not.toBeNull();
  });
});
