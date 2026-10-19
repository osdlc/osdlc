/**
 * Peer unit tests for `inferConfig` single-contract core. The gating truth is
 * `tests/fixtures/infer` (accept-by-construction + deterministic over real vaults); these add
 * direct, fast assertions over the model an in-memory vault produces — base-type frontmatter,
 * the required list, order detection, additionalProperties, naming, and the emitted YAML.
 * The emitted vocabulary is mcVersion 2.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { parse } from 'yaml'
import type { InferredContract } from './infer.js'
import { inferConfig } from './infer.js'
import { compileContractObject } from './load.js'

let root: string

/** Write one `*.md` into the temp vault, creating intermediate dirs. */
function file(rel: string, body: string): void {
  const abs = join(root, rel)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, body, 'utf8')
}

/** The single contract's `def` (the v2 vocabulary), typed loosely for direct property reads. */
function def(c: InferredContract): {
  frontmatter?: {
    type?: string
    required?: string[]
    additionalProperties?: boolean
    properties?: Record<string, Record<string, unknown>>
  }
  body?: {
    order?: string
    additionalSections?: boolean
    sections?: Array<{
      section: string
      aliases?: string[]
      minContains?: number
      maxContains?: number
    }>
  }
} {
  return c.def as never
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'mc-infer-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('inferConfig — single-contract mode shape', () => {
  it('emits one contract in single mode named after the root basename slug', () => {
    file('a.md', '---\ntitle: A\n---\n\n## Summary\n\nx\n')
    const r = inferConfig(root)
    expect(r.mode).toBe('single')
    expect(r.contracts).toHaveLength(1)
    expect(r.contracts[0]!.include).toEqual(['**/*.md'])
    // The temp dir basename slugs to lowercase-with-dashes.
    expect(r.contracts[0]!.name).toMatch(/^[a-z0-9-]+$/)
    expect(r.warnings).toEqual([])
  })

  it('recurses into subdirectories (single mode is the whole subtree)', () => {
    file('top.md', '## Summary\n\nx\n')
    file('nested/deep.md', '## Summary\n\ny\n')
    const r = inferConfig(root)
    // Summary appears in every (both) files → required, present.
    expect(def(r.contracts[0]!).body?.sections).toEqual([{ section: 'Summary' }])
  })
})

describe('inferConfig — sections: universal required, the rest counted optional', () => {
  it('splits universal vs partial sections and closes the unknown door', () => {
    file('one.md', '## Summary\n\nx\n\n## Context\n\nx\n')
    file('two.md', '## Summary\n\nx\n')
    const body = def(inferConfig(root).contracts[0]!).body!
    expect(body.additionalSections).toBe(false)
    expect(body.sections).toContainEqual({ section: 'Summary' })
    expect(body.sections).toContainEqual({ section: 'Context', minContains: 0, maxContains: 1 })
  })
})

describe('inferConfig — order detection', () => {
  it('strict when every file has the identical gap-free sequence', () => {
    file('one.md', '## A\n\nx\n\n## B\n\nx\n')
    file('two.md', '## A\n\nx\n\n## B\n\nx\n')
    const body = def(inferConfig(root).contracts[0]!).body!
    expect(body.order).toBe('strict')
    expect(body.sections!.map((s) => s.section)).toEqual(['A', 'B'])
  })

  it('recognized-relative when files agree on relative order of differing subsets', () => {
    file('one.md', '## A\n\nx\n\n## B\n\nx\n')
    file('two.md', '## A\n\nx\n\n## C\n\nx\n')
    file('three.md', '## B\n\nx\n\n## C\n\nx\n')
    const body = def(inferConfig(root).contracts[0]!).body!
    expect(body.order).toBe('recognized-relative')
    // A topological order: A before B before C (a linear extension of every file).
    expect(body.sections!.map((s) => s.section)).toEqual(['A', 'B', 'C'])
  })

  it('none when two files disagree on order', () => {
    file('one.md', '## A\n\nx\n\n## B\n\nx\n')
    file('two.md', '## B\n\nx\n\n## A\n\nx\n')
    expect(def(inferConfig(root).contracts[0]!).body!.order).toBe('none')
  })
})

describe('inferConfig — frontmatter required list + additionalProperties', () => {
  it('required = present in every file; partial keys stay off the required list', () => {
    file('one.md', '---\ntitle: A\nstatus: open\n---\n\n## S\n\nx\n')
    file('two.md', '---\ntitle: B\n---\n\n## S\n\nx\n')
    const fm = def(inferConfig(root).contracts[0]!).frontmatter!
    expect(fm.type).toBe('object')
    expect(fm.additionalProperties).toBe(false)
    expect(fm.required).toEqual(['title'])
    expect(fm.properties!.title).toEqual({ type: 'string' })
    // `status` is present in only one file → optional (off the required list); one example is
    // below the default min-const-examples floor (3), so it is NOT pinned as a const — it
    // falls to a plain string.
    expect(fm.properties!.status).toEqual({ type: 'string' })
  })

  it('--min-const-examples 1 restores pinning a single-example uniform field as const', () => {
    file('one.md', '---\ntitle: A\nstatus: open\n---\n\n## S\n\nx\n')
    file('two.md', '---\ntitle: B\n---\n\n## S\n\nx\n')
    const fm = def(inferConfig(root, { minConstExamples: 1 }).contracts[0]!).frontmatter!
    expect(fm.properties!.status).toEqual({ const: 'open' })
    expect(fm.required).toEqual(['title']) // status stays optional-by-absence
  })

  it('picks the tightest type that admits every observed value (the value ladder)', () => {
    file('one.md', '---\nn: 1\nb: true\narr: [x, y]\ns: hello\n---\n\n## S\n\nx\n')
    file('two.md', '---\nn: 2\nb: false\narr: [z]\ns: 2026-01-01\n---\n\n## S\n\nx\n')
    const properties = def(inferConfig(root).contracts[0]!).frontmatter!.properties!
    // All-integer numbers → integer; booleans → boolean; arrays → array of loose element.
    expect(properties.n).toEqual({ type: 'integer' })
    expect(properties.b).toEqual({ type: 'boolean' })
    expect(properties.arr).toEqual({ type: 'array', items: { type: 'string' } })
    // `hello` matches no format and the set is too small to enum (2 distinct ≥ half of 2) → string.
    expect(properties.s).toEqual({ type: 'string' })
  })

  it('--relax opens the frontmatter object and the body floor', () => {
    file('one.md', '---\ntitle: A\n---\n\n## A\n\nx\n\n## B\n\nx\n')
    file('two.md', '---\ntitle: B\n---\n\n## A\n\nx\n\n## B\n\nx\n')
    const c = inferConfig(root, { relax: true }).contracts[0]!
    expect(def(c).frontmatter!.additionalProperties).toBeUndefined()
    expect(def(c).body!.order).toBe('none')
    expect(def(c).body!.additionalSections).toBe(true)
  })
})

describe('inferConfig — value-type ladder', () => {
  /** Six files exercising the ladder, so the rung-6 enum ratio (< half of 6) is satisfiable. */
  function ladderVault(): void {
    for (let i = 1; i <= 6; i++) {
      const severity = i % 2 === 0 ? 'high' : 'low'
      file(
        `f${i}.md`,
        `---\nkind: policy\nversion: ${i}\nactive: ${i % 2 === 0}\n` +
          `created: 2024-0${i}-0${i}\nseverity: ${severity}\ntitle: Doc ${i}\n---\n\n## Body\n\nx\n`,
      )
    }
  }

  it('walks const → integer → boolean → format → enum → string', () => {
    ladderVault()
    const properties = def(inferConfig(root).contracts[0]!).frontmatter!.properties!
    expect(properties.kind).toEqual({ const: 'policy' }) // rung 1 — uniform
    expect(properties.version).toEqual({ type: 'integer' }) // rung 2 — all integers
    expect(properties.active).toEqual({ type: 'boolean' }) // rung 3
    expect(properties.created).toEqual({ type: 'string', format: 'date' }) // rung 5 — ISO dates
    expect(properties.severity).toEqual({ enum: ['low', 'high'] }) // rung 6 — small closed set
    expect(properties.title).toEqual({ type: 'string' }) // rung 7 — all-distinct free-form
  })

  it('--relax drops rung 6: a categorical field stays a plain string', () => {
    ladderVault()
    const properties = def(inferConfig(root, { relax: true }).contracts[0]!).frontmatter!
      .properties!
    expect(properties.severity).toEqual({ type: 'string' })
    // The tighter, non-categorical rungs still fire under --relax.
    expect(properties.kind).toEqual({ const: 'policy' })
    expect(properties.created).toEqual({ type: 'string', format: 'date' })
  })

  it('non-integer numbers → number (not integer)', () => {
    file('a.md', '---\nratio: 1.5\n---\n\n## S\n\nx\n')
    file('b.md', '---\nratio: 2\n---\n\n## S\n\nx\n')
    const properties = def(inferConfig(root).contracts[0]!).frontmatter!.properties!
    expect(properties.ratio).toEqual({ type: 'number' })
  })
})

describe('inferConfig — const string-length cap', () => {
  /** N files each carrying the same `<key>: <value>` frontmatter line. */
  function repeat(n: number, key: string, value: string): void {
    for (let i = 0; i < n; i++) file(`f${i}.md`, `---\n${key}: ${value}\n---\n\n## S\n\nx\n`)
  }

  it('pins a uniform short string as const', () => {
    repeat(3, 'label', 'draft') // 5 chars, uniform across 3 docs (clears the floor) → const
    expect(def(inferConfig(root).contracts[0]!).frontmatter!.properties!.label).toEqual({
      const: 'draft',
    })
  })

  it('a uniform string longer than the cap falls through to a plain string', () => {
    repeat(3, 'note', `"${'x'.repeat(65)}"`) // 65 > default cap 64
    expect(def(inferConfig(root).contracts[0]!).frontmatter!.properties!.note).toEqual({
      type: 'string',
    })
  })

  it('the cap is inclusive: a string of exactly the cap length is still const', () => {
    const atCap = 'a'.repeat(64)
    repeat(3, 'k', `"${atCap}"`)
    expect(def(inferConfig(root).contracts[0]!).frontmatter!.properties!.k).toEqual({
      const: atCap,
    })
  })

  it('--max-const-len 0 disables string const; numeric const is untouched', () => {
    for (let i = 0; i < 3; i++) file(`f${i}.md`, '---\ns: hi\nn: 5\n---\n\n## S\n\nx\n')
    const properties = def(inferConfig(root, { maxConstStringLength: 0 }).contracts[0]!)
      .frontmatter!.properties!
    expect(properties.s).toEqual({ type: 'string' }) // every non-empty string is over a 0 cap
    expect(properties.n).toEqual({ const: 5 }) // the cap is string-only
  })

  it('excludes a field from enum when any observed value is over the cap', () => {
    // 6 docs, 2 distinct values → would enum (2*2 < 6), but one value is over-length so rung 6 is skipped.
    for (let i = 0; i < 6; i++) {
      const v = i % 2 === 0 ? 'short' : `"${'y'.repeat(70)}"`
      file(`g${i}.md`, `---\ntag: ${v}\n---\n\n## S\n\nx\n`)
    }
    expect(def(inferConfig(root).contracts[0]!).frontmatter!.properties!.tag).toEqual({
      type: 'string',
    })
  })
})

describe('inferConfig — min-const-examples floor', () => {
  function repeat(n: number, key: string, value: string): void {
    for (let i = 0; i < n; i++) file(`f${i}.md`, `---\n${key}: ${value}\n---\n\n## S\n\nx\n`)
  }

  it('does not pin a uniform field seen in fewer than 3 docs (default floor)', () => {
    repeat(2, 'kind', 'policy') // uniform, but only 2 examples < 3
    expect(def(inferConfig(root).contracts[0]!).frontmatter!.properties!.kind).toEqual({
      type: 'string',
    })
  })

  it('pins a uniform field once seen in exactly 3 docs (the boundary)', () => {
    repeat(3, 'kind', 'policy')
    expect(def(inferConfig(root).contracts[0]!).frontmatter!.properties!.kind).toEqual({
      const: 'policy',
    })
  })

  it('a uniform date below the floor falls to format, not const', () => {
    repeat(2, 'created', '2026-06-21')
    expect(def(inferConfig(root).contracts[0]!).frontmatter!.properties!.created).toEqual({
      type: 'string',
      format: 'date',
    })
  })

  it('--min-const-examples 1 pins on a single example', () => {
    repeat(1, 'kind', 'policy')
    expect(
      def(inferConfig(root, { minConstExamples: 1 }).contracts[0]!).frontmatter!.properties!.kind,
    ).toEqual({ const: 'policy' })
  })
})

describe('inferConfig — nullable fields (accept-by-construction)', () => {
  it('an all-null field infers a nullable string placeholder (not a bare string that rejects null)', () => {
    file('a.md', '---\nparent: null\n---\n\n## S\n\nx\n')
    file('b.md', '---\nparent: null\n---\n\n## S\n\nx\n')
    expect(def(inferConfig(root).contracts[0]!).frontmatter!.properties!.parent).toEqual({
      type: ['string', 'null'],
    })
  })

  it('a field mixing null and non-null infers the non-null type, paired with null', () => {
    file('a.md', '---\nn: 1\n---\n\n## S\n\nx\n')
    file('b.md', '---\nn: null\n---\n\n## S\n\nx\n')
    // 'n' is present in both files (one null) → required; the non-null value is an integer.
    expect(def(inferConfig(root).contracts[0]!).frontmatter!.properties!.n).toEqual({
      type: ['integer', 'null'],
    })
  })

  it('a nullable field never pins const/enum (no v2 spelling) — it loosens to the base type', () => {
    // Uniform "policy" across 3 docs would pin const, but the 4th doc's null forces the
    // type-union spelling — and v2 cannot pair a const/enum base with "null".
    for (const [i, v] of ['policy', 'policy', 'policy', 'null'].entries()) {
      file(`f${i}.md`, `---\nkind: ${v}\n---\n\n## S\n\nx\n`)
    }
    expect(def(inferConfig(root).contracts[0]!).frontmatter!.properties!.kind).toEqual({
      type: ['string', 'null'],
    })
  })
})

describe('inferConfig — meta mode', () => {
  /** A name→include map over a meta result's contracts, for order-independent assertions. */
  function includes(cs: InferredContract[]): Record<string, string[]> {
    return Object.fromEntries(cs.map((c) => [c.name, c.include]))
  }

  it('depth 1 → one recursive contract per top-level subdir, full-path slug names', () => {
    file('api/orders.md', '## Request\n\nx\n')
    file('guides/intro.md', '## Overview\n\nx\n')
    const r = inferConfig(root, { meta: true })
    expect(r.mode).toBe('meta')
    expect(r.contracts.map((c) => c.name).sort()).toEqual(['api', 'guides'])
    expect(includes(r.contracts)).toEqual({
      api: ['api/**/*.md'],
      guides: ['guides/**/*.md'],
    })
    expect(r.warnings).toEqual([])
  })

  it('depth 2 → full relative-path slug names (api/v1 → api-v1), no nested contracts', () => {
    file('api/v1/users.md', '## Request\n\nx\n')
    file('api/v2/users.md', '## Request\n\nx\n')
    file('web/v1/home.md', '## Overview\n\nx\n')
    const r = inferConfig(root, { meta: true, depth: 2 })
    expect(r.contracts.map((c) => c.name).sort()).toEqual(['api-v1', 'api-v2', 'web-v1'])
    expect(includes(r.contracts)['api-v1']).toEqual(['api/v1/**/*.md'])
    expect(includes(r.contracts)['web-v1']).toEqual(['web/v1/**/*.md'])
  })

  it('files directly in the root get a direct-only `*.md` root contract', () => {
    file('about.md', '## Overview\n\nx\n')
    file('guides/setup.md', '## Steps\n\nx\n')
    const r = inferConfig(root, { meta: true })
    const rootContract = r.contracts.find((c) => c.include.includes('*.md'))
    expect(rootContract).toBeDefined()
    expect(rootContract!.include).toEqual(['*.md']) // direct-only, never **/*.md
    expect(includes(r.contracts)['guides']).toEqual(['guides/**/*.md'])
  })

  it('warns (does not nest) for a file stranded above a depth ≥ 2 cut', () => {
    file('api/overview.md', '## Overview\n\nx\n') // depth 1 — above the depth-2 cut
    file('api/v1/users.md', '## Request\n\nx\n')
    const r = inferConfig(root, { meta: true, depth: 2 })
    expect(r.warnings.length).toBeGreaterThan(0)
    expect(r.warnings.join('\n')).toContain('api/overview.md')
    // No contract is an ancestor of another (no `api/**` wrapping `api/v1/**`).
    expect(r.contracts.map((c) => c.name)).toEqual(['api-v1'])
  })

  it('emits a meta-config registry plus one contract file per group', () => {
    file('api/orders.md', '## Request\n\nx\n')
    file('guides/intro.md', '## Overview\n\nx\n')
    const r = inferConfig(root, { meta: true })
    const paths = r.files.map((f) => f.path).sort()
    expect(paths).toEqual([
      'contracts/api.contract.yaml',
      'contracts/guides.contract.yaml',
      'markdown-contract.yaml',
    ])
    const cfg = parse(r.files.find((f) => f.path === 'markdown-contract.yaml')!.content) as {
      kind: string
      contracts: Record<string, string>
      rules: Array<{ include: string[]; contract: string }>
    }
    expect(cfg.kind).toBe('config')
    expect(cfg.contracts.api).toBe('./contracts/api.contract.yaml')
    expect(cfg.rules.map((rule) => rule.contract).sort()).toEqual(['api', 'guides'])
  })

  it('--inline emits one self-contained config with inline contract defs', () => {
    file('api/orders.md', '## Request\n\nx\n')
    file('guides/intro.md', '## Overview\n\nx\n')
    const r = inferConfig(root, { meta: true, inline: true })
    expect(r.files.map((f) => f.path)).toEqual(['markdown-contract.yaml'])
    const cfg = parse(r.files[0]!.content) as {
      rules: Array<{ include: string[]; contract: Record<string, unknown> }>
    }
    expect(cfg.rules.every((rule) => typeof rule.contract === 'object')).toBe(true)
  })
})

describe('inferConfig — heading key-collision handling', () => {
  // Two spellings that differ only by case both generate the camelCase key `scheduleForToday`.
  // Across separate docs they are the same logical section: collapse to ONE aliased slot + warn.
  it('merges case-variant headings across docs into one aliased section, with a warning', () => {
    file('mon.md', '## Schedule For today\n\nx\n')
    file('tue.md', '## Schedule For Today\n\nx\n')
    const r = inferConfig(root)
    expect(def(r.contracts[0]!).body!.sections).toEqual([
      { section: 'Schedule For today', aliases: ['Schedule For Today'] },
    ])
    expect(r.warnings).toHaveLength(1)
    expect(r.warnings[0]).toContain('scheduleForToday')
    expect(r.warnings[0]).toMatch(/merged variant headings/)
  })

  // Accept-by-construction: the merged contract must accept BOTH spellings with no error finding.
  it('the merged contract accepts both spellings (no error findings)', () => {
    file('mon.md', '## Schedule For today\n\nx\n')
    file('tue.md', '## Schedule For Today\n\nx\n')
    const contract = compileContractObject(inferConfig(root).contracts[0]!.def)
    const a = contract.validate('## Schedule For today\n\nx\n', { path: 'a.md' })
    const b = contract.validate('## Schedule For Today\n\nx\n', { path: 'b.md' })
    expect(a.findings.filter((f) => f.level === 'error')).toEqual([])
    expect(b.findings.filter((f) => f.level === 'error')).toEqual([])
  })

  // The one case that cannot merge: both spellings as PEERS in a single doc would make the merged
  // slot match twice (structure/duplicate-section). That is fatal — abort, naming the file.
  it('aborts with a descriptive error when key-colliding headings are peers in one doc', () => {
    file('both.md', '## Schedule For today\n\nx\n\n## Schedule For Today\n\nx\n')
    expect(() => inferConfig(root)).toThrow(/both\.md/)
    expect(() => inferConfig(root)).toThrow(/scheduleForToday/)
    expect(() => inferConfig(root)).toThrow(/Schedule For today.*Schedule For Today/)
  })

  // A heading with no alphanumeric content generates no key, so it can never collide.
  it('does not treat keyless headings (no alphanumerics) as a collision', () => {
    file('a.md', '## ---\n\nx\n')
    file('b.md', '## ***\n\nx\n')
    const r = inferConfig(root)
    expect(r.warnings).toEqual([])
    expect(r.contracts[0]!.def).toBeDefined()
  })
})

describe('inferConfig — repeatable-slot inference', () => {
  it('infers minContains: 1 (repeatable, no upper bound) for a heading repeated as peers within one doc', () => {
    file('a.md', '## Entry\n\nx\n\n## Entry\n\ny\n')
    const r = inferConfig(root)
    expect(def(r.contracts[0]!).body!.sections).toEqual([{ section: 'Entry', minContains: 1 }])
    // Not a spurious variant-merge: a single spelling emits no alias and no warning.
    expect(r.warnings).toEqual([])
  })

  it('the inferred contract accepts its own repeated-peer corpus (accept-by-construction)', () => {
    const src = '## Entry\n\nx\n\n## Entry\n\ny\n'
    file('a.md', src)
    const contract = compileContractObject(inferConfig(root).contracts[0]!.def)
    const res = contract.validate(src, { path: 'a.md' })
    expect(res.findings.filter((f) => f.level === 'error')).toEqual([])
  })

  it('marks repeatable across docs where the heading repeats in only one of them', () => {
    file('a.md', '## Release\n\nx\n\n## Release\n\ny\n')
    file('b.md', '## Release\n\nz\n')
    const sections = def(inferConfig(root).contracts[0]!).body!.sections!
    expect(sections).toEqual([{ section: 'Release', minContains: 1 }])
  })

  it('a non-repeated heading stays a plain (non-repeatable) slot', () => {
    file('a.md', '## Summary\n\nx\n')
    file('b.md', '## Summary\n\ny\n')
    expect(def(inferConfig(root).contracts[0]!).body!.sections).toEqual([{ section: 'Summary' }])
  })

  it('optional + repeatable → minContains: 0 with no upper bound', () => {
    // `Note` repeats as peers in one doc but is absent from the other: absent-or-many.
    file('a.md', '## Note\n\nx\n\n## Note\n\ny\n\n## S\n\nx\n')
    file('b.md', '## S\n\nx\n')
    const sections = def(inferConfig(root).contracts[0]!).body!.sections!
    expect(sections).toContainEqual({ section: 'Note', minContains: 0 })
    expect(sections).toContainEqual({ section: 'S' })
  })
})

describe('inferConfig — emission + determinism', () => {
  it('serializes a loadable contract document and is deterministic', () => {
    file('one.md', '---\ntitle: A\n---\n\n## Summary\n\nx\n')
    file('two.md', '---\ntitle: B\n---\n\n## Summary\n\nx\n')
    const a = inferConfig(root)
    const b = inferConfig(root)
    expect(b.contracts).toEqual(a.contracts)
    expect(b.files).toEqual(a.files)

    const yaml = parse(a.files[0]!.content) as Record<string, unknown>
    expect(yaml.mcVersion).toBe(2)
    expect(yaml.kind).toBe('contract')
    // The emitted def round-trips through the loader the self-check uses (the v2 compilers).
    expect(() => compileContractObject(a.contracts[0]!.def)).not.toThrow()
  })
})

describe('inferConfig — a file with broken frontmatter YAML', () => {
  it('names a file whose frontmatter alias is undefined', () => {
    file('ok.md', '---\ntitle: A\n---\n\n## Summary\n\nx\n')
    file('bad.md', '---\ntitle: *missing\n---\n\n## Summary\n\nx\n')
    expect(() => inferConfig(root)).toThrow(/bad\.md: frontmatter is not valid YAML/)
  })

  it('names a file whose frontmatter has a duplicate key', () => {
    file('dup.md', '---\ntitle: a\ntitle: b\n---\n\n## Summary\n\nx\n')
    expect(() => inferConfig(root)).toThrow(/dup\.md: frontmatter is not valid YAML/)
  })
})
