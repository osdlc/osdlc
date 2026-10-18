import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'

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
      writeFileSync(join(dir, 'v2.yaml'), 'mcVersion: 2\nkind: contract\n')
      const r = await runCli(['migrate', 'v2.yaml', 'missing.yaml'], { cwd: dir })
      expect(r.code).toBe(2)
      expect(r.stderr).toContain('v2.yaml: not an mcVersion 1 document')
      expect(r.stderr).toContain('missing.yaml')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
