/** The `ollama` plugin over a fake `ollama` CLI shaped like the tables it prints. */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  BUILT_IN_PLUGINS,
  OLLAMA_IN_USE,
  OLLAMA_USE_UNKNOWN,
  clean,
  decidePlan,
  ollamaPlugin,
  plan,
  pluginKit,
  survey,
  type Survey,
} from '../src/index.ts'
import { isLocal, leastHours, parseBytes, parseList, parsePs, serverUrl } from '../src/ollama.ts'
import { contractSuite, fakeContext, fakeRunner } from '../src/testing.ts'

interface Model {
  name: string
  id?: string
  size?: string
  modified: string
}

/** A table as ollama prints one: aligned columns four spaces apart. */
function tableText(header: string[], rows: string[][]): string {
  const all = [header, ...rows]
  const widths = header.map((_, i) => Math.max(...all.map((r) => r[i]!.length)) + 4)
  return all.map((r) => r.map((c, i) => c.padEnd(widths[i]!)).join('')).join('\n') + '\n'
}

/** `ollama list` as ollama prints it. */
const listText = (models: readonly Model[]): string =>
  tableText(
    ['NAME', 'ID', 'SIZE', 'MODIFIED'],
    models.map((m) => [m.name, m.id ?? idOf(m.name), m.size ?? '3.9 GB', m.modified]),
  )

/** `ollama ps` as ollama prints it, with `loaded` the models in memory. */
const psText = (loaded: readonly string[]): string =>
  tableText(
    ['NAME', 'ID', 'SIZE', 'PROCESSOR', 'CONTEXT', 'RUNNER', 'UNTIL'],
    loaded.map((n) => [n, idOf(n), '6.7 GB', '100% GPU', '4096', 'llama', '4 minutes from now']),
  )

const idOf = (name: string): string =>
  [...name]
    .reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7)
    .toString(16)
    .padStart(12, 'a')

/** A fake `ollama` over `models`, with `loaded` in memory; `rm` drops a model from the list. */
function fakeOllama(
  models: Model[],
  over: { loaded?: string[]; psFails?: boolean; listFails?: boolean } = {},
) {
  const live = [...models]
  const fake = fakeRunner({
    ollama: (argv) => {
      const [verb, name] = argv
      if (verb === 'list') {
        if (over.listFails === true) {
          return { exitCode: 1, stderr: 'Error: could not connect to ollama app, is it running?' }
        }
        return { stdout: listText(live) }
      }
      if (verb === 'ps') {
        if (over.psFails === true) return { exitCode: 1, stderr: 'Error: connection refused' }
        return { stdout: psText(over.loaded ?? []) }
      }
      if (verb === 'rm' && name !== undefined) {
        const i = live.findIndex((m) => m.name === name)
        if (i < 0) return { exitCode: 1, stderr: `Error: model '${name}' not found` }
        live.splice(i, 1)
        return { stdout: `deleted '${name}'\n` }
      }
      return undefined
    },
  })
  const plugin = ollamaPlugin({ idleHours: 24 }, pluginKit('ollama', fake))
  const calls = () => fake.calls.map((c) => c.argv.join(' '))
  return { plugin, calls, live }
}

const ctx = fakeContext()

/** The server's answer to `/api/version`; every test starts with it up. */
const server = vi.fn(async (_url: string, _init?: unknown) => ({ ok: true }))

beforeEach(() => {
  server.mockClear()
  server.mockImplementation(async () => ({ ok: true }))
  vi.stubGlobal('fetch', server)
  vi.stubEnv('OLLAMA_HOST', '')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

/** A plan that grants the protest every ollama model carries. */
const allowed = (s: Survey) => plan(s, { allow: [OLLAMA_USE_UNKNOWN] })

const refusals = (s: Survey) =>
  s.objections.filter((o) => o.level === 'refuse').map((o) => [o.candidate, o.code])

describe('parsing', () => {
  test('ollama list, read by its header', () => {
    const text = [
      'NAME                    ID              SIZE      MODIFIED     ',
      'd1:2b                   a3b89e90e6a3    3.9 GB    4 days ago    ',
      'gpt-oss:120b-cloud      569662207105    -         2 weeks ago    ',
      '',
    ].join('\n')
    expect(parseList(text)).toEqual([
      {
        name: 'd1:2b',
        id: 'a3b89e90e6a3',
        size: '3.9 GB',
        bytes: 3_900_000_000,
        modified: '4 days ago',
      },
      {
        name: 'gpt-oss:120b-cloud',
        id: '569662207105',
        size: '-',
        bytes: null,
        modified: '2 weeks ago',
      },
    ])
    expect(parseList('NAME    ID    SIZE    MODIFIED \n')).toEqual([])
    expect(() => parseList('Error: something\n')).toThrow(/without NAME, ID, SIZE, MODIFIED/)
  })

  test('ollama ps, by its first two columns; header only means nothing is loaded', () => {
    expect(parsePs(psText(['d1:2b']))).toEqual([{ name: 'd1:2b', id: idOf('d1:2b') }])
    expect(parsePs('NAME    ID    SIZE    PROCESSOR    CONTEXT    RUNNER    UNTIL \n')).toEqual([])
  })

  test('sizes in powers of 1000', () => {
    expect(parseBytes('849 MB')).toBe(849_000_000)
    expect(parseBytes('512 B')).toBe(512)
    expect(parseBytes('-')).toBeNull()
    expect(parseBytes('3.9GiB')).toBeNull()
  })

  test('OLLAMA_HOST read as ollama reads it, and whether it is this machine', () => {
    expect(serverUrl(undefined).href).toBe('http://127.0.0.1:11434/')
    expect(serverUrl('').href).toBe('http://127.0.0.1:11434/')
    expect(serverUrl('0.0.0.0').href).toBe('http://0.0.0.0:11434/')
    expect(serverUrl(':8080').href).toBe('http://127.0.0.1:8080/')
    expect(serverUrl('localhost:9000').href).toBe('http://localhost:9000/')
    expect(serverUrl('https://ollama.example.com').href).toBe('https://ollama.example.com/')
    for (const host of ['', '0.0.0.0', 'localhost', '127.0.0.2:1', '[::1]:11434']) {
      expect(isLocal(serverUrl(host))).toBe(true)
    }
    for (const host of ['gpu-box:11434', '10.0.0.5', 'https://ollama.example.com']) {
      expect(isLocal(serverUrl(host))).toBe(false)
    }
  })

  test('the MODIFIED text read as the fewest hours it can mean', () => {
    expect(leastHours('Less than a second ago')).toBe(0)
    expect(leastHours('30 seconds ago')).toBeCloseTo(30 / 3600)
    expect(leastHours('About a minute ago')).toBeCloseTo(1 / 60)
    expect(leastHours('45 minutes ago')).toBe(0.75)
    expect(leastHours('About an hour ago')).toBe(1)
    expect(leastHours('2 hours ago')).toBe(1.5)
    expect(leastHours('47 hours ago')).toBe(46.5)
    expect(leastHours('4 days ago')).toBe(95.5)
    expect(leastHours('3 weeks ago')).toBe(503.5)
    expect(leastHours('5 months ago')).toBe(3599.5)
    expect(leastHours('2 years ago')).toBe(17_520)
    expect(leastHours('about an hour ago')).toBe(1)
    for (const text of ['Never', 'Forever', '4 minutes from now', 'last Tuesday']) {
      expect(leastHours(text)).toBeNull()
    }
  })
})

describe('survey', () => {
  const models: Model[] = [
    { name: 'old:7b', modified: '3 weeks ago' },
    { name: 'loaded:7b', modified: '2 months ago' },
    { name: 'fresh:1b', modified: '5 hours ago' },
    { name: 'odd:1b', modified: 'Never' },
    { name: 'remote:cloud', size: '-', modified: '3 weeks ago' },
  ]

  test('an old model is proposed, a loaded one refused in-use, a fresh or undated one held, a cloud one left out', async () => {
    const { plugin } = fakeOllama(models, { loaded: ['loaded:7b'] })
    const s = await survey([plugin], ctx)
    expect(s.warnings).toEqual([])
    expect(s.candidates.map((c) => [c.id, c.held === true])).toEqual([
      ['ollama-model:old:7b', false],
      ['ollama-model:loaded:7b', false],
      ['ollama-model:fresh:1b', true],
      ['ollama-model:odd:1b', true],
    ])
    expect(refusals(s)).toEqual([['ollama-model:loaded:7b', OLLAMA_IN_USE]])
    expect(
      s.objections.filter((o) => o.level === 'protest').map((o) => [o.candidate, o.code]),
    ).toEqual([
      ['ollama-model:old:7b', OLLAMA_USE_UNKNOWN],
      ['ollama-model:fresh:1b', OLLAMA_USE_UNKNOWN],
      ['ollama-model:odd:1b', OLLAMA_USE_UNKNOWN],
    ])
    const old = s.candidates[0]!
    expect(old).toMatchObject({
      kind: 'ollama-model',
      ref: 'old:7b',
      name: 'old:7b',
      owner: 'ollama',
      bytes: 3_900_000_000,
      costDescription: 're-download',
      evidence: { kind: 'ollama-model', name: 'old:7b', id: idOf('old:7b') },
    })
    expect(old.why).toBe(
      'not pulled or changed for at least 503.5 hours, by ollama list (threshold 24)',
    )
    // Pull age is not use, so nothing runs until the protest is granted.
    expect(decidePlan(plan(s)).run).toEqual([])
    expect(decidePlan(allowed(s)).run.map((c) => c.id)).toEqual(['ollama-model:old:7b'])
  })

  test('tags that share an ID count their files once', async () => {
    const id = idOf('base:7b')
    const { plugin } = fakeOllama([
      { name: 'base:7b', id, modified: '3 weeks ago' },
      { name: 'mine:latest', id, modified: '3 weeks ago' },
    ])
    const s = await survey([plugin], ctx)
    expect(s.candidates.map((c) => [c.name, c.bytes])).toEqual([
      ['base:7b', 3_900_000_000],
      ['mine:latest', 0],
    ])
    expect(s.candidates[1]!.why).toContain('it shares its files with base:7b')
  })

  test('a size it cannot read is held with a reason, not dropped as a cloud model', async () => {
    const { plugin } = fakeOllama([{ name: 'new:7b', size: '3.9GiB', modified: '3 weeks ago' }])
    const s = await survey([plugin], ctx)
    expect(s.candidates).toHaveLength(1)
    expect(s.candidates[0]!.held).toBe(true)
    expect(s.candidates[0]!.bytes).toBeUndefined()
    expect(s.candidates[0]!.why).toContain('its size "3.9GiB" cannot be read')
  })

  test('a server that is down is not started: no ollama command runs', async () => {
    server.mockImplementation(async () => {
      throw new TypeError('fetch failed')
    })
    const { plugin, calls } = fakeOllama(models)
    const s = await survey([plugin], ctx)
    expect(s.candidates).toEqual([])
    expect(s.warnings.join('\n')).toContain("ollama's server at 127.0.0.1:11434 does not answer")
    expect(calls()).toEqual([])
    expect(server.mock.calls[0]![0]).toBe('http://127.0.0.1:11434/api/version')
  })

  test('an OLLAMA_HOST on another machine warns and proposes nothing', async () => {
    vi.stubEnv('OLLAMA_HOST', 'gpu-box:11434')
    const { plugin, calls } = fakeOllama(models)
    const s = await survey([plugin], ctx)
    expect(s.candidates).toEqual([])
    expect(s.warnings.join('\n')).toContain('OLLAMA_HOST points at gpu-box:11434')
    expect(calls()).toEqual([])
    expect(server).not.toHaveBeenCalled()
  })

  test('a loaded model is refused by its ID too, under another name', async () => {
    const { plugin } = fakeOllama(
      [{ name: 'copy:7b', id: idOf('loaded:7b'), modified: '3 weeks ago' }],
      {
        loaded: ['loaded:7b'],
      },
    )
    expect(refusals(await survey([plugin], ctx))).toEqual([
      ['ollama-model:copy:7b', OLLAMA_IN_USE],
    ])
  })

  test('idleHours 0 proposes a model pulled a minute ago', async () => {
    const fake = fakeRunner({
      ollama: {
        list: { stdout: listText([{ name: 'a:1b', modified: 'About a minute ago' }]) },
        ps: { stdout: psText([]) },
      },
    })
    const s = await survey([ollamaPlugin({ idleHours: 0 }, pluginKit('ollama', fake))], ctx)
    expect(s.candidates.map((c) => c.held)).toEqual([undefined])
  })

  test('ollama ps failing refuses every model', async () => {
    const { plugin } = fakeOllama(models, { psFails: true })
    const s = await survey([plugin], ctx)
    expect(new Set(refusals(s).map(([, code]) => code))).toEqual(new Set(['ollama-ps-failed']))
    expect(refusals(s)).toHaveLength(4)
    expect(s.objections[0]!.reason).toContain('connection refused')
  })

  test('a server that does not answer warns and proposes nothing', async () => {
    const { plugin } = fakeOllama(models, { listFails: true })
    const s = await survey([plugin], ctx)
    expect(s.candidates).toEqual([])
    expect(s.warnings.join('\n')).toContain('could not connect to ollama app')
  })

  test('without ollama on PATH it is not detected', async () => {
    const s = await survey([ollamaPlugin({}, pluginKit('ollama', fakeRunner({})))], ctx)
    expect(s.plugins).toEqual([])
  })
})

describe('clean', () => {
  test('an old model is removed with ollama rm, after ps and list are read again', async () => {
    const { plugin, calls, live } = fakeOllama([{ name: 'old:7b', modified: '3 weeks ago' }])
    const receipt = await clean(allowed(await survey([plugin], ctx)), [plugin], ctx)
    expect(receipt.status).toBe('complete')
    expect(receipt.steps.map((s) => s.delete)).toEqual(['ollama rm removed old:7b'])
    expect(live).toEqual([])
    expect(calls().slice(-4)).toEqual([
      'ollama ps',
      'ollama list',
      'ollama rm old:7b',
      'ollama list',
    ])
  })

  test('a model loaded after the re-check is not removed: delete reads ollama ps again', async () => {
    let ps = 0
    const fake = fakeRunner({
      ollama: (argv) => {
        if (argv[0] === 'list')
          return { stdout: listText([{ name: 'old:7b', modified: '3 weeks ago' }]) }
        // The survey and the re-check see nothing loaded; the delete's own read sees it.
        if (argv[0] === 'ps') return { stdout: psText(++ps > 2 ? ['old:7b'] : []) }
        return undefined
      },
    })
    const plugin = ollamaPlugin({}, pluginKit('ollama', fake))
    const receipt = await clean(allowed(await survey([plugin], ctx)), [plugin], ctx)
    expect(receipt.steps[0]).toMatchObject({
      result: 'failed',
      error: expect.stringContaining('ollama ps now shows old:7b loaded'),
    })
    expect(fake.calls.map((c) => c.argv.join(' '))).not.toContain('ollama rm old:7b')
  })

  test('a model already gone at the delete is not a failure', async () => {
    let lists = 0
    const fake = fakeRunner({
      ollama: (argv) => {
        if (argv[0] === 'list') {
          return {
            stdout: listText(++lists > 2 ? [] : [{ name: 'old:7b', modified: '3 weeks ago' }]),
          }
        }
        return argv[0] === 'ps' ? { stdout: psText([]) } : undefined
      },
    })
    const plugin = ollamaPlugin({}, pluginKit('ollama', fake))
    const receipt = await clean(allowed(await survey([plugin], ctx)), [plugin], ctx)
    expect(receipt.steps[0]).toMatchObject({ result: 'ok', delete: 'already gone: old:7b' })
  })

  test('a list that fails after a successful rm is noted, not a failure', async () => {
    let lists = 0
    const fake = fakeRunner({
      ollama: (argv) => {
        if (argv[0] === 'list') {
          if (++lists > 3) return { exitCode: 1, stderr: 'Error: connection refused' }
          return { stdout: listText([{ name: 'old:7b', modified: '3 weeks ago' }]) }
        }
        if (argv[0] === 'rm') return { stdout: "deleted 'old:7b'\n" }
        return argv[0] === 'ps' ? { stdout: psText([]) } : undefined
      },
    })
    const plugin = ollamaPlugin({}, pluginKit('ollama', fake))
    const receipt = await clean(allowed(await survey([plugin], ctx)), [plugin], ctx)
    expect(receipt.steps[0]).toMatchObject({
      result: 'ok',
      delete: expect.stringMatching(
        /^ollama rm removed old:7b; could not list again to check: ollama list failed: .*connection refused/,
      ),
    })
  })

  test("a failing rm reports ollama's own message", async () => {
    const fake = fakeRunner({
      ollama: (argv) => {
        if (argv[0] === 'list')
          return { stdout: listText([{ name: 'old:7b', modified: '3 weeks ago' }]) }
        if (argv[0] === 'rm') return { exitCode: 1, stderr: 'Error: permission denied' }
        return argv[0] === 'ps' ? { stdout: psText([]) } : undefined
      },
    })
    const plugin = ollamaPlugin({}, pluginKit('ollama', fake))
    const receipt = await clean(allowed(await survey([plugin], ctx)), [plugin], ctx)
    expect(receipt.steps[0]).toMatchObject({
      result: 'failed',
      error: expect.stringContaining('ollama rm old:7b failed: Error: permission denied'),
    })
  })

  test('delete refuses a candidate that is not one of its models', async () => {
    const { plugin } = fakeOllama([])
    await expect(
      plugin.delete!(
        {
          id: 'escaped:/tmp/x',
          kind: 'escaped',
          owner: 'ollama',
          why: 'x',
          path: '/tmp/x',
          evidence: {},
        },
        ctx,
      ),
    ).rejects.toThrow('is not an ollama model')
  })
})

describe('the contract', () => {
  test('ollama keeps the contract', async () => {
    const { plugin, calls } = fakeOllama([
      { name: 'old:7b', modified: '3 weeks ago' },
      { name: 'fresh:1b', modified: '5 hours ago' },
    ])
    expect(await contractSuite(plugin)).toEqual([])
    expect(calls()).not.toContain('ollama rm old:7b')
  })

  test('the command line builds it from its definition, with idleHours', async () => {
    const def = BUILT_IN_PLUGINS.find((d) => d.name === 'ollama')!
    const fake = fakeRunner({
      ollama: {
        list: { stdout: listText([{ name: 'a:1b', modified: '3 hours ago' }]) },
        ps: { stdout: psText([]) },
      },
    })
    const plugin = def.create({
      settings: { idleHours: 2 },
      only: [],
      env: {},
      kit: pluginKit('ollama', fake),
    })
    expect(plugin.name).toBe('ollama')
    // Under the default of 24 hours a model 3 hours old would be held.
    const [c] = (await survey([plugin], ctx)).candidates
    expect(c!.held).toBeUndefined()
    expect(c!.why).toBe(
      'not pulled or changed for at least 2.5 hours, by ollama list (threshold 2)',
    )
  })

  test('it imports nothing of host-cleaner but the kit and the plugin types', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'ollama.ts'),
      'utf8',
    )
    const imports = [...src.matchAll(/^(?:import|\}) .*from '([^']+)'$/gm)].map((m) => m[1]!)
    expect(imports.filter((i) => i !== 'zod').sort()).toEqual(['./kit.ts', './types.ts'])
  })
})
