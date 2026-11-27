/**
 * Child process for `execute.test.ts`: `node killed-run.child.ts <repo> <worktree> <head> <oid>`
 * runs `updateAll` with rerere on, as in a managed clone, for one PR whose merge conflicts on
 * `shared.ts`. The repair writes `bad`, the merge commit records that resolution, and the
 * process kills itself with SIGKILL while verify runs, before anything accepts it. So it leaves
 * what a hard-killed run leaves: its ledger, under its own pid, and the recorded resolution.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { Git } from '@osdlc/typed-git'

import { updateAll } from '../src/update/execute.ts'

const [repo, worktreeRoot, head, headOid] = process.argv.slice(2) as [
  string,
  string,
  string,
  string,
]
const results = await updateAll(
  new Git(repo),
  [
    {
      repo: 'o/r',
      number: 1,
      head,
      base: 'main',
      headOid,
      baseOid: null,
      strategy: 'merge',
    },
  ],
  {
    remote: 'origin',
    resolvers: [],
    lockfileInstall: null,
    verifyVerbs: ['check'],
    rerere: true,
    repairOn: ['conflict'],
    repair: async (req) => {
      writeFileSync(join(req.worktree, 'shared.ts'), 'bad\n')
      return { ok: true, note: 'fixed' }
    },
  },
  () => {
    process.kill(process.pid, 'SIGKILL')
    return { exitCode: 1, stdout: '', stderr: '' }
  },
  { apply: true, worktreeRoot },
)
// Reached only when the run was not killed, which the test reports.
process.stdout.write(JSON.stringify(results))
