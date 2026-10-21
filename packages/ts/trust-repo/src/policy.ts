/**
 * The trust POLICY: which repository roots a tool may treat as consented-to
 * run their own scripts, decided from a policy object the caller supplies
 * rather than any config file this package reads itself.
 *
 * Exposed here, beside the marker store, so a standalone tool built on the
 * config module (the tool's machine schema, built with `@osdlc/config-layers`,
 * carries the `trust:` block this policy is read from) gets the trust decision and its exit
 * code without writing them. This package knows no git, so the one thing the
 * `owners` rule needs — the owner of a root's `origin` remote — is supplied by
 * the caller as {@link PolicyDecisionOptions.ownerOf}. A git-backed lookup belongs in the tool.
 *
 * {@link trustDecision} is where consent is actually decided, in order:
 *
 *   1. A marker grant in the caller's {@link TrustStore}.
 *   2. `policy.paths` — a glob over the resolved repo root.
 *   3. `policy.owners` — a case-insensitive match on the owner `ownerOf` returns.
 *
 * Path token expansion (`~`, `{name}` and whatever else a tool's own paths
 * vocabulary defines) is likewise the caller's: {@link PolicyDecisionOptions.expandPath}.
 *
 * {@link policyExecGate} is the one call a tool makes to turn a trust decision
 * into the boolean it actually acts on: it layers `trustDecision` over
 * {@link resolveExecGate}, so `configured` and a per-run flag combine with the
 * marker-or-policy decision the same way they combine with a marker-only one,
 * and `by`/`rule` ride along on the result.
 */

import { resolveExecGate, type ExecGate, type ResolveExecGateArgs } from './gate.ts'
import { resolveTrustRoot, type TrustStore } from './store.ts'

/**
 * Pure string glob match — no filesystem access, unlike a globber that only
 * reports entries that exist on disk right now. A trust policy has to answer
 * for a root that may have been deleted since (an `untrust`-style query on a
 * gone checkout is still a valid question), so matching is a string comparison
 * against the resolved pattern, never a directory walk.
 *
 * This matcher supports exactly what a directory policy needs: `**` (any number
 * of path segments, `/` included) and `*`/`?` (within one segment) — not a
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
 * How, if at all, {@link policyDecision} resolved trust — never `'marker'`.
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
   * Expand a `policy.paths` pattern's own vocabulary (a leading `~`, `{name}`
   * tokens, whatever else the caller's paths format defines) before matching
   * — this package has no such vocabulary of its own. Identity when omitted.
   */
  expandPath?: (raw: string) => Promise<string> | string
  /**
   * The owner of `root`'s `origin` remote, or null when there is none to read.
   * This package knows no git, so without it `policy.owners` never matches.
   */
  ownerOf?: (root: string) => string | null
  /**
   * An existing {@link TrustStore} to resolve the root through, so a caller
   * that already has one (as {@link trustDecision}'s caller does) does not
   * pay for a second resolution. Defaults to {@link resolveTrustRoot} — the
   * same function a store's own `resolveRoot` is, so a marker key and a path
   * match always agree on one root's resolved spelling.
   */
  store?: TrustStore
}

/**
 * `policy.paths`/`policy.owners` only — never a marker store. Exposed
 * separately from {@link trustDecision} so a caller can ask "does policy
 * ALSO cover this root" independent of whether a marker exists (an
 * `untrust`-style "removing the marker changes nothing" notice).
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
 * Whether `root` (any spelling — a symlink and its target are one decision)
 * is trusted, and by what: a marker grant in `store` first, then `policy`
 * ({@link policyDecision}).
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
 * {@link resolveExecGate}, with {@link trustDecision} — marker store, then
 * `policy` — standing in for the store's own marker-only `isTrusted` check. The
 * one call a tool makes to turn "is this root trusted, by marker or by policy"
 * plus "is execution configured on, and did a per-run flag say otherwise" into
 * the single boolean it acts on, with `by`/`rule` attached so a `--show`-style
 * surface can report which layer decided without a second lookup.
 *
 * `args.root` is resolved once, through `store` — the same resolution
 * `trustDecision`'s own marker check and `policy.paths` matching agree on.
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
  // `rule` omitted rather than set to `undefined` — under `exactOptionalPropertyTypes`
  // those are different things.
  return {
    ...gate,
    by: decision.by,
    ...(decision.rule !== undefined ? { rule: decision.rule } : {}),
  }
}
