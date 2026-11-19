/** findRecords and countFacets: each operator, search, sort, paging, projection and each error. */
import { describe, expect, test } from 'vitest'

import { countFacets, findRecords, type Query, QueryError } from '../src/index.ts'
import { corpus, HARNESS, LIBRARY, STANDARD, XREF } from './support.ts'

const library = corpus(LIBRARY)
const ids = (query: Query): string[] => findRecords(library, query).records.map((r) => r.id)
const books = (...where: string[]): string[] => ids({ type: 'books', where })

const fails = (run: () => unknown): [string, string] => {
  try {
    run()
  } catch (e) {
    expect(e).toBeInstanceOf(QueryError)
    return [(e as QueryError).code, (e as Error).message]
  }
  throw new Error('did not throw')
}

describe('what a query reads', () => {
  test('every type of the loaded corpus, by type, then id', () => {
    const all = findRecords(library)
    expect(all.total).toBe(9)
    expect(all.records.map((r) => r.ref)).toEqual([
      'authors/Ada Palmer',
      'authors/Italo Calvino',
      'authors/Ursula Le Guin',
      'books/Cosmicomics',
      'books/Invisible Cities',
      'books/Seven Surrenders',
      'books/The Dispossessed',
      'books/The Left Hand of Darkness',
      'books/Too Like the Lightning',
    ])
  })

  test('one type, or several', () => {
    expect(ids({ type: 'authors' })).toHaveLength(3)
    expect(findRecords(library, { type: ['authors', 'books'] }).total).toBe(9)
    expect(ids({ type: 'Authors' })).toHaveLength(3)
  })

  test('a hit is the record header and its identity, and no data', () => {
    expect(findRecords(library, { type: 'books', limit: 1 }).records[0]).toEqual({
      ref: 'books/Cosmicomics',
      corpus: '',
      type: 'books',
      id: 'Cosmicomics',
      path: 'books/Cosmicomics.yaml',
      title: 'Cosmicomics',
      identity: null,
    })
  })
})

describe('filters', () => {
  test('equal and not equal, on strings, numbers and booleans', () => {
    expect(books('status=reading')).toEqual(['Invisible Cities'])
    expect(books('status!=read')).toEqual([
      'Invisible Cities',
      'Seven Surrenders',
      'Too Like the Lightning',
    ])
    expect(books('pages=304')).toEqual(['The Left Hand of Darkness'])
    expect(books('rating=5.0')).toEqual(['The Left Hand of Darkness'])
    expect(books('owned=false')).toEqual(['Cosmicomics', 'Invisible Cities'])
    expect(ids({ type: 'books', where: [{ field: 'pages', op: 'eq', value: 304 }] })).toEqual([
      'The Left Hand of Darkness',
    ])
    expect(ids({ type: 'books', where: [{ field: 'owned', op: 'eq', value: true }] })).toHaveLength(
      3,
    )
  })

  test('one of and none of', () => {
    expect(books('status=reading,queued')).toEqual([
      'Invisible Cities',
      'Seven Surrenders',
      'Too Like the Lightning',
    ])
    expect(books('status!=reading,queued')).toEqual([
      'Cosmicomics',
      'The Dispossessed',
      'The Left Hand of Darkness',
    ])
  })

  test('contains, on a string and on the items of a list, without regard to case', () => {
    expect(books('title~CITT')).toEqual(['Invisible Cities'])
    expect(books('tags~fic')).toHaveLength(4)
    expect(books('tags!~fic')).toEqual(['Cosmicomics', 'Invisible Cities'])
    expect(books('edition~harper')).toEqual(['The Dispossessed'])
  })

  test('a list field holds a value when one item is it', () => {
    expect(books('tags=utopia')).toEqual(['The Dispossessed', 'Too Like the Lightning'])
    expect(books('tags=utopia', 'tags=philosophy')).toEqual(['Too Like the Lightning'])
    expect(books('tags!=science-fiction')).toEqual(['Cosmicomics', 'Invisible Cities'])
  })

  test('has a value, has none', () => {
    expect(books('rating=')).toEqual(['Seven Surrenders', 'Too Like the Lightning'])
    expect(books('rating!=')).toHaveLength(4)
    expect(books('tags=')).toEqual(['Cosmicomics'])
    expect(ids({ type: 'books', where: [{ field: 'sequel', op: 'exists' }] })).toEqual([
      'Too Like the Lightning',
    ])
  })

  test('comparisons, on numbers and on date strings', () => {
    expect(books('rating>4')).toEqual(['The Dispossessed', 'The Left Hand of Darkness'])
    expect(books('rating>=4')).toHaveLength(3)
    expect(books('pages<165')).toEqual(['Cosmicomics'])
    expect(books('pages<=165')).toEqual(['Cosmicomics', 'Invisible Cities'])
    expect(books('published>=2016-01-01')).toEqual(['Seven Surrenders', 'Too Like the Lightning'])
    expect(books('published<1970')).toEqual(['Cosmicomics', 'The Left Hand of Darkness'])
    expect(books('pages>9')).toHaveLength(6)
  })

  test('a path into an object', () => {
    expect(books('edition.publisher=Ace')).toEqual(['The Left Hand of Darkness'])
    expect(books('edition.year<1970')).toEqual(['The Left Hand of Darkness'])
    expect(books('edition.year=')).toHaveLength(4)
  })

  test('a reference field names the record it points at', () => {
    const le = ['The Dispossessed', 'The Left Hand of Darkness']
    expect(books('author=Ursula Le Guin')).toEqual(le)
    expect(books('author=authors/Ursula Le Guin')).toEqual(le)
    expect(books('author=authors/Ursula Le Guin.md')).toEqual(le)
    expect(books('author=ursula le guin')).toEqual(le)
    expect(
      ids({
        type: 'books',
        where: [{ field: 'author', op: 'eq', value: { type: 'authors', id: 'Ursula Le Guin' } }],
      }),
    ).toEqual(le)
    expect(books('author!=Ursula Le Guin')).toHaveLength(4)
    expect(books('author=Ada Palmer,Italo Calvino')).toHaveLength(4)
    expect(books('sequel=Seven Surrenders')).toEqual(['Too Like the Lightning'])
  })

  test('record facts, with @ and without', () => {
    expect(ids({ where: '@type=authors' })).toHaveLength(3)
    expect(ids({ where: '@id~cities' })).toEqual(['Invisible Cities'])
    expect(ids({ where: '@format=yaml' })).toEqual(['Cosmicomics'])
    expect(ids({ where: '@body~venice' })).toEqual(['Invisible Cities'])
    expect(ids({ where: 'path~books/The' })).toHaveLength(2)
    // books declares `title`, so the bare name is the data field there.
    expect(ids({ type: 'books', where: 'title~invisibili' })).toEqual(['Invisible Cities'])
    expect(ids({ type: 'books', where: '@title~darkness' })).toEqual(['The Left Hand of Darkness'])
  })

  test('every filter must hold, whichever way it is written', () => {
    const want = ['The Dispossessed']
    expect(ids({ type: 'books', where: 'status=read tags=utopia' })).toEqual(want)
    expect(ids({ type: 'books', where: ['status=read', 'tags=utopia'] })).toEqual(want)
    expect(
      ids({ type: 'books', where: ['status=read', { field: 'tags', op: 'eq', value: 'utopia' }] }),
    ).toEqual(want)
  })
})

describe('search', () => {
  test('every word must be in the title, a field or the body', () => {
    expect(ids({ search: 'utopia' })).toEqual([
      'The Dispossessed',
      'Too Like the Lightning',
      'Seven Surrenders',
    ])
    expect(ids({ search: 'utopia lightning' })).toEqual([
      'Too Like the Lightning',
      'Seven Surrenders',
    ])
    expect(ids({ search: 'UTOPIA nothing-has-this' })).toEqual([])
  })

  test('a title match ranks above a body match, and a phrase is one term', () => {
    expect(ids({ search: 'darkness' })).toEqual(['The Left Hand of Darkness', 'The Dispossessed'])
    expect(ids({ search: '"winter planet"' })).toEqual(['The Left Hand of Darkness'])
    expect(ids({ search: 'planet winter' })).toEqual(['The Left Hand of Darkness'])
    expect(ids({ search: '"planet winter"' })).toEqual([])
  })

  test('a hit carries its score and the text around the match', () => {
    const [hit] = findRecords(library, { search: 'venice' }).records
    expect(hit?.score).toBe(2)
    expect(hit?.snippet).toBe(
      'Marco Polo describes fifty-five cities to Kublai Khan. Every city is Venice.',
    )
    expect(findRecords(library, { search: 'calvino', type: 'books' }).records[0]?.snippet).toMatch(
      /Italo Calvino/,
    )
  })

  test('search and filters combine, and sort overrides the ranking', () => {
    expect(ids({ search: 'utopia', where: 'status=queued' })).toEqual([
      'Too Like the Lightning',
      'Seven Surrenders',
    ])
    expect(ids({ search: 'utopia', sort: 'pages' })).toEqual([
      'Seven Surrenders',
      'The Dispossessed',
      'Too Like the Lightning',
    ])
  })
})

describe('sort and paging', () => {
  test('ascending, descending, and by several fields', () => {
    expect(ids({ type: 'books', sort: 'pages' })[0]).toBe('Cosmicomics')
    expect(ids({ type: 'books', sort: '-pages' })[0]).toBe('Too Like the Lightning')
    expect(ids({ type: 'books', sort: ['status', '-published'] })).toEqual([
      'Seven Surrenders',
      'Too Like the Lightning',
      'The Dispossessed',
      'The Left Hand of Darkness',
      'Cosmicomics',
      'Invisible Cities',
    ])
    expect(ids({ type: 'books', sort: 'status,-published' })).toEqual(
      ids({ type: 'books', sort: ['status', '-published'] }),
    )
    expect(ids({ type: 'authors', sort: '-born' })).toEqual([
      'Ada Palmer',
      'Ursula Le Guin',
      'Italo Calvino',
    ])
  })

  test('a record with no value sorts last in both directions, and ties keep id order', () => {
    expect(ids({ type: 'books', sort: 'rating' }).slice(-2)).toEqual([
      'Seven Surrenders',
      'Too Like the Lightning',
    ])
    expect(ids({ type: 'books', sort: '-rating' }).slice(-2)).toEqual([
      'Seven Surrenders',
      'Too Like the Lightning',
    ])
    expect(ids({ type: 'books', sort: 'owned' })).toEqual(ids({ type: 'books', sort: 'owned' }))
  })

  test('limit, offset, total and next', () => {
    const first = findRecords(library, { type: 'books', limit: 4 })
    expect(first).toMatchObject({ total: 6, offset: 0, limit: 4, next: 4 })
    expect(first.records).toHaveLength(4)
    const second = findRecords(library, { type: 'books', limit: 4, offset: 4 })
    expect(second).toMatchObject({ total: 6, offset: 4, next: null })
    expect(second.records.map((r) => r.id)).toEqual([
      'The Left Hand of Darkness',
      'Too Like the Lightning',
    ])
    expect(findRecords(library, { limit: 0 })).toEqual({
      total: 9,
      offset: 0,
      limit: 0,
      next: 0,
      records: [],
    })
    expect(findRecords(library, { offset: 99 }).records).toEqual([])
  })
})

describe('projection', () => {
  test('named fields, a path, every field, and the body', () => {
    const one = (query: Query) =>
      findRecords(library, { type: 'books', where: 'pages=387', ...query }).records[0]
    expect(one({ fields: ['status', 'edition.year', 'sequel'] })?.data).toEqual({
      status: 'read',
      'edition.year': 1974,
    })
    expect(one({ fields: 'status,pages' })?.data).toEqual({ status: 'read', pages: 387 })
    expect(Object.keys(one({ fields: ['*'] })?.data ?? {})).toEqual([
      'author',
      'status',
      'rating',
      'pages',
      'published',
      'tags',
      'owned',
      'edition',
    ])
    expect(one({})?.data).toBeUndefined()
    expect(one({})?.body).toBeUndefined()
    expect(one({ body: true })?.body).toMatch(/^\nAn ambiguous utopia/)
    expect(findRecords(library, { where: '@format=yaml', body: true }).records[0]?.body).toBeNull()
  })
})

describe('facets', () => {
  test('counts each value, most frequent first, then by value', () => {
    expect(countFacets(library, { type: 'books', fields: ['status', 'owned'] })).toEqual({
      total: 6,
      facets: [
        {
          field: 'status',
          distinct: 3,
          missing: 0,
          values: [
            { value: 'read', count: 3 },
            { value: 'queued', count: 2 },
            { value: 'reading', count: 1 },
          ],
        },
        {
          field: 'owned',
          distinct: 2,
          missing: 1,
          values: [
            { value: true, count: 3 },
            { value: false, count: 2 },
          ],
        },
      ],
    })
  })

  test('an item of a list counts once, and a reference counts as its target', () => {
    const { facets } = countFacets(library, { type: 'books', fields: 'tags,author', top: 2 })
    expect(facets[0]).toEqual({
      field: 'tags',
      distinct: 6,
      missing: 1,
      values: [
        { value: 'science-fiction', count: 4 },
        { value: 'utopia', count: 2 },
      ],
    })
    expect(facets[1]?.values).toEqual([
      { value: 'authors/Ada Palmer', count: 2 },
      { value: 'authors/Italo Calvino', count: 2 },
    ])
  })

  test('over a filtered set, a path, and a record fact', () => {
    expect(
      countFacets(library, { type: 'books', where: 'status=read', fields: ['edition.publisher'] })
        .facets[0],
    ).toMatchObject({ distinct: 2, missing: 1 })
    expect(countFacets(library, { fields: ['@type'] }).facets[0]?.values).toEqual([
      { value: 'books', count: 6 },
      { value: 'authors', count: 3 },
    ])
    expect(countFacets(library, { search: 'utopia', fields: ['status'] }).total).toBe(3)
  })
})

describe('errors say what exists', () => {
  test('an unknown type, corpus or field', () => {
    expect(fails(() => findRecords(library, { type: 'book' }))).toEqual([
      'unknown-type',
      "no type 'book' in corpus 'library'; types: authors, books",
    ])
    expect(fails(() => findRecords(library, { corpus: 'org' }))).toEqual([
      'unknown-corpus',
      "no corpus 'org' in the graph of 'library'; corpus keys: none",
    ])
    expect(fails(() => findRecords(library, { type: 'authors', where: 'age=x' }))).toEqual([
      'unknown-field',
      "no field 'age' in type 'authors'; fields: born, country",
    ])
    expect(fails(() => findRecords(library, { where: 'nope=x' }))).toEqual([
      'unknown-field',
      "no field 'nope' in types authors, books; fields: born, country, title, author, status, rating, pages, published, tags, owned, edition, sequel",
    ])
    expect(fails(() => findRecords(library, { where: '@nope=x' }))[1]).toMatch(
      /^no record fact '@nope'; facts: @id, @type, @title, /,
    )
    expect(fails(() => findRecords(library, { type: 'books', sort: 'nope' }))[0]).toBe(
      'unknown-field',
    )
    expect(fails(() => findRecords(library, { type: 'books', fields: ['nope'] }))[0]).toBe(
      'unknown-field',
    )
    expect(fails(() => countFacets(library, { type: 'books', fields: ['nope'] }))[0]).toBe(
      'unknown-field',
    )
  })

  test("a value the field's schema rules out", () => {
    expect(fails(() => findRecords(library, { type: 'books', where: 'status=done' }))).toEqual([
      'bad-value',
      "'done' is not a value of field 'status' in type 'books'; values: read, reading, queued",
    ])
    expect(fails(() => findRecords(library, { type: 'books', where: 'pages>many' }))).toEqual([
      'bad-value',
      "'many' is not a number; field 'pages' of type 'books' holds numbers",
    ])
    expect(findRecords(library, { type: 'books', where: 'status!=done' }).total).toBe(6)
  })

  test('null is a value of a number field, in the string and the JSON form', () => {
    const count = (where: NonNullable<Query['where']>) =>
      findRecords(library, { type: 'books', where }).total
    expect(count('rating=null') + count('rating!=null')).toBe(6)
    const absent = count([{ field: 'rating', op: 'eq', value: null }])
    expect(absent).toBe(2)
    expect(count([{ field: 'rating', op: 'ne', value: null }])).toBe(6 - absent)
  })

  test('a query of the wrong shape', () => {
    expect(fails(() => findRecords(library, { limit: -1 }))).toEqual([
      'bad-query',
      'limit: expected a whole number, 0 or more, got -1',
    ])
    expect(fails(() => findRecords(library, { filter: 'x' } as Query))).toEqual([
      'bad-query',
      "no query key 'filter'; keys: type, corpus, where, search, sort, limit, offset, fields, body",
    ])
    expect(
      fails(() => findRecords(library, { where: [{ field: 'a', op: 'like' }] } as never))[1],
    ).toBe(
      "where[0]: no op 'like'; ops: ne, ncontains, gte, lte, eq, contains, gt, lt, in, nin, exists",
    )
    expect(fails(() => findRecords(library, { where: 'status' }))).toEqual([
      'bad-filter',
      "'status': no operator; write <field><op><value> with one of = != ~ !~ > >= < <=",
    ])
    for (const query of [{ sort: 1 }, { fields: [1] }, { type: 5 }, { type: [1] }])
      expect([JSON.stringify(query), fails(() => findRecords(library, query as never))[0]]).toEqual(
        [JSON.stringify(query), 'bad-query'],
      )
    expect(fails(() => findRecords(library, { sort: 1 } as never))[1]).toBe(
      'sort: expected a string or a list of strings',
    )
    expect(fails(() => countFacets(library, { fields: [] }))).toEqual([
      'bad-query',
      'fields: name at least one field to count',
    ])
  })
})

describe('referenced corpora', () => {
  const xref = corpus(XREF)

  test('the loaded corpus by default, one corpus by key, or every corpus', () => {
    expect(findRecords(xref).records.map((r) => r.ref)).toEqual([
      'guides/Inherited',
      'guides/Local Rule',
      'guides/Wrong Type',
      'notes/Lunch',
      'rules/Review Kindly',
    ])
    expect(findRecords(xref, { corpus: 'base' }).records.map((r) => r.ref)).toEqual([
      'base/principles/Be Kind',
      'base/principles/Ship Small',
    ])
    expect(findRecords(xref, { corpus: '*' }).total).toBe(7)
  })

  test('a type by its namespace path, under either prefix, is one set of records', () => {
    const byPath = findRecords(xref, { type: 'org/principles', fields: ['*'] })
    expect(byPath.records.map((r) => r.ref)).toEqual([
      'base/principles/Be Kind',
      'base/principles/Ship Small',
    ])
    expect(byPath.records[0]).toMatchObject({
      corpus: 'base',
      type: 'principles',
      data: { statement: 'Treat people with care.' },
    })
    expect(findRecords(xref, { type: 'base/principles' })).toEqual(
      findRecords(xref, { type: 'org/principles' }),
    )
    expect(findRecords(xref, { type: ['org/principles', 'base/principles'] }).total).toBe(2)
    expect(findRecords(xref, { type: 'principles', corpus: '*' }).total).toBe(2)
  })

  test('a reference into the referenced corpus is found by the record it names', () => {
    const follows = (value: string): string[] =>
      findRecords(xref, {
        type: 'guides',
        where: [{ field: 'follows', op: 'eq', value }],
      }).records.map((r) => r.id)
    expect(follows('Be Kind')).toEqual(['Inherited'])
    expect(follows('base/principles/Be Kind')).toEqual(['Inherited'])
    expect(follows('principles/Be Kind')).toEqual(['Inherited'])
    expect(countFacets(xref, { type: 'guides', fields: ['follows'] }).facets[0]?.values).toEqual([
      { value: '[Lunch](../notes/Lunch.md)', count: 1 },
      { value: 'base/principles/Be Kind', count: 1 },
      { value: 'rules/Review Kindly', count: 1 },
    ])
  })

  test('an unknown corpus key lists the keys', () => {
    expect(fails(() => findRecords(xref, { corpus: 'nope' }))[1]).toBe(
      "no corpus 'nope' in the graph of 'references-xref'; corpus keys: base",
    )
    expect(fails(() => findRecords(xref, { type: 'nope/principles' }))[0]).toBe('unknown-corpus')
  })
})

describe('other corpora', () => {
  test("the spec's example: a record in a nested folder, and an enum", () => {
    const standard = corpus(STANDARD)
    expect(findRecords(standard, { where: 'vendor=Google' }).records.map((r) => r.path)).toEqual([
      'harnesses/Antigravity.md',
      'harnesses/google/Gemini CLI.md',
    ])
    expect(countFacets(standard, { fields: ['status'] }).total).toBe(3)
  })

  test('the harness reference: a few thousand records', () => {
    const harness = corpus(HARNESS)
    expect(harness.errors).toEqual([])
    const all = findRecords(harness, { limit: 0 })
    expect(all.total).toBeGreaterThan(2000)
    const claude = findRecords(harness, {
      type: 'statements',
      where: ['status=current', 'harness=Claude Code'],
      fields: ['strength'],
    })
    expect(claude.total).toBeGreaterThan(10)
    expect(claude.records.every((r) => r.id.startsWith('Claude Code'))).toBe(true)
    const started = performance.now()
    const found = findRecords(harness, { search: 'hooks', limit: 5 })
    expect(found.total).toBeGreaterThan(5)
    expect(findRecords(harness, { search: 'hooks', limit: 5 })).toEqual(found)
    // Two searches of every record, the first of which lowercases them all.
    expect(performance.now() - started).toBeLessThan(2000)
  })
})
