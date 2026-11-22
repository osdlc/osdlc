/** Profiles: named overrides merged over the config and chosen with --profile. */

import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { captureContext } from '@osdlc/cli-tool'

import { main } from '../src/cli.ts'
import { applyProfile, readConfig } from '../src/config.ts'
import type { Candidate, Plugin } from '../src/index.ts'

const dirs: string[] = []
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})
const temp = (): string => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), 'host-cleaner-profile-')))
  dirs.push(d)
  return d
}

const CONFIG = {
  targets: ['~/dev'],
  ignore: ['/keep'],
  idleHours: 24,
  plugins: { cargo: { idleHours: 12 }, node: { enabled: true } },
  profiles: {
    deep: {
      idleHours: 0,
      ignore: ['/extra'],
      plugins: { cargo: { idleHours: 1 }, node: { enabled: false } },
    },
  },
}

function configFile(config: unknown): { file: string; cwd: string; env: Record<string, string> } {
  const home = temp()
  const file = join(home, 'config.json')
  writeFileSync(file, JSON.stringify(config))
  return {
    file,
    cwd: temp(),
    env: { ...(process.env as Record<string, string>), HOST_CLEANER_ROOT: home },
  }
}

describe('applyProfile', () => {
  test('merges nested settings over the base and only grows ignore', () => {
    const { file } = configFile(CONFIG)
    const base = readConfig(file)
    const deep = applyProfile(base, 'deep')
    expect(deep.idleHours).toBe(0)
    expect(deep.targets).toEqual(['~/dev'])
    expect(deep.ignore).toEqual(['/keep', '/extra'])
    expect(deep.plugins).toEqual({ cargo: { idleHours: 1 }, node: { enabled: false } })
    expect(base.idleHours).toBe(24)
  })

  test('an unknown profile is refused, naming the ones there are', () => {
    const base = readConfig(configFile(CONFIG).file)
    expect(() => applyProfile(base, 'shallow')).toThrow(/no profile named shallow; have deep/)
    expect(() => applyProfile(readConfig(configFile({}).file), 'x')).toThrow(/has none/)
  })

  test('a profile is validated when the config loads', () => {
    const typo = configFile({ profiles: { deep: { plugins: { cargo: { idlehours: 1 } } } } })
    expect(() => readConfig(typo.file)).toThrow(/profiles\.deep\.plugins\.cargo.*idlehours/)
    const key = configFile({ profiles: { deep: { nope: 1 } } })
    expect(() => readConfig(key.file)).toThrow(/bad config/)
  })
})

describe('--profile', () => {
  const run = (argv: string[], c: ReturnType<typeof configFile>, plugins?: Plugin[]) => {
    const ctx = captureContext({ cwd: c.cwd, env: c.env })
    // The shipped plugins would talk to this machine's Orca and sweep every repository it lists.
    const phase = ['status', 'plan', 'clean'].includes(argv[0] ?? '')
    const args = phase && plugins === undefined ? [...argv, '--skip-plugin', 'orca'] : argv
    const code = main(args, ctx, { confirm: () => null, ...(plugins ? { plugins } : {}) })
    return { code, out: ctx.io.out, err: ctx.io.err }
  }

  test('config shows the profile applied, and refuses an unknown one with exit 2', () => {
    const c = configFile(CONFIG)
    const plain = run(['config', '--config', c.file], c)
    expect(plain.out).toMatch(/plugins\.cargo\n(.*\n)*? {2}idleHours = 12 {2}\(config\)/)
    const deep = run(['config', '--config', c.file, '--profile', 'deep'], c)
    expect(deep.out).toContain('profile: deep')
    expect(deep.out).toContain('idleHours: 0')
    expect(deep.out).toContain('ignore: /keep, /extra')
    expect(deep.out).toMatch(/idleHours = 1 {2}\(config\)/)
    expect(deep.out).toMatch(/plugins\.node\n {2}enabled = false {2}\(config\)/)
    const bad = run(['status', '--config', c.file, '--profile', 'nope'], c)
    expect(bad.code).toBe(2)
    expect(bad.err).toContain('no profile named nope')
    const json = JSON.parse(
      run(['config', '--config', c.file, '--profile', 'deep', '--format', 'json'], c).out,
    )
    expect(json.profile).toBe('deep')
    expect(
      JSON.parse(run(['config', '--config', c.file, '--format', 'json'], c).out).profile,
    ).toBeNull()
  })

  test('a misspelt plugin name inside a profile is a config error, whether or not the profile is chosen', () => {
    const c = configFile({ profiles: { deep: { plugins: { nodee: { enabled: false } } } } })
    const plugins: Plugin[] = [{ name: 'node', detect: () => true }]
    for (const argv of [
      ['config', '--config', c.file],
      ['status', '--config', c.file],
      ['status', '--config', c.file, '--profile', 'deep'],
    ]) {
      const r = run(argv, c, argv[0] === 'config' ? undefined : plugins)
      expect(r.code).toBe(2)
      expect(r.err).toContain('config names no plugin')
      expect(r.err).toContain('profiles.deep.plugins.nodee')
    }
  })

  test('status and clean take the profile: its ignore and disabled plugins apply', () => {
    const c = configFile({
      profiles: { deep: { ignore: ['/skip'], plugins: { off: { enabled: false } } } },
    })
    const cand = (id: string, path: string, owner: string): Candidate => ({
      id,
      kind: 'artifact',
      path,
      owner,
      why: 'idle',
      evidence: {},
    })
    const plugins: Plugin[] = [
      {
        name: 'on',
        detect: () => true,
        discover: () => [cand('a:1', '/skip/x', 'on'), cand('a:2', '/ok/x', 'on')],
        delete: () => 'ok',
      },
      {
        name: 'off',
        detect: () => true,
        discover: () => [cand('b:1', '/ok/y', 'off')],
        delete: () => 'ok',
      },
    ]
    const without = run(['status', '--config', c.file], c, plugins)
    expect(without.out).toContain('a:1')
    expect(without.out).toContain('b:1')
    const withProfile = run(['status', '--config', c.file, '--profile', 'deep'], c, plugins)
    expect(withProfile.out).not.toContain('a:1')
    expect(withProfile.out).toContain('a:2')
    expect(withProfile.out).not.toContain('b:1')
    const clean = run(
      ['clean', '--dry-run', '--format', 'json', '--config', c.file, '--profile', 'deep'],
      c,
      plugins,
    )
    expect(clean.code).toBe(0)
    expect(JSON.parse(clean.out).run).toEqual(['a:2'])
  })
})
