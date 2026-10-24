/**
 * The trust policy: which repository roots a tool may treat as trusted to
 * run their own scripts. The caller supplies the policy object. This package
 * reads no config file itself.
 *
 * It sits beside the marker store so a tool built on `@osdlc/config-layers`
 * (whose machine schema has the `trust:` block the policy comes from) gets
 * the trust decision without writing it. This package does not use git. The
 * `owners` rule needs the owner of a root's `origin` remote, so the caller
 * supplies {@link PolicyDecisionOptions.ownerOf}. The tool provides a
 * git-backed lookup.
 *
 * {@link trustDecision} decides trust in this order:
 *
 *   1. A marker grant in the caller's {@link TrustStore}.
 *   2. `policy.paths`: a glob over the resolved repo root.
 *   3. `policy.owners`: a case-insensitive match on the owner `ownerOf` returns.
 *
 * The caller also expands path tokens (`~`, `{name}`, and any others its own
 * paths format defines), through {@link PolicyDecisionOptions.expandPath}.
 *
 * {@link policyExecGate} turns a trust decision into the boolean a tool acts
 * on. It feeds `trustDecision` into {@link resolveExecGate}, so `configured`
 * and a per-run flag combine with a marker-or-policy decision the same way
 * they combine with a marker-only one. The result also carries `by` and
 * `rule`.
 */

import { resolveExecGate, type ExecGate, type ResolveExecGateArgs } from './gate.ts'
import { resolveTrustRoot, type TrustStore } from './store.ts'

/**
 * Converts a glob to a regular expression for string matching. It does not
 * touch the filesystem, unlike a globber that lists only entries on disk. A
 * trust policy must answer for a root that may have been deleted (an
 * `untrust`-style query on a removed checkout is still valid), so matching
 * compares strings and never walks a directory.
 *
 * It supports only what a directory policy needs: `**` (any number of path
 * segments, `/` included) and `*`/`?` (within one segment). It is not a
 * general-purpose glob engine.
 * @experimental
 */
export function pathGlobToRegExp(pattern: string): RegExp {
  let src = ''
  for (let i = 0; i < pattern.length; i += 1) {
    const c = pattern[i] as string
    if (c === '*' && pattern[i + 1] === '*') {
      i += 1
      if (pattern[i + 1] === '/') {
        // `**/` is zero or more whole segments, so `a/**/b` matches `a/b` and `a/x/b`, not `a/xb`.
        src += '(?:.*/)?'
        i += 1
      } else {
        src += '.*'
      }
    } else if (c === '*') {
      src += '[^/]*'
    } else if (c === '?') {
      src += '[^/]'
    } else {
      src += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`^${src}$`)
}

/**
 * The plain, caller-supplied policy `trustDecision`/`policyDecision` decide over.
 *
 * @experimental
 */
export interface TrustPolicy {
  /** Glob patterns (see {@link pathGlobToRegExp}'s dialect) over the resolved, symlink-free repo root. */
  paths: string[]
  /** Owners matched case-insensitively against the owner {@link PolicyDecisionOptions.ownerOf} returns. */
  owners: string[]
}

/**
 * How, if at all, {@link trustDecision} resolved trust for a root.
 *
 * @experimental
 */
export type TrustBy = 'marker' | 'path' | 'owner'
/**
 * How, if at all, {@link policyDecision} resolved trust. Never `'marker'`.
 *
 * @experimental
 */
export type PolicyBy = Exclude<TrustBy, 'marker'>

/**
 * Whether a root is trusted, which layer decided and the policy rule that matched.
 * @experimental
 */
export interface TrustDecision {
  trusted: boolean
  /** Which layer decided; null when untrusted by every layer. */
  by: TrustBy | null
  /** The matching `policy.paths`/`policy.owners` entry; only set when `by` is `'path'` or `'owner'`. */
  rule?: string
}

/**
 * {@link TrustDecision}, narrowed to the layers {@link policyDecision} can return.
 *
 * @experimental
 */
export interface PolicyDecision {
  trusted: boolean
  by: PolicyBy | null
  rule?: string
}

/**
 * Options for deciding trust from a policy: how to expand path patterns, how to find a root's owner,
 * and an existing store to reuse.
 * @experimental
 */
export interface PolicyDecisionOptions {
  /**
   * Expands tokens in a `policy.paths` pattern (a leading `~`, `{name}`
   * tokens, and any others the caller's paths format defines) before
   * matching. This package expands none itself. When omitted, patterns are
   * used as written.
   */
  expandPath?: (raw: string) => Promise<string> | string
  /**
   * The owner of `root`'s `origin` remote, or null when there is none to read.
   * This package does not use git, so without it `policy.owners` never matches.
   */
  ownerOf?: (root: string) => string | null
  /**
   * A {@link TrustStore} whose `resolveRoot` resolves the root before path
   * matching. {@link trustDecision} passes its own store here. Without it,
   * {@link resolveTrustRoot} is used, which is the function a store's
   * `resolveRoot` is. Either way a marker key and a path match use the same
   * resolved path.
   */
  store?: TrustStore
}

/**
 * Checks `policy.paths` and `policy.owners` only, never a marker store. It is
 * separate from {@link trustDecision} so a caller can ask whether the policy
 * also covers a root, whether or not a marker exists. For example, `untrust`
 * can warn that removing the marker changes nothing.
 * @experimental
 */
export async function policyDecision(
  root: string,
  policy: TrustPolicy,
  opts: PolicyDecisionOptions = {},
): Promise<PolicyDecision> {
  if (policy.paths.length > 0) {
    const resolvedRoot = opts.store
      ? await opts.store.resolveRoot(root)
      : await resolveTrustRoot(root)
    for (const pattern of policy.paths) {
      const expanded = opts.expandPath ? await opts.expandPath(pattern) : pattern
      if (pathGlobToRegExp(expanded).test(resolvedRoot)) {
        return { trusted: true, by: 'path', rule: pattern }
      }
    }
  }
  if (policy.owners.length > 0 && opts.ownerOf !== undefined) {
    const owner = opts.ownerOf(root)
    if (owner !== null) {
      const hit = policy.owners.find((o) => o.toLowerCase() === owner.toLowerCase())
      if (hit !== undefined) return { trusted: true, by: 'owner', rule: hit }
    }
  }
  return { trusted: false, by: null }
}

/**
 * Whether `root` is trusted, and by which layer: a marker grant in `store`
 * first, then `policy` ({@link policyDecision}). A symlink and its target
 * get the same decision.
 * @experimental
 */
export async function trustDecision(
  store: TrustStore,
  root: string,
  policy: TrustPolicy,
  opts: PolicyDecisionOptions = {},
): Promise<TrustDecision> {
  if (await store.isTrusted(root)) return { trusted: true, by: 'marker' }
  return policyDecision(root, policy, { ...opts, store })
}

/**
 * {@link resolveExecGate}, with {@link trustDecision} (marker store, then
 * `policy`) in place of the store's marker-only `isTrusted` check. A tool
 * calls this once to combine trust (by marker or policy), the configured
 * value and any per-run flag into the boolean it acts on. The result carries
 * `by` and `rule`, so a `--show`-style command can report which layer
 * decided without a second lookup.
 *
 * Every step resolves `args.root` through `store`, so the marker check,
 * `policy.paths` matching and the gate all use the same resolved path.
 * @experimental
 */
export async function policyExecGate(
  store: TrustStore,
  policy: TrustPolicy,
  args: { root: string; configured: boolean; flag?: boolean | undefined },
  opts: PolicyDecisionOptions = {},
): Promise<ExecGate & { by: TrustBy | null; rule?: string }> {
  const decision = await trustDecision(store, args.root, policy, opts)
  const gateArgs: ResolveExecGateArgs = { ...args, trusted: decision.trusted }
  const gate = await resolveExecGate(store, gateArgs)
  // Omit `rule` instead of setting it to `undefined`. Under
  // `exactOptionalPropertyTypes` the two differ.
  return {
    ...gate,
    by: decision.by,
    ...(decision.rule !== undefined ? { rule: decision.rule } : {}),
  }
}
