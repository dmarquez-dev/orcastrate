/**
 * The Beachcomber and Helm boundary.
 *
 * Three properties are pinned here, and none of them is provable by reading
 * the handlers:
 *
 *   1. THE NO-PATHS RULE SURVIVES A PANEL WHOSE SUBJECT IS PATHS. No method on
 *      either namespace accepts a path. `preview`/`trash` take `{ scanId, ids }`
 *      and `load`/`save` take a scopeId-keyed payload — and because the
 *      validators REBUILD the object from the fields the contract declares, a
 *      path-shaped extra key cannot ride through to a service that would then
 *      be trusted to ignore it.
 *
 *   2. VALIDATION IS SHAPE-ONLY. Nothing in `src/main/ipc/**` resolves, joins
 *      or stats anything. A bad shape is INVALID_ARGUMENT; every question that
 *      needs the disk — including "is this id one you minted" — belongs to the
 *      service and comes back as NOT_FOUND.
 *
 *   3. AN ERROR IS TRANSLATED TO THIS BOUNDARY'S VOCABULARY. A thrown
 *      `IpcFailure` keeps its code. Anything else becomes INTERNAL with a
 *      message safe to put in front of a user — no stack text, ever, because
 *      `IpcError.message` is the string the panel renders.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { INVOKE_CHANNELS, type IpcErrorCode } from '../../../src/shared/contracts/ipc';
import {
  IpcFailure,
  MAX_BEACHCOMBER_IDS,
  requireBeachcomberPreviewRequest,
  requireBeachcomberTrashRequest,
  requireHelmSaveRequest,
  requireHelmScopeId,
} from '../../../src/main/ipc';

import { makeHarness, type Harness } from './helpers';
import { FAKE_SCAN_ID, VALID_PANEL_PAYLOADS } from './panel-fakes';

const harnesses: Harness[] = [];

function harness(): Harness {
  const made = makeHarness();
  harnesses.push(made);
  return made;
}

afterEach(async () => {
  while (harnesses.length > 0) await harnesses.pop()?.dispose();
});

/** The six channels this task added, with a payload that clears validation. */
const PANEL_CHANNELS: [string, unknown[]][] = [
  [INVOKE_CHANNELS.beachcomberScan, []],
  [INVOKE_CHANNELS.beachcomberPreview, [VALID_PANEL_PAYLOADS.preview]],
  [INVOKE_CHANNELS.beachcomberTrash, [VALID_PANEL_PAYLOADS.trash]],
  [INVOKE_CHANNELS.helmScopes, []],
  [INVOKE_CHANNELS.helmLoad, [VALID_PANEL_PAYLOADS.scopeId]],
  [INVOKE_CHANNELS.helmSave, [VALID_PANEL_PAYLOADS.save]],
];

// ---------------------------------------------------------------------------
// The happy path, and what actually reached the service
// ---------------------------------------------------------------------------

describe('the six panel channels reach their injected service', () => {
  it('answers { ok: true } on each of them', async () => {
    const h = harness();
    for (const [channel, args] of PANEL_CHANNELS) {
      const result = await h.invoke(channel, ...args);
      expect(result.ok, `${channel} did not succeed`).toBe(true);
    }
    expect(h.beachcomber.scanCount()).toBe(1);
    expect(h.helm.scopeCount()).toBe(1);
  });

  it('forwards the validated payload, and only the validated payload', async () => {
    const h = harness();
    await h.invoke(INVOKE_CHANNELS.beachcomberTrash, {
      scanId: FAKE_SCAN_ID,
      ids: ['entry-1', 'entry-2'],
      // A renderer that tried to smuggle a path alongside the ids. It must not
      // reach the service — not "the service ignores it", which is a promise
      // the service would have to keep forever.
      displayPath: 'C:\\Windows\\System32',
      cwd: '/etc',
    });
    expect(h.beachcomber.trashCalls).toEqual([
      { scanId: FAKE_SCAN_ID, ids: ['entry-1', 'entry-2'] },
    ]);
    expect(Object.keys(h.beachcomber.trashCalls[0] ?? {}).sort()).toEqual(['ids', 'scanId']);
  });

  it('forwards a helm save without any key the contract does not declare', async () => {
    const h = harness();
    await h.invoke(INVOKE_CHANNELS.helmSave, {
      ...VALID_PANEL_PAYLOADS.save,
      targetPath: 'C:\\Windows\\System32\\drivers\\etc\\hosts',
    });
    expect(Object.keys(h.helm.saveCalls[0] ?? {}).sort()).toEqual([
      'hooksJson',
      'managed',
      'revision',
      'scopeId',
      'unmanaged',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Criterion 5 — the no-paths rule, asserted rather than assumed
// ---------------------------------------------------------------------------

describe('no method on either namespace takes a bare path', () => {
  const PATH_SHAPED = [
    'C:\\Users\\someone\\.claude\\projects',
    '/home/someone/.claude/projects',
    '~/.claude/settings.json',
    '../../etc/passwd',
  ];

  it('refuses a bare path where preview and trash expect { scanId, ids }', () => {
    for (const path of PATH_SHAPED) {
      expect(() => requireBeachcomberPreviewRequest(path)).toThrow(IpcFailure);
      expect(() => requireBeachcomberTrashRequest(path)).toThrow(IpcFailure);
      // Nor as an id: an id is a token, but a validator cannot tell one string
      // from another — which is exactly why the SERVICE holds the id map and
      // answers NOT_FOUND. What is proved here is that no PATH-NAMED FIELD
      // exists for a caller to use.
      const rebuilt = requireBeachcomberTrashRequest({ scanId: 's', ids: [path] });
      expect(Object.keys(rebuilt).sort()).toEqual(['ids', 'scanId']);
    }
  });

  it('refuses a path-keyed payload where load and save expect a scopeId', () => {
    for (const path of PATH_SHAPED) {
      expect(() => requireHelmScopeId({ path })).toThrow(IpcFailure);
      expect(() => requireHelmSaveRequest({ ...VALID_PANEL_PAYLOADS.save, scopeId: undefined })).toThrow(
        IpcFailure,
      );
      const rebuilt = requireHelmSaveRequest({ ...VALID_PANEL_PAYLOADS.save, path });
      expect(Object.keys(rebuilt)).not.toContain('path');
    }
  });

  it('accepts a scopeId that is a string, because a scope id IS just a key', () => {
    expect(requireHelmScopeId('project:pod-1')).toBe('project:pod-1');
  });
});

// ---------------------------------------------------------------------------
// Criterion 9 — validation, shape-only
// ---------------------------------------------------------------------------

describe('renderer input to the panel channels is never trusted', () => {
  async function expectInvalid(channel: string, ...args: unknown[]): Promise<void> {
    const result = await harness().invoke(channel, ...args);
    expect(result.ok, `${channel} accepted ${JSON.stringify(args)}`).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_ARGUMENT' satisfies IpcErrorCode);
  }

  it('refuses a non-array ids', async () => {
    await expectInvalid(INVOKE_CHANNELS.beachcomberPreview, { scanId: 's', ids: 'entry-1' });
    await expectInvalid(INVOKE_CHANNELS.beachcomberTrash, { scanId: 's', ids: { 0: 'e' } });
  });

  it('refuses a non-string id inside ids', async () => {
    await expectInvalid(INVOKE_CHANNELS.beachcomberPreview, { scanId: 's', ids: ['a', 7] });
    await expectInvalid(INVOKE_CHANNELS.beachcomberTrash, { scanId: 's', ids: [null] });
  });

  it(`refuses more than ${MAX_BEACHCOMBER_IDS} ids`, async () => {
    const tooMany = Array.from({ length: MAX_BEACHCOMBER_IDS + 1 }, (_, i) => `entry-${i}`);
    await expectInvalid(INVOKE_CHANNELS.beachcomberPreview, { scanId: 's', ids: tooMany });
    await expectInvalid(INVOKE_CHANNELS.beachcomberTrash, { scanId: 's', ids: tooMany });
  });

  it(`accepts exactly ${MAX_BEACHCOMBER_IDS} ids, so the limit is a limit and not an off-by-one`, async () => {
    const atLimit = Array.from({ length: MAX_BEACHCOMBER_IDS }, (_, i) => `entry-${i}`);
    const result = await harness().invoke(INVOKE_CHANNELS.beachcomberPreview, {
      scanId: FAKE_SCAN_ID,
      ids: atLimit,
    });
    expect(result.ok).toBe(true);
  });

  it('refuses a missing scanId', async () => {
    await expectInvalid(INVOKE_CHANNELS.beachcomberPreview, { ids: ['entry-1'] });
    await expectInvalid(INVOKE_CHANNELS.beachcomberTrash, { ids: ['entry-1'] });
  });

  it('refuses a non-string scopeId', async () => {
    await expectInvalid(INVOKE_CHANNELS.helmLoad, 42);
    await expectInvalid(INVOKE_CHANNELS.helmLoad, null);
    await expectInvalid(INVOKE_CHANNELS.helmSave, { ...VALID_PANEL_PAYLOADS.save, scopeId: 7 });
  });

  /**
   * `hold` is UNVERIFIED against CLI 2.1.235, and the contract's answer is a
   * validation WARNING the user sees — not a refusal at the transport, which
   * would make Helm less capable than the text editor it replaces.
   */
  it('accepts crossSessionInbound: hold at the boundary', async () => {
    const result = await harness().invoke(INVOKE_CHANNELS.helmSave, {
      ...VALID_PANEL_PAYLOADS.save,
      managed: { ...VALID_PANEL_PAYLOADS.save.managed, crossSessionInbound: 'hold' },
    });
    expect(result.ok).toBe(true);
  });

  it('refuses a crossSessionInbound outside the contract union', async () => {
    await expectInvalid(INVOKE_CHANNELS.helmSave, {
      ...VALID_PANEL_PAYLOADS.save,
      managed: { ...VALID_PANEL_PAYLOADS.save.managed, crossSessionInbound: 'maybe' },
    });
  });

  /**
   * A file that will not parse is a `HelmValidationIssue` the form renders
   * against the field, not an INVALID_ARGUMENT that tells the user nothing
   * about where the brace went missing. The boundary checks the TYPE only.
   */
  it('passes unparseable hooksJson through, because parsing is not the boundary job', async () => {
    const h = harness();
    const result = await h.invoke(INVOKE_CHANNELS.helmSave, {
      ...VALID_PANEL_PAYLOADS.save,
      hooksJson: '{ this is not json',
    });
    expect(result.ok).toBe(true);
    expect(h.helm.saveCalls[0]?.hooksJson).toBe('{ this is not json');
  });
});

// ---------------------------------------------------------------------------
// Criteria 8 and 10 — the envelope, and error translation
// ---------------------------------------------------------------------------

describe('a panel service failure crosses as data, in this boundary vocabulary', () => {
  const failureClasses: { name: string; make: () => unknown }[] = [
    { name: 'a plain Error', make: () => new Error('the service exploded') },
    { name: 'a TypeError', make: () => new TypeError('cannot read x of undefined') },
    { name: 'a thrown string', make: () => 'not even an Error' },
    { name: 'a thrown null', make: () => null },
    { name: 'a thrown undefined', make: () => undefined },
  ];

  for (const { name, make } of failureClasses) {
    it(`answers { ok: false } on every panel channel when the service throws ${name}`, async () => {
      const h = harness();
      h.beachcomber.throwWith(make());
      h.helm.throwWith(make());

      for (const [channel, args] of PANEL_CHANNELS) {
        const result = await h.invoke(channel, ...args);
        expect(result.ok, `${channel} resolved ok, or rejected`).toBe(false);
        if (result.ok) continue;
        expect(result.error.code, `${channel} used an undocumented code`).toBe(
          'INTERNAL' satisfies IpcErrorCode,
        );
        expect(typeof result.error.message).toBe('string');
        expect(result.error.message.length).toBeGreaterThan(0);
      }
    });
  }

  /**
   * `IpcError.message` is the string the panel puts on screen. A stack frame
   * in it leaks main's directory layout to whoever is looking at the window,
   * and reads as a crash to the user. The stack belongs in `detail`, which
   * exists only in development builds.
   */
  it('puts no stack text in the message a panel will render', async () => {
    const h = harness();
    h.beachcomber.throwWith(new Error('EACCES: permission denied'));
    const result = await h.invoke(INVOKE_CHANNELS.beachcomberScan);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe('EACCES: permission denied');
    expect(result.error.message).not.toMatch(/\bat\s+\S+\s+\(/);
    expect(result.error.message).not.toContain('.ts:');
    expect(result.error.message).not.toContain('node_modules');
  });

  it('keeps the code a thrown IpcFailure chose', async () => {
    const cases: [IpcErrorCode, string, unknown[]][] = [
      ['NOT_FOUND', INVOKE_CHANNELS.beachcomberTrash, [VALID_PANEL_PAYLOADS.trash]],
      ['IO', INVOKE_CHANNELS.beachcomberScan, []],
      ['CONFLICT', INVOKE_CHANNELS.helmSave, [VALID_PANEL_PAYLOADS.save]],
      ['UNSUPPORTED', INVOKE_CHANNELS.helmLoad, [VALID_PANEL_PAYLOADS.scopeId]],
    ];

    for (const [code, channel, args] of cases) {
      const h = harness();
      const failure = new IpcFailure(code, `${code} from the service`);
      h.beachcomber.throwWith(failure);
      h.helm.throwWith(failure);

      const result = await h.invoke(channel, ...args);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error.code, `${channel} rewrote a deliberate ${code}`).toBe(code);
      expect(result.error.message).toBe(`${code} from the service`);
    }
  });

  it('never rejects, even when the service rejects rather than throws', async () => {
    const h = harness();
    const rejecting = {
      scan: () => Promise.reject(new Error('async boom')),
      preview: () => Promise.reject(new Error('async boom')),
      trash: () => Promise.reject(new Error('async boom')),
    };
    Object.assign(h.beachcomber, rejecting);

    for (const [channel, args] of PANEL_CHANNELS.slice(0, 3)) {
      const settled = await h.invoke(channel, ...args);
      expect(settled).toHaveProperty('ok', false);
    }
  });
});

// ---------------------------------------------------------------------------
// Arming the Helm watcher
// ---------------------------------------------------------------------------

/**
 * THE REGRESSION THESE PIN. `HelmService.watch` is the only path that starts
 * the `fs.watch` behind `HelmChangedPush`, and for the whole life of the
 * feature nothing in the application called it: no `helmWatch` channel exists,
 * and neither `load` nor `save` arms it. The watcher was therefore dead code
 * in the shipped app — the "This file changed on disk" notice could never
 * render, and `save`'s `acknowledgeOwnWrite` guarded a push path that never
 * ran. It survived because every watcher test calls `watch` itself, so the
 * method was thoroughly covered in isolation while the question "does anything
 * call it" went unasked.
 *
 * These tests ask that question. They assert on the CALL, not on the watcher's
 * behaviour, which is `tests/unit/helm/watcher.test.ts`'s job.
 */
describe('loading a scope arms the watcher for it', () => {
  it('arms the watcher with the scope that was loaded', async () => {
    const h = harness();
    const result = await h.invoke(INVOKE_CHANNELS.helmLoad, VALID_PANEL_PAYLOADS.scopeId);

    expect(result.ok).toBe(true);
    expect(h.helm.loadCalls).toEqual([VALID_PANEL_PAYLOADS.scopeId]);
    expect(h.helm.watchCalls).toEqual([VALID_PANEL_PAYLOADS.scopeId]);
  });

  it('re-arms on every load, so a scope switch follows the form', async () => {
    const h = harness();
    await h.invoke(INVOKE_CHANNELS.helmLoad, 'user');
    await h.invoke(INVOKE_CHANNELS.helmLoad, 'project:pod-1');
    await h.invoke(INVOKE_CHANNELS.helmLoad, 'user');

    // `HelmWatcher` holds at most one watch and releases the previous one, so
    // re-arming is how the watch follows the scope rather than accumulating.
    expect(h.helm.watchCalls).toEqual(['user', 'project:pod-1', 'user']);
  });

  it('does not arm when the load itself failed', async () => {
    const h = harness();
    h.helm.throwWith(new IpcFailure('IO', 'EACCES: permission denied'));

    const result = await h.invoke(INVOKE_CHANNELS.helmLoad, VALID_PANEL_PAYLOADS.scopeId);

    expect(result.ok).toBe(false);
    expect(h.helm.loadCalls).toEqual([VALID_PANEL_PAYLOADS.scopeId]);
    expect(h.helm.watchCalls).toEqual([]);
  });

  it('does not arm when the scopeId never cleared validation', async () => {
    const h = harness();
    const result = await h.invoke(INVOKE_CHANNELS.helmLoad, { not: 'a scope id' });

    expect(result.ok).toBe(false);
    expect(h.helm.watchCalls).toEqual([]);
  });

  /**
   * The watch is advisory and the frozen contract says it is NEVER A GUARD.
   * `watch` resolves the scope again and re-reads the file to seed its hash,
   * and `readSnapshot` rethrows anything that is not ENOENT — so an
   * unreadable-but-present settings file must not turn a load the user can see
   * succeed into a failed invoke.
   */
  it('still answers the load when arming the watcher throws', async () => {
    const h = harness();
    h.helm.failWatchWith(new IpcFailure('IO', 'EISDIR: illegal operation on a directory'));

    const result = await h.invoke(INVOKE_CHANNELS.helmLoad, VALID_PANEL_PAYLOADS.scopeId);

    expect(result.ok, 'an advisory watch failure must not fail the load').toBe(true);
    expect(h.helm.watchCalls).toEqual([VALID_PANEL_PAYLOADS.scopeId]);
  });

  it('answers the load even when arming throws something that is not an Error', async () => {
    const h = harness();
    h.helm.failWatchWith('a bare string, as fs can produce');

    const result = await h.invoke(INVOKE_CHANNELS.helmLoad, VALID_PANEL_PAYLOADS.scopeId);

    expect(result.ok).toBe(true);
    // Asserted so this test cannot pass vacuously: without the arming call it
    // would be green for the wrong reason, since nothing would ever throw.
    expect(h.helm.watchCalls).toEqual([VALID_PANEL_PAYLOADS.scopeId]);
  });
});
