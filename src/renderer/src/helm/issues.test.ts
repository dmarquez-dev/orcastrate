/**
 * The partition that keeps `blocked: true` from ever meaning a dead Save
 * button with nothing to read.
 *
 * `HelmValidationIssue.field` is typed `string`; the doc comment at
 * `helm.ts:208` lists five names, and the state layer already emits two more.
 * The point of these tests is the OPEN case — a field nobody has thought of
 * yet still has to reach the screen.
 */

import { describe, expect, it } from 'vitest';

import type { HelmValidationIssue } from '@shared/contracts/helm';

import { issuesFor, unplacedIssues } from './issues';

function issue(field: string, message = `about ${field}`): HelmValidationIssue {
  return { field, severity: 'error', message };
}

describe('issue placement', () => {
  it('hands a control only its own issues', () => {
    // The two `model` issues differ by message, so handing back the first one
    // twice cannot pass for handing back both.
    const issues = [issue('model'), issue('env'), issue('model', 'a second note about model')];
    expect(issuesFor(issues, 'model')).toEqual([issues[0], issues[2]]);
    expect(issuesFor(issues, 'hooksJson')).toEqual([]);
  });

  it('leaves nothing unrendered when a field is one no control claims', () => {
    const stranger = issue('somethingNobodyPlanned');
    expect(unplacedIssues([issue('model'), stranger], false)).toEqual([stranger]);
  });

  it('places permissionsDeny, which the contract doc comment does not list', () => {
    expect(unplacedIssues([issue('permissionsDeny')], false)).toEqual([]);
  });

  it('surfaces parseError when no read-only banner is showing it', () => {
    const parse = issue('parseError');
    expect(unplacedIssues([parse], false)).toEqual([parse]);
  });

  it('stays quiet about parseError once the read-only banner has it', () => {
    expect(unplacedIssues([issue('parseError')], true)).toEqual([]);
  });
});
