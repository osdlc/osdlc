/**
 * Checks the conformance suites of library families: the same cases, run by
 * every implementation of a library in each language. The standard is
 * S-conformance-suites in osdlc/osdlc.
 */

export {
  bumpVersion,
  configProblems,
  DEFAULT_LIBRARY_ROOTS,
  generatorBuildFilters,
  generatorCommand,
  LANGUAGES,
  majorMinor,
  pendingBumps,
  readsAcross,
  registryProblems,
  suiteProblems,
  suiteReaders,
  versionProblems,
  type Family,
  type Implementation,
  type LibraryRoots,
} from './checks.ts'
export { readConfig, type ConformanceConfig } from './config.ts'
export {
  checkRepo,
  DEFAULT_FAMILIES,
  regenerate,
  streamRun,
  type Regenerated,
  type RegenerateOptions,
  type RepoOptions,
  type Run,
} from './repo.ts'
export { main, type CliIo } from './cli.ts'
