import { afterEach, describe, expect, test } from 'vitest'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'

import { Git } from '@osdlc/typed-git'
import { IDENTITY, makeBareAndWorker } from '@osdlc/typed-git/testing'

import type { Kind } from '@osdlc/repo-cleaner'

import {
  BUILT_IN_PLUGINS,
  DEFAULT_SELECTION,
  FatalRun,
  PLUGIN_API,
  ReceiptSchema,
  cargoPlugin,
  clean,
  decide,
  gitDefinitionWith,
  gitPlugin,
  plan,
  pluginKit,
  survey,
  type Ctx,
  type GitPluginOptions,
  type Plugin,
} from '../src/index.ts'
import { contractSuite, fakeContext, fakeRunner } from '../src/testing.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

const sh = (cwd: string, args: string[]): string =>
  new Git(cwd, { env: { ...IDENTITY } }).rawChecked(args).stdout.trim()

const idle = { alive: () => false, holders: () => [] }

/** A repository whose `wt-branch` is merged and checked out in a clean worktree, plus one unmerged branch. */
function fixture() {
  const pair = makeBareAndWorker()
  cleanups.push(pair.cleanup)
  const root = pair.worker.dir
  sh(root, ['commit', '--allow-empty', '-m', 'initial'])
  sh(root, ['push', '-q', '-u', 'origin', 'main'])
  sh(root, ['checkout', '-q', '-b', 'unmerged'])
  sh(root, ['commit', '--allow-empty', '-m', 'wip'])
  sh(root, ['checkout', '-q', 'main'])
  const worktree = join(pair.parent, 'wt-a')
  sh(root, ['worktree', 'add', '-q', '-b', 'wt-branch', worktree, 'main'])
  sh(worktree, ['commit', '--allow-empty', '-m', 'feat'])
  sh(root, ['merge', '-q', '--no-ff', '-m', 'Merge wt-branch', 'wt-branch'])
  sh(root, ['push', '-q', 'origin', 'main'])
  const ctx: Ctx = fakeContext({ cwd: root, targets: [root] })
  const plugin = gitPlugin({
    probe: idle,
    sweep: { remotes: [''], offline: true, provider: 'none' },
  })
  return { root, bare: pair.bare.dir, worktree: realpathSync(worktree), ctx, plugin }
}

/** The git plugin of `fixture`, archiving. */
const archiving = () =>
  gitPlugin({
    probe: idle,
    archive: {},
    sweep: { remotes: [''], offline: true, provider: 'none' },
  })

/** A plugin that acts on every candidate in `prepare`, as orca does, and records which. */
function acting(act: (id: string) => void = () => {}): Plugin & { prepared: string[] } {
  const prepared: string[] = []
  return {
    name: 'acting',
    detect: () => true,
    prepare: (c) => {
      prepared.push(c.id)
      act(c.id)
    },
    prepared,
  }
}

/** The archive branches on the remote, each with its parents after the first. */
const archives = (bare: string): string[][] =>
  sh(bare, ['for-each-ref', '--format=%(refname)', 'refs/heads/archive/'])
    .split('\n')
    .filter((ref) => ref !== '')
    .map((ref) => sh(bare, ['log', '-1', '--format=%P', ref]).split(' ').slice(1))

const branches = (root: string): string => sh(root, ['branch', '--format=%(refname:short)'])

describe('the git plugin', () => {
  test('keeps the contract', async () => {
    const fx = fixture()
    expect(await contractSuite(fx.plugin, fx.ctx)).toEqual([])
    expect(existsSync(fx.worktree)).toBe(true)
  })

  test('gitDefinitionWith builds the plugin with its options, copied when the definition is made', async () => {
    const fx = fixture()
    const sweep = { only: ['worktree' as Kind] }
    const git = gitDefinitionWith({ probe: idle, sweep })
    expect(git.name).toBe(BUILT_IN_PLUGINS[0]!.name)
    expect(git.api).toBe(PLUGIN_API)
    sweep.only = ['branch']
    const plugin = git.create({ settings: {}, env: {}, kit: pluginKit(git.name) })
    const s = await survey([plugin], fx.ctx)
    expect(s.candidates.map((c) => c.id)).toEqual([`worktree:${fx.worktree}`])
  })

  test('gitPlugin and gitDefinitionWith copy their options, lists and archive included', async () => {
    for (const build of [
      (opts: GitPluginOptions) => {
        const plugin = gitPlugin(opts)
        return () => plugin
      },
      (opts: GitPluginOptions) => {
        const def = gitDefinitionWith(opts)
        return () => def.create({ settings: {}, env: {}, kit: pluginKit(def.name) })
      },
    ]) {
      const fx = fixture()
      writeFileSync(join(fx.worktree, 'notes.txt'), 'kept in the archive')
      const only: Kind[] = ['worktree']
      const remotes: string[] = []
      const exclude: string[] = []
      const sweep = { only, remotes }
      const made = build({ probe: idle, sweep, archive: { exclude } })
      only.push('branch')
      remotes.push('no-such-remote')
      exclude.push('notes.txt')
      const plugin = made()
      const s = await survey([plugin], fx.ctx)
      expect(s.warnings).toEqual([])
      expect(s.candidates.map((c) => c.id)).toEqual([`worktree:${fx.worktree}`])
      // The archive is made in prepare, which a delete needs first.
      const allowed = { ...fx.ctx, allow: ['discard-archived'] }
      await plugin.prepare!(s.candidates[0]!, allowed)
      await plugin.delete!(s.candidates[0]!, allowed)
      expect(existsSync(fx.worktree)).toBe(false)
      const archived = sh(fx.root, ['ls-remote', 'origin', 'refs/heads/archive/*']).split(/\s+/)[0]!
      sh(fx.root, ['fetch', '-q', 'origin', archived])
      expect(sh(fx.root, ['log', '-m', '--format=', '--name-only', archived])).toMatch(/notes\.txt/)
    }
  })

  test('proposes worktrees and branches, objects with their risks, and a freed branch requires its worktree', async () => {
    const fx = fixture()
    const s = await survey([fx.plugin], fx.ctx)
    const byId = new Map(s.candidates.map((c) => [c.id, c]))
    const branchId = `branch:${realpathSync(fx.root)}:wt-branch`
    expect(byId.get(branchId)?.requires).toEqual([`worktree:${fx.worktree}`])
    // A branch is a ref in its repository, not a path.
    expect(byId.get(branchId)).toMatchObject({ ref: 'wt-branch', at: realpathSync(fx.root) })
    expect(byId.get(branchId)?.path).toBeUndefined()
    // The worktree sits beside the target, not in it: a linked checkout of it is held to it.
    expect(s.objections.filter((o) => o.code === 'outside-roots')).toEqual([])
    expect(byId.get(`worktree:${fx.worktree}`)).toMatchObject({ owner: 'git' })
    expect(byId.get(`worktree:${fx.worktree}`)?.held).toBeUndefined()
    const unmerged = [...byId.values()].find((c) => c.ref === 'unmerged')!
    expect(s.objections).toContainEqual(
      expect.objectContaining({
        by: 'git',
        candidate: unmerged.id,
        level: 'protest',
        code: 'abandon-unmerged',
      }),
    )
  })

  test('cleans a worktree, then the branch it freed, through one receipt', async () => {
    const fx = fixture()
    const dir = mkdtempSync(join(tmpdir(), 'hc-receipt-'))
    const receiptPath = join(dir, 'receipt.json')
    const s = await survey([fx.plugin], fx.ctx)
    const pick = [`worktree:${fx.worktree}`, `branch:${realpathSync(fx.root)}:wt-branch`]
    const receipt = await clean(plan(s, { select: pick }), [fx.plugin], fx.ctx, { receiptPath })
    expect(receipt.steps.map((x) => [x.id, x.result])).toEqual(pick.map((id) => [id, 'ok']))
    expect(receipt.steps[0]!.delete).toBe('directory gone and unregistered')
    expect(existsSync(fx.worktree)).toBe(false)
    expect(branches(fx.root)).not.toContain('wt-branch')
    expect(branches(fx.root)).toContain('unmerged')
    expect(ReceiptSchema.parse(JSON.parse(readFileSync(receiptPath, 'utf8'))).status).toBe(
      'complete',
    )
  })

  test('prunes a worktree whose folder is gone, or left without its .git, registered outside a target that is a folder of repositories', async () => {
    const fx = fixture()
    const away = realpathSync(mkdtempSync(join(tmpdir(), 'hc-away-')))
    cleanups.push(() => rmSync(away, { recursive: true, force: true }))
    const gone = join(away, 'gone')
    const left = join(away, 'left')
    sh(fx.root, ['worktree', 'add', '-q', '-b', 'gone', gone, 'main'])
    sh(fx.root, ['worktree', 'add', '-q', '-b', 'left', left, 'main'])
    rmSync(gone, { recursive: true })
    rmSync(join(left, '.git'))
    // The target holds the repository and is not one itself.
    const ctx = fakeContext({ cwd: fx.root, targets: [dirname(fx.root)] })
    const s = await survey([fx.plugin], ctx)
    // The gone one first: the prune of the one left would also drop it.
    const ids = [`worktree:${gone}`, `worktree:${left}`]
    expect(s.candidates.map((c) => c.id)).toEqual(expect.arrayContaining(ids))
    expect(s.objections.filter((o) => o.code === 'outside-roots')).toEqual([])
    expect(s.warnings).toEqual([])
    const receipt = await clean(plan(s, { select: ids }), [fx.plugin], ctx)
    expect(receipt.steps.map((x) => [x.id, x.result, x.error])).toEqual(
      ids.map((id) => [id, 'ok', null]),
    )
    expect(sh(fx.root, ['worktree', 'list', '--porcelain'])).not.toContain(away)
    // A prune leaves the folder.
    expect(existsSync(left)).toBe(true)
  })

  test('declares no root for a gone worktree of a repository a target is in, which the core counts already', async () => {
    const fx = fixture()
    const away = realpathSync(mkdtempSync(join(tmpdir(), 'hc-away-')))
    cleanups.push(() => rmSync(away, { recursive: true, force: true }))
    const gone = join(away, 'gone')
    sh(fx.root, ['worktree', 'add', '-q', '-b', 'gone', gone, 'main'])
    rmSync(gone, { recursive: true })
    const s = await survey([fx.plugin], fx.ctx)
    expect(s.candidates.map((c) => c.id)).toContain(`worktree:${gone}`)
    expect(s.objections.filter((o) => o.code === 'outside-roots')).toEqual([])
    expect(s.warnings).toEqual([])
    expect(s.roots.git).toEqual([])
  })

  test('with no gone worktree, as before discover, roots reads no target, so git is not run for each', async () => {
    const fx = fixture()
    let read = 0
    const targets = new Proxy([fx.root], {
      get: (t, k, r) => (read++, Reflect.get(t, k, r)),
    })
    expect(await fx.plugin.roots!({ ...fx.ctx, targets })).toEqual([])
    expect(read).toBe(0)
  })

  test('an unmerged branch needs abandon-unmerged granted by name', async () => {
    const fx = fixture()
    const unmerged = (await survey([fx.plugin], fx.ctx)).candidates.find(
      (c) => c.ref === 'unmerged',
    )!
    const p = plan(await survey([fx.plugin], fx.ctx), { select: [unmerged.id] })
    expect((await clean(p, [fx.plugin], fx.ctx)).dropped[0]).toMatchObject({
      reason: 'not-allowed',
    })
    const granted = { ...fx.ctx, allow: ['abandon-unmerged'] }
    const receipt = await clean({ ...p, allow: ['abandon-unmerged'] }, [fx.plugin], granted)
    expect(receipt.steps[0]!.result).toBe('ok')
    expect(branches(fx.root)).not.toContain('unmerged')
  })

  test('a merged worktree whose target/ is unmeasured is kept, naming the target/ and --allow unmeasured', async () => {
    const fx = fixture()
    // Ignored, as a Rust checkout's .gitignore has it, so the worktree stays clean.
    appendFileSync(join(fx.root, '.git', 'info', 'exclude'), 'target/\n')
    const target = join(fx.worktree, 'target')
    const old = new Date(Date.now() - 48 * 3_600_000)
    for (const [file, body] of [
      ['CACHEDIR.TAG', 'Signature: 8a477f597d28d172789f06886806bc55'],
      [join('debug', '.fingerprint', 'a', 'lib-a'), 'x'],
    ] as const) {
      mkdirSync(join(target, file, '..'), { recursive: true })
      writeFileSync(join(target, file), body)
      utimesSync(join(target, file), old, old)
    }
    const cargoBin = fakeRunner({
      cargo: { 'config get build.incremental': { stdout: 'build.incremental = true\n' } },
    })
    // A budget clock a minute later at every read, so the walk runs out of its budget.
    let t = 0
    const slow = cargoPlugin({ clock: () => (t += 60_000), probe: idle, ...cargoBin })
    const s = await survey([fx.plugin, slow], fx.ctx)
    const tree = `worktree:${fx.worktree}`
    const art = `artifact:${target}`
    const branch = `branch:${realpathSync(fx.root)}:wt-branch`
    expect(s.candidates.find((c) => c.id === art)?.unmeasured).toBe(true)
    expect(s.candidates.find((c) => c.id === tree)?.requires).toEqual([art])

    const d = decide(s.candidates, s.objections, DEFAULT_SELECTION, [])
    expect(d.run.map((c) => c.id)).not.toContain(tree)
    const why = `requires ${art}, which needs --allow unmeasured`
    expect(d.dropped).toEqual([
      { id: tree, reason: 'blocked', detail: why },
      { id: branch, reason: 'blocked', detail: `requires ${tree}, which is blocked: ${why}` },
    ])

    const allowed = { ...fx.ctx, allow: ['unmeasured'] }
    const receipt = await clean(plan(s, { allow: ['unmeasured'] }), [fx.plugin, slow], allowed)
    expect(receipt.steps.map((x) => [x.id, x.result])).toEqual([
      [art, 'ok'],
      [tree, 'ok'],
      [branch, 'ok'],
    ])
    expect(existsSync(fx.worktree)).toBe(false)
  })

  test('a failed archive push throws FatalRun, which stops the run', async () => {
    const fx = fixture()
    sh(fx.root, ['remote', 'set-url', 'origin', '/nonexistent/remote.git'])
    sh(fx.root, ['config', 'remote.origin.pushurl', '/nonexistent/remote.git'])
    const plugin = archiving()
    const s = await survey([plugin], fx.ctx)
    const target = s.candidates.find((c) => c.ref === 'unmerged')!
    const allow = { ...fx.ctx, allow: ['abandon-unmerged', 'discard-archived'] }
    expect(() => plugin.prepare!(target, allow)).toThrow(FatalRun)
    expect(() => plugin.delete!(target, allow)).toThrow('was not prepared')
    expect(branches(fx.root)).toContain('unmerged')
  })

  test('a failed archive push stops the run before another plugin acts, and deletes nothing in the repository', async () => {
    const fx = fixture()
    writeFileSync(join(fx.worktree, 'wip.txt'), 'wip\n')
    sh(fx.root, ['branch', 'merged', 'main'])
    sh(fx.root, ['config', 'remote.origin.pushurl', '/nonexistent/remote.git'])
    const plugin = archiving()
    const other = acting()
    const pick = [`branch:${realpathSync(fx.root)}:merged`, `worktree:${fx.worktree}`]
    const allow = ['discard-changes']
    const p = plan(await survey([plugin, other], fx.ctx), { select: pick, allow })
    const receipt = await clean(p, [plugin, other], { ...fx.ctx, allow })
    expect(receipt.steps.map((x) => [x.id, x.result])).toEqual([
      [pick[0], 'failed'],
      [pick[1], 'skipped'],
    ])
    expect(receipt.steps[0]!.error).toContain('archive failed')
    expect(other.prepared).toEqual([])
    expect(branches(fx.root)).toContain('merged')
    expect(readFileSync(join(fx.worktree, 'wip.txt'), 'utf8')).toBe('wip\n')
  })

  test('a run archives a repository once, and a commit two candidates hold once', async () => {
    const fx = fixture()
    sh(fx.worktree, ['commit', '--allow-empty', '-m', 'more'])
    sh(fx.root, ['branch', 'copy', 'unmerged'])
    const plugin = archiving()
    const of = (name: string) => `branch:${realpathSync(fx.root)}:${name}`
    const pick = [`worktree:${fx.worktree}`, of('unmerged'), of('copy')]
    const tips = ['wt-branch', 'unmerged'].map((b) => sh(fx.root, ['rev-parse', b]))
    const allow = ['abandon-unmerged']
    const p = plan(await survey([plugin], fx.ctx), { select: pick, allow })
    const receipt = await clean(p, [plugin], { ...fx.ctx, allow })
    expect(receipt.steps.map((x) => [x.id, x.result])).toEqual(pick.map((id) => [id, 'ok']))
    expect(receipt.steps.every((x) => x.delete!.includes('refs/heads/archive/'))).toBe(true)
    expect(archives(fx.bare)).toEqual([tips])
  })

  test('only what the run deletes is archived', async () => {
    const fx = fixture()
    writeFileSync(join(fx.worktree, 'wip.txt'), 'wip\n')
    const plugin = archiving()
    const pick = [`branch:${realpathSync(fx.root)}:unmerged`]
    const tip = sh(fx.root, ['rev-parse', 'unmerged'])
    const allow = ['abandon-unmerged', 'discard-changes']
    const p = plan(await survey([plugin], fx.ctx), { select: pick, allow })
    expect((await clean(p, [plugin], { ...fx.ctx, allow })).status).toBe('complete')
    expect(archives(fx.bare)).toEqual([[tip]])
  })

  test('a worktree changed since the archive fails before another plugin acts on it, and stays', async () => {
    const fx = fixture()
    writeFileSync(join(fx.worktree, 'wip.txt'), 'wip\n')
    const plugin = archiving()
    // The branch is first, so the archive of both is already pushed when this writes.
    const other = acting(() => writeFileSync(join(fx.worktree, 'late.txt'), 'late\n'))
    const pick = [`branch:${realpathSync(fx.root)}:unmerged`, `worktree:${fx.worktree}`]
    const allow = ['abandon-unmerged', 'discard-changes']
    const p = plan(await survey([plugin, other], fx.ctx), { select: pick, allow })
    const receipt = await clean(p, [plugin, other], { ...fx.ctx, allow })
    expect(receipt.steps.map((x) => [x.id, x.result])).toEqual([
      [pick[0], 'ok'],
      [pick[1], 'failed'],
    ])
    expect(receipt.steps[1]!.error).toContain('changed since it was archived')
    expect(other.prepared).toEqual([pick[0]])
    expect(existsSync(join(fx.worktree, 'late.txt'))).toBe(true)
  })

  test('a worktree another plugin changes in its own prepare is not deleted', async () => {
    const fx = fixture()
    writeFileSync(join(fx.worktree, 'wip.txt'), 'wip\n')
    const plugin = archiving()
    const other = acting(() => writeFileSync(join(fx.worktree, 'late.txt'), 'late\n'))
    const allow = ['discard-changes']
    const p = plan(await survey([plugin, other], fx.ctx), {
      select: [`worktree:${fx.worktree}`],
      allow,
    })
    const receipt = await clean(p, [plugin, other], { ...fx.ctx, allow })
    expect(receipt.steps[0]).toMatchObject({ result: 'failed' })
    expect(receipt.steps[0]!.error).toContain('changed since it was archived')
    expect(existsSync(join(fx.worktree, 'late.txt'))).toBe(true)
  })

  test('without ctx.run, each prepare archives what the last archive does not hold', async () => {
    const fx = fixture()
    sh(fx.root, ['branch', 'other', 'unmerged'])
    sh(fx.root, ['checkout', '-q', 'other'])
    sh(fx.root, ['commit', '--allow-empty', '-m', 'other wip'])
    sh(fx.root, ['checkout', '-q', 'main'])
    const plugin = archiving()
    const ctx = { ...fx.ctx, allow: ['abandon-unmerged'] }
    const found = (await survey([plugin], ctx)).candidates
    for (const name of ['unmerged', 'other']) {
      const c = found.find((x) => x.id === `branch:${realpathSync(fx.root)}:${name}`)!
      expect(plugin.prepare!(c, ctx)).toContain('refs/heads/archive/')
      expect(plugin.delete!(c, ctx)).toContain('refs/heads/archive/')
    }
    expect(branches(fx.root)).not.toContain('other')
    expect(archives(fx.bare)).toHaveLength(2)
  })

  test('the receipt names the archive a prepare pushed, though the delete then fails', async () => {
    const fx = fixture()
    const plugin = archiving()
    const id = `branch:${realpathSync(fx.root)}:unmerged`
    const failing: Plugin = {
      name: 'failing',
      detect: () => true,
      prepare: (c) => {
        if (c.id === id) throw new Error('will not')
      },
    }
    const allow = ['abandon-unmerged']
    const p = plan(await survey([plugin, failing], fx.ctx), { select: [id], allow })
    const receipt = await clean(p, [plugin, failing], { ...fx.ctx, allow })
    expect(receipt.steps[0]).toMatchObject({ result: 'failed', preparedBy: ['git'] })
    expect(receipt.steps[0]!.prepared).toEqual([
      expect.stringMatching(/^git: refs\/heads\/archive\/\S+ lists [0-9a-f]+$/),
    ])
    expect(branches(fx.root)).toContain('unmerged')
  })

  test("another plugin's candidate inside a worktree is prepared only after the worktree is archived", async () => {
    const fx = fixture()
    writeFileSync(join(fx.worktree, 'wip.txt'), 'wip\n')
    // The plugin names the file through a link; git names the worktree resolved.
    const link = join(mkdtempSync(join(tmpdir(), 'hc-link-')), 'parent')
    symlinkSync(dirname(fx.worktree), link)
    cleanups.push(() => rmSync(dirname(link), { recursive: true, force: true }))
    const plugin = archiving()
    const inside: Plugin = {
      name: 'inside',
      detect: () => true,
      discover: () => [
        {
          id: 'inside:wip',
          kind: 'cache',
          path: join(link, basename(fx.worktree), 'wip.txt'),
          owner: 'inside',
          why: 'a file in the worktree',
          evidence: {},
        },
      ],
      delete: (c) => {
        // The archive already holds the file this deletes.
        expect(archives(fx.bare)).toHaveLength(1)
        rmSync(c.path!)
        return `removed ${c.id}`
      },
    }
    const allow = ['discard-changes']
    const s = await survey([plugin, inside], fx.ctx)
    const p = plan(s, { select: ['inside:wip', `worktree:${fx.worktree}`], allow })
    const receipt = await clean(p, [plugin, inside], { ...fx.ctx, allow })
    expect(receipt.steps[0]).toMatchObject({ id: 'inside:wip', result: 'ok' })
    expect(receipt.steps[0]!.prepared?.[0]).toMatch(/^git: refs\/heads\/archive\//)
    // The worktree no longer matches its archive, so it stays.
    expect(receipt.steps[1]).toMatchObject({
      id: `worktree:${fx.worktree}`,
      result: 'failed',
      error: expect.stringContaining('changed since it was archived'),
    })
    expect(existsSync(fx.worktree)).toBe(true)
    expect(archives(fx.bare)).toHaveLength(1)
  })

  test('with archive, a gone worktree in a repository with no remote is not refused for it', async () => {
    const fx = fixture()
    const wt = join(dirname(fx.worktree), 'wt-gone')
    sh(fx.root, ['worktree', 'add', '-q', '-b', 'gone', wt, 'main'])
    sh(wt, ['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', fx.bare, 'sub'])
    sh(join(wt, 'sub'), ['commit', '--allow-empty', '-m', 'only here'])
    // Its git dir keeps the submodule's commit, which no archive could hold.
    rmSync(wt, { recursive: true, force: true })
    sh(fx.root, ['remote', 'remove', 'origin'])
    const s = await survey([archiving()], fx.ctx)
    const codes = s.objections.filter((o) => o.candidate === `worktree:${wt}`).map((o) => o.code)
    expect(codes).toEqual(['abandon-unmerged'])
  })

  test('with archive, unlanded work in a repository with no remote is refused, merged work is not', async () => {
    const fx = fixture()
    sh(fx.root, ['remote', 'remove', 'origin'])
    const plugin = archiving()
    const s = await survey([plugin], fx.ctx)
    const unmerged = s.candidates.find((c) => c.ref === 'unmerged')!
    const noRemote = s.objections.filter((o) => o.code === 'no-remote')
    expect(noRemote.map((o) => [o.candidate, o.level])).toEqual([[unmerged.id, 'refuse']])
  })
})
