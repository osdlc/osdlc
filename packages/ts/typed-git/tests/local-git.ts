/**
 * The git on this machine, against the feature table: which real-git tests
 * it can run. A test that needs a newer git skips with the reason instead of
 * failing on git's usage error.
 */

import { tmpdir } from 'node:os'

import { GIT_FEATURES, gitSupports, type GitFeature } from '../src/features.ts'
import { formatGitVersion } from '../src/git-version.ts'
import { Git } from '../src/sync.ts'

/** The local git's version, probed once. */
export const LOCAL_GIT = new Git(tmpdir()).version()

/**
 * Why the local git cannot run a test that uses `features`, or `null` when it
 * can: `needs git 2.38 for merge-tree --write-tree; found 2.34.1`.
 */
export function missingGitFeature(...features: GitFeature[]): string | null {
  const missing = features.find((f) => !gitSupports(f, LOCAL_GIT))
  if (missing === undefined) return null
  const { major, minor } = GIT_FEATURES[missing].minimum
  return `needs git ${major}.${minor} for ${missing}; found ${formatGitVersion(LOCAL_GIT)}`
}
