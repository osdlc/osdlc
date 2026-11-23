/**
 * `@osdlc/trust-repo`: per-repository consent to run a repository's own
 * scripts. A tool asks a person once and remembers the answer.
 *
 * {@link trustStore} builds one store per tool name. The store is a directory
 * of marker files, keyed on the symlink-resolved repository root and a scope:
 * `*` for the whole repository, or one tool's id. A tool that passes
 * `vendorDirs` keeps it in `<state home>/<tool>[/<app>]/trusted/` through
 * `@osdlc/tiered-dirs`; one that does not keeps the old place,
 * `$XDG_STATE_HOME/<tool>/trusted/`. {@link resolveExecGate} combines a tool's
 * configured value, an explicit per-run flag and the store into one boolean.
 * {@link withheldHint} is the sentence every interface shows when the gate
 * withholds something.
 *
 * {@link policyDecision}, {@link trustDecision} and {@link policyExecGate}
 * apply a `paths`/`owners` policy, read by the tool from its machine file, on
 * top of the store. {@link expandTrustPath} expands a `paths` glob. The
 * `owners` rule needs git, which this entry point does not run, so the caller
 * supplies `ownerOf`; `@osdlc/trust-repo/git` has a git-backed one.
 *
 * `./store.ts` and `./gate.ts` explain the design of the store and the gate.
 */

export {
  TRUST_MARKER_DIR,
  WHOLE_REPO_SCOPE,
  parseTrustScope,
  trustStore,
  trustStoreDir,
} from './store.ts'
export type {
  TrustGrant,
  TrustResult,
  TrustStore,
  TrustStoreOptions,
  TrustVendorDirs,
} from './store.ts'

export { expandTilde, expandTrustPath, normalizeTrustPath, resolveTrustRoot } from './paths.ts'
export type { ExpandTrustPathOptions, TrustPlatform } from './paths.ts'

export { xdgHome } from './xdg.ts'
// So a tool builds `TrustVendorDirs` without importing `@osdlc/tiered-dirs` itself.
export { envVars } from '@osdlc/tiered-dirs'
export { homeDir } from './home.ts'

export { resolveExecGate, withheldHint } from './gate.ts'
export type { ExecGate, ResolveExecGateArgs } from './gate.ts'

export { pathGlobToRegExp, policyDecision, policyExecGate, trustDecision } from './policy.ts'
export type {
  PolicyBy,
  PolicyDecision,
  PolicyDecisionOptions,
  PolicyExecGate,
  TrustBy,
  TrustDecision,
  TrustPolicy,
  TrustRules,
} from './policy.ts'
