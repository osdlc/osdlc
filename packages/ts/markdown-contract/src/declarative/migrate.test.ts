import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import { parse as parseYaml, parseAllDocuments } from 'yaml'

import { runCli } from '../cli/index.js'
import { loadContract } from './index.js'
import { migrateV1ToV2 } from './migrate.js'

const V1_DIR = fileURLToPath(new URL('../../tests/fixtures/migrate/', import.meta.url))
const CORPUS = fileURLToPath(new URL('../../corpus/', import.meta.url))

interface ManifestEntry {
  contract: string | null
  cases: { source: string }[]
}
const manifest = JSON.parse(
  readFileSync(join(CORPUS, 'corpus-manifest.json'), 'utf8'),
) as ManifestEntry[]

/** The version 1 form of each corpus contract, from before the corpus moved to version 2. */
const v1Files = readdirSync(V1_DIR).filter((f) => f.endsWith('.contract.yaml'))

const brief = (findings: { id: string; level: string; pos?: { line: number } }[]) =>
  findings.map((f) => ({ id: f.id, level: f.level, line: f.pos?.line }))

describe('migrateV1ToV2 over the corpus contracts', () => {
  it('has version 1 fixtures', () => {
    expect(v1Files.length).toBeGreaterThan(40)
  })

  for (const file of v1Files) {
    it(`${file}: migrates, loads, and gives the version 2 contract's findings`, () => {
      const v1 = readFileSync(join(V1_DIR, file), 'utf8')
      const { out } = migrateV1ToV2(v1, file)
      expect(parseYaml(out).mcVersion).toBe(2)
      const migrated = loadContract(out)
      const current = loadContract(readFileSync(join(CORPUS, file), 'utf8'))
      const entry = manifest.find((e) => e.contract === file)
      expect(entry, `manifest entry for ${file}`).toBeDefined()
      for (const c of entry?.cases ?? []) {
        const source = readFileSync(join(CORPUS, c.source), 'utf8')
        expect(brief(migrated.validate(source, { path: 'x.md' }).findings)).toEqual(
          brief(current.validate(source, { path: 'x.md' }).findings),
        )
      }
    })
  }
})

describe('migrateV1ToV2 spellings and errors', () => {
  it('inverts required fields and renames v1 keys', () => {
    const { out, warnings } = migrateV1ToV2(
      [
        'mcVersion: 1',
        'kind: contract',
        '# a comment survives',
        'frontmatter:',
        '  strict: true',
        '  fields:',
        '    title: { type: string, min: 1 }',
        '    count: { type: number, int: true, optional: true }',
        'body:',
        '  allowUnknown: true',
        '  sections:',
        '    - section: Notes',
        '      optional: true',
        '',
      ].join('\n'),
      'a.yaml',
    )
    expect(warnings).toEqual([])
    expect(out).toContain('# a comment survives')
    expect(parseYaml(out)).toEqual({
      mcVersion: 2,
      kind: 'contract',
      frontmatter: {
        type: 'object',
        required: ['title'],
        additionalProperties: false,
        properties: {
          title: { type: 'string', minLength: 1 },
          count: { type: 'integer' },
        },
      },
      body: {
        additionalSections: true,
        sections: [{ section: 'Notes', minContains: 0, maxContains: 1 }],
      },
    })
  })

  it('drops bounds beside a format, which version 1 ignored, with a warning', () => {
    const { out, warnings } = migrateV1ToV2(
      'mcVersion: 1\nkind: contract\nfrontmatter:\n  fields:\n    when: { type: string, format: date, min: 3 }\n',
      'b.yaml',
    )
    expect(parseYaml(out).frontmatter.properties.when).toEqual({ type: 'string', format: 'date' })
    expect(warnings).toEqual([
      "b.yaml: contract.frontmatter.when: dropped 'min' (version 1 ignored it beside 'format'; version 2 would apply it)",
    ])
  })

  it('migrates the inline contracts of a config', () => {
    const { out } = migrateV1ToV2(
      "mcVersion: 1\nkind: config\nrules:\n  - include: ['**/*.md']\n    contract:\n      body:\n        allowUnknown: false\n",
      'c.yaml',
    )
    expect(parseYaml(out).rules[0].contract.body).toEqual({ additionalSections: false })
  })

  it('refuses a document that is not version 1, or not a mapping', () => {
    expect(() => migrateV1ToV2('mcVersion: 2\nkind: contract\n', 'd.yaml')).toThrow(
      'd.yaml: not an mcVersion 1 document',
    )
    expect(() => migrateV1ToV2('- a\n', 'e.yaml')).toThrow('e.yaml: not a YAML mapping')
    expect(() => migrateV1ToV2('mcVersion: 1\nkind: other\n', 'f.yaml')).toThrow(
      'f.yaml: unknown kind "other"',
    )
  })
})

describe('markdown-contract migrate', () => {
  const V1 = 'mcVersion: 1\nkind: contract\nbody:\n  sections:\n    - section: Summary\n'

  it('prints the migrated file, or rewrites it with --write', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'markdown-contract-migrate-'))
    try {
      writeFileSync(join(dir, 'a.contract.yaml'), V1)
      const printed = await runCli(['migrate', 'a.contract.yaml'], { cwd: dir })
      expect(printed.code).toBe(0)
      expect(parseYaml(printed.stdout).mcVersion).toBe(2)
      expect(readFileSync(join(dir, 'a.contract.yaml'), 'utf8')).toBe(V1)

      const written = await runCli(['migrate', '--write', 'a.contract.yaml'], { cwd: dir })
      expect(written).toEqual({ code: 0, stdout: 'migrated: a.contract.yaml', stderr: '' })
      expect(() => loadContract(readFileSync(join(dir, 'a.contract.yaml'), 'utf8'))).not.toThrow()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('exits 2 with no file, or with a file it cannot migrate', async () => {
    expect((await runCli(['migrate'])).code).toBe(2)
    const dir = mkdtempSync(join(tmpdir(), 'markdown-contract-migrate-'))
    try {
      writeFileSync(join(dir, 'other.yaml'), 'mcVersion: 1\nkind: other\n')
      const r = await runCli(['migrate', 'other.yaml', 'missing.yaml'], { cwd: dir })
      expect(r.code).toBe(2)
      expect(r.stderr).toContain('other.yaml: unknown kind "other"')
      expect(r.stderr).toContain('missing.yaml')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reports a file that is already version 2 and keeps the exit code at 0', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'markdown-contract-migrate-'))
    try {
      writeFileSync(join(dir, 'a.contract.yaml'), V1)
      writeFileSync(join(dir, 'v2.contract.yaml'), 'mcVersion: 2\nkind: contract\n')
      const r = await runCli(['migrate', '--write', 'a.contract.yaml', 'v2.contract.yaml'], {
        cwd: dir,
      })
      expect(r.code).toBe(0)
      expect(r.stdout).toBe('migrated: a.contract.yaml')
      expect(r.stderr).toBe('v2.contract.yaml: already version 2')
      expect(readFileSync(join(dir, 'v2.contract.yaml'), 'utf8')).toBe(
        'mcVersion: 2\nkind: contract\n',
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('separates several documents with a --- line and the file name when not writing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'markdown-contract-migrate-'))
    try {
      writeFileSync(join(dir, 'a.contract.yaml'), V1)
      writeFileSync(join(dir, 'b.contract.yaml'), V1)
      const r = await runCli(['migrate', 'a.contract.yaml', 'b.contract.yaml'], { cwd: dir })
      expect(r.code).toBe(0)
      const docs = parseAllDocuments(r.stdout).map((d) => d.toJS() as { mcVersion: number })
      expect(docs.map((d) => d.mcVersion)).toEqual([2, 2])
      expect(r.stdout).toContain('# a.contract.yaml')
      expect(r.stdout).toContain('# b.contract.yaml')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('does not print or write a result that version 2 cannot load, and exits 2', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'markdown-contract-migrate-'))
    try {
      const bad = [
        'mcVersion: 1',
        'kind: contract',
        'frontmatter:',
        '  fields:',
        '    status: { enum: [open, closed], nullable: true }',
        '',
      ].join('\n')
      writeFileSync(join(dir, 'bad.contract.yaml'), bad)
      const r = await runCli(['migrate', '--write', 'bad.contract.yaml'], { cwd: dir })
      expect(r.code).toBe(2)
      expect(r.stdout).toBe('')
      expect(r.stderr).toContain('bad.contract.yaml: the migrated file does not load')
      expect(readFileSync(join(dir, 'bad.contract.yaml'), 'utf8')).toBe(bad)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('names the file and the YAML error when the text is not valid YAML', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'markdown-contract-migrate-'))
    try {
      writeFileSync(join(dir, 'broken.yaml'), 'mcVersion: 1\nkind: [contract\n')
      const r = await runCli(['migrate', 'broken.yaml'], { cwd: dir })
      expect(r.code).toBe(2)
      expect(r.stderr).toContain('broken.yaml: invalid YAML')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('validates a migrated config without following its contract file refs', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'markdown-contract-migrate-'))
    try {
      writeFileSync(
        join(dir, 'markdown-contract.yaml'),
        [
          'mcVersion: 1',
          'kind: config',
          'contracts:',
          '  note: ./note.contract.yaml',
          'rules:',
          '  - include: ["*.md"]',
          '    contract: note',
          '',
        ].join('\n'),
      )
      const r = await runCli(['migrate', 'markdown-contract.yaml'], { cwd: dir })
      expect(r.code).toBe(0)
      expect(parseYaml(r.stdout).mcVersion).toBe(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('migrateV1ToV2 branches the corpus contracts do not use', () => {
  const migrate = (fields: string) =>
    migrateV1ToV2(
      `mcVersion: 1\nkind: contract\nfrontmatter:\n  fields:\n${fields}\nbody:\n  sections: []\n`,
      'f.yaml',
    )
  const fm = (raw: string, source: string) =>
    loadContract(raw)
      .validate(source, { path: 'x.md' })
      .findings.map((f) => f.id)

  it('keeps null on an int field that is also nullable', () => {
    const { out, warnings } = migrate('    n: { type: number, int: true, nullable: true }')
    expect(warnings).toEqual([])
    expect(parseYaml(out).frontmatter.properties.n.type).toEqual(['integer', 'null'])
    expect(fm(out, '---\nn: null\n---\n')).toEqual([])
    expect(fm(out, '---\nn: 3\n---\n')).toEqual([])
    expect(fm(out, '---\nn: 1.5\n---\n')).toEqual(['frontmatter/type'])
  })

  it('keeps the base type of a nullable string with bounds', () => {
    const { out } = migrate('    s: { type: string, min: 2, max: 4, nullable: true }')
    const s = parseYaml(out).frontmatter.properties.s
    expect(s).toEqual({ type: ['string', 'null'], minLength: 2, maxLength: 4 })
    expect(fm(out, '---\ns: null\n---\n')).toEqual([])
  })

  it('renames min and max on numbers and arrays, and of to items', () => {
    const { out } = migrate(
      '    n: { type: number, min: 1, max: 9 }\n    a: { type: array, of: { type: string }, min: 1, max: 2 }',
    )
    const p = parseYaml(out).frontmatter.properties
    expect(p.n).toEqual({ type: 'number', minimum: 1, maximum: 9 })
    expect(p.a).toEqual({ type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 2 })
  })

  it('drops min, max and pattern beside a format, with a warning for each', () => {
    const { out, warnings } = migrate('    d: { type: string, format: date, min: 3, pattern: "x" }')
    expect(parseYaml(out).frontmatter.properties.d).toEqual({ type: 'string', format: 'date' })
    expect(warnings).toHaveLength(2)
  })

  it('drops an inert optional on a table cell and a list item, with a warning', () => {
    const v1 = [
      'mcVersion: 1',
      'kind: contract',
      'body:',
      '  sections:',
      '    - section: Files',
      '      content:',
      '        table:',
      '          columns: [Path]',
      '          cells:',
      '            Path: { type: string, optional: true }',
      '    - section: Todo',
      '      content:',
      '        list:',
      '          everyItem: { type: string, optional: true }',
      '',
    ].join('\n')
    const { out, warnings } = migrateV1ToV2(v1, 'f.yaml')
    expect(warnings).toHaveLength(2)
    expect(() => loadContract(out)).not.toThrow()
  })

  it('drops occurrence keys beside a gap, with a warning', () => {
    const v1 =
      'mcVersion: 1\nkind: contract\nbody:\n  sections:\n    - gap: {}\n      optional: true\n'
    const { out, warnings } = migrateV1ToV2(v1, 'f.yaml')
    expect(warnings).toHaveLength(1)
    expect(() => loadContract(out)).not.toThrow()
  })

  describe('section occurrence', () => {
    const body = (node: string) =>
      migrateV1ToV2(
        `mcVersion: 1\nkind: contract\nbody:\n  sections:\n    - section: S\n${node}\n`,
        'f.yaml',
      )
    const doc = (n: number) => Array.from({ length: n }, () => '## S\n\nx\n').join('\n')
    const ids = (out: string, n: number) =>
      loadContract(out)
        .validate(doc(n), { path: 'x.md' })
        .findings.map((f) => f.id)

    it('optional becomes zero or one', () => {
      const { out } = body('      optional: true')
      expect(ids(out, 0)).toEqual([])
      expect(ids(out, 1)).toEqual([])
    })

    it('repeatable with min and max becomes a counted slot', () => {
      const { out } = body('      repeatable: true\n      min: 2\n      max: 3')
      expect(parseYaml(out).body.sections[0]).toMatchObject({ minContains: 2, maxContains: 3 })
      expect(ids(out, 1)).toEqual(['structure/repeat-count'])
      expect(ids(out, 2)).toEqual([])
      expect(ids(out, 4)).toEqual(['structure/repeat-count'])
    })

    it('optional and repeatable allows none and warns when a minimum above 0 is lost', () => {
      const { out, warnings } = body('      optional: true\n      repeatable: true\n      min: 2')
      expect(warnings).toHaveLength(1)
      expect(ids(out, 0)).toEqual([])
    })
  })
})
