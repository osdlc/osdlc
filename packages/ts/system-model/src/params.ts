/**
 * How a task's parameters are written for a reader.
 *
 * This is its own module with its own `./params` export subpath, for the same
 * reason as `duration.ts` and `match.ts`. The web view is bundled for the
 * browser, and importing this from the detection entry would pull `node:fs`,
 * `node:crypto` and `child_process` into that bundle. This module must not use
 * the DOM or Node built-ins. The `Param` import below is type-only, so it is
 * erased.
 *
 * {@link bindParams} is here too, so a page can check values before it sends
 * them.
 *
 * Three callers share the display format. just's runner builds `display` with it, the
 * TUI prints it under a command that ran without arguments, and the web view's
 * run bar shows it under the field.
 */

import type { Param, ParamValues } from './model.ts'

/**
 * Parameters in just's own notation: `<required>`, `[optional]`, and `+` or
 * `*` for a variadic that does or does not need an argument.
 *
 * For display only, never for running. `<name>` is a shell redirection and
 * `*` is a glob, which is why `argv` and `display` are separate fields.
 * Returns an empty string for a task with no parameters, so a caller can
 * concatenate without a length check.
 */
export function paramShape(parameters: readonly Param[]): string {
  return parameters
    .map((p) => {
      if (p.variadic) return `${p.required ? '+' : '*'}${p.name}`
      return p.required ? `<${p.name}>` : `[${p.name}]`
    })
    .join(' ')
}

/** Parameter values sorted by where they go, from {@link bindParams}. */
export interface BoundParams {
  /** Values of `positional` parameters, in parameter order, for the runner's own rule. */
  positional: string[]
  /** `flag` and `assign` arguments, in parameter order. */
  named: string[]
  /** `env` values. */
  env: Record<string, string>
}

/**
 * Sort `values` by each parameter's `binding`. A missing value takes the
 * parameter's default, if it has one.
 *
 * Throws when a name is not a parameter, a required parameter has no value,
 * a value is not one of the parameter's `choices`, or a list is given to a
 * parameter that is not variadic.
 */
export function bindParams(parameters: readonly Param[], values: ParamValues): BoundParams {
  const known = new Set(parameters.map((p) => p.name))
  const unknown = Object.keys(values).filter((name) => !known.has(name))
  if (unknown.length > 0) throw new Error(`unknown parameter: ${unknown.join(', ')}`)

  const out: BoundParams = { positional: [], named: [], env: {} }
  // A skipped positional would shift every later one into its slot.
  let skipped: string | undefined
  for (const p of parameters) {
    const given = values[p.name]
    if (given !== undefined && typeof given !== 'string' && !p.variadic) {
      throw new Error(`parameter ${p.name} takes one value`)
    }
    const list = given === undefined ? (p.default === undefined ? [] : [p.default]) : [given].flat()
    const binding = p.binding ?? { kind: 'positional' }
    if (list.length === 0) {
      if (p.required) throw new Error(`parameter ${p.name} needs a value`)
      if (binding.kind === 'positional') skipped ??= p.name
      continue
    }
    if (binding.kind === 'positional' && skipped !== undefined) {
      throw new Error(`parameter ${p.name} has a value but the earlier ${skipped} has none`)
    }
    const bad = p.choices === undefined ? undefined : list.find((v) => !p.choices!.includes(v))
    if (bad !== undefined) {
      throw new Error(`parameter ${p.name} takes one of ${p.choices!.join(', ')}, not ${bad}`)
    }
    if (binding.kind === 'env') {
      out.env[binding.name] = list.join(' ')
      continue
    }
    for (const value of list) {
      switch (binding.kind) {
        case 'positional':
          out.positional.push(value)
          break
        case 'flag':
          out.named.push(
            binding.flag,
            binding.key === undefined ? value : `${binding.key}=${value}`,
          )
          break
        case 'assign':
          out.named.push(`${binding.name ?? p.name}=${value}`)
          break
      }
    }
  }
  return out
}
