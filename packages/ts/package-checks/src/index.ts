/**
 * Checks for a repository of TypeScript and Rust packages: each package's
 * shape, its packed tarball in a clean consumer, that a breaking change to a
 * published crate sets its version, which packages a pull request affects,
 * and staging a new package on npm. The rules are osdlc's package standard;
 * `package-checks.json` changes the parts that differ by repository.
 */

export {
  CONFIG_FILE,
  DEFAULT_SHARED,
  loadConfig,
  OSDLC,
  readConfig,
  type PackageChecksConfig,
} from './config.ts'
export {
  affectedOutputs,
  changedFiles,
  pick,
  readFamilies,
  readWorkspace,
  sharedPatterns,
  withDependencies,
  type AffectedSettings,
  type Families,
  type Manifest,
  type Manifests,
} from './affected.ts'
export { checkTsPackages } from './check-ts.ts'
export {
  indexEntries,
  indexPath,
  publishesToCratesIo,
  type CargoDependency,
  type CargoMetadata,
  type CargoPackage,
  type IndexEntry,
} from './crates-io.ts'
export { section } from './markdown.ts'
export {
  nextBreaking,
  printSemverReport,
  semverCheck,
  semverTable,
  type SemverReport,
  type SemverRow,
} from './semver.ts'
export * as shapeRs from './shape-rs.ts'
export * as shapeTs from './shape-ts.ts'
export {
  DEFAULT_WORKFLOW,
  githubRepository,
  NPM,
  PLACEHOLDER,
  readTarget,
  stage,
  trustArgs,
  type StageOptions,
  type StageTarget,
} from './stage.ts'
export { capture, RunFailed, stream } from './run.ts'
export { main } from './cli.ts'
