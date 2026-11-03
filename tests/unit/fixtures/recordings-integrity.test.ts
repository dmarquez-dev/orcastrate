/**
 * RECORDINGS ARE EVIDENCE, AND EVIDENCE DOES NOT DRIFT.
 *
 * Every `.ndjson` recording under `tests/fixtures/protocol` and `probe/evidence`
 * is pinned here to the SHA-256 of its content, so an edit to one is caught here
 * whether or not any suite replays it.
 *
 * The hash is taken over the file's BYTES with each CR LF pair replaced by a
 * lone LF. That makes it the hash of the LF blob git stores, so it holds in an
 * `autocrlf=true` checkout (which writes CRLF) and an `autocrlf=false` one
 * alike; each pinned value can be recomputed as
 * `git show <commit>:<path> | sha256sum`. The replacement works on bytes, not
 * on a decoded string, because a recording's fidelity can include bytes that a
 * UTF-8 decode would replace.
 *
 * A failure here means a recording's content changed, or a recording was added
 * or removed without this table being told. Re-recording is a deliberate act:
 * update the table in the same change and say why.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/** The checkout this file lives in, never the runner's working directory. */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** The directories recordings live under, repo-relative. */
const RECORDING_ROOTS = ['tests/fixtures/protocol', 'probe/evidence'] as const;

/**
 * Repo-relative path to the SHA-256 of its CRLF-normalised bytes. Each value is
 * `git show ce1cd36:<path> | sha256sum`.
 */
const RECORDING_SHA256: Readonly<Record<string, string>> = {
  'probe/evidence/foreground-control-none.ndjson':
    '61c5e896efe1609c74708d381422927a7c0fb62766cb1bea6306a0851762dd2d',
  'probe/evidence/foreground-directive-only.ndjson':
    '6d19909417d30b0f32a065fcc85a82b27fcc9df587f4c82803a480dddea2a9b1',
  'probe/evidence/foreground-hook-only.ndjson':
    'b7448904426edb9445465f9b48f9bf6566499b7af95bb55332982d83591f8a15',
  'probe/evidence/foreground-shipped.ndjson':
    'addd42664da44e9dc30c9b5d8567318cee486bd579b232bf270f91437819536d',
  'tests/fixtures/protocol/01-parallel-dispatch.ndjson':
    '48ab73e73fda487a73fa0a4811c9d1c00e12891139ec56664f317120796be1ef',
  'tests/fixtures/protocol/02-nested-dispatch.ndjson':
    '645d4244812a44ccb2e1cc6a294cb8ff4feacd29793e491857eac2635a300dea',
  'tests/fixtures/protocol/03-tool-result-close.ndjson':
    '14ec3ab47a8a3cd43e3212e246340d8f04e5b399f4cf2258c44592e3cc591716',
  'tests/fixtures/protocol/04-orphaned-calf.ndjson':
    'cba7c6a0052c9ce5359b69e0925379374fa5add106df5bc39bb28144142dcc88',
  'tests/fixtures/protocol/05-malformed.ndjson':
    'a5d61ddda0e0401c332c16f922a7459848167931ff83686127df88fd21c64c1e',
  'tests/fixtures/protocol/06-permission-prompt.ndjson':
    '2788fca443a776670ec7f495fae351bce1e7cc4c1edf24c5216680cfa4f442e3',
};

/** Every `*.ndjson` file beneath `relativeDir`, as sorted repo-relative paths. */
function recordingsUnder(relativeDir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(REPO_ROOT, relativeDir), { withFileTypes: true })) {
    const relative = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) found.push(...recordingsUnder(relative));
    else if (entry.isFile() && entry.name.endsWith('.ndjson')) found.push(relative);
  }
  return found;
}

const DERIVED_RECORDINGS: readonly string[] = RECORDING_ROOTS.flatMap(recordingsUnder).sort();

/** `bytes` with every 0x0D 0x0A pair replaced by 0x0A. A lone 0x0D is kept. */
function normaliseCrlf(bytes: Uint8Array): Buffer {
  const out = Buffer.alloc(bytes.length);
  let length = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x0d && bytes[i + 1] === 0x0a) continue;
    out[length++] = bytes[i] as number;
  }
  return out.subarray(0, length);
}

function recordingSha256(relativePath: string): string {
  const bytes = readFileSync(join(REPO_ROOT, relativePath));
  return createHash('sha256').update(normaliseCrlf(bytes)).digest('hex');
}

describe('the recording census', () => {
  it('finds exactly the recordings the table pins, so an added or deleted recording fails', () => {
    expect(DERIVED_RECORDINGS).toEqual(Object.keys(RECORDING_SHA256).sort());
  });

  it('counts an .ndjson recording and not the .json files that sit beside the recordings', () => {
    expect(DERIVED_RECORDINGS).toContain('tests/fixtures/protocol/05-malformed.ndjson');
    expect(DERIVED_RECORDINGS).not.toContain('tests/fixtures/protocol/findings.json');
    expect(DERIVED_RECORDINGS).not.toContain('probe/evidence/foreground-analysis.json');
  });
});

describe('the CRLF normalisation the hashes are taken over', () => {
  it('replaces each CR LF pair with LF on raw bytes, keeping lone CRs and non-UTF-8 bytes', () => {
    const input = Uint8Array.from([0x61, 0x0d, 0x0a, 0xff, 0x0d, 0x62, 0x0d, 0x0d, 0x0a]);
    expect([...normaliseCrlf(input)]).toEqual([0x61, 0x0a, 0xff, 0x0d, 0x62, 0x0d, 0x0a]);
  });
});

describe('every recording matches its pinned content hash', () => {
  it.each(Object.entries(RECORDING_SHA256))('%s', (relativePath, expected) => {
    expect(recordingSha256(relativePath), `${relativePath} content changed`).toBe(expected);
  });
});
