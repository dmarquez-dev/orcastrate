/**
 * Public surface of the Helm module. `src/main/index.ts` (T8) constructs the
 * service here and hands it to `registerIpcHandlers` as the `HelmService` port;
 * nothing else imports from the files beneath this barrel.
 */

export { createHelmService } from './helm-service';
export {
  backupPathFor,
  backupPathForSequence,
  tempPathFor,
  writeAtomic,
  type AtomicWriteHooks,
} from './atomic-write';
