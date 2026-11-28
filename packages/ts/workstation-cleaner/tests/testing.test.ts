/** `@osdlc/workstation-cleaner/testing`: the fakes, and the contract suite against a plugin that keeps it and plugins that each break one rule. */

import { afterEach, describe, expect, test } from 'vitest'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { z } from 'zod'

import { PLUGIN_API, definePlugin, pluginKit, type Plugin } from '../src/index.ts'
import {
  ageTree,
  contractSuite,
  fakeContext,
  fakeProcesses,
  fakeRunner,
  tempHome,
} from '../src/testing.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

const home = (): string => {
  const h = tempHome()
  cleanups.push(h.cleanup)
  return h.home
}

/** A plugin that cleans `<home>/cache/a` and keeps the contract; `over` breaks it. */
function cachePlugin(over: (root: string) => Partial<Plugin> = () => ({})) {
  const root = home()
  const dir = join(root, 'cache', 'a')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'blob'), 'x')
  const def = definePlugin({
    name: 'cache',
    api: PLUGIN_API,
    settings: z.strictObject({}),
    create: ({ kit }): Plugin => ({
      name: 'cache',
      detect: () => true,
      roots: () => [root],
      discover: () => [
        kit.candidate({ kind: 'cache', path: dir, why: 'idle', evidence: { n: 1 } }),
      ],
      delete: (c) => kit.remove(c.path!),
      ...over(root),
    }),
  })
  const plugin = def.create({ settings: {}, env: {}, kit: pluginKit('cache') })
  return { plugin, root, dir }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('contractSuite', () => {
  test('a plugin that keeps the contract has no problems, and its folder is put back as it was', async () => {
    const { plugin, dir } = cachePlugin()
    expect(await contractSuite(plugin)).toEqual([])
    expect(lstatSync(dir).isDirectory()).toBe(true)
    expect(existsSync(join(dir, 'blob'))).toBe(true)
  })

  test('a path candidate outside the roots and the targets', async () => {
    const elsewhere = home()
    const { plugin } = cachePlugin(() => ({
      discover: () => [pluginKit('cache').candidate({ kind: 'cache', path: elsewhere, why: 'x' })],
    }))
    expect(await contractSuite(plugin)).toEqual([
      expect.stringMatching(
        new RegExp(`^cache: proposed cache:${elsewhere}, which is not inside its roots`),
      ),
    ])
  })

  test('evidence that changes between two surveys', async () => {
    let n = 0
    const { plugin, dir } = cachePlugin(() => ({
      discover: () => [
        pluginKit('cache').candidate({ kind: 'cache', path: dir, why: 'x', evidence: { n: ++n } }),
      ],
    }))
    expect(await contractSuite(plugin)).toEqual([
      `cache: the evidence of cache:${dir} changed between two surveys: {"n":1} then {"n":2}`,
    ])
  })

  test('an id that changes between two surveys', async () => {
    let n = 0
    const { plugin, dir } = cachePlugin(() => ({
      discover: () => [
        { ...pluginKit('cache').candidate({ kind: 'cache', path: dir, why: 'x' }), id: `c${++n}` },
      ],
    }))
    expect(await contractSuite(plugin)).toEqual([
      'cache: proposed c1 in the first survey and not in the second',
      'cache: proposed c2 in the second survey and not in the first',
    ])
  })

  test('two candidates with one id', async () => {
    const { plugin, dir } = cachePlugin(() => ({
      discover: () => {
        const c = pluginKit('cache').candidate({ kind: 'cache', path: dir, why: 'x' })
        return [c, { ...c }]
      },
    }))
    expect(await contractSuite(plugin)).toEqual([
      `cache: the survey warned: duplicate cache:${dir}: kept cache's, dropped cache's`,
    ])
  })

  test('a value JSON would change, in a candidate or an objection', async () => {
    const { plugin, dir } = cachePlugin(() => ({
      discover: () => [
        pluginKit('cache').candidate({
          kind: 'cache',
          path: dir,
          why: 'x',
          evidence: { at: new Date(0) },
        }),
      ],
      object: (all) =>
        all.map((c) => ({
          by: 'cache',
          candidate: c.id,
          level: 'note' as const,
          code: 'size',
          reason: 'big',
          extra: new Map(),
        })),
    }))
    expect(await contractSuite(plugin)).toEqual([
      `cache: cache:${dir} does not survive JSON: candidate.evidence.at is a Date`,
      `cache: an objection to cache:${dir} does not survive JSON: objection.extra is a Map`,
    ])
  })

  test('a delete that follows its folder, moved outside the roots, and removes it', async () => {
    const { plugin, dir } = cachePlugin(() => ({
      delete: (c) => {
        const real = realpathSync(c.path!)
        rmSync(real, { recursive: true })
        return `removed ${real}`
      },
    }))
    expect(await contractSuite(plugin)).toEqual([
      expect.stringMatching(
        new RegExp(
          `^cache: delete removed ${dir} \\(moved to .*workstation-cleaner-suite-.*/outside/moved\\), which is outside its roots and the targets$`,
        ),
      ),
    ])
  })

  test('a delete that returns without refusing a folder outside the roots', async () => {
    const { plugin, dir } = cachePlugin(() => ({ delete: () => 'done' }))
    expect(await contractSuite(plugin)).toEqual([
      expect.stringMatching(/^cache: delete returned "done" for .*; it must throw$/),
    ])
    expect(lstatSync(dir).isDirectory()).toBe(true)
  })

  test('a delete that never finishes is reported, not waited on', async () => {
    const { plugin, dir } = cachePlugin(() => ({ delete: () => new Promise<string>(() => {}) }))
    expect(await contractSuite(plugin, {}, { deleteLimitMs: 50 })).toEqual([
      expect.stringMatching(/^cache: delete did not finish within 50 ms for /),
    ])
    expect(lstatSync(dir).isDirectory()).toBe(true)
  })

  test('a delete that leaves a new folder in place of the moved one: the moved folder is kept, not removed', async () => {
    const { plugin, dir } = cachePlugin(() => ({
      delete: (c) => {
        rmSync(c.path!)
        mkdirSync(c.path!)
        return 'replaced'
      },
    }))
    const problems = await contractSuite(plugin)
    expect(problems).toEqual([
      expect.stringMatching(/^cache: delete returned "replaced" for .*; it must throw$/),
      expect.stringMatching(/^cache: the suite could not put its folder back; it is kept at /),
    ])
    const kept = problems[1]!.replace(/^.* it is kept at /, '')
    cleanups.push(() => rmSync(join(kept, '..', '..'), { recursive: true, force: true }))
    expect(existsSync(join(kept, 'blob'))).toBe(true)
    expect(lstatSync(dir).isDirectory()).toBe(true)
  })

  test("roots that hold the suite's own folder are reported, and delete is not called", async () => {
    let called = false
    const { plugin } = cachePlugin(() => ({
      roots: () => [tmpdir()],
      delete: () => {
        called = true
        throw new Error('refused')
      },
    }))
    expect(await contractSuite(plugin)).toEqual([
      expect.stringMatching(
        /^cache: the suite's folder .*workstation-cleaner-suite-.* is inside its roots or the targets/,
      ),
    ])
    expect(called).toBe(false)
  })

  test('a hook that runs past its time limit, and limits that are not hooks or not positive', async () => {
    const { plugin } = cachePlugin(() => ({
      limits: { discover: 10, object: 0, sweep: 5 } as Plugin['limits'],
      discover: async () => {
        await sleep(200)
        return []
      },
    }))
    expect(await contractSuite(plugin)).toEqual([
      'cache: limits names sweep, which is not a hook',
      'cache: the survey warned: cache: limits.object is 0, not a positive number of milliseconds; the default was used',
      'cache: the survey warned: cache: discover failed: timed out after 10 ms',
      'cache: proposed no candidate in this fixture, so the candidate checks had nothing to check',
    ])
  })

  test('a plugin not detected in the fixture', async () => {
    const { plugin } = cachePlugin(() => ({ detect: () => false }))
    expect(await contractSuite(plugin)).toEqual([
      'cache: detect said no in this fixture, so nothing else could be checked',
    ])
    const noted = cachePlugin(() => ({ detect: () => ({ active: false, note: 'not set up' }) }))
    expect(await contractSuite(noted.plugin)).toEqual([
      'cache: detect said no in this fixture, so nothing else could be checked (its note: not set up)',
    ])
  })

  test('detect may answer { active, note }: a note on a plugin that runs is no problem', async () => {
    const { plugin } = cachePlugin(() => ({
      detect: () => ({ active: true, note: 'degraded: the daemon is down' }),
    }))
    expect(await contractSuite(plugin)).toEqual([])
  })

  test('a detect answer that is neither a boolean nor { active, note?, vars? }', async () => {
    const { plugin } = cachePlugin(() => ({
      detect: () => ({ active: true, note: 3 }) as unknown as boolean,
    }))
    expect(await contractSuite(plugin)).toEqual([
      'cache: detect said no in this fixture, so nothing else could be checked',
      'cache: the survey warned: cache: detect answered {"active":true,"note":3}, which is neither a boolean nor { active, note?, vars? }; it was left out',
    ])
  })
})

describe('the fakes', () => {
  test('fakeContext fills in what a hook is given', () => {
    const ctx = fakeContext({ targets: ['/r'] })
    expect(ctx).toMatchObject({ targets: ['/r'], targetsGiven: false, allow: [] })
    expect(ctx.signal.aborted).toBe(false)
  })

  test('fakeRunner answers the programs in its table, records each call and knows what is on PATH', async () => {
    const fake = fakeRunner({ docker: { info: { stdout: 'ok' } } })
    const kit = pluginKit('docker', fake)
    const signal = new AbortController().signal
    expect(kit.onPath('docker')).toBe(true)
    expect(kit.onPath('podman')).toBe(false)
    expect(await kit.run(['docker', 'info'], { signal })).toMatchObject({ ok: true, stdout: 'ok' })
    expect((await kit.run(['podman', 'info'], { signal })).ok).toBe(false)
    expect(fake.calls.map((c) => c.argv)).toEqual([
      ['docker', 'info'],
      ['podman', 'info'],
    ])
    expect(fake.calls[0]!.opts.signal).toBe(signal)
  })

  test('tempHome is a real, empty folder until cleaned up', () => {
    const h = tempHome()
    expect(existsSync(h.home)).toBe(true)
    expect(h.env).toEqual({ HOME: h.home })
    h.cleanup()
    expect(existsSync(h.home)).toBe(false)
  })
})

describe('fakeProcesses and ageTree', () => {
  test("the kit's running reads the table, by name and by folder, as it is when asked", () => {
    const table: Parameters<typeof fakeProcesses>[0] = {}
    const kit = pluginKit('x', fakeProcesses(table))
    expect(kit.running('pip', fakeContext())).toEqual({ names: [], processes: [] })
    table['/'] = [{ pid: 5_000_000, command: 'python3 -m pip install' }]
    table['/work'] = [{ pid: 5_000_001, command: 'vim' }]
    expect(kit.running('pip', fakeContext()).names).toEqual(['python3 (pid 5000000)'])
    expect(kit.running({ in: '/work' }, fakeContext()).names).toEqual(['vim (pid 5000001)'])
  })

  test('ageTree backdates a folder and all in it, and follows no link', () => {
    const dir = join(home(), 'dir')
    const elsewhere = home()
    mkdirSync(join(dir, 'sub'), { recursive: true })
    writeFileSync(join(dir, 'sub', 'file'), 'x')
    writeFileSync(join(elsewhere, 'file'), 'x')
    symlinkSync(join(elsewhere, 'file'), join(dir, 'to-file'))
    symlinkSync(elsewhere, join(dir, 'to-folder'))
    symlinkSync(join(elsewhere, 'gone'), join(dir, 'dangling'))
    ageTree(dir, 48)
    // A file just written can be stamped a hair after Date.now(), which rounds to -0; `+ 0` makes that 0.
    const hours = (path: string): number =>
      Math.round((Date.now() - lstatSync(path).mtimeMs) / 3_600_000) + 0
    for (const p of ['', 'sub', 'sub/file', 'to-file', 'to-folder', 'dangling']) {
      expect(hours(join(dir, p)), p).toBe(48)
    }
    expect(hours(join(elsewhere, 'file'))).toBe(0)
    expect(hours(elsewhere)).toBe(0)
    expect(pluginKit('x').idle(dir)).toMatchObject({ hours: expect.closeTo(48, 1) })
  })
})
