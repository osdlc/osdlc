/**
 * End-to-end: `way` runs as its own process against small fixture projects,
 * and its `--json` documents are compared with golden files in
 * `__snapshots__/`.
 *
 * Each run gets a fresh HOME, XDG and Windows profile directories, so no user
 * config, trust grant or cache leaks in. `PATH` is one directory of stub
 * programs, one per tool binary, so "is the tool installed" reads the same on
 * every machine. Execution is off unless a case says otherwise; with no trust
 * grant, nothing a fixture declares ever runs.
 *
 * Absolute paths, times and durations are replaced with placeholders before
 * the compare. Regenerate the golden files after an intended change:
 *
 *     pnpm --filter @osdlc/wayfinder test:e2e -u
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url))
const WAY = fileURLToPath(new URL('./way.mjs', import.meta.url))
const WINDOWS = process.platform === 'win32'

/** Every tool binary a built-in provider looks up, except git. */
const BINARIES = [
  'moon',
  'proto',
  'mise',
  'just',
  'make',
  'cargo',
  'sbt',
  'composer',
  'deno',
  'turbo',
  'mvn',
  'swift',
  'gradle',
  'task',
  'rake',
  'docker',
  'gh',
  'poe',
  'pdm',
  'hatch',
  'nx',
  'devbox',
  'cmake',
  'dotnet',
  'bun',
  'pnpm',
  'yarn',
  'npm',
  'uv',
  'poetry',
  'pip',
  'go',
  'bundle',
  'direnv',
  'lefthook',
  'husky',
  'pre-commit',
]

interface Case {
  /** The directory under `fixtures/`, and the snapshot directory. */
  name: string
  fixture?: string
  /** The runner the fixture is for: it must report tasks, or be withheld. */
  runner?: string
  /** The search for `way query`. */
  query: string
  /** Flags for every command. Default `--no-exec`. */
  flags?: string[]
  /** `empty` runs with no tool on PATH. */
  path?: 'stubs' | 'empty'
  /** Also snapshot the text form of `way list`. */
  text?: boolean
  /** Adds files the repository cannot hold portably. */
  setup?: (root: string, base: string) => void
  /** Text that must not appear in the catalog. */
  absent?: string
  /** Skip on Windows, with the reason. */
  posixOnly?: string
}

const RUNNERS: Case[] = [
  { name: 'node-scripts', runner: 'node-scripts', query: 'build' },
  { name: 'make', runner: 'make', query: 'test' },
  { name: 'just', runner: 'just', query: 'deploy' },
  { name: 'cargo', runner: 'cargo', query: 'build' },
  { name: 'cargo-aliases', runner: 'cargo-aliases', query: 'xtask' },
  { name: 'python', runner: 'python', query: 'ruff' },
  { name: 'poe', runner: 'poe', query: 'lint' },
  { name: 'pdm', runner: 'pdm', query: 'test' },
  { name: 'hatch', runner: 'hatch', query: 'check' },
  { name: 'composer', runner: 'composer', query: 'lint' },
  { name: 'deno-tasks', runner: 'deno-tasks', query: 'test' },
  { name: 'turbo', runner: 'turbo', query: 'build' },
  { name: 'maven', runner: 'maven', query: 'package' },
  { name: 'gradle', runner: 'gradle', query: 'build' },
  { name: 'sbt', runner: 'sbt', query: 'compile' },
  { name: 'swiftpm', runner: 'swiftpm', query: 'build' },
  { name: 'go-task', runner: 'go-task', query: 'test' },
  { name: 'rake', runner: 'rake', query: 'build' },
  { name: 'docker-compose', runner: 'docker-compose', query: 'web' },
  { name: 'github-actions', runner: 'github-actions', query: 'release' },
  { name: 'nx', runner: 'nx', query: 'serve' },
  { name: 'vscode-tasks', runner: 'vscode-tasks', query: 'build' },
  { name: 'devbox', runner: 'devbox', query: 'setup' },
  { name: 'procfile', runner: 'procfile', query: 'worker' },
  { name: 'cmake-presets', runner: 'cmake-presets', query: 'debug' },
  { name: 'dotnet', runner: 'dotnet', query: 'run' },
  { name: 'moon', runner: 'moon', query: 'build' },
  { name: 'mise', runner: 'mise', query: 'build' },
  { name: 'toolchain', query: 'lint' },
]

const EDGES: Case[] = [
  // Execution is on by default, but the repository is not trusted.
  { name: 'untrusted', fixture: 'moon', query: 'build', flags: [] },
  { name: 'nested-units', query: 'build' },
  { name: 'malformed', query: 'ok' },
  { name: 'missing-binary', fixture: 'just', query: 'build', path: 'empty' },
  {
    name: 'hostile',
    query: 'b',
    text: true,
    // Raw control bytes, which a checked-in file should not hold.
    setup: (root) =>
      writeFileSync(
        join(root, 'justfile'),
        '# a doc with \u001b[1mbold\u001b[0m, a bell\u0007 and \u202eflipped\nsafe:\n    echo ok\n',
      ),
  },
  {
    name: 'symlinks',
    fixture: 'node-scripts',
    query: 'build',
    absent: 'leaked',
    posixOnly: 'creating a symlink on Windows needs developer mode',
    // A manifest that links out of the repository is not read.
    setup: (root, base) => {
      const outside = join(base, 'outside')
      mkdirSync(outside, { recursive: true })
      writeFileSync(
        join(outside, 'package.json'),
        JSON.stringify({ name: 'outside', scripts: { leak: 'echo leaked' } }),
      )
      mkdirSync(join(root, 'linked'))
      symlinkSync(join(outside, 'package.json'), join(root, 'linked', 'package.json'))
    },
  },
]

let base = ''
let stubs = ''
let empty = ''

beforeAll(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), 'wayfinder-e2e-')))
  stubs = join(base, 'bin')
  empty = join(base, 'empty-bin')
  mkdirSync(stubs)
  mkdirSync(empty)
  for (const name of BINARIES) {
    if (WINDOWS) {
      writeFileSync(join(stubs, `${name}.cmd`), '@exit /b 1\r\n')
    } else {
      writeFileSync(join(stubs, name), '#!/bin/sh\nexit 1\n')
      chmodSync(join(stubs, name), 0o755)
    }
  }
})

afterAll(() => {
  if (base !== '') rmSync(base, { recursive: true, force: true })
})

/** A fresh, empty home for one run. Only the variables Node needs pass through. */
function environment(dir: string, path: string): Record<string, string> {
  const home = join(dir, 'home')
  const env: Record<string, string> = {
    PATH: path,
    HOME: home,
    XDG_CONFIG_HOME: join(home, 'config'),
    XDG_STATE_HOME: join(home, 'state'),
    XDG_CACHE_HOME: join(home, 'cache'),
    XDG_DATA_HOME: join(home, 'data'),
    NO_COLOR: '1',
  }
  if (WINDOWS) {
    env['USERPROFILE'] = home
    env['APPDATA'] = join(home, 'AppData', 'Roaming')
    env['LOCALAPPDATA'] = join(home, 'AppData', 'Local')
    env['TEMP'] = env['TMP'] = join(dir, 'tmp')
    env['PATHEXT'] = '.COM;.EXE;.BAT;.CMD'
    for (const name of ['SystemRoot', 'SystemDrive', 'windir', 'ComSpec']) {
      const value = process.env[name]
      if (value !== undefined) env[name] = value
    }
  }
  return env
}

interface Run {
  status: number | null
  stdout: string
  stderr: string
}

function way(args: string[], env: Record<string, string>): Run {
  const out = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', WAY, ...args], {
    encoding: 'utf8',
    env,
    timeout: 60_000,
  })
  return { status: out.status, stdout: out.stdout, stderr: out.stderr }
}

/** Replaces each absolute path, time and duration with a placeholder. */
function normalizer(root: string, dir: string): (text: string) => string {
  const swaps: Array<[string, string]> = [
    [join(stubs, ''), '<bin>'],
    [root, '<root>'],
    [dir, '<base>'],
  ]
  return (text) => {
    let out = text
    for (const [from, to] of swaps) {
      out = out.split(from).join(to)
      // The same path inside a JSON string, with its backslashes escaped.
      out = out.split(JSON.stringify(from).slice(1, -1)).join(to)
    }
    return out
      .replace(
        /<(bin|root|base)>((?:\\\\|\\|\/)[^"\s]*)/g,
        (_, tag: string, rest: string) => `<${tag}>${rest.replace(/\\\\|\\/g, '/')}`,
      )
      .replace(/(<bin>\/[\w.-]+?)\.cmd\b/gi, '$1')
      .replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z/g, '<time>')
  }
}

/** Zeroes durations and shortens brand icons, which add nothing to a diff. */
function tidy(value: unknown, key = ''): unknown {
  if (Array.isArray(value)) return value.map((v) => tidy(v))
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, tidy(v, k)]))
  }
  if (typeof value === 'number' && key.endsWith('Ms')) return 0
  if (typeof value === 'string' && key === 'icon') return '<svg>'
  return value
}

/** DEL, C1 and bidi controls, which `--json` writes as `\\u` escapes. */
const UNSAFE = /[\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g

/** The document on stdout. `query` exits 1 when nothing matches. */
function document(run: Run, normalize: (text: string) => string, exits = [0]): string {
  expect(exits, run.stderr).toContain(run.status)
  expect(run.stdout).not.toMatch(new RegExp(UNSAFE.source))
  const text = JSON.stringify(tidy(JSON.parse(normalize(run.stdout))), null, 2)
  // Keep the golden file free of raw controls too.
  const escaped = text.replace(UNSAFE, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
  return `${escaped}\n`
}

interface CatalogDoc {
  reports: Array<{ runner: string; status: string; tasks: unknown[]; skippedForExec: boolean }>
}

async function check(c: Case): Promise<void> {
  const dir = join(base, c.name)
  const root = join(dir, 'project')
  cpSync(join(FIXTURES, c.fixture ?? c.name), root, { recursive: true })
  // A repository marker, so the root search stops here and not in a parent.
  mkdirSync(join(root, '.git'))
  c.setup?.(root, dir)
  const env = environment(dir, c.path === 'empty' ? empty : stubs)
  const flags = c.flags ?? ['--no-exec']
  const normalize = normalizer(root, dir)
  const snap = (file: string) => `./__snapshots__/${c.name}/${file}`

  const list = way(['list', '--json', ...flags, '-C', root], env)
  const listDoc = document(list, normalize)
  if (c.runner !== undefined) {
    const report = (JSON.parse(listDoc) as CatalogDoc).reports.find((r) => r.runner === c.runner)
    expect(report, `no ${c.runner} report`).toBeDefined()
    expect(report!.tasks.length > 0 || report!.skippedForExec, `${c.runner} found no tasks`).toBe(
      true,
    )
  }
  if (c.absent !== undefined) expect(listDoc).not.toContain(c.absent)
  await expect(listDoc).toMatchFileSnapshot(snap('list.json'))
  await expect(normalize(list.stderr)).toMatchFileSnapshot(snap('stderr.txt'))

  const query = way(['query', c.query, '--json', ...flags, '-C', root], env)
  await expect(document(query, normalize, [0, 1])).toMatchFileSnapshot(snap('query.json'))

  if (c.text === true) {
    const text = way(['list', ...flags, '-C', root], env)
    expect(text.status, text.stderr).toBe(0)
    await expect(normalize(text.stdout)).toMatchFileSnapshot(snap('list.txt'))
  }
}

const each = (c: Case) =>
  c.posixOnly !== undefined && WINDOWS
    ? test.skip(`${c.name} (${c.posixOnly})`, () => {})
    : test(c.name, () => check(c), 60_000)

describe('one fixture per runner', () => {
  for (const c of RUNNERS) each(c)
})

describe('edge cases', () => {
  for (const c of EDGES) each(c)
})

test('providers', async () => {
  const dir = join(base, 'providers')
  mkdirSync(dir)
  const out = way(['providers', '--json', '-C', dir], environment(dir, stubs))
  await expect(document(out, normalizer(dir, dir))).toMatchFileSnapshot(
    './__snapshots__/providers.json',
  )
})
