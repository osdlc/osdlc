import { describe, expect, test } from 'vitest'
import { loadCorpus, type CorpusField } from '@osdlc/corpus-schema'
import {
  defaultColumns,
  defaultControl,
  defaultFilters,
  fieldSchemaAt,
  fieldShape,
  humanize,
  shapeOf,
  type FieldShape,
} from '../src/schema.ts'
import { CORPUS, exampleSite } from './helpers.ts'

const model = loadCorpus(CORPUS)
const books = model.types.find((t) => t.name === 'books')!

describe('shapeOf', () => {
  const kind = (schema: unknown): string => {
    const shape = shapeOf(schema, null)
    return `${shape.kind}${shape.list ? '[]' : ''}`
  }

  test('reads the kind from the type and the format', () => {
    expect(kind({ type: 'string' })).toBe('text')
    expect(kind({ type: ['string', 'null'] })).toBe('text')
    expect(kind({ type: 'string', format: 'date' })).toBe('date')
    expect(kind({ type: 'string', format: 'date-time' })).toBe('datetime')
    expect(kind({ type: 'string', format: 'uri' })).toBe('url')
    expect(kind({ type: 'integer' })).toBe('number')
    expect(kind({ type: 'number' })).toBe('number')
    expect(kind({ type: 'boolean' })).toBe('boolean')
    expect(kind({ type: 'object' })).toBe('json')
    expect(kind({ type: ['string', 'number'] })).toBe('json')
    expect(kind({})).toBe('json')
    expect(kind(true)).toBe('json')
  })

  test('reads lists from items, and a list of objects is one json value', () => {
    expect(kind({ type: 'array', items: { type: 'string' } })).toBe('text[]')
    expect(kind({ type: 'array', items: { enum: ['a', 'b'] } })).toBe('enum[]')
    expect(kind({ type: 'array', items: { type: 'object' } })).toBe('json')
    expect(kind({ type: 'array' })).toBe('json[]')
  })

  test('reads enum values from enum, const and oneOf const with titles', () => {
    expect(shapeOf({ enum: ['a', 'b', null] }, null).options).toEqual([
      { value: 'a', label: 'a', description: null },
      { value: 'b', label: 'b', description: null },
    ])
    expect(
      shapeOf(
        {
          oneOf: [
            { const: 'p1', title: 'Urgent', description: 'Today' },
            { const: 2 },
            { type: 'null' },
          ],
        },
        null,
      ).options,
    ).toEqual([
      { value: 'p1', label: 'Urgent', description: 'Today' },
      { value: '2', label: '2', description: null },
    ])
    expect(shapeOf({ oneOf: [{ const: 'a' }, { type: 'string' }] }, null).kind).toBe('json')
  })

  test('an x-ref makes a reference, and $ref is followed into $defs', () => {
    const ref = { types: ['books'], targets: null, form: 'link' as const, items: true }
    expect(shapeOf({ type: 'array' }, ref)).toEqual({ kind: 'reference', list: true, options: [] })
    const root = { $defs: { level: { enum: ['low', 'high'] } } }
    expect(shapeOf({ $ref: '#/$defs/level' }, null, root).kind).toBe('enum')
  })
})

test('fieldSchemaAt follows dotted names through properties', () => {
  expect(fieldSchemaAt(books, 'year')).toMatchObject({ type: 'integer' })
  expect(fieldSchemaAt(books, 'edition.format')).toMatchObject({
    enum: ['paperback', 'hardback', 'ebook'],
  })
  expect(fieldSchemaAt(books, 'edition.isbn')).toBeUndefined()
  expect(fieldSchemaAt(books, 'isbn')).toBeUndefined()
  expect(fieldShape(books, 'status').options.map((o) => o.label)).toEqual([
    'To read',
    'Reading',
    'Finished',
    'Abandoned',
  ])
  expect(fieldShape(books, 'author').kind).toBe('reference')
})

test('defaultControl follows the kind', () => {
  const control = (shape: Partial<FieldShape>) =>
    defaultControl({ kind: 'text', list: false, options: [], ...shape })
  const options = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ value: `${i}`, label: `${i}`, description: null }))
  expect(control({ kind: 'enum', options: options(6) })).toBe('chips')
  expect(control({ kind: 'enum', options: options(7) })).toBe('select')
  expect(control({ kind: 'boolean' })).toBe('toggle')
  expect(control({ kind: 'number' })).toBe('range')
  expect(control({ kind: 'date' })).toBe('range')
  expect(control({ kind: 'datetime' })).toBe('range')
  expect(control({ kind: 'reference' })).toBe('select')
  expect(control({ kind: 'text' })).toBe('search')
  expect(control({ kind: 'json' })).toBe('hidden')
})

describe('the defaults for a type', () => {
  const shaped = books.fields.map((field: CorpusField) => ({
    field,
    shape: shapeOf(field.schema, field.ref, books.schema),
  }))

  test('columns are the title, then required fields, then enums before numbers', () => {
    expect(defaultColumns(shaped)).toEqual(['title', 'status', 'author', 'year', 'genres'])
  })

  test('filters are the enum, reference, number, date and boolean fields, up to six', () => {
    expect(defaultFilters(shaped)).toEqual([
      'author',
      'status',
      'year',
      'pages',
      'fiction',
      'genres',
    ])
  })

  test('a site with no config uses them', () => {
    const type = exampleSite().type('books')!
    expect(type.columns).toEqual(['title', 'status', 'author', 'year', 'genres'])
    expect(type.filters).toEqual(['author', 'status', 'year', 'pages', 'fiction', 'genres'])
    expect(type.fields.find((f) => f.name === 'status')).toMatchObject({
      label: 'Status',
      control: 'chips',
      help: 'How far the reading has got.',
      format: { kind: 'badge' },
    })
  })
})

test('humanize writes a field name in words', () => {
  expect(humanize('version_basis')).toBe('Version basis')
  expect(humanize('reportedIn')).toBe('Reported in')
  expect(humanize('study-results')).toBe('Study results')
  expect(humanize('scope.platform')).toBe('Platform')
})
