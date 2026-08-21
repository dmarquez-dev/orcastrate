/**
 * The claim a code review makes once and then stops making, made durable.
 *
 * Three scans live here:
 *   - over `src/main/beachcomber/**` — the module reaches no filesystem
 *     mutation call and imports neither Electron nor the Pod manager, so the
 *     only capability that can make something disappear is the injected port.
 *   - over `src/main/pod-session/**` — the SAME scan, widened when Pod deletion
 *     grew the ability to bin a session file. That directory is the second
 *     place in the application that reaches the trash capability, so it is the
 *     second place the "there is no other deletion primitive" claim has to be
 *     made durable rather than reviewed once.
 *   - over `tests/unit/beachcomber/**` — no test touches the developer's own
 *     machine or is handed the real trash function.
 *
 * THE WIDENED SCAN HAS BEEN WATCHED TO FAIL. A `node:fs` deletion import was
 * temporarily added to `src/main/pod-session/` and this file reported it before
 * the import was reverted. A scan that has never been seen to fail proves
 * nothing.
 *
 * The needles below are assembled from fragments on purpose. A scan whose own
 * source contains the token it forbids would either fail against itself or have
 * to exempt itself, and an exemption is the hole the scan exists to close.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createBeachcomberService } from '../../../src/main/beachcomber';
import { createPodSessionRemover } from '../../../src/main/pod-session';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SERVICE_DIR = fileURLToPath(new URL('../../../src/main/beachcomber/', import.meta.url));
const POD_SESSION_DIR = fileURLToPath(
  new URL('../../../src/main/pod-session/', import.meta.url),
);

interface SourceFile {
  name: string;
  text: string;
}

function readTree(dir: string): SourceFile[] {
  const files: SourceFile[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...readTree(full));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      files.push({ name: entry.name, text: readFileSync(full, 'utf8') });
    }
  }
  return files;
}

const serviceFiles = readTree(SERVICE_DIR);
const podSessionFiles = readTree(POD_SESSION_DIR);
const testFiles = readTree(HERE);

/** Assembled, never spelled, so this file passes its own scan. */
const DESTRUCTIVE = [
  'r' + 'm(',
  'r' + 'mSync',
  'un' + 'link',
  'un' + 'linkSync',
  'r' + 'mdir',
  'r' + 'mdirSync',
  'force' + ': true',
  // The shell form, spelled with its leading dash so the substring cannot
  // match `interface` or `surface` in an ordinary sentence.
  '-r' + 'f',
];

describe('the Beachcomber module holds no deletion primitive', () => {
  it('has source files to scan at all', () => {
    expect(serviceFiles.length).toBeGreaterThan(0);
    expect(testFiles.length).toBeGreaterThan(0);
  });

  it('contains no filesystem mutation call anywhere under src/main/beachcomber', () => {
    for (const file of serviceFiles) {
      for (const needle of DESTRUCTIVE) {
        expect(`${file.name} contains ${needle}: ${file.text.includes(needle)}`).toBe(
          `${file.name} contains ${needle}: false`,
        );
      }
    }
  });

  it('reaches the trash port and nothing else to make something disappear', () => {
    const callers = serviceFiles.filter((file) => file.text.includes('trashItem('));
    expect(callers.map((file) => file.name)).toEqual(['service.ts']);

    const calls = serviceFiles
      .flatMap((file) => file.text.split('\n'))
      .filter((line) => line.includes('trashItem(') && !line.trim().startsWith('*'));
    // Exactly one call site: `await trashItem(absolutePath)`.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.trim()).toBe('await trashItem(absolutePath);');
  });

  it('imports neither Electron nor the Pod manager', () => {
    const hostModule = 'elec' + 'tron';
    for (const file of serviceFiles) {
      const imports = file.text
        .split('\n')
        .filter((line) => line.trimStart().startsWith('import ') || line.includes(' from \''));
      for (const line of imports) {
        expect(`${file.name}: ${line.includes(hostModule)}`).toBe(`${file.name}: false`);
        expect(`${file.name}: ${line.includes('pod-manager')}`).toBe(`${file.name}: false`);
      }
    }
  });

  it('exports a factory built from its declared dependencies and nothing else', () => {
    expect(typeof createBeachcomberService).toBe('function');
    expect(createBeachcomberService).toHaveLength(1);
  });
});

/**
 * The same scan, over the module Pod deletion added. `src/main/pod-session/**`
 * bins ONE `<sessionId>.jsonl` and never its parent directory, and the only way
 * it can make anything disappear is the injected `TrashItem`.
 */
describe('the Pod session remover holds no deletion primitive either', () => {
  it('has source files to scan at all', () => {
    // Vacuity guard. An empty directory would make every assertion below pass
    // while proving nothing — which is exactly how an inert guard is born.
    expect(podSessionFiles.length).toBeGreaterThan(0);
  });

  it('contains no filesystem mutation call anywhere under src/main/pod-session', () => {
    for (const file of podSessionFiles) {
      for (const needle of DESTRUCTIVE) {
        expect(`${file.name} contains ${needle}: ${file.text.includes(needle)}`).toBe(
          `${file.name} contains ${needle}: false`,
        );
      }
    }
  });

  it('reaches the trash port and nothing else to make something disappear', () => {
    const callers = podSessionFiles.filter((file) => file.text.includes('trashItem('));
    expect(callers.map((file) => file.name)).toEqual(['remover.ts']);

    const calls = podSessionFiles
      .flatMap((file) => file.text.split('\n'))
      .filter((line) => line.includes('trashItem(') && !line.trim().startsWith('*'));
    // Exactly one call site: `await trashItem(absolutePath)`.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.trim()).toBe('await trashItem(absolutePath);');
  });

  it('imports neither Electron, nor the Pod manager, nor the store', () => {
    const hostModule = 'elec' + 'tron';
    for (const file of podSessionFiles) {
      const imports = file.text
        .split('\n')
        .filter((line) => line.trimStart().startsWith('import ') || line.includes(' from \''));
      for (const line of imports) {
        expect(`${file.name}: ${line.includes(hostModule)}`).toBe(`${file.name}: false`);
        expect(`${file.name}: ${line.includes('pod-manager')}`).toBe(`${file.name}: false`);
        expect(`${file.name}: ${line.includes('/store')}`).toBe(`${file.name}: false`);
      }
    }
  });

  it('exports a factory built from its declared dependencies and nothing else', () => {
    expect(typeof createPodSessionRemover).toBe('function');
    expect(createPodSessionRemover).toHaveLength(1);
  });
});

describe('the Beachcomber suite never touches a real developer path', () => {
  it('names no home-directory API', () => {
    const needles = ['home' + 'dir', 'USER' + 'PROFILE', 'process.env.' + 'HOME'];
    for (const file of testFiles) {
      for (const needle of needles) {
        expect(`${file.name} names ${needle}: ${file.text.includes(needle)}`).toBe(
          `${file.name} names ${needle}: false`,
        );
      }
    }
  });

  it('mentions no path belonging to the machine running the suite', async () => {
    const os = await import('node:os');
    const realHome = (os as unknown as Record<string, () => string>)['home' + 'dir']?.() ?? '';
    expect(realHome.length).toBeGreaterThan(0);

    for (const file of testFiles) {
      expect(`${file.name}: ${file.text.toLowerCase().includes(realHome.toLowerCase())}`).toBe(
        `${file.name}: false`,
      );
    }
  });

  it('never supplies the real trash function', () => {
    const hostModule = 'elec' + 'tron';
    for (const file of testFiles) {
      expect(`${file.name}: ${file.text.includes(hostModule)}`).toBe(`${file.name}: false`);
      expect(`${file.name}: ${file.text.includes('shell.' + 'trashItem')}`).toBe(`${file.name}: false`);
    }
  });

  it('builds every fixture under an OS temp directory', () => {
    const helpers = testFiles.find((file) => file.name === 'helpers.ts');
    expect(helpers).toBeDefined();
    expect(helpers?.text).toContain("mkdtempSync(join(tmpdir(), 'orcastrate-beachcomber-')");
  });
});
