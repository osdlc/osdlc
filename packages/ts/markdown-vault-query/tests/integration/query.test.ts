import { test, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { scanVault, type VaultIndex } from '@osdlc/markdown-vault'
import { parseBase } from '../../src/base/parse.ts'
import { runView, queryBase, queryExpression } from '../../src/query.ts'
import { DateValue, ErrorValue, toDisplayString } from '../../src/expr/values.ts'

const FIXTURES = join(import.meta.dirname, '..', 'fixtures')

let planning: VaultIndex
let basic: VaultIndex
let tags: VaultIndex
let links: VaultIndex

beforeAll(async () => {
  planning = await scanVault(join(FIXTURES, 'planning-vault'))
  basic = await scanVault(join(FIXTURES, 'basic-vault'))
  tags = await scanVault(join(FIXTURES, 'tags-vault'))
  links = await scanVault(join(FIXTURES, 'links-vault'))
})

// ---------------------------------------------------------------------------
// The real-world planning base (same shape as docs/planning/*.base)
// ---------------------------------------------------------------------------

test('runs the planning tasks.base end to end', async () => {
  const source = await readFile(
    join(FIXTURES, 'planning-vault', 'planning', 'tasks', 'tasks.base'),
    'utf8',
  )
  const base = parseBase(source)
  const result = runView(planning, base, 'All tasks')

  // 3 task notes; excludes the .base file itself and the note outside the folder.
  assert.equal(result.total, 3)
  assert.deepEqual(
    result.rows.map((r) => r.note.file.name),
    ['task-1-fix-lexer.md', 'task-3-ship-it.md', 'task-2-write-docs.md'], // status ASC: closed/done, in-progress, open/ready
  )

  const first = result.rows[0]
  assert.ok(first, 'expected a first row')
  assert.equal(toDisplayString(first.columns['status'] ?? null), 'closed/done')
  assert.equal(toDisplayString(first.columns['file.name'] ?? null), 'task-1-fix-lexer.md')
  assert.ok(first.columns['last_reviewed'] instanceof DateValue)
  // task-3 has no last_reviewed → null column. Narrowed rather than chained:
  // `rows[1]?.columns[...]` would hand `assert.equal` an undefined that is not
  // the null this asserts, so a missing row must fail as a missing row.
  const second = result.rows[1]
  assert.ok(second, 'expected a second row')
  assert.equal(second.columns['last_reviewed'], null)
})

test('queryBase applies only global filters', async () => {
  const source = await readFile(
    join(FIXTURES, 'planning-vault', 'planning', 'tasks', 'tasks.base'),
    'utf8',
  )
  const notes = queryBase(planning, parseBase(source))
  assert.equal(notes.length, 3)
  assert.ok(notes.every((n) => n.file.folder === 'planning/tasks' && n.file.ext === 'md'))
})

// ---------------------------------------------------------------------------
// Filtering, sorting, limits on the basic vault
// ---------------------------------------------------------------------------

test('view filters AND global filters; sort DESC; limit', () => {
  const base = parseBase(`
filters: 'file.ext == "md"'
views:
  - type: table
    name: Active
    filters: 'status == "active"'
    order: [file.name, priority]
    sort:
      - property: priority
        direction: DESC
    limit: 1
`)
  const result = runView(basic, base, 'Active')
  assert.ok(result.total >= 1)
  assert.equal(result.rows.length, 1)
})

test('sorting places empty values last regardless of direction', () => {
  const base = parseBase(`
views:
  - type: table
    name: ByPriority
    sort:
      - property: priority
        direction: DESC
`)
  const result = runView(basic, base, 'ByPriority')
  const priorities = result.rows.map((r) => r.note.properties.priority ?? null)
  let lastNonNull = -1
  priorities.forEach((p, i) => {
    if (p !== null) lastNonNull = i
  })
  const firstNull = priorities.findIndex((p) => p === null)
  if (firstNull !== -1) assert.ok(firstNull > lastNonNull)
})

test('multi-key sort uses second key as tiebreaker', () => {
  const base = parseBase(`
views:
  - type: table
    name: V
    sort:
      - property: file.ext
        direction: ASC
      - property: file.name
        direction: DESC
`)
  const result = runView(basic, base, 'V')
  const names = result.rows.filter((r) => r.note.file.ext === 'md').map((r) => r.note.file.name)
  const sorted = [...names].sort().reverse()
  assert.deepEqual(names, sorted)
})

// ---------------------------------------------------------------------------
// Tags & links vaults
// ---------------------------------------------------------------------------

test('hasTag sees frontmatter and inline tags, deduped and nested', () => {
  const withProject = queryExpression(tags, 'file.hasTag("project")')
  assert.ok(withProject.some((n) => n.file.name === 'mixed-tags.md'))

  // nested-tags.md carries tags like parent/child.
  const nested = queryExpression(tags, 'file.hasTag("status")')
  const mixed = tags.byPath.get('mixed-tags.md')!
  assert.ok(mixed.tags.filter((t) => t === 'project').length === 1, 'frontmatter+inline dedupe')
  assert.ok(nested.length >= 1)

  const none = tags.byPath.get('no-tags.md')!
  assert.equal(none.tags.length, 0)
})

test('links vault: hasLink, embeds, backlinks', () => {
  const hub = links.byPath.get('hub.md')!
  assert.ok(hub.links.length >= 3)
  assert.ok(hub.embeds.some((e) => e.target === 'embedded-content'))

  const linksToSpoke1 = queryExpression(links, 'file.hasLink("spoke-1")')
  assert.ok(linksToSpoke1.some((n) => n.file.name === 'hub.md'))
  assert.ok(!linksToSpoke1.some((n) => n.file.name === 'isolated.md'))

  const spoke1 = links.byPath.get('spoke-1.md')!
  assert.ok(spoke1.backlinks.includes('hub.md'))

  const isolated = links.byPath.get('isolated.md')!
  assert.equal(isolated.backlinks.length, 0)

  // Unresolved link ([[orphan]]) resolves to null path but stays listed.
  assert.ok(hub.links.some((l) => l.target === 'orphan' && l.path === null))
})

test('file.backlinks is queryable from expressions', () => {
  const withBacklinks = queryExpression(links, 'file.backlinks.length > 0')
  assert.ok(withBacklinks.some((n) => n.file.name === 'spoke-1.md'))
  assert.ok(!withBacklinks.some((n) => n.file.name === 'isolated.md'))
})

// ---------------------------------------------------------------------------
// Formulas, groupBy, summaries
// ---------------------------------------------------------------------------

test('formula columns, groupBy, and summaries', () => {
  const base = parseBase(`
formulas:
  age_days: (now() - file.ctime).days.floor()
  shout: status.upper
views:
  - type: table
    name: Grouped
    filters: 'file.ext == "md"'
    order: [file.name, status, formula.age_days]
    groupBy:
      property: status
      direction: ASC
    summaries:
      file.size: Sum
      priority: Sum
      file.name: Filled
`)
  // `status.upper` is not a valid method (only lower/title) — it should error
  // per-cell, not break the whole query. Use age_days + groups + summaries.
  const result = runView(basic, base, 'Grouped')
  assert.ok(result.groups)
  assert.ok(result.groups!.length >= 2)
  // Groups sorted ASC by key; each row's status matches its group key.
  for (const group of result.groups!) {
    for (const row of group.rows) {
      assert.equal(
        toDisplayString(row.columns['status'] ?? null),
        group.keyDisplay === '' ? '' : group.keyDisplay,
      )
    }
  }
  assert.equal(typeof result.summaries['file.size'], 'number')
  // priority is a string property here; numeric Sum has nothing to add up.
  assert.equal(result.summaries['priority'], null)
  assert.equal(result.summaries['file.name'], result.rows.length)
})

test('custom summary formulas over the values keyword', () => {
  const base = parseBase(`
summaries:
  count_high: values.filter(value == "high").length
views:
  - type: table
    name: V
    filters: 'file.inFolder("planning/tasks") && file.ext != "base"'
    summaries:
      impact: count_high
`)
  const result = runView(planning, base, 'V')
  assert.equal(result.summaries['impact'], 2) // task-1 and task-3 are high impact
})

test('a custom summary over an empty view is empty, not an unknown-summary error', () => {
  const base = parseBase(`
summaries:
  count_high: values.filter(value == "high").length
views:
  - type: table
    name: Empty
    filters: 'file.hasProperty("no-such-property")'
    summaries:
      impact: count_high
`)
  const result = runView(planning, base, 'Empty')
  assert.equal(result.rows.length, 0)
  // The custom name must still be recognised with no rows to supply a context
  // note; falling through to the builtin table reports it as unknown.
  assert.equal(result.summaries['impact'], null)
})

test('a summary named after an Object.prototype member is unknown, not a crash', () => {
  // Both the custom table and the builtin table are plain objects; an
  // unguarded index finds inherited members and hands a function to the
  // formula parser / aggregator.
  const base = parseBase(`
summaries:
  count_high: values.filter(value == "high").length
views:
  - type: table
    name: Rows
    filters: 'file.inFolder("planning/tasks") && file.ext != "base"'
    summaries:
      impact: constructor
  - type: table
    name: NoRows
    filters: 'file.hasProperty("no-such-property")'
    summaries:
      impact: hasOwnProperty
`)
  const withRows = runView(planning, base, 'Rows').summaries['impact']
  assert.ok(withRows instanceof ErrorValue, 'expected an ErrorValue, got ' + String(withRows))
  assert.match(withRows.message, /Unknown summary/)

  const withoutRows = runView(planning, base, 'NoRows').summaries['impact']
  assert.ok(withoutRows instanceof ErrorValue, 'expected an ErrorValue, got ' + String(withoutRows))
  assert.match(withoutRows.message, /Unknown summary/)
})

// ---------------------------------------------------------------------------
// this context
// ---------------------------------------------------------------------------

test('this resolves to the hosting file', () => {
  const base = parseBase(`
views:
  - type: table
    name: SameFolder
    filters: 'file.folder == this.file.folder && file.ext == "md"'
`)
  const result = runView(planning, base, 'SameFolder', { thisPath: 'planning/tasks/tasks.base' })
  assert.equal(result.rows.length, 3)
  assert.ok(result.rows.every((r) => r.note.file.folder === 'planning/tasks'))
})

// ---------------------------------------------------------------------------
// Ad-hoc expression queries
// ---------------------------------------------------------------------------

test('queryExpression filters the whole vault', () => {
  const active = queryExpression(basic, 'status == "active"')
  assert.ok(active.length >= 1)
  assert.ok(active.every((n) => n.properties.status === 'active'))

  const md = queryExpression(planning, 'file.ext == "md"')
  assert.equal(md.length, 4)
})

test('default view selection and missing view errors', async () => {
  const source = await readFile(
    join(FIXTURES, 'planning-vault', 'planning', 'tasks', 'tasks.base'),
    'utf8',
  )
  const base = parseBase(source)
  const result = runView(planning, base) // no view name → first view
  assert.equal(result.view.name, 'All tasks')
  assert.throws(() => runView(planning, base, 'Nope'), /View "Nope" not found/)
})

test('a base with no views still queries via a synthesized view', () => {
  const base = parseBase(`filters: 'file.inFolder("planning/tasks") && file.ext != "base"'`)
  const result = runView(planning, base)
  assert.equal(result.total, 3)
})

test('groupBy collects every row whose key errors into one group', () => {
  const base = parseBase(`
formulas:
  broken: nope()
views:
  - type: table
    name: G
    groupBy:
      property: formula.broken
      direction: ASC
`)
  const result = runView(basic, base, 'G')
  assert.ok(result.groups)
  assert.equal(result.groups!.length, 1)
  assert.ok(result.groups![0]!.key instanceof ErrorValue)
  assert.equal(result.groups![0]!.rows.length, basic.notes.length)
})
