import { describe, expect, test } from 'vitest'
import { loadCorpus } from '@osdlc/corpus-schema'
import {
  configProblems,
  CorpusSiteConfigError,
  defineCorpusSite,
  templateFields,
  validateConfig,
  type CorpusSiteConfig,
} from '../src/config.ts'
import { CORPUS, exampleSite } from './helpers.ts'

const model = loadCorpus(CORPUS)
const problems = (config: CorpusSiteConfig): string[] => configProblems(config, model)

describe('configProblems', () => {
  test('an empty config and a full one are fine', () => {
    expect(problems({})).toEqual([])
    expect(
      problems(
        defineCorpusSite({
          title: 'Shelf',
          pageSize: 20,
          typeOrder: ['books'],
          types: {
            books: {
              label: 'Books',
              title: '{title} ({year})',
              summary: '{author}, {id}',
              columns: ['title', 'author', 'edition.format'],
              filters: ['status', 'edition.format'],
              sort: '-year',
              sections: [{ label: 'Reading', fields: ['status'] }],
              fields: {
                status: { control: 'select', values: { finished: { color: 'green' } } },
                'edition.format': { label: 'Format' },
                year: { format: 'text' },
              },
            },
          },
        }),
      ),
    ).toEqual([])
  })

  test('an unknown type lists the types', () => {
    expect(problems({ types: { book: {} } })).toEqual([
      'types.book: the corpus has no type "book". Types: authors, books, notes',
    ])
    expect(problems({ typeOrder: ['papers'] })[0]).toContain('Types: authors, books, notes')
  })

  test('an unknown field lists the fields, wherever it is named', () => {
    const found = problems({
      types: {
        authors: {
          columns: ['nation'],
          filters: ['title'],
          sort: '-age',
          sections: [{ label: 'x', fields: ['x'] }],
          title: '{nope}',
          fields: { pen: {}, 'born.year': {} },
        },
      },
    })
    expect(found).toHaveLength(7)
    for (const problem of found) expect(problem).toContain('Fields: born, died, country, pen_name')
    expect(found[0]).toBe(
      'types.authors.columns: type "authors" has no field "nation". Fields: born, died, country, pen_name',
    )
  })

  test('a setting outside its values lists them', () => {
    const found = problems({
      pageSize: 0,
      types: {
        books: {
          slug: 'My Books',
          fields: {
            status: {
              control: 'dropdown' as never,
              format: 'money' as never,
              values: { finished: { color: 'teal' as never } },
            },
          },
        },
      },
    })
    expect(found).toEqual([
      'pageSize: must be a whole number above 0, not 0',
      'types.books.slug: "My Books" must be lower-case letters, digits and "-"',
      'types.books.fields.status.control: "dropdown" is not a control. Controls: select, chips, range, toggle, search, hidden',
      'types.books.fields.status.format: "money" is not a format. Formats: text, date, datetime, number, badge, code, link',
      'types.books.fields.status.values.finished.color: "teal" is not a badge colour. Colours: neutral, accent, green, amber, red, blue, purple',
    ])
  })

  test('an unknown setting is named with the settings there are', () => {
    expect(problems({ tittle: 'x' } as never)[0]).toContain('unknown setting "tittle"')
    expect(problems({ types: { books: { colums: [] } as never } })[0]).toContain(
      'types.books: unknown setting "colums"',
    )
    expect(
      problems({ types: { books: { fields: { status: { colour: 'red' } as never } } } })[0],
    ).toContain('types.books.fields.status: unknown setting "colour"')
  })

  test('two types may not share a path, and the site keeps data, search and ref', () => {
    expect(problems({ types: { books: { slug: 'authors' } } })).toEqual([
      'types.books.slug: "authors" is also the path of type "authors"',
    ])
    expect(problems({ types: { notes: { slug: 'data' } } })[0]).toContain('is one the site uses')
    expect(problems({ types: { notes: { slug: 'data', hidden: true } } })).toEqual([])
  })
})

test('validateConfig throws every problem at once', () => {
  expect(() => validateConfig({}, model)).not.toThrow()
  let thrown: unknown
  try {
    exampleSite({ types: { book: {}, books: { columns: ['isbn'] } } })
  } catch (error) {
    thrown = error
  }
  expect(thrown).toBeInstanceOf(CorpusSiteConfigError)
  expect((thrown as CorpusSiteConfigError).problems).toHaveLength(2)
  expect((thrown as Error).message).toMatch(/^corpus-site config:\n {2}- types\.book: /)
})

test('templateFields finds the places of a template', () => {
  expect(templateFields('{author}: {title} ({ year })')).toEqual(['author', 'title', 'year'])
  expect(templateFields('plain')).toEqual([])
})
