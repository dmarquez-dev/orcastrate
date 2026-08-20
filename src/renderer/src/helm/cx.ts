/**
 * Join class names, dropping anything absent.
 *
 * `styles/css.d.ts` types a CSS Module as `Readonly<Record<string, string>>`,
 * and `tsconfig.web.json` sets `noUncheckedIndexedAccess`, so every
 * `styles.foo` is `string | undefined`. Template-literal joins would therefore
 * spell `undefined` into a class attribute; this drops it instead.
 */
export function cx(...parts: readonly (string | false | undefined)[]): string {
  return parts.filter((part): part is string => typeof part === 'string' && part !== '').join(' ');
}
