/**
 * `assembleConfig`: the layered loader every tool built on the library shares,
 * exercised against a tiny pair of sections and real files.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { WriteConflictError } from '@osdlc/etag-write'
import { z } from 'zod'

import { CONFIG_INVALID_EXIT, ConfigInvalidError } from '../src/config-error.ts'
import { assembleConfig, readMappingFile, readParsedFile } from '../src/loader.ts'
import { defineMigrations } from '../src/migrate.ts'
import { scaffoldLocalYaml, scaffoldYaml, starterYaml } from '../src/scaffold.ts'
import { pathMatcher, stripUnknownKeys } from '../src/unknown-keys.ts'
import { defineConfigSection } from '../src/section.ts'

import { CONFIG_FILE, META } from './support.ts'

const docs = defineConfigSection({
  key: 'docs_site',
  schema: z.string().default('site').describe('Where the site lives.'),
  meta: META,
})

const limits = defineConfigSection({
  key: 'limits',
  schema: z
    .object({
      implement: z.number().int().min(0).default(5).describe('Parallel jobs.'),
      names: z.array(z.string()).default([]).describe('Names.'),
    })
    .strict()
    .prefault({})
    .describe('Caps.'),
  meta: META,
})

const server = defineConfigSection({
  key: 'server',
  schema: z
    .object({ interval: z.number().int().default(300).describe('Seconds.') })
    .strict()
    .prefault({})
    .describe('The loop.'),
  meta: META,
})

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'loader-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function write(rel: string, text: string): string {
  const path = join(root, rel)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, text)
  return path
}

const NO_ENV = { env: {} }

describe('assembleConfig — files and layers', () => {
  const handle = assembleConfig({
    file: CONFIG_FILE,
    sections: [docs, limits],
    unknownTopLevel: 'reject',
    resolve: NO_ENV,
  })

  test('with neither file present the result is the all-defaults object', () => {
    expect(handle.load(root)).toEqual({ docs_site: 'site', limits: { implement: 5, names: [] } })
  })

  test('the overlay deep-merges over the project file before validation', () => {
    write('tooly.yaml', 'limits:\n  implement: 2\n  names: [a]\n')
    write('tooly.local.yaml', 'limits:\n  names: [b]\n')
    expect(handle.load(root).limits).toEqual({ implement: 2, names: ['b'] })
    const layers = handle.loadLayers(root)
    expect(layers.project).toEqual({ limits: { implement: 2, names: ['a'] } })
    expect(layers.local).toEqual({ limits: { names: ['b'] } })
    expect(layers.files.source).toBe('default')
  })

  test('an unreadable-as-mapping file throws ConfigInvalidError naming it', () => {
    const path = write('tooly.yaml', '- a\n- b\n')
    try {
      handle.load(root)
      throw new Error('expected a throw')
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigInvalidError)
      expect((e as ConfigInvalidError).files).toEqual([path])
      expect((e as ConfigInvalidError).message).toContain('top level must be a mapping')
      expect((e as ConfigInvalidError).exitCode).toBe(CONFIG_INVALID_EXIT)
    }
  })

  test('a YAML syntax error throws, and parseProblem can add a hint', () => {
    write('tooly.yaml', 'limits: [unclosed\n')
    expect(() => handle.load(root)).toThrow(/YAML parse error/)
    const hinted = assembleConfig({
      file: CONFIG_FILE,
      sections: [docs],
      unknownTopLevel: 'reject',
      resolve: NO_ENV,
      parseProblem: (m) => `bad yaml (${m.split('\n')[0]})`,
    })
    expect(() => hinted.load(root)).toThrow(/bad yaml/)
  })

  test('readLayers reads a broken file without validating it', () => {
    write('tooly.yaml', 'limits:\n  implement: nope\n')
    expect(handle.readLayers(root).project).toEqual({ limits: { implement: 'nope' } })
  })

  test('a changed file reloads and a failed reload keeps throwing until the file is valid', () => {
    write('tooly.yaml', 'docs_site: one\n')
    expect(handle.load(root).docs_site).toBe('one')
    write('tooly.yaml', 'docs_site: [broken\n')
    expect(() => handle.load(root)).toThrow(ConfigInvalidError)
    expect(() => handle.load(root)).toThrow(ConfigInvalidError)
    write('tooly.yaml', 'docs_site: two\n')
    expect(handle.load(root).docs_site).toBe('two')
  })
})

describe('assembleConfig — the relocation variable', () => {
  test('the memo key includes the file path: one root, two files, two results', () => {
    write('tooly.yaml', 'docs_site: root\n')
    const other = write('tools/tooly.yaml', 'docs_site: tools\n')
    const env: Record<string, string | undefined> = {}
    const handle = assembleConfig({
      file: CONFIG_FILE,
      sections: [docs],
      unknownTopLevel: 'reject',
      resolve: { env },
    })
    expect(handle.load(root).docs_site).toBe('root')
    env[CONFIG_FILE.envVar] = other
    expect(handle.load(root).docs_site).toBe('tools')
    delete env[CONFIG_FILE.envVar]
    expect(handle.load(root).docs_site).toBe('root')
  })

  test('while set, the root pair is not read at all and the derived overlay layers over the file', () => {
    write('tooly.yaml', 'docs_site: [broken\n')
    write('tooly.local.yaml', 'docs_site: [broken\n')
    const other = write('tools/tooly.yaml', 'docs_site: tools\n')
    write('tools/tooly.local.yaml', 'docs_site: tools-local\n')
    const handle = assembleConfig({
      file: CONFIG_FILE,
      sections: [docs],
      unknownTopLevel: 'reject',
      resolve: { env: { [CONFIG_FILE.envVar]: other } },
    })
    const layers = handle.loadLayers(root)
    expect(layers.merged.docs_site).toBe('tools-local')
    expect(layers.files).toEqual({
      project: other,
      local: join(root, 'tools', 'tooly.local.yaml'),
      source: 'env',
    })
  })

  test('a variable naming a missing file throws and names the path', () => {
    const handle = assembleConfig({
      file: CONFIG_FILE,
      sections: [docs],
      unknownTopLevel: 'reject',
      resolve: { env: { [CONFIG_FILE.envVar]: join(root, 'missing.yaml') } },
    })
    expect(() => handle.load(root)).toThrow(/missing\.yaml/)
    expect(() => handle.readLayers(root)).toThrow(ConfigInvalidError)
  })
})

describe('assembleConfig — unknownTopLevel', () => {
  const FILE =
    'docs_site: mine\nserver:\n  interval: not-a-number\n  surprise: true\nstranger: {anything: 1}\n'

  test("'ignore' mounts one section and returns it, whatever the unmounted blocks hold", () => {
    write('tooly.yaml', FILE)
    const handle = assembleConfig({
      file: CONFIG_FILE,
      sections: [docs],
      unknownTopLevel: 'ignore',
      resolve: NO_ENV,
    })
    expect(handle.load(root)).toEqual({ docs_site: 'mine' })
  })

  test("'reject' fails the same file with the shared exit code 14", () => {
    write('tooly.yaml', FILE)
    const handle = assembleConfig({
      file: CONFIG_FILE,
      sections: [docs],
      unknownTopLevel: 'reject',
      resolve: NO_ENV,
    })
    try {
      handle.load(root)
      throw new Error('expected a throw')
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigInvalidError)
      expect((e as ConfigInvalidError).exitCode).toBe(14)
      expect((e as ConfigInvalidError).message).toContain('Unrecognized key')
    }
  })

  test("'reject' on the full mount also fails a malformed mounted block", () => {
    write('tooly.yaml', 'server:\n  interval: not-a-number\n')
    const handle = assembleConfig({
      file: CONFIG_FILE,
      sections: [docs, server],
      unknownTopLevel: 'reject',
      resolve: NO_ENV,
    })
    expect(() => handle.load(root)).toThrow(/server\.interval/)
  })

  for (const unknownTopLevel of ['reject', 'ignore'] as const) {
    test(`an unknown key nested inside a mounted section fails under '${unknownTopLevel}'`, () => {
      write('tooly.yaml', 'limits:\n  implement: 1\n  surprise: true\n')
      const handle = assembleConfig({
        file: CONFIG_FILE,
        sections: [limits],
        unknownTopLevel,
        resolve: NO_ENV,
      })
      expect(() => handle.load(root)).toThrow(/Unrecognized key: "surprise"/)
    })

    test(`a present-but-invalid mounted section fails under '${unknownTopLevel}'`, () => {
      write('tooly.yaml', 'limits:\n  implement: -3\n')
      const handle = assembleConfig({
        file: CONFIG_FILE,
        sections: [limits],
        unknownTopLevel,
        resolve: NO_ENV,
      })
      expect(() => handle.load(root)).toThrow(ConfigInvalidError)
    })
  }

  test("under 'ignore' a file that is not a mapping still fails for every reader", () => {
    write('tooly.yaml', '- not\n- a mapping\n')
    const handle = assembleConfig({
      file: CONFIG_FILE,
      sections: [docs],
      unknownTopLevel: 'ignore',
      resolve: NO_ENV,
    })
    expect(() => handle.load(root)).toThrow(ConfigInvalidError)
  })
})

describe('assembleConfig — section hooks', () => {
  const guarded = defineConfigSection({
    key: 'guarded',
    schema: z
      .object({ path: z.string().default('in') })
      .strict()
      .prefault({})
      .describe('Guarded.'),
    fileSchema: z.object({ path: z.string().optional(), extra: z.string().optional() }).strict(),
    layerCheck: ({ project, value, projectRoot }) =>
      typeof project === 'object' && project !== null && 'path' in project
        ? [
            {
              path: 'guarded.path',
              message: `committed path set (value ${value?.path}, root ${projectRoot})`,
            },
          ]
        : [],
    meta: META,
  })

  test('layerCheck sees the raw project value, the parsed value and the root', () => {
    write('tooly.yaml', 'guarded:\n  path: out\n')
    const handle = assembleConfig({
      file: CONFIG_FILE,
      sections: [guarded],
      unknownTopLevel: 'reject',
      resolve: NO_ENV,
    })
    expect(() => handle.load(root)).toThrow(`committed path set (value out, root ${root})`)
  })

  test('layerCheck passes when only the overlay sets the value', () => {
    write('tooly.local.yaml', 'guarded:\n  path: out\n')
    const handle = assembleConfig({
      file: CONFIG_FILE,
      sections: [guarded],
      unknownTopLevel: 'reject',
      resolve: NO_ENV,
    })
    expect(handle.load(root).guarded.path).toBe('out')
  })

  describe('a key whose meta omits the project layer', () => {
    const localOnly = defineConfigSection({
      key: 'local_only',
      schema: z
        .object({ on: z.boolean().default(false) })
        .strict()
        .prefault({})
        .describe('Local only.'),
      meta: { ...META, layers: ['local'] },
    })
    const handle = assembleConfig({
      file: CONFIG_FILE,
      sections: [localOnly],
      unknownTopLevel: 'reject',
      resolve: NO_ENV,
    })

    test('is refused when the project file sets it', () => {
      write('tooly.yaml', 'local_only:\n  on: true\n')
      expect(() => handle.load(root)).toThrow(ConfigInvalidError)
      expect(() => handle.load(root)).toThrow('cannot be set in the project file')
    })

    test('loads when only the local overlay sets it', () => {
      write('tooly.local.yaml', 'local_only:\n  on: true\n')
      expect(handle.load(root).local_only.on).toBe(true)
    })
  })

  test('fileSchema swaps a section schema for single-file validation only', () => {
    const handle = assembleConfig({
      file: CONFIG_FILE,
      sections: [guarded],
      unknownTopLevel: 'reject',
      resolve: NO_ENV,
    })
    expect(handle.schema.safeParse({ guarded: { extra: 'x' } }).success).toBe(false)
    expect(handle.fileSchema.safeParse({ guarded: { extra: 'x' } }).success).toBe(true)
    expect(handle.fileSchema.safeParse({ guarded: { nope: 'x' } }).success).toBe(false)
  })

  test('crossFieldIssues runs over the merged config', () => {
    write('tooly.yaml', 'docs_site: bad\n')
    const handle = assembleConfig({
      file: CONFIG_FILE,
      sections: [docs],
      unknownTopLevel: 'reject',
      resolve: NO_ENV,
      crossFieldIssues: (c) =>
        c.docs_site === 'bad' ? [{ path: 'docs_site', message: 'no bad sites' }] : [],
    })
    expect(() => handle.load(root)).toThrow('docs_site: no bad sites')
  })
})

describe('readMappingFile', () => {
  test('absent, empty, mapping, non-mapping and unparsable files', () => {
    expect(readMappingFile(join(root, 'none.yaml'))).toMatchObject({ exists: false, data: null })
    expect(readMappingFile(write('empty.yaml', ''))).toMatchObject({ exists: true, data: {} })
    expect(readMappingFile(write('map.yaml', 'a: 1\n'))).toMatchObject({ data: { a: 1 } })
    expect(readMappingFile(write('list.yaml', '- 1\n'))).toMatchObject({
      data: null,
      problem: 'top level must be a mapping',
    })
    expect(readMappingFile(write('bad.yaml', 'a: [\n')).problem).toMatch(/^YAML parse error/)
  })

  test('json format parses JSON and says so', () => {
    expect(readMappingFile(write('c.json', '{"a": 2}'), { format: 'json' }).data).toEqual({ a: 2 })
    expect(readMappingFile(write('bad.json', '{"a":'), { format: 'json' }).problem).toMatch(
      /^JSON parse error/,
    )
  })
})

describe('readParsedFile', () => {
  test('a missing file is absent, not an error', () => {
    expect(readParsedFile(join(root, 'none.json'), 'json')).toEqual({
      kind: 'absent',
      path: join(root, 'none.json'),
    })
  })

  test('any parsed value is ok, whatever its type', () => {
    expect(readParsedFile(write('arr.json', '[1, 2]'), 'json')).toMatchObject({
      kind: 'ok',
      value: [1, 2],
    })
    expect(readParsedFile(write('n.yaml', '3\n'))).toMatchObject({ kind: 'ok', value: 3 })
  })

  test('a syntax error is unparsable and keeps the parser message', () => {
    const read = readParsedFile(write('bad.json', '{"a":'), 'json')
    expect(read.kind).toBe('unparsable')
    expect((read as { message: string }).message.length).toBeGreaterThan(0)
  })

  test('non-finite numbers read as their source text, as in the Rust crate', () => {
    const read = readParsedFile(write('inf.yaml', 'a: .inf\nb: -.inf\nc: .nan\nd: 1e999\ne: 1.5\n'))
    expect(read).toMatchObject({
      kind: 'ok',
      value: { a: '.inf', b: '-.inf', c: '.nan', d: '1e999', e: 1.5 },
    })
  })

  test('scalar keys read as strings; a collection or null key is unparsable', () => {
    expect(readParsedFile(write('k.yaml', '1: a\ntrue: b\n'))).toMatchObject({
      kind: 'ok',
      value: { '1': 'a', true: 'b' },
    })
    expect(readParsedFile(write('ck.yaml', '? [x]\n: c\n')).kind).toBe('unparsable')
    expect(readParsedFile(write('nk.yaml', '~: x\n')).kind).toBe('unparsable')
  })

  test('an alias key is the scalar it points at; an empty key is unparsable', () => {
    expect(readParsedFile(write('ak.yaml', 'a: &x k\nm:\n  *x : 1\n'))).toMatchObject({
      kind: 'ok',
      value: { a: 'k', m: { k: 1 } },
    })
    expect(readParsedFile(write('ek.yaml', '? \n: 1\n')).kind).toBe('unparsable')
    expect(readParsedFile(write('ack.yaml', 'a: &x [1]\nm:\n  *x : 1\n')).kind).toBe('unparsable')
  })

  test('a tag is dropped, its value kept, and nothing is printed to the process', async () => {
    const warnings: unknown[] = []
    const onWarning = (w: unknown) => warnings.push(w)
    process.on('warning', onWarning)
    try {
      expect(readParsedFile(write('tag.yaml', 'a: !custom x\n'))).toMatchObject({
        kind: 'ok',
        value: { a: 'x' },
      })
      await new Promise((r) => setTimeout(r, 10))
    } finally {
      process.off('warning', onWarning)
    }
    expect(warnings).toEqual([])
  })

  test('only true and false are booleans, and << is an ordinary key', () => {
    expect(
      readParsedFile(write('b.yaml', 'a: true\nc: yes\nbase: &b\n  x: 1\nm:\n  <<: *b\n  y: 2\n')),
    ).toMatchObject({
      kind: 'ok',
      value: { a: true, c: 'yes', m: { '<<': { x: 1 }, y: 2 } },
    })
  })

  test('an integer beyond 2^53 is a lossy number, and an empty document is null', () => {
    const big = readParsedFile(write('big.yaml', 'a: 12345678901234567890\n'))
    expect((big as { value: { a: number } }).value.a).toBe(Number('12345678901234567890'))
    expect(readParsedFile(write('empty.yaml', ''))).toMatchObject({ kind: 'ok', value: null })
  })

  test('a path that cannot be read as a file is unreadable', () => {
    mkdirSync(join(root, 'adir'))
    expect(readParsedFile(join(root, 'adir'), 'json').kind).toBe('unreadable')
  })
})

describe("assembleConfig — unknownTopLevel 'warn'", () => {
  let lines: string[]
  let restore: () => void
  beforeEach(() => {
    lines = []
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(((t: string | Uint8Array) => {
      lines.push(String(t))
      return true
    }) as typeof process.stderr.write)
    restore = () => spy.mockRestore()
  })
  afterEach(() => restore())

  const mount = () =>
    assembleConfig({
      file: CONFIG_FILE,
      sections: [docs, limits],
      unknownTopLevel: 'warn',
      resolve: NO_ENV,
    })

  test('drops a top-level and a nested unknown key, loads the known ones, leaves the file alone', () => {
    const text = 'docs_site: mine\nstranger: 1\nlimits:\n  implement: 2\n  surprise: true\n'
    const path = write('tooly.yaml', text)
    const layers = mount().loadLayers(root)
    expect(layers.merged).toEqual({ docs_site: 'mine', limits: { implement: 2, names: [] } })
    expect(layers.unknownKeys).toEqual([
      { file: path, path: 'limits.surprise' },
      { file: path, path: 'stranger' },
    ])
    expect(readFileSync(path, 'utf-8')).toBe(text)
  })

  test('attributes a key to the overlay file that sets it', () => {
    write('tooly.yaml', 'docs_site: mine\n')
    const local = write('tooly.local.yaml', 'limits:\n  surprise: 1\n')
    expect(mount().loadLayers(root).unknownKeys).toEqual([{ file: local, path: 'limits.surprise' }])
  })

  test('warns on stderr once per file and key, not once per load', () => {
    write('tooly.yaml', 'stranger: 1\nlimits:\n  surprise: true\n')
    const handle = mount()
    handle.load(root)
    expect(lines).toEqual([
      'tooly.yaml: unknown key limits.surprise ignored (a newer version, or a typo)\n',
      'tooly.yaml: unknown key stranger ignored (a newer version, or a typo)\n',
    ])
    handle.load(root)
    write('tooly.yaml', 'stranger: 1\nlimits:\n  surprise: true\n# edited\n')
    handle.load(root)
    expect(lines).toHaveLength(2)
  })

  test('a known key with an invalid value is still an error', () => {
    write('tooly.yaml', 'limits:\n  implement: -3\n  surprise: true\n')
    expect(() => mount().load(root)).toThrow(ConfigInvalidError)
    expect(() => mount().load(root)).toThrow(/limits\.implement/)
  })

  test('strictAt keeps an unknown key an error where it names the object', () => {
    write('tooly.yaml', 'limits:\n  surprise: true\n')
    const strict = assembleConfig({
      file: CONFIG_FILE,
      sections: [limits],
      unknownTopLevel: 'warn',
      strictAt: ['limits'],
      resolve: NO_ENV,
    })
    expect(() => strict.load(root)).toThrow(/Unrecognized key: "surprise"/)
  })

  test('a clean file warns about nothing', () => {
    write('tooly.yaml', 'docs_site: mine\n')
    mount().load(root)
    expect(lines).toEqual([])
  })
})

describe('assembleConfig — migrations', () => {
  let lines: string[]
  let restore: () => void
  beforeEach(() => {
    lines = []
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(((t: string | Uint8Array) => {
      lines.push(String(t))
      return true
    }) as typeof process.stderr.write)
    restore = () => spy.mockRestore()
  })
  afterEach(() => restore())

  // Version 1 had `limits.jobs` and a top-level `site`; version 2 renamed both.
  const migrations = defineMigrations([
    {
      to: 2,
      moves: [
        ['limits.jobs', 'limits.implement'],
        ['site', 'docs_site'],
      ],
    },
  ])
  const mount = (unknownTopLevel: 'reject' | 'warn' | 'ignore' = 'reject') =>
    assembleConfig({
      file: CONFIG_FILE,
      sections: [docs, limits],
      unknownTopLevel,
      resolve: NO_ENV,
      migrations,
    })

  const OLD = `# Project config.

site: www   # the published site

limits:
  # How many run at once.
  jobs: 3
  names: [a]
`

  test('an old file loads through the migrations in memory and is not rewritten', () => {
    const path = write('tooly.yaml', OLD)
    const layers = mount().loadLayers(root)
    expect(layers.merged).toEqual({ docs_site: 'www', limits: { implement: 3, names: ['a'] } })
    expect(layers.project).toEqual({
      docs_site: 'www',
      limits: { implement: 3, names: ['a'] },
      version: 2,
    })
    expect(layers.migrated).toEqual([
      {
        file: path,
        from: 1,
        to: 2,
        applied: [2],
        warnings: [
          { to: 2, message: "moved 'limits.jobs' to 'limits.implement'" },
          { to: 2, message: "moved 'site' to 'docs_site'" },
        ],
      },
    ])
    expect(readFileSync(path, 'utf-8')).toBe(OLD)
    expect(lines).toEqual([])
  })

  test('version is not a section key in any mode', () => {
    write('tooly.yaml', 'version: 2\ndocs_site: mine\n')
    for (const mode of ['reject', 'warn', 'ignore'] as const) {
      const layers = mount(mode).loadLayers(root)
      expect(layers.merged).toEqual({ docs_site: 'mine', limits: { implement: 5, names: [] } })
      expect(layers.unknownKeys).toEqual([])
      expect(layers.migrated).toEqual([])
    }
    expect(lines).toEqual([])
  })

  test('currentVersion is the last step, 1 with no step, and null when unversioned', () => {
    expect(mount().currentVersion).toBe(2)
    const opts = { file: CONFIG_FILE, sections: [docs], unknownTopLevel: 'reject' as const }
    expect(assembleConfig({ ...opts, migrations: [] }).currentVersion).toBe(1)
    expect(assembleConfig(opts).currentVersion).toBeNull()
  })

  test('files scaffolded at currentVersion load with no migration and migrate plans none', () => {
    // A step whose `run` is not idempotent: it must never see a file already in the new shape.
    const handle = assembleConfig({
      file: CONFIG_FILE,
      sections: [docs, limits],
      unknownTopLevel: 'reject',
      resolve: NO_ENV,
      migrations: defineMigrations([
        { to: 2, moves: [['site', 'docs_site']] },
        {
          to: 3,
          run: (raw) => {
            const limits = raw.limits as { implement?: number } | undefined
            if (limits?.implement !== undefined) limits.implement *= 2
            return raw
          },
        },
      ]),
    })
    const version = handle.currentVersion
    expect(version).toBe(3)
    const files = [
      scaffoldYaml(handle.fileSchema, ['# h'], { version }),
      starterYaml(handle.fileSchema, { header: ['# h'], categories: ['core'], version }),
    ]
    for (const text of files) {
      const path = write('tooly.yaml', text)
      write('tooly.local.yaml', scaffoldLocalYaml(handle.fileSchema, ['# l'], { version }))
      handle.clearCache()
      const layers = handle.loadLayers(root)
      expect(layers.migrated).toEqual([])
      expect(layers.merged.limits.implement).toBe(5)
      expect(handle.migrate(root, { dryRun: true })).toMatchObject([
        { path, from: 3, applied: [], text: null },
        { layer: 'local', from: 3, applied: [], text: null },
      ])
    }
    expect(lines).toEqual([])
  })

  test('a file scaffolded without version is read as version 1 and migrated', () => {
    const handle = mount()
    const path = write('tooly.yaml', scaffoldYaml(handle.fileSchema, ['# h']))
    expect(handle.loadLayers(root).migrated).toMatchObject([{ file: path, from: 1, to: 2 }])
  })

  test('without migrations, version is an ordinary key', () => {
    write('tooly.yaml', 'version: 2\n')
    const plain = assembleConfig({
      file: CONFIG_FILE,
      sections: [docs],
      unknownTopLevel: 'reject',
      resolve: NO_ENV,
    })
    expect(() => plain.load(root)).toThrow(/Unrecognized key: "version"/)
  })

  test('the overlay carries its own version and migrates on its own', () => {
    write('tooly.yaml', 'version: 2\nlimits:\n  implement: 1\n')
    const local = write('tooly.local.yaml', 'limits:\n  jobs: 7\n')
    const layers = mount().loadLayers(root)
    expect(layers.merged.limits.implement).toBe(7)
    expect(layers.migrated.map((m) => m.file)).toEqual([local])
  })

  test.each([['two'], ['0'], ['1.5'], ['[1]']])(
    'a version of %s is invalid, with exit 14',
    (value) => {
      write('tooly.yaml', `version: ${value}\n`)
      let err: unknown
      try {
        mount().load(root)
      } catch (e) {
        err = e
      }
      expect(err).toBeInstanceOf(ConfigInvalidError)
      expect((err as ConfigInvalidError).exitCode).toBe(CONFIG_INVALID_EXIT)
      expect((err as ConfigInvalidError).issues[0]!.path).toBe('version')
      expect((err as Error).message).toMatch(/must be an integer of at least 1/)
    },
  )

  test('a newer file is read as-is, with one line on stderr per handle', () => {
    write('tooly.yaml', 'version: 5\ndocs_site: mine\n')
    const handle = mount()
    expect(handle.load(root).docs_site).toBe('mine')
    handle.load(root)
    write('tooly.yaml', 'version: 5\ndocs_site: mine\n# edited\n')
    handle.load(root)
    expect(lines).toEqual(["tooly.yaml: version 5 is newer than this tool's 2; read as-is\n"])
  })

  test('a newer file that fails the schema says it is newer in the error', () => {
    write('tooly.yaml', 'version: 5\nfuture_section: 1\n')
    expect(() => mount().load(root)).toThrow(
      /Unrecognized key: "future_section"[\s\S]*version: tooly\.yaml: version 5 is newer than this tool's 2; read as-is/,
    )
    expect(lines).toEqual([])
  })

  test('a migrated file that is still invalid fails as any invalid file does', () => {
    write('tooly.yaml', 'limits:\n  jobs: -1\n')
    expect(() => mount().load(root)).toThrow(/limits\.implement/)
  })

  test('migrate rewrites each old file as edits, keeping its comments', () => {
    const project = write('tooly.yaml', OLD)
    const local = write('tooly.local.yaml', '# mine\nversion: 2\nlimits:\n  names: [b]\n')
    const handle = mount()
    expect(handle.load(root).limits.implement).toBe(3)
    // A moved key goes after its new parent's last key. A comment line of its
    // own, and blank lines, stay where they were.
    const migrated = `# Project config.


limits:
  # How many run at once.
  names: [a]
  implement: 3
docs_site: www
version: 2
`
    const results = handle.migrate(root, { dryRun: true })
    expect(results).toEqual([
      {
        layer: 'project',
        path: project,
        from: 1,
        to: 2,
        applied: [2],
        warnings: [
          { to: 2, message: "moved 'limits.jobs' to 'limits.implement'" },
          { to: 2, message: "moved 'site' to 'docs_site'" },
        ],
        written: false,
        rewrite: 'edited',
        text: migrated,
      },
      {
        layer: 'local',
        path: local,
        from: 2,
        to: 2,
        applied: [],
        warnings: [],
        written: false,
        rewrite: null,
        text: null,
      },
    ])
    expect(readFileSync(project, 'utf-8')).toBe(OLD)

    expect(handle.migrate(root).map((r) => r.written)).toEqual([true, false])
    expect(readFileSync(project, 'utf-8')).toBe(migrated)
    expect(readFileSync(local, 'utf-8')).toBe('# mine\nversion: 2\nlimits:\n  names: [b]\n')
    // The handle sees the rewrite at its next call, and reads the same config.
    const after = handle.loadLayers(root)
    expect(after.merged).toEqual({ docs_site: 'www', limits: { implement: 3, names: ['b'] } })
    expect(after.migrated).toEqual([])
    expect(handle.migrate(root).map((r) => r.applied)).toEqual([[], []])
  })

  test('migrate with no files does nothing', () => {
    expect(mount().migrate(root)).toEqual([])
  })

  test('migrate refuses, writing nothing, when any file is unusable', () => {
    const project = write('tooly.yaml', OLD)
    write('tooly.local.yaml', 'version: zero\n')
    expect(() => mount().migrate(root)).toThrow(ConfigInvalidError)
    expect(readFileSync(project, 'utf-8')).toBe(OLD)
    write('tooly.local.yaml', '- a list\n')
    expect(() => mount().migrate(root)).toThrow(/top level must be a mapping/)
    write('tooly.local.yaml', 'a: [\n')
    expect(() => mount().migrate(root)).toThrow(/YAML parse error/)
    expect(readFileSync(project, 'utf-8')).toBe(OLD)
  })

  test('migrate does not overwrite an edit saved after it read the file', () => {
    let path = ''
    const racy = assembleConfig({
      file: CONFIG_FILE,
      sections: [docs, limits],
      unknownTopLevel: 'reject',
      resolve: NO_ENV,
      migrations: defineMigrations([
        {
          to: 2,
          run: (raw) => {
            writeFileSync(path, 'docs_site: edited\n')
            return raw
          },
        },
      ]),
    })
    path = write('tooly.yaml', 'docs_site: old\n')
    expect(() => racy.migrate(root)).toThrow(WriteConflictError)
    expect(readFileSync(path, 'utf-8')).toBe('docs_site: edited\n')
  })

  test('a conflict on the overlay leaves the project file migrated; a second run finishes', () => {
    let edit: (() => void) | null = null
    const racy = assembleConfig({
      file: CONFIG_FILE,
      sections: [docs, limits],
      unknownTopLevel: 'reject',
      resolve: NO_ENV,
      migrations: defineMigrations([
        {
          to: 2,
          run: (raw) => {
            // The overlay is migrated second: save an edit to it while that runs.
            if (raw.docs_site === 'mine') edit?.()
            return raw
          },
        },
      ]),
    })
    const project = write('tooly.yaml', 'docs_site: old\n')
    const local = write('tooly.local.yaml', 'docs_site: mine\n')
    edit = () => writeFileSync(local, 'docs_site: mine\n# edited\n')
    expect(() => racy.migrate(root)).toThrow(WriteConflictError)
    expect(readFileSync(project, 'utf-8')).toBe('docs_site: old\nversion: 2\n')
    expect(readFileSync(local, 'utf-8')).toBe('docs_site: mine\n# edited\n')
    expect(racy.load(root).docs_site).toBe('mine')
    edit = null
    expect(racy.migrate(root).map((r) => r.written)).toEqual([false, true])
    expect(readFileSync(local, 'utf-8')).toBe('docs_site: mine\n# edited\nversion: 2\n')
  })

  test('without migrations, migrate applies nothing and writes nothing', () => {
    const path = write('tooly.yaml', 'docs_site: x\n')
    const plain = assembleConfig({
      file: CONFIG_FILE,
      sections: [docs],
      unknownTopLevel: 'reject',
      resolve: NO_ENV,
    })
    expect(plain.migrate(root)).toMatchObject([{ path, applied: [], written: false }])
  })
})

describe('pathMatcher', () => {
  const match = pathMatcher(['a.*.b', 'c.**'])
  test('* is one segment; a trailing ** is any depth, including none', () => {
    expect(match(['a', '0', 'b'])).toBe(true)
    expect(match(['a', 'b'])).toBe(false)
    expect(match(['c'])).toBe(true)
    expect(match(['c', 'x', 'y'])).toBe(true)
    expect(match(['d'])).toBe(false)
  })
})

describe('stripUnknownKeys — unions', () => {
  const branchA = z.object({ a: z.string().optional() }).strict()
  const branchB = z.object({ a: z.string().optional(), b: z.string().optional() }).strict()
  const schema = z.object({ entry: z.union([branchA, branchB]) }).strict()

  test('picks the branch that is missing the fewest keys', () => {
    // Against A the input has unknown `b` and `c`; against B only `c`.
    const out = stripUnknownKeys(schema, { entry: { b: 'x', c: 'y' } })
    expect(out.unknown).toEqual([['entry', 'c']])
    expect(out.value).toEqual({ entry: { b: 'x' } })
  })
})

describe('stripUnknownKeys — array elements', () => {
  const rule = z.object({ name: z.string() }).strict()
  const schema = z.object({ rules: z.array(rule) }).strict()
  const raw = { rules: [{ name: 'a' }, { name: 'b', extra: 1 }] }

  test('an unknown key in a list element is removed, its path carrying the index', () => {
    const out = stripUnknownKeys(schema, raw)
    expect(out.unknown).toEqual([['rules', '1', 'extra']])
    expect(out.value).toEqual({ rules: [{ name: 'a' }, { name: 'b' }] })
    expect(raw.rules[1]).toEqual({ name: 'b', extra: 1 })
  })

  test("keepStrict sees the index as a string, so 'rules.*' keeps the key", () => {
    const out = stripUnknownKeys(schema, raw, pathMatcher(['rules.*']))
    expect(out.unknown).toEqual([])
    expect(out.value).toBe(raw)
  })
})
