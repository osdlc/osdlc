/**
 * `@osdlc/trust-repo` — per-repository consent to run a repository's
 * own scripts, so a tool can ask "has a person consented to running this
 * repository's scripts?" once and remember the answer.
 *
 * {@link trustStore} builds one store per tool name: a directory of marker
 * files under `$XDG_STATE_HOME/<tool>/trusted/`, keyed on the
 * symlink-resolved repository root. {@link resolveExecGate} combines a
 * tool's configured value, an explicit per-run flag and the store into the
 * one boolean the tool acts on; {@link withheldHint} is the one sentence
 * every surface shows when that gate withholds something.
 *
 * {@link policyDecision}, {@link trustDecision} and {@link policyExecGate} are
 * the standing-policy layer over the store (a `paths`/`owners` policy a tool reads
 * from its machine file), so a standalone tool gets the trust decision without
 * writing it. The `owners` rule needs git, which this package does not know: the
 * caller supplies `ownerOf` (a tool supplies a git-backed one).
 *
 * The reasoning behind the store and the gate is in `./store.ts` and
 * `./gate.ts`.
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
