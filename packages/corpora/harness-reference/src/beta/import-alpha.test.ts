import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'

import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parse } from 'yaml'

import type { Dataset } from '../alpha/load.ts'
import { BETA, loadBeta } from './corpus.ts'
import {
  type Context,
  idSafe,
  importAlpha,
  inferValueSchema,
  notePath,
  plan,
  writePlan,
} from './import-alpha.ts'
import { lint } from './lint.ts'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'harness-reference-import-'))
  cpSync(BETA, dir, { recursive: true })
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const front = (rel: string): Record<string, any> =>
  parse(/^---\n([\s\S]*?)\n---/u.exec(readFileSync(join(dir, rel), 'utf8'))?.[1] ?? '') as Record<
    string,
    any
  >

const NOTE =
  'https://github.com/osdlc/skillwright/blob/main/harness-reference/corpora/alpha/sources/n.md'
const DOCS = 'https://example.com/docs'

const obs = (over: Record<string, unknown>) => ({
  value: { a: 1 },
  since: null,
  until: null,
  observed: '2026-01-01',
  source: 'doc',
  ...over,
})
const fact = (subject: string, over: Record<string, unknown>) => ({
  conceptId: `facts/pi/${subject}`,
  harness: 'pi',
  subject,
  observations: [],
  sources: [
    { id: 'doc', resource: DOCS, title: 'Upstream docs' },
    { id: 'note', resource: NOTE, title: 'A note' },
  ],
  ...over,
})
const dataset = (facts: unknown[]): Dataset =>
  ({
    categories: [],
    harnesses: [],
    probes: [],
    subjects: [
      { id: 'zz/thing', category: 'zz', title: 'Thing', description: 'A thing.', order: 1 },
      { id: 'zz/other', category: 'zz', title: 'Other', description: 'Another.', order: 2 },
    ],
    facts,
  }) as unknown as Dataset
const context = (facts: unknown[]): Context => ({
  dataset: dataset(facts),
  beta: loadBeta(dir),
  categories: new Set(['zz']),
  note: () => ({ title: 'A note', description: 'Notes.' }),
  probeBody: () => '',
  fixtureFiles: () => [],
})

describe('mapping', () => {
  test('merges, supersedes, disputes, and sets strength by the rule', () => {
    const facts = [
      fact('zz/thing', {
        observations: [
          obs({ value: { a: 1, b: 'x' }, until: '1.0.0', evidence: 'docs' }),
          obs({
            value: { a: 2, b: 'x' },
            since: '1.0.0',
            observed: '2026-02-01',
            evidence: 'source',
          }),
          obs({
            value: { b: 'y' },
            since: '1.0.0',
            observed: '2026-03-01',
            source: 'note',
            evidence: 'help-text',
          }),
        ],
      }),
      fact('zz/other', {
        observations: [],
        open: [{ question: 'Does it?', observed: '2026-04-01', source: 'doc' }],
      }),
    ]
    const p = plan(context(facts))
    writePlan(dir, p)
    const beta = loadBeta(dir)
    assert.deepEqual([...beta.report.errors], [])
    assert.deepEqual(lint(beta), [])

    const old = front('statements/Pi/Pi Thing until 1.0.0.md')
    assert.equal(old.status, 'superseded')
    assert.equal(old.strength, 'moderate')
    assert.equal(old.supersedes, undefined)
    assert.deepEqual(old.scope, { since: null, until: '1.0.0', platform: [], model: null })

    const now = front('statements/Pi/Pi Thing from 1.0.0.md')
    assert.equal(now.status, 'disputed')
    assert.deepEqual(now.proposition.object, { a: 2, b: 'y' })
    assert.equal(now.supersedes, '[Pi Thing until 1.0.0](Pi%20Thing%20until%201.0.0.md)')
    assert.deepEqual(
      now.hasEvidenceLines.map((l: any) => [
        l.directionOfEvidenceProvided,
        l.strengthOfEvidenceProvided,
      ]),
      [
        ['disputes', 'strong'],
        ['supports', 'strong'],
      ],
    )
    // Strong, one step lower for the disputing line.
    assert.equal(now.strength, 'moderate')

    const open = front('statements/Pi/Pi Other open.md')
    assert.equal(open.status, 'open')
    assert.equal(open.direction, 'neutral')
    assert.equal(open.strength, undefined)
    assert.deepEqual(open.proposition.object, { open: ['Does it?'] })
    assert.deepEqual(open.open, ['Does it?'])
  })

  test('maps a missing evidence kind by where the source lives, and cites notes as documents', () => {
    const p = plan(
      context([
        fact('zz/thing', {
          observations: [
            obs({ source: 'doc' }),
            obs({ source: 'note', observed: '2026-01-02', value: { c: true } }),
          ],
        }),
      ]),
    )
    writePlan(dir, p)
    assert.equal(front('study-results/Pi/2026-01-01 Pi Thing.md').kind, 'docs')
    assert.equal(front('study-results/Pi/2026-01-02 Pi Thing.md').kind, 'third-party')
    const st = front('statements/Pi/Pi Thing.md')
    assert.equal(st.strength, 'moderate')
    assert.deepEqual(st.proposition.object, { a: 1, c: true })
    const note = front('documents/skillwright/A note.md')
    assert.equal(note.documentType, 'research note')
    assert.deepEqual(note.urls, [NOTE])
    assert.deepEqual(front('documents/example.com/Upstream docs.md').urls, [DOCS])
    assert.deepEqual(lint(loadBeta(dir)), [])
  })

  test('an existing document with the same URL is reused', () => {
    const url = front('documents/Anthropic/Claude Code overview.md').urls[0]
    const p = plan(
      context([
        fact('zz/thing', {
          observations: [obs({})],
          sources: [{ id: 'doc', resource: url, title: 'Whatever' }],
        }),
      ]),
    )
    assert.equal(p.counts['documents'], undefined)
    const [file] = [...p.files].find(([f]) => f.startsWith('study-results/'))!
    assert.ok(readFileSync(join(dir, 'documents/Anthropic/Claude Code overview.md'), 'utf8') !== '')
    assert.ok(p.files.get(file)!.includes('Claude%20Code%20overview.md'))
  })

  test('skips a fact whose harness has no beta record, with a warning', () => {
    const p = plan(
      context([fact('zz/thing', { harness: 'agent-skills', observations: [obs({})] })]),
    )
    assert.equal(p.counts['facts skipped'], 1)
    assert.equal(p.counts['statements'], undefined)
    assert.match(p.warnings[0] ?? '', /agent-skills has no beta record/)
  })
})

describe('helpers', () => {
  test('idSafe removes what the spec forbids', () => {
    assert.equal(
      idSafe(' Claude Code: harness notes / v[2] #1. '),
      'Claude Code harness notes v 2 1',
    )
  })

  test('inferValueSchema names every key with the types seen', () => {
    assert.deepEqual(inferValueSchema([{ b: true, a: ['x'] }, { b: 'partial' }]), {
      type: 'object',
      properties: {
        a: { type: 'array', items: { type: 'string' } },
        b: { type: ['boolean', 'string'] },
      },
      additionalProperties: true,
    })
  })
})

describe('cli import', () => {
  test('regenerating the committed cli import changes nothing', () => {
    const first = importAlpha(new Set(['cli']), dir)
    assert.deepEqual(first.changed, [])
    assert.deepEqual(first.plan.warnings, [])
    assert.equal(first.plan.counts['statements'], 30)
    assert.equal(first.plan.counts['study-results'], 30)
    assert.equal(first.plan.counts['facts'], 30)
    const second = importAlpha(new Set(['cli']), dir)
    assert.deepEqual(second.changed, [])
  })

  test('is byte-identical from an empty corpus, and the result validates and lints', () => {
    const fresh = mkdtempSync(join(tmpdir(), 'harness-reference-fresh-'))
    try {
      for (const t of [
        'harnesses',
        'documents',
        'study-results',
        'methods',
        'subjects',
        'statements',
      ])
        cpSync(join(BETA, t, `${t}.schema.md`), join(fresh, t, `${t}.schema.md`))
      for (const f of ['corpus-schema.md', 'README.md']) cpSync(join(BETA, f), join(fresh, f))
      cpSync(join(BETA, 'harnesses'), join(fresh, 'harnesses'), { recursive: true })
      const r = importAlpha(new Set(['cli']), fresh)
      assert.ok(r.changed.length > 60)
      const beta = loadBeta(fresh)
      // Documents the corpus cites that only the full corpus holds are missing here, so only the
      // import's own files are compared.
      assert.deepEqual(
        beta.report.errors.filter((e) => !e.startsWith('harnesses/')),
        [],
      )
      // Subjects are the exception: the committed ones were tidied by hand.
      for (const rel of r.changed.filter((f) => !f.startsWith('subjects/'))) {
        const committed = join(BETA, rel)
        assert.equal(readFileSync(join(fresh, rel), 'utf8'), readFileSync(committed, 'utf8'), rel)
      }
      assert.deepEqual(importAlpha(new Set(['cli']), fresh).changed, [])
    } finally {
      rmSync(fresh, { recursive: true, force: true })
    }
  })

  test('the session-env run is a strong statement that cites its method', () => {
    const st = front('statements/Claude Code/Claude Code Session environment.md')
    assert.equal(st.strength, 'strong')
    assert.equal(st.status, 'current')
    assert.deepEqual(st.proposition.object, { vars: ['CLAUDE_CODE_SESSION_ID', 'CLAUDE_PID'] })
    const run = front('study-results/Claude Code/2026-10-10 Claude Code Session environment.md')
    assert.equal(run.kind, 'run')
    assert.match(run.specifiedBy, /Session%20environment\.md\)$/)
    assert.equal(run.version, '2.1.294')
  })
})

// ---- identity, scope and merge --------------------------------------------------------------

const tree = (root: string, base = ''): Record<string, string> =>
  Object.fromEntries(
    readdirSync(join(root, base)).flatMap((n) => {
      const rel = base === '' ? n : `${base}/${n}`
      return statSync(join(root, rel)).isDirectory()
        ? Object.entries(tree(root, rel))
        : [[rel, readFileSync(join(root, rel), 'utf8')]]
    }),
  )

const twoCategories = (over: { a?: unknown[]; b?: unknown[] } = {}): Dataset =>
  ({
    categories: [],
    harnesses: [],
    probes: [],
    subjects: [
      { id: 'ca/thing', category: 'ca', title: 'Thing', description: 'A.', order: 1 },
      { id: 'cb/thing', category: 'cb', title: 'Thing', description: 'B.', order: 2 },
    ],
    facts: [
      fact('ca/thing', {
        conceptId: 'facts/pi/ca/thing',
        observations: [obs({}), obs({ observed: '2026-02-01', value: { a: 1 } })],
        ...(over.a === undefined ? {} : { observations: over.a }),
      }),
      fact('cb/thing', {
        conceptId: 'facts/pi/cb/thing',
        observations: [obs({ value: { b: 2 } })],
        ...(over.b === undefined ? {} : { observations: over.b }),
      }),
    ],
  }) as unknown as Dataset
const ctxFor = (categories: string[], ds: Dataset, root = dir): Context => ({
  dataset: ds,
  beta: loadBeta(root),
  categories: new Set(categories),
  note: () => undefined,
  probeBody: () => '',
  fixtureFiles: () => [],
})
const run = (categories: string[], ds: Dataset, root = dir) => {
  const p = plan(ctxFor(categories, ds, root))
  writePlan(root, p)
  return p
}
describe('identity and scope', () => {
  test('every written record names its alpha identity, and old ones are not owned by body text', () => {
    run(['ca'], twoCategories())
    assert.equal(
      front('statements/Pi/Pi Thing.md').imported_from,
      'fact:ca/thing@pi#scope-[null,null,null]',
    )
    assert.equal(
      front('study-results/Pi/2026-01-01 Pi Thing.md').imported_from,
      'fact:ca/thing@pi#observation-1',
    )
  })

  test('one category after the other gives what all of them give, in either order', () => {
    const ds = twoCategories()
    const all = mkdtempSync(join(tmpdir(), 'hr-all-'))
    const ab = mkdtempSync(join(tmpdir(), 'hr-ab-'))
    const ba = mkdtempSync(join(tmpdir(), 'hr-ba-'))
    try {
      for (const d of [all, ab, ba]) cpSync(BETA, d, { recursive: true })
      run(['ca', 'cb'], ds, all)
      run(['ca'], ds, ab)
      run(['cb'], ds, ab)
      run(['cb'], ds, ba)
      run(['ca'], ds, ba)
      const want = tree(all)
      assert.deepEqual(tree(ab), want)
      assert.deepEqual(tree(ba), want)
      // The same title in two categories got two distinct names.
      assert.ok(want['statements/Pi/Pi Thing.md'] !== undefined)
      assert.ok(want['statements/Pi/Pi Thing 2.md'] !== undefined)
      assert.deepEqual(plan(ctxFor(['ca', 'cb'], ds, ab)).removed, [])
    } finally {
      for (const d of [all, ab, ba]) rmSync(d, { recursive: true, force: true })
    }
  })

  test('a hand-written record is never overwritten or deleted, even when it quotes the importer', () => {
    const mine = 'statements/Pi/Pi Thing.md'
    const source = readFileSync(join(dir, 'statements/Pi/Pi Fork a session.md'), 'utf8')
    writeFileSync(join(dir, mine), source.replace(/^imported_from:.*\n/mu, ''))
    const text = readFileSync(join(dir, mine), 'utf8')
    writeFileSync(join(dir, mine), `${text}\nImported from \`x.md\`.\n`)
    const p = run(['ca'], twoCategories())
    assert.equal(readFileSync(join(dir, mine), 'utf8').includes('Imported from `x.md`'), true)
    assert.ok(p.files.has('statements/Pi/Pi Thing 2.md'))
    assert.equal(p.removed.includes(mine), false)
  })

  test('a version boundary retires the file the old range had', () => {
    run(['ca'], twoCategories())
    assert.ok(existsSync(join(dir, 'statements/Pi/Pi Thing.md')))
    const ds = twoCategories({
      a: [
        obs({ until: '2.0.0' }),
        obs({ since: '2.0.0', observed: '2026-03-01', value: { a: 2 } }),
      ],
    })
    const p = run(['ca'], ds)
    assert.ok(existsSync(join(dir, 'statements/Pi/Pi Thing until 2.0.0.md')))
    assert.ok(existsSync(join(dir, 'statements/Pi/Pi Thing from 2.0.0.md')))
    assert.equal(existsSync(join(dir, 'statements/Pi/Pi Thing.md')), false)
    assert.deepEqual(p.removed, ['statements/Pi/Pi Thing.md'])
    const beta = loadBeta(dir)
    assert.deepEqual([...beta.report.errors], [])
    assert.deepEqual(lint(beta), [])
    assert.deepEqual(run(['ca'], ds) && plan(ctxFor(['ca'], ds)).removed, [])
  })

  test('a record keeps its name while its identity stands', () => {
    run(['ca'], twoCategories())
    // A colliding record now exists earlier in the order: the importer's own file does not move.
    const ds = twoCategories()
    ds.subjects.unshift({
      id: 'c0/thing',
      category: 'c0',
      title: 'Thing',
      description: 'Z.',
      order: 0,
    } as never)
    ds.facts.unshift(
      fact('c0/thing', { conceptId: 'facts/pi/a0/thing', observations: [obs({})] }) as never,
    )
    run(['ca', 'cb', 'c0'], ds)
    assert.equal(
      front('statements/Pi/Pi Thing.md').imported_from,
      'fact:ca/thing@pi#scope-[null,null,null]',
    )
  })

  test('reordered object keys are one value, not a dispute', () => {
    const ds = twoCategories({
      a: [
        obs({ value: { x: { a: 1, b: [1, 2] } } }),
        obs({ observed: '2026-02-01', value: { x: { b: [1, 2], a: 1 } } }),
      ],
    })
    run(['ca'], ds)
    const st = front('statements/Pi/Pi Thing.md')
    assert.equal(st.status, 'current')
    assert.deepEqual(st.proposition.object, { x: { a: 1, b: [1, 2] } })
    const other = twoCategories({
      a: [obs({ value: { x: [1, 2] } }), obs({ observed: '2026-02-01', value: { x: [2, 1] } })],
    })
    run(['ca'], other)
    assert.equal(front('statements/Pi/Pi Thing.md').status, 'disputed')
  })

  test('the value kept is the latest by observed date, not by array position', () => {
    const ds = twoCategories({
      a: [
        obs({ observed: '2026-03-01', value: { a: 'newest' } }),
        obs({ observed: '2026-01-01', value: { a: 'oldest' } }),
      ],
    })
    run(['ca'], ds)
    const st = front('statements/Pi/Pi Thing.md')
    assert.deepEqual(st.proposition.object, { a: 'newest' })
    assert.equal(st.status, 'disputed')
    assert.match(String(st.contributions[0].date), /2026-03-01/)
  })

  test('a fact with nothing in it is skipped with a warning', () => {
    const p = plan(ctxFor(['ca'], twoCategories({ a: [] })))
    assert.match(p.warnings.join('\n'), /no observations and no open questions/)
    assert.equal(p.counts['facts skipped'], 1)
    assert.ok(![...p.files.values()].some((t) => t.includes('undefined')))
  })

  test('a missing subject is reported as the subject, not the harness', () => {
    const ds = twoCategories()
    ds.subjects.splice(0, 1)
    const p = plan(ctxFor(['ca'], ds))
    assert.match(p.warnings[0] ?? '', /subject ca\/thing is not in the alpha corpus/)
  })

  test('two documents with one title do not burn a numbered name before the qualified one', () => {
    const a = fact('ca/thing', {
      conceptId: 'facts/pi/ca/thing',
      sources: [
        { id: 'one', resource: 'https://one.example/x', title: 'Guide' },
        { id: 'two', resource: 'https://two.example/x', title: 'Guide' },
        { id: 'three', resource: 'https://three.example/x', title: 'Guide' },
      ],
      observations: [
        obs({ source: 'one' }),
        obs({ source: 'two', value: { z: 1 } }),
        obs({ source: 'three', value: { y: 1 } }),
      ],
    })
    const ds = twoCategories()
    ds.facts = [a as never]
    run(['ca'], ds)
    assert.ok(existsSync(join(dir, 'documents/one.example/Guide.md')))
    assert.ok(existsSync(join(dir, 'documents/two.example/Guide two.example.md')))
    assert.ok(existsSync(join(dir, 'documents/three.example/Guide three.example.md')))
  })

  test('notePath decodes, drops query and fragment, and refuses anything leaving the folder', () => {
    const base =
      'https://github.com/osdlc/skillwright/blob/main/harness-reference/corpora/alpha/sources/'
    assert.equal(notePath(`${base}a%20b.md?plain=1#L3`, '/s'), '/s/a b.md')
    assert.equal(notePath(`${base}sub/n.md`, '/s'), '/s/sub/n.md')
    assert.equal(notePath(`${base}..%2Fx.md`, '/s'), undefined)
    assert.equal(notePath(`${base}../x.md`, '/s'), undefined)
    assert.equal(notePath(`${base}%E0%A4%A.md`, '/s'), undefined)
    assert.equal(notePath('https://example.com/x.md', '/s'), undefined)
  })

  test('an open-only fact names its documents even when its category is not imported', () => {
    const ds = twoCategories()
    ds.facts = [
      fact('ca/thing', {
        conceptId: 'facts/pi/ca/thing',
        observations: [],
        open: [{ question: 'Does it?', observed: '2026-04-01', source: 'one' }],
        sources: [{ id: 'one', resource: 'https://one.example/x', title: 'Guide' }],
      }),
      fact('cb/thing', {
        conceptId: 'facts/pi/cb/thing',
        observations: [obs({ source: 'two' })],
        sources: [{ id: 'two', resource: 'https://two.example/x', title: 'Guide' }],
      }),
    ] as never
    const all = mkdtempSync(join(tmpdir(), 'hr-all-'))
    const ba = mkdtempSync(join(tmpdir(), 'hr-ba-'))
    try {
      for (const d of [all, ba]) cpSync(BETA, d, { recursive: true })
      run(['ca', 'cb'], ds, all)
      run(['cb'], ds, ba)
      run(['ca'], ds, ba)
      assert.deepEqual(tree(ba), tree(all))
      assert.ok(existsSync(join(ba, 'documents/two.example/Guide two.example.md')))
    } finally {
      for (const d of [all, ba]) rmSync(d, { recursive: true, force: true })
    }
  })

  test('two records claiming one identity are an error naming both files', () => {
    run(['ca'], twoCategories())
    cpSync(join(dir, 'statements/Pi/Pi Thing.md'), join(dir, 'statements/Pi/Pi Copy.md'))
    assert.throws(
      () => plan(ctxFor(['ca'], twoCategories())),
      /Pi Copy\.md and statements\/Pi\/Pi Thing\.md both claim imported_from|Pi Thing\.md and statements\/Pi\/Pi Copy\.md both claim/,
    )
  })

  test('a selected fact skipped for a missing subject retires its old statement', () => {
    run(['ca'], twoCategories())
    assert.ok(existsSync(join(dir, 'statements/Pi/Pi Thing.md')))
    const ds = twoCategories()
    ds.subjects.splice(0, 1)
    const p = run(['ca'], ds)
    assert.match(p.warnings.join('\n'), /not in the alpha corpus/)
    assert.equal(existsSync(join(dir, 'statements/Pi/Pi Thing.md')), false)
    assert.ok(p.removed.includes('statements/Pi/Pi Thing.md'))
  })
})
