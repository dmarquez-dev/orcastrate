/**
 * The renderer component-test harness. One import for every renderer suite.
 *
 *   // @vitest-environment jsdom
 *   import { renderWithWorkspace, stubOrcastrateApi, ipcError } from '../test-utils';
 *
 * The jsdom docblock is required per file — `vitest.config.ts` defaults to the
 * `node` environment deliberately and must not be changed.
 */

export {
  renderWithWorkspace,
  type RenderWithWorkspaceOptions,
  type RenderWithWorkspaceResult,
} from './render';

export {
  stubOrcastrateApi,
  makeStubPod,
  makeStubLane,
  makeStubBeachcomberEntries,
  makeStubBeachcomberScan,
  makeStubBeachcomberPreview,
  makeStubHelmScopes,
  makeStubHelmDocument,
  ipcError,
  expectOk,
  INVOKE_CHANNEL_METHODS,
  EVENT_CHANNEL_METHODS,
  type StubOrcastrateApi,
  type StubApiOverrides,
  type StubEmitters,
  type InvokeChannelKey,
  type EventChannelKey,
} from './stub-api';

export {
  registerWorkspaceProvider,
  resetWorkspaceProvider,
  getWorkspaceProvider,
  resolveWorkspaceProvider,
  type WorkspaceProviderComponent,
} from './workspace-provider-seam';
