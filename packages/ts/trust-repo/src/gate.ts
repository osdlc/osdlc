/**
 * Combine a tool's configured value, an explicit per-run flag and a
 * {@link TrustStore} into the one boolean a tool actually acts on.
 *
 * It works with any store built by {@link trustStore}: a tool that gates project-sourced behaviour behind
 * trust (running a verb read from inside the repository, evaluating its
 * build config) computes this once so every caller agrees on the answer.
 *
 * |  flag        | configured | trusted | allowExec | reason         |
 * |--------------|------------|---------|-----------|----------------|
 * |  false        | any        | any     | false     | configured-off |
 * |  true         | any        | any     | true      | allowed-by-flag|
 * |  (none)       | false      | any     | false     | configured-off |
 * |  (none)       | true       | false   | false     | untrusted      |
 * |  (none)       | true       | true    | true      | allowed        |
 *
 * An explicit `flag: false` short-circuits without consulting the store:
 * the answer cannot change, and a person turning the behaviour off should
 * not have their trust state read to be told so. `flag: true` is consent
 * for one run: a human typed it, with intent, at the moment of running. It
 * is reported truthfully in `trusted` but never recorded — persisting it
 * would turn one deliberate run into a standing grant nobody remembers
 * giving.
 */

import type { TrustStore } from './store.ts'

/**
 * The outcome of the trust check: whether to run, the configured value, whether the root is trusted and the reason.
 * @experimental
 */
export interface ExecGate {
  /** What the caller should actually do. */
  allowExec: boolean
  /** The layered/flagged configured value, before trust. */
  configured: boolean
  trusted: boolean
  /** Why {@link allowExec} came out the way it did. */
  reason: 'allowed' | 'allowed-by-flag' | 'untrusted' | 'configured-off'
  /** The resolved root the trust decision was keyed on. */
  root: string
}

/**
 * Inputs to `resolveExecGate`: the root, the configured value and an optional per-run flag.
 * @experimental
 */
export interface ResolveExecGateArgs {
  root: string
  /** The configured value, after layering and the tool's own default. */
  configured: boolean
  /** An explicit per-run override, if one was given on the command line. */
  flag?: boolean | undefined
  /**
   * A precomputed trust decision, used INSTEAD OF `store.isTrusted(root)` when
   * present. The hook a tool uses to layer a policy on top of the marker
   * store: a tool's `trustDecision` may already check the store
   * plus a path/owner policy, and a caller that has run it hands the result
   * straight through rather than paying for a second, marker-only lookup that
   * would disagree with the policy-aware answer. `root` is still resolved
   * through `store.resolveRoot`, so the two never key on different spellings.
   */
  trusted?: boolean
}

/**
 * Decide whether a root's commands may run, from the configured value, a per-run flag and the trust store.
 * @experimental
 */
export async function resolveExecGate(
  store: TrustStore,
  args: ResolveExecGateArgs,
): Promise<ExecGate> {
  const { root, configured, flag } = args
  const resolved = await store.resolveRoot(root)

  if (flag === false) {
    return {
      allowExec: false,
      configured,
      trusted: false,
      reason: 'configured-off',
      root: resolved,
    }
  }

  const trusted = args.trusted ?? (await store.isTrusted(resolved))

  if (flag === true) {
    return { allowExec: true, configured, trusted, reason: 'allowed-by-flag', root: resolved }
  }

  if (!configured) {
    return { allowExec: false, configured, trusted, reason: 'configured-off', root: resolved }
  }
  if (!trusted) {
    return { allowExec: false, configured, trusted, reason: 'untrusted', root: resolved }
  }
  return { allowExec: true, configured, trusted, reason: 'allowed', root: resolved }
}

/**
 * The actionable sentence shown when a tool withheld something for want of
 * trust. One function because every surface that can show it — CLI, TUI, a
 * web page — should say the same thing, so a user who reads a different
 * instruction in each does not have to work out which one is current.
 *
 * `verb` is the store's trust subcommand (`trust` by default; a tool that
 * nests it, e.g. `tooly repo trust`, passes the full `toolName` including
 * the noun and leaves `verb` alone, or passes both to spell out its own
 * wording). `flag` is the per-run override named in the sentence's second
 * half (`--exec` by default, matching `resolveExecGate`'s `flag`); a tool
 * whose override is spelled differently (for example `--trust`) passes its own.
 *
 * `flag: null` drops that second half, for a surface that has no per-run
 * override. Advice naming a flag the command then rejects as unknown costs
 * the operator a run to find out, and teaches them to distrust the half of
 * the sentence that was true.
 * @experimental
 */
export function withheldHint(
  toolName: string,
  opts: { verb?: string; flag?: string | null } = {},
): string {
  const { verb = 'trust', flag = '--exec' } = opts
  const perRun = flag === null ? '' : `, or pass ${flag} for this run only`
  return `this repository is not trusted — run "${toolName} ${verb}" to trust it${perRun}`
}
