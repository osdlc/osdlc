/**
 * `pr-update kept push`: a kept worktree, found through its record, pushed as a branch to a
 * remote or a local repository. Every remote is a local bare repository; github.com is only a
 * remote URL the project root names, never contacted.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

import { EXIT, captureContext } from '@osdlc/cli-tool'
import { spawnRunner } from '@osdlc/command-seam'
import { osdlcDirs } from '@osdlc/ecosystem'

import { main } from '../src/cli.ts'
import { CLONE_MARKER } from '../src/mirror.ts'
import { prUpdatePaths } from '../src/machine.ts'
import { allToolsInstalled, isolatedEnv } from './support.ts'

let scratch: string
let env: Record<string, string>
let paths: ReturnType<typeof prUpdatePaths>
/** The project root: a checkout whose origin names github.com/acme/api. */
let root: string
/** A local bare repository, the root's remote `mine`. */
let mine: string

function git(dir: string, ...argv: string[]): string {
  const res = spawnRunner('git').run(argv, { cwd: dir })
  if (res.exitCode !== 0) throw new Error(`git ${argv.join(' ')}: ${res.stderr}`)
  return res.stdout.trim()
}

const commit = (dir: string, message: string): string => {
  git(
    dir,
    '-c',
    'user.name=t',
    '-c',
    'user.email=t@t',
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    message,
  )
  return git(dir, 'rev-parse', 'HEAD')
}

beforeEach(() => {
  scratch = realpathSync.native(mkdtempSync(join(tmpdir(), 'pr-update-kept-')))
  env = isolatedEnv(join(scratch, 'env'))
  paths = prUpdatePaths(osdlcDirs({ env }))
  root = join(scratch, 'api')
  mkdirSync(root)
  git(root, 'init', '-q', '-b', 'main')
  commit(root, 'base')
  git(root, 'remote', 'add', 'origin', 'https://github.com/acme/api.git')
  mine = join(scratch, 'mine.git')
  git(scratch, 'init', '-q', '--bare', mine)
  git(root, 'remote', 'add', 'mine', mine)
})
afterEach(() => {
  rmSync(scratch, { recursive: true, force: true })
})

/**
 * A kept worktree of the root for PR `number`, as a run leaves it: a run worktree folder in
 * `worktrees/` (named for a run, so no test can guess it from the PR), on its PR's branch, with a
 * commit of its own, and its record in `kept/`.
 */
function keep(number: number, repo = 'acme/api', owner = root): { tree: string; sha: string } {
  const runs = join(paths.worktrees, 'github.com', ...repo.split('/'))
  const tree = join(runs, `${process.pid}.${Date.now() + number}`)
  mkdirSync(runs, { recursive: true })
  const branch = `pr-update/failed-${repo.replace('/', '-')}-${number}`
  git(owner, 'worktree', 'add', '-q', '-b', branch, tree, 'main')
  const sha = commit(tree, `built ${number}`)
  const records = join(paths.kept, 'github.com', ...repo.split('/'))
  mkdirSync(records, { recursive: true })
  const record = {
    repo,
    number,
    head: 'topic',
    base: 'main',
    headOid: null,
    baseOid: null,
    path: tree,
    branch,
    gitDir: realpathSync.native(existsSync(join(owner, '.git')) ? join(owner, '.git') : owner),
  }
  writeFileSync(join(records, `${number}.json`), JSON.stringify(record))
  return { tree, sha }
}

async function run(
  cwd: string,
  ...argv: string[]
): Promise<{ code: number; out: string; err: string }> {
  const ctx = captureContext({ cwd, env })
  const code = await main(argv, ctx, { which: allToolsInstalled })
  return { code, out: ctx.io.out, err: ctx.io.err }
}

/** The commit `branch` holds in the bare repository `bare`, or '' when it has none. */
const tip = (bare: string, branch: string): string =>
  git(bare, 'for-each-ref', '--format=%(objectname)', `refs/heads/${branch}`)

describe('kept push', () => {
  test("pushes the kept tree's HEAD, found through its record, to a remote, as its PR's branch", async () => {
    const { tree, sha } = keep(7)
    const r = await run(root, 'kept', 'push', '7', '--to', 'mine', '--json')
    expect(r.code, r.err).toBe(EXIT.ok)
    expect(JSON.parse(r.out)).toMatchObject({
      kind: 'kept-push',
      repo: 'github.com/acme/api',
      number: 7,
      worktree: tree,
      sha,
      to: 'mine',
      branch: 'pr-update/failed-acme-api-7',
      replaced: null,
    })
    expect(tip(mine, 'pr-update/failed-acme-api-7')).toBe(sha)
    // The tree is not changed.
    expect(git(tree, 'rev-parse', 'HEAD')).toBe(sha)
    expect(git(tree, 'branch', '--show-current')).toBe('pr-update/failed-acme-api-7')
  })

  test('pushes to a local path, relative to the working directory, as --branch, and says so in text', async () => {
    const { tree, sha } = keep(7)
    const elsewhere = join(scratch, 'elsewhere.git')
    git(scratch, 'init', '-q', '--bare', elsewhere)
    const r = await run(
      root,
      'kept',
      'push',
      '7',
      '--to',
      relative(root, elsewhere),
      '--branch',
      'look/at-7',
    )
    expect(r.code, r.err).toBe(EXIT.ok)
    expect(r.out).toBe(`pushed ${sha.slice(0, 12)} from ${tree} to ${elsewhere} as look/at-7\n`)
    expect(tip(elsewhere, 'look/at-7')).toBe(sha)
  })

  test('refuses a branch that is there already; --force replaces it with a lease', async () => {
    const { sha } = keep(7)
    const other = join(scratch, 'other')
    git(scratch, 'clone', '-q', mine, other)
    commit(other, 'theirs')
    git(other, 'push', '-q', 'origin', 'HEAD:refs/heads/pr-update/failed-acme-api-7')
    const theirs = tip(mine, 'pr-update/failed-acme-api-7')

    const refused = await run(root, 'kept', 'push', '7', '--to', 'mine')
    expect(refused.code).toBe(EXIT.error)
    expect(refused.err).toContain(
      `mine has pr-update/failed-acme-api-7 already, at ${theirs.slice(0, 12)}; pass --force to replace it`,
    )
    expect(tip(mine, 'pr-update/failed-acme-api-7')).toBe(theirs)

    const forced = await run(root, 'kept', 'push', '7', '--to', 'mine', '--force', '--json')
    expect(forced.code, forced.err).toBe(EXIT.ok)
    expect(JSON.parse(forced.out)).toMatchObject({ sha, replaced: theirs })
    expect(tip(mine, 'pr-update/failed-acme-api-7')).toBe(sha)
  })

  test('a PR with no kept tree exits 1, and pushes nothing', async () => {
    keep(7)
    const r = await run(root, 'kept', 'push', '8', '--to', 'mine')
    expect(r.code).toBe(EXIT.error)
    expect(r.err).toContain('github.com/acme/api#8: no kept worktree')
    expect(git(mine, 'for-each-ref')).toBe('')
  })

  test('--repo, or owner/name#<number>, names the repository, from a folder that is no checkout', async () => {
    const web = join(scratch, 'web')
    mkdirSync(web)
    git(web, 'init', '-q', '-b', 'main')
    commit(web, 'base')
    const { sha } = keep(3, 'acme/web', web)
    const away = join(scratch, 'away')
    mkdirSync(away)
    const first = await run(
      away,
      'kept',
      'push',
      '3',
      '--repo',
      'github.com/acme/web',
      '--to',
      mine,
    )
    expect(first.code, first.err).toBe(EXIT.ok)
    expect(tip(mine, 'pr-update/failed-acme-web-3')).toBe(sha)
    const second = await run(away, 'kept', 'push', 'acme/web#3', '--to', mine, '--branch', 'b')
    expect(second.code, second.err).toBe(EXIT.ok)
    expect(tip(mine, 'b')).toBe(sha)
    // Not both.
    const both = await run(away, 'kept', 'push', 'acme/web#3', '--repo', 'acme/web', '--to', mine)
    expect(both.code).toBe(EXIT.usage)
  })

  test.each([
    [['kept', 'push', 'seven', '--to', 'mine'], '<pr> seven: not a PR number'],
    [['kept', 'push', '7', '--to', 'mine', '--branch', 'a..b'], '--branch a..b: not a branch name'],
    [['kept', 'push', '7', '--to', 'nowhere'], '--to nowhere: not a remote of this repository'],
  ])('%j is a usage error', async (argv, message) => {
    keep(7)
    const r = await run(root, ...argv)
    expect(r.code).toBe(EXIT.usage)
    expect(r.err).toContain(message)
  })

  test("a record naming a run's worktree, on its scratch branch, is not pushed", async () => {
    const { tree } = keep(7)
    git(tree, 'switch', '-q', '-c', 'pr-update/scratch-x')
    const r = await run(root, 'kept', 'push', '7', '--to', 'mine')
    expect(r.code).toBe(EXIT.error)
    expect(r.err).toContain(`${tree} is a run’s worktree, on its scratch branch`)
    expect(git(mine, 'for-each-ref')).toBe('')
  })

  /**
   * Make the owning git directory's config writable by anyone, holding a command git runs on the
   * push (`remote.mine.uploadpack`, which `ls-remote mine` runs), and return the marker that
   * command writes.
   */
  function plantCommand(gitDir: string): string {
    const marker = join(scratch, 'ran')
    const script = join(scratch, 'sentinel.sh')
    writeFileSync(script, `#!/bin/sh\n: > '${marker}'\nexit 1\n`)
    chmodSync(script, 0o755)
    git(gitDir, 'config', 'remote.mine.url', mine)
    git(gitDir, 'config', 'remote.mine.uploadpack', script)
    chmodSync(join(gitDir, 'config'), 0o666)
    return marker
  }

  test.skipIf(process.platform === 'win32')(
    'a checkout owner whose config others can write is refused, and nothing in it runs (review round 2)',
    async () => {
      keep(7)
      const marker = plantCommand(join(root, '.git'))
      const r = await run(root, 'kept', 'push', '7', '--to', 'mine')
      expect(existsSync(marker)).toBe(false)
      expect(r.code).toBe(EXIT.error)
      expect(r.err).toContain(join(root, '.git', 'config'))
      expect(git(mine, 'for-each-ref')).toBe('')
    },
  )

  test.skipIf(process.platform === 'win32')(
    'a managed clone owner whose config others can write is refused, and nothing in it runs (review round 2)',
    async () => {
      const clone = join(scratch, 'clones', 'github.com', 'acme', 'api.git')
      mkdirSync(join(clone, '..'), { recursive: true })
      git(scratch, 'clone', '-q', '--bare', root, clone)
      writeFileSync(join(clone, CLONE_MARKER), '')
      keep(7, 'acme/api', clone)
      const marker = plantCommand(clone)
      const r = await run(root, 'kept', 'push', '7', '--to', 'mine')
      expect(existsSync(marker)).toBe(false)
      expect(r.code).toBe(EXIT.error)
      expect(r.err).toContain(join(clone, 'config'))
      expect(git(mine, 'for-each-ref')).toBe('')
    },
  )

  test.skipIf(process.platform === 'win32')(
    "the pushing repository's hooks do not run; a local repository's own receive hooks do",
    async () => {
      const { sha } = keep(7)
      const markers = join(scratch, 'markers')
      mkdirSync(markers)
      const hook = (dir: string, name: string): void => {
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, name), `#!/bin/sh\n: > '${join(markers, name)}'\n`)
        chmodSync(join(dir, name), 0o755)
      }
      hook(join(root, '.husky'), 'pre-push')
      git(root, 'config', 'core.hooksPath', '.husky')
      hook(join(mine, 'hooks'), 'pre-receive')

      const r = await run(root, 'kept', 'push', '7', '--to', 'mine')
      expect(r.code, r.err).toBe(EXIT.ok)
      expect(tip(mine, 'pr-update/failed-acme-api-7')).toBe(sha)
      expect(existsSync(join(markers, 'pre-push'))).toBe(false)
      expect(existsSync(join(markers, 'pre-receive'))).toBe(true)
    },
  )
})
