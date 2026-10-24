import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, sep } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  HOMES,
  TieredDirs,
  TieredDirsError,
  envVars,
  overrideVars,
  systemBaseDirs,
  testRoot,
} from '../src/index.ts'
import { isTestRunnerProcess } from '../src/base-dirs.ts'

const VENDOR = 'com.example'
const ENV = envVars('EXAMPLE')

// These tests drive the real process env, which the test rules read. Every
// variable they touch is restored after each test.
const XDG_VARS = ['XDG_DATA_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME']
const TOUCHED = [...overrideVars(ENV), ...XDG_VARS, ENV.requireOverride, 'NODE_ENV', 'HOME']
let saved: Record<string, string | undefined> = {}

beforeEach(() => {
  saved = Object.fromEntries(TOUCHED.map((name) => [name, process.env[name]]))
  for (const name of [...overrideVars(ENV), ...XDG_VARS]) delete process.env[name]
  delete process.env[ENV.requireOverride]
})

afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

/** `expression` printed as JSON by a spawned node script, with `extra` on the process env. */
function runInChild(extra: Record<string, string>, expression: string) {
  const env: Record<string, string | undefined> = { ...process.env, ...extra }
  // Node 22 before 22.18 needs the flag to run `.ts`; later versions accept it.
  const child = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      '--no-warnings',
      '--input-type=module',
      '-e',
      `import { envVars, systemBaseDirs, testRoot } from './src/index.ts'; console.log(JSON.stringify(${expression}))`,
    ],
    { cwd: join(import.meta.dirname, '..'), env: env as NodeJS.ProcessEnv, encoding: 'utf-8' },
  )
  return { exitCode: child.status, stdout: child.stdout, stderr: child.stderr }
}

/** `systemBaseDirs(ENV)` in a spawned node script, with `extra` on the process env. */
function resolveInChild(extra: Record<string, string>) {
  return runInChild(extra, "systemBaseDirs(envVars('EXAMPLE'))")
}

describe('under a test runner', () => {
  test('Vitest sets NODE_ENV=test', () => {
    expect(process.env['NODE_ENV']).toBe('test')
  })

  test('the default environment resolves every home under the scratch root', () => {
    const dirs = TieredDirs.fromEnv(VENDOR, ENV)
    const root = dirname(dirs.bases.durable)
    // Unique per process, so a reused pid does not inherit old state.
    expect(root.startsWith(join(tmpdir(), `tiered-dirs-test-${process.pid}-`))).toBe(true)
    for (const home of HOMES) {
      expect(dirs.bases[home].startsWith(root + sep)).toBe(true)
    }
    expect(dirs.bases.scratch.startsWith(root + sep)).toBe(true)
    expect(TieredDirs.fromEnv(VENDOR, ENV).bases.durable).toBe(dirs.bases.durable)
  })

  test('a NODE_ENV set to another value does not turn the default off', () => {
    process.env['NODE_ENV'] = 'development'
    expect(systemBaseDirs(ENV).durable.startsWith(join(tmpdir(), 'tiered-dirs-test-'))).toBe(true)
  })

  test('a child process a test spawns gets no default', () => {
    const child = resolveInChild({ NODE_ENV: 'test' })
    expect(child.exitCode).toBe(0)
    expect(JSON.parse(child.stdout).durable.includes('tiered-dirs-test-')).toBe(false)
  })

  test('an explicit EXAMPLE_ROOT wins', () => {
    process.env['EXAMPLE_ROOT'] = '/explicit'
    expect(systemBaseDirs(ENV).durable).toBe('/explicit/durable')
  })

  test('a test that moved HOME keeps it', () => {
    process.env['HOME'] = '/moved-home'
    expect(systemBaseDirs(ENV, { platform: 'linux' }).durable).toBe('/moved-home/.local/share')
  })

  test('testRoot() is the root the default uses', () => {
    const root = testRoot()
    expect(root).toBeDefined()
    expect(root!.startsWith(join(tmpdir(), `tiered-dirs-test-${process.pid}-`))).toBe(true)
    expect(systemBaseDirs(ENV).durable).toBe(join(root!, 'durable'))
    expect(testRoot()).toBe(root)
  })

  test('testRoot() is undefined in a child process a test spawns', () => {
    const child = runInChild({ NODE_ENV: 'test' }, 'testRoot() ?? null')
    expect(child.exitCode).toBe(0)
    expect(JSON.parse(child.stdout)).toBeNull()
  })

  test('testRoot: false skips the default and resolves the per-OS table', () => {
    expect(systemBaseDirs(ENV, { platform: 'linux', testRoot: true }).durable).toBe(
      join(testRoot()!, 'durable'),
    )
    const bases = systemBaseDirs(ENV, { platform: 'linux', testRoot: false })
    // An injected environment runs no test rule, so this is the plain per-OS table.
    expect(bases).toEqual(systemBaseDirs(ENV, { platform: 'linux', env: { ...process.env } }))
    expect(bases.durable.startsWith(testRoot()!)).toBe(false)
  })

  test('testRoot: false still honours EXAMPLE_ROOT', () => {
    process.env['EXAMPLE_ROOT'] = '/explicit'
    expect(systemBaseDirs(ENV, { testRoot: false }).durable).toBe('/explicit/durable')
  })

  test('testRoot: false still applies EXAMPLE_REQUIRE_OVERRIDE', () => {
    process.env[ENV.requireOverride] = '1'
    const run = (): unknown => TieredDirs.fromEnv(VENDOR, ENV, { testRoot: false })
    expect(run).toThrow(TieredDirsError)
    expect(run).toThrow(/EXAMPLE_REQUIRE_OVERRIDE is set but neither EXAMPLE_ROOT/)
    try {
      run()
    } catch (error) {
      expect((error as TieredDirsError).code).toBe('OVERRIDE_REQUIRED')
    }
    // With the default on, the test root fills the root variable first.
    expect(() => systemBaseDirs(ENV)).not.toThrow()
  })

  test('an injected environment is the whole story', () => {
    const bases = systemBaseDirs(ENV, { platform: 'linux', env: { HOME: '/h', NODE_ENV: 'test' } })
    expect(bases.durable).toBe('/h/.local/share')
  })
})

// A spawned script is not a test runner process, so the require-override check runs.
describe(ENV.requireOverride, () => {
  test('refuses an OS fallback and names the fix', () => {
    const child = resolveInChild({ [ENV.requireOverride]: '1' })
    expect(child.exitCode).not.toBe(0)
    expect(child.stderr).toMatch(/TieredDirsError/)
    expect(child.stderr).toMatch(/EXAMPLE_DURABLE_DIR.*set EXAMPLE_ROOT/)
  })

  test('passes when every home is moved', () => {
    const child = resolveInChild({
      [ENV.requireOverride]: '1',
      EXAMPLE_DURABLE_DIR: '/d',
      EXAMPLE_CONFIG_DIR: '/c',
      EXAMPLE_CACHE_DIR: '/k',
      EXAMPLE_STATE_DIR: '/st',
      EXAMPLE_LOGS_DIR: '/l',
      EXAMPLE_SCRATCH_DIR: '/s',
    })
    expect(child.exitCode).toBe(0)
    expect(JSON.parse(child.stdout).runtime).toBe('/d/run')
  })
})

describe('isTestRunnerProcess entry points', () => {
  const vitestEnv = { VITEST_WORKER_ID: '1' }
  const cases: [string, Record<string, string>, string, boolean][] = [
    ['Vitest 4 worker', vitestEnv, '/n/node_modules/vitest/dist/workers/forks.js', true],
    ['Vitest 3 forks worker', vitestEnv, '/n/node_modules/tinypool/dist/entry/process.js', true],
    ['Vitest 3 threads worker', vitestEnv, '/n/node_modules/tinypool/dist/entry/worker.js', true],
    [
      'pool id only',
      { VITEST_POOL_ID: '1' },
      '/n/node_modules/tinypool/dist/entry/process.js',
      true,
    ],
    [
      'tinypool entry without Vitest variables',
      {},
      '/n/node_modules/tinypool/dist/entry/process.js',
      false,
    ],
    ['child of a test, Vitest variables inherited', vitestEnv, '/tmp/child.mjs', false],
  ]
  test.each(cases)('%s', (_name, env, entry, expected) => {
    expect(isTestRunnerProcess(env, entry)).toBe(expected)
  })
})
