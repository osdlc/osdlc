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
 * Three callers share this format. just's runner builds `display` with it, the
 * TUI prints it under a command that ran without arguments, and the web view's
 * run bar shows it under the field.
 */

import type { Param } from './model.ts'

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
