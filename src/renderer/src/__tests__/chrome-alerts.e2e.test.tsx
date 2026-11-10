// @vitest-environment jsdom
/**
 * The two Pod-bar alerts that are not the fork error: the open error (a run
 * control whose `pods.open` main refused) and the pods error (a `pods.list`
 * that failed). Both are bounded to the Pod-bar row the way the fork error is
 * (`PodsChrome.module.css`), so the visible text can be clamped, and these
 * tests pin what that bound must not cost:
 *
 * - the whole message is still available, as the alert's `title`;
 * - the hooks the hand-run driver reads are kept: `role="alert"`, a
 *   `textContent` that is exactly main's message, carried as the element's
 *   FIRST child, a `Text` node (the driver builds a `Range` over it);
 * - the alert sits inside a wrapper that is a child of `pods-chrome`, as the
 *   fork-error alert sits inside its row, not directly in the `.chrome` row.
 *
 * jsdom has no layout, so the bound itself is asserted as stylesheet text in
 * `../pods/chrome-alert-layout.styles.test.ts`.
 */

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { testId } from '../shell/contract-runtime';
import { PODS_CHROME_TEST_ID } from '../pods/PodsChrome';
import styles from '../pods/PodsChrome.module.css';
import { POD_TAB_OPEN_TEST_ID } from '../pods/PodTab';
import { ipcError, stubOrcastrateApi } from '../test-utils';

import {
  ALPHA_ID,
  POD_ALPHA,
  flushPendingWork,
  installUnhandledRejectionGuard,
  mountWorkspace,
} from './harness';

installUnhandledRejectionGuard();

const OPEN_MESSAGE = 'cwd is not accessible: C:\\gone\\somewhere\\that\\no\\longer\\exists';
const LIST_MESSAGE = 'the Pod list could not be read from the database file';

/** Mounts the workspace with `pods.open` refused, clicks Alpha's run control, and returns the alert. */
async function showOpenError(): Promise<HTMLElement> {
  const user = userEvent.setup();
  const api = stubOrcastrateApi({
    pods: { list: async () => ({ ok: true, value: [POD_ALPHA] }) },
  });
  api.failInvoke('podOpen', ipcError('CWD_MISSING', OPEN_MESSAGE));

  mountWorkspace(api);

  await user.click(await screen.findByTestId(testId(POD_TAB_OPEN_TEST_ID, ALPHA_ID)));
  await flushPendingWork();

  return screen.findByRole('alert');
}

/** Mounts the workspace with `pods.list` refused and returns the alert. */
async function showListError(): Promise<HTMLElement> {
  const api = stubOrcastrateApi();
  api.failInvoke('podList', ipcError('IO', LIST_MESSAGE));

  mountWorkspace(api);
  await flushPendingWork();

  return screen.findByRole('alert');
}

function expectDriverHooks(alert: HTMLElement, message: string): void {
  expect(screen.getAllByRole('alert')).toHaveLength(1);
  expect(alert.getAttribute('role')).toBe('alert');
  expect(alert.textContent).toBe(message);
  const first = alert.firstChild;
  expect(first).toBeInstanceOf(Text);
  expect(first instanceof Text ? first.data : null).toBe(message);
}

function expectWrappedInChromeChild(alert: HTMLElement): void {
  const chrome = screen.getByTestId(PODS_CHROME_TEST_ID);
  const wrapper = alert.parentElement;
  expect(wrapper).not.toBe(chrome);
  expect(wrapper?.parentElement).toBe(chrome);
  // The classes the stylesheet test reads the bound from: the wrapper is
  // `.alertRow` and the alert is `.listError`, so `.alertRow > .listError`
  // is the rule that clamps it.
  expect(styles.alertRow).toBeTruthy();
  expect(wrapper?.className).toBe(styles.alertRow);
  expect(alert.className).toBe(styles.listError);
}

describe('the open-error alert', () => {
  it('carries the whole message as its title', async () => {
    const alert = await showOpenError();
    expect(alert.getAttribute('title')).toBe(OPEN_MESSAGE);
  });

  it('keeps the hooks the hand-run driver reads', async () => {
    expectDriverHooks(await showOpenError(), OPEN_MESSAGE);
  });

  it('sits inside a wrapper that is a child of pods-chrome', async () => {
    expectWrappedInChromeChild(await showOpenError());
  });
});

describe('the pods-error alert', () => {
  it('carries the whole message as its title', async () => {
    const alert = await showListError();
    expect(alert.getAttribute('title')).toBe(LIST_MESSAGE);
  });

  it('keeps the hooks the hand-run driver reads', async () => {
    expectDriverHooks(await showListError(), LIST_MESSAGE);
  });

  it('sits inside a wrapper that is a child of pods-chrome', async () => {
    expectWrappedInChromeChild(await showListError());
  });
});
