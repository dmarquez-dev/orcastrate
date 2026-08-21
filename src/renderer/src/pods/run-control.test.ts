import { describe, expect, it } from 'vitest';

import type { PodStatus } from '@shared/contracts/events';
import { BEACHED_CAUSE, runControlFor } from './run-control';

/** Every status the union carries, so no branch is decided by omission. */
const EVERY_STATUS: PodStatus[] = ['idle', 'running', 'waiting', 'beached', 'closed'];

describe('runControlFor', () => {
  it('sends a beached Pod to reconnect, with the cause in its name', () => {
    expect(runControlFor('beached', 'Alpha')).toEqual({
      label: 'Reconnect',
      accessibleName: 'Reconnect Alpha, stopped with an error',
      verb: 'reconnect',
    });
  });

  it('sends every other status to open, with a name that carries no cause', () => {
    for (const status of EVERY_STATUS.filter((candidate) => candidate !== 'beached')) {
      expect(runControlFor(status, 'Alpha')).toEqual({
        label: 'Open',
        accessibleName: 'Open Alpha',
        verb: 'open',
      });
    }
  });

  it('decides on status alone — the title only ever appears in the name', () => {
    const first = runControlFor('closed', 'Alpha');
    const second = runControlFor('closed', 'Bravo');
    expect(first.verb).toBe(second.verb);
    expect(first.label).toBe(second.label);
    expect(first.accessibleName).not.toBe(second.accessibleName);
    expect(second.accessibleName).toContain('Bravo');
  });

  it('appends the cause clause rather than restating the sentence', () => {
    // Asserts the JOIN. The literal is spelled out once, above, so this is not
    // a constant checked against itself.
    expect(runControlFor('beached', 'Bravo').accessibleName).toBe(`Reconnect Bravo${BEACHED_CAUSE}`);
    expect(BEACHED_CAUSE).toBe(', stopped with an error');
    // The closed name must NOT pick the clause up.
    expect(runControlFor('closed', 'Bravo').accessibleName).not.toContain(BEACHED_CAUSE);
  });
});
