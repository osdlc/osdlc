/**
 * The drafting script: the first set drafted from the real corpus validates,
 * and a small corpus shows how each subject maps and what is left out.
 */

import { Ajv2020 } from 'ajv/dist/2020.js'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { parse, stringify } from 'yaml'

import {
  corpusDir,
  corpusOf,
  DraftError,
  FIRST_SET,
  draftStore,
  indexStores,
  wrap,
  writeDraft,
} from '../scripts/draft-descriptor.ts'
import { DESCRIPTOR_SCHEMA_FILE } from '../scripts/write-descriptor-schema.ts'
import { descriptorIssues } from '../src/descriptor/schema.ts'

const ajv = new Ajv2020({ allErrors: true, strict: false })
const jsonSchema = ajv.compile(JSON.parse(readFileSync(DESCRIPTOR_SCHEMA_FILE, 'utf8')))

const SCRIPT = fileURLToPath(new URL('../scripts/draft-descriptor.ts', import.meta.url))

type Drafted = {
  paths: Record<string, Record<string, string>>
  candidates: Record<string, unknown>[]
  inUse?: { processes?: string[]; locks?: string[] }
  project?: Record<string, unknown>[]
} & Record<string, unknown>

const read = (text: string): Drafted => parse(text) as Drafted

/** The real corpus, indexed once for every test that drafts from it. */
const realIndex = indexStores(corpusDir())

describe('the first set, from the corpus', () => {
  test.each(FIRST_SET)('%s validates against the schema', (slug) => {
    const { text } = draftStore(corpusDir(), slug, realIndex)
    const value = read(text)
    expect(descriptorIssues(value)).toEqual([])
    expect(jsonSchema(value), JSON.stringify(jsonSchema.errors)).toBe(true)
    expect(value.store).toBe(slug)
    for (const c of value.candidates) {
      expect(c).not.toHaveProperty('idleHours')
      expect(c).not.toHaveProperty('removes')
      expect(c).not.toHaveProperty('command')
    }
    expect(value).not.toHaveProperty('vars')
  })

  // What the corpus records changes with its research; these hold for any of
  // it. The small corpus below checks exact drafts.
  test.each(FIRST_SET)('%s: one candidate per folder, and no plugin-covered project', (slug) => {
    const { text } = draftStore(corpusDir(), slug, realIndex)
    const value = read(text)
    expect(text).toMatch(/^# yaml-language-server: \$schema=https:\/\//)
    expect(value.candidates.map((c) => c['path'])).toEqual(Object.keys(value.paths))
    const dirs = (value.project ?? []).map((p) => p['dir'])
    expect(dirs).not.toContain('node_modules')
    for (const p of value.project ?? []) expect(p['dir']).not.toMatch(/\.(c?js|json)$/)
  })
})

test('every store in the corpus drafts a valid descriptor, or says why not', () => {
  const slugs = [...realIndex.bySlug.keys()]
  expect(slugs.length).toBeGreaterThan(FIRST_SET.length)
  const drafted: string[] = []
  const failed: string[] = []
  for (const slug of slugs) {
    try {
      const { text } = draftStore(corpusDir(), slug, realIndex)
      expect(descriptorIssues(parse(text)), slug).toEqual([])
      drafted.push(slug)
    } catch (err) {
      expect(err, slug).toBeInstanceOf(DraftError)
      failed.push(slug)
    }
  }
  // Most stores name a fixed folder; a change that stops them drafting fails here.
  expect(drafted).toEqual(expect.arrayContaining([...FIRST_SET]))
  expect(drafted.length, `failed: ${failed.join(', ')}`).toBeGreaterThan(failed.length)
})

test('a corpus package that is not installed is a DraftError, not a stack trace', () => {
  expect(() => corpusOf('@osdlc/no-such-corpus')).toThrow(DraftError)
  expect(() => corpusOf('@osdlc/no-such-corpus')).toThrow(
    /^@osdlc\/no-such-corpus cannot be found \(.*\); pass --corpus <dir>$/,
  )
})

test('a comment line holds 78 characters; only the lines after the first are indented', () => {
  const word = (n: number) => 'x'.repeat(n)
  expect(wrap(`- ${word(75)}`, '  ')).toEqual([` - ${word(75)}`])
  expect(wrap(`- ${word(76)}`, '  ')).toEqual([' -', `   ${word(76)}`])
  expect(wrap(`${word(40)} ${word(36)}`)).toEqual([` ${word(40)} ${word(36)}`])
  for (const line of wrap(`- ${'abc '.repeat(60)}`, '  '))
    expect(line.length).toBeLessThanOrEqual(78)
})

describe('a small corpus', () => {
  let corpus: string

  beforeEach(() => {
    corpus = mkdtempSync(join(tmpdir(), 'hc-draft-'))
    for (const type of ['stores', 'statements']) mkdirSync(join(corpus, type))
    writeFileSync(join(corpus, 'small.corpus-schema.yaml'), 'corpus-schema: 0\nlevel: 2\n')
    writeFileSync(join(corpus, 'stores', 'stores.schema.yaml'), 'type: object\n')
    writeFileSync(
      join(corpus, 'statements', 'statements.schema.yaml'),
      'type: object\nproperties:\n  store: { type: string, x-ref: stores }\n',
    )
  })
  afterEach(() => {
    rmSync(corpus, { recursive: true, force: true })
  })

  const markdown = (fm: Record<string, unknown>) => `---\n${stringify(fm)}---\n\nBody.\n`

  /** A statement's `store:` link to the store file `title`, from `statements/<folder>/`. */
  const link = (title: string) => `[${title}](../../stores/${encodeURIComponent(title)}.md)`

  /** A store file and one statement per subject, `current` unless `status` says otherwise. */
  function store(
    title: string,
    fm: Record<string, unknown>,
    statements: Record<string, Record<string, unknown>>,
    status: Record<string, string> = {},
  ) {
    writeFileSync(join(corpus, 'stores', `${title}.md`), markdown(fm))
    const dir = join(corpus, 'statements', title)
    mkdirSync(dir, { recursive: true })
    for (const [subject, object] of Object.entries(statements))
      writeFileSync(
        join(dir, `${title} ${subject.replace('/', ' ')}.md`),
        markdown({
          proposition: { predicate: subject, object },
          status: status[subject] ?? 'current',
          open: [`about ${subject}`],
          store: link(title),
        }),
      )
  }

  test('folders are grouped across platforms, and variable ones are left out', () => {
    store(
      'Tool',
      { slug: 'tool', cli: 'tool sub', checked: '2026-01-01' },
      {
        'location/data-dirs': {
          dirs: [
            { platform: 'macos', path: '~/.tool/a', holds: 'cache', rebuild: 're-download' },
            { platform: 'linux', path: '~/.cache/tool', holds: 'cache', rebuild: 're-download' },
            { platform: 'linux', path: '~/.tool/a', holds: 'cache', rebuild: 're-download' },
            {
              platform: 'macos',
              path: '~/Library/Caches/tool',
              holds: 'cache',
              rebuild: 're-download',
            },
            { platform: 'linux', path: '$XDG_DATA_HOME/tool', holds: 'state', rebuild: 'rebuild' },
            {
              platform: 'windows',
              path: '%LOCALAPPDATA%\\tool',
              holds: 'cache',
              rebuild: 're-download',
            },
            { platform: 'all', path: '~/.tool/<VERSION>', holds: 'logs', rebuild: 'lost' },
            { platform: 'all', path: '~/.tool/logs', holds: 'logs', rebuild: 'lost' },
          ],
        },
      },
    )
    const { text } = draftStore(corpus, 'tool')
    const d = read(text)
    expect(d.paths).toEqual({
      'cache-a': { macos: '~/.tool/a', linux: '~/.tool/a' },
      'cache-tool': { macos: '~/Library/Caches/tool', linux: '~/.cache/tool' },
      logs: { all: '~/.tool/logs' },
    })
    expect(d.candidates).toEqual([
      { path: 'cache-a', costDescription: 're-download' },
      { path: 'cache-tool', costDescription: 're-download' },
      { path: 'logs', costDescription: 'lost' },
    ])
    expect(d.detect).toEqual({
      any: [
        { onPath: 'tool' },
        { exists: 'cache-a' },
        { exists: 'cache-tool' },
        { exists: 'logs' },
      ],
    })
    expect(text).toContain('stores/Tool.md (checked 2026-01-01)')
    expect(text).toContain(
      "# onPath tool is the first word of the corpus's cli, tool sub: keep it only if",
    )
    expect(text).toContain('# - linux $XDG_DATA_HOME/tool (state): not a fixed folder')
    expect(text).toContain('# - windows %LOCALAPPDATA%\\tool (cache): not a fixed folder')
    expect(text).toContain('# - all ~/.tool/<VERSION> (logs): not a fixed folder')
    expect(text).toContain('# - location/data-dirs: about location/data-dirs')
  })

  test('clean commands, overrides and inUse; idleHours and removes are never set', () => {
    store(
      'Tool',
      { slug: 'tool', system: true },
      {
        'location/data-dirs': {
          dirs: [
            { platform: 'linux', path: '/var/cache/tool', holds: 'cache', rebuild: 're-download' },
          ],
        },
        'clean/command': {
          supported: true,
          commands: [{ command: 'tool prune', removes: 'what nothing uses' }],
        },
        'location/override': { vars: ['TOOL_DIR'], settings: ['cacheDir'] },
        'liveness/in-use': {
          processes: ['toold'],
          locks: ['/var/cache/tool/lock', 'project/.lock', '~/.tool/locks/'],
        },
        'inventory/command': { supported: true, commands: [{ command: 'tool du', shows: 'size' }] },
      },
    )
    const { text } = draftStore(corpus, 'tool')
    const d = read(text)
    expect(d.system).toBe(true)
    expect(text).toContain('# Locks: check that each is gone once the tool exits.')
    expect(text).not.toContain('# No inUse')
    expect(d.candidates).toEqual([{ path: 'cache', costDescription: 're-download' }])
    expect(d.inUse).toEqual({ processes: ['toold'], locks: ['/var/cache/tool/lock'] })
    expect(d.detect).toEqual({ any: [{ exists: 'cache' }] })
    expect(text).toContain('# - tool prune: what nothing uses')
    expect(text).toContain('$TOOL_DIR, setting cacheDir')
    expect(text).toContain('# - lock project/.lock: not a fixed file path')
    expect(text).toContain('# - lock ~/.tool/locks/: not a fixed file path')
    expect(text).not.toContain('tool du')
    expect(text).not.toMatch(/^\s*(idleHours|removes|command):/m)
  })

  test('project entries skip what a code plugin covers and what one entry cannot name', () => {
    store(
      'Tool',
      { slug: 'tool' },
      {
        'location/data-dirs': {
          dirs: [{ platform: 'all', path: '~/.tool', holds: 'packages', rebuild: 're-download' }],
        },
        'project/build-dirs': {
          dirs: [
            {
              path: 'node_modules',
              marker: 'package.json',
              holds: 'packages',
              rebuild: 're-download',
            },
            { path: 'target', marker: 'Cargo.toml', holds: 'build-output', rebuild: 'rebuild' },
            { path: 'target', marker: 'pom.xml', holds: 'build-output', rebuild: 'rebuild' },
            {
              path: 'node_modules',
              marker: 'deno.json',
              holds: 'packages',
              rebuild: 're-download',
            },
            { path: '.tool/cache', marker: 'tool.json', holds: 'cache', rebuild: 'rebuild' },
            { path: 'out', holds: 'build-output', rebuild: 'rebuild' },
            { path: '.tool.cjs', marker: 'tool.json', holds: 'packages', rebuild: 'rebuild' },
          ],
        },
      },
    )
    const { text } = draftStore(corpus, 'tool')
    expect(read(text).project).toEqual([
      { dir: 'target', marker: 'pom.xml', costDescription: 'rebuild' },
      // The node plugin needs a package.json beside node_modules.
      { dir: 'node_modules', marker: 'deno.json', costDescription: 're-download' },
    ])
    expect(text).toContain('# - project node_modules: the node plugin covers it')
    expect(text.match(/node plugin covers/g)).toHaveLength(1)
    expect(text).toContain('# - project target: the cargo plugin covers it')
    expect(text).toContain('# - project .tool/cache: a project entry names one folder, not a path')
    expect(text).toContain('# - project out: the corpus names no marker file')
    expect(text).toContain('# - project .tool.cjs: looks like a file, not a folder')
    // deno's node_modules is kept, and the reviewer told the node plugin takes it beside a package.json.
    expect(text).toContain('# Project folders a built-in plugin also takes:')
    expect(text).toMatch(
      /# - project node_modules \(marker deno\.json\): the node plugin also takes\n#\s+node_modules where a package\.json sits/,
    )
  })

  test('a statement that is not current is not used', () => {
    store(
      'Tool',
      { slug: 'tool' },
      {
        'location/data-dirs': {
          dirs: [{ platform: 'all', path: '~/.tool', holds: 'cache', rebuild: 're-download' }],
        },
        'liveness/in-use': { processes: ['old'] },
      },
      { 'liveness/in-use': 'superseded' },
    )
    expect(read(draftStore(corpus, 'tool').text)).not.toHaveProperty('inUse')
  })

  test('a store with no fixed folder, or none at all, is a DraftError', () => {
    store(
      'Tool',
      { slug: 'tool' },
      {
        'location/data-dirs': {
          dirs: [
            {
              platform: 'linux',
              path: '$XDG_CACHE_HOME/tool',
              holds: 'cache',
              rebuild: 're-download',
            },
          ],
        },
      },
    )
    expect(() => draftStore(corpus, 'tool')).toThrow(/no data folder as a fixed path/)
    expect(() => draftStore(corpus, 'other')).toThrow(DraftError)
  })

  test('a corpus that is not as the corpus records it is a DraftError that names the file or field', () => {
    expect(() => draftStore(join(corpus, 'none'), 'tool')).toThrow(
      `${join(corpus, 'none')} is not a corpus of stores: .: (folder): cannot read (ENOENT)`,
    )
    store('Tool', { slug: 'tool' }, { 'location/data-dirs': { dirs: 'not a list' } })
    expect(() => draftStore(corpus, 'tool')).toThrow(
      new DraftError('tool: location/data-dirs: dirs is not a list'),
    )
    store('Tool', { slug: 'tool' }, { 'location/data-dirs': { dirs: [{ path: '~/.tool' }] } })
    expect(() => draftStore(corpus, 'tool')).toThrow(
      new DraftError('tool: location/data-dirs: dirs.0 is not what the corpus records'),
    )
    store(
      'Tool',
      { slug: 'tool' },
      {
        'location/data-dirs': {
          dirs: [{ platform: 'all', path: '~/.tool', holds: 'cache', rebuild: 're-download' }],
        },
        'location/override': { vars: [1] },
      },
    )
    expect(draftStore(corpus, 'tool').text).toContain(
      '# - location/override: vars.0 is not what the corpus records',
    )
    const statement = 'statements/Tool/broken.md'
    writeFileSync(
      join(corpus, statement),
      markdown({ status: 'current', proposition: 'location/data-dirs', store: link('Tool') }),
    )
    expect(() => draftStore(corpus, 'tool')).toThrow(
      new DraftError(
        `${statement}: a current statement needs a proposition with a predicate and an object`,
      ),
    )
    writeFileSync(join(corpus, statement), '---\nstatus: [current\n---\n')
    expect(() => draftStore(corpus, 'tool')).toThrow(`${statement}: (data): `)
  })

  const dirsOnly = (dirs: Record<string, unknown>[]) => ({ 'location/data-dirs': { dirs } })
  const dir = (platform: string, path: string, holds = 'cache', rebuild = 're-download') => ({
    platform,
    path,
    holds,
    rebuild,
  })

  test('a folder inside another is flagged, and a root or a file is left out', () => {
    store(
      'Tool',
      { slug: 'tool' },
      dirsOnly([
        dir('all', '~/.tool'),
        dir('all', '~/.tool/packages', 'packages'),
        dir('all', '~/'),
        dir('linux', '/'),
        dir('macos', '~/Library/tool/disk.raw', 'images', 'lost'),
      ]),
    )
    const { text } = draftStore(corpus, 'tool')
    expect(Object.keys(read(text).paths)).toEqual(['cache', 'packages'])
    expect(text).toContain('# - paths.packages is inside paths.cache: keep one')
    expect(text).not.toContain('paths.cache is inside')
    expect(text).toContain('# - all ~/ (cache): not a fixed folder')
    expect(text).toContain('# - linux / (cache): not a fixed folder')
    expect(text).toContain('# - macos ~/Library/tool/disk.raw (images): looks like a file')
  })

  test('folders on different platforms join the one that ends the same', () => {
    store(
      'Tool',
      { slug: 'tool' },
      dirsOnly([
        dir('macos', '~/Library/Tool/mlx/models', 'models'),
        dir('macos', '~/Library/Tool/llamacpp/models', 'models'),
        dir('linux', '~/.local/share/Tool/llamacpp/models', 'models'),
      ]),
    )
    expect(Object.values(read(draftStore(corpus, 'tool').text).paths)).toEqual([
      { macos: '~/Library/Tool/mlx/models' },
      { macos: '~/Library/Tool/llamacpp/models', linux: '~/.local/share/Tool/llamacpp/models' },
    ])
  })

  test('a folder that ends the same is not shut out by one met earlier', () => {
    store(
      'Tool',
      { slug: 'tool' },
      dirsOnly([
        dir('linux', '~/.cache/tool'),
        dir('macos', '~/Library/Application Support/tool/blobs'),
        dir('macos', '~/Library/Caches/tool'),
      ]),
    )
    expect(Object.values(read(draftStore(corpus, 'tool').text).paths)).toEqual([
      { macos: '~/Library/Caches/tool', linux: '~/.cache/tool' },
      { macos: '~/Library/Application Support/tool/blobs' },
    ])
  })

  test('folders that end in none of the same segments are joined, and named for the reviewer', () => {
    store(
      'Tool',
      { slug: 'tool' },
      dirsOnly([
        dir('macos', '~/Library/Application Support/tool/blobs'),
        dir('linux', '~/.local/share/other/models'),
        dir('all', '~/.tool/logs', 'logs', 'lost'),
      ]),
    )
    const { text } = draftStore(corpus, 'tool')
    expect(read(text).paths['cache']).toEqual({
      macos: '~/Library/Application Support/tool/blobs',
      linux: '~/.local/share/other/models',
    })
    expect(text).toContain('# Joined across platforms though their names differ')
    expect(text).toContain(
      '# - paths.cache: macos ~/Library/Application Support/tool/blobs, linux\n#   ~/.local/share/other/models',
    )
    expect(text).not.toContain('paths.logs:')
  })

  test('folders match in any case across platforms, and nest in any case but on linux', () => {
    store(
      'Tool',
      { slug: 'tool' },
      dirsOnly([
        dir('linux', '~/.cache/yarn'),
        dir('macos', '~/Library/Caches/Other'),
        dir('macos', '~/Library/Caches/Yarn'),
        dir('macos', '~/Library/caches/yarn/v6', 'packages'),
        dir('linux', '~/.Tool', 'state'),
        dir('linux', '~/.tool/x', 'logs'),
      ]),
    )
    const { text } = draftStore(corpus, 'tool')
    const d = read(text)
    expect(Object.values(d.paths)).toContainEqual({
      macos: '~/Library/Caches/Yarn',
      linux: '~/.cache/yarn',
    })
    expect(text).not.toContain('Joined across platforms')
    expect(text).toContain('# - paths.packages is inside paths.cache-yarn: keep one')
    // linux tells case apart.
    expect(text).not.toContain('paths.logs is inside')
  })

  test('two groups that name one folder are flagged', () => {
    store(
      'Tool',
      { slug: 'tool' },
      dirsOnly([dir('all', '~/.tool'), dir('linux', '~/.tool/', 'packages')]),
    )
    const { text } = draftStore(corpus, 'tool')
    expect(text).toContain('# - paths.cache and paths.packages name one folder: keep one')
    expect(text).not.toContain('is inside')
  })

  test('a scoped statement is named for the reviewer', () => {
    store(
      'Tool',
      { slug: 'tool' },
      { ...dirsOnly([dir('all', '~/.tool')]), 'liveness/in-use': { processes: ['tool.exe'] } },
    )
    const file = join(corpus, 'statements', 'Tool', 'Tool liveness in-use.md')
    writeFileSync(
      file,
      markdown({
        proposition: { predicate: 'liveness/in-use', object: { processes: ['tool.exe'] } },
        status: 'current',
        scope: { since: null, until: null, platform: ['windows'] },
        store: link('Tool'),
      }),
    )
    const { text } = draftStore(corpus, 'tool')
    expect(text).toContain('# - liveness/in-use: {"platform":["windows"]}')
    expect(text).not.toContain('location/data-dirs: {')
  })

  test('the entries of an unsupported clean command are not checked', () => {
    store(
      'Tool',
      { slug: 'tool' },
      {
        ...dirsOnly([dir('all', '~/.tool')]),
        'clean/command': { supported: false, commands: [{ command: 'tool gc' }] },
      },
    )
    expect(draftStore(corpus, 'tool').text).toContain('# - none')
  })

  test('a folder with no stores, or an index of another corpus, is refused', () => {
    store('Tool', { slug: 'tool' }, dirsOnly([dir('all', '~/.tool')]))
    expect(() => draftStore(corpusDir(), 'tool', indexStores(corpus))).toThrow(
      `the index is of ${corpus}, not of ${corpusDir()}`,
    )
    rmSync(join(corpus, 'stores'), { recursive: true })
    expect(() => indexStores(corpus)).toThrow(`${corpus} is not a corpus of stores`)
  })

  test('entries the schema would refuse are a DraftError or left out, never a bad draft', () => {
    store('Tool', { slug: 'tool' }, dirsOnly([dir('all', '~/.tool', 'cache', 'regenerate')]))
    expect(() => draftStore(corpus, 'tool')).toThrow(/dirs\.0 is not what the corpus records/)
    store('Tool', { slug: 'tool' }, dirsOnly([dir('all', '~/.tool', 'build output')]))
    expect(() => draftStore(corpus, 'tool')).toThrow(/dirs\.0 is not what the corpus records/)
    store('Tool', { slug: 'tool', cli: ['a', 'b'] }, dirsOnly([dir('all', '~/.tool')]))
    expect(() => draftStore(corpus, 'tool')).toThrow(/cli is not a string/)
    store(
      'Tool',
      { slug: 'tool' },
      {
        ...dirsOnly([dir('all', '~/.tool')]),
        'project/build-dirs': {
          dirs: [
            { path: 'out', marker: 'src/tool.json', holds: 'build-output', rebuild: 'rebuild' },
            { path: 'gen', marker: '{,pom.xml}', holds: 'build-output', rebuild: 'rebuild' },
            { path: 'obj', marker: '{.,x}', holds: 'build-output', rebuild: 'rebuild' },
          ],
        },
        'clean/command': { supported: false, commands: [{ command: 'tool gc', removes: 'all' }] },
      },
    )
    const { text } = draftStore(corpus, 'tool')
    expect(read(text)).not.toHaveProperty('project')
    expect(text).toContain('# - project out (marker src/tool.json): marker must be a file name')
    expect(text).toContain('# - project gen (marker {,pom.xml}): marker must be a file name')
    expect(text).toContain('# - project obj (marker {.,x}): marker must be a file name')
    expect(text).toContain('# - none')
    expect(text).not.toContain('tool gc')
  })

  test("a store with no slug is named by its slug's error, not another field's", () => {
    writeFileSync(
      join(corpus, 'stores', 'stores.schema.yaml'),
      'type: object\nproperties:\n  homepage: { type: string }\n  slug: { type: string }\n',
    )
    writeFileSync(join(corpus, 'stores', 'Other.md'), markdown({ homepage: 5 }))
    writeFileSync(join(corpus, 'stores', 'Tool.md'), markdown({ homepage: 5, slug: 3 }))
    expect(() => draftStore(corpus, 'tool')).toThrow(
      '(with no slug: stores/Other.md: no slug; stores/Tool.md: slug: must be string)',
    )
  })

  test('stores are read once: a broken store file only matters when nothing else matches', () => {
    store('Tool', { slug: 'tool' }, dirsOnly([dir('all', '~/.tool')]))
    writeFileSync(join(corpus, 'stores', 'Aaa.md'), 'no front matter\n')
    writeFileSync(join(corpus, 'stores', 'Bom.md'), `﻿${markdown({ slug: 'bom' })}`)
    const index = indexStores(corpus)
    expect([...index.bySlug.keys()].sort()).toEqual(['bom', 'tool'])
    expect(() => draftStore(corpus, 'tool', index)).not.toThrow()
    expect(() => draftStore(corpus, 'other', index)).toThrow(
      'with no slug: stores/Aaa.md: no slug)',
    )
    writeFileSync(join(corpus, 'stores', 'Tool2.md'), markdown({ slug: 'tool' }))
    expect(() => draftStore(corpus, 'tool')).toThrow(
      'more than one store has slug tool: stores/Tool.md, stores/Tool2.md',
    )
  })

  test('two current statements of one subject is a DraftError', () => {
    store('Tool', { slug: 'tool' }, dirsOnly([dir('all', '~/.tool')]))
    writeFileSync(
      join(corpus, 'statements', 'Tool', 'again.md'),
      markdown({
        proposition: { predicate: 'location/data-dirs', object: { dirs: [] } },
        status: 'current',
        store: link('Tool'),
      }),
    )
    expect(() => draftStore(corpus, 'tool')).toThrow(/is also the current statement of location/)
  })

  test('a folder of locks is left out of inUse, and a lock file kept', () => {
    store(
      'Tool',
      { slug: 'tool' },
      {
        ...dirsOnly([dir('all', '~/.tool')]),
        'liveness/in-use': {
          locks: ['~/.tool/repository/.locks', '~/.tool/install-locks', '~/.tool/tool.lock'],
        },
      },
    )
    const { text } = draftStore(corpus, 'tool')
    expect(read(text).inUse).toEqual({ locks: ['~/.tool/tool.lock'] })
    expect(text).toContain('# - lock ~/.tool/repository/.locks: a folder of locks')
    expect(text).toContain('# - lock ~/.tool/install-locks: a folder of locks')
    store(
      'Bare',
      { slug: 'bare' },
      { ...dirsOnly([dir('all', '~/.bare')]), 'liveness/in-use': { locks: ['~/.bare/locks'] } },
    )
    const bare = draftStore(corpus, 'bare').text
    expect(read(bare)).not.toHaveProperty('inUse')
    expect(bare).toContain('# No inUse: nothing here tells that the tool is running.')
  })

  test('an entry the corpus lists twice is one folder and one candidate', () => {
    store(
      'Tool',
      { slug: 'tool' },
      dirsOnly([
        dir('all', '~/.tool'),
        dir('all', '~/.tool'),
        dir('linux', '~/.cache/tool', 'state'),
        dir('linux', '~/.cache/tool', 'state'),
        dir('macos', '~/Library/tool', 'state'),
      ]),
    )
    const d = read(draftStore(corpus, 'tool').text)
    expect(d.paths).toEqual({
      cache: { all: '~/.tool' },
      state: { macos: '~/Library/tool', linux: '~/.cache/tool' },
    })
    expect(d.candidates).toHaveLength(2)
  })

  test('a malformed side subject item is left out, and the draft still made', () => {
    store(
      'Tool',
      { slug: 'tool' },
      {
        ...dirsOnly([dir('all', '~/.tool')]),
        'clean/command': {
          supported: true,
          commands: [{ command: 'tool gc' }, { command: 'tool prune', removes: 'unused' }],
        },
        'project/build-dirs': {
          dirs: [{ path: 'out', marker: null, holds: 'build-output', rebuild: 'rebuild' }],
        },
        'location/override': { vars: 'TOOL_DIR', settings: ['cacheDir'] },
      },
    )
    const { text } = draftStore(corpus, 'tool')
    expect(text).toContain('# - location/override: vars is not a list')
    expect(text).toContain('setting cacheDir')
    expect(text).toContain('# - tool prune: unused')
    expect(text).toContain('# - clean/command: commands.0 is not what the corpus records')
    expect(text).toContain('# - project/build-dirs: dirs.0 is not what the corpus records')
    expect(read(text)).not.toHaveProperty('project')
  })

  test('statements are found by their store link, not by their folder', () => {
    store('Tool', { slug: 'tool' }, {})
    store('Other', { slug: 'other' }, dirsOnly([dir('all', '~/.other')]))
    const elsewhere = join(corpus, 'statements', 'Renamed')
    mkdirSync(elsewhere)
    writeFileSync(
      join(elsewhere, 'dirs.md'),
      markdown({
        proposition: { predicate: 'location/data-dirs', object: { dirs: [dir('all', '~/.tool')] } },
        status: 'current',
        store: link('Tool'),
      }),
    )
    writeFileSync(
      join(corpus, 'statements', 'Tool', 'stray.md'),
      markdown({
        proposition: { predicate: 'liveness/in-use', object: { processes: ['other'] } },
        status: 'current',
        store: link('Other'),
      }),
    )
    const d = read(draftStore(corpus, 'tool').text)
    expect(d.paths).toEqual({ cache: { all: '~/.tool' } })
    expect(d).not.toHaveProperty('inUse')
    store('Lone', { slug: 'lone' }, {})
    expect(() => draftStore(corpus, 'lone')).toThrow(
      "lone: no statement's store: links to stores/Lone.md",
    )
  })

  test('a current statement that links to no store is named, and refused in the folder of its store', () => {
    store('Tool', { slug: 'tool' }, dirsOnly([dir('all', '~/.tool')]))
    store('Lone', { slug: 'lone' }, {})
    const elsewhere = join(corpus, 'statements', 'Renamed')
    mkdirSync(elsewhere)
    const stray = (status: string) =>
      markdown({
        proposition: { predicate: 'liveness/in-use', object: { processes: ['tool'] } },
        status,
        store: link('Gone'),
      })
    writeFileSync(join(elsewhere, 'stray.md'), stray('current'))
    writeFileSync(join(elsewhere, 'old.md'), stray('superseded'))
    // A stray in another store's folder is that store's, and named only there.
    store('Other', { slug: 'other' }, dirsOnly([dir('all', '~/.other')]))
    writeFileSync(join(corpus, 'statements', 'Other', 'gone.md'), stray('current'))
    const { text } = draftStore(corpus, 'tool')
    expect(text).toContain("# Statements not read, which may be this store's:")
    expect(text).toContain('# - statements/Renamed/stray.md: ')
    expect(text).not.toContain('old.md')
    expect(text).not.toContain('statements/Other/')
    expect(() => draftStore(corpus, 'lone')).toThrow(
      /^lone: .* \(linked to no store: statements\/Renamed\/stray\.md: [^;]*\)$/,
    )
    expect(() => draftStore(corpus, 'other')).toThrow(/^statements\/Other\/gone\.md: /)
    writeFileSync(join(corpus, 'statements', 'Tool', 'stray.md'), stray('current'))
    expect(() => draftStore(corpus, 'tool')).toThrow(/^statements\/Tool\/stray\.md: /)
  })

  test('one whole draft', () => {
    store(
      'Big Tool',
      { slug: 'big-tool', cli: 'big', checked: '2026-01-01' },
      {
        ...dirsOnly([
          dir('linux', '~/.cache/big'),
          dir('macos', '~/Library/Caches/big'),
          dir('all', '~/.big/models', 'models', 'lost'),
        ]),
        'clean/command': {
          supported: true,
          commands: [{ command: 'big prune', removes: 'what nothing uses' }],
        },
        'liveness/in-use': { processes: ['bigd'] },
        'project/build-dirs': {
          dirs: [{ path: '.big', marker: 'big.json', holds: 'build-output', rebuild: 'rebuild' }],
        },
      },
    )
    expect(draftStore(corpus, 'big-tool').text).toBe(`\
# yaml-language-server: $schema=https://unpkg.com/@osdlc/host-cleaner/schemas/descriptor-1.json
# Drafted from the system-cleanup corpus, stores/Big Tool.md (checked
# 2026-01-01). Review it before it ships: set idleHours where it should differ
# from the config, choose glob or held per candidate, and add a command with
# removes where the tool has one that can be pointed at the folder.

# Clean commands in the corpus. A command must name the folder with a
# {path} argument or an env entry, and set removes (unused or all):
# - big prune: what nothing uses

# Open in the corpus:
# - clean/command: about clean/command
# - liveness/in-use: about liveness/in-use
# - location/data-dirs: about location/data-dirs
# - project/build-dirs: about project/build-dirs

descriptor: 1
store: big-tool
detect:
  any:
    - { onPath: big }
    - { exists: cache }
    - { exists: models }
paths:
  cache: { macos: ~/Library/Caches/big, linux: ~/.cache/big }
  models: { all: ~/.big/models }
candidates:
  # holds cache
  - path: cache
    costDescription: re-download
  # holds models
  - path: models
    costDescription: lost
inUse:
  processes:
    - bigd
project:
  - { dir: .big, marker: big.json, costDescription: rebuild }
`)
  })

  test('writing keeps a file that is there, unless forced', () => {
    store(
      'Tool',
      { slug: 'tool' },
      {
        'location/data-dirs': {
          dirs: [{ platform: 'all', path: '~/.tool', holds: 'cache', rebuild: 're-download' }],
        },
      },
    )
    const draft = draftStore(corpus, 'tool')
    const out = join(corpus, 'out')
    const file = writeDraft(out, draft)
    expect(file).toBe(join(out, 'tool.yaml'))
    writeFileSync(file, 'reviewed\n')
    expect(() => writeDraft(out, draft)).toThrow(/exists; pass --force/)
    expect(readFileSync(file, 'utf8')).toBe('reviewed\n')
    writeDraft(out, draft, true)
    expect(readFileSync(file, 'utf8')).toBe(draft.text)
  })

  test('writing without force creates the file, or fails: a link to no file is not followed', () => {
    store('Tool', { slug: 'tool' }, dirsOnly([dir('all', '~/.tool')]))
    const out = join(corpus, 'out')
    mkdirSync(out)
    symlinkSync(join(corpus, 'target.yaml'), join(out, 'tool.yaml'))
    expect(() => writeDraft(out, draftStore(corpus, 'tool'))).toThrow(/exists; pass --force/)
    expect(existsSync(join(corpus, 'target.yaml'))).toBe(false)
  })
})

describe('the command line', () => {
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' })

  test('prints one draft', () => {
    const r = run('pip')
    expect(r.status).toBe(0)
    expect(descriptorIssues(parse(r.stdout))).toEqual([])
  })

  test('needs --out for more than one store, and fails for an unknown one', () => {
    expect(run('pip', 'npm').status).toBe(2)
    expect(run().status).toBe(2)
    const r = run('no-such-store')
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('no store with slug no-such-store')
  })

  test('a slug given twice is drafted once', () => {
    const out = mkdtempSync(join(tmpdir(), 'hc-draft-out-'))
    try {
      const r = run('--out', out, 'pip', 'pip')
      expect(r.status, r.stderr).toBe(0)
      expect(r.stdout.match(/^wrote /gm)).toHaveLength(1)
      expect(readdirSync(out)).toEqual(['pip.yaml'])
    } finally {
      rmSync(out, { recursive: true, force: true })
    }
  })

  test('runs when started through a symlink', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hc-draft-link-'))
    try {
      const linked = join(dir, 'draft-descriptor.ts')
      symlinkSync(SCRIPT, linked)
      const r = spawnSync(process.execPath, [linked, 'pip'], { encoding: 'utf8' })
      expect(r.status, r.stderr).toBe(0)
      expect(r.stdout).toContain('store: pip')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('an unknown flag is a usage error, not a stack trace', () => {
    const r = run('--bogus', 'pip')
    expect(r.status).toBe(2)
    expect(r.stderr).toContain("Unknown option '--bogus'")
    expect(r.stderr).toContain('usage: draft-descriptor')
    expect(r.stderr).not.toContain('    at ')
  })
})
