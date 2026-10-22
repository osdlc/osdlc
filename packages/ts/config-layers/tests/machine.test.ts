import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { z } from 'zod'

import { envStem, machineConfigFile } from '../src/machine.ts'
import {
  currentMachineVersion,
  migrateMachineRaw,
  type MachineMigration,
} from '../src/machine-migrate.ts'
import { MachineSchema, sandbox, type Sandbox, VENDOR_DIRS } from './support.ts'

let sb: Sandbox
beforeEach(() => {
  sb = sandbox()
})
afterEach(() => sb.dispose())

const DEFAULTS = { repos: [], paths: {}, checkout: {}, trust: { paths: [], owners: [] } }

function loadText(text: string) {
  const p = join(sb.root, 'machine.yaml')
  writeFileSync(p, text)
  process.env[sb.machine.env] = p
  sb.machine.clearCache()
  return sb.machine.loadWithIssues()
}

describe('envStem', () => {
  test('upper-cases and joins on underscores', () => {
    expect(envStem('tooly')).toBe('TOOLY')
    expect(envStem('pr-updater')).toBe('PR_UPDATER')
  })
})

describe('machineConfigFile', () => {
  test('lives under the standalone config home; the env override wins', () => {
    expect(sb.machine.env).toBe('TOOLY_MACHINE_CONFIG')
    expect(sb.machine.path()).toBe(join(sb.dirs.standalone('tooly').config().path, 'config.yaml'))
    expect(sb.machine.path().startsWith(sb.home)).toBe(true)
    process.env[sb.machine.env] = '/x/config.yaml'
    expect(sb.machine.path()).toBe('/x/config.yaml')
    process.env[sb.machine.env] = '  '
    expect(sb.machine.path()).toMatch(/tooly[/\\]config\.yaml$/)
  })

  test("without an injected resolver, the caller's override variables place the file", () => {
    const saved = process.env.TOOLY_ROOT
    process.env.TOOLY_ROOT = sb.root
    try {
      const m = machineConfigFile({ tool: 'tooly', schema: MachineSchema, vendorDirs: VENDOR_DIRS })
      expect(m.path().startsWith(sb.root)).toBe(true)
    } finally {
      if (saved === undefined) delete process.env.TOOLY_ROOT
      else process.env.TOOLY_ROOT = saved
    }
  })

  test('env name and file name are configurable', () => {
    const m = machineConfigFile({
      tool: 'tooly',
      schema: MachineSchema,
      env: 'TOOLY_CFG',
      fileName: 'machine.yaml',
      vendorDirs: VENDOR_DIRS,
      dirs: () => sb.dirs,
    })
    expect(m.env).toBe('TOOLY_CFG')
    expect(m.path()).toMatch(/tooly[/\\]machine\.yaml$/)
  })

  test('missing file → defaults', () => {
    expect(sb.machine.load()).toEqual(DEFAULTS)
  })

  test('a valid file is read, and re-read when the path changes', () => {
    const a = join(sb.root, 'a.yaml')
    writeFileSync(a, 'repos:\n  - ~/Developer\n  - /srv/repos\n')
    process.env[sb.machine.env] = a
    expect(sb.machine.load().repos).toEqual(['~/Developer', '/srv/repos'])

    const b = join(sb.root, 'b.yaml')
    writeFileSync(b, 'repos: []\n')
    process.env[sb.machine.env] = b
    expect(sb.machine.load().repos).toEqual([])
  })

  test('the value is memoised per path until clearCache', () => {
    const p = join(sb.root, 'p.yaml')
    writeFileSync(p, 'repos: [/one]\n')
    process.env[sb.machine.env] = p
    expect(sb.machine.load().repos).toEqual(['/one'])
    writeFileSync(p, 'repos: [/two]\n')
    expect(sb.machine.load().repos).toEqual(['/one'])
    sb.machine.clearCache()
    expect(sb.machine.load().repos).toEqual(['/two'])
  })

  test('a file it cannot salvage degrades to defaults rather than throwing', () => {
    for (const text of ['- a\n', ': : :\n', '']) {
      loadText(text)
      expect(sb.machine.load()).toEqual(DEFAULTS)
    }
  })

  test('a valid file has no issues', () => {
    expect(loadText('repos: [/r]\n').issues).toEqual([])
  })

  test('an unknown top-level key is dropped; the valid sections stay', () => {
    const { value, issues } = loadText('repos: [/r]\ntrust:\n  owners: [me]\nrepo: [/typo]\n')
    expect(value.repos).toEqual(['/r'])
    expect(value.trust.owners).toEqual(['me'])
    expect(issues).toEqual([
      { path: ['repo'], code: 'unknown_key', message: 'unknown key; ignored' },
    ])
  })

  test('an unknown nested key is dropped; its siblings stay', () => {
    const { value, issues } = loadText('trust:\n  paths: [~/x]\n  owners: [me]\n  owner: you\n')
    expect(value.trust).toEqual({ paths: ['~/x'], owners: ['me'] })
    expect(issues.map((i) => ({ code: i.code, path: i.path }))).toEqual([
      { code: 'unknown_key', path: ['trust', 'owner'] },
    ])
  })

  test('an invalid value drops its section to the default; the rest stays', () => {
    const { value, issues } = loadText(
      'repos: [/r]\npaths:\n  dev: /d\ncheckout:\n  layout: x\n  protocol: ftp\ntrust:\n  owners: [me]\n',
    )
    expect(value.repos).toEqual(['/r'])
    expect(value.paths).toEqual({ dev: '/d' })
    expect(value.trust.owners).toEqual(['me'])
    expect(value.checkout).toEqual({})
    expect(issues).toHaveLength(1)
    expect(issues[0]!.code).toBe('invalid')
    expect(issues[0]!.path).toEqual(['checkout', 'protocol'])
    expect(issues[0]!.message).toContain("using the default for 'checkout'")
  })

  test('unknown keys and invalid values together are each reported', () => {
    const { value, issues } = loadText('repos: 3\nnope: 1\ntrust:\n  owners: [me]\n')
    expect(value).toEqual({ ...DEFAULTS, trust: { paths: [], owners: ['me'] } })
    expect(issues.map((i) => [i.code, i.path.join('.')])).toEqual([
      ['unknown_key', 'nope'],
      ['invalid', 'repos'],
    ])
  })

  test('malformed YAML gives defaults and one yaml issue', () => {
    const { value, issues } = loadText('repos: [\n')
    expect(value).toEqual(DEFAULTS)
    expect(issues.map((i) => i.code)).toEqual(['yaml'])
    expect(() => sb.machine.load()).not.toThrow()
  })

  test('an unreadable file gives defaults and one unreadable issue', () => {
    process.env[sb.machine.env] = sb.root
    sb.machine.clearCache()
    const { value, issues } = sb.machine.loadWithIssues()
    expect(value).toEqual(DEFAULTS)
    expect(issues.map((i) => i.code)).toEqual(['unreadable'])
  })

  test('a non-mapping document gives defaults and one not_mapping issue', () => {
    const { value, issues } = loadText('- a\n')
    expect(value).toEqual(DEFAULTS)
    expect(issues.map((i) => i.code)).toEqual(['not_mapping'])
  })

  test('load and loadWithIssues share one memoised read', () => {
    loadText('repos: [/one]\nx: 1\n')
    const first = sb.machine.loadWithIssues()
    expect(sb.machine.load()).toBe(first.value)
    expect(sb.machine.loadWithIssues()).toBe(first)
  })
})

describe('write', () => {
  test('writes atomically, keeps a .bak and clears the cache', () => {
    loadText('repos: [/one]\n')
    const p = sb.machine.path()
    sb.machine.write('# mine\nrepos: [/two]\n')
    expect(readFileSync(p, 'utf-8')).toBe('# mine\nrepos: [/two]\n')
    expect(readFileSync(`${p}.bak`, 'utf-8')).toBe('repos: [/one]\n')
    expect(readdirSync(dirname(p)).filter((f) => f.endsWith('.tmp'))).toEqual([])
    expect(sb.machine.load().repos).toEqual(['/two'])
  })

  test('creates the parent directory', () => {
    sb.machine.write('repos: [/x]\n')
    expect(readFileSync(sb.machine.path(), 'utf-8')).toBe('repos: [/x]\n')
    expect(existsSync(`${sb.machine.path()}.bak`)).toBe(false)
  })

  test('text that fails the schema throws and writes nothing', () => {
    loadText('repos: [/one]\n')
    expect(() => sb.machine.write('nope: 1\n')).toThrow()
    expect(readFileSync(sb.machine.path(), 'utf-8')).toBe('repos: [/one]\n')
    expect(existsSync(`${sb.machine.path()}.bak`)).toBe(false)
  })
})

describe('migrations', () => {
  const toV2: MachineMigration = {
    from: 1,
    to: 2,
    run: ({ dirs, ...rest }) => ({ ...rest, repos: dirs }),
  }
  const toV3: MachineMigration = {
    from: 2,
    to: 3,
    run: (raw) => ({ ...raw, paths: { dev: '~/dev' } }),
  }
  const migrating = () =>
    machineConfigFile({
      tool: 'tooly',
      schema: MachineSchema.extend({ version: z.number().int().min(1).optional() }),
      vendorDirs: VENDOR_DIRS,
      dirs: () => sb.dirs,
      migrations: [toV2, toV3],
    })

  test('migrateMachineRaw runs each step from the file version on', () => {
    expect(migrateMachineRaw({ dirs: ['/a'] }, [toV2, toV3])).toEqual({
      raw: { repos: ['/a'], paths: { dev: '~/dev' }, version: 3 },
      applied: [2, 3],
    })
    expect(migrateMachineRaw({ version: 2, repos: [] }, [toV2, toV3]).applied).toEqual([3])
    expect(migrateMachineRaw({ version: 3 }, [toV2, toV3])).toEqual({
      raw: { version: 3 },
      applied: [],
    })
    expect(currentMachineVersion([])).toBe(1)
    expect(currentMachineVersion([toV2, toV3])).toBe(3)
  })

  test('load migrates in memory; migrate persists once', () => {
    const m = migrating()
    const p = join(sb.root, 'old.yaml')
    writeFileSync(p, 'dirs: [/a]\n')
    process.env[m.env] = p
    expect(m.loadWithIssues()).toMatchObject({ value: { repos: ['/a'], version: 3 }, issues: [] })
    expect(m.migrate({ dryRun: true })).toEqual({
      path: p,
      from: 1,
      to: 3,
      applied: [2, 3],
      written: false,
    })
    expect(m.migrate().written).toBe(true)
    expect(readFileSync(`${p}.bak`, 'utf-8')).toBe('dirs: [/a]\n')
    expect(m.migrate()).toMatchObject({ from: 3, to: 3, applied: [], written: false })
  })

  test('a newer file is read as-is with a newer_version issue', () => {
    const m = migrating()
    const p = join(sb.root, 'new.yaml')
    writeFileSync(p, 'version: 9\nrepos: [/a]\n')
    process.env[m.env] = p
    const { value, issues } = m.loadWithIssues()
    expect(value.repos).toEqual(['/a'])
    expect(issues.map((i) => ({ code: i.code, path: i.path.join('.') }))).toEqual([
      { code: 'newer_version', path: 'version' },
    ])
  })
})
