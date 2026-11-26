/**
 * `@osdlc/code-stats/prep`: a review-prep manifest for a PR or branch diff.
 *
 * `runPrep` is the pipeline behind `code-stats prep`: it measures the change
 * and adds the review planning on top, a JSON manifest of kept and dropped
 * files, review groups by package root, and reading-order flags.
 * `prepManifestSchema` validates the manifest; a failure is a
 * `CodeStatsError` from the root entry. The grouping pieces under `runPrep`
 * are experimental.
 */

export { DEFAULT_THRESHOLDS, runPrep, type PrepArgs, type PrepEnv } from './run.ts'
export {
  prepManifestSchema,
  type PrepFile,
  type PrepFlag,
  type PrepManifest,
  type PrepGroup,
  type Thresholds,
} from './schema.ts'
export { PACKAGE_MARKERS, buildGroups, nearestRoot, packageRoots } from './groups.ts'
