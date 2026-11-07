import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { StreamRunner } from '@osdlc/command-seam'
import { fakeRunner } from '@osdlc/command-seam/testing'
import { afterEach, describe, expect, test } from 'vitest'

import {
  type BinaryProduct,
  binaryPathInPackage,
  cargoTargetDir,
  findPlatform,
  launcherManifest,
  NPM_PLATFORMS,
  platformManifest,
  platformPackageName,
  publishPackages,
  renderLauncher,
} from '../src/index.ts'

const ROOT: BinaryProduct = {
  binary: 'tool',
  launcher: '@acme/tool',
  scope: '@acme',
  platformPrefix: 'tool',
  binaryDir: '',
}
const NESTED: BinaryProduct = { ...ROOT, launcher: 'tool', binaryDir: 'bin' }
const WIN = findPlatform(NPM_PLATFORMS, 'win32-x64')
const MAC = findPlatform(NPM_PLATFORMS, 'darwin-arm64')

describe('names', () => {
  test('platform package and binary path', () => {
    expect(platformPackageName(ROOT, WIN)).toBe('@acme/tool-win32-x64')
    expect(binaryPathInPackage(ROOT, WIN)).toBe('tool.exe')
    expect(binaryPathInPackage(NESTED, MAC)).toBe('bin/tool')
  })

  test('an unknown platform names the known ones', () => {
    expect(() => findPlatform(NPM_PLATFORMS, 'sunos-sparc')).toThrow(/darwin-arm64/)
  })
})

describe('platformManifest', () => {
  test('without a template: gate, binary-only files, preferUnplugged last', () => {
    const m = platformManifest(ROOT, MAC, { version: '1.0.0', description: 'd' })
    expect(JSON.stringify(m)).toBe(
      JSON.stringify({
        name: '@acme/tool-darwin-arm64',
        version: '1.0.0',
        description: 'd',
        os: ['darwin'],
        cpu: ['arm64'],
        files: ['tool'],
        preferUnplugged: true,
      }),
    )
  })

  test('template fields keep their position; os and cpu append', () => {
    const m = platformManifest(NESTED, MAC, {
      version: '1.0.0',
      description: 'd',
      template: { license: 'MIT', preferUnplugged: true, files: ['bin'] },
    })
    expect(Object.keys(m)).toEqual([
      'name',
      'version',
      'description',
      'license',
      'preferUnplugged',
      'files',
      'os',
      'cpu',
    ])
  })
})

describe('template precedence', () => {
  const template = { description: 'old', license: 'MIT', name: 'wrong', version: '0.0.0' }

  test('a template name, version or description keeps its position, but the argument wins', () => {
    const p = platformManifest(ROOT, MAC, { version: '1.0.0', description: 'd', template })
    expect(Object.keys(p).slice(0, 4)).toEqual(['description', 'license', 'name', 'version'])
    expect([p.name, p.version, p.description]).toEqual(['@acme/tool-darwin-arm64', '1.0.0', 'd'])
    const l = launcherManifest(ROOT, NPM_PLATFORMS, {
      version: '1.0.0',
      description: 'd',
      launcherPath: 'bin/tool.js',
      template,
    })
    expect([l.name, l.version, l.description]).toEqual(['@acme/tool', '1.0.0', 'd'])
  })

  test('identity fields the template does not name go first', () => {
    const p = platformManifest(ROOT, MAC, {
      version: '1.0.0',
      description: 'd',
      template: { license: 'MIT', version: '0.0.0' },
    })
    expect(Object.keys(p).slice(0, 4)).toEqual(['name', 'description', 'license', 'version'])
  })

  test('the template is not changed', () => {
    const own = { name: 'wrong', files: ['bin'] }
    platformManifest(ROOT, MAC, { version: '1.0.0', description: 'd', template: own })
    expect(own).toEqual({ name: 'wrong', files: ['bin'] })
  })
})

describe('launcherManifest', () => {
  test('defaults files and engines; every platform is optional at the same version', () => {
    const m = launcherManifest(ROOT, NPM_PLATFORMS, {
      version: '2.0.0',
      description: 'd',
      launcherPath: 'bin/tool.js',
    })
    expect(Object.keys(m)).toEqual([
      'name',
      'version',
      'description',
      'bin',
      'files',
      'optionalDependencies',
      'engines',
    ])
    expect(m.bin).toEqual({ tool: 'bin/tool.js' })
    expect(Object.values(m.optionalDependencies as object)).toEqual(Array(5).fill('2.0.0'))
  })
})

/** The rendered launcher without its shebang, ready for `new Function`. */
function launcherBody(product: BinaryProduct, debugEnv = ''): string {
  return renderLauncher(product, NPM_PLATFORMS, { debugEnv }).replace(/^#!.*\n/, '')
}

describe('renderLauncher', () => {
  test('fills every placeholder', () => {
    const js = renderLauncher(NESTED, NPM_PLATFORMS, { debugEnv: 'TOOL_DEBUG' })
    expect(js).not.toMatch(/\{\{\w+\}\}/)
    expect(js).toContain(`const DEBUG_ENV = "TOOL_DEBUG"`)
    expect(js).toContain(`const BINARY = "tool"`)
  })

  test('quotes and backslashes in names reach the launcher unchanged', () => {
    const odd: BinaryProduct = {
      binary: `it's\\a"tool`,
      launcher: `@acme/it's`,
      scope: '@acme',
      platformPrefix: `p\\q`,
      binaryDir: '',
    }
    const js = launcherBody(odd, `X'Y`)
    const constants = new Function(
      'require',
      `${js.slice(0, js.indexOf('function binaryPath'))}; return { PLATFORM_PACKAGES, BINARY, LAUNCHER, DEBUG_ENV }`,
    )(() => ({}))
    expect(constants.BINARY).toBe(`it's\\a"tool`)
    expect(constants.LAUNCHER).toBe(`@acme/it's`)
    expect(constants.DEBUG_ENV).toBe(`X'Y`)
    expect(constants.PLATFORM_PACKAGES['win32-x64']).toEqual({
      package: `@acme/p\\q-win32-x64`,
      binary: `it's\\a"tool.exe`,
    })
  })
})

interface LauncherRun {
  platform?: string
  arch?: string
  /** Whether the platform package resolves. */
  resolves?: boolean
  debugEnv?: string
  env?: Record<string, string>
  /** Which standard streams are a terminal. */
  ttys?: { stdin?: boolean; stdout?: boolean; stderr?: boolean }
  /** A signal delivered to the launcher after it starts the child. */
  signal?: NodeJS.Signals
  /** How the child ends: exit code and signal. */
  exit?: [number | null, string | null]
  /** Whether re-raising a signal on the launcher throws, as on Windows. */
  selfKillThrows?: boolean
}

/**
 * Runs the rendered launcher against a stub `process`, `require` and `spawn`.
 * Returns what it wrote, the exit codes it asked for, the signals it sent to
 * the child, the signals it raised on itself, and the signals it listens to.
 */
function runLauncher({
  platform = 'darwin',
  arch = 'arm64',
  resolves = true,
  debugEnv = '',
  env = {},
  ttys = {},
  signal,
  exit,
  selfKillThrows = false,
}: LauncherRun = {}) {
  let stderr = ''
  const exitCodes: number[] = []
  const childKills: string[] = []
  const selfKills: string[] = []
  const child = Object.assign(new EventEmitter(), {
    kill: (s: string) => {
      childKills.push(s)
    },
  })
  const stream = (isTTY: boolean | undefined) => ({ isTTY: isTTY === true })
  const proc = Object.assign(new EventEmitter(), {
    platform,
    arch,
    argv: ['node', 'launcher.js'],
    env,
    pid: 1,
    stdin: stream(ttys.stdin),
    stdout: stream(ttys.stdout),
    stderr: {
      ...stream(ttys.stderr),
      write: (s: string) => {
        stderr += s
        return true
      },
    },
    exit: (code: number) => {
      exitCodes.push(code)
    },
    kill: (_pid: number, s: string) => {
      if (selfKillThrows) throw new Error('not supported')
      selfKills.push(s)
    },
  })
  const modules: Record<string, unknown> = {
    'node:child_process': { spawn: () => child },
    'node:fs': { existsSync: () => true },
    'node:os': { constants: { signals: { SIGTERM: 15 } } },
    'node:path': { join: (...p: string[]) => p.join('/'), dirname: () => '/pkg' },
  }
  const req = Object.assign((id: string) => modules[id], {
    resolve: () => {
      if (!resolves) throw new Error('not found')
      return '/pkg/package.json'
    },
  })
  new Function('require', 'process', launcherBody(ROOT, debugEnv))(req, proc)
  const listening = proc.eventNames().map(String)
  if (signal) proc.emit(signal, signal)
  if (exit) child.emit('exit', ...exit)
  return { stderr, exitCodes, childKills, selfKills, listening }
}

describe('launcher', () => {
  test('a host with no build gets an error naming the supported platforms', () => {
    const { stderr, exitCodes } = runLauncher({ platform: 'sunos', arch: 'x64' })
    expect(stderr).toBe(
      'tool has no build for sunos-x64. Supported: darwin-arm64, darwin-x64, linux-x64, linux-arm64, win32-x64.\n',
    )
    expect(exitCodes[0]).toBe(1)
  })

  test('a missing platform package names it and the optional-dependency causes', () => {
    const { stderr } = runLauncher({ resolves: false })
    expect(stderr).toMatch(/the platform package @acme\/tool-darwin-arm64 is not installed/)
    expect(stderr).toMatch(/turned off \(--omit=optional/)
  })

  test('the debug variable prints what was resolved', () => {
    const { stderr } = runLauncher({ debugEnv: 'TOOL_DEBUG', env: { TOOL_DEBUG: '1' } })
    expect(stderr).toBe(
      'tool launcher: platform=darwin-arm64 package=@acme/tool-darwin-arm64 binary=/pkg/tool\n',
    )
  })

  test('the child exit code passes through', () => {
    expect(runLauncher({ exit: [3, null] }).exitCodes).toEqual([3])
  })

  test("the child's signal is re-raised on the launcher", () => {
    expect(runLauncher({ exit: [null, 'SIGTERM'] }).selfKills).toEqual(['SIGTERM'])
  })

  test('a signal that cannot be re-raised (Windows) exits 128 + signal number', () => {
    const { selfKills, exitCodes } = runLauncher({
      platform: 'win32',
      arch: 'x64',
      exit: [null, 'SIGTERM'],
      selfKillThrows: true,
    })
    expect(selfKills).toEqual([])
    // The stub exit returns, so later calls also record; the first one is the real exit.
    expect(exitCodes[0]).toBe(143)
  })
})

describe('launcher signal forwarding', () => {
  const allTty = { stdin: true, stdout: true, stderr: true }

  test('a terminal Ctrl-C is not forwarded: the child already has it from its process group', () => {
    expect(runLauncher({ signal: 'SIGINT', ttys: allTty }).childKills).toEqual([])
  })

  test('a Ctrl-C is not forwarded when only stdout or stderr is a terminal (`echo x | bin`)', () => {
    expect(
      runLauncher({ signal: 'SIGINT', ttys: { stdout: true, stderr: true } }).childKills,
    ).toEqual([])
    expect(runLauncher({ signal: 'SIGINT', ttys: { stderr: true } }).childKills).toEqual([])
  })

  test('SIGINT is forwarded when no standard stream is a terminal', () => {
    expect(runLauncher({ signal: 'SIGINT' }).childKills).toEqual(['SIGINT'])
  })

  test('SIGTERM is forwarded either way', () => {
    expect(runLauncher({ signal: 'SIGTERM', ttys: allTty }).childKills).toEqual(['SIGTERM'])
    expect(runLauncher({ signal: 'SIGTERM' }).childKills).toEqual(['SIGTERM'])
  })

  test('SIGHUP is handled except on Windows, which has none', () => {
    expect(runLauncher().listening).toContain('SIGHUP')
    expect(runLauncher({ platform: 'win32', arch: 'x64' }).listening).not.toContain('SIGHUP')
  })
})

describe('cargoTargetDir', () => {
  test('passes the manifest path and reads target_directory', () => {
    const { runner, calls } = fakeRunner({
      'metadata --no-deps --format-version 1 --manifest-path /repo/app/Cargo.toml': {
        stdout: '{"target_directory":"/repo/target"}',
      },
    })
    const dir = cargoTargetDir({ cwd: '/repo', manifestPath: '/repo/app/Cargo.toml', runner })
    expect(dir).toBe('/repo/target')
    expect(calls[0]?.opts.cwd).toBe('/repo')
  })

  test('output with no target_directory is an error', () => {
    const { runner } = fakeRunner({ 'metadata --no-deps --format-version 1': { stdout: '{}' } })
    expect(() => cargoTargetDir({ cwd: '/repo', runner })).toThrow(/no target_directory/)
  })

  test('a failed cargo run throws', () => {
    const { runner } = fakeRunner({
      'metadata --no-deps --format-version 1': { exitCode: 101, stderr: 'no Cargo.toml' },
    })
    expect(() => cargoTargetDir({ cwd: '/repo', runner })).toThrow()
  })
})

describe('publishPackages', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  /**
   * Three package directories, an `npm view` that knows the `published`
   * versions, and an `npm publish` that records each run and fails for the
   * directory named in `failing`.
   */
  function setup(published: string[], failing?: string) {
    const root = mkdtempSync(join(tmpdir(), 'npm-binary-publish-'))
    dirs.push(root)
    const pkg = (name: string) => {
      const dir = join(root, name.replace('/', '__'))
      mkdirSync(dir)
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0' }))
      return dir
    }
    const { asyncRunner: viewRunner } = fakeRunner((argv) =>
      published.includes(argv[1]!) ? { stdout: '1.0.0\n' } : { exitCode: 1 },
    )
    const runs: string[] = []
    const publishRunner: StreamRunner = {
      run: (argv, { cwd }) => {
        const name = cwd.slice(root.length + 1).replace('__', '/')
        if (name === failing) return { exitCode: 1 }
        runs.push([name, ...argv].join(' '))
        return { exitCode: 0 }
      },
    }
    return {
      options: {
        platformDirs: [pkg('@acme/tool-linux-x64'), pkg('@acme/tool-darwin-arm64')],
        launcherDir: pkg('@acme/tool'),
        viewRunner,
        publishRunner,
      },
      runs,
    }
  }

  test('platform packages first, the launcher last, skipping published versions', async () => {
    const { options, runs } = setup(['@acme/tool-darwin-arm64@1.0.0'])
    await publishPackages(options)
    expect(runs).toEqual(['@acme/tool-linux-x64 publish', '@acme/tool publish'])
  })

  test('dryRun passes --dry-run', async () => {
    const { options, runs } = setup([])
    await publishPackages({ ...options, dryRun: true })
    expect(runs).toEqual([
      '@acme/tool-linux-x64 publish --dry-run',
      '@acme/tool-darwin-arm64 publish --dry-run',
      '@acme/tool publish --dry-run',
    ])
  })

  test('a failed publish stops the run before the launcher', async () => {
    const { options, runs } = setup([], '@acme/tool-linux-x64')
    await expect(publishPackages(options)).rejects.toThrow(/npm publish failed/)
    expect(runs).toEqual([])
  })
})
