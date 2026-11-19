/** describeCorpus, listTypes and describeType. */
import { expect, test } from 'vitest'

import { describeCorpus, describeType, listTypes, QueryError } from '../src/index.ts'
import { corpus, LIBRARY, XREF } from './support.ts'

const library = corpus(LIBRARY)
const xref = corpus(XREF)

test('a corpus at a glance', () => {
  expect(describeCorpus(library)).toEqual({
    name: 'library',
    id: null,
    identity: null,
    version: null,
    level: 2,
    records: 9,
    types: [
      {
        corpus: '',
        name: 'authors',
        title: 'Author',
        description: 'A person who wrote a book.',
        records: 3,
      },
      {
        corpus: '',
        name: 'books',
        title: 'Book',
        description: 'One book on the shelf.',
        records: 6,
      },
    ],
    corpora: [],
    errors: 0,
    warnings: 0,
  })
})

test('the corpora a corpus names, with how it names them', () => {
  const summary = describeCorpus(xref)
  expect(summary.corpora).toEqual([
    {
      key: 'base',
      name: 'org',
      identity: null,
      version: null,
      relation: 'extends and references',
      records: 2,
      types: ['principles'],
    },
  ])
  // The fixture holds a reference of the wrong type on purpose.
  expect(summary.errors).toBe(1)
})

test('the types of one corpus, or of every corpus', () => {
  expect(listTypes(xref).map((t) => t.name)).toEqual(['guides', 'notes', 'rules'])
  expect(listTypes(xref, 'base')).toEqual([
    { corpus: 'base', name: 'principles', title: null, description: null, records: 2 },
  ])
  expect(listTypes(xref, '*').map((t) => `${t.corpus}:${t.name}`)).toEqual([
    ':guides',
    ':notes',
    ':rules',
    'base:principles',
  ])
})

test('one type: kinds, formats, allowed values with titles, and references', () => {
  const books = describeType(library, 'books')
  expect(books).toMatchObject({
    corpus: '',
    name: 'books',
    title: 'Book',
    records: 6,
    origin: 'local',
    chain: ['books'],
  })
  const field = (name: string) => books.fields.find((f) => f.name === name)
  expect(books.fields.map((f) => `${f.name}: ${f.kind}`)).toEqual([
    'title: string',
    'author: string',
    'status: enum',
    'rating: number',
    'pages: integer',
    'published: string',
    'tags: list of string',
    'owned: boolean',
    'edition: object',
    'sequel: string',
  ])
  expect(field('author')).toEqual({
    name: 'author',
    kind: 'string',
    description: 'A link to the author.',
    required: true,
    format: null,
    values: null,
    ref: { types: ['authors'], form: 'link', list: false },
    declaredBy: 'books',
  })
  expect(field('status')?.values).toEqual([
    { value: 'read', title: 'Read' },
    { value: 'reading', title: 'Reading now' },
    { value: 'queued', title: 'On the list' },
  ])
  expect(field('published')?.format).toBe('date')
  expect(field('rating')).toMatchObject({ required: false, ref: null, description: 'Out of five.' })
})

test('a type that builds on a type of another corpus', () => {
  const rules = describeType(xref, 'rules')
  expect(rules.origin).toBe('extends')
  expect(rules.chain).toEqual(['rules', 'base/principles'])
  expect(describeType(xref, 'org/principles')).toMatchObject({ corpus: 'base', records: 2 })
  expect(describeType(xref, 'principles', 'base').name).toBe('principles')
  expect(describeType(xref, 'guides').fields[0]?.ref).toEqual({
    types: ['org/principles'],
    form: 'link',
    list: false,
  })
})

test('an unknown type lists the types', () => {
  expect(() => describeType(library, 'shelves')).toThrow(QueryError)
  expect(() => describeType(library, 'shelves')).toThrow(
    "no type 'shelves' in corpus 'library'; types: authors, books",
  )
  expect(() => listTypes(library, 'nope')).toThrow("no corpus 'nope'")
})
