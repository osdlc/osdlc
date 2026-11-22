import { test, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { scanVault, type VaultIndex } from '@osdlc/markdown-vault'
import { queryVault } from '../src/query.ts'

const FIXTURES = join(import.meta.dirname, 'fixtures')

let basic: VaultIndex

beforeAll(async () => {
  basic = await scanVault(join(FIXTURES, 'basic-vault'))
})

test('queryVault with no filter returns every note', () => {
  const { notes, total } = queryVault(basic)
  assert.equal(total, basic.notes.length)
  assert.equal(notes.length, basic.notes.length)
})

test('queryVault empty filter string matches all', () => {
  const { total } = queryVault(basic, { filter: '   ' })
  assert.equal(total, basic.notes.length)
})

test('queryVault narrows by filter expression and reports the match total', () => {
  const { notes, total } = queryVault(basic, { filter: 'status == "active"' })
  assert.equal(total, 1)
  assert.equal(notes.length, 1)
  assert.equal(notes[0]?.file.name, 'note-1.md')
  assert.ok(notes.every((n) => n.properties.status === 'active'))
})

test('queryVault sorts by a property id (ASC/DESC)', () => {
  const asc = queryVault(basic, { sort: [{ property: 'file.name', direction: 'ASC' }] })
  const names = asc.notes.map((n) => n.file.name)
  assert.deepEqual(names, [...names].sort())

  const desc = queryVault(basic, { sort: [{ property: 'file.name', direction: 'DESC' }] })
  assert.deepEqual(
    desc.notes.map((n) => n.file.name),
    [...names].reverse(),
  )
})

test('queryVault applies offset and limit after sorting; total stays the full match count', () => {
  const all = queryVault(basic, { sort: [{ property: 'file.name', direction: 'ASC' }] })
  const page = queryVault(basic, {
    sort: [{ property: 'file.name', direction: 'ASC' }],
    offset: 1,
    limit: 2,
  })
  assert.equal(page.total, all.total)
  assert.equal(page.notes.length, 2)
  assert.deepEqual(
    page.notes.map((n) => n.file.name),
    all.notes.slice(1, 3).map((n) => n.file.name),
  )
})

test('queryVault sorts empty property values last regardless of direction', () => {
  // note-4 and plain-note have no `priority`; those must trail under DESC too.
  const { notes } = queryVault(basic, { sort: [{ property: 'priority', direction: 'DESC' }] })
  const priorities = notes.map((n) => n.properties.priority ?? null)
  const firstNull = priorities.findIndex((p) => p === null)
  let lastNonNull = -1
  priorities.forEach((p, i) => {
    if (p !== null) lastNonNull = i
  })
  if (firstNull !== -1) assert.ok(firstNull > lastNonNull)
})
