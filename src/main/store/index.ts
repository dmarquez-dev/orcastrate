/**
 * Public surface of the store module. Consumers (T4 PodRunner, T5 LaneRouter,
 * T7 IPC handlers) import from here, never from the files beneath it.
 */

export { openEventStore } from './sqlite-event-store';
export { EventStoreError } from './errors';
export { CURRENT_SCHEMA_VERSION, MIGRATIONS } from './schema';
