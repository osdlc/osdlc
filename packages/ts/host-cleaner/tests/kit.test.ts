/** The plugin kit: each helper on its own, against temp directories and fake runners. */

import { afterEach, describe, expect, test } from 'vitest'
import {
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
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import { CommandFailed, asAsync, type CommandRunner } from '@osdlc/command-seam'
import type { ProcessHolder, ProcessProbe } from '@osdlc/repo-cleaner'
import { Git } from '@osdlc/typed-git'
import { IDENTITY, makeGitFixture } from '@osdlc/typed-git/testing'
import { z } from 'zod'

import {
  PLUGIN_API,
  clean,
  commandHasName,
  definePlugin,
  plan,
  pluginKit,
  survey,
} from '../src/index.ts'
import { attachKit, bindKit } from '../src/kit.ts'
import type { Bounds } from '../src/roots.ts'

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
    let t = NOW.getTime()
    const kit = pluginKit('x', { now: () => new Date((t += 1_000)), budgetMs: 1_500 })
    expect(kit.idle(dir)).toEqual({ unmeasured: true })
    expect(pluginKit('x', { now: () => NOW, budgetMs: 0 }).idle(dir).unmeasured).toBe(false)
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
    const plugin = def.create({ settings: {}, only: [], env: {}, kit: pluginKit('cache') })
    // No target holds `dir`: only the roots the core asked the plugin for.
    const ctx = { cwd: root, targets: [], allow: [] }
    const receipt = await clean(plan(await survey([plugin], ctx)), [plugin], ctx)
    expect(receipt.steps).toEqual([
      expect.objectContaining({ result: 'ok', delete: expect.stringMatching(/^removed /) }),
    ])
    expect(existsSync(dir)).toBe(false)
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

  test('host-cleaner and every process above it are left out: the npm exec or pnpm dlx that started it is not running', () => {
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
