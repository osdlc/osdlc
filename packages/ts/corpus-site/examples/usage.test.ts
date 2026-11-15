/** The README's examples, run through the package name. */
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import {
  corpusSite,
  defineCorpusSite,
  filterRecords,
  loadSite,
  parseState,
  typeData,
} from '@osdlc/corpus-site'

const corpus = fileURLToPath(new URL('./corpus', import.meta.url))

test('the integration takes a corpus folder', () => {
  const integration = corpusSite({ root: './corpus', title: 'Reading list' })
  expect(integration.name).toBe('@osdlc/corpus-site')
  expect(Object.keys(integration.hooks)).toEqual(['astro:config:setup', 'astro:config:done'])
})

test('a config adds what the schemas do not hold', () => {
  const config = defineCorpusSite({
    types: {
      books: {
        summary: '{author}, {year}',
        columns: ['title', 'author', 'status'],
        filters: ['status', 'author'],
        sort: '-year',
        fields: {
          status: {
            note: 'Abandoned books stay on the list.',
            values: { finished: { label: 'Finished', color: 'green' } },
          },
        },
      },
    },
  })
  const site = loadSite(corpus, { config })
  const books = site.type('books')!
  expect(books.columns).toEqual(['title', 'author', 'status'])
  expect(site.recordsOf(books)[0]!.summary).toBe('Mary Shelley, 1818')
})

test('the data a page fetches can be filtered anywhere', () => {
  const site = loadSite(corpus)
  const data = typeData(site, site.type('books')!)
  const state = parseState('status=finished&sort=-year', data.fields)
  expect(filterRecords(data, state).map((r) => r.title)).toEqual([
    'Middlemarch',
    'Walden',
    'The Voyage of the Beagle',
    'Frankenstein',
  ])
})
