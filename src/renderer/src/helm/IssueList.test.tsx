// @vitest-environment jsdom
/**
 * `IssueList`, asserted on what is on screen. Every issue blocks the save, so
 * every item says "Error" in words beside its message — colour is never the
 * only carrier of meaning.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { HelmValidationIssue } from '@shared/contracts/helm';

import { COPY } from './copy';
import { IssueList } from './IssueList';

describe('IssueList', () => {
  it('prints the severity word beside each issue message', () => {
    const issues: HelmValidationIssue[] = [
      { field: 'model', severity: 'error', message: 'The model name is empty.' },
      { field: 'env', severity: 'error', message: 'An env key repeats.' },
    ];
    render(<IssueList id="issues-under-test" issues={issues} testId="issue-list" />);

    const items = screen.getByTestId('issue-list').querySelectorAll('li');
    expect(items).toHaveLength(issues.length);
    issues.forEach((issue, index) => {
      const item = items[index];
      if (item === undefined) throw new Error(`no list item at index ${String(index)}`);
      expect(item.textContent).toContain(COPY.severityError);
      expect(item.textContent).toContain(issue.message);
    });
  });

  it('renders nothing when there are no issues', () => {
    const { container } = render(<IssueList id="issues-under-test" issues={[]} />);

    expect(container.childElementCount).toBe(0);
  });
});
