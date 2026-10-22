/**
 * Need: run commands a user wrote in a config file (`lint: "eslint . && tsc"`,
 * `format: "prettier --write {file}"`), which are shell by nature, without
 * letting a file name turn into shell.
 *
 * `runShell` and `runShellAsync` run `sh -c -- <verb>`; every other runner
 * passes argv straight to a binary. Data goes in one of two ways: quoted
 * into the verb with `shellQuote`, or passed as positional parameters (`$1`,
 * `$2`, …) with `args`, which needs no quoting.
 * `shellJoin` prints an argv as a line a person can paste.
 */

import { expect, test } from 'vitest'

import {
  runShell,
  runShellAsync,
  shellJoin,
  shellQuote,
  type AsyncShellRunOptions,
  type CommandResult,
  type ShellPositionals,
  type ShellRunOptions,
} from '@osdlc/command-seam'

// ---- Code under test -------------------------------------------------------

interface Hook {
  name: string
  run: string
}

/** Fill `{file}` in a configured command, quoted so the path stays one word. */
function expandTemplate(template: string, file: string): string {
  return template.replaceAll('{file}', shellQuote(file))
}

/** Run one hook over the changed files. */
function runHook(hook: Hook, cwd: string, files: string[]): CommandResult {
  // The hook sees its own name as `$0` and the files as `$1`, `$2`, …
  const positionals: ShellPositionals = { scriptName: hook.name, args: files }
  const opts: ShellRunOptions = { cwd, timeoutMs: 60_000, ...positionals }
  return runShell(hook.run, opts)
}

/** Run independent hooks at once; `signal` cancels the ones still running. */
function runHooksAtOnce(hooks: Hook[], cwd: string, signal?: AbortSignal) {
  return Promise.all(
    hooks.map((hook) => {
      const opts: AsyncShellRunOptions = {
        cwd,
        timeoutMs: 60_000,
        signal,
        scriptName: hook.name,
      }
      return runShellAsync(hook.run, opts)
    }),
  )
}

/** A line the user can paste to run a failed step again. */
function reproLine(argv: string[]): string {
  return `to reproduce: ${shellJoin(argv)}`
}

// ---- Tests -----------------------------------------------------------------

test('a file name is quoted into the template', () => {
  expect(expandTemplate('prettier --write {file}', "it's here; rm -rf ~")).toBe(
    `prettier --write 'it'\\''s here; rm -rf ~'`,
  )
  // A plain path stays readable.
  expect(expandTemplate('prettier --write {file}', 'src/a.ts')).toBe('prettier --write src/a.ts')
})

test('the repro line pastes back as the same argv', () => {
  expect(reproLine(['git', 'commit', '-m', 'fix: handle "quotes" & spaces'])).toBe(
    `to reproduce: git commit -m 'fix: handle "quotes" & spaces'`,
  )
})

// ---- The real runner -------------------------------------------------------

test('real hooks run through sh with their data intact', async () => {
  const cwd = process.cwd()
  const odd = "a b; c's"

  const listed = runHook({ name: 'list', run: 'printf "%s|" "$0" "$@" && echo' }, cwd, ['x', odd])
  const formatted = runShell(expandTemplate("printf '%s' {file}", odd), { cwd })
  const [first, second] = await runHooksAtOnce(
    [
      { name: 'one', run: 'printf "b\\na\\n" | sort | head -1' },
      { name: 'two', run: 'echo "$0"' },
    ],
    cwd,
  )

  expect(listed.stdout).toBe(`list|x|${odd}|\n`)
  expect(formatted.stdout).toBe(odd)
  expect([first?.stdout, second?.stdout]).toEqual(['a\n', 'two\n'])
}, 15_000)
