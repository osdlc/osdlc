import { EventEmitter } from 'node:events'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'

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
  test('a template name, version or description keeps its position, but the argument wins', () => {
    const template = { description: 'old', license: 'MIT', name: 'wrong', version: '0.0.0' }
    const p = platformManifest(ROOT, MAC, { version: '1.0.0', description: 'd', template })
    expect(Object.keys(p).slice(0, 5)).toEqual(['name', 'version', 'description', 'license', 'os'])
    expect([p.name, p.version, p.description]).toEqual(['@acme/tool-darwin-arm64', '1.0.0', 'd'])
    const l = launcherManifest(ROOT, NPM_PLATFORMS, {
      version: '1.0.0',
      description: 'd',
      launcherPath: 'bin/tool.js',
      template,
    })
    expect([l.name, l.version, l.description]).toEqual(['@acme/tool', '1.0.0', 'd'])
  })

  test('the template is not changed', () => {
    const template = { name: 'wrong', files: ['bin'] }
    platformManifest(ROOT, MAC, { version: '1.0.0', description: 'd', template })
    expect(template).toEqual({ name: 'wrong', files: ['bin'] })
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

describe('renderLauncher', () => {
  test('fills every placeholder', () => {
    const js = renderLauncher(NESTED, NPM_PLATFORMS, { debugEnv: 'TOOL_DEBUG' })
    expect(js).not.toMatch(/\{\{\w+\}\}/)
    expect(js).toContain(`const DEBUG_ENV = "TOOL_DEBUG"`)
    expect(js).toContain('\\"binary\\":\\"bin/tool.exe\\"')
  })
})

/** Which of the launcher's standard streams are a terminal. */
interface Ttys {
  stdin?: boolean
  stdout?: boolean
  stderr?: boolean
}

/**
 * Runs the rendered launcher against a stub `process`, `require` and `spawn`,
 * then delivers `signal` to the launcher. Returns the signals it passed to the child.
 */
function forwardedOnSignal(signal: NodeJS.Signals, ttys: Ttys): string[] {
  const js = renderLauncher(ROOT, NPM_PLATFORMS).replace(/^#!.*\n/, '')
  const kills: string[] = []
  const child = new EventEmitter() as EventEmitter & { kill: (s: string) => void }
  child.kill = (s) => {
    kills.push(s)
  }
  const proc = Object.assign(new EventEmitter(), {
    platform: 'darwin',
    arch: 'arm64',
    argv: ['node', 'launcher.js'],
    env: {},
    pid: 1,
    stdin: { isTTY: ttys.stdin === true },
    stdout: { isTTY: ttys.stdout === true },
    stderr: { isTTY: ttys.stderr === true, write: () => true },
    exit: () => {},
    kill: () => {},
  })
  const modules: Record<string, unknown> = {
    'node:child_process': { spawn: () => child },
    'node:fs': { existsSync: () => true },
    'node:os': { constants: { signals: {} } },
    'node:path': { join: (...p: string[]) => p.join('/'), dirname: () => '/pkg' },
  }
  const req = Object.assign((id: string) => modules[id], { resolve: () => '/pkg/package.json' })
  new Function('require', 'process', js)(req, proc)
  proc.emit(signal, signal)
  return kills
}

describe('launcher values', () => {
  test('quotes and backslashes in names reach the launcher unchanged', () => {
    const odd: BinaryProduct = {
      binary: `it's\\a"tool`,
      launcher: `@acme/it's`,
      scope: '@acme',
      platformPrefix: `p\\q`,
      binaryDir: '',
    }
    const js = renderLauncher(odd, NPM_PLATFORMS, { debugEnv: `X'Y` }).replace(/^#!.*\n/, '')
    const consts = new Function(
      `${js.slice(0, js.indexOf('function binaryPath'))}; return { PLATFORM_PACKAGES, BINARY, LAUNCHER, DEBUG_ENV }`,
    )
    const fakeRequire = () => ({})
    expect(new Function('require', `return (${consts.toString()})()`)(fakeRequire)).toEqual({
      PLATFORM_PACKAGES: {
        'darwin-arm64': { package: `@acme/p\\q-darwin-arm64`, binary: `it's\\a"tool` },
        'darwin-x64': { package: `@acme/p\\q-darwin-x64`, binary: `it's\\a"tool` },
        'linux-x64': { package: `@acme/p\\q-linux-x64`, binary: `it's\\a"tool` },
        'linux-arm64': { package: `@acme/p\\q-linux-arm64`, binary: `it's\\a"tool` },
        'win32-x64': { package: `@acme/p\\q-win32-x64`, binary: `it's\\a"tool.exe` },
      },
      BINARY: `it's\\a"tool`,
      LAUNCHER: `@acme/it's`,
      DEBUG_ENV: `X'Y`,
    })
  })

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
    expect(stderr).toMatch(/--omit=optional/)
  })

  test('the debug variable prints what was resolved', () => {
    const { stderr } = runLauncher({ debugEnv: 'TOOL_DEBUG', env: { TOOL_DEBUG: '1' } })
    expect(stderr).toBe(
      'tool launcher: platform=darwin-arm64 package=@acme/tool-darwin-arm64 binary=/pkg/tool\n',
    )
  })

  test('the child exit code and signal pass through', () => {
    expect(runLauncher({ exit: [3, null] }).exitCodes).toEqual([3])
    const killed = runLauncher({ exit: [null, 'SIGTERM'] })
    expect(killed.selfKills).toEqual(['SIGTERM'])
  })
})

interface LauncherRun {
  platform?: string
  arch?: string
  resolves?: boolean
  debugEnv?: string
  env?: Record<string, string>
  exit?: [number | null, string | null]
}

/** Runs the rendered launcher against stubs, then ends the child as `exit` says. */
function runLauncher({
  platform = 'darwin',
  arch = 'arm64',
  resolves = true,
  debugEnv = '',
  env = {},
  exit,
}: LauncherRun): { stderr: string; exitCodes: number[]; selfKills: string[] } {
  const js = renderLauncher(ROOT, NPM_PLATFORMS, { debugEnv }).replace(/^#!.*\n/, '')
  let stderr = ''
  const exitCodes: number[] = []
  const selfKills: string[] = []
  const child = Object.assign(new EventEmitter(), { kill: () => {} })
  const proc = Object.assign(new EventEmitter(), {
    platform,
    arch,
    argv: ['node', 'launcher.js'],
    env,
    pid: 1,
    stdin: { isTTY: false },
    stdout: { isTTY: false },
    stderr: {
      isTTY: false,
      write: (s: string) => {
        stderr += s
        return true
      },
    },
    exit: (code: number) => {
      exitCodes.push(code)
    },
    kill: (_pid: number, signal: string) => {
      selfKills.push(signal)
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
  new Function('require', 'process', js)(req, proc)
  if (exit) child.emit('exit', ...exit)
  return { stderr, exitCodes, selfKills }
}

describe('launcher signal forwarding', () => {
  test('a terminal Ctrl-C is not forwarded: the child already has it from its process group', () => {
    expect(forwardedOnSignal('SIGINT', { stdin: true, stdout: true, stderr: true })).toEqual([])
  })

  test('a Ctrl-C is not forwarded when only stdout or stderr is a terminal (`echo x | bin`)', () => {
    expect(forwardedOnSignal('SIGINT', { stdout: true, stderr: true })).toEqual([])
    expect(forwardedOnSignal('SIGINT', { stderr: true })).toEqual([])
  })

  test('SIGINT is forwarded when no standard stream is a terminal', () => {
    expect(forwardedOnSignal('SIGINT', {})).toEqual(['SIGINT'])
  })

  test('SIGTERM is forwarded either way', () => {
    expect(forwardedOnSignal('SIGTERM', { stdin: true, stdout: true, stderr: true })).toEqual([
      'SIGTERM',
    ])
    expect(forwardedOnSignal('SIGTERM', {})).toEqual(['SIGTERM'])
  })
})

describe('cargoTargetDir', () => {
  test('passes the manifest path and reads target_directory', () => {
    const calls: string[][] = []
    const dir = cargoTargetDir({
      cwd: '/repo',
      manifestPath: '/repo/app/Cargo.toml',
      runner: {
        run: (args) => {
          calls.push(args)
          return { exitCode: 0, stdout: '{"target_directory":"/repo/target"}', stderr: '' }
        },
      },
    })
    expect(dir).toBe('/repo/target')
    expect(calls[0]).toContain('--manifest-path')
  })

  test('output with no target_directory is an error', () => {
    expect(() =>
      cargoTargetDir({
        cwd: '/repo',
        runner: { run: () => ({ exitCode: 0, stdout: '{}', stderr: '' }) },
      }),
    ).toThrow(/no target_directory/)
  })

  test('a failed cargo run throws', () => {
    expect(() =>
      cargoTargetDir({
        cwd: '/repo',
        runner: { run: () => ({ exitCode: 101, stdout: '', stderr: 'no Cargo.toml' }) },
      }),
    ).toThrow()
  })
})

describe.skipIf(process.platform === 'win32')('publishPackages', () => {
  const dirs: string[] = []
  const originalPath = process.env.PATH
  afterEach(() => {
    process.env.PATH = originalPath
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  /**
   * A fake `npm` on PATH: `view` answers from `published`, `publish` logs its
   * cwd and argv and fails for a package named in `failing`.
   */
  function setup(published: string[], failing: string[] = []) {
    const root = mkdtempSync(join(tmpdir(), 'npm-binary-publish-'))
    dirs.push(root)
    const log = join(root, 'log')
    writeFileSync(log, '')
    const bin = join(root, 'bin')
    mkdirSync(bin)
    const npm = join(bin, 'npm')
    writeFileSync(
      npm,
      [
        '#!/bin/sh',
        'if [ "$1" = view ]; then',
        ...published.map((p) => `  [ "$2" = "${p}" ] && { echo "${p.split('@').pop()}"; exit 0; }`),
        '  exit 1',
        'fi',
        `name=$(node -p "require('./package.json').name")`,
        ...failing.map((f) => `[ "$name" = "${f}" ] && exit 1`),
        `echo "$name $*" >> ${JSON.stringify(log)}`,
      ].join('\n'),
    )
    chmodSync(npm, 0o755)
    process.env.PATH = `${bin}${delimiter}${originalPath}`
    const pkg = (name: string) => {
      const dir = join(root, name.replace('/', '__'))
      mkdirSync(dir)
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0' }))
      return dir
    }
    return {
      platformDirs: [pkg('@acme/tool-linux-x64'), pkg('@acme/tool-darwin-arm64')],
      launcherDir: pkg('@acme/tool'),
      published: () => readFileSync(log, 'utf8').trim().split('\n').filter(Boolean),
    }
  }

  test('platform packages first, the launcher last, skipping published versions', async () => {
    const s = setup(['@acme/tool-darwin-arm64@1.0.0'])
    await publishPackages({ platformDirs: s.platformDirs, launcherDir: s.launcherDir })
    expect(s.published()).toEqual(['@acme/tool-linux-x64 publish', '@acme/tool publish'])
  })

  test('dryRun passes --dry-run', async () => {
    const s = setup([])
    await publishPackages({ ...s, dryRun: true })
    expect(s.published()).toEqual([
      '@acme/tool-linux-x64 publish --dry-run',
      '@acme/tool-darwin-arm64 publish --dry-run',
      '@acme/tool publish --dry-run',
    ])
  })

  test('a failed publish stops the run before the launcher', async () => {
    const s = setup([], ['@acme/tool-linux-x64'])
    await expect(publishPackages(s)).rejects.toThrow(/npm publish failed/)
    expect(s.published()).toEqual([])
  })
})
