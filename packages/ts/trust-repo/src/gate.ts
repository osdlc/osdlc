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
 *
 * `scopes` names what the run needs trusted, `['*']` (the whole repository)
 * by default. A command can run more than one tool: a mise task runs mise,
 * which can run mise's hooks. Pass every tool the command will run. The root
 * is trusted only when each scope is, and `missing` lists the ones that are
 * not.
 */

import { WHOLE_REPO_SCOPE, type TrustStore } from './store.ts'

/**
 * The outcome of the trust check: whether to run, the configured value, whether the root is trusted and the reason.
 * @experimental
 */
export interface ExecGate {
  /** What the caller should actually do. */
  allowExec: boolean
  /** The layered/flagged configured value, before trust. */
  configured: boolean
  /**
   * Whether every scope in {@link scopes} is trusted. Always `false` when an
   * explicit `flag: false` meant the store was not read ({@link missing} is
   * empty then).
   */
  trusted: boolean
  /** Why {@link allowExec} came out the way it did. */
  reason: 'allowed' | 'allowed-by-flag' | 'untrusted' | 'configured-off'
  /** The resolved root the trust decision was keyed on. */
  root: string
  /** The scopes the gate was asked about, `['*']` by default. */
  scopes: string[]
  /**
   * The scopes in {@link scopes} that are not trusted, in the order given.
   * Empty when all are trusted, and when an explicit `flag: false` meant the
   * store was not read.
   */
  missing: string[]
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
   * Every scope the run needs trusted: `*` for the whole repository, or the
   * id of each tool the command will run. Defaults to `['*']`. An empty list
   * throws a `TypeError`.
   */
  scopes?: readonly string[] | undefined
  /**
   * A trust decision the caller already made, for every scope or per scope.
   * When set, it is used instead of `store.isTrusted(root, scope)`. This lets
   * a tool add a policy on top of the marker store: `trustDecision` checks
   * the store and a path/owner policy, and its result is passed in here. A
   * second, marker-only lookup could disagree with it. `root` is still
   * resolved through `store.resolveRoot`, so both use the same resolved path.
   */
  trusted?: boolean | ((scope: string) => boolean | Promise<boolean>)
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
  const scopes = [...(args.scopes ?? [WHOLE_REPO_SCOPE])]
  if (scopes.length === 0) throw new TypeError('resolveExecGate: scopes must not be empty')
  const resolved = await store.resolveRoot(root)
  const base = { configured, root: resolved, scopes }

  if (flag === false) {
    return { ...base, allowExec: false, trusted: false, reason: 'configured-off', missing: [] }
  }

  const given = args.trusted
  const isTrusted = (scope: string): boolean | Promise<boolean> =>
    given === undefined
      ? store.isTrusted(resolved, scope)
      : typeof given === 'function'
        ? given(scope)
        : given
  const missing: string[] = []
  for (const scope of scopes) if (!(await isTrusted(scope))) missing.push(scope)
  const trusted = missing.length === 0
  const gate = { ...base, trusted, missing }

  if (flag === true) return { ...gate, allowExec: true, reason: 'allowed-by-flag' }
  if (!configured) return { ...gate, allowExec: false, reason: 'configured-off' }
  if (!trusted) return { ...gate, allowExec: false, reason: 'untrusted' }
  return { ...gate, allowExec: true, reason: 'allowed' }
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
