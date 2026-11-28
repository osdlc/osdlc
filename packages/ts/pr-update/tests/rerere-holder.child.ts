/**
 * Child process for `execute.test.ts`: `node rerere-holder.child.ts <repo> <worktree> <branch>`
 * stands in for a run that holds a managed clone's rerere cache. It takes the clone's rerere
 * lock, as a run does, and adds its run worktree, named for its own pid, on a scratch branch. It
 * prints `ready` and waits. On `go` it records a resolution of `<branch>`'s conflict with the
 * clone's `main`, `bad`, through its worktree, prints `recorded`, and kills itself with SIGKILL:
 * a run killed after recording and before its push, which leaves its lock and its resolution.
 */
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { Git } from '@osdlc/typed-git'

import { claimProcessLock } from '../src/process-lock.ts'

const [repo, worktreeRoot, branch] = process.argv.slice(2) as [string, string, string]
const git = new Git(repo)
const common = git.gitCommonDir()!
const token = claimProcessLock(join(resolve(repo, common), 'pr-update-rerere.lock'), 0)
if (token === null) {
  process.stdout.write('busy\n')
  process.exit(3)
}
const tree = join(worktreeRoot, `${process.pid}.${Date.now()}`)
git.raw(['worktree', 'add', '-q', '-b', `pr-update/scratch-${process.pid}`, tree, branch])
process.stdout.write('ready\n')

process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk: string) => {
  if (!chunk.includes('go')) return
  const wt = new Git(tree)
  const rr = ['-c', 'rerere.enabled=true', '-c', 'rerere.autoUpdate=false']
  try {
    wt.raw([...rr, 'merge', '--no-edit', 'main'])
  } catch {
    // The conflict this child is here to resolve.
  }
  writeFileSync(join(tree, 'shared.ts'), 'bad\n')
  wt.raw(['add', 'shared.ts'])
  wt.raw([
    ...rr,
    '-c',
    'user.name=t',
    '-c',
    'user.email=t@t',
    'commit',
    '-q',
    '--no-verify',
    '-m',
    'bad',
  ])
  process.stdout.write('recorded\n')
  process.kill(process.pid, 'SIGKILL')
})
