/**
 * `@osdlc/diffkit` — a review-prep manifest for a PR or branch diff.
 *
 * `runPrep` is the pipeline behind `diffkit prep`: it measures the change
 * with `@osdlc/code-stats` and adds the review planning on top, a JSON
 * manifest of kept and dropped files, review groups by package root, and
 * reading-order flags. `prepManifestSchema` validates the manifest;
 * `DiffkitError` is the failure a caller shows as a message. The grouping
 * pieces under `runPrep` are experimental.
 */

export { DiffkitError } from './error.ts'
export { DEFAULT_THRESHOLDS, runPrep, type PrepArgs, type PrepEnv } from './prep/run.ts'
export {
  prepManifestSchema,
  type PrepFile,
  type PrepFlag,
  type PrepManifest,
  type PrepGroup,
  type Thresholds,
} from './prep/schema.ts'
export { PACKAGE_MARKERS, buildGroups, nearestRoot, packageRoots } from './prep/groups.ts'
