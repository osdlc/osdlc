/**
 * A small tool that bundles its code imports the verbs it calls and runs
 * them with `runVerb`, and constructs no `Gh`. A bundler drops the verbs it
 * never imports. It cannot drop a class's unused methods, so one `new Gh()`
 * keeps every verb and parser in the bundle.
 *
 * `raw` and `rawChecked` are `Gh.raw` and `Gh.rawChecked` as verbs, for a
 * call the verb table does not have.
 */

import { expect, test } from 'vitest'

import {
  prDiff,
  raw,
  rawChecked,
  runVerb,
  type CommandResult,
  type CommandRunner,
} from '@osdlc/typed-gh'

const answers: Record<string, CommandResult> = {
  'pr diff 7': { exitCode: 0, stdout: 'diff --git a/x b/x\n', stderr: '' },
  'api repos/{owner}/{repo}/pulls/7/files': { exitCode: 0, stdout: '[]', stderr: '' },
}
// Real code passes `defaultRunnerFactory('gh')`, which leaves `Gh` out of the bundle too.
const runner: CommandRunner = {
  run: (argv) => answers[argv.join(' ')] ?? { exitCode: 1, stdout: '', stderr: 'unknown command' },
}
const opts = { cwd: '/repo' }

test('a diff and a raw checked call, with no Gh', () => {
  const diff = runVerb(prDiff(7), runner, opts)
  const files = runVerb(rawChecked(['api', 'repos/{owner}/{repo}/pulls/7/files']), runner, opts)

  expect(diff).toContain('diff --git')
  expect(JSON.parse(files.stdout)).toEqual([])
})

test('raw hands back a failed result; rawChecked throws it', () => {
  expect(runVerb(raw(['pr', 'checks', '7']), runner, opts).exitCode).toBe(1)
  expect(() => runVerb(rawChecked(['pr', 'checks', '7']), runner, opts)).toThrow()
})
