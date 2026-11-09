import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { etag, etagOfFile, WriteConflictError } from '@osdlc/etag-write'
import { z } from 'zod'

import { envStem } from '../src/dirs.ts'
import { machineConfigFile } from '../src/machine.ts'
import {
  currentMachineVersion,
  migrateMachineRaw,
  type MachineMigration,
} from '../src/machine-migrate.ts'
import {
  currentConfigVersion,
  defineMigrations,
  migrateConfigRaw,
  type ConfigMigration,
} from '../src/migrate.ts'
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

  test('the YAML is read by the project file rules, as the Rust crate reads it', () => {
    // `.inf` reads as its text, not Infinity, and `yes` stays a string.
    const read = loadText('repos: [.inf, yes]\npaths:\n  big: 1e999\n')
    expect(read.issues).toEqual([])
    expect(read.value.repos).toEqual(['.inf', 'yes'])
    expect(read.value.paths).toEqual({ big: '1e999' })
    // A null key is malformed, not an unknown key.
    expect(loadText('~: x\n').issues.map((i) => i.code)).toEqual(['yaml'])
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

  test('a write that keeps an issue already in the file goes through', () => {
    loadText('legacy: 1\nrepos: [/one]\n')
    sb.machine.write('legacy: 1\nrepos: [/two]\n')
    expect(readFileSync(sb.machine.path(), 'utf-8')).toBe('legacy: 1\nrepos: [/two]\n')
  })

  test('a write over an unparseable file goes through', () => {
    loadText('repos: [\n')
    sb.machine.write('repos: [/x]\n')
    expect(sb.machine.load().repos).toEqual(['/x'])
  })

  test('text that is not a mapping throws and writes nothing', () => {
    loadText('repos: [/one]\n')
    expect(() => sb.machine.write('- a\n')).toThrow(/not a mapping/)
    expect(readFileSync(sb.machine.path(), 'utf-8')).toBe('repos: [/one]\n')
    expect(existsSync(`${sb.machine.path()}.bak`)).toBe(false)
  })

  test('text that fails the schema throws and writes nothing', () => {
    loadText('repos: [/one]\n')
    expect(() => sb.machine.write('nope: 1\n')).toThrow()
    expect(readFileSync(sb.machine.path(), 'utf-8')).toBe('repos: [/one]\n')
    expect(existsSync(`${sb.machine.path()}.bak`)).toBe(false)
  })

  test('returns the etag of what it wrote', () => {
    expect(sb.machine.write('repos: [/x]\n')).toBe(etag('repos: [/x]\n'))
  })
})

describe('read, and write with an etag', () => {
  test('read gives the text and its etag, or null when there is no file', () => {
    process.env[sb.machine.env] = join(sb.root, 'absent.yaml')
    expect(sb.machine.read()).toBeNull()
    loadText('repos: [/one]\n')
    expect(sb.machine.read()).toEqual({ text: 'repos: [/one]\n', etag: etag('repos: [/one]\n') })
  })

  test('a read-modify-write with the etag goes through', () => {
    loadText('# mine\nrepos: [/one]\n')
    const seen = sb.machine.read()!
    const next = sb.machine.write(seen.text.replace('/one', '/two'), { etag: seen.etag })
    expect(readFileSync(sb.machine.path(), 'utf-8')).toBe('# mine\nrepos: [/two]\n')
    expect(next).toBe(etagOfFile(sb.machine.path()))
  })

  test('the etag is of the bytes, so a file that is not valid UTF-8 can still be written', () => {
    loadText('repos: [/one]\n')
    // A Latin-1 `é` in a comment: decoding replaces it, so a text etag would never match.
    writeFileSync(sb.machine.path(), Buffer.from('# caf\xe9\nrepos: [/one]\n', 'latin1'))
    const seen = sb.machine.read()!
    expect(seen.etag).toBe(etagOfFile(sb.machine.path()))
    sb.machine.write('repos: [/two]\n', { etag: seen.etag })
    expect(readFileSync(sb.machine.path(), 'utf-8')).toBe('repos: [/two]\n')
  })

  test('an edit saved since the read is not overwritten, and the .bak is left alone', () => {
    loadText('repos: [/one]\n')
    const p = sb.machine.path()
    writeFileSync(`${p}.bak`, 'older backup\n')
    const seen = sb.machine.read()!
    writeFileSync(p, 'repos: [/edited]\n')
    let err: unknown
    try {
      sb.machine.write('repos: [/two]\n', { etag: seen.etag })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(WriteConflictError)
    expect((err as WriteConflictError).reason).toBe('changed')
    expect(readFileSync(p, 'utf-8')).toBe('repos: [/edited]\n')
    expect(readFileSync(`${p}.bak`, 'utf-8')).toBe('older backup\n')
  })

  test('etag null means "I read no file": a file created since is a conflict', () => {
    process.env[sb.machine.env] = join(sb.root, 'new.yaml')
    expect(sb.machine.read()).toBeNull()
    writeFileSync(sb.machine.path(), 'repos: [/someone]\n')
    expect(() => sb.machine.write('repos: [/me]\n', { etag: null })).toThrow(
      expect.objectContaining({ reason: 'exists-without-etag' }),
    )
    expect(readFileSync(sb.machine.path(), 'utf-8')).toBe('repos: [/someone]\n')
  })

  test('etag null creates the file when there still is none', () => {
    process.env[sb.machine.env] = join(sb.root, 'new.yaml')
    sb.machine.write('repos: [/me]\n', { etag: null })
    expect(readFileSync(sb.machine.path(), 'utf-8')).toBe('repos: [/me]\n')
  })

  test('a file deleted since the read is created again', () => {
    loadText('repos: [/one]\n')
    const seen = sb.machine.read()!
    rmSync(sb.machine.path())
    sb.machine.write('repos: [/two]\n', { etag: seen.etag })
    expect(readFileSync(sb.machine.path(), 'utf-8')).toBe('repos: [/two]\n')
  })
})

describe('check', () => {
  test("does not change the caller's object", () => {
    loadText('repos: [/one]\n')
    const raw = { repos: 3, trust: { owners: ['me'] } }
    expect(sb.machine.check(raw).map((i) => [i.code, i.path.join('.')])).toEqual([
      ['invalid', 'repos'],
    ])
    expect(raw).toEqual({ repos: 3, trust: { owners: ['me'] } })
  })

  test('an issue already in the file is not reported again', () => {
    loadText('legacy: 1\nrepos: [/one]\n')
    expect(sb.machine.check({ legacy: 1, repos: ['/two'] })).toEqual([])
    expect(sb.machine.check({ legacy: 1, nope: 2 }).map((i) => i.path.join('.'))).toEqual(['nope'])
  })

  test('an unparseable file grandfathers nothing', () => {
    loadText('repos: [\n')
    expect(sb.machine.check({ nope: 1 }).map((i) => [i.code, i.path.join('.')])).toEqual([
      ['unknown_key', 'nope'],
    ])
  })
})

describe('migrations', () => {
  const toV2: ConfigMigration = {
    from: 1,
    to: 2,
    run: ({ dirs, ...rest }, warn) => {
      warn('dirs is now repos')
      return { ...rest, repos: dirs }
    },
  }
  const toV3: ConfigMigration = {
    from: 2,
    to: 3,
    run: (raw) => ({ ...raw, paths: { dev: '~/dev' } }),
  }
  const migrating = (migrations: readonly ConfigMigration[] = [toV2, toV3]) =>
    machineConfigFile({
      tool: 'tooly',
      schema: MachineSchema.extend({ version: z.number().int().min(1).optional() }),
      vendorDirs: VENDOR_DIRS,
      dirs: () => sb.dirs,
      migrations,
    })
  const fileAt = (m: { env: string }, name: string, text: string): string => {
    const p = join(sb.root, name)
    writeFileSync(p, text)
    process.env[m.env] = p
    return p
  }

  test('the machine names are the generic driver', () => {
    const steps: MachineMigration[] = [toV2, toV3]
    expect(migrateMachineRaw).toBe(migrateConfigRaw)
    expect(currentMachineVersion).toBe(currentConfigVersion)
    expect(migrateMachineRaw({ dirs: ['/a'] }, steps).applied).toEqual([2, 3])
  })

  test('load migrates in memory; migrate persists once', () => {
    const m = migrating()
    const p = fileAt(m, 'old.yaml', 'dirs: [/a]\n')
    expect(m.loadWithIssues()).toMatchObject({ value: { repos: ['/a'], version: 3 }, issues: [] })
    expect(readFileSync(p, 'utf-8')).toBe('dirs: [/a]\n')
    const text = 'repos:\n  - /a\npaths:\n  dev: ~/dev\nversion: 3\n'
    expect(m.migrate({ dryRun: true })).toEqual({
      path: p,
      from: 1,
      to: 3,
      applied: [2, 3],
      written: false,
      warnings: [{ to: 2, message: 'dirs is now repos' }],
      rewrite: 'edited',
      text,
    })
    expect(readFileSync(p, 'utf-8')).toBe('dirs: [/a]\n')
    expect(m.migrate().written).toBe(true)
    expect(readFileSync(p, 'utf-8')).toBe(text)
    expect(readFileSync(`${p}.bak`, 'utf-8')).toBe('dirs: [/a]\n')
    expect(m.migrate()).toMatchObject({ from: 3, to: 3, applied: [], written: false, text: null })
  })

  test('the rewrite keeps every comment outside the values that changed', () => {
    const m = migrating(
      defineMigrations([{ to: 2, moves: [['checkout.proto', 'checkout.protocol']] }]),
    )
    const src = [
      '# My machine. Hand-edited; keep these notes.',
      '',
      'repos:',
      '  - ~/dev   # the main one',
      '',
      '# How checkouts are made.',
      'checkout:',
      '  layout: "{dev}/{repo}"   # flat',
      '  proto: ssh',
      'trust:',
      '  owners: [me]',
      '',
    ].join('\n')
    const p = fileAt(m, 'commented.yaml', src)
    const result = m.migrate()
    expect(result).toMatchObject({ written: true, rewrite: 'edited', applied: [2] })
    expect(result.warnings).toEqual([
      { to: 2, message: "moved 'checkout.proto' to 'checkout.protocol'" },
    ])
    expect(readFileSync(p, 'utf-8')).toBe(
      src.replace('  proto: ssh\n', '  protocol: ssh\n') + 'version: 2\n',
    )
    m.clearCache()
    expect(m.loadWithIssues()).toMatchObject({
      value: { checkout: { protocol: 'ssh' } },
      issues: [],
    })
  })

  test('when the change cannot be made as edits, the document is rendered again', () => {
    // `trust` merges an anchor defined outside it, so a nested edit inside it is refused.
    const src = '# lost\nanchors: &t\n  paths: [/p]\ntrust:\n  <<: *t\n  owners: [me]\n'
    const m = migrating([
      {
        from: 1,
        to: 2,
        run: (raw) => ({ ...raw, trust: { ...(raw.trust as object), owners: ['x'] } }),
      },
    ])
    const p = fileAt(m, 'anchored.yaml', src)
    const out = m.migrate({ dryRun: true })
    expect(out.rewrite).toBe('reserialized')
    expect(out.text).not.toContain('# lost')
    expect(readFileSync(p, 'utf-8')).toBe(src)
    expect(m.migrate()).toMatchObject({ written: true, rewrite: 'reserialized' })
    expect(readFileSync(`${p}.bak`, 'utf-8')).toBe(src)
  })

  test('an edit saved while the migration ran is not overwritten', () => {
    const edited = 'dirs: [/edited]\n'
    let p = ''
    const m = migrating([
      {
        from: 1,
        to: 2,
        run: (raw) => {
          writeFileSync(p, edited)
          return raw
        },
      },
    ])
    p = fileAt(m, 'racy.yaml', 'dirs: [/a]\n')
    expect(() => m.migrate()).toThrow(WriteConflictError)
    expect(readFileSync(p, 'utf-8')).toBe(edited)
    expect(existsSync(`${p}.bak`)).toBe(false)
  })

  test('migrate on a missing file writes nothing and creates no file', () => {
    const m = migrating()
    const p = join(sb.root, 'absent.yaml')
    process.env[m.env] = p
    expect(m.migrate()).toEqual({
      path: p,
      from: 3,
      to: 3,
      applied: [],
      written: false,
      warnings: [],
      rewrite: null,
      text: null,
    })
    expect(existsSync(p)).toBe(false)
  })

  test('migrate on a non-mapping file throws and writes nothing', () => {
    const m = migrating()
    const p = fileAt(m, 'list.yaml', '- a\n')
    expect(() => m.migrate()).toThrow(/not a mapping/)
    expect(readFileSync(p, 'utf-8')).toBe('- a\n')
    expect(existsSync(`${p}.bak`)).toBe(false)
  })

  test('a newer file is read as-is with a newer_version issue, and migrate leaves it', () => {
    const m = migrating()
    const p = fileAt(m, 'new.yaml', 'version: 9\nrepos: [/a]\n')
    const { value, issues } = m.loadWithIssues()
    expect(value.repos).toEqual(['/a'])
    expect(issues.map((i) => ({ code: i.code, path: i.path.join('.') }))).toEqual([
      { code: 'newer_version', path: 'version' },
    ])
    expect(m.migrate()).toMatchObject({ from: 9, to: 9, applied: [], written: false })
    expect(readFileSync(p, 'utf-8')).toBe('version: 9\nrepos: [/a]\n')
  })
})
