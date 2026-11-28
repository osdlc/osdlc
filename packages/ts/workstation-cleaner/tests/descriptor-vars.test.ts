/**
 * Descriptor variables: each of the four sources, the config value that wins
 * over them and is trusted, the built-ins, a variable built from another, and
 * a hung command that times out so the next source is tried.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'

import { fakeNeverExited } from '@osdlc/command-seam/testing'

import { pluginKit } from '../src/index.ts'
import {
  BUILT_IN_VARS,
  VAR_COMMAND_LIMIT_MS,
  fillTemplate,
  resolveVars,
  type VarSource,
  type VarsAt,
} from '../src/descriptor/vars.ts'
import { fakeRunner, tempHome } from '../src/testing.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

/** A fixture home, and `resolveVars` over it with `env`, `programs` on PATH and `over`. */
function setup(
  o: {
    env?: Record<string, string>
    programs?: Parameters<typeof fakeRunner>[0]
  } = {},
) {
  const h = tempHome()
  cleanups.push(h.cleanup)
  const fake = fakeRunner(o.programs ?? {})
  const env = { ...h.env, ...o.env }
  const at: VarsAt = {
    home: h.home,
    os: 'linux',
    env,
    kit: pluginKit('x', { env, ...fake }),
    signal: new AbortController().signal,
  }
  const resolve = (vars: Record<string, VarSource[]>, over: Partial<VarsAt> = {}) =>
    resolveVars(vars, { ...at, ...over })
  return { home: h.home, calls: fake.calls, resolve }
}

describe('the env source', () => {
  test('a set variable gives its value', async () => {
    const { resolve } = setup({ env: { UV_CACHE_DIR: '/data/uv' } })
    expect((await resolve({ UV: [{ env: 'UV_CACHE_DIR' }] })).UV).toEqual({
      value: '/data/uv',
      from: 'env UV_CACHE_DIR',
      trusted: false,
      tried: [],
    })
  })

  test('an unset, empty or relative one moves on to the next source', async () => {
    const { home, resolve } = setup({ env: { EMPTY: '', REL: 'cache/uv' } })
    const v = await resolve({
      UV: [{ env: 'UNSET' }, { env: 'EMPTY' }, { env: 'REL' }, { value: '~/.cache/uv' }],
    })
    expect(v.UV).toEqual({
      value: join(home, '.cache/uv'),
      from: 'value',
      trusted: false,
      tried: [
        { source: 'env UNSET', failed: 'not set' },
        { source: 'env EMPTY', failed: 'not set' },
        { source: 'env REL', failed: 'cache/uv is not an absolute folder' },
      ],
    })
  })

  test('a leading ~ is read as the home folder', async () => {
    const { home, resolve } = setup({ env: { UV_CACHE_DIR: '~/fast/uv/' } })
    expect((await resolve({ UV: [{ env: 'UV_CACHE_DIR' }] })).UV?.value).toBe(join(home, 'fast/uv'))
  })

  test('an XDG folder that is not absolute gives no value, as the built-in ignores it; ~ is not read in it', async () => {
    const { home, resolve } = setup({ env: { XDG_CACHE_HOME: '~/c', XDG_DATA_HOME: 'data' } })
    const v = await resolve({
      CACHE_SET: [{ env: 'XDG_CACHE_HOME' }],
      DATA_SET: [{ env: 'XDG_DATA_HOME' }, { value: '~/.local/share' }],
      YARN: [{ value: '${CACHE_SET}/yarn' }, { value: '${XDG_CACHE_HOME}/yarn' }],
    })
    expect(v.CACHE_SET).toEqual({
      value: null,
      trusted: false,
      tried: [{ source: 'env XDG_CACHE_HOME', failed: '~/c is not an absolute folder' }],
    })
    expect(v.DATA_SET).toMatchObject({ value: join(home, '.local/share'), from: 'value' })
    // The same folder the built-in gives, not ~/c/yarn.
    expect(v.YARN).toMatchObject({ value: join(home, '.cache/yarn') })
    expect(v.XDG_CACHE_HOME).toMatchObject({ value: join(home, '.cache'), from: 'default' })
  })
})

describe('the file source', () => {
  /** Writes `text` to `name` under the home's `.config/tool/`. */
  const write = (home: string, name: string, text: string): string => {
    const dir = join(home, '.config', 'tool')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, name), text)
    return join(dir, name)
  }

  test.each([
    ['TOML', 'tool.toml', '[cache]\ndir = "/data/tool"\n'],
    ['JSON', 'tool.json', '{ "cache": { "dir": "/data/tool" } }'],
    ['YAML', 'tool.yaml', 'cache:\n  dir: /data/tool\n'],
    ['YAML as .yml', 'tool.yml', 'cache: { dir: /data/tool }\n'],
  ])('a dotted key in a %s file gives its value', async (_, name, text) => {
    const { home, resolve } = setup()
    write(home, name, text)
    const v = await resolve({
      DIR: [{ file: `\${XDG_CONFIG_HOME}/tool/${name}`, key: 'cache.dir' }],
    })
    expect(v.DIR).toEqual({
      value: '/data/tool',
      from: `file \${XDG_CONFIG_HOME}/tool/${name} key cache.dir`,
      trusted: false,
      tried: [],
    })
  })

  test('a missing file, a missing key, a value that is not a string, or a file that does not parse moves on', async () => {
    const { home, resolve } = setup()
    const bad = write(home, 'bad.toml', 'cache = [\n')
    const good = write(home, 'tool.toml', '[cache]\nsize = 3\n')
    const v = await resolve({
      DIR: [
        { file: '~/.config/tool/none.toml', key: 'cache.dir' },
        { file: '~/.config/tool/tool.toml', key: 'cache.dir' },
        { file: '~/.config/tool/tool.toml', key: 'cache.size' },
        { file: '~/.config/tool/bad.toml', key: 'cache' },
        { value: '/fallback' },
      ],
    })
    expect(v.DIR?.value).toBe('/fallback')
    expect(v.DIR?.tried.map((t) => t.failed)).toEqual([
      `no file ${join(home, '.config/tool/none.toml')}`,
      `${good} has no cache.dir`,
      `cache.size in ${good} is not a string`,
      expect.stringMatching(new RegExp(`^${bad.replaceAll('/', '\\/')} does not parse: `)),
    ])
  })

  test('a file named only by its extension is read by that extension', async () => {
    const { home, resolve } = setup()
    write(home, '.yaml', 'cache:\n  dir: /data/tool\n')
    const v = await resolve({ DIR: [{ file: '~/.config/tool/.yaml', key: 'cache.dir' }] })
    expect(v.DIR?.value).toBe('/data/tool')
  })

  test.skipIf(process.platform === 'win32')(
    'a FIFO is not read, so the next source is tried instead of waiting on it',
    async () => {
      const { home, resolve } = setup()
      const dir = join(home, '.config', 'tool')
      mkdirSync(dir, { recursive: true })
      const fifo = join(dir, 'tool.toml')
      execFileSync('mkfifo', [fifo])
      const v = await resolve({
        DIR: [{ file: '~/.config/tool/tool.toml', key: 'cache.dir' }, { value: '/fallback' }],
      })
      expect(v.DIR?.value).toBe('/fallback')
      expect(v.DIR?.tried.map((t) => t.failed)).toEqual([`${fifo} is not a file`])
    },
  )
})

describe('the command source', () => {
  test("its output, trimmed, is the value; it runs from home with the short limit and the hook's signal", async () => {
    const signal = new AbortController().signal
    const { home, calls, resolve } = setup({
      programs: { pnpm: { 'store path': { stdout: '/data/pnpm/store/v10\n' } } },
    })
    const v = await resolve({ STORE: [{ command: ['pnpm', 'store', 'path'] }] }, { signal })
    expect(v.STORE).toEqual({
      value: '/data/pnpm/store/v10',
      from: 'command pnpm store path',
      trusted: false,
      tried: [],
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.argv).toEqual(['pnpm', 'store', 'path'])
    expect(calls[0]!.opts).toMatchObject({ cwd: home, timeoutMs: VAR_COMMAND_LIMIT_MS, signal })
  })

  test('a program not on PATH is not run, and the next source is tried', async () => {
    const { calls, resolve } = setup()
    const v = await resolve({ STORE: [{ command: ['pnpm', 'store', 'path'] }, { value: '/x' }] })
    expect(v.STORE?.value).toBe('/x')
    expect(v.STORE?.tried).toEqual([
      { source: 'command pnpm store path', failed: 'pnpm is not on PATH' },
    ])
    expect(calls).toEqual([])
  })

  test('a failure, no output, several lines or a relative answer moves on', async () => {
    const { resolve } = setup({
      programs: {
        tool: {
          fail: { exitCode: 2, stderr: 'no store\nmore' },
          quiet: { stdout: '  \n' },
          chatty: { stdout: '/a\n/b\n' },
          relative: { stdout: 'store\n' },
        },
      },
    })
    const v = await resolve({
      STORE: ['fail', 'quiet', 'chatty', 'relative'].map((a) => ({ command: ['tool', a] })),
    })
    expect(v.STORE).toEqual({
      value: null,
      trusted: false,
      tried: [
        { source: 'command tool fail', failed: 'exit 2: no store' },
        { source: 'command tool quiet', failed: 'printed nothing' },
        { source: 'command tool chatty', failed: 'printed more than one line' },
        { source: 'command tool relative', failed: 'store is not an absolute folder' },
      ],
    })
  })

  test('a timed-out command moves on to the next source', async () => {
    const { resolve } = setup({
      programs: { go: { 'env GOCACHE': fakeNeverExited('timeout') } },
    })
    const v = await resolve({
      GOCACHE: [{ command: ['go', 'env', 'GOCACHE'] }, { value: '${XDG_CACHE_HOME}/go-build' }],
    })
    expect(v.GOCACHE?.from).toBe('value')
    expect(v.GOCACHE?.tried).toEqual([
      {
        source: 'command go env GOCACHE',
        failed: `timed out after ${VAR_COMMAND_LIMIT_MS / 1000} s`,
      },
    ])
  })

  test('a real command that hangs is stopped at the limit, and the next source is tried', async () => {
    const h = tempHome()
    cleanups.push(h.cleanup)
    const started = Date.now()
    const v = await resolveVars(
      { STORE: [{ command: ['sleep', '30'] }, { value: '~/store' }] },
      {
        home: h.home,
        os: 'linux',
        env: { ...process.env, ...h.env },
        kit: pluginKit('x', { env: h.env }),
        signal: new AbortController().signal,
        timeoutMs: 300,
      },
    )
    expect(Date.now() - started).toBeLessThan(10_000)
    expect(v.STORE).toEqual({
      value: join(h.home, 'store'),
      from: 'value',
      trusted: false,
      tried: [{ source: 'command sleep 30', failed: 'timed out after 0.3 s' }],
    })
  })
})

describe('the value source', () => {
  test('one for all, or the one for this OS', async () => {
    const { home, resolve } = setup()
    const v = await resolve({
      ALL: [{ value: '~/all' }],
      PER_OS: [{ value: { macos: '~/Library/x', linux: '~/.local/share/x' } }],
    })
    expect(v.ALL?.value).toBe(join(home, 'all'))
    expect(v.PER_OS?.value).toBe(join(home, '.local/share/x'))
    const mac = await resolve({ PER_OS: [{ value: { linux: '~/x' } }] }, { os: 'macos' })
    expect(mac.PER_OS).toEqual({
      value: null,
      trusted: false,
      tried: [{ source: 'value', failed: 'none for macos' }],
    })
  })

  test('may use another variable, declared later or built in', async () => {
    const { home, resolve } = setup({ env: { GOPATH: '/work/go' } })
    const v = await resolve({
      GOMODCACHE: [{ env: 'GOMODCACHE' }, { value: '${GOPATH}/pkg/mod' }],
      GOPATH: [{ env: 'GOPATH' }, { value: '~/go' }],
      GOCACHE: [{ value: '${XDG_CACHE_HOME}/go-build' }],
    })
    expect(v.GOMODCACHE?.value).toBe('/work/go/pkg/mod')
    expect(v.GOCACHE?.value).toBe(join(home, '.cache/go-build'))
    // Built-ins first, then the declared ones in the order declared.
    expect(Object.keys(v)).toEqual([
      ...Object.keys(BUILT_IN_VARS),
      'GOMODCACHE',
      'GOPATH',
      'GOCACHE',
    ])
  })

  test('one using a variable with no value gives none', async () => {
    const { resolve } = setup()
    const v = await resolve({ A: [{ env: 'A' }], B: [{ value: '${A}/b' }] })
    expect(v.B).toEqual({
      value: null,
      trusted: false,
      tried: [{ source: 'value', failed: '${A} has no value' }],
    })
  })
})

describe('the order of sources', () => {
  test('the first that gives a value wins, and later ones do not run', async () => {
    const { calls, resolve } = setup({
      env: { GOCACHE: '/env/go-build' },
      programs: { go: { 'env GOCACHE': { stdout: '/go/said\n' } } },
    })
    const v = await resolve({
      GOCACHE: [{ env: 'GOCACHE' }, { command: ['go', 'env', 'GOCACHE'] }, { value: '/x' }],
    })
    expect(v.GOCACHE?.value).toBe('/env/go-build')
    expect(calls).toEqual([])
  })

  test('a config value wins over every source, and is trusted, as is a value built on it', async () => {
    const { calls, resolve } = setup({
      env: { GOPATH: '/env/go' },
      programs: { go: { 'env GOMODCACHE': { stdout: '/go/said\n' } } },
    })
    const v = await resolve(
      {
        GOPATH: [{ env: 'GOPATH' }],
        GOMODCACHE: [{ value: '${GOPATH}/pkg/mod' }],
        INSIDE: [{ value: '/mnt/${GOPATH}' }],
        CMD: [{ command: ['go', 'env', 'GOMODCACHE'] }],
      },
      { config: { GOPATH: '/Volumes/build/go', CMD: '/Volumes/build/mod' } },
    )
    expect(v.GOPATH).toEqual({
      value: '/Volumes/build/go',
      from: 'config',
      trusted: true,
      tried: [],
    })
    expect(v.GOMODCACHE).toMatchObject({ value: '/Volumes/build/go/pkg/mod', trusted: true })
    // Only a value that starts with a trusted variable is trusted.
    expect(v.INSIDE).toMatchObject({ value: '/mnt/Volumes/build/go', trusted: false })
    expect(v.CMD).toMatchObject({ value: '/Volumes/build/mod', from: 'config' })
    expect(calls).toEqual([])
  })

  test('a config value wins over the sources before the one that uses it, at any depth', async () => {
    const { calls, resolve } = setup({
      env: { GOMODCACHE: '/env/mod' },
      programs: { go: { 'env GOMODCACHE': { stdout: '/go/said\n' } } },
    })
    const v = await resolve(
      {
        GOPATH: [{ env: 'GOPATH' }, { value: '~/go' }],
        GOMODCACHE: [
          { env: 'GOMODCACHE' },
          { command: ['go', 'env', 'GOMODCACHE'] },
          { value: '${GOPATH}/pkg/mod' },
        ],
        DEEP: [{ value: '/before' }, { value: '${GOMODCACHE}/deep' }],
        OTHER: [{ value: '/other' }, { value: '${GOPATH}/other' }],
      },
      { config: { GOPATH: '/data/go', OTHER: '/set/other' } },
    )
    expect(v.GOMODCACHE).toEqual({
      value: '/data/go/pkg/mod',
      from: 'value',
      trusted: true,
      tried: [
        { source: 'env GOMODCACHE', failed: 'skipped: ${GOPATH} comes from the config' },
        { source: 'command go env GOMODCACHE', failed: 'skipped: ${GOPATH} comes from the config' },
      ],
    })
    expect(v.DEEP).toMatchObject({ value: '/data/go/pkg/mod/deep', trusted: true })
    expect(v.OTHER).toMatchObject({ value: '/set/other', from: 'config' })
    expect(calls).toEqual([])
  })

  test('a skip names a variable built from a config value as coming from the config, not set in it', async () => {
    const { resolve } = setup({ programs: { pnpm: { 'store path': { stdout: '/pnpm/said\n' } } } })
    const v = await resolve(
      {
        STORE: [{ command: ['pnpm', 'store', 'path'] }, { value: '${PNPM_HOME}/store' }],
        PNPM_HOME: [{ env: 'PNPM_HOME' }, { value: '${XDG_DATA_HOME_SET}/pnpm' }],
        XDG_DATA_HOME_SET: [{ env: 'XDG_DATA_HOME' }],
      },
      { config: { XDG_DATA_HOME_SET: '/data/share' } },
    )
    expect(v.STORE).toMatchObject({
      value: '/data/share/pnpm/store',
      tried: [
        {
          source: 'command pnpm store path',
          failed: 'skipped: ${PNPM_HOME} comes from the config',
        },
      ],
    })
  })

  test('with no config value, the sources run in order as before', async () => {
    const { resolve } = setup({ programs: { go: { 'env GOMODCACHE': { stdout: '/go/said\n' } } } })
    const v = await resolve({
      GOPATH: [{ value: '~/go' }],
      GOMODCACHE: [{ command: ['go', 'env', 'GOMODCACHE'] }, { value: '${GOPATH}/pkg/mod' }],
    })
    expect(v.GOMODCACHE).toMatchObject({ value: '/go/said', from: 'command go env GOMODCACHE' })
  })
})

describe("a command source's env", () => {
  test('is set over the environment for that command only', async () => {
    const { calls, resolve } = setup({
      programs: { go: { 'env GOMODCACHE': { stdout: '/go/said\n' } } },
    })
    const v = await resolve({
      GOMODCACHE: [{ command: ['go', 'env', 'GOMODCACHE'], env: { GOTOOLCHAIN: 'local' } }],
    })
    expect(v.GOMODCACHE?.value).toBe('/go/said')
    expect(calls[0]?.opts.env).toMatchObject({ GOTOOLCHAIN: 'local' })
  })
})

describe('the built-in variables', () => {
  test('HOME, and each XDG folder at its XDG default on every OS when unset', async () => {
    const { home, resolve } = setup()
    for (const os of ['linux', 'macos', 'windows'] as const) {
      const v = await resolve({}, { os })
      expect(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.value]))).toEqual({
        HOME: home,
        XDG_CACHE_HOME: join(home, '.cache'),
        XDG_DATA_HOME: join(home, '.local/share'),
        XDG_CONFIG_HOME: join(home, '.config'),
        XDG_STATE_HOME: join(home, '.local/state'),
      })
    }
  })

  test('an XDG folder set to an absolute path is used; a relative one is ignored, as the spec says', async () => {
    const { home, resolve } = setup({
      env: { XDG_CACHE_HOME: '/fast/cache', XDG_DATA_HOME: 'data' },
    })
    const v = await resolve({})
    expect(v.XDG_CACHE_HOME).toEqual({
      value: '/fast/cache',
      from: 'env XDG_CACHE_HOME',
      trusted: false,
      tried: [],
    })
    expect(v.XDG_DATA_HOME).toEqual({
      value: join(home, '.local/share'),
      from: 'default',
      trusted: false,
      tried: [{ source: 'env XDG_DATA_HOME', failed: 'data is not an absolute folder' }],
    })
  })

  test('an XDG folder the environment sets is trusted only when trustsXdg passes it', async () => {
    const { resolve } = setup({ env: { XDG_CACHE_HOME: '/fast/cache', XDG_STATE_HOME: '/home' } })
    const v = await resolve({}, { trustsXdg: (f) => f !== '/home' })
    expect(v.XDG_CACHE_HOME!.trusted).toBe(true)
    expect(v.XDG_STATE_HOME!.trusted).toBe(false)
    expect(v.XDG_CONFIG_HOME!.trusted).toBe(false)
    expect(fillTemplate('${XDG_CACHE_HOME}/pip', v, '/h')).toEqual({
      path: '/fast/cache/pip',
      trusted: true,
    })
  })

  test('an env source reading an XDG folder keeps the trust its built-in has', async () => {
    const { resolve } = setup({
      env: { XDG_CACHE_HOME: '/data/cache', XDG_DATA_HOME: '/home', OTHER: '/data/cache' },
    })
    const v = await resolve(
      {
        CACHE_SET: [{ env: 'XDG_CACHE_HOME' }],
        DATA_SET: [{ env: 'XDG_DATA_HOME' }],
        OTHER: [{ env: 'OTHER' }],
        YARN: [{ value: '${CACHE_SET}/yarn' }],
      },
      { trustsXdg: (f) => f !== '/home' },
    )
    expect(v.CACHE_SET).toMatchObject({ value: '/data/cache', trusted: true })
    expect(v.YARN).toMatchObject({ value: '/data/cache/yarn', trusted: true })
    expect(v.DATA_SET!.trusted).toBe(false)
    expect(v.OTHER!.trusted).toBe(false)
    const untrusting = setup({ env: { XDG_CACHE_HOME: '/data/cache' } })
    const none = await untrusting.resolve({ CACHE_SET: [{ env: 'XDG_CACHE_HOME' }] })
    expect(none.CACHE_SET!.trusted).toBe(false)
  })
})

describe('fillTemplate', () => {
  test('fills each variable, reads ~ as home, and names the first with no value', async () => {
    const { home, resolve } = setup()
    const v = await resolve({ A: [{ value: '/a/' }], NONE: [{ env: 'NONE' }] })
    expect(fillTemplate('${A}/x', v, home)).toEqual({ path: '/a/x', trusted: false })
    expect(fillTemplate('~/${A}', v, home)).toEqual({ path: join(home, 'a'), trusted: false })
    expect(fillTemplate('${A}/${NONE}', v, home)).toEqual({ missing: 'NONE' })
  })

  test('reads ~\\ as home only on Windows, as an ignore entry does', async () => {
    const { home, resolve } = setup()
    const v = await resolve({})
    const windows = process.platform === 'win32'
    expect(fillTemplate('~\\x', v, home)).toEqual({
      path: windows ? join(home, 'x') : '~\\x',
      trusted: false,
    })
  })

  test('is trusted only when a trusted variable is the leading folder and the path stays inside it', async () => {
    const { home, resolve } = setup({ env: { OTHER: '/x' } })
    const v = await resolve(
      { CACHE: [{ env: 'CACHE' }], OTHER: [{ env: 'OTHER' }], UP: [{ value: '/a' }] },
      { config: { CACHE: '/mnt/cache' } },
    )
    const up = { ...v, UP: { ...v.UP!, value: '../../etc' } }
    expect(fillTemplate('${CACHE}', v, home)).toEqual({ path: '/mnt/cache', trusted: true })
    expect(fillTemplate('${CACHE}/pip', v, home)).toEqual({ path: '/mnt/cache/pip', trusted: true })
    expect(fillTemplate('${CACHE}-old', v, home)).toEqual({
      path: '/mnt/cache-old',
      trusted: false,
    })
    expect(fillTemplate('${CACHE}${OTHER}', v, home)).toEqual({
      path: '/mnt/cache/x',
      trusted: false,
    })
    expect(fillTemplate('${CACHE}/${UP}', up, home)).toEqual({ path: '/etc', trusted: false })
  })
})

describe('variable names', () => {
  test('a name an object inherits, such as constructor, resolves like any other', async () => {
    const { resolve } = setup({ env: { FOO: '/foo' } })
    const got = await resolve({ constructor: [{ env: 'FOO' }], toString: [{ value: '/t' }] })
    const v = new Map(Object.entries(got))
    expect(v.get('constructor')).toMatchObject({ value: '/foo', from: 'env FOO' })
    expect(v.get('toString')).toMatchObject({ value: '/t', from: 'value' })
  })
})

describe('only', () => {
  test('resolves only the named variables and those they use; the others run no command', async () => {
    const { calls, resolve } = setup({
      programs: { go: { 'env GOCACHE': { stdout: '/go/said\n' } } },
    })
    const v = await resolve(
      {
        BASE: [{ value: '/base' }],
        USED: [{ value: '${BASE}/used' }],
        UNUSED: [{ command: ['go', 'env', 'GOCACHE'] }],
      },
      { only: ['USED'] },
    )
    expect(v.USED?.value).toBe('/base/used')
    expect(v.BASE?.value).toBe('/base')
    expect(Object.hasOwn(v, 'UNUSED')).toBe(false)
    expect(calls).toEqual([])
  })

  test('gives the built-ins the named variables use, on the way too, and no others', async () => {
    const { resolve } = setup()
    const v = await resolve(
      {
        BASE: [{ value: '${XDG_CACHE_HOME}/base' }],
        USED: [{ value: '${BASE}/used' }],
        UNUSED: [{ value: '${XDG_DATA_HOME}/other' }],
      },
      { only: ['USED', 'HOME'] },
    )
    expect(Object.keys(v)).toEqual(['HOME', 'XDG_CACHE_HOME', 'BASE', 'USED'])
  })
})

describe('resolving at the same time', () => {
  test("variables that don't use each other run their commands at the same time", async () => {
    const h = tempHome()
    cleanups.push(h.cleanup)
    let running = 0
    let most = 0
    let release = (): void => {}
    const both = new Promise<void>((r) => (release = r))
    // One at a time, the first command waits out this timer alone.
    const timer = setTimeout(release, 2_000)
    cleanups.push(() => clearTimeout(timer))
    const kit: VarsAt['kit'] = {
      onPath: () => true,
      run: async (argv) => {
        running++
        most = Math.max(most, running)
        if (running === 2) release()
        await both
        running--
        return { ok: true, exitCode: 0, stdout: `/${argv[1]}\n`, stderr: '' }
      },
    }
    const v = await resolveVars(
      { A: [{ command: ['tool', 'a'] }], B: [{ command: ['tool', 'b'] }] },
      { home: h.home, os: 'linux', env: h.env, kit, signal: new AbortController().signal },
    )
    expect(most).toBe(2)
    expect([v.A?.value, v.B?.value]).toEqual(['/a', '/b'])
  })

  test('a variable on a cycle gives no value instead of waiting forever', async () => {
    const { resolve } = setup()
    const v = await resolve({
      A: [{ value: '${B}/a' }],
      B: [{ value: '${A}/b' }, { value: '/b' }],
      C: [{ value: '${C}/c' }],
    })
    expect(v.B?.value).toBe('/b')
    expect(v.A?.value).toBe('/b/a')
    expect(v.C?.value).toBeNull()
  })
})
