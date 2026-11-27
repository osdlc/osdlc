/** The `ollama` plugin over a fake `ollama` CLI shaped like the tables it prints. */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  BUILT_IN_PLUGINS,
  HOOK_LIMIT_MS,
  OLLAMA_IN_USE,
  OLLAMA_PS_FAILED,
  OLLAMA_USE_UNKNOWN,
  clean,
  decidePlan,
  ollamaPlugin,
  plan,
  pluginKit,
  survey,
  type Plugin,
  type Survey,
} from '../src/index.ts'
import {
  isLocal,
  leastHours,
  parseBytes,
  parseList,
  parsePs,
  pingUrl,
  serverUrl,
  sizeBound,
} from '../src/ollama.ts'
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
        bytes: 3_950_000_000,
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

  test('sizes in powers of 1000, read as the most the text can mean', () => {
    // HumanBytes cuts 10 and more to a whole number, and rounds less to a tenth unless it is whole.
    expect(parseBytes('849 MB')).toBe(850_000_000)
    expect(sizeBound('19 GB')).toEqual({ bytes: 20_000_000_000, text: '20 GB' })
    expect(sizeBound('3.9 GB')).toEqual({ bytes: 3_950_000_000, text: '3.95 GB' })
    expect(sizeBound('4 GB')).toEqual({ bytes: 4_000_000_000, text: '4 GB' })
    expect(parseBytes('512 B')).toBe(512)
    expect(parseBytes('-')).toBeNull()
    expect(parseBytes('3.9GiB')).toBeNull()
  })

  test('OLLAMA_HOST read as ollama reads it, and whether it is this machine', () => {
    expect(serverUrl(undefined)?.href).toBe('http://127.0.0.1:11434/')
    expect(serverUrl('')?.href).toBe('http://127.0.0.1:11434/')
    expect(serverUrl('0.0.0.0')?.href).toBe('http://0.0.0.0:11434/')
    expect(serverUrl(':8080')?.href).toBe('http://127.0.0.1:8080/')
    expect(serverUrl('localhost:9000')?.href).toBe('http://localhost:9000/')
    expect(serverUrl('https://ollama.example.com')?.href).toBe('https://ollama.example.com/')
    // A bare IPv6 address, as Go reads it: the whole text is the host.
    expect(serverUrl('2001:db8::5')?.href).toBe('http://[2001:db8::5]:11434/')
    // Text a URL cannot hold is not taken for this machine.
    expect(serverUrl('gpu box')).toBeNull()
    expect(serverUrl('http://[bad')).toBeNull()
    // As ollama's envconfig: every surrounding quote stripped, and a bad port taken as the default.
    expect(serverUrl(`"'localhost:9000'"`)?.href).toBe('http://localhost:9000/')
    expect(serverUrl('localhost:99999')?.href).toBe('http://localhost:11434/')
    expect(serverUrl('[::1]:x')?.href).toBe('http://[::1]:11434/')
    expect(serverUrl('http://localhost:99999/p')?.href).toBe('http://localhost/p')
    expect(serverUrl('" localhost "')?.href).toBe('http://localhost:11434/')
    expect(serverUrl(':99999')?.href).toBe('http://127.0.0.1:11434/')
    expect(serverUrl('localhost:')?.href).toBe('http://localhost:11434/')
    expect(serverUrl('HTTP://localhost')?.href).toBe('http://localhost:11434/')
    expect(serverUrl('[::1]')?.href).toBe('http://[::1]:11434/')
    // Go's ParseInt takes a signed port, but the request URL ollama's client builds from it does not parse.
    expect(serverUrl('localhost:+11434')).toBeNull()
    expect(serverUrl('localhost:-0')).toBeNull()
    // A bad port does not make text that names no host, or another one, this machine.
    for (const host of [
      'localhost:1:2',
      'localhost:x@gpu-box:99999',
      '127.0.0.1?@gpu-box:99999',
      '127.0.0.1\\@gpu-box:99999',
      'localhost#gpu-box',
    ]) {
      expect(serverUrl(host)).toBeNull()
    }
    expect(isLocal(serverUrl('gpu-box:99999')!)).toBe(false)
    // Node's fetch does not dial an unspecified address everywhere; ollama's client dials it as this machine.
    expect(pingUrl(serverUrl('0.0.0.0')!)).toBe('http://127.0.0.1:11434/api/version')
    expect(pingUrl(serverUrl('[::]:8080')!)).toBe('http://[::1]:8080/api/version')
    expect(pingUrl(serverUrl('localhost/sub/')!)).toBe('http://localhost:11434/sub/api/version')
    for (const host of ['', '0.0.0.0', 'localhost', '127.0.0.2:1', '[::1]:11434', '::1']) {
      expect(isLocal(serverUrl(host)!)).toBe(true)
    }
    for (const host of ['gpu-box:11434', '10.0.0.5', 'https://ollama.example.com', '2001:db8::5']) {
      expect(isLocal(serverUrl(host)!, [])).toBe(false)
    }
    // An IPv4-mapped loopback address, and this machine's own name or addresses.
    expect(isLocal(serverUrl('[::ffff:127.0.0.1]')!, [])).toBe(true)
    const here = ['my-mac.local', '192.168.1.20', 'fe80::1']
    for (const host of ['http://My-Mac.local:11434', '192.168.1.20', '[fe80::1]:11434']) {
      expect(isLocal(serverUrl(host)!, here)).toBe(true)
    }
    expect(isLocal(serverUrl('192.168.1.21')!, here)).toBe(false)
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
      bytes: 3_950_000_000,
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

  test('tags that share an ID count its size once when all may run, and say how it is freed', async () => {
    const id = idOf('base:7b')
    const { plugin } = fakeOllama([
      { name: 'base:7b', id, modified: '3 weeks ago' },
      { name: 'mine:latest', id, modified: '3 weeks ago' },
      { name: 'other:1b', modified: '3 weeks ago' },
    ])
    const s = await survey([plugin], ctx)
    expect(s.candidates.map((c) => [c.name, c.bytes])).toEqual([
      ['base:7b', 3_950_000_000],
      ['mine:latest', 0],
      ['other:1b', 3_950_000_000],
    ])
    expect(s.candidates[0]!.why).toContain(
      'it shares its files (3.9 GB) with mine:latest, so removing it alone frees nothing; removing them all frees what base:7b counts',
    )
    expect(s.candidates[1]!.why).toContain('with base:7b')
    expect(s.candidates[2]!.why).not.toContain('shares')
  })

  test('tags that share an ID count nothing when one of them is held', async () => {
    const id = idOf('base:7b')
    const { plugin } = fakeOllama([
      { name: 'base:7b', id, modified: '3 weeks ago' },
      { name: 'mine:latest', id, modified: '2 hours ago' },
    ])
    const s = await survey([plugin], ctx)
    expect(s.candidates.map((c) => [c.name, c.bytes, c.held === true])).toEqual([
      ['base:7b', 0, false],
      ['mine:latest', 0, true],
    ])
    expect(s.candidates[0]!.why).toMatch(/with mine:latest, so removing it alone frees nothing$/)
  })

  test('a size it cannot read is held with a reason, not dropped as a cloud model', async () => {
    const { plugin } = fakeOllama([{ name: 'new:7b', size: '3.9GiB', modified: '3 weeks ago' }])
    const s = await survey([plugin], ctx)
    expect(s.candidates).toHaveLength(1)
    expect(s.candidates[0]!.held).toBe(true)
    expect(s.candidates[0]!.bytes).toBeUndefined()
    expect(s.candidates[0]!.why).toContain('its size "3.9GiB" cannot be read')
  })

  test('a server that is down is not started: detect leaves it out with a note', async () => {
    server.mockImplementation(async () => {
      throw new TypeError('fetch failed')
    })
    const { plugin, calls } = fakeOllama(models)
    const s = await survey([plugin], ctx)
    expect(s.candidates).toEqual([])
    expect(s.warnings).toEqual([])
    expect(s.notes['ollama']).toBe("ollama's server at 127.0.0.1:11434 does not answer")
    expect(calls()).toEqual([])
    expect(server.mock.calls[0]![0]).toBe('http://127.0.0.1:11434/api/version')
  })

  test('a hook stopped during the ping gives why it was stopped, not a server that does not answer', async () => {
    const stop = new AbortController()
    server.mockImplementation(async () => {
      stop.abort(new Error('hook took too long'))
      throw new DOMException('This operation was aborted', 'AbortError')
    })
    const { plugin, calls } = fakeOllama(models)
    const c = {
      id: 'ollama-model:old:7b',
      kind: 'ollama-model',
      ref: 'old:7b',
      owner: 'ollama',
      why: 'x',
      evidence: { kind: 'ollama-model', name: 'old:7b', id: idOf('old:7b') },
    }
    const [o] = await plugin.object!([c], fakeContext({ signal: stop.signal }))
    expect(o).toMatchObject({ code: OLLAMA_PS_FAILED, reason: 'hook took too long' })
    expect(calls()).toEqual([])
  })

  test('OLLAMA_HOST 0.0.0.0 is pinged at the loopback address', async () => {
    vi.stubEnv('OLLAMA_HOST', '0.0.0.0')
    const { plugin } = fakeOllama(models)
    const s = await survey([plugin], ctx)
    expect(s.candidates).toHaveLength(4)
    for (const [url] of server.mock.calls) expect(url).toBe('http://127.0.0.1:11434/api/version')
  })

  test("a stuck server refuses ollama's models and no other plugin's candidates", async () => {
    vi.useFakeTimers()
    try {
      const after = (ms: number) => new Promise((done) => setTimeout(done, ms))
      const fake = fakeRunner({ ollama: { list: { stdout: listText(models) } } })
      const runner: typeof fake.runner = (program) => ({
        async run(args, opts) {
          if (args[0] !== 'ps') return fake.runner(program).run(args, opts)
          // `ps` never answers: the runner stops it at the limit it was given.
          const ms = Number(opts.timeoutMs)
          await after(ms)
          const error = `timed out after ${ms}ms`
          return {
            exitCode: 1,
            neverExited: true,
            reason: 'timeout',
            stdout: '',
            stderr: '',
            error,
          }
        },
      })
      // The ping answers at the last moment.
      server.mockImplementation(async () => {
        await after(4_900)
        return { ok: true }
      })
      const other: Plugin = {
        name: 'other',
        detect: () => true,
        discover: () => [
          { id: 'x:1', kind: 'x', ref: '1', owner: 'other', why: 'x', evidence: {} },
        ],
      }
      const ollama = ollamaPlugin({}, pluginKit('ollama', { ...fake, runner }))
      const surveyed = survey([other, ollama], ctx)
      await vi.advanceTimersByTimeAsync(3 * HOOK_LIMIT_MS)
      const s = await surveyed
      expect(s.warnings).toEqual([])
      expect(refusals(s)).toEqual(
        ['old:7b', 'loaded:7b', 'fresh:1b', 'odd:1b'].map((m) => [
          `ollama-model:${m}`,
          OLLAMA_PS_FAILED,
        ]),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  test('a failure ollama explains on stdout gives that as the reason', async () => {
    const fake = fakeRunner({
      ollama: (argv) =>
        argv[0] === 'ps'
          ? { exitCode: 1, stdout: 'Error: the server is loading a model' }
          : { stdout: listText(models) },
    })
    const s = await survey([ollamaPlugin({}, pluginKit('ollama', fake))], ctx)
    expect(s.objections.find((o) => o.code === OLLAMA_PS_FAILED)?.reason).toBe(
      'ollama ps failed: Error: the server is loading a model',
    )
  })

  test('an OLLAMA_HOST on another machine leaves it out with a note', async () => {
    vi.stubEnv('OLLAMA_HOST', 'gpu-box:11434')
    const { plugin, calls } = fakeOllama(models)
    const s = await survey([plugin], ctx)
    expect(s.candidates).toEqual([])
    expect(s.notes['ollama']).toContain('OLLAMA_HOST points at gpu-box:11434')
    expect(calls()).toEqual([])
    expect(server).not.toHaveBeenCalled()
  })

  test('an OLLAMA_HOST with a scheme other than http or https leaves it out with a note naming it', async () => {
    vi.stubEnv('OLLAMA_HOST', 'tcp://localhost:11434')
    const { plugin, calls } = fakeOllama(models)
    const s = await survey([plugin], ctx)
    expect(s.candidates).toEqual([])
    expect(s.notes['ollama']).toBe(
      "OLLAMA_HOST uses tcp://, which ollama's client cannot reach a server by",
    )
    expect(calls()).toEqual([])
    expect(server).not.toHaveBeenCalled()
  })

  test('an OLLAMA_HOST it cannot read is not taken for this machine', async () => {
    vi.stubEnv('OLLAMA_HOST', 'gpu box')
    const { plugin, calls } = fakeOllama(models)
    const s = await survey([plugin], ctx)
    expect(s.candidates).toEqual([])
    expect(s.notes['ollama']).toContain('OLLAMA_HOST is "gpu box", which names no server')
    expect(calls()).toEqual([])
    expect(server).not.toHaveBeenCalled()
  })

  test('a bare IPv6 OLLAMA_HOST on another machine is not this machine', async () => {
    vi.stubEnv('OLLAMA_HOST', '2001:db8::5')
    const { plugin, calls } = fakeOllama(models)
    const s = await survey([plugin], ctx)
    expect(s.candidates).toEqual([])
    expect(s.notes['ollama']).toContain('OLLAMA_HOST points at [2001:db8::5]:11434')
    expect(calls()).toEqual([])
  })

  test('the ping cancels the body it does not read', async () => {
    const cancel = vi.fn(async () => {})
    server.mockImplementation(async () => ({ ok: true, body: { cancel } }) as never)
    const { plugin } = fakeOllama(models)
    await survey([plugin], ctx)
    expect(server).toHaveBeenCalled()
    expect(cancel).toHaveBeenCalledTimes(server.mock.calls.length)
  })

  test('a loaded model is refused by its ID too, under another name', async () => {
    const { plugin } = fakeOllama(
      [{ name: 'copy:7b', id: idOf('loaded:7b'), modified: '3 weeks ago' }],
      {
        loaded: ['loaded:7b'],
      },
    )
    expect(refusals(await survey([plugin], ctx))).toEqual([['ollama-model:copy:7b', OLLAMA_IN_USE]])
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
    expect(new Set(refusals(s).map(([, code]) => code))).toEqual(new Set([OLLAMA_PS_FAILED]))
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
  test('an old model is removed with ollama rm, after list and then ps are read again', async () => {
    const { plugin, calls, live } = fakeOllama([{ name: 'old:7b', modified: '3 weeks ago' }])
    const receipt = await clean(allowed(await survey([plugin], ctx)), [plugin], ctx)
    expect(receipt.status).toBe('complete')
    expect(receipt.steps.map((s) => s.delete)).toEqual([
      'ollama rm removed old:7b; freed at most 3.95 GB',
    ])
    expect(live).toEqual([])
    expect(calls().slice(-4)).toEqual([
      'ollama list',
      'ollama ps',
      'ollama rm old:7b',
      'ollama list',
    ])
  })

  test('the receipt says which removal of tags that share an ID freed their files', async () => {
    const id = idOf('base:7b')
    const { plugin } = fakeOllama([
      { name: 'base:7b', id, modified: '3 weeks ago' },
      { name: 'mine:latest', id, modified: '3 weeks ago' },
    ])
    const receipt = await clean(allowed(await survey([plugin], ctx)), [plugin], ctx)
    expect(receipt.steps.map((s) => s.delete)).toEqual([
      'ollama rm removed base:7b; freed nothing, its files stay for mine:latest',
      'ollama rm removed mine:latest; freed at most 3.95 GB',
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

  test('it imports nothing of host-cleaner but the kit, the shared helpers and the plugin types', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'ollama.ts'),
      'utf8',
    )
    const imports = [...src.matchAll(/^(?:import|\}) .*from '([^']+)'$/gm)].map((m) => m[1]!)
    expect(imports.filter((i) => i !== 'zod' && !i.startsWith('node:')).sort()).toEqual([
      './helpers.ts',
      './kit.ts',
      './types.ts',
    ])
  })
})
