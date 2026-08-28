import { describe, expect, it } from 'vitest';

import { POD_STATUS_LABEL } from './pod-status';

/**
 * The status word each `PodStatus` puts on screen, RE-TYPED here on purpose.
 * A test that derived its expectation from the map under test would pass while
 * the map went blank or drifted, which is the one thing this suite exists to
 * stop: two surfaces — the Pod tab and the Matriarch lane row — now read these
 * five strings, so a silent reword would desynchronise both at once.
 */
const EXPECTED = {
  idle: 'Idle',
  running: 'Running',
  waiting: 'Waiting on you',
  beached: 'Beached, process stopped',
  closed: 'Closed',
} as const;

describe('POD_STATUS_LABEL', () => {
  it.each(Object.entries(EXPECTED))('labels %s as "%s"', (status, word) => {
    expect(POD_STATUS_LABEL[status as keyof typeof EXPECTED]).toBe(word);
  });

  /**
   * `PodStatus` has five members. The count is asserted separately from the
   * five lookups above because a lookup only proves a key is PRESENT: a sixth
   * key smuggled into the map would leave every assertion above green while
   * putting a word on screen that nothing here reviewed.
   */
  it('carries exactly the five members of PodStatus and no sixth', () => {
    expect(Object.keys(POD_STATUS_LABEL)).toHaveLength(5);
    expect(Object.keys(POD_STATUS_LABEL).sort()).toEqual(Object.keys(EXPECTED).sort());
  });
});
