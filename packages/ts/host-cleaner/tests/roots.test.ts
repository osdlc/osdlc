/** Containment: a path candidate sits inside its owner's roots or the targets; a ref has no folder to check. */

import { afterEach, describe, expect, test, vi } from 'vitest'
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
import { dirname, join } from 'node:path'

import { Git } from '@osdlc/typed-git'
import { IDENTITY, makeGitFixture } from '@osdlc/typed-git/testing'

import { z } from 'zod'

import {
  OUTSIDE_ROOTS,
  PLUGIN_API,
  clean,
  containedIn,
  definePlugin,
  plan,
  pluginKit,
  survey,
} from '../src/index.ts'
import type { Candidate, Plugin, Root, RunCtx } from '../src/index.ts'
import { boundBy, rootProblem } from '../src/roots.ts'
import { contractSuite } from '../src/testing.ts'

const dirs: string[] = []
afterEach(() => {
  vi.unstubAllEnvs()
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

  test('a root refused after the re-check fails its step and says why the root was refused', async () => {
    const base = temp()
    const root = join(base, 'cache')
    mkdirSync(root)
    writeFileSync(join(root, 'old'), 'x')
    let calls = 0
    // The survey and the re-check see the cache; the delete sees the home folder itself.
    const p = cachePlugin(() => (++calls <= 2 ? [root] : [base]), [join(root, 'old')])
    const at: RunCtx = { ...ctx, home: base }
    const receipt = await clean(plan(await survey([p], at)), [p], at)
    expect(receipt.steps).toEqual([
      expect.objectContaining({
        result: 'failed',
        error: expect.stringMatching(
          /not inside cache's roots \(none\).*; roots refused: .*home folder/,
        ),
      }),
    ])
    expect(existsSync(join(root, 'old'))).toBe(true)
  })

  test('the home folder the run names is the one no root may be', async () => {
    const base = temp()
    const s = await survey([cachePlugin([base], [])], { ...ctx, home: base })
    expect(s.roots['cache']).toEqual([])
    expect(s.warnings).toEqual([expect.stringMatching(/^cache: roots: .*home folder/)])
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

describe('a root declared { path, self: true }', () => {
  const sh = (cwd: string, args: string[]): void => {
    new Git(cwd, { env: { ...IDENTITY } }).rawChecked(args)
  }
  const refusedIds = (s: { objections: readonly { candidate: string; code: string }[] }) =>
    s.objections.filter((o) => o.code === OUTSIDE_ROOTS).map((o) => o.candidate)

  /** A plugin built on a kit, owning `roots` and proposing each of `paths`, which `delete` removes with `kit.remove`. */
  function storePlugin(roots: () => readonly Root[], paths: readonly string[]): Plugin {
    const def = definePlugin({
      name: 'store',
      api: PLUGIN_API,
      settings: z.strictObject({}),
      create: ({ kit }): Plugin => ({
        name: 'store',
        detect: () => true,
        roots,
        discover: () => paths.map((path) => kit.candidate({ kind: 'store', path, why: 'idle' })),
        delete: (c) => kit.remove(c.path!),
      }),
    })
    return def.create({ settings: {}, only: [], env: {}, kit: pluginKit('store') })
  }

  /** A home folder of its own, as `HOME`, with `.npm/_cacache/blob` in it. */
  const homeWithStore = (): { home: string; store: string } => {
    const home = join(temp(), 'home')
    const store = join(home, '.npm')
    mkdirSync(join(store, '_cacache'), { recursive: true })
    writeFileSync(join(store, '_cacache', 'blob'), 'x')
    vi.stubEnv('HOME', home)
    return { home, store }
  }

  test('the store folder itself is a candidate, and clean removes it through kit.remove; a plain root still is not', async () => {
    const { home, store } = homeWithStore()
    const plain = storePlugin(() => [store], [store])
    expect(refusedIds(await survey([plain], ctx))).toEqual([`store:${store}`])

    const p = storePlugin(() => [{ path: store, self: true }], [store, join(store, '_cacache')])
    const s = await survey([p], ctx)
    expect(s.warnings).toEqual([])
    expect(s.objections).toEqual([])
    expect(s.roots).toEqual({ store: [store] })
    expect(s.selfRoots).toEqual({ store: [store] })
    const receipt = await clean(plan(s), [p], ctx)
    expect(receipt.steps.map((x) => [x.id, x.result])).toEqual([
      [`store:${join(store, '_cacache')}`, 'ok'],
      [`store:${store}`, 'ok'],
    ])
    expect(existsSync(store)).toBe(false)
    expect(existsSync(home)).toBe(true)
  })

  test('the contract suite accepts a plugin whose candidate is its self root, and catches it moved behind a link', async () => {
    const { store } = homeWithStore()
    const p = storePlugin(() => [{ path: store, self: true }], [store])
    expect(await contractSuite(p)).toEqual([])
    expect(existsSync(join(store, '_cacache', 'blob'))).toBe(true)
  })

  test('refused as a root, plain or self, with a warning, and its candidates refused outside-roots: /, home, a folder holding home, a personal folder, a target, a folder holding a target, a checkout, a folder holding a linked checkout', async () => {
    const { home } = homeWithStore()
    const documents = join(home, 'Documents')
    mkdirSync(documents)
    const target = join(temp(), 'target')
    mkdirSync(target)
    makeGitFixture({ dir: target, initialBranch: 'main' })
    sh(target, ['commit', '--allow-empty', '-m', 'initial'])
    const holder = temp()
    const linked = join(holder, 'wt')
    sh(target, ['worktree', 'add', '-q', linked, '-b', 'linked'])
    const checkout = join(temp(), 'checkout')
    mkdirSync(join(checkout, '.git'), { recursive: true })
    const cases: Array<[string, string]> = [
      ['/', 'it is the filesystem root'],
      [home, 'it is the home folder'],
      [dirname(home), 'it holds the home folder'],
      [documents, 'it is the personal folder ~/Documents'],
      [target, 'it is a target'],
      [dirname(target), `it holds the target ${target}`],
      [checkout, 'it is a checkout'],
      [holder, `it holds the checkout ${realpathSync(linked)}`],
    ]
    for (const [root, why] of cases) {
      for (const entry of [root, { path: root, self: true as const }]) {
        const inside = join(root, 'inside')
        const p = storePlugin(() => [entry], [root, inside])
        const s = await survey([p], { ...ctx, targets: [target] })
        expect(s.warnings, root).toEqual([`store: roots: left out the root ${root}: ${why}`])
        expect(s.roots, root).toEqual({ store: [] })
        // A target holds what is inside it, so only the target itself is refused there.
        const out = root === target ? [`store:${root}`] : [`store:${root}`, `store:${inside}`]
        expect(refusedIds(s), root).toEqual(out)
      }
    }
  })

  test('a self root that is a symlink is refused; a relative one, or an entry of another shape, is left out', async () => {
    homeWithStore()
    const base = temp()
    const real = join(base, 'real')
    mkdirSync(real)
    const link = join(base, 'link')
    symlinkSync(real, link)
    const p = storePlugin(
      () => [
        { path: link, self: true },
        'relative',
        { path: real } as unknown as Root,
        7 as unknown as Root,
      ],
      [link],
    )
    const s = await survey([p], ctx)
    expect(s.warnings).toEqual([
      `store: roots: left out the root ${link}: it is a symlink`,
      'store: roots: left out the root relative: it is not an absolute path without ..',
      `store: roots: left out {"path":"${real}"}, which is neither a path nor { path, self: true }`,
      'store: roots: left out 7, which is neither a path nor { path, self: true }',
    ])
    expect(refusedIds(s)).toEqual([`store:${link}`])
  })

  test('checked again before delete: a self root that became a checkout, or a symlink, since the survey is not deleted', async () => {
    const { store } = homeWithStore()
    const p = storePlugin(() => [{ path: store, self: true }], [store])
    const s = await survey([p], ctx)
    expect(s.objections).toEqual([])
    mkdirSync(join(store, '.git'))
    const asCheckout = await clean(plan(s), [p], ctx)
    expect(asCheckout.steps).toEqual([])
    expect(asCheckout.dropped).toEqual([expect.objectContaining({ reason: 'blocked' })])
    expect(existsSync(store)).toBe(true)

    // Between the re-check and delete: `prepare` turns the root into a checkout.
    rmSync(join(store, '.git'), { recursive: true })
    const turning: Plugin = {
      name: 'turn',
      detect: () => true,
      prepare: () => {
        mkdirSync(join(store, '.git'))
      },
    }
    const late = await clean(plan(await survey([p, turning], ctx)), [p, turning], ctx)
    expect(late.steps).toEqual([
      expect.objectContaining({
        result: 'failed',
        error: expect.stringContaining(`${store} is not inside store's roots`),
      }),
    ])
    expect(existsSync(join(store, '_cacache', 'blob'))).toBe(true)
  })

  test('kit.remove refuses a self root that is no longer allowed, through boundBy', () => {
    const { home, store } = homeWithStore()
    const bounds = { roots: [store], self: [store], targets: [], linked: [], home }
    expect(boundBy(bounds, store)).toBe(store)
    expect(rootProblem(store, bounds, true)).toBeNull()
    mkdirSync(join(store, '.git'))
    expect(boundBy(bounds, store)).toBeNull()
    expect(rootProblem(store, bounds, true)).toBe('it is a checkout')
  })
})

/** Whether the filesystem under the temporary folder ignores case, as macOS's does by default. */
const ignoresCase = (() => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), 'host-cleaner-case-')))
  try {
    mkdirSync(join(d, 'Probe'))
    return existsSync(join(d, 'probe'))
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
})()

describe.skipIf(!ignoresCase)('where the filesystem ignores case', () => {
  test('a root, a target and a personal folder compare by their real spelling', async () => {
    const base = temp()
    const store = join(base, 'Store')
    mkdirSync(join(store, 'blob'), { recursive: true })
    const lower = join(base, 'store')
    expect(containedIn([lower], join(store, 'blob'))).toBe(lower)
    expect(containedIn([store], join(lower, 'blob'))).toBe(store)

    const home = join(base, 'Home')
    mkdirSync(join(home, 'Documents'), { recursive: true })
    const at = { targets: [store], linked: [], home }
    expect(rootProblem(join(base, 'home'), at)).toBe('it is the home folder')
    expect(rootProblem(join(home, 'documents'), at)).toBe('it is the personal folder ~/Documents')
    expect(rootProblem(lower, at)).toBe('it is a target')
    expect(boundBy({ ...at, roots: [], self: [], targets: [lower] }, store)).toBeNull()
    expect(
      boundBy({ ...at, roots: [], self: [join(base, 'other')], targets: [] }, join(base, 'OTHER')),
    ).toBeNull()
    mkdirSync(join(base, 'Other'))
    expect(
      boundBy({ ...at, roots: [], self: [join(base, 'other')], targets: [] }, join(base, 'OTHER')),
    ).toBe(join(base, 'other'))
  })
})
