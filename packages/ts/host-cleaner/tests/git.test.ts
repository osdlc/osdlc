import { afterEach, describe, expect, test } from 'vitest'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

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
  return { root, worktree: realpathSync(worktree), ctx, plugin }
}

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
      await plugin.delete!(s.candidates[0]!, { ...fx.ctx, allow: ['discard-archived'] })
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
    const plugin = gitPlugin({
      probe: idle,
      archive: {},
      sweep: { remotes: [''], offline: true, provider: 'none' },
    })
    const s = await survey([plugin], fx.ctx)
    const target = s.candidates.find((c) => c.ref === 'unmerged')!
    const allow = { ...fx.ctx, allow: ['abandon-unmerged', 'discard-archived'] }
    expect(() => plugin.delete!(target, allow)).toThrow(FatalRun)
  })
})
