/**
 * How a task's parameters are spelled for a reader.
 *
 * Its own module with its own `./params` export subpath, for the same reason
 * `duration.ts` and `match.ts` are: the web view is bundled for the browser,
 * and importing this from the package entry would drag `node:fs`,
 * `node:crypto` and `child_process` into that bundle. This module must stay
 * free of DOM and of node builtins — the `Param` import below is a type, so it
 * is erased.
 *
 * One spelling, three callers: just's runner builds `display` with it, the
 * TUI prints it under a command that ran without arguments, and the web view's
 * run bar shows it under the field.
 */

import type { Param } from './model.ts'

/**
 * Parameters in just's own notation — `<required>`, `[optional]`, and `+`/`*`
 * for a variadic that does and does not need an argument.
 *
 * Display only, and never executable: `<name>` is a shell redirection and `*`
 * globs, which is exactly why `argv` and `display` are separate fields. Empty
 * string for a task that takes none, so a caller can concatenate without a
 * length check.
 */
export function paramShape(parameters: readonly Param[]): string {
  return parameters
    .map((p) => {
      if (p.variadic) return `${p.required ? '+' : '*'}${p.name}`
      return p.required ? `<${p.name}>` : `[${p.name}]`
    })
    .join(' ')
}
