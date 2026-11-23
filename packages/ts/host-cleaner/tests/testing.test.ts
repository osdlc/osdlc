/** `@osdlc/host-cleaner/testing`: the fakes, and the contract suite against a plugin that keeps it and plugins that each break one rule. */

import { afterEach, describe, expect, test } from 'vitest'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { pluginKit, type Plugin } from '../src/index.ts'
import { contractSuite, fakeContext, fakeRunner, tempHome } from '../src/testing.ts'

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
  const kit = pluginKit('cache')
  const plugin: Plugin = {
    name: 'cache',
    detect: () => true,
    roots: () => [root],
    discover: () => [kit.candidate({ kind: 'cache', path: dir, why: 'idle', evidence: { n: 1 } })],
    delete: (c, ctx) => kit.remove(c.path!, ctx, [root]),
    ...over(root),
  }
  return { plugin, root, dir }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('contractSuite', () => {
  test('a plugin that keeps the contract has no problems, and its folder is still there', async () => {
    const { plugin, dir } = cachePlugin()
    expect(await contractSuite(plugin)).toEqual([])
    expect(existsSync(dir)).toBe(true)
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

  test('a delete that removes a folder outside the roots', async () => {
    const { plugin } = cachePlugin(() => ({
      delete: (c) => {
        rmSync(c.path!, { recursive: true })
        return `removed ${c.path}`
      },
    }))
    expect(await contractSuite(plugin)).toEqual([
      expect.stringMatching(
        /^cache: delete removed .*host-cleaner-outside-.*, which is outside its roots and the targets$/,
      ),
    ])
  })

  test('a delete that returns without refusing a folder outside the roots', async () => {
    const { plugin } = cachePlugin(() => ({ delete: () => 'done' }))
    expect(await contractSuite(plugin)).toEqual([
      expect.stringMatching(/^cache: delete returned "done" for .*; it must throw$/),
    ])
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
      'cache: limits.object is 0; it must be a positive number of milliseconds',
      'cache: limits names sweep, which is not a hook',
      'cache: the survey warned: cache: discover failed: timed out after 10 ms',
      'cache: proposed no candidate in this fixture, so the candidate checks had nothing to check',
    ])
  })

  test('a plugin not detected in the fixture', async () => {
    const { plugin } = cachePlugin(() => ({ detect: () => false }))
    expect(await contractSuite(plugin)).toEqual([
      'cache: detect said no in this fixture, so nothing else could be checked',
    ])
  })
})

describe('the fakes', () => {
  test('fakeContext fills in what a hook is given', () => {
    const ctx = fakeContext({ targets: ['/r'] })
    expect(ctx).toMatchObject({ targets: ['/r'], allow: [] })
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
