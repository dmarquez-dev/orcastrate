/**
 * Global Vitest setup, applied to every test file.
 *
 * Keep this small and universal. Anything that only one suite needs belongs in
 * that suite, not here — this file runs before every test in the repo.
 */

/**
 * Fixture replay and store tests compare timestamps and ids, so make the
 * timezone deterministic regardless of the developer's machine.
 */
process.env.TZ = 'UTC';
