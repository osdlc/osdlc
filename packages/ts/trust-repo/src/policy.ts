/**
 * The trust policy: which repository roots a tool may treat as trusted to
 * run their own scripts. The caller supplies the policy object. This package
 * reads no config file itself.
 *
 * It sits beside the marker store so a tool built on `@osdlc/config-layers`
 * (whose machine schema has the `trust:` block the policy comes from) gets
 * the trust decision without writing it. This module runs no git. The
 * `owners` rule needs the owner of a root's `origin` remote, so the caller
 * supplies {@link PolicyDecisionOptions.ownerOf}. `originOwner` from
 * `@osdlc/trust-repo/git` is a git-backed one.
 *
 * {@link trustDecision} decides trust in this order:
 *
 *   1. A marker grant in the caller's {@link TrustStore}.
 *   2. `policy.paths`: a glob over the resolved repo root.
 *   3. `policy.owners`: a case-insensitive match on the host and owner
 *      `ownerOf` returns. See {@link TrustPolicy.owners}.
 *
 * The caller also expands path tokens (`~`, `{name}`, and any others its own
 * paths format defines), through {@link PolicyDecisionOptions.expandPath}.
 *
 * A decision can be for one scope (one tool). A whole-repository marker and
 * the top-level `paths`/`owners` cover every scope. `policy.scopes[scope]`
 * adds rules for that scope alone, checked after the top-level ones.
 *
 * {@link policyExecGate} turns trust decisions into the boolean a tool acts
 * on. It feeds `trustDecision` into {@link resolveExecGate}, so `configured`
 * and a per-run flag combine with a marker-or-policy decision the same way
 * they combine with a marker-only one. The result also carries `by`, `rule`
 * and one decision per scope. An explicit `flag: false` returns before any
 * lookup, so it reads no marker and runs no `ownerOf`.
 */

import { resolveExecGate, type ExecGate, type ResolveExecGateArgs } from './gate.ts'
import { normalizeTrustPath, resolveTrustRoot } from './paths.ts'
import { WHOLE_REPO_SCOPE, type TrustStore } from './store.ts'

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
 * The `paths` and `owners` rules of a policy, for the whole repository or for one scope.
 *
 * @experimental
 */
export interface TrustRules {
  /** Glob patterns (see {@link pathGlobToRegExp}'s dialect) over the resolved, symlink-free repo root. */
  paths: string[]
  /**
   * Owners, each `host/owner` (`gitlab.com/acme`) or a bare `owner`, which
   * means `github.com/owner`. Matched case-insensitively against what
   * {@link PolicyDecisionOptions.ownerOf} returns, host and owner both.
   */
  owners: string[]
}

/**
 * The plain, caller-supplied policy `trustDecision`/`policyDecision` decide
 * over. The top-level rules cover every scope.
 * @experimental
 */
export interface TrustPolicy extends TrustRules {
  /**
   * Rules for one scope each, keyed by scope (a tool id). They trust that
   * scope only, and are checked after the top-level rules.
   */
  scopes?: Record<string, TrustRules> | undefined
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
  /**
   * The scope of the grant or rules that decided: `*` for a whole-repository
   * marker or the top-level rules, else the scope asked about. Set only when
   * trusted.
   */
  scope?: string
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
  /** As {@link TrustDecision.scope}. */
  scope?: string
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
   * matching. When omitted, patterns are used as written.
   * `expandTrustPath` is the expander most tools want.
   */
  expandPath?: (raw: string) => Promise<string> | string
  /**
   * The host and owner of `root`'s `origin` remote as `host/owner`
   * (`github.com/acme`), or null when there is none to read. A bare owner
   * is read as `github.com/owner`. Without it `policy.owners` never matches.
   * `originOwner` from `@osdlc/trust-repo/git` is the git-backed lookup.
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
  /**
   * The scope to decide for, `*` (the whole repository) by default. A scope
   * other than `*` is also trusted by `policy.scopes[scope]` and by that
   * scope's own marker.
   */
  scope?: string
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
  const scope = opts.scope ?? WHOLE_REPO_SCOPE
  const layers: [string, TrustRules][] = [[WHOLE_REPO_SCOPE, policy]]
  // An own key only, so a scope named `constructor` or `__proto__` does not
  // read the prototype chain.
  const scoped =
    scope === WHOLE_REPO_SCOPE ||
    policy.scopes === undefined ||
    !Object.hasOwn(policy.scopes, scope)
      ? undefined
      : policy.scopes[scope]
  if (scoped !== undefined) layers.push([scope, scoped])

  let resolvedRoot: string | undefined
  // Looked up at most once, and only when an `owners` rule needs it.
  let owner: string | null | undefined
  for (const [from, rules] of layers) {
    if (rules.paths.length > 0) {
      resolvedRoot ??= opts.store
        ? await opts.store.resolveRoot(root)
        : await resolveTrustRoot(root)
      for (const pattern of rules.paths) {
        const expanded = normalizeTrustPath(
          opts.expandPath ? await opts.expandPath(pattern) : pattern,
        )
        if (pathGlobToRegExp(expanded).test(resolvedRoot)) {
          return { trusted: true, by: 'path', rule: pattern, scope: from }
        }
      }
    }
    if (rules.owners.length > 0 && opts.ownerOf !== undefined) {
      if (owner === undefined) owner = opts.ownerOf(root)
      if (owner !== null) {
        const key = ownerKey(owner)
        const hit = rules.owners.find((o) => ownerKey(o) === key)
        if (hit !== undefined) return { trusted: true, by: 'owner', rule: hit, scope: from }
      }
    }
  }
  return { trusted: false, by: null }
}

/**
 * `host/owner` in lower case. A bare owner is a GitHub owner, which is what
 * an `owners` entry meant before it could name a host.
 */
function ownerKey(value: string): string {
  const v = value.trim().toLowerCase()
  return v.includes('/') ? v : `github.com/${v}`
}

/**
 * Whether `root` is trusted for `opts.scope` (`*` by default), and by which
 * layer: a marker grant in `store` first (whole-repository, then the
 * scope's), then `policy` ({@link policyDecision}). A symlink and its target
 * get the same decision.
 * @experimental
 */
export async function trustDecision(
  store: TrustStore,
  root: string,
  policy: TrustPolicy,
  opts: PolicyDecisionOptions = {},
): Promise<TrustDecision> {
  const scope = opts.scope ?? WHOLE_REPO_SCOPE
  if (await store.isTrusted(root)) return { trusted: true, by: 'marker', scope: WHOLE_REPO_SCOPE }
  if (scope !== WHOLE_REPO_SCOPE && (await store.isTrusted(root, scope))) {
    return { trusted: true, by: 'marker', scope }
  }
  return policyDecision(root, policy, { ...opts, store })
}

/**
 * What {@link policyExecGate} returns: the gate, the layer that decided and
 * one decision per scope.
 * @experimental
 */
export interface PolicyExecGate extends ExecGate {
  /**
   * The layer that decided the first missing scope, or the first scope when
   * none is missing. `null` when untrusted, and when `flag: false` meant
   * nothing was looked up.
   */
  by: TrustBy | null
  /** The rule behind {@link by}, when `by` is `'path'` or `'owner'`. */
  rule?: string
  /** The decision for each scope asked about. Empty when `flag: false`. */
  decisions: Record<string, TrustDecision>
}

/**
 * {@link resolveExecGate}, with {@link trustDecision} (marker store, then
 * `policy`) in place of the store's marker-only `isTrusted` check. A tool
 * calls this once to combine trust (by marker or policy), the configured
 * value and any per-run flag into the boolean it acts on. The result carries
 * `by`, `rule` and `decisions`, so a `--show`-style command can report which
 * layer decided without a second lookup.
 *
 * `args.scopes` lists every tool the run needs, `['*']` by default. A tool
 * can run another tool (a mise task runs mise), so pass each of them. The gate
 * allows the run only when every scope is trusted.
 *
 * `flag: false` returns `configured-off` before any lookup: no marker read,
 * no `ownerOf` call. Every other step resolves `args.root` through `store`,
 * so the marker check, `policy.paths` matching and the gate all use the same
 * resolved path.
 * @experimental
 */
export async function policyExecGate(
  store: TrustStore,
  policy: TrustPolicy,
  args: {
    root: string
    configured: boolean
    flag?: boolean | undefined
    scopes?: readonly string[] | undefined
  },
  opts: PolicyDecisionOptions = {},
): Promise<PolicyExecGate> {
  if (args.flag === false) {
    return { ...(await resolveExecGate(store, args)), by: null, decisions: {} }
  }
  const scopes = args.scopes ?? [WHOLE_REPO_SCOPE]
  // One owner lookup for every scope.
  const lookup = opts.ownerOf
  let owner: string | null | undefined
  const shared: PolicyDecisionOptions =
    lookup === undefined
      ? opts
      : {
          ...opts,
          ownerOf: (root) => {
            if (owner === undefined) owner = lookup(root)
            return owner
          },
        }
  // No prototype, so a scope named `__proto__` is an ordinary key.
  const decisions: Record<string, TrustDecision> = Object.create(null)
  for (const scope of scopes) {
    decisions[scope] ??= await trustDecision(store, args.root, policy, { ...shared, scope })
  }
  const gateArgs: ResolveExecGateArgs = {
    ...args,
    trusted: (scope) => decisions[scope]?.trusted === true,
  }
  const gate = await resolveExecGate(store, gateArgs)
  const lead = decisions[gate.missing[0] ?? scopes[0] ?? WHOLE_REPO_SCOPE]
  // Omit `rule` instead of setting it to `undefined`. Under
  // `exactOptionalPropertyTypes` the two differ.
  return {
    ...gate,
    by: lead?.by ?? null,
    ...(lead?.rule !== undefined ? { rule: lead.rule } : {}),
    decisions,
  }
}
