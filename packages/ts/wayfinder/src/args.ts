/**
 * Turns typed trailing arguments into argv entries. The terminal's entry line
 * and the page's run bar share it, so the two always split quotes the same way.
 *
 * {@link runArgv} and {@link acceptArgs} are pure helpers only the tests call.
 * The web view's `/run` does not go through them: serve/routes.ts validates
 * its body (a non-string argument is a 400), and session.resolveRun pins the
 * binary with its own check over `runners.invocation`.
 */

import type { Project, Task } from '@osdlc/system-model/detect'

/**
 * The argv a task runs with: the caller's arguments bound the way the task's
 * tool expects (`project.runners.invoke`), so `npm run x -- --flag` gets its
 * `--`.
 *
 * The binary is always `task.argv[0]`, from a catalog this process built by
 * reading the repository, never from a request. A tool whose `invoke` changes
 * the binary is refused. The live `/run` path makes the same check in
 * session.resolveRun, not here.
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
 * Quotes group words as in sh. Outside quotes a backslash escapes the next
 * character. Inside single quotes every character is literal, a backslash
 * too, so `'C:\tmp'` stays as typed. Inside double quotes a backslash escapes
 * only `"`, `\`, `$` and a backtick, and is kept before anything else.
 *
 * There is no globbing, no variable expansion, no operators and no
 * substitution. The result goes to an `execvp`-style spawn as separate argv
 * entries, never to a shell, so `*.log` is passed through as the five
 * characters typed. This is the same rule that keeps `argv` separate from
 * `display`.
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
    if (quote === "'") {
      if (ch === "'") quote = null
      else current += ch
      continue
    }
    if (ch === '\\' && i + 1 < input.length) {
      const next = input[i + 1]!
      if (quote === '"' && !'"\\$`'.includes(next)) {
        current += ch
        continue
      }
      current += next
      i++
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
