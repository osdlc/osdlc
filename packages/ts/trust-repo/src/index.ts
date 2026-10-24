/**
 * `@osdlc/trust-repo`: per-repository consent to run a repository's own
 * scripts. A tool asks a person once and remembers the answer.
 *
 * {@link trustStore} builds one store per tool name. The store is a directory
 * of marker files under `$XDG_STATE_HOME/<tool>/trusted/`, keyed on the
 * symlink-resolved repository root. {@link resolveExecGate} combines a tool's
 * configured value, an explicit per-run flag and the store into one boolean.
 * {@link withheldHint} is the sentence every interface shows when the gate
 * withholds something.
 *
 * {@link policyDecision}, {@link trustDecision} and {@link policyExecGate}
 * apply a `paths`/`owners` policy, read by the tool from its machine file, on
 * top of the store. The `owners` rule needs git, which this package does not
 * use, so the caller supplies `ownerOf`.
 *
 * `./store.ts` and `./gate.ts` explain the design of the store and the gate.
 */

export { TRUST_MARKER_DIR, resolveTrustRoot, trustStore, trustStoreDir } from './store.ts'
export type { TrustResult, TrustStore, TrustStoreOptions } from './store.ts'

export { xdgHome } from './xdg.ts'

export { resolveExecGate, withheldHint } from './gate.ts'
export type { ExecGate, ResolveExecGateArgs } from './gate.ts'

export { pathGlobToRegExp, policyDecision, policyExecGate, trustDecision } from './policy.ts'
export type {
  PolicyBy,
  PolicyDecision,
  PolicyDecisionOptions,
  TrustBy,
  TrustDecision,
  TrustPolicy,
} from './policy.ts'
