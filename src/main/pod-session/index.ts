/**
 * Public surface of the Pod-session module: one factory, one probe, and the
 * two path helpers its tests pin. `src/main/index.ts` is the only production
 * caller of the factory, because it is the only place `CLAUDE_HOME` and the
 * application's single `TrashItem` exist.
 */

export { fileExists } from './file-exists';
export { encodeCwdForProjects, sessionFilePath } from './paths';
export { createPodSessionRemover, type PodSessionRemoverDeps } from './remover';
