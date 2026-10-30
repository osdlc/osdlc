import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'

import { cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { BUNDLE, ROOT, load, parseConcept, repoRoot, semverOrder } from './load.ts'
import { type Change, changes, current, renderSite } from './render.ts'
import type { Fact, Observation } from './schema.ts'
import { checkSchemas } from './validate.ts'

const REPO = repoRoot(ROOT)
let copy = ''

before(() => {
  copy = mkdtempSync(join(tmpdir(), 'harness-reference-'))
  cpSync(BUNDLE, copy, { recursive: true })
})
after(() => rmSync(copy, { recursive: true, force: true }))

/** Load the shared copy with one file rewritten, then put the file back. */
function loadWith(rel: string, edit: (text: string) => string): string[] {
  const path = join(copy, rel)
  const original = readFileSync(path, 'utf8')
  const edited = edit(original)
  if (edited === original) throw new Error(`edit to ${rel} changed nothing`)
  writeFileSync(path, edited)
  try {
    return load(copy, REPO).errors
  } finally {
    writeFileSync(path, original)
  }
}

const has = (errors: string[], part: string): boolean => errors.some((e) => e.includes(part))

describe('the bundle', () => {
  test('validates', () => {
    const { dataset, errors } = load()
    assert.deepEqual(errors, [])
    assert.ok((dataset?.facts.length ?? 0) > 0)
  })

  test('schema/*.json matches src/schema.ts', () => {
    assert.deepEqual(checkSchemas(join(ROOT, 'schema'), false), [])
  })
})

describe('validation', () => {
  const fact = 'facts/claude-code/skills/prequalified-name.md'

  test('a concept without type fails OKF conformance', () => {
    const errors = loadWith(fact, (t) => t.replace('type: Harness Fact\n', ''))
    assert.ok(has(errors, 'non-empty `type`'))
  })

  test('until before since is refused', () => {
    const errors = loadWith(fact, (t) =>
      t.replace('since: null\n    until: "2.1.246"', 'since: "2.1.300"\n    until: "2.1.246"'),
    )
    assert.ok(has(errors, 'since must come before until'))
  })

  test('pre-release versions compare numerically', () => {
    const errors = loadWith(fact, (t) =>
      t.replace(
        'since: null\n    until: "2.1.246"',
        'since: "1.0.0-alpha.2"\n    until: "1.0.0-alpha.10"',
      ),
    )
    assert.ok(!has(errors, 'since must come before until'))
  })

  test('observations out of date order are refused', () => {
    const errors = loadWith(fact, (t) =>
      t.replace('observed: "2026-10-01"', 'observed: "2026-12-01"'),
    )
    assert.ok(has(errors, 'observations must be oldest first'))
  })

  test('a cited source id must be in sources', () => {
    const errors = loadWith(fact, (t) => t.replace('source: claude-changelog', 'source: nowhere'))
    assert.ok(has(errors, 'source "nowhere" is not in sources'))
  })

  test('a source no observation cites is refused', () => {
    const errors = loadWith(fact, (t) =>
      t.replace(
        'sources:\n',
        'sources:\n  - id: unused\n    resource: "https://example.com/"\n    title: Unused\n',
      ),
    )
    assert.ok(has(errors, 'sources entry "unused" is never cited'))
  })

  test('a footnote naming no source is refused', () => {
    const errors = loadWith(fact, (t) => `${t}\nSee this.[^missing]\n`)
    assert.ok(has(errors, 'footnote [^missing] names no sources entry'))
  })

  test('a repository link must resolve', () => {
    const errors = loadWith(fact, (t) =>
      t.replace('sources/skill-naming-across-harnesses.md', 'sources/no-such-note.md'),
    )
    assert.ok(has(errors, 'no-such-note.md does not exist in the repository'))
  })

  test('a subject must match the path', () => {
    const errors = loadWith(fact, (t) =>
      t.replace('subject: skills/prequalified-name', 'subject: skills/name-source'),
    )
    assert.ok(has(errors, 'must match the path'))
  })

  test('a harness must match the path', () => {
    const errors = loadWith(fact, (t) => t.replace('harness: claude-code', 'harness: codex'))
    assert.ok(has(errors, 'harness "codex" must match the path'))
  })

  test('two facts for one harness and subject are refused', () => {
    const errors = loadWith('facts/codex/skills/name-source.md', (t) =>
      t.replace('subject: skills/name-source', 'subject: skills/user-dirs'),
    )
    assert.ok(has(errors, 'duplicate fact for codex skills/user-dirs'))
  })

  test('a version on a harness with no known versioning is refused', () => {
    const errors = loadWith('facts/antigravity/skills/agents-dir.md', (t) =>
      t.replace('since: null', 'since: 1.0.0'),
    )
    assert.ok(has(errors, 'no known versioning'))
  })
})

describe('schema files', () => {
  test('--write-schema writes files the check accepts; a changed or missing file is stale', () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-reference-schema-'))
    try {
      assert.ok(checkSchemas(dir, false).length > 0)
      assert.deepEqual(checkSchemas(dir, true), [])
      assert.deepEqual(checkSchemas(dir, false), [])
      writeFileSync(join(dir, 'fact.schema.json'), '{}')
      assert.deepEqual(checkSchemas(dir, false), [
        'schema/fact.schema.json is stale: run `node src/validate.ts --write-schema`',
      ])
      unlinkSync(join(dir, 'harness.schema.json'))
      assert.equal(checkSchemas(dir, false).length, 2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

function obs(value: Record<string, unknown>, observed: string, until: string | null = null) {
  const o: Observation = { value, since: null, until, observed, source: 's' }
  return o
}

function factOf(observations: Observation[]): Fact {
  return {
    type: 'Harness Fact',
    title: 't',
    description: 'd',
    tags: ['skills'],
    harness: 'codex',
    subject: 'skills/user-dirs',
    observations,
    sources: [{ id: 's', resource: 'https://example.com/', title: 'S' }],
    conceptId: 'facts/codex/skills/user-dirs',
  }
}

describe('render', () => {
  test('current is the latest observation still in force', () => {
    const a = obs({ x: 1 }, '2026-01-01')
    const b = obs({ x: 2 }, '2026-02-01', '1.0.0')
    assert.equal(current(factOf([a, b])), a)
    assert.equal(current(factOf([b])), undefined)
  })

  test('changes marks first observed, changed and re-observed, newest first', () => {
    const fact = factOf([
      obs({ x: 1 }, '2026-01-01'),
      obs({ x: 1 }, '2026-02-01'),
      obs({ x: 2 }, '2026-03-01'),
    ])
    assert.deepEqual(
      changes([fact]).map((c: Change) => [c.date, c.kind]),
      [
        ['2026-03-01', 'changed'],
        ['2026-02-01', 're-observed'],
        ['2026-01-01', 'first observed'],
      ],
    )
  })

  test('renderSite writes every page, with links relative to each page', () => {
    const { dataset } = load()
    if (!dataset) throw new Error('bundle did not load')
    const files = renderSite(dataset)
    for (const p of ['index.html', 'changes.html', 'gaps.html', 'data.json'])
      assert.ok(files.has(p))
    for (const h of dataset.harnesses) assert.ok(files.has(`harnesses/${h.id}.html`))
    for (const s of dataset.subjects) assert.ok(files.has(`subjects/${s.id}.html`))
    assert.ok(
      files
        .get('harnesses/claude-code.html')
        ?.includes('href="../subjects/skills/prequalified-name.html"'),
    )
    assert.ok(files.get('changes.html')?.includes('href="harnesses/claude-code.html"'))
  })

  test('a fact with no observation in force counts as a gap', () => {
    const { dataset } = load()
    if (!dataset) throw new Error('bundle did not load')
    const coverage = (html: string | undefined): number =>
      Number(/(\d+) of \d+ harness/.exec(html ?? '')?.[1])
    const before = coverage(renderSite(dataset).get('gaps.html'))
    const facts = dataset.facts.map((f) =>
      f.conceptId === 'facts/codex/skills/user-dirs'
        ? { ...f, observations: f.observations.map((o) => ({ ...o, until: '9.9.9' })) }
        : f,
    )
    assert.equal(coverage(renderSite({ ...dataset, facts }).get('gaps.html')), before - 1)
  })
})

test('parseConcept splits frontmatter and body', () => {
  assert.deepEqual(parseConcept('---\ntype: X\n---\n\nbody\n'), {
    frontmatter: { type: 'X' },
    body: '\nbody\n',
  })
})

test('semverOrder follows semver precedence', () => {
  assert.equal(semverOrder('1.2.3', '1.2.3'), 0)
  assert.equal(semverOrder('1.2.3', '1.10.0'), -1)
  assert.equal(semverOrder('1.0.0-alpha.2', '1.0.0-alpha.10'), -1)
  assert.equal(semverOrder('1.0.0-alpha', '1.0.0'), -1)
  assert.equal(semverOrder('1.0.0-beta', '1.0.0-alpha.1'), 1)
  assert.equal(semverOrder('1.0.0-alpha', '1.0.0-alpha.1'), -1)
  assert.equal(semverOrder('1.0.0-1', '1.0.0-alpha'), -1)
})
