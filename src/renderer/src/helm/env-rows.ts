/**
 * `Record<string, string>` is the contract's shape for `env`, and a form needs
 * ROWS: ordered, addressable by index, and able to hold a name the user is
 * halfway through typing.
 *
 * The rows are DERIVED from the record on every render and never stored — a
 * stored copy is a second owner of the same fact and goes stale silently
 * (frontend discipline, state ownership). `Object.entries` preserves insertion
 * order for string keys, so rebuilding the record from the rows round-trips
 * the order the user sees.
 *
 * THE ONE THING A RECORD CANNOT HOLD is two rows with the same name. Renaming
 * a row onto a name that already exists would silently destroy the other row's
 * value, so `renameKey` REFUSES and says so, and `EnvEditor` renders the
 * refusal beside the row. Refusing a keystroke is worse than accepting one,
 * but losing a variable the user cannot see they lost is worse than both.
 */

export interface EnvRow {
  key: string;
  value: string;
}

export function toRows(env: Readonly<Record<string, string>>): EnvRow[] {
  return Object.entries(env).map(([key, value]) => ({ key, value }));
}

export function fromRows(rows: readonly EnvRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}

export type RenameResult =
  | { ok: true; env: Record<string, string> }
  | { ok: false; reason: 'duplicate' };

export function renameKey(
  env: Readonly<Record<string, string>>,
  index: number,
  nextKey: string,
): RenameResult {
  const rows = toRows(env);
  const collides = rows.some((row, at) => at !== index && row.key === nextKey);
  if (collides) return { ok: false, reason: 'duplicate' };
  const next = rows.map((row, at) => (at === index ? { key: nextKey, value: row.value } : row));
  return { ok: true, env: fromRows(next) };
}

export function setValue(
  env: Readonly<Record<string, string>>,
  index: number,
  nextValue: string,
): Record<string, string> {
  const rows = toRows(env).map((row, at) =>
    at === index ? { key: row.key, value: nextValue } : row,
  );
  return fromRows(rows);
}

export function removeRow(
  env: Readonly<Record<string, string>>,
  index: number,
): Record<string, string> {
  return fromRows(toRows(env).filter((_row, at) => at !== index));
}

/**
 * A blank name is the seed of a new row, and there can only ever be one of
 * them — which is exactly why `EnvEditor` disables Add while one is on screen
 * rather than appending a second row that would collapse into the first.
 */
export function hasBlankKey(env: Readonly<Record<string, string>>): boolean {
  return Object.keys(env).some((key) => key === '');
}

export function addBlankRow(env: Readonly<Record<string, string>>): Record<string, string> {
  if (hasBlankKey(env)) return { ...env };
  return { ...env, '': '' };
}
