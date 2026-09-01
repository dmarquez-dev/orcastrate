/**
 * The one component in this directory that calls the hooks.
 *
 * T9's shell renders `<ConnectedHelmPanel />` into the panel region and needs
 * to know nothing about `HelmView`; every other component here takes data and
 * callbacks and can be rendered in a test with no provider at all. Keeping the
 * two hook calls in a file that does nothing else is what makes that true.
 *
 * `useHelm` is what tells the state layer the panel is open — the scope list
 * is fetched from ITS mount effect, not from a render here.
 *
 * IT ALSO REGISTERS THE CLOSE GUARD, because this is the component the shell
 * mounts and therefore the one that lives under the shell's provider. The
 * guard and the dialog it raises are `HelmCloseGuard`'s; all this file does is
 * hand it the one fact it needs. `HelmPanel` stays renderable in a test with
 * no provider at all, which is the whole reason the registration is here and
 * not in it.
 */

import type { JSX } from 'react';

import { useHelm, useHelmActions } from '../state';

import { HelmCloseGuard } from './HelmCloseGuard';
import { HelmPanel } from './HelmPanel';

export function ConnectedHelmPanel(): JSX.Element {
  const view = useHelm();
  const actions = useHelmActions();
  return (
    <>
      <HelmPanel actions={actions} view={view} />
      <HelmCloseGuard dirty={view.dirty} />
    </>
  );
}
