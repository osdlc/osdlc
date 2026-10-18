/**
 * `withDefaults`: bind default options to a runner, so code that runs many
 * commands in one folder does not repeat `{ cwd, env, timeoutMs }` on every
 * call.
 */

/** Any runner: a `run(first, opts)` method. Every runner in this package fits. */
export interface AnyRunner {
  run(arg: never, opts: never): unknown
}

/** The options type of runner `Rn`. */
type RunOptions<Rn extends AnyRunner> = Parameters<Rn['run']>[1]

/** Per-call options once the keys `K` have defaults: those keys become optional. */
export type DefaultedOptions<O, K extends keyof O> = Omit<O, K> & Partial<Pick<O, K>>

/**
 * Runner `Rn` with defaults bound for the option keys `K`, as
 * `withDefaults` returns it: `DefaultedRunner<CommandRunner, 'cwd'>`. `opts`
 * may be left out when the defaults cover every required option. It is
 * still assignable to `Rn`, so it can be passed to code that takes one.
 *
 * @experimental
 */
export interface DefaultedRunner<Rn extends AnyRunner, K extends keyof RunOptions<Rn> = never> {
  /** The wrapped runner's `binary`, when it has one. */
  readonly binary?: string | undefined
  run(
    arg: Parameters<Rn['run']>[0],
    ...opts: {} extends DefaultedOptions<RunOptions<Rn>, K>
      ? [opts?: DefaultedOptions<RunOptions<Rn>, K>]
      : [opts: DefaultedOptions<RunOptions<Rn>, K>]
  ): ReturnType<Rn['run']>
}

/**
 * Return a runner that fills in `defaults` on every call. A per-call option
 * replaces the default of the same name, except `env`: a per-call `env` is
 * merged over the bound one, key by key, and a per-call `undefined` value
 * removes a bound variable. A per-call option set to `undefined` counts as
 * not given, so the default stays.
 *
 * Works with every runner type: capture, async, shell, streaming and
 * managed. `runChecked`, `runCheckedAsync`, `runJson` and `runJsonAsync`
 * take the result too. The defaults are shallow-copied when bound.
 *
 * @param runner - The runner to wrap.
 * @param defaults - Options applied to every call.
 * @returns A runner with the same `run`, whose options are now optional
 * where `defaults` covers them.
 *
 * @example
 * ```ts
 * const git = withDefaults(spawnRunner('git'), { cwd: repo, timeoutMs: 30_000 })
 * git.run(['status'])
 * git.run(['fetch'], { timeoutMs: 120_000 })
 * ```
 *
 * @experimental
 */
export function withDefaults<Rn extends AnyRunner, K extends keyof RunOptions<Rn> = never>(
  runner: Rn,
  defaults: Pick<RunOptions<Rn>, K> & Partial<RunOptions<Rn>>,
): DefaultedRunner<Rn, K> {
  const bound: Record<string, unknown> = { ...defaults }
  const target = runner as unknown as {
    binary?: unknown
    run(arg: unknown, opts: unknown): ReturnType<Rn['run']>
  }
  return {
    ...(typeof target.binary === 'string' ? { binary: target.binary } : {}),
    run(arg: unknown, opts?: object) {
      const merged = { ...bound }
      for (const [key, value] of Object.entries(opts ?? {})) {
        if (value === undefined) continue
        merged[key] =
          key === 'env' && isObject(value) && isObject(bound.env)
            ? { ...bound.env, ...value }
            : value
      }
      return target.run(arg, merged)
    },
  } as DefaultedRunner<Rn, K>
}

function isObject(v: unknown): v is object {
  return typeof v === 'object' && v !== null
}
