/**
 * `detect()` itself: the six reports and their always-present fields, the
 * install probe and `allowExec`, `project` mode, provider selection and error
 * isolation, and the opencode, pi and Antigravity providers.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdirSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'

import type { AsyncCommandRunner } from '@osdlc/command-seam'

import { createContext, forHarness } from '../src/context.ts'
import type { HarnessProvider } from '../src/contract.ts'
import { parseVersion } from '../src/detect.ts'
import { BUILTIN_HARNESSES } from '../src/harnesses.ts'
import { builtinProviders } from '../src/providers/index.ts'
import { HarnessCatalogSchema } from '../src/report.ts'
import { which } from '../src/which.ts'
import { fixture, type Fixture } from './fixture.ts'

let f: Fixture

beforeEach(() => {
  f = fixture()
})

afterEach(() => {
  f.cleanup()
})

/** A runner that records its calls and answers `--version`; `result` overrides the exit. */
function fakeRunners(
  output: string,
  result: { exitCode?: number; stderr?: string; neverExited?: boolean } = {},
): {
  calls: string[]
  makeRunner: (binary: string) => AsyncCommandRunner
} {
  const calls: string[] = []
  return {
    calls,
    makeRunner: (binary) => ({
      run: async (argv) => {
        calls.push([binary, ...argv].join(' '))
        return { exitCode: 0, stdout: output, stderr: '', ...result }
      },
    }),
  }
}

describe('detect', () => {
  test('an empty machine: six absent reports, every field present and empty, schema-valid', async () => {
    const catalog = await f.detect()
    expect(HarnessCatalogSchema.parse(catalog)).toEqual(catalog)
    expect(catalog.reports.map((r) => r.harness)).toEqual([...BUILTIN_HARNESSES])
    expect(catalog.mode).toBe('full')
    expect(catalog.allowExec).toBe(false)
    for (const r of catalog.reports) {
      expect(r.status).toBe('absent')
      expect(r.install.probed).toBe(true)
      expect(r.install.found).toBe(false)
      for (const key of [
        'plugins',
        'marketplaces',
        'skills',
        'commands',
        'agents',
        'hooks',
        'mcpServers',
        'instructions',
        'diagnostics',
      ] as const) {
        expect(r[key]).toEqual([])
      }
      expect(r.permissions).toEqual({ rules: [], defaultMode: null, defaultModeSource: null })
      expect(r.auth.signedIn).toBe('unknown')
    }
  })

  test('a binary on PATH is found without running it', async () => {
    const path = f.binary('codex')
    const { calls, makeRunner } = fakeRunners('codex-cli 0.163.0')
    const r = await f.report('codex', { makeRunner })
    expect(r.install).toEqual({
      binary: 'codex',
      probed: true,
      found: true,
      path,
      how: 'PATH',
      version: null,
    })
    expect(r.status).toBe('ok')
    expect(calls).toEqual([])
  })

  test('allowExec runs --version through the injected runner', async () => {
    const path = f.binary('claude')
    const { calls, makeRunner } = fakeRunners('2.1.283 (Claude Code)\n')
    const r = await f.report('claude', { allowExec: true, makeRunner })
    expect(r.install.version).toBe('2.1.283')
    expect(calls).toEqual([`${path} --version`])
  })

  test('a --version run that fails leaves the version null; the install is still found', async () => {
    const path = f.binary('claude')
    for (const result of [{ exitCode: 1 }, { neverExited: true }]) {
      const { calls, makeRunner } = fakeRunners('2.1.283 (Claude Code)\n', result)
      const r = await f.report('claude', { allowExec: true, makeRunner })
      expect(r.install).toMatchObject({ found: true, path, version: null })
      expect(calls).toEqual([`${path} --version`])
    }
  })

  test('a version printed only on stderr is read from stderr', async () => {
    f.binary('claude')
    const { makeRunner } = fakeRunners('', { stderr: 'claude 3.4.5\n' })
    const r = await f.report('claude', { allowExec: true, makeRunner })
    expect(r.install.version).toBe('3.4.5')
  })

  test('binaries renames a harness binary', async () => {
    const path = f.binary('my-claude')
    const r = await f.report('claude', { binaries: { claude: 'my-claude' } })
    expect([r.install.binary, r.install.path]).toEqual(['my-claude', path])
  })

  test('only and exclude select providers', async () => {
    const only = await f.detect({ only: ['pi', 'codex'] })
    expect(only.reports.map((r) => r.harness)).toEqual(['codex', 'pi'])
    const ex = await f.detect({ exclude: ['claude'] })
    expect(ex.reports.map((r) => r.harness)).not.toContain('claude')
  })

  test('a provider that throws is an error report; the others survive', async () => {
    const broken: HarnessProvider = {
      id: 'broken',
      label: 'Broken',
      kind: 'parse',
      collect: () => {
        throw new Error('boom')
      },
    }
    const catalog = await f.detect({ providers: [broken, ...builtinProviders] })
    expect(catalog.reports[0]).toMatchObject({
      harness: 'broken',
      status: 'error',
      diagnostics: [{ severity: 'error', message: 'boom', source: null }],
    })
    expect(catalog.reports).toHaveLength(7)
  })

  test('a custom provider finds its {system} app bundle', async () => {
    f.write(join(f.system, 'Applications', 'Mine.app'), { Info: '' })
    const mine: HarnessProvider = {
      id: 'mine',
      label: 'Mine',
      kind: 'parse',
      appBundles: ['{system}/Applications/Mine.app'],
      collect: () => ({}),
    }
    const r = (await f.detect({ providers: [mine] })).reports[0]!
    expect(r.install).toMatchObject({
      found: true,
      how: 'app bundle',
      path: join(f.system, 'Applications', 'Mine.app'),
    })
    expect(r.status).toBe('ok')
  })

  test('a probe that throws is a warning; the files are still read', async () => {
    f.write(f.project, { '.mcp.json': { mcpServers: { s: { command: 'c' } } } })
    const r = await f.report('claude', {
      which: () => {
        throw new Error('no PATH')
      },
    })
    expect(r.status).toBe('ok')
    expect(r.install).toMatchObject({ probed: true, found: false })
    expect(r.diagnostics).toContainEqual({
      severity: 'warning',
      message: 'install probe failed: no PATH',
      source: null,
    })
    expect(r.mcpServers.map((s) => s.name)).toEqual(['s'])
  })

  test('reports do not share their auth object', async () => {
    const catalog = await f.detect()
    const [a, b] = catalog.reports
    expect(a!.auth).toEqual(b!.auth)
    expect(a!.auth).not.toBe(b!.auth)
  })

  test('an exec provider is skipped without allowExec', async () => {
    const execOnly: HarnessProvider = {
      id: 'exec-only',
      label: 'Exec',
      kind: 'exec',
      collect: () => ({ status: 'ok' }),
    }
    const off = await f.detect({ providers: [execOnly] })
    expect([off.reports[0]!.status, off.reports[0]!.skippedForExec]).toEqual(['absent', true])
    const on = await f.detect({ providers: [execOnly], allowExec: true })
    expect([on.reports[0]!.status, on.reports[0]!.skippedForExec]).toEqual(['ok', false])
  })

  test('a probe that throws on an exec provider is a warning; the provider still runs', async () => {
    const execOnly: HarnessProvider = {
      id: 'exec-only',
      label: 'Exec',
      kind: 'exec',
      binary: 'exec-only',
      collect: () => ({ status: 'ok' }),
    }
    const r = (
      await f.detect({
        providers: [execOnly],
        allowExec: true,
        which: () => {
          throw new Error('no PATH')
        },
      })
    ).reports[0]!
    expect([r.status, r.skippedForExec]).toEqual(['ok', false])
    expect(r.diagnostics).toContainEqual({
      severity: 'warning',
      message: 'install probe failed: no PATH',
      source: null,
    })
  })

  test('parseVersion takes the first semver token', () => {
    expect(parseVersion('codex-cli 0.156.1-beta.2 (x)')).toBe('0.156.1-beta.2')
    expect(parseVersion('no version')).toBeNull()
  })
})

describe('project mode', () => {
  test('reads project files only: no home, no system, no install probe, no sign-in', async () => {
    f.binary('claude')
    f.write(f.home, {
      '.claude/settings.json': { permissions: { allow: ['HomeRule'] } },
      '.claude/.credentials.json': '{}',
      '.claude.json': { projects: { [f.project]: { mcpServers: { local: { command: 'x' } } } } },
    })
    f.write(join(f.system, 'etc', 'claude-code'), {
      'managed-settings.json': { permissions: { allow: ['ManagedRule'] } },
    })
    f.write(f.project, {
      '.claude/settings.json': { permissions: { allow: ['ProjectRule'] } },
      '.mcp.json': { mcpServers: { proj: { command: 'p' } } },
      '.codex/hooks.json': { hooks: { Stop: [{ hooks: [{ command: 'h' }] }] } },
    })
    // Even an override that points into home is not followed.
    const catalog = await f.detect({
      mode: 'project',
      env: { CLAUDE_CONFIG_DIR: join(f.home, '.claude') },
    })
    expect(catalog.home).toBeNull()
    expect(catalog.mode).toBe('project')

    const claude = catalog.reports.find((r) => r.harness === 'claude')!
    expect(claude.install.probed).toBe(false)
    expect(claude.permissions.rules.map((x) => x.rule)).toEqual(['ProjectRule'])
    expect(claude.mcpServers.map((s) => s.name)).toEqual(['proj'])
    expect(claude.auth.signedIn).toBe('unknown')
    expect(claude.configDirs).toEqual([])
    for (const r of catalog.reports) {
      for (const s of r.sources) expect(s.path.startsWith(f.project)).toBe(true)
    }
    const codex = catalog.reports.find((r) => r.harness === 'codex')!
    expect(codex.hooks.map((h) => [h.command, h.trust])).toEqual([['h', null]])
  })

  test('a linked file or folder that leads out of the project is not read', async () => {
    f.write(f.home, {
      'secret.json': { mcpServers: { leaked: { command: 'x' } } },
      '.claude/commands/leaked.md': '---\ndescription: Home.\n---\n',
      '.claude/settings.json': { permissions: { allow: ['HomeRule'] } },
    })
    mkdirSync(join(f.project, '.claude'), { recursive: true })
    symlinkSync(join(f.home, 'secret.json'), join(f.project, '.mcp.json'))
    symlinkSync(join(f.home, '.claude', 'commands'), join(f.project, '.claude', 'commands'))
    symlinkSync(
      join(f.home, '.claude', 'settings.json'),
      join(f.project, '.claude', 'settings.json'),
    )

    const shared = createContext({
      projectRoot: f.project,
      home: null,
      env: {},
      platform: 'linux',
      systemRoot: f.system,
      mode: 'project',
      allowExec: false,
      readContents: false,
      includeValues: false,
      which: () => null,
      makeRunner: () => {
        throw new Error('no runner in project mode')
      },
      signal: new AbortController().signal,
    })
    const ctx = forHarness(shared, 'claude')
    expect(ctx.readText(join(f.project, '.mcp.json')).status).toBe('absent')
    expect(ctx.readJson(join(f.project, '.mcp.json')).status).toBe('absent')
    expect(ctx.listDir(join(f.project, '.claude', 'commands'))).toEqual([])
    expect(ctx.readText(join(f.project, '.claude', 'commands', 'leaked.md')).status).toBe('absent')

    const r = await f.report('claude', { mode: 'project' })
    expect(r.mcpServers).toEqual([])
    expect(r.commands).toEqual([])
    expect(r.permissions.rules).toEqual([])
  })
})

describe('opencode, pi and antigravity', () => {
  test('opencode: XDG data folder auth.json', async () => {
    const data = join(f.root, 'xdg-data')
    f.write(data, { 'opencode/auth.json': '{}' })
    const r = await f.report('opencode', { env: { XDG_DATA_HOME: data } })
    expect(r.auth.evidence).toBe(join(data, 'opencode', 'auth.json'))
    expect(r.configDirs.find((d) => d.name === 'data')).toMatchObject({
      envVar: 'XDG_DATA_HOME',
      exists: true,
    })
    expect(r.status).toBe('ok')
  })

  test('pi: provider names are the auth file keys; values are not kept', async () => {
    f.write(f.home, { '.pi/agent/auth.json': { anthropic: { key: 'sk-secret' }, openai: {} } })
    const r = await f.report('pi')
    expect(r.auth).toEqual({
      signedIn: true,
      evidence: join(f.home, '.pi', 'agent', 'auth.json'),
      providers: ['anthropic', 'openai'],
    })
    expect(JSON.stringify(r)).not.toContain('sk-secret')
  })

  test('pi: an empty auth file is unknown with no providers', async () => {
    f.write(f.home, { '.pi/agent/auth.json': {} })
    expect((await f.report('pi')).auth).toEqual({
      signedIn: 'unknown',
      evidence: null,
      providers: [],
    })
  })

  test('antigravity: install by agy, sign-in always unknown', async () => {
    f.binary('agy')
    const r = await f.report('antigravity')
    expect([r.install.found, r.auth.signedIn]).toEqual([true, 'unknown'])
  })
})

// POSIX rules on a POSIX host: the stand-ins are found by their execute bit and `PATH` uses `:`.
describe.skipIf(process.platform === 'win32')('which', () => {
  test('a relative PATH entry is skipped, so a file the project ships is never found', () => {
    f.binary('tool')
    expect(which('tool', { PATH: 'bin' }, 'linux', f.root)).toBeNull()
    expect(which('tool', { PATH: `bin:${f.bin}` }, 'linux', f.root)).toBe(join(f.bin, 'tool'))
  })

  test('a name is looked up as given', () => {
    f.binary('tool.CMD')
    expect(which('tool.CMD', { PATH: f.bin }, 'linux')).toBe(join(f.bin, 'tool.CMD'))
  })

  test('a name with a separator is checked as an absolute path only', () => {
    const path = f.binary('tool')
    expect(which(path, { PATH: '' }, 'linux')).toBe(path)
    expect(which('bin/tool', { PATH: '' }, 'linux', f.root)).toBeNull()
    expect(which(join(f.bin, 'absent'), { PATH: '' }, 'linux')).toBeNull()
  })

  test('a non-executable file, an empty PATH entry and a missing PATH find nothing', () => {
    f.write(f.bin, { plain: 'not a program' })
    expect(which('plain', { PATH: f.bin }, 'linux')).toBeNull()
    f.binary('tool')
    expect(which('tool', { PATH: '' }, 'linux', f.bin)).toBeNull()
    expect(which('tool', {}, 'linux', f.bin)).toBeNull()
    mkdirSync(join(f.bin, 'dir'))
    expect(which('dir', { PATH: f.bin }, 'linux')).toBeNull()
  })
})

// Windows rules count only a drive or UNC entry as absolute, so a match needs a
// Windows host. command-seam's `absolutePathCandidates` tests cover the rules anywhere.
describe.skipIf(process.platform !== 'win32')('which under Windows rules', () => {
  test('tries each PATHEXT suffix, and the default list when PATHEXT is unset', () => {
    f.binary('tool.CMD')
    f.binary('other.EXE')
    expect(which('tool', { PATH: f.bin, PATHEXT: '.EXE;.CMD' }, 'win32')).toBe(
      join(f.bin, 'tool.CMD'),
    )
    expect(which('tool', { PATH: f.bin, PATHEXT: '.EXE' }, 'win32')).toBeNull()
    expect(which('other', { PATH: f.bin }, 'win32')).toBe(join(f.bin, 'other.EXE'))
  })

  test('finds a name that already carries a PATHEXT extension', () => {
    f.binary('cursor-agent.exe')
    f.binary('notes.txt')
    const env = { PATH: f.bin, PATHEXT: '.COM;.EXE' }
    expect(which('cursor-agent.exe', env, 'win32')).toBe(join(f.bin, 'cursor-agent.exe'))
    expect(which('notes.txt', env, 'win32')).toBeNull()
  })

  test('reads Path in any case, strips quotes, falls back on an empty PATHEXT', () => {
    f.binary('tool.EXE')
    expect(which('tool', { Path: `"${f.bin}"`, PATHEXT: '' }, 'win32')).toBe(
      join(f.bin, 'tool.EXE'),
    )
    expect(which('tool', { Path: 'bin' }, 'win32', f.root)).toBeNull()
  })
})
