import { test } from 'vitest'
import assert from 'node:assert/strict'
import { parseBase, extractEmbeddedBases, BaseParseError } from '../../src/base/parse.ts'

test('parses the real planning tasks.base shape', () => {
  const base = parseBase(`
filters:
  and:
    - file.inFolder("planning/tasks")
    - file.ext != "base"
views:
  - type: table
    name: All tasks
    order:
      - status
      - impact
      - file.name
    sort:
      - property: status
        direction: ASC
`)
  assert.ok(base.filters)
  assert.equal(base.filters!.type, 'and')
  const and = base.filters as { children: unknown[] }
  assert.equal(and.children.length, 2)
  assert.equal(base.views.length, 1)
  const view = base.views[0]
  assert.equal(view?.type, 'table')
  assert.equal(view?.name, 'All tasks')
  assert.deepEqual(view?.order, ['status', 'impact', 'file.name'])
  assert.deepEqual(view?.sort, [{ property: 'status', direction: 'ASC' }])
})

test('filters accept a plain string expression', () => {
  const base = parseBase(`filters: 'status != "done"'`)
  assert.equal(base.filters!.type, 'expr')
})

test('nested and/or/not filter groups', () => {
  const base = parseBase(`
filters:
  or:
    - file.hasTag("book")
    - and:
        - file.hasTag("movie")
        - rating > 3
    - not:
        - file.hasTag("dropped")
        - file.inFolder("archive")
`)
  const or = base.filters as {
    type: string
    children: Array<{ type: string; children?: unknown[] }>
  }
  assert.equal(or.type, 'or')
  assert.equal(or.children.length, 3)
  assert.equal(or.children[1]?.type, 'and')
  assert.equal(or.children[2]?.type, 'not')
  // not = none-of: multiple children allowed
  assert.equal(or.children[2]?.children?.length, 2)
})

test('formulas and summaries parse and validate', () => {
  const base = parseBase(`
formulas:
  ppu: price / units
summaries:
  spread: values.sort()[values.length - 1] - values.sort()[0]
views:
  - type: table
    name: With summaries
    summaries:
      formula.ppu: Average
      price: spread
`)
  assert.equal(base.formulas.ppu, 'price / units')
  assert.ok(base.summaries.spread)
  assert.deepEqual(base.views[0]?.summaries, { 'formula.ppu': 'Average', price: 'spread' })
})

test('invalid formula expressions fail with path context', () => {
  assert.throws(
    () => parseBase('formulas:\n  broken: "status =="'),
    (e: Error) => e instanceof BaseParseError && e.message.includes('formulas.broken'),
  )
})

test('legacy sort key "column" is accepted as property', () => {
  const base = parseBase(`
views:
  - type: table
    name: Legacy
    sort:
      - column: status
        direction: DESC
`)
  assert.deepEqual(base.views[0]?.sort, [{ property: 'status', direction: 'DESC' }])
})

test('sort direction is case-insensitive and validated', () => {
  const base = parseBase(`
views:
  - type: table
    name: V
    sort:
      - property: a
        direction: desc
`)
  assert.equal(base.views[0]?.sort[0]?.direction, 'DESC')
  assert.throws(
    () =>
      parseBase(
        'views:\n  - type: table\n    sort:\n      - property: a\n        direction: sideways',
      ),
    BaseParseError,
  )
})

test('groupBy parses property and direction', () => {
  const base = parseBase(`
views:
  - type: cards
    name: Grouped
    groupBy:
      property: status
      direction: DESC
`)
  assert.deepEqual(base.views[0]?.groupBy, { property: 'status', direction: 'DESC' })
})

test('unknown view keys are preserved in extra (round-trip contract)', () => {
  const base = parseBase(`
views:
  - type: cards
    name: Gallery
    image: note.cover
    imageAspectRatio: 0.45
    cardSize: 230
  - type: map
    name: Places
    coordinates: note.location
    defaultZoom: 6
`)
  assert.equal(base.views[0]?.extra.image, 'note.cover')
  assert.equal(base.views[0]?.extra.imageAspectRatio, 0.45)
  assert.equal(base.views[0]?.extra.cardSize, 230)
  assert.equal(base.views[1]?.type, 'map')
  assert.equal(base.views[1]?.extra.coordinates, 'note.location')
})

test('unknown top-level keys are preserved', () => {
  const base = parseBase('filters: "x == 1"\ncustomState: 42')
  assert.equal(base.extra.customState, 42)
})

test('plugin view types are allowed', () => {
  const base = parseBase('views:\n  - type: cms\n    name: CMS')
  assert.equal(base.views[0]?.type, 'cms')
})

test('properties config with displayName', () => {
  const base = parseBase(`
properties:
  status:
    displayName: State
  note.price: Price
`)
  assert.deepEqual(base.properties.status, { displayName: 'State' })
  assert.deepEqual(base.properties['note.price'], { displayName: 'Price' })
})

test('empty base file parses to an empty definition', () => {
  const base = parseBase('')
  assert.equal(base.filters, null)
  assert.deepEqual(base.views, [])
})

test('invalid YAML and non-mapping roots are rejected', () => {
  assert.throws(() => parseBase('views: ['), BaseParseError)
  assert.throws(() => parseBase('- a\n- b'), BaseParseError)
})

test('view without type is rejected; missing name gets a default', () => {
  assert.throws(() => parseBase('views:\n  - name: NoType'), BaseParseError)
  const base = parseBase('views:\n  - type: table')
  assert.equal(base.views[0]?.name, 'View 1')
})

test('limit must be a non-negative number', () => {
  assert.throws(() => parseBase('views:\n  - type: table\n    limit: -1'), BaseParseError)
  const base = parseBase('views:\n  - type: table\n    limit: 10')
  assert.equal(base.views[0]?.limit, 10)
})

test('extractEmbeddedBases finds base code blocks', () => {
  const markdown = `# Note

Some text.

\`\`\`base
filters: 'file.hasTag("x")'
views:
  - type: list
    name: Embedded
\`\`\`

More text.

\`\`\`js
// not a base
\`\`\`
`
  const bases = extractEmbeddedBases(markdown)
  assert.equal(bases.length, 1)
  assert.equal(bases[0]?.views[0]?.name, 'Embedded')
})

test('YAML single-quote wrapping of double-quoted expressions works', () => {
  const base = parseBase(`filters: 'status == "active" && file.hasTag("work")'`)
  assert.equal(base.filters!.type, 'expr')
})
