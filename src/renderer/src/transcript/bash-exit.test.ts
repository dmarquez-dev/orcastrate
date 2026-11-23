/**
 * The Bash non-zero-exit recogniser. Each negative below meets every clause
 * but ONE, so a recogniser that dropped that clause is caught by that case and
 * no other. Each is paired with the positives above it, which meet all three:
 * a recogniser that returned `null` for everything passes every negative.
 */
import { describe, expect, it } from 'vitest';

import type { ToolResultPayload } from '@shared/contracts/events';

import { bashExitCode } from './bash-exit';

function result(content: unknown, isError = true): ToolResultPayload {
  return { type: 'tool_result', toolUseId: 'toolu_a', isError, content };
}

describe('bashExitCode recognises a Bash non-zero exit', () => {
  it('reads N from string content', () => {
    expect(bashExitCode(result('Exit code 1\nC:/tmp/out/'), 'Bash')).toBe(1);
  });

  it('reads N from a text-block array', () => {
    const content = [{ type: 'text', text: 'Exit code 2\n/usr/bin/bash: -c: line 38: unexpected EOF' }];
    expect(bashExitCode(result(content), 'Bash')).toBe(2);
  });

  it('accepts a CRLF line ending and a bare line with no output', () => {
    expect(bashExitCode(result('Exit code 3\r\nout'), 'Bash')).toBe(3);
    expect(bashExitCode(result('Exit code 127'), 'Bash')).toBe(127);
  });
});

describe('bashExitCode returns null when exactly one clause fails', () => {
  it('(a) isError is false', () => {
    expect(bashExitCode(result('Exit code 1\nC:/tmp/out/', false), 'Bash')).toBeNull();
  });

  it('(b) the tool is not Bash', () => {
    expect(bashExitCode(result('Exit code 1\nC:/tmp/out/'), 'Read')).toBeNull();
    expect(bashExitCode(result('Exit code 1\nC:/tmp/out/'), 'bash')).toBeNull();
  });

  it('(b) the tool name is unknown', () => {
    expect(bashExitCode(result('Exit code 1\nC:/tmp/out/'), undefined)).toBeNull();
  });

  it('(c) the exit code is 0: Exit code 0', () => {
    expect(bashExitCode(result('Exit code 0\n'), 'Bash')).toBeNull();
  });

  it('(c) the text does not start with an Exit code line', () => {
    expect(bashExitCode(result('Error: permission denied'), 'Bash')).toBeNull();
    expect(bashExitCode(result(' Exit code 1\n'), 'Bash')).toBeNull();
    expect(bashExitCode(result('Exit code 1x\n'), 'Bash')).toBeNull();
    expect(bashExitCode(result('Exit code \n'), 'Bash')).toBeNull();
  });

  it('(c) the array\'s first element is not a text block with string text', () => {
    expect(bashExitCode(result([]), 'Bash')).toBeNull();
    expect(bashExitCode(result([null]), 'Bash')).toBeNull();
    expect(bashExitCode(result(['Exit code 1\n']), 'Bash')).toBeNull();
    expect(bashExitCode(result([{ type: 'image', text: 'Exit code 1\n' }]), 'Bash')).toBeNull();
    expect(bashExitCode(result([{ type: 'text', text: 1 }]), 'Bash')).toBeNull();
    expect(
      bashExitCode(result([{ type: 'image' }, { type: 'text', text: 'Exit code 1\n' }]), 'Bash'),
    ).toBeNull();
  });

  it('(c) content is neither a string nor an array', () => {
    expect(bashExitCode(result({ text: 'Exit code 1\n' }), 'Bash')).toBeNull();
    expect(bashExitCode(result(null), 'Bash')).toBeNull();
  });
});
