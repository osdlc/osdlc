/** Containment: a path candidate sits inside its owner's roots or the targets; a ref has no folder to check. */

import { afterEach, describe, expect, test } from 'vitest'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import { Git } from '@osdlc/typed-git'
import { IDENTITY, makeGitFixture } from '@osdlc/typed-git/testing'

import { OUTSIDE_ROOTS, clean, containedIn, plan, survey } from '../src/index.ts'
import type { Candidate, Plugin, RunCtx } from '../src/index.ts'

const dirs: string[] = []
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})
const temp = (): string => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), 'host-cleaner-roots-')))
  dirs.push(d)
  return d
}

const ctx: RunCtx = { cwd: '/', targets: [], allow: [] }

/** A plugin owning `roots` (none when null) that proposes each of `paths` and deletes it with `rmSync`. */
function cachePlugin(roots: string[] | (() => string[]) | null, paths: string[]): Plugin {
  return {
    name: 'cache',
    detect: () => true,
    ...(roots === null ? {} : { roots: typeof roots === 'function' ? roots : () => roots }),
    discover: () =>
      paths.map((path): Candidate => ({
        id: `file:${path}`,
        kind: 'file',
        path,
        owner: 'cache',
        why: 'old',
        evidence: {},
      })),
    delete: (c) => {
      rmSync(c.path!, { recursive: true })
      return `removed ${c.path}`
    },
  }
}

describe('containedIn', () => {
  test('strictly inside, not the root itself, not a sibling, not through a link that leaves', () => {
    const base = temp()
    const root = join(base, 'cache')
    const other = join(base, 'other')
    mkdirSync(root)
    mkdirSync(other)
    writeFileSync(join(root, 'a'), '')
    writeFileSync(join(other, 'b'), '')
    symlinkSync(other, join(root, 'out'))
    expect(containedIn([root], join(root, 'a'))).toBe(root)
    expect(containedIn([root], join(root, 'new', 'file'))).toBe(root)
    expect(containedIn([root], root)).toBeNull()
    expect(containedIn([root], join(base, 'cache-2', 'a'))).toBeNull()
    expect(containedIn([root], join(root, 'out', 'b'))).toBeNull()
    // A link is judged by its target, so one pointing out of the root is not inside.
    expect(containedIn([root], join(root, 'out'))).toBeNull()
    expect(containedIn([root], join(root, '..', 'other', 'b'))).toBeNull()
    expect(containedIn([join(base, 'missing')], join(root, 'a'))).toBeNull()
    expect(containedIn([root], join(root, '..cache'))).toBe(root)
    expect(containedIn([root], `${root}/out/../victim`)).toBeNull()
    expect(containedIn([root], 'relative/path')).toBeNull()
  })
})

describe('a machine-scope plugin through plan, check, run and receipt', () => {
  test('rows inside the roots run; a row that resolves outside is blocked and its file stays', async () => {
    const base = temp()
    const root = join(base, 'cache')
    const other = join(base, 'other')
    mkdirSync(root)
    mkdirSync(other)
    writeFileSync(join(root, 'old'), 'x')
    writeFileSync(join(other, 'precious'), 'x')
    symlinkSync(other, join(root, 'link'))
    const p = cachePlugin([root], [join(root, 'old'), join(root, 'link', 'precious')])

    const s = await survey([p], ctx)
    expect(s.candidates).toHaveLength(2)
    expect(s.objections).toEqual([
      expect.objectContaining({ level: 'refuse', code: OUTSIDE_ROOTS, by: 'host-cleaner' }),
    ])

    const receiptPath = join(base, 'receipt.json')
    const receipt = await clean(plan(s), [p], ctx, { receiptPath })
    expect(receipt.steps.map((x) => [x.id, x.result])).toEqual([
      [`file:${join(root, 'old')}`, 'ok'],
    ])
    expect(existsSync(join(root, 'old'))).toBe(false)
    expect(existsSync(join(other, 'precious'))).toBe(true)
    expect(JSON.parse(readFileSync(receiptPath, 'utf8')).status).toBe('complete')
  })

  test('a path swapped for a link after the re-check fails its step instead of deleting outside', async () => {
    const base = temp()
    const root = join(base, 'cache')
    const other = join(base, 'other')
    mkdirSync(root)
    mkdirSync(other)
    writeFileSync(join(other, 'precious'), 'x')
    const victim = join(root, 'dir')
    mkdirSync(victim)
    const p = cachePlugin([root], [victim])
    const swapping: Plugin = {
      name: 'swap',
      detect: () => true,
      prepare: () => {
        rmSync(victim, { recursive: true })
        symlinkSync(other, victim)
      },
    }
    const receipt = await clean(plan(await survey([p, swapping], ctx)), [p, swapping], ctx)
    expect(receipt.steps[0]!.result).toBe('failed')
    expect(existsSync(join(other, 'precious'))).toBe(true)
  })
})

describe('roots that fail or are empty', () => {
  const rows = (root: string) => [join(root, 'a'), join(root, 'b')]

  test('roots that throw warn once and refuse every candidate of the plugin', async () => {
    const root = temp()
    const p = cachePlugin(() => {
      throw new Error('settings unreadable')
    }, rows(root))
    const s = await survey([p], ctx)
    expect(s.warnings).toEqual(['cache: roots failed: settings unreadable'])
    expect(s.objections.map((o) => [o.code, o.reason.includes("cache's roots (none)")])).toEqual([
      [OUTSIDE_ROOTS, true],
      [OUTSIDE_ROOTS, true],
    ])
  })

  test('no roots refuses every candidate of the plugin', async () => {
    const root = temp()
    const s = await survey([cachePlugin([], rows(root))], ctx)
    expect(s.objections.map((o) => o.code)).toEqual([OUTSIDE_ROOTS, OUTSIDE_ROOTS])
  })

  test('roots that throw at delete time fail the step and delete nothing', async () => {
    const root = temp()
    const file = join(root, 'a')
    writeFileSync(file, 'x')
    let broken = false
    const p = cachePlugin(() => {
      if (broken) throw new Error('gone away')
      return [root]
    }, [file])
    const breaker: Plugin = {
      name: 'breaker',
      detect: () => true,
      prepare: () => void (broken = true),
    }
    const receipt = await clean(plan(await survey([p, breaker], ctx)), [p, breaker], ctx)
    expect(receipt.steps[0]).toMatchObject({
      result: 'failed',
      error: 'cache: roots failed: gone away',
    })
    expect(existsSync(file)).toBe(true)
  })
})

describe('a plugin with no roots is held to the targets', () => {
  const sh = (cwd: string, args: string[]): void => {
    new Git(cwd, { env: { ...IDENTITY } }).rawChecked(args)
  }
  const refused = (s: { objections: readonly { candidate: string; code: string }[] }) =>
    s.objections.filter((o) => o.code === OUTSIDE_ROOTS).map((o) => o.candidate)

  test('~/Documents is refused outside-roots; a path inside a target is not, nor is a ref', async () => {
    const target = temp()
    const documents = join(homedir(), 'Documents')
    const p = cachePlugin(null, [documents, join(target, 'cache')])
    const ref: Plugin = {
      name: 'volumes',
      detect: () => true,
      discover: () => [
        {
          id: 'volume:data',
          kind: 'volume',
          ref: 'data',
          owner: 'volumes',
          why: 'unused',
          evidence: {},
        },
      ],
    }
    const s = await survey([p, ref], { ...ctx, targets: [target] })
    expect(refused(s)).toEqual([`file:${documents}`])
    expect(s.objections[0]).toMatchObject({
      by: 'host-cleaner',
      level: 'refuse',
      reason: `${documents} is not inside cache's roots (none) or the targets`,
    })
  })

  test('a target itself is refused; a linked checkout of a target outside it is not', async () => {
    const root = temp()
    makeGitFixture({ dir: root, initialBranch: 'main' })
    sh(root, ['commit', '--allow-empty', '-m', 'initial'])
    const linked = join(temp(), 'wt')
    sh(root, ['worktree', 'add', '-q', linked, '-b', 'linked'])
    const elsewhere = join(temp(), 'wt')
    mkdirSync(elsewhere)
    const p = cachePlugin(null, [root, linked, join(linked, 'target'), elsewhere])
    const s = await survey([p], { ...ctx, targets: [root] })
    expect(refused(s)).toEqual([`file:${root}`, `file:${elsewhere}`])
  })

  test('a target inside a repository holds only itself: a home kept in git does not open ~/Documents', async () => {
    const home = temp()
    makeGitFixture({ dir: home, initialBranch: 'main' })
    sh(home, ['commit', '--allow-empty', '-m', 'initial'])
    const dev = join(home, 'dev')
    mkdirSync(dev)
    const linked = join(temp(), 'wt')
    sh(home, ['worktree', 'add', '-q', linked, '-b', 'linked'])
    const documents = join(home, 'Documents')
    const p = cachePlugin(null, [documents, join(dev, 'cache'), linked, dev])
    const s = await survey([p], { ...ctx, targets: [dev] })
    expect(refused(s)).toEqual([`file:${documents}`, `file:${dev}`])
  })

  /** A repository at `dir` with one commit. */
  const repoAt = (dir: string): string => {
    mkdirSync(dir, { recursive: true })
    makeGitFixture({ dir, initialBranch: 'main' })
    sh(dir, ['commit', '--allow-empty', '-m', 'initial'])
    return dir
  }

  test('a container target holds a linked worktree outside it whose main checkout is inside, and clean deletes in it', async () => {
    const dev = temp()
    const repo = repoAt(join(dev, 'repo'))
    const linked = join(temp(), 'wt')
    sh(repo, ['worktree', 'add', '-q', linked, '-b', 'linked'])
    const target = join(linked, 'target')
    mkdirSync(target)
    writeFileSync(join(target, 'blob'), 'x')
    const plain = join(temp(), 'plain')
    mkdirSync(plain)
    const p = cachePlugin(null, [target, plain])
    const run: RunCtx = { ...ctx, targets: [dev] }
    const s = await survey([p], run)
    // The container is not in a repository, so no target lists the worktree.
    expect(s.linked).toEqual([])
    expect(refused(s)).toEqual([`file:${plain}`])
    expect((await survey([cachePlugin(null, [linked])], run)).objections).toEqual([])

    const receipt = await clean(plan(s), [p], run)
    expect(receipt.steps.map((x) => [x.id, x.result])).toEqual([[`file:${target}`, 'ok']])
    expect(existsSync(target)).toBe(false)
    expect(existsSync(plain)).toBe(true)
  })

  test('a linked worktree whose main checkout is outside every target is still refused, as is that checkout', async () => {
    const dev = temp()
    const repo = repoAt(join(temp(), 'repo'))
    const linked = join(temp(), 'wt')
    sh(repo, ['worktree', 'add', '-q', linked, '-b', 'linked'])
    const p = cachePlugin(null, [linked, join(linked, 'target'), join(repo, 'target')])
    const s = await survey([p], { ...ctx, targets: [dev] })
    expect(refused(s)).toEqual([
      `file:${linked}`,
      `file:${join(linked, 'target')}`,
      `file:${join(repo, 'target')}`,
    ])
  })

  test('a .git file copied out of a worktree, or a worktree moved from where it was added, is not one', async () => {
    const dev = temp()
    const repo = repoAt(join(dev, 'repo'))
    const linked = join(temp(), 'wt')
    sh(repo, ['worktree', 'add', '-q', linked, '-b', 'linked'])
    const forged = join(temp(), 'forged')
    mkdirSync(forged)
    copyFileSync(join(linked, '.git'), join(forged, '.git'))
    const added = join(temp(), 'wt2')
    sh(repo, ['worktree', 'add', '-q', added, '-b', 'moved'])
    const moved = join(temp(), 'moved')
    renameSync(added, moved)
    symlinkSync(moved, added)
    const p = cachePlugin(null, [join(forged, 'target'), moved, join(moved, 'target')])
    const s = await survey([p], { ...ctx, targets: [dev] })
    expect(refused(s)).toEqual([
      `file:${join(forged, 'target')}`,
      `file:${moved}`,
      `file:${join(moved, 'target')}`,
    ])
  })

  test('a target that is itself a linked worktree is never a candidate', async () => {
    const root = temp()
    makeGitFixture({ dir: root, initialBranch: 'main' })
    sh(root, ['commit', '--allow-empty', '-m', 'initial'])
    const linked = join(temp(), 'wt')
    sh(root, ['worktree', 'add', '-q', linked, '-b', 'linked'])
    const s = await survey([cachePlugin(null, [linked])], { ...ctx, targets: [linked] })
    expect(refused(s)).toEqual([`file:${linked}`])
  })

  test('a path swapped for a link out of the target fails its step at delete time', async () => {
    const target = temp()
    const other = temp()
    writeFileSync(join(other, 'precious'), 'x')
    const victim = join(target, 'dir')
    mkdirSync(victim)
    const p = cachePlugin(null, [victim])
    const swapping: Plugin = {
      name: 'swap',
      detect: () => true,
      prepare: () => {
        rmSync(victim, { recursive: true })
        symlinkSync(other, victim)
      },
    }
    const run: RunCtx = { ...ctx, targets: [target] }
    const receipt = await clean(plan(await survey([p, swapping], run)), [p, swapping], run)
    expect(receipt.steps[0]).toMatchObject({
      result: 'failed',
      error: `${victim} is not inside cache's roots (none) or the targets`,
    })
    expect(existsSync(join(other, 'precious'))).toBe(true)
  })
})
