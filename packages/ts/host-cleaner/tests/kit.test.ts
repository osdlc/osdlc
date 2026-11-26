/** The plugin kit: each helper on its own, against temp directories and fake runners. */

import { afterEach, describe, expect, test, vi } from 'vitest'
import fs, {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import { CommandFailed, asAsync, type CommandRunner } from '@osdlc/command-seam'
import type { ProcessHolder, ProcessProbe } from '@osdlc/repo-cleaner'
import { Git } from '@osdlc/typed-git'
import { IDENTITY, makeGitFixture } from '@osdlc/typed-git/testing'
import { z } from 'zod'

import {
  PLUGIN_API,
  cargoPlugin,
  clean,
  commandHasName,
  definePlugin,
  plan,
  pluginKit,
  survey,
} from '../src/index.ts'
import { attachKit, bindKit } from '../src/kit.ts'
import type { Bounds } from '../src/roots.ts'
import type { Plugin } from '../src/types.ts'

const NOW = new Date('2026-11-19T12:00:00Z')
const HOUR = 3_600_000

const dirs: string[] = []
afterEach(() => {
  while (dirs.length > 0) {
    const d = dirs.pop()!
    chmodSync(d, 0o755)
    rmSync(d, { recursive: true, force: true })
  }
})
const temp = (): string => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), 'host-cleaner-kit-')))
  dirs.push(d)
  return d
}

function put(path: string, hoursOld: number): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, 'x')
  const at = new Date(NOW.getTime() - hoursOld * HOUR)
  utimesSync(path, at, at)
}

/** A budget clock a second later at every read. */
const ticking = (): (() => number) => {
  let t = 0
  return () => (t += 1_000)
}

const signal = (): AbortSignal => new AbortController().signal

/** A kit for `owner`, bound as the core binds one in a run. */
function boundKit(owner: string, bounds: Partial<Bounds>) {
  const kit = pluginKit(owner)
  const plugin = { name: owner, detect: () => true }
  attachKit(plugin, kit)
  bindKit(plugin, { roots: [], self: [], targets: [], linked: [], home: homedir(), ...bounds })
  return kit
}

describe('candidate', () => {
  test('fills in the id and the plugin as owner', () => {
    const kit = pluginKit('docker')
    expect(kit.candidate({ kind: 'volume', ref: 'data', why: 'unused' })).toEqual({
      kind: 'volume',
      ref: 'data',
      why: 'unused',
      id: 'volume:data',
      owner: 'docker',
      evidence: {},
    })
    expect(
      kit.candidate({ kind: 'artifact', path: '/a/b', why: 'x', evidence: { n: 1 } }),
    ).toMatchObject({
      id: 'artifact:/a/b',
      evidence: { n: 1 },
    })
  })
})

describe('idle', () => {
  test('is the newest file under the folder, skipped names left out', () => {
    const dir = temp()
    put(join(dir, 'src', 'a.ts'), 30)
    put(join(dir, 'node_modules', 'x.js'), 1)
    const kit = pluginKit('node', { now: () => NOW })
    expect(kit.idle(dir)).toMatchObject({ unmeasured: false, hours: 1 })
    expect(kit.idle(dir, { skip: (n) => n === 'node_modules' })).toEqual({
      unmeasured: false,
      newestMs: NOW.getTime() - 30 * HOUR,
      hours: 30,
    })
  })

  test('counts fractions of an hour', () => {
    const dir = temp()
    put(join(dir, 'a'), 0.5)
    expect(pluginKit('x', { now: () => NOW }).idle(dir)).toMatchObject({ hours: 0.5 })
  })

  test('a folder with no file has no idle time; a missing one is no file', () => {
    const dir = temp()
    mkdirSync(join(dir, 'empty'))
    const kit = pluginKit('x', { now: () => NOW })
    expect(kit.idle(join(dir, 'empty'))).toEqual({ unmeasured: false, newestMs: null, hours: null })
    expect(kit.idle(join(dir, 'gone'))).toEqual({ unmeasured: false, newestMs: null, hours: null })
  })

  test('a walk that runs out of its budget is unmeasured', () => {
    const dir = temp()
    put(join(dir, 'a', 'b'), 30)
    const kit = pluginKit('x', { now: () => NOW, clock: ticking(), budgetMs: 1_500 })
    expect(kit.idle(dir)).toEqual({ unmeasured: true })
    expect(pluginKit('x', { clock: () => 0, budgetMs: 0 }).idle(dir).unmeasured).toBe(false)
  })

  test('the budget holds inside one flat folder, not only on entering a folder', () => {
    const dir = temp()
    for (let i = 0; i < 200; i++) put(join(dir, `f${i}`), 30)
    const kit = pluginKit('x', { now: () => NOW, clock: ticking(), budgetMs: 1_500 })
    expect(kit.idle(dir)).toEqual({ unmeasured: true })
  })

  test('the age clock is read once a call, and the budget clock far less than once an entry', () => {
    const dir = temp()
    for (let i = 0; i < 200; i++) put(join(dir, `f${i}`), 30)
    const reads = { now: 0, clock: 0 }
    const kit = pluginKit('x', {
      now: () => (reads.now++, NOW),
      clock: () => (reads.clock++, 0),
    })
    expect(kit.idle(dir)).toMatchObject({ hours: 30 })
    expect(reads.now).toBe(1)
    expect(reads.clock).toBeLessThan(10)
  })

  test('a file is aged by itself, by the kit clock', () => {
    const dir = temp()
    put(join(dir, 'f'), 30)
    expect(pluginKit('x', { now: () => NOW }).idle(join(dir, 'f'))).toEqual({
      unmeasured: false,
      newestMs: NOW.getTime() - 30 * HOUR,
      hours: 30,
    })
  })

  test('several folders are one answer, the newest, within one budget', () => {
    const dir = temp()
    const dirs = ['a', 'b', 'c'].map((name, i) => {
      put(join(dir, name, 'f'), 30 - i)
      return join(dir, name)
    })
    const kit = pluginKit('x', { now: () => NOW })
    expect(kit.idle(dirs)).toMatchObject({ unmeasured: false, hours: 28 })
    expect(kit.idle([])).toEqual({ unmeasured: false, newestMs: null, hours: null })
    // One second a folder: each is within the budget alone, the three are not.
    const slow = pluginKit('x', { now: () => NOW, clock: ticking(), budgetMs: 1_500 })
    expect(slow.idle(dirs[0]!)).toMatchObject({ hours: 30 })
    expect(slow.idle(dirs)).toEqual({ unmeasured: true })
  })
})

describe('overBudget', () => {
  test('turns true once the budget has passed since the call, by the kit clock', () => {
    const late = pluginKit('x', { clock: ticking(), budgetMs: 1_500 }).overBudget()
    expect([late(), late()]).toEqual([false, true])
  })
})

describe('remove', () => {
  test('makes read-only folders and files writable, removes the folder and says what it freed', () => {
    const root = temp()
    const dir = join(root, 'mod')
    put(join(dir, 'pkg', 'go.mod'), 1)
    chmodSync(join(dir, 'pkg', 'go.mod'), 0o444)
    chmodSync(join(dir, 'pkg'), 0o555)
    const said = boundKit('go', { targets: [root] }).remove(dir)
    expect(said).toMatch(new RegExp(`^removed ${dir}; freed \\d+ bytes$`))
    expect(existsSync(dir)).toBe(false)
  })

  test('a folder something still writes into, with nothing read-only in it, is not removed a second time', () => {
    const root = temp()
    const dir = join(root, 'busy')
    put(join(dir, 'x'), 1)
    const kit = boundKit('cache', { targets: [root] })
    const rm = vi.spyOn(fs, 'rmSync').mockImplementation(() => {
      throw Object.assign(new Error('ENOTEMPTY'), { code: 'ENOTEMPTY' })
    })
    syncBuiltinESMExports()
    try {
      expect(() => kit.remove(dir)).toThrow(/ENOTEMPTY/)
      expect(rm).toHaveBeenCalledTimes(1)
    } finally {
      rm.mockRestore()
      syncBuiltinESMExports()
    }
  })

  test('a writable folder is removed in one pass, with no permission changed first', () => {
    const root = temp()
    const dir = join(root, 'mod')
    put(join(dir, 'pkg', 'f'), 1)
    const chmod = vi.spyOn(fs, 'chmodSync')
    const lstat = vi.spyOn(fs, 'lstatSync')
    syncBuiltinESMExports()
    try {
      expect(boundKit('go', { targets: [root] }).remove(dir)).toMatch(/^removed /)
      expect(chmod).not.toHaveBeenCalled()
      expect(lstat.mock.calls.filter(([p]) => String(p).startsWith(join(dir, 'pkg')))).toEqual([])
    } finally {
      chmod.mockRestore()
      lstat.mockRestore()
      syncBuiltinESMExports()
    }
  })

  test("a new survey unbinds the kit while its hooks run: no remove within an earlier survey's bounds", async () => {
    const root = temp()
    const dir = join(root, 'cache')
    put(join(dir, 'x'), 1)
    const kit = pluginKit('stale')
    const plugin = {
      name: 'stale',
      detect: () => true,
      discover: () => {
        kit.remove(dir)
        return []
      },
    }
    attachKit(plugin, kit)
    bindKit(plugin, { roots: [], self: [], targets: [root], linked: [], home: homedir() })
    const s = await survey([plugin], { cwd: root, targets: [root], allow: [] })
    expect(s.warnings).toEqual([
      expect.stringMatching(/^stale: discover failed: .*not bound to a run/),
    ])
    expect(existsSync(dir)).toBe(true)
  })

  test('refuses a folder outside the roots and targets, a target itself, and a link that leads out', () => {
    const root = temp()
    const other = temp()
    put(join(other, 'keep'), 1)
    const kit = boundKit('cache', { targets: [root] })
    expect(() => kit.remove(other)).toThrow(/not inside cache's roots/)
    expect(() => kit.remove(root)).toThrow(/not inside/)
    symlinkSync(other, join(root, 'out'))
    expect(() => kit.remove(join(root, 'out'))).toThrow(/not inside/)
    expect(existsSync(join(other, 'keep'))).toBe(true)
    // Inside the plugin's own roots is allowed.
    expect(boundKit('cache', { roots: [other] }).remove(join(other, 'keep'))).toMatch(/^removed /)
  })

  test('removes in a linked worktree outside the targets only when its main checkout is in one', () => {
    const git = (cwd: string, args: string[]): void => {
      new Git(cwd, { env: { ...IDENTITY } }).rawChecked(args)
    }
    const worktreeOf = (repo: string): string => {
      mkdirSync(repo)
      makeGitFixture({ dir: repo, initialBranch: 'main' })
      git(repo, ['commit', '--allow-empty', '-m', 'initial'])
      const wt = join(temp(), 'wt')
      git(repo, ['worktree', 'add', '-q', wt, '-b', 'linked'])
      put(join(wt, 'target', 'blob'), 1)
      return wt
    }
    const dev = temp()
    const inside = worktreeOf(join(dev, 'repo'))
    const outside = worktreeOf(join(temp(), 'repo'))
    const kit = boundKit('cargo', { targets: [dev] })
    expect(kit.remove(join(inside, 'target'))).toMatch(/^removed /)
    expect(() => kit.remove(join(outside, 'target'))).toThrow(/not inside cargo's roots/)
    expect(existsSync(join(outside, 'target', 'blob'))).toBe(true)
  })

  test('a folder already gone is not a failure', () => {
    const root = temp()
    expect(boundKit('x', { targets: [root] }).remove(join(root, 'nope'))).toBe(
      `already gone: ${join(root, 'nope')}`,
    )
  })

  test('refuses everything until the core binds the kit, and after the hook is stopped', () => {
    const root = temp()
    put(join(root, 'a', 'keep'), 1)
    expect(() => pluginKit('cache').remove(join(root, 'a'))).toThrow(/cache's kit is not bound/)
    const stopped = new AbortController()
    stopped.abort()
    const kit = boundKit('cache', { targets: [root] })
    expect(() => kit.remove(join(root, 'a'), { signal: stopped.signal })).toThrow(/was stopped/)
    expect(existsSync(join(root, 'a', 'keep'))).toBe(true)
  })

  /** A plugin on `kit` that proposes `<target>/cache` and removes it through the kit. */
  const cachePlugin = (kit: ReturnType<typeof pluginKit>, extra: Partial<Plugin> = {}): Plugin => {
    const plugin: Plugin = {
      name: 'cache',
      detect: () => true,
      discover: (x) =>
        x.targets.map((t) => kit.candidate({ kind: 'cache', path: join(t, 'cache'), why: 'idle' })),
      delete: (c, x) => kit.remove(c.path!, x),
      ...extra,
    }
    attachKit(plugin, kit)
    return plugin
  }

  test('the kit is unbound once clean is over', async () => {
    const root = temp()
    put(join(root, 'cache', 'blob'), 1)
    put(join(root, 'keep', 'blob'), 1)
    const kit = pluginKit('cache')
    const plugin = cachePlugin(kit)
    const ctx = { cwd: root, targets: [root], allow: [] }
    const receipt = await clean(plan(await survey([plugin], ctx)), [plugin], ctx)
    expect(receipt.status).toBe('complete')
    expect(() => kit.remove(join(root, 'keep'))).toThrow(/cache's kit is not bound/)
    expect(existsSync(join(root, 'keep', 'blob'))).toBe(true)
  })

  test("a delete's kit.remove keeps its own run's bounds while another run binds the same plugin", async () => {
    const mine = temp()
    const theirs = temp()
    put(join(mine, 'cache', 'blob'), 1)
    put(join(theirs, 'cache', 'blob'), 1)
    const kit = pluginKit('cache')
    let entered!: () => void
    const inDelete = new Promise<void>((resolve) => (entered = resolve))
    let go!: () => void
    const gate = new Promise<void>((resolve) => (go = resolve))
    let refused: unknown
    const plugin = cachePlugin(kit, {
      delete: async (c, x) => {
        entered()
        await gate
        try {
          kit.remove(join(theirs, 'cache'), x)
        } catch (err) {
          refused = err
        }
        return kit.remove(c.path!, x)
      },
    })
    const ctx = { cwd: mine, targets: [mine], allow: [] }
    const cleaning = clean(plan(await survey([plugin], ctx)), [plugin], ctx)
    await inDelete
    // Another run on the same plugin binds its kit to its own targets meanwhile.
    await survey([plugin], { cwd: theirs, targets: [theirs], allow: [] })
    go()
    const receipt = await cleaning
    expect(receipt.steps.map((x) => x.result)).toEqual(['ok'])
    expect(String(refused)).toMatch(/not inside cache's roots/)
    expect(existsSync(join(theirs, 'cache', 'blob'))).toBe(true)
    expect(existsSync(join(mine, 'cache'))).toBe(false)
  })

  test("the core binds a definition's kit to the roots its roots hook gives, and clean removes there", async () => {
    const root = temp()
    const dir = join(root, 'cache', 'a')
    put(join(dir, 'blob'), 1)
    const def = definePlugin({
      name: 'cache',
      api: PLUGIN_API,
      settings: z.strictObject({}),
      create: ({ kit }) => ({
        name: 'cache',
        detect: () => true,
        roots: () => [root],
        discover: () => [kit.candidate({ kind: 'cache', path: dir, why: 'idle' })],
        delete: (c) => kit.remove(c.path!),
      }),
    })
    const plugin = def.create({ settings: {}, env: {}, kit: pluginKit('cache') })
    // No target holds `dir`: only the roots the core asked the plugin for.
    const ctx = { cwd: root, targets: [], allow: [] }
    const receipt = await clean(plan(await survey([plugin], ctx)), [plugin], ctx)
    expect(receipt.steps).toEqual([
      expect.objectContaining({ result: 'ok', delete: expect.stringMatching(/^removed /) }),
    ])
    expect(existsSync(dir)).toBe(false)
  })
})

describe('a plugin built on a kit of its own', () => {
  test('is bound through definePlugin too: cargoPlugin without the kit create was given still removes', async () => {
    const root = temp()
    makeGitFixture({ dir: root, initialBranch: 'main' })
    new Git(root, { env: { ...IDENTITY } }).rawChecked(['commit', '--allow-empty', '-m', 'initial'])
    put(join(root, 'target', 'CACHEDIR.TAG'), 48)
    put(join(root, 'target', 'debug', '.fingerprint', 'a', 'lib-a'), 48)
    const probe: ProcessProbe = { alive: () => true, holders: () => [] }
    const def = definePlugin({
      name: 'cargo',
      api: PLUGIN_API,
      settings: z.strictObject({}),
      create: () => cargoPlugin({ now: () => NOW, probe, which: () => '/bin/cargo' }),
    })
    const plugin = def.create({ settings: {}, env: {}, kit: pluginKit('cargo') })
    const ctx = { cwd: root, targets: [root], allow: [] }
    const receipt = await clean(plan(await survey([plugin], ctx)), [plugin], ctx)
    expect(receipt.steps).toEqual([expect.objectContaining({ result: 'ok' })])
    expect(existsSync(join(root, 'target'))).toBe(false)
  })
})

describe('running', () => {
  const holder = (pid: number, command: string, extra: Partial<ProcessHolder> = {}) =>
    ({ pid, command, ...extra }) as ProcessHolder

  /** A `ps` that prints `table` for `-axo pid=,ppid=,args=`, counting its calls. */
  const fakePs = (table: string, calls: { n: number } = { n: 0 }): CommandRunner => ({
    run: (argv) => {
      calls.n++
      expect(argv).toEqual(['-axo', 'pid=,ppid=,args='])
      return { exitCode: 0, stdout: table, stderr: '' }
    },
  })

  test('lists the busy processes in a folder, idle shells left out, and the ones of a name, given alone or as { name }', () => {
    const asked: Array<{ path: string; fresh: boolean }> = []
    const probe: ProcessProbe = {
      alive: () => true,
      holders: (path, o) => {
        asked.push({ path, fresh: o?.fresh === true })
        return [holder(4, 'zsh', { hasChildren: false }), holder(5, 'cargo')]
      },
    }
    const calls = { n: 0 }
    const ps = fakePs('    4     1 -zsh\n    5     4 /Users/me/.cargo/bin/cargo build\n', calls)
    const kit = pluginKit('cargo', { probe, ps })
    const one = signal()
    expect(kit.running({ in: '/w' }, { signal: one })).toEqual({ names: ['cargo (pid 5)'] })
    expect(kit.running({ name: 'cargo' }, { signal: one })).toEqual({ names: ['cargo (pid 5)'] })
    expect(kit.running('cargo', { signal: one })).toEqual({ names: ['cargo (pid 5)'] })
    expect(kit.running('rustc', { signal: one })).toEqual({ names: [] })
    kit.running({ in: '/w' }, { signal: signal() })
    kit.running('cargo', { signal: signal() })
    // The first read in each hook call is fresh; `ps` is read once per hook call.
    expect(asked).toEqual([
      { path: '/w', fresh: true },
      { path: '/w', fresh: true },
    ])
    expect(calls.n).toBe(2)
  })

  test('a name matches a word of the command line, not only the command: pnpm under node, the Gradle daemon under java', () => {
    const table = [
      '  101     1 node /opt/homebrew/bin/pnpm dev',
      '  102     1 java -Xmx2g -cp /Users/me/.gradle/wrapper/dists/gradle-8.10/lib/gradle-launcher-8.10.jar org.gradle.launcher.daemon.bootstrap.GradleDaemon 8.10',
      '  103     1 node /Users/me/.cache/node/corepack/pnpm/9.12.0/bin/pnpm.cjs install',
      '  104     1 /usr/bin/vim notes-about-pnpmish.txt',
      '  105     1 node server.js',
    ].join('\n')
    const kit = pluginKit('x', { ps: fakePs(table) })
    const ask = (name: string) => kit.running({ name }, { signal: signal() }).names
    expect(ask('pnpm')).toEqual(['node (pid 101)', 'node (pid 103)'])
    expect(ask('GradleDaemon')).toEqual(['java (pid 102)'])
    expect(ask('gradle')).toEqual(['java (pid 102)'])
    expect(ask('node')).toEqual(['node (pid 101)', 'node (pid 103)', 'node (pid 105)'])
    expect(ask('npm')).toEqual([])
    expect(ask('yarn')).toEqual([])
  })

  /**
   * A process tree where this process is host-cleaner, started through
   * `launcher` from a shell; `others` are rows of processes outside the tree.
   */
  const startedBy = (launcher: string, others: string[] = []): string =>
    [
      '    1     0 /sbin/launchd',
      '   41     1 -zsh',
      `   42    41 ${launcher}`,
      `   43    42 sh -c host-cleaner clean`,
      `${process.pid}    43 node /Users/me/.npm/_npx/1a2b/node_modules/.bin/host-cleaner clean`,
      ...others,
    ].join('\n')

  test('host-cleaner and the launchers above it that name it are left out: the npm exec or pnpm dlx that started it is not running', () => {
    const ask = (table: string, name: string) =>
      pluginKit('x', { ps: fakePs(table) }).running({ name }, { signal: signal() }).names
    const npx = startedBy('npm exec @osdlc/host-cleaner clean')
    expect(ask(npx, 'npm')).toEqual([])
    expect(ask(npx, 'host-cleaner')).toEqual([])
    expect(ask(npx, 'node')).toEqual([])
    const dlx = startedBy('node /opt/homebrew/bin/pnpm dlx @osdlc/host-cleaner clean')
    expect(ask(dlx, 'pnpm')).toEqual([])
    expect(ask(dlx, 'node')).toEqual([])
  })

  test('an ancestor whose command line does not name host-cleaner is seen: the editor or terminal it runs inside', () => {
    const table = [
      '    1     0 /sbin/launchd',
      '   30     1 /Applications/Code.app/Contents/MacOS/Code',
      '   40    30 tmux new -s work',
      '   41    40 -zsh',
      '   42    41 npm exec @osdlc/host-cleaner clean',
      `${process.pid}    42 node /Users/me/.npm/_npx/1a2b/node_modules/.bin/host-cleaner clean`,
    ].join('\n')
    const ask = (name: string) =>
      pluginKit('x', { ps: fakePs(table) }).running({ name }, { signal: signal() }).names
    expect(ask('Code')).toEqual(['Code (pid 30)'])
    expect(ask('tmux')).toEqual(['tmux (pid 40)'])
    expect(ask('npm')).toEqual([])
  })

  test("a pnpm outside host-cleaner's own line still matches, beside the pnpm dlx that started it", () => {
    const table = startedBy('node /opt/homebrew/bin/pnpm dlx @osdlc/host-cleaner clean', [
      '   99    41 node /opt/homebrew/bin/pnpm install',
      `  100 ${process.pid} ps -axo pid=,ppid=,args=`,
    ])
    const kit = pluginKit('x', { ps: fakePs(table) })
    expect(kit.running({ name: 'pnpm' }, { signal: signal() }).names).toEqual(['node (pid 99)'])
    // A child of host-cleaner is not an ancestor: it is seen.
    expect(kit.running('ps', { signal: signal() }).names).toEqual(['ps (pid 100)'])
  })

  test('commandHasName: the last path segment, or one of its dot-separated parts; case counts', () => {
    expect(commandHasName('/opt/homebrew/bin/pnpm dev', 'pnpm')).toBe(true)
    expect(
      commandHasName('org.gradle.launcher.daemon.bootstrap.GradleDaemon', 'GradleDaemon'),
    ).toBe(true)
    expect(commandHasName('gradledaemon', 'GradleDaemon')).toBe(false)
    expect(commandHasName('pnpmx', 'pnpm')).toBe(false)
    expect(commandHasName('node', '')).toBe(false)
  })

  test('an unreadable process table is unknown, not empty', () => {
    const probe: ProcessProbe = {
      alive: () => true,
      holders: () => {
        throw new Error('no lsof')
      },
    }
    expect(pluginKit('x', { probe }).running({ in: '/w' }, { signal: signal() })).toEqual({
      names: [],
      unknown: 'no lsof',
    })
    const noPs: CommandRunner = {
      run: () => ({ exitCode: 1, stdout: '', stderr: 'ps: not allowed' }),
    }
    expect(pluginKit('x', { ps: noPs }).running('pnpm', { signal: signal() })).toEqual({
      names: [],
      unknown: 'ps failed (exit 1): ps: not allowed',
    })
  })
})

describe('running, when the table cannot be read', () => {
  test('the failure stands for the rest of the hook call: neither lsof nor ps is started again, and no older table answers', () => {
    const calls = { lsof: 0, ps: 0 }
    let broken = false
    // As repo-cleaner's: a table read once stays, and only `fresh` reads it again.
    let table: ProcessHolder[] | null = null
    const probe: ProcessProbe = {
      alive: () => true,
      holders: (_path, o) => {
        if (table === null || o?.fresh === true) {
          calls.lsof++
          if (broken) throw new Error('lsof did not run')
          table = []
        }
        return table
      },
    }
    const ps: CommandRunner = {
      run: () => {
        calls.ps++
        return { exitCode: 1, stdout: '', stderr: 'not allowed' }
      },
    }
    const kit = pluginKit('x', { probe, ps })
    expect(kit.running({ in: '/a' }, { signal: signal() })).toEqual({ names: [] })
    broken = true
    const one = signal()
    const unread = { names: [], unknown: 'lsof did not run' }
    expect(kit.running({ in: '/a' }, { signal: one })).toEqual(unread)
    expect(kit.running({ in: '/b' }, { signal: one })).toEqual(unread)
    expect(kit.running('pnpm', { signal: one }).unknown).toMatch(/^ps failed/)
    expect(kit.running('npm', { signal: one }).unknown).toMatch(/^ps failed/)
    expect(calls).toEqual({ lsof: 2, ps: 1 })
    // The next hook call reads afresh.
    broken = false
    expect(kit.running({ in: '/a' }, { signal: signal() })).toEqual({ names: [] })
    expect(calls.lsof).toBe(3)
  })
})

describe('onPath and run', () => {
  const fake = (exitCode: number, seen: unknown[] = []) =>
    asAsync({
      run: (argv: string[], opts: unknown) => {
        seen.push({ argv, opts })
        return { exitCode, stdout: 'out', stderr: exitCode === 0 ? '' : 'bad' }
      },
    } as unknown as CommandRunner)

  test('onPath asks which', () => {
    const kit = pluginKit('x', { which: (p) => (p === 'docker' ? '/bin/docker' : undefined) })
    expect(kit.onPath('docker')).toBe(true)
    expect(kit.onPath('podman')).toBe(false)
  })

  test('run passes the signal, the folder and a time limit, and says whether it worked', async () => {
    const seen: Array<{ argv: string[]; opts: Record<string, unknown> }> = []
    const programs: string[] = []
    const kit = pluginKit('docker', {
      runner: (p) => {
        programs.push(p)
        return fake(0, seen)
      },
    })
    const s = signal()
    const r = await kit.run(['docker', 'info'], { signal: s, cwd: '/w' })
    expect(r).toMatchObject({ ok: true, stdout: 'out' })
    expect(programs).toEqual(['docker'])
    expect(seen[0]!.argv).toEqual(['info'])
    expect(seen[0]!.opts).toMatchObject({ cwd: '/w', signal: s, timeoutMs: 30_000 })
  })

  test('a failing program is not ok, and throws with check', async () => {
    const kit = pluginKit('docker', { runner: () => fake(1) })
    expect((await kit.run(['docker', 'rm', 'v'], { signal: signal() })).ok).toBe(false)
    await expect(
      kit.run(['docker', 'rm', 'v'], { signal: signal(), check: true }),
    ).rejects.toBeInstanceOf(CommandFailed)
  })
})
