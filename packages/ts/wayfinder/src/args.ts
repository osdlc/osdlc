/**
 * Turns typed trailing arguments into argv entries. The terminal's entry line
 * and the page's run bar share it, so the two always split quotes the same way.
 *
 * {@link runArgv} and {@link acceptArgs} decide what a caller may add to a
 * spawn and what it may not. As pure functions they can be tested. The route
 * they protect cannot, because a successful call hands over the terminal and
 * exits the process.
 */

import type { Project, Task } from '@osdlc/system-model/detect'

/**
 * The argv a task runs with: the caller's arguments bound the way the task's
 * tool expects (`project.runners.invoke`), so `npm run x -- --flag` gets its
 * `--`.
 *
 * The binary is always `task.argv[0]`, from a catalog this process built by
 * reading the repository, never from a request. `/api/run` is reachable by any
 * process on the machine and any site the browser visits, so a caller that
 * could set element 0 could run anything. A tool whose `invoke` changes the
 * binary is refused.
 */
export function runArgv(project: Project, task: Task, args: readonly string[] = []): string[] {
  if (args.length === 0) return [...task.argv]
  const argv = project.runners.invoke(task, args)
  if (argv[0] !== task.argv[0]) {
    throw new Error(`${task.runner}: invoke changed the binary from ${task.argv[0]} to ${argv[0]}`)
  }
  return argv
}

/**
 * The argument list from an untrusted JSON body, or an empty one.
 *
 * Non-strings are dropped rather than converted. `String(value)` would quietly
 * pass `"[object Object]"` or `"null"` to a spawn as a real argument, and an
 * argument nobody typed is worse than a missing one.
 */
export function acceptArgs(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((a): a is string => typeof a === 'string')
}

/**
 * Split typed arguments into words the way a shell does, and do nothing else
 * a shell does.
 *
 * Quotes group and a backslash escapes the next character. There is no
 * globbing, no variable expansion, no operators and no substitution. The
 * result goes to an `execvp`-style spawn as separate argv entries, never to a
 * shell, so `*.log` is passed through as the five characters typed. This is
 * the same rule that keeps `argv` separate from `display`.
 *
 * This is not `.split(/\s+/)` for one reason: a quoted `"two words"` must stay
 * one argument.
 */
export function splitArgs(input: string): string[] {
  const out: string[] = []
  let current = ''
  let started = false
  let quote: '"' | "'" | null = null
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!
    if (ch === '\\' && i + 1 < input.length) {
      current += input[++i]!
      started = true
      continue
    }
    if (quote === null && (ch === '"' || ch === "'")) {
      quote = ch
      started = true
      continue
    }
    if (quote === ch) {
      quote = null
      continue
    }
    if (quote === null && /\s/.test(ch)) {
      if (started) {
        out.push(current)
        current = ''
        started = false
      }
      continue
    }
    current += ch
    started = true
  }
  // An unclosed quote keeps what was typed rather than dropping it. Losing the
  // user's text would be worse than passing a word they can see in the
  // command shown above the run.
  if (started) out.push(current)
  return out
}
