/** readRecord, getReferences, getBacklinks and traverse. */
import { describe, expect, test } from 'vitest'

import {
  getBacklinks,
  getReferences,
  QueryError,
  readRecord,
  type RecordRef,
  traverse,
} from '../src/index.ts'
import { corpus, LIBRARY, XREF } from './support.ts'

const library = corpus(LIBRARY)
const xref = corpus(XREF)

const fails = (run: () => unknown): [string, string] => {
  try {
    run()
  } catch (e) {
    expect(e).toBeInstanceOf(QueryError)
    return [(e as QueryError).code, (e as Error).message]
  }
  throw new Error('did not throw')
}

describe('readRecord', () => {
  test('a record in full', () => {
    expect(readRecord(library, 'books/Too Like the Lightning')).toEqual({
      ref: 'books/Too Like the Lightning',
      corpus: '',
      type: 'books',
      id: 'Too Like the Lightning',
      path: 'books/Too Like the Lightning.md',
      title: 'Too Like the Lightning',
      identity: null,
      format: 'md',
      valid: true,
      files: [],
      data: {
        author: '[Ada Palmer](../authors/Ada%20Palmer.md)',
        status: 'queued',
        pages: 432,
        published: '2016-05-10',
        tags: ['science-fiction', 'utopia', 'philosophy'],
        owned: true,
        sequel: '[Seven Surrenders](Seven%20Surrenders.md)',
      },
      body: '\nThe year 2454. A convict narrates a week in which a utopia starts to come apart.\n',
      references: [
        {
          via: 'reference',
          field: 'author',
          pointer: '/author',
          value: '[Ada Palmer](../authors/Ada%20Palmer.md)',
          target: {
            ref: 'authors/Ada Palmer',
            corpus: '',
            type: 'authors',
            id: 'Ada Palmer',
            path: 'authors/Ada Palmer.md',
            title: 'Ada Palmer',
          },
          unresolved: null,
        },
        {
          via: 'reference',
          field: 'sequel',
          pointer: '/sequel',
          value: '[Seven Surrenders](Seven%20Surrenders.md)',
          target: {
            ref: 'books/Seven Surrenders',
            corpus: '',
            type: 'books',
            id: 'Seven Surrenders',
            path: 'books/Seven Surrenders.md',
            title: 'Seven Surrenders',
          },
          unresolved: null,
        },
      ],
      backlinks: [],
    })
  })

  test('each part can be left out', () => {
    const bare = readRecord(library, 'books/Cosmicomics', {
      body: false,
      references: false,
      backlinks: false,
    })
    expect(Object.keys(bare)).toEqual([
      'ref',
      'corpus',
      'type',
      'id',
      'path',
      'title',
      'identity',
      'format',
      'valid',
      'files',
      'data',
    ])
    expect(readRecord(library, 'books/Cosmicomics').body).toBeNull()
  })

  test('a record is named by ref, by words in any case, by path, by id, or by target', () => {
    const same: RecordRef[] = [
      'books/Invisible Cities',
      'BOOKS/invisible cities',
      'books/Invisible Cities.md',
      'Invisible Cities',
      { type: 'books', id: 'Invisible Cities' },
      { corpus: '', type: 'books', id: 'x', path: 'books/Invisible Cities.md' },
    ]
    for (const ref of same) expect(readRecord(library, ref).title).toBe('Le città invisibili')
  })

  test('a record of a referenced corpus, by its key or by a prefix', () => {
    expect(readRecord(xref, 'base/principles/Be Kind')).toMatchObject({
      ref: 'base/principles/Be Kind',
      corpus: 'base',
      data: { statement: 'Treat people with care.' },
    })
    expect(readRecord(xref, 'org/principles/Be Kind').ref).toBe('base/principles/Be Kind')
    expect(readRecord(xref, { corpus: 'org', type: 'principles', id: 'Be Kind' }).corpus).toBe(
      'base',
    )
  })

  test('no such record, with the ids that are close', () => {
    expect(fails(() => readRecord(library, 'books/Invisible'))).toEqual([
      'not-found',
      "no record 'Invisible' of type 'books' in corpus 'library'; did you mean: Invisible Cities",
    ])
    expect(fails(() => readRecord(library, 'books/Dune'))).toEqual([
      'not-found',
      "no record 'Dune' of type 'books' in corpus 'library'",
    ])
    expect(fails(() => readRecord(library, 'Dune'))).toEqual([
      'not-found',
      "no record with id 'Dune' in corpus 'library'; name a record as <type>/<id>",
    ])
    expect(fails(() => readRecord(library, 'shelves/Top'))[0]).toBe('unknown-type')
    expect(fails(() => readRecord(xref, 'nope/principles/Be Kind'))[0]).toBe('unknown-corpus')
  })
})

describe('references and backlinks', () => {
  test('reference fields first, then body links', () => {
    expect(
      getReferences(library, 'books/The Dispossessed').map((r) => [r.via, r.field, r.target?.ref]),
    ).toEqual([
      ['reference', 'author', 'authors/Ursula Le Guin'],
      ['link', null, 'books/The Left Hand of Darkness'],
    ])
  })

  test('a reference that names no record keeps its reason', () => {
    const [wrong] = getReferences(xref, 'guides/Wrong Type')
    expect(wrong).toMatchObject({ field: 'follows', target: null })
    expect(wrong?.unresolved).toMatch(/not a record of type org\/principles/)
  })

  test('what refers to a record, with the field that does', () => {
    expect(
      getBacklinks(library, 'authors/Ursula Le Guin').map((b) => [b.from.ref, b.via, b.field]),
    ).toEqual([
      ['books/The Dispossessed', 'reference', 'author'],
      ['books/The Left Hand of Darkness', 'reference', 'author'],
    ])
    expect(getBacklinks(library, 'books/The Left Hand of Darkness')).toEqual([
      {
        via: 'link',
        field: null,
        pointer: null,
        from: {
          ref: 'books/The Dispossessed',
          corpus: '',
          type: 'books',
          id: 'The Dispossessed',
          path: 'books/The Dispossessed.md',
          title: 'The Dispossessed',
        },
      },
    ])
  })

  test('a backlink from the loaded corpus to a record of a referenced one', () => {
    expect(getBacklinks(xref, 'base/principles/Be Kind').map((b) => b.from.ref)).toEqual([
      'guides/Inherited',
    ])
    expect(getReferences(xref, 'guides/Inherited')[0]?.target).toMatchObject({
      ref: 'base/principles/Be Kind',
      corpus: 'base',
      title: 'Be Kind',
    })
  })
})

describe('traverse', () => {
  const refs = (r: { nodes: { ref: string; depth: number }[] }): string[] =>
    r.nodes.map((n) => `${n.depth} ${n.ref}`)

  test('one hop out, by default', () => {
    const out = traverse(library, 'books/Too Like the Lightning')
    expect(out.root.ref).toBe('books/Too Like the Lightning')
    expect(refs(out)).toEqual(['1 authors/Ada Palmer', '1 books/Seven Surrenders'])
    expect(out.edges).toEqual([
      {
        from: 'books/Too Like the Lightning',
        to: 'authors/Ada Palmer',
        via: 'reference',
        field: 'author',
      },
      {
        from: 'books/Too Like the Lightning',
        to: 'books/Seven Surrenders',
        via: 'reference',
        field: 'sequel',
      },
    ])
    expect(out.truncated).toBe(false)
  })

  test('one reference field, several hops, each record once', () => {
    expect(
      refs(traverse(library, 'books/Too Like the Lightning', { via: 'sequel', depth: 3 })),
    ).toEqual(['1 books/Seven Surrenders'])
    const two = traverse(library, 'books/Too Like the Lightning', { depth: 2 })
    expect(refs(two)).toEqual(['1 authors/Ada Palmer', '1 books/Seven Surrenders'])
    // Seven Surrenders refers to the same author: one node, two edges.
    expect(two.edges.filter((e) => e.to === 'authors/Ada Palmer')).toHaveLength(2)
  })

  test('inward: what refers to a record, then what refers to those', () => {
    expect(refs(traverse(library, 'authors/Ada Palmer', { direction: 'in' }))).toEqual([
      '1 books/Seven Surrenders',
      '1 books/Too Like the Lightning',
    ])
    const back = traverse(library, 'books/Seven Surrenders', { direction: 'in' })
    expect(back.edges).toEqual([
      {
        from: 'books/Too Like the Lightning',
        to: 'books/Seven Surrenders',
        via: 'reference',
        field: 'sequel',
      },
    ])
  })

  test('body links are followed only when asked', () => {
    expect(refs(traverse(library, 'books/The Dispossessed'))).toEqual(['1 authors/Ursula Le Guin'])
    expect(refs(traverse(library, 'books/The Dispossessed', { links: true }))).toEqual([
      '1 authors/Ursula Le Guin',
      '1 books/The Left Hand of Darkness',
    ])
    expect(
      refs(traverse(library, 'books/The Left Hand of Darkness', { direction: 'in', links: true })),
    ).toEqual(['1 books/The Dispossessed'])
  })

  test('the limit cuts the walk and says so', () => {
    const cut = traverse(library, 'authors/Ursula Le Guin', { direction: 'in', limit: 1 })
    expect(refs(cut)).toEqual(['1 books/The Dispossessed'])
    expect(cut.truncated).toBe(true)
  })

  test('across corpora', () => {
    expect(refs(traverse(xref, 'guides/Inherited'))).toEqual(['1 base/principles/Be Kind'])
  })

  test('a depth or a limit out of range', () => {
    expect(fails(() => traverse(library, 'books/Cosmicomics', { depth: 11 }))).toEqual([
      'bad-query',
      'depth: expected a whole number from 1 to 10, got 11',
    ])
    expect(fails(() => traverse(library, 'books/Cosmicomics', { limit: 0 }))[0]).toBe('bad-query')
    expect(
      fails(() => traverse(library, 'books/Cosmicomics', { direction: 'up' as never }))[1],
    ).toBe("direction: expected 'out' or 'in'")
  })
})
