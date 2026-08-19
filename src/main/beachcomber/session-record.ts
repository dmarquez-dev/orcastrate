/**
 * The authoritative source of a `projects/<dir>` entry's true working
 * directory: the first `cwd`-bearing record in one of its session `.jsonl`
 * files.
 *
 * WHY STREAMING AND NOT `readFile`. A session transcript is an append-only
 * JSONL log that routinely reaches tens of megabytes. The field we need is on
 * the first record. Reading the file whole to find it would cost the panel a
 * multi-second stall and a matching spike in resident memory for every project
 * on the machine, on every scan. So the reader pulls fixed-size chunks and
 * stops at the first record that answers, and reports `bytesRead` so a test can
 * assert that it stopped rather than take the claim on trust.
 */

import { open, readdir } from 'node:fs/promises';
import { StringDecoder } from 'node:string_decoder';

/** Bytes pulled per read. One record is far smaller than this in practice. */
export const CHUNK_BYTES = 64 * 1024;

/**
 * Give-up threshold. A transcript whose first 4 MiB carries no `cwd` is treated
 * as having none, which downgrades the entry to `pathSource: 'decoded-name'`.
 * That is the SAFE direction: a decoded-name entry can never be reported as an
 * orphan, so the worst outcome is a row labelled as a guess.
 */
export const MAX_SCAN_BYTES = 4 * 1024 * 1024;

export interface FirstCwdResult {
  /** The recorded working directory VERBATIM, or `null` if no record carried one. */
  cwd: string | null;
  /** How much of the file was actually pulled off disk. */
  bytesRead: number;
}

function cwdOfLine(line: string): string | null {
  const text = line.trim();
  if (text.length === 0 || text.charCodeAt(0) !== 123 /* '{' */) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // A truncated or non-JSON line is normal in an append-only log that may
    // have been cut short by a crash. Skip it and keep looking.
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const value = (parsed as Record<string, unknown>)['cwd'];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Reads `filePath` in chunks and returns the FIRST record carrying a `cwd`.
 *
 * Stops at that record. Later records in the same transcript may carry a
 * different `cwd` — a session resumed from elsewhere — and they are not the
 * directory this state belongs to.
 */
export async function readFirstCwd(
  filePath: string,
  options: { chunkBytes?: number; maxBytes?: number } = {},
): Promise<FirstCwdResult> {
  const chunkBytes = options.chunkBytes ?? CHUNK_BYTES;
  const maxBytes = options.maxBytes ?? MAX_SCAN_BYTES;

  let handle;
  try {
    handle = await open(filePath, 'r');
  } catch {
    // An entry whose transcript cannot be opened simply has no recorded cwd.
    // Refusing the whole scan over one unreadable file would cost the user the
    // panel; the entry degrades to a labelled guess instead.
    return { cwd: null, bytesRead: 0 };
  }

  const decoder = new StringDecoder('utf8');
  const buffer = Buffer.allocUnsafe(chunkBytes);
  let pending = '';
  let bytesRead = 0;

  try {
    while (bytesRead < maxBytes) {
      const result = await handle.read(buffer, 0, chunkBytes, bytesRead);
      if (result.bytesRead === 0) break;
      bytesRead += result.bytesRead;
      pending += decoder.write(buffer.subarray(0, result.bytesRead));

      let newline = pending.indexOf('\n');
      while (newline !== -1) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        const cwd = cwdOfLine(line);
        if (cwd !== null) return { cwd, bytesRead };
        newline = pending.indexOf('\n');
      }
    }
    // A final record with no trailing newline still counts.
    pending += decoder.end();
    const cwd = cwdOfLine(pending);
    return { cwd, bytesRead };
  } finally {
    await handle.close();
  }
}

/** The `*.jsonl` file names directly inside `dirPath`, sorted for determinism. */
export async function sessionFileNames(dirPath: string): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(dirPath);
  } catch {
    // The caller has already classified this directory; an unreadable one
    // yields no sessions rather than aborting the scan.
    return [];
  }
  return names.filter((name) => name.toLowerCase().endsWith('.jsonl')).sort();
}
