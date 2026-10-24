/**
 * Combines a tool's configured value, an explicit per-run flag and a
 * {@link TrustStore} into the one boolean the tool acts on.
 *
 * It works with any store built by {@link trustStore}. A tool that puts
 * repository-sourced behaviour behind trust (running a verb defined in the
 * repository, evaluating its build config) computes this once, so every
 * caller gets the same answer.
 *
 * | flag   | configured | trusted | allowExec | reason          |
 * |--------|------------|---------|-----------|-----------------|
 * | false  | any        | any     | false     | configured-off  |
 * | true   | any        | any     | true      | allowed-by-flag |
 * | (none) | false      | any     | false     | configured-off  |
 * | (none) | true       | false   | false     | untrusted       |
 * | (none) | true       | true    | true      | allowed         |
 *
 * An explicit `flag: false` returns without reading the store. The answer
 * cannot change, and a person who turned the behaviour off does not need
 * their trust state read. `flag: true` is consent for one run, typed by a
 * person when they ran the command. The result's `trusted` field still
 * reports whether the root is trusted, but the flag is never saved. Saving it
 * would turn one run into a lasting grant that nobody remembers giving.
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
   * A trust decision the caller already made. When set, it is used instead
   * of `store.isTrusted(root)`. This lets a tool add a policy on top of the
   * marker store: `trustDecision` checks the store and a path/owner policy,
   * and its result is passed in here. A second, marker-only lookup could
   * disagree with it. `root` is still resolved through `store.resolveRoot`,
   * so both use the same resolved path.
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
 * The sentence shown when a tool withheld something because the repository
 * is not trusted. Every interface (CLI, TUI, web page) uses this one
 * function, so users see the same instruction everywhere.
 *
 * `verb` is the trust subcommand, `trust` by default. A tool with a nested
 * command such as `tooly repo trust` passes `verb: 'repo trust'`, or passes
 * `tooly repo` as `toolName`. `flag` is the per-run override named in the
 * second half of the sentence, `--exec` by default. A tool whose flag has
 * another name (for example `--trust`) passes its own.
 *
 * `flag: null` drops the second half, for a command that has no per-run
 * flag. A hint that names a flag the command rejects wastes a run and makes
 * the user doubt the rest of the hint.
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
