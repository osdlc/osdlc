import { test, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { scanVault, type VaultIndex } from '@osdlc/markdown-vault'
import { createVaultIndex, type ExternalNote } from '@osdlc/markdown-vault'
import { parseBase } from '../../src/base/parse.ts'
import { runView, queryExpression, queryVault, evaluatePropertyId } from '../../src/query.ts'
import { ErrorValue, toDisplayString } from '../../src/expr/values.ts'

const FIXTURES = join(import.meta.dirname, '..', 'fixtures')

// ---------------------------------------------------------------------------
// Query engine over a data-built index: filters, nested tags, formulas over
// frontmatter dates, backlinks (supplied and resolveLinks-inverted), and
// groupBy/summary — the same surface tests/integration/query.test.ts exercises
// against a scanVault index, run here against createVaultIndex instead.
// ---------------------------------------------------------------------------

const notes: ExternalNote[] = [
  {
    path: 'planning/tasks/t1.md',
    frontmatter: { status: 'open', due: '2026-01-01' },
    tags: ['area/work', 'urgent'],
    size: 100,
  },
  {
    path: 'planning/tasks/t2.md',
    frontmatter: { status: 'done', due: '2026-03-01' },
    tags: ['area/personal'],
    size: 50,
  },
  {
    path: 'planning/tasks/t3.md',
    frontmatter: { status: 'open', due: '2026-02-01' },
    tags: ['area/work/frontend'],
    size: 30,
  },
  {
    path: 'planning/notes/n1.md',
    frontmatter: { status: 'done' },
    size: 20,
    // Explicit backlink, no resolveLinks needed — the API already knows it.
    backlinks: ['inbox/i1.md'],
  },
  {
    path: 'inbox/i1.md',
    links: ['n1'], // raw wikilink-style target; resolved by resolveLinks below.
    size: 5,
  },
]

let vault: VaultIndex

beforeAll(() => {
  vault = createVaultIndex(notes, { resolveLinks: true })
})

test('file.inFolder scopes to a folder and its subfolders', () => {
  const { notes: matched, total } = queryVault(vault, { filter: 'file.inFolder("planning/tasks")' })
  assert.equal(total, 3)
  assert.deepEqual(matched.map((n) => n.file.path).sort(), [
    'planning/tasks/t1.md',
    'planning/tasks/t2.md',
    'planning/tasks/t3.md',
  ])
})

test('file.hasTag matches nested child tags under a parent query, same as scanVault semantics', () => {
  // "area/work" query matches the exact tag AND "area/work/frontend" (child),
  // but not the sibling "area/personal".
  const matched = queryExpression(vault, 'file.hasTag("area/work")')
  assert.deepEqual(matched.map((n) => n.file.path).sort(), [
    'planning/tasks/t1.md',
    'planning/tasks/t3.md',
  ])
})

test('formula over a frontmatter date field orders correctly and errors when the property is absent', () => {
  const base = parseBase(`
filters: 'file.hasProperty("due")'
formulas:
  days_until: (due - now()).days
views:
  - type: table
    name: V
    order: [file.name, formula.days_until]
    sort:
      - property: formula.days_until
        direction: ASC
`)
  const result = runView(vault, base, 'V', { now: new Date(2026, 0, 15) })
  assert.equal(result.total, 3) // n1 and i1 have no `due`, excluded by the filter
  assert.deepEqual(
    result.rows.map((r) => r.note.file.name),
    ['t1.md', 't3.md', 't2.md'], // Jan 1 < Feb 1 < Mar 1
  )
  const firstDays = result.rows[0]?.columns['formula.days_until']
  assert.ok(typeof firstDays === 'number' && firstDays < 0, 'first row is overdue')
  const thirdDays = result.rows[2]?.columns['formula.days_until']
  assert.ok(typeof thirdDays === 'number' && thirdDays > 0, 'third row is still due')

  // A note without `due` errors per-cell (ErrorValue) rather than throwing.
  const n1 = vault.byPath.get('planning/notes/n1.md')!
  const cell = evaluatePropertyId('formula.days_until', {
    note: n1,
    vault,
    formulas: base.formulas,
  })
  assert.ok(cell instanceof ErrorValue)
})

test('file.backlinks surfaces both explicitly supplied and resolveLinks-inverted backlinks', () => {
  const n1 = vault.byPath.get('planning/notes/n1.md')!
  // Explicitly supplied.
  assert.ok(n1.backlinks.includes('inbox/i1.md'))
  // Also inverted from i1's raw `links: ['n1']` via resolveLinks.
  assert.ok(n1.backlinks.includes('inbox/i1.md'))

  const withBacklinks = queryExpression(vault, 'file.backlinks.length > 0')
  assert.deepEqual(
    withBacklinks.map((n) => n.file.path),
    ['planning/notes/n1.md'],
  )

  const i1 = vault.byPath.get('inbox/i1.md')!
  assert.equal(i1.links[0]?.path, 'planning/notes/n1.md') // resolved via basename fallback
})

test('groupBy + summary aggregates file.size per status group', () => {
  const base = parseBase(`
views:
  - type: table
    name: V
    filters: 'file.hasProperty("status")'
    order: [file.name]
    groupBy:
      property: status
      direction: ASC
    summaries:
      file.size: Sum
`)
  const result = runView(vault, base, 'V')
  assert.ok(result.groups)
  const open = result.groups!.find((g) => g.keyDisplay === 'open')!
  const done = result.groups!.find((g) => g.keyDisplay === 'done')!
  assert.equal(open.summaries['file.size'], 130) // t1 (100) + t3 (30)
  assert.equal(done.summaries['file.size'], 70) // t2 (50) + n1 (20)
})

// ---------------------------------------------------------------------------
// Equivalence: scanVault(dir) vs. createVaultIndex(dataExtractedFromScan)
// answer the same representative query set identically. The extracted data
// is built FROM the scan result to prove the two paths' output shapes match.
// ---------------------------------------------------------------------------

function extractFromScan(scanned: VaultIndex): ExternalNote[] {
  return scanned.notes.map((note) => ({
    path: note.file.path,
    frontmatter: note.properties,
    tags: note.tags,
    size: note.file.size,
    mtimeMs: note.file.mtime.getTime(),
    ctimeMs: note.file.ctime.getTime(),
    links: note.links.map((l) => l.target),
    embeds: note.embeds.map((l) => l.target),
  }))
}

test('scanVault and createVaultIndex(extracted) agree on file metadata, tags, and link resolution', async () => {
  const scanned = await scanVault(join(FIXTURES, 'links-vault'))
  const rebuilt = createVaultIndex(extractFromScan(scanned), { resolveLinks: true })

  assert.deepEqual(
    rebuilt.notes.map((n) => n.file.path).sort(),
    scanned.notes.map((n) => n.file.path).sort(),
  )

  for (const scannedNote of scanned.notes) {
    const rebuiltNote = rebuilt.byPath.get(scannedNote.file.path)!
    assert.deepEqual(rebuiltNote.file.name, scannedNote.file.name)
    assert.deepEqual(rebuiltNote.file.folder, scannedNote.file.folder)
    assert.deepEqual(rebuiltNote.file.ext, scannedNote.file.ext)
    assert.deepEqual(rebuiltNote.tags, scannedNote.tags)
    assert.deepEqual(
      rebuiltNote.links.map((l) => l.path),
      scannedNote.links.map((l) => l.path),
    )
    // Same resolution pass over the same notes in the same order => identical backlinks.
    assert.deepEqual(rebuiltNote.backlinks, scannedNote.backlinks)
  }
})

test('scanVault and createVaultIndex(extracted) answer the same expression/sort/groupBy queries identically', async () => {
  const scanned = await scanVault(join(FIXTURES, 'links-vault'))
  const rebuilt = createVaultIndex(extractFromScan(scanned), { resolveLinks: true })

  const hasLinkScanned = queryExpression(scanned, 'file.hasLink("spoke-1")')
    .map((n) => n.file.name)
    .sort()
  const hasLinkRebuilt = queryExpression(rebuilt, 'file.hasLink("spoke-1")')
    .map((n) => n.file.name)
    .sort()
  assert.deepEqual(hasLinkRebuilt, hasLinkScanned)
  assert.ok(hasLinkRebuilt.length > 0)

  const sortScanned = queryVault(scanned, { sort: [{ property: 'file.name', direction: 'ASC' }] })
  const sortRebuilt = queryVault(rebuilt, { sort: [{ property: 'file.name', direction: 'ASC' }] })
  assert.deepEqual(
    sortRebuilt.notes.map((n) => n.file.name),
    sortScanned.notes.map((n) => n.file.name),
  )
  assert.equal(sortRebuilt.total, sortScanned.total)

  const base = parseBase(`
views:
  - type: table
    name: V
    order: [file.name]
    groupBy:
      property: type
      direction: ASC
    summaries:
      file.size: Sum
`)
  const groupedScanned = runView(scanned, base, 'V')
  const groupedRebuilt = runView(rebuilt, base, 'V')
  assert.deepEqual(
    groupedRebuilt.groups!.map((g) => g.keyDisplay),
    groupedScanned.groups!.map((g) => g.keyDisplay),
  )
  assert.deepEqual(
    groupedRebuilt.groups!.map((g) => g.summaries['file.size']),
    groupedScanned.groups!.map((g) => g.summaries['file.size']),
  )
})

// ---------------------------------------------------------------------------
// Property IDs whose name is not a bare identifier
// ---------------------------------------------------------------------------

test('scope-qualified property IDs resolve when the name has a dash or a space', () => {
  const awkward = createVaultIndex([
    {
      path: 'awkward.md',
      frontmatter: {
        'due-date': '2025-05-01',
        'due date': '2025-06-01',
        plain: 7,
        meta: { owner: 'ada' },
      },
      size: 1,
    },
  ])
  const note = awkward.byPath.get('awkward.md')!
  const formulas = { 'Total Cost': '2 * 3', plain: '1 + 1' }
  const ctx = { note, vault: awkward, formulas }
  const display = (id: string) => toDisplayString(evaluatePropertyId(id, ctx))

  // `note.due-date` parses as subtraction, and `note.due date` / `formula.Total
  // Cost` do not parse at all, unless the name is bracket-quoted.
  assert.equal(display('note.due-date'), '2025-05-01')
  assert.equal(display('note.due date'), '2025-06-01')
  assert.equal(display('formula.Total Cost'), '6')

  // The bare-name and plain-identifier paths are unchanged.
  assert.equal(display('due-date'), '2025-05-01')
  assert.equal(display('note.plain'), '7')
  assert.equal(display('formula.plain'), '2')
  assert.equal(display('file.name'), 'awkward.md')
  // A nested property still walks the object rather than becoming one key.
  assert.equal(display('note.meta.owner'), 'ada')
})

test('a formula property ID whose name holds a dot names that one formula', () => {
  const priced = createVaultIndex([{ path: 'p.md', frontmatter: { price: 5 } }])
  const note = priced.byPath.get('p.md')!
  const ctx = { note, vault: priced, formulas: { 'incl. tax': 'price * 1.2', 'v1.2': '"x"' } }
  assert.equal(evaluatePropertyId('formula.incl. tax', ctx), 6)
  assert.equal(evaluatePropertyId('formula.v1.2', ctx), 'x')

  const base = parseBase(`
formulas:
  "incl. tax": "price * 1.2"
views:
  - type: table
    name: V
    order: ["formula.incl. tax"]
    sort:
      - property: "formula.incl. tax"
        direction: DESC
`)
  const result = runView(priced, base, 'V')
  assert.equal(result.rows[0]?.columns['formula.incl. tax'], 6)
})

test('a bare property ID named file/this/note/formula/true/false/null reads the note property', () => {
  const reserved = createVaultIndex([
    {
      path: 'A.md',
      frontmatter: {
        file: 'report.pdf',
        this: 'self',
        note: 'n',
        formula: 'f',
        true: 'yes',
        false: 'no',
        null: 'nil',
      },
    },
  ])
  const note = reserved.byPath.get('A.md')!
  const ctx = { note, vault: reserved, formulas: {} }
  assert.equal(evaluatePropertyId('file', ctx), 'report.pdf')
  assert.equal(evaluatePropertyId('this', ctx), 'self')
  assert.equal(evaluatePropertyId('note', ctx), 'n')
  assert.equal(evaluatePropertyId('formula', ctx), 'f')
  assert.equal(evaluatePropertyId('true', ctx), 'yes')
  assert.equal(evaluatePropertyId('false', ctx), 'no')
  assert.equal(evaluatePropertyId('null', ctx), 'nil')
  assert.equal(evaluatePropertyId('file.name', ctx), 'A.md')
})

test('Empty and Filled summaries count empty strings and lists as empty, as isEmpty() does', () => {
  const sparse = createVaultIndex([
    { path: 'a.md', frontmatter: { tags2: [] } },
    { path: 'b.md', frontmatter: { tags2: '' } },
    { path: 'c.md', frontmatter: {} },
    { path: 'd.md', frontmatter: { tags2: ['x'] } },
  ])
  const base = parseBase(`
views:
  - type: table
    name: E
    order: [tags2]
    summaries:
      tags2: Empty
  - type: table
    name: F
    order: [tags2]
    summaries:
      tags2: Filled
`)
  assert.equal(runView(sparse, base, 'E').summaries['tags2'], 3)
  assert.equal(runView(sparse, base, 'F').summaries['tags2'], 1)
})

test('groupBy puts rows whose key is the same error into one group', () => {
  const numbers = createVaultIndex([
    { path: 'a.md', frontmatter: { x: 1 } },
    { path: 'b.md', frontmatter: { x: 2 } },
    { path: 'c.md', frontmatter: { x: 3 } },
    { path: 'd.md', frontmatter: { x: 'text' } },
  ])
  const base = parseBase(`
formulas:
  fails: "x.nope"
views:
  - type: table
    name: G
    groupBy:
      property: formula.fails
      direction: ASC
`)
  const groups = runView(numbers, base, 'G').groups!
  // Three rows fail with one message (number), the fourth with another (string).
  const errorGroups = groups.filter((g) => g.key instanceof ErrorValue)
  assert.deepEqual(errorGroups.map((g) => g.rows.length).sort(), [1, 3])
})

test('a custom summary over a column with missing values aggregates the values present', () => {
  const prices = createVaultIndex([
    { path: 'a.md', frontmatter: { price: 10 } },
    { path: 'b.md', frontmatter: { price: 20 } },
    { path: 'c.md', frontmatter: {} },
    { path: 'd.md', frontmatter: { price: '' } },
  ])
  const base = parseBase(`
summaries:
  myAvg: "values.mean()"
views:
  - type: table
    name: V
    order: [price]
    summaries:
      price: myAvg
  - type: table
    name: B
    order: [price]
    summaries:
      price: Average
  - type: table
    name: M
    order: [price]
    summaries:
      price: Min
`)
  assert.equal(runView(prices, base, 'V').summaries['price'], 15)
  assert.equal(runView(prices, base, 'B').summaries['price'], 15)
  assert.equal(runView(prices, base, 'M').summaries['price'], 10)
})
