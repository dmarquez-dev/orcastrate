/**
 * The shared fork-eligibility rule: one implementation, read by main (which
 * answers CONFLICT from it) and by the renderer (which disables the Fork
 * control from it).
 *
 * COVERAGE OF THE STATUS SET. Every member of `POD_STATUSES`
 * (`src/main/store/schema.ts`) is driven twice, once with a `ccSessionId` and
 * once without, so all ten combinations are pinned. The eleventh and twelfth
 * cases are statuses outside that set, which is what "fails closed" is about.
 */

import { describe, expect, it } from 'vitest';

import type { PodStatus } from '../../../src/shared/contracts/events';
import { POD_STATUSES } from '../../../src/main/store/schema';
import { forkEligibility, type ForkEligibility } from '../../../src/shared/fork-eligibility';

const RESTING = ['closed', 'idle', 'beached'] as const satisfies readonly PodStatus[];
const MID_TURN = ['running', 'waiting'] as const satisfies readonly PodStatus[];

describe('forkEligibility', () => {
  it('partitions exactly the statuses the schema head admits, so no member is untested', () => {
    expect([...RESTING, ...MID_TURN].sort()).toEqual([...POD_STATUSES].sort());
  });

  it.each(RESTING)("answers 'eligible' for a %s Pod that has a ccSessionId", (status) => {
    expect(forkEligibility({ status, ccSessionId: 'cc-1' })).toBe<ForkEligibility>('eligible');
  });

  it.each(MID_TURN)("answers 'mid-turn' for a %s Pod that has a ccSessionId", (status) => {
    expect(forkEligibility({ status, ccSessionId: 'cc-1' })).toBe<ForkEligibility>('mid-turn');
  });

  it.each(MID_TURN)(
    "answers 'mid-turn', not 'no-session', for a %s Pod with a null ccSessionId",
    (status) => {
      expect(forkEligibility({ status, ccSessionId: null })).toBe<ForkEligibility>('mid-turn');
    },
  );

  it.each(RESTING)("answers 'no-session' for a %s Pod with a null ccSessionId", (status) => {
    expect(forkEligibility({ status, ccSessionId: null })).toBe<ForkEligibility>('no-session');
  });

  it.each(['archived', ''])(
    "fails closed: a status outside POD_STATUSES (%j) reads as 'mid-turn', never 'eligible'",
    (unknownStatus) => {
      expect(POD_STATUSES as readonly string[]).not.toContain(unknownStatus);
      const pod = { status: unknownStatus as PodStatus, ccSessionId: 'cc-1' };
      expect(forkEligibility(pod)).toBe<ForkEligibility>('mid-turn');
    },
  );
});
