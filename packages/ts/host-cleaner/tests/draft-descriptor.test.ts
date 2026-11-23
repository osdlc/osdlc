/**
 * The drafting script: the first set drafted from the real corpus validates,
 * and a small corpus shows how each subject maps and what is left out.
 */

import { Ajv2020 } from 'ajv/dist/2020.js'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { parse, stringify } from 'yaml'

import {
  CORPUS_DIR,
  DraftError,
  FIRST_SET,
  draftStore,
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

describe('the first set, from the corpus', () => {
  test.each(FIRST_SET)('%s validates against the schema', (slug) => {
    const { text } = draftStore(CORPUS_DIR, slug)
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

  test('uv: three folders on macOS and Linux, its process, and .venv', () => {
    const { text } = draftStore(CORPUS_DIR, 'uv')
    const uv = read(text)
    expect(uv.paths).toEqual({
      cache: { macos: '~/.cache/uv', linux: '~/.cache/uv' },
      toolchains: { macos: '~/.local/share/uv/python', linux: '~/.local/share/uv/python' },
      packages: { macos: '~/.local/share/uv/tools', linux: '~/.local/share/uv/tools' },
    })
    expect(uv.candidates).toEqual([
      { path: 'cache', costDescription: 're-download' },
      { path: 'toolchains', costDescription: 're-download' },
      { path: 'packages', costDescription: 're-download' },
    ])
    expect(uv.detect).toEqual({
      any: [
        { onPath: 'uv' },
        { exists: 'cache' },
        { exists: 'toolchains' },
        { exists: 'packages' },
      ],
    })
    expect(uv.inUse).toEqual({ processes: ['uv'] })
    expect(uv.project).toEqual([
      { dir: '.venv', marker: 'pyproject.toml', costDescription: 're-download' },
    ])
    // The reviewer's material, as comments.
    expect(text).toMatch(/^# yaml-language-server: \$schema=https:\/\//)
    expect(text).toContain('# - uv cache prune: unused cache entries')
    expect(text).toContain('$UV_CACHE_DIR')
    expect(text).toContain('# - linux $XDG_CACHE_HOME/uv (cache): not a fixed folder')
  })

  test('pnpm leaves node_modules to the node plugin', () => {
    const { text } = draftStore(CORPUS_DIR, 'pnpm')
    expect(read(text)).not.toHaveProperty('project')
    expect(text).toContain('# - project node_modules: the node plugin covers it')
  })

  test('two folders that hold the same are told apart by name', () => {
    const hf = read(draftStore(CORPUS_DIR, 'huggingface-hub').text)
    expect(Object.keys(hf.paths)).toEqual(['models', 'cache-xet', 'cache-assets'])
    expect(hf.paths['models']).toEqual({ all: '~/.cache/huggingface/hub' })
    const gradle = read(draftStore(CORPUS_DIR, 'gradle').text)
    expect(gradle.candidates).toContainEqual({ path: 'logs', costDescription: 'lost' })
    expect(new Set(Object.keys(gradle.paths)).size).toBe(7)
  })
})

test('every store in the corpus drafts a valid descriptor, or says why not', () => {
  const slugs = readdirSync(join(CORPUS_DIR, 'stores')).map(
    (f) => /^slug: (.+)$/m.exec(readFileSync(join(CORPUS_DIR, 'stores', f), 'utf8'))?.[1] ?? f,
  )
  expect(slugs.length).toBeGreaterThan(FIRST_SET.length)
  for (const slug of slugs) {
    try {
      expect(descriptorIssues(parse(draftStore(CORPUS_DIR, slug).text)), slug).toEqual([])
    } catch (err) {
      expect(err, slug).toBeInstanceOf(DraftError)
    }
  }
})

describe('a small corpus', () => {
  let corpus: string

  beforeEach(() => {
    corpus = mkdtempSync(join(tmpdir(), 'hc-draft-'))
  })
  afterEach(() => {
    rmSync(corpus, { recursive: true, force: true })
  })

  const markdown = (fm: Record<string, unknown>) => `---\n${stringify(fm)}---\n\nBody.\n`

  /** A store file and one statement per subject, `current` unless the object says otherwise. */
  function store(
    title: string,
    fm: Record<string, unknown>,
    statements: Record<string, Record<string, unknown>>,
    status: Record<string, string> = {},
  ) {
    mkdirSync(join(corpus, 'stores'), { recursive: true })
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
            { path: '.tool/cache', marker: 'tool.json', holds: 'cache', rebuild: 'rebuild' },
            { path: 'out', holds: 'build-output', rebuild: 'rebuild' },
          ],
        },
      },
    )
    const { text } = draftStore(corpus, 'tool')
    expect(read(text).project).toEqual([
      { dir: 'target', marker: 'pom.xml', costDescription: 'rebuild' },
    ])
    expect(text).toContain('# - project node_modules: the node plugin covers it')
    expect(text).toContain('# - project target: the cargo plugin covers it')
    expect(text).toContain('# - project .tool/cache: a project entry names one folder, not a path')
    expect(text).toContain('# - project out: the corpus names no marker file')
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
})
