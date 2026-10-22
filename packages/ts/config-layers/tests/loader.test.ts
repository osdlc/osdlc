/**
 * `assembleConfig`: the layered loader every tool built on the library shares,
 * exercised against a tiny pair of sections and real files.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { z } from 'zod'

import { CONFIG_INVALID_EXIT, ConfigInvalidError } from '../src/config-error.ts'
import { assembleConfig, readMappingFile, readParsedFile } from '../src/loader.ts'
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
