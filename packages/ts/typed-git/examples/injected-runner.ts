// Inject a fake CommandRunner to record the argv and to simulate a failing git.
import assert from 'node:assert/strict'

import { CommandFailed, Git, type CommandRunner } from '@osdlc/typed-git'

export function run(): void {
  const calls: string[][] = []
  const recording: CommandRunner = {
    run(argv) {
      calls.push(argv)
      return { exitCode: 0, stdout: 'main\n', stderr: '' }
    },
  }
  const git = new Git('/nowhere', { runner: recording })
  assert.equal(git.currentBranch(), 'main')
  assert.deepEqual(calls, [['branch', '--show-current']])

  // An exit code the verb does not declare as absence throws.
  const failing: CommandRunner = {
    run: () => ({ exitCode: 128, stdout: '', stderr: 'fatal: not a git repository\n' }),
  }
  const broken = new Git('/nowhere', { runner: failing })
  assert.throws(() => broken.currentBranch(), CommandFailed)
}
