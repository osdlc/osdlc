import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { CommandRunner } from '@osdlc/command-seam'
import { afterAll, describe, expect, test } from 'vitest'

import { builtins } from '../src/builtins.ts'
import { createProject } from '../src/project.ts'
import type { ToolAction } from '../src/roles.ts'
import type { ProjectProfile } from '../src/tool.ts'
import { fakeRunners as fakeAsyncRunners, fakeWhich, fixtureRoot, removeRoot } from './support.ts'

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

const project = createProject({ tools: builtins })

/** Detect a root holding `package.json` (from `pkg`) and `lockfile`. */
async function profileWith(
  pkg: Record<string, unknown> | string,
  lockfile = 'bun.lock',
  extra: Record<string, string> = {},
): Promise<ProjectProfile> {
  const text = typeof pkg === 'string' ? pkg : JSON.stringify(pkg)
  const dir = await fixtureRoot({ 'package.json': text, [lockfile]: '', ...extra })
  roots.push(dir)
  return project.detect(dir, {
    discovery: 'walk',
    makeRunner: fakeAsyncRunners([]).make,
    which: fakeWhich({}),
  })
}

/** Config that makes proto and mise detected tool managers. */
const MANAGERS = { '.prototools': '', 'mise.toml': '' }

const BUN_INSTALL: ToolAction = {
  tool: 'bun',
  ecosystem: 'node',
  dir: '.',
  argv: ['bun', 'install'],
  source: 'bun.lock',
}

/** Answers `--version` probes from a table keyed by binary; exit 127 for any other binary. */
function fakeRunners(versions: Partial<Record<string, string>>): (binary: string) => CommandRunner {
  return (binary: string) => ({
    run: () => {
      const v = versions[binary]
      if (v === undefined) return { exitCode: 127, stdout: '', stderr: `${binary}: not found` }
      return { exitCode: 0, stdout: v, stderr: '' }
    },
  })
}

describe('the packageManager pin', () => {
  test('a well-formed pin is parsed', async () => {
    const profile = await profileWith({ packageManager: 'bun@1.4.2' })
    expect(profile.packages[0]!.manifests.packageJson?.packageManagerPin).toEqual({
      manager: 'bun',
      version: '1.4.2',
    })
  })

  test('no packageManager field → no pin', async () => {
    const profile = await profileWith({ name: 'x' })
    expect(profile.packages[0]!.manifests.packageJson?.packageManagerPin).toBeUndefined()
  })

  test('a malformed field (no @, empty version) → no pin', async () => {
    for (const field of ['bun', 'bun@']) {
      const profile = await profileWith({ packageManager: field })
      expect(profile.packages[0]!.manifests.packageJson?.packageManagerPin).toBeUndefined()
    }
  })

  test('an unregistered manager name is recorded but no tool pins to it', async () => {
    const profile = await profileWith({ packageManager: 'volt@3.0.0' })
    expect(profile.packages[0]!.manifests.packageJson?.packageManagerPin).toEqual({
      manager: 'volt',
      version: '3.0.0',
    })
    const runnerFor = fakeRunners({ bun: '3.0.0' })
    expect(project.pinnedInstall(profile, BUN_INSTALL, { allowExec: true, runnerFor })).toBeNull()
  })

  test('an unparseable package.json → no pin, never throws', async () => {
    const profile = await profileWith('{ not json')
    expect(profile.packages[0]!.manifests.packageJson).toBeUndefined()
    const runnerFor = fakeRunners({ bun: '1.4.2' })
    expect(project.pinnedInstall(profile, BUN_INSTALL, { allowExec: true, runnerFor })).toBeNull()
  })
})

describe('pinnedInstall — declines to match', () => {
  test('an action from a tool with no package-manager role → null', async () => {
    const profile = await profileWith({ packageManager: 'bun@1.4.2' })
    const hook: ToolAction = {
      tool: 'lefthook',
      dir: '.',
      argv: ['lefthook', 'install'],
      source: 'lefthook.yml',
    }
    expect(project.pinnedInstall(profile, hook, { allowExec: true })).toBeNull()
  })

  test('a manager that takes no pin (cargo) → null', async () => {
    const profile = await profileWith({ packageManager: 'bun@1.4.2' })
    const cargo: ToolAction = {
      tool: 'cargo',
      ecosystem: 'rust',
      dir: '.',
      argv: ['cargo', 'fetch'],
      source: 'Cargo.toml',
    }
    expect(project.pinnedInstall(profile, cargo, { allowExec: true })).toBeNull()
  })

  test('no pin declared → null', async () => {
    const profile = await profileWith({ name: 'x' })
    const runnerFor = fakeRunners({ bun: '1.4.2' })
    expect(project.pinnedInstall(profile, BUN_INSTALL, { allowExec: true, runnerFor })).toBeNull()
  })

  test('the pin names a different manager than the action → null', async () => {
    const profile = await profileWith({ packageManager: 'pnpm@9.0.0' })
    const runnerFor = fakeRunners({ bun: '9.0.0' })
    expect(project.pinnedInstall(profile, BUN_INSTALL, { allowExec: true, runnerFor })).toBeNull()
  })

  test('an action for a directory that is not a package → null', async () => {
    const profile = await profileWith({ packageManager: 'bun@1.4.2' })
    const runnerFor = fakeRunners({ bun: '1.4.2' })
    const elsewhere = { ...BUN_INSTALL, dir: 'nowhere' }
    expect(project.pinnedInstall(profile, elsewhere, { allowExec: true, runnerFor })).toBeNull()
  })

  test('PATH, proto and mise all absent → null, so the caller falls back unpinned', async () => {
    const profile = await profileWith({ packageManager: 'bun@1.4.2' })
    const runnerFor = fakeRunners({})
    expect(project.pinnedInstall(profile, BUN_INSTALL, { allowExec: true, runnerFor })).toBeNull()
  })

  test('a version with shell metacharacters is declined before any probe', async () => {
    const profile = await profileWith({ packageManager: 'bun@1.4.2" ; touch PWNED #' })
    let probed = false
    const runnerFor = (): CommandRunner => ({
      run: () => {
        probed = true
        return { exitCode: 0, stdout: '1.3.0', stderr: '' }
      },
    })
    // An unsafe pin must never reach the warning `echo`, where it could break out of the quotes.
    expect(project.pinnedInstall(profile, BUN_INSTALL, { allowExec: true, runnerFor })).toBeNull()
    expect(probed).toBe(false)
  })

  test('a resolved version that is not shell-safe is skipped', async () => {
    const profile = await profileWith({ packageManager: 'bun@1.4.2' })
    const runnerFor = fakeRunners({ bun: '1.3.0; rm -rf /' })
    expect(project.pinnedInstall(profile, BUN_INSTALL, { allowExec: false, runnerFor })).toBeNull()
  })
})

describe('pinnedInstall — allowExec gate', () => {
  test('allowExec: false never probes a tool manager, even when only one would match', async () => {
    const profile = await profileWith({ packageManager: 'bun@1.4.2' })
    const probed: string[] = []
    const runnerFor = (binary: string): CommandRunner => ({
      run: () => {
        probed.push(binary)
        return { exitCode: 127, stdout: '', stderr: 'not found' }
      },
    })
    expect(project.pinnedInstall(profile, BUN_INSTALL, { allowExec: false, runnerFor })).toBeNull()
    expect(probed).toEqual(['bun'])
  })

  test('allowExec: false still resolves a PATH match, since PATH reads no repository config', async () => {
    const profile = await profileWith({ packageManager: 'bun@1.4.2' })
    const runnerFor = fakeRunners({ bun: '1.4.2' })
    expect(project.pinnedInstall(profile, BUN_INSTALL, { allowExec: false, runnerFor })).toEqual({
      argv: ['bun', 'install', '--frozen-lockfile'],
      command: 'bun install --frozen-lockfile',
      source: 'path',
      resolvedVersion: '1.4.2',
      versionMismatch: false,
    })
  })

  test('allowExec: false falls back to the PATH mismatch warning rather than trying mise', async () => {
    const profile = await profileWith({ packageManager: 'bun@1.4.2' })
    const runnerFor = fakeRunners({ bun: '1.3.0', env: '1.4.2' })
    const r = project.pinnedInstall(profile, BUN_INSTALL, { allowExec: false, runnerFor })
    expect(r?.source).toBe('path')
    expect(r?.versionMismatch).toBe(true)
  })
})

describe('pinnedInstall — probe cwd', () => {
  // A corepack shim on PATH reads the current directory's package.json to
  // decide what to run, so the PATH probe must not run inside the repository.
  test('the PATH probe runs from a neutral cwd, never the project root', async () => {
    const profile = await profileWith({ packageManager: 'bun@1.4.2' })
    const cwds: Array<string | undefined> = []
    const runnerFor = (binary: string): CommandRunner => ({
      run: (_argv, opts) => {
        cwds.push(opts?.cwd)
        if (binary === 'bun') return { exitCode: 0, stdout: '1.4.2', stderr: '' }
        return { exitCode: 127, stdout: '', stderr: 'not found' }
      },
    })
    project.pinnedInstall(profile, BUN_INSTALL, { allowExec: false, runnerFor })
    expect(cwds).toEqual([tmpdir()])
    expect(cwds[0]).not.toBe(profile.root)
  })

  test('only detected tool managers are probed', async () => {
    const profile = await profileWith({ packageManager: 'bun@1.4.2' })
    const probed: string[] = []
    const runnerFor = (binary: string): CommandRunner => ({
      run: () => {
        probed.push(binary)
        return { exitCode: 127, stdout: '', stderr: 'not found' }
      },
    })
    project.pinnedInstall(profile, BUN_INSTALL, { allowExec: true, runnerFor })
    expect(probed).toEqual(['bun'])
  })

  test('the tool-manager probes run from the project root, since resolving its pin is the point', async () => {
    const profile = await profileWith({ packageManager: 'bun@1.4.2' }, 'bun.lock', MANAGERS)
    const calls: Array<{ binary: string; argv: readonly string[]; cwd: string | undefined }> = []
    const runnerFor = (binary: string): CommandRunner => ({
      run: (argv, opts) => {
        calls.push({ binary, argv, cwd: opts?.cwd })
        return { exitCode: 127, stdout: '', stderr: 'not found' }
      },
    })
    project.pinnedInstall(profile, BUN_INSTALL, { allowExec: true, runnerFor })
    expect(calls).toEqual([
      { binary: 'bun', argv: ['--version'], cwd: tmpdir() },
      { binary: 'proto', argv: ['run', 'bun', '--', '--version'], cwd: profile.root },
      {
        binary: 'env',
        argv: [
          `MISE_TRUSTED_CONFIG_PATHS=${profile.root}`,
          'mise',
          'exec',
          '--',
          'bun',
          '--version',
        ],
        cwd: profile.root,
      },
    ])
  })
})

describe('pinnedInstall — corepack hash suffix', () => {
  test('a pin with a `+sha512-…` suffix matches an executable reporting the bare version', async () => {
    const profile = await profileWith({ packageManager: 'bun@1.4.2+sha512-abc123' })
    const runnerFor = fakeRunners({ bun: '1.4.2' })
    expect(project.pinnedInstall(profile, BUN_INSTALL, { allowExec: true, runnerFor })).toEqual({
      argv: ['bun', 'install', '--frozen-lockfile'],
      command: 'bun install --frozen-lockfile',
      source: 'path',
      resolvedVersion: '1.4.2',
      versionMismatch: false,
    })
  })
})

describe('pinnedInstall — executable-selection order', () => {
  test('PATH match → plain command, frozen flag, no warning', async () => {
    const profile = await profileWith({ packageManager: 'bun@1.4.2' })
    const runnerFor = fakeRunners({ bun: '1.4.2', proto: '1.4.2', env: '1.4.2' })
    expect(project.pinnedInstall(profile, BUN_INSTALL, { allowExec: true, runnerFor })).toEqual({
      argv: ['bun', 'install', '--frozen-lockfile'],
      command: 'bun install --frozen-lockfile',
      source: 'path',
      resolvedVersion: '1.4.2',
      versionMismatch: false,
    })
  })

  test('PATH bun mismatched, proto matches → proto wins, no warning', async () => {
    const profile = await profileWith({ packageManager: 'bun@1.4.2' }, 'bun.lock', MANAGERS)
    const runnerFor = (binary: string): CommandRunner => ({
      run: (argv) => {
        if (binary === 'bun') return { exitCode: 0, stdout: '1.3.0', stderr: '' }
        if (binary === 'proto' && argv[0] === 'run' && argv[1] === 'bun') {
          return { exitCode: 0, stdout: '1.4.2', stderr: '' }
        }
        return { exitCode: 127, stdout: '', stderr: 'not found' }
      },
    })
    expect(project.pinnedInstall(profile, BUN_INSTALL, { allowExec: true, runnerFor })).toEqual({
      argv: ['proto', 'run', 'bun', '--', 'install', '--frozen-lockfile'],
      command: 'proto run bun -- install --frozen-lockfile',
      source: 'proto',
      resolvedVersion: '1.4.2',
      versionMismatch: false,
    })
  })

  test('only mise matches → mise-scoped command with the trust env inline', async () => {
    const profile = await profileWith({ packageManager: 'bun@1.4.2' }, 'bun.lock', MANAGERS)
    const runnerFor = fakeRunners({ env: '1.4.2' })
    const r = project.pinnedInstall(profile, BUN_INSTALL, { allowExec: true, runnerFor })
    expect(r?.source).toBe('mise')
    expect(r?.versionMismatch).toBe(false)
    expect(r?.argv).toEqual([
      'env',
      `MISE_TRUSTED_CONFIG_PATHS=${profile.root}`,
      'mise',
      'exec',
      '--',
      'bun',
      'install',
      '--frozen-lockfile',
    ])
    expect(r?.command).toBe(
      `env MISE_TRUSTED_CONFIG_PATHS=${profile.root} mise exec -- bun install --frozen-lockfile`,
    )
  })

  test('nothing matches the pin → the first found, with a warning prefix', async () => {
    const profile = await profileWith({ packageManager: 'bun@1.4.2' })
    const runnerFor = fakeRunners({ bun: '1.3.0', proto: '1.2.0' })
    const r = project.pinnedInstall(profile, BUN_INSTALL, { allowExec: true, runnerFor })
    expect(r).toEqual({
      argv: ['bun', 'install', '--frozen-lockfile'],
      command:
        'echo "package manager mismatch: bun 1.3.0 found, repo pins 1.4.2 (packageManager)" >&2; bun install --frozen-lockfile',
      source: 'path',
      resolvedVersion: '1.3.0',
      versionMismatch: true,
    })
  })

  test('the first found may be a tool manager when PATH has none', async () => {
    const profile = await profileWith({ packageManager: 'bun@1.4.2' }, 'bun.lock', MANAGERS)
    const runnerFor = fakeRunners({ proto: '1.2.0' })
    const r = project.pinnedInstall(profile, BUN_INSTALL, { allowExec: true, runnerFor })
    expect(r?.source).toBe('proto')
    expect(r?.versionMismatch).toBe(true)
    expect(r?.command).toBe(
      'echo "package manager mismatch: bun 1.2.0 found, repo pins 1.4.2 (packageManager)" >&2; proto run bun -- install --frozen-lockfile',
    )
  })
})

describe('pinnedInstall — frozen install per manager', () => {
  test('pnpm → install --frozen-lockfile', async () => {
    const profile = await profileWith({ packageManager: 'pnpm@9.0.0' }, 'pnpm-lock.yaml')
    const [install] = project.frozenInstall(profile)
    const runnerFor = fakeRunners({ pnpm: '9.0.0' })
    expect(project.pinnedInstall(profile, install!, { allowExec: true, runnerFor })?.command).toBe(
      'pnpm install --frozen-lockfile',
    )
  })

  test('yarn → install --frozen-lockfile', async () => {
    const profile = await profileWith({ packageManager: 'yarn@1.22.19' }, 'yarn.lock')
    const [install] = project.frozenInstall(profile)
    const runnerFor = fakeRunners({ yarn: '1.22.19' })
    expect(project.pinnedInstall(profile, install!, { allowExec: true, runnerFor })?.command).toBe(
      'yarn install --frozen-lockfile',
    )
  })

  test('npm → ci, already frozen', async () => {
    const profile = await profileWith({ packageManager: 'npm@10.0.0' }, 'package-lock.json')
    const [install] = project.frozenInstall(profile)
    const runnerFor = fakeRunners({ npm: '10.0.0' })
    expect(project.pinnedInstall(profile, install!, { allowExec: true, runnerFor })?.command).toBe(
      'npm ci',
    )
  })
})

describe('pinnedInstall — reads the profile', () => {
  test('the pin comes from the profile, with no package.json left on disk', async () => {
    const profile = await profileWith({ packageManager: 'bun@1.4.2' })
    await rm(join(profile.root, 'package.json'))
    const runnerFor = fakeRunners({ bun: '1.4.2' })
    expect(
      project.pinnedInstall(profile, BUN_INSTALL, { allowExec: true, runnerFor })?.resolvedVersion,
    ).toBe('1.4.2')
  })

  test('the install chosen for a pinned package resolves through it', async () => {
    const profile = await profileWith({ packageManager: 'bun@1.4.2' })
    const [install] = project.install(profile)
    expect(install).toEqual({
      tool: 'bun',
      ecosystem: 'node',
      dir: '.',
      argv: ['bun', 'install'],
      source: 'package.json#packageManager',
    })
    const runnerFor = fakeRunners({ bun: '1.4.2' })
    expect(project.pinnedInstall(profile, install!, { allowExec: true, runnerFor })?.argv).toEqual([
      'bun',
      'install',
      '--frozen-lockfile',
    ])
  })
})
