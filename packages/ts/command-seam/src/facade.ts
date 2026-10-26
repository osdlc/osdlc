/**
 * Building blocks for a typed client over one program: a proxy that wraps
 * every method of a client, and the `try` form built on it, where each method
 * returns its failure as a `Result` instead of throwing it.
 *
 * Nothing here knows which program runs. The client decides which thrown
 * values are failures (`recognize`), so a bug such as a `TypeError` still
 * throws.
 */

import { err, ok, type Result } from '@osdlc/result'

/**
 * A proxy over `client` whose every function property calls `wrap`. `wrap`
 * gets the call to make and the method's name, and returns what the proxy's
 * method returns. Any other property reads through unchanged.
 *
 * A `Proxy` rather than a generated object: it mirrors whatever the client
 * has, including methods that call other methods, with nothing to keep in
 * step when a method is added. Each method runs on the client itself, not on
 * the proxy, so private state stays reachable, and a getter runs against the
 * client rather than recursing through the proxy.
 *
 * The return type is `unknown`: the caller knows what `wrap` makes of each
 * method and casts to that type.
 *
 * @param client - The object to mirror.
 * @param wrap - Makes the call, or not, and returns the proxy method's result.
 * @returns The proxy.
 *
 * @example
 * ```ts
 * const client = { name: () => 'git' }
 * const logged = methodFacade(client, (call, name) => {
 *   console.log(`calling ${name}`)
 *   return call()
 * }) as typeof client
 * logged.name()
 * ```
 */
export function methodFacade<C extends object>(
  client: C,
  wrap: (call: () => unknown, name: string) => unknown,
): unknown {
  return new Proxy(client, {
    get(target, prop) {
      // Read from the target, not the proxy: a getter must run against the
      // real client rather than recursing through the proxy.
      const value: unknown = Reflect.get(target, prop)
      if (typeof value !== 'function') return value
      const method = value as (...a: unknown[]) => unknown
      const name = String(prop)
      return (...args: unknown[]) => wrap(() => method.apply(target, args), name)
    },
  })
}

/** Every method of `C`, returning `Result<R, F>` instead of `R`. */
export type TriedMethods<C, F> = {
  [K in keyof C]: C[K] extends (...a: infer A) => infer R ? (...a: A) => Result<R, F> : never
}

/** Every awaitable method of `C`, promising `Result<R, F>` instead of `R`. */
export type TriedMethodsAsync<C, F> = {
  [K in keyof C]: C[K] extends (...a: infer A) => Promise<infer R>
    ? (...a: A) => Promise<Result<R, F>>
    : never
}

/**
 * Wrap a synchronous client so every method returns a `Result`: `ok` with
 * what it returned, or `err` with the failure it threw.
 *
 * `recognize` reads a thrown value: the failure it stands for, or `null` for
 * anything that is not one, which is thrown again. So a programmer mistake
 * still throws.
 *
 * @param client - The client to wrap.
 * @param recognize - The failure a thrown value carries, or `null`.
 * @returns The wrapped client.
 *
 * @example
 * ```ts
 * const git = spawnRunner('git')
 * const client = { head: () => runChecked(git, ['rev-parse', 'HEAD'], { cwd: '.' }).stdout }
 * const tried = tryMethods(client, (e) => (isCommandFailed(e) ? e.failure : null))
 * const head = tried.head()
 * if (!head.ok) console.error(head.error.message)
 * ```
 */
export function tryMethods<C extends object, F>(
  client: C,
  recognize: (error: unknown) => F | null,
): TriedMethods<C, F> {
  return methodFacade(client, (call): Result<unknown, F> => {
    try {
      return ok(call())
    } catch (error) {
      const failure = recognize(error)
      if (failure !== null) return err(failure)
      throw error
    }
  }) as TriedMethods<C, F>
}

/**
 * {@link tryMethods} for an awaitable client: every method promises a
 * `Result`, and a rejection `recognize` does not know rejects again.
 *
 * @param client - The client to wrap.
 * @param recognize - The failure a thrown value carries, or `null`.
 * @returns The wrapped client.
 */
export function tryMethodsAsync<C extends object, F>(
  client: C,
  recognize: (error: unknown) => F | null,
): TriedMethodsAsync<C, F> {
  return methodFacade(client, async (call): Promise<Result<unknown, F>> => {
    try {
      return ok(await call())
    } catch (error) {
      const failure = recognize(error)
      if (failure !== null) return err(failure)
      throw error
    }
  }) as TriedMethodsAsync<C, F>
}

/**
 * `value`, unless it starts with `-`: then the error `reject` builds is
 * thrown, before anything spawns.
 *
 * A program reads a positional argument that starts with `-` as an option,
 * and some options run code (`git`'s `--upload-pack=<cmd>` given as a remote
 * runs `<cmd>`). A wrapper puts each positional it was handed through this.
 * `reject` decides the error's class and message, so each wrapper keeps its
 * own.
 *
 * @param value - The positional argument.
 * @param reject - Builds the error to throw for `value`.
 * @returns `value`.
 *
 * @example
 * ```ts
 * const ref = notAnOption('main', (v) => new TypeError(`ref must not start with "-": ${v}`))
 * ```
 */
export function notAnOption(value: string, reject: (value: string) => Error): string {
  if (value.startsWith('-')) throw reject(value)
  return value
}
