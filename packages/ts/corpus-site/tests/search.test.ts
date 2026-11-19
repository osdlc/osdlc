import { expect, test } from 'vitest'
import { searchData } from '../src/data.ts'
import { prepareSearch, search } from '../src/search.ts'
import { exampleSite } from './helpers.ts'

const index = prepareSearch(searchData(exampleSite()))
const titles = (query: string, options = {}): string[] =>
  search(index, query, options).hits.map((h) => h.title)

test('a word in the title ranks above one in the fields, then one in the body', () => {
  expect(titles('frankenstein')).toEqual(['Frankenstein', 'The creature speaks', 'Mary Shelley'])
})

test('every word must appear, in any of the three places', () => {
  expect(titles('darwin science')).toEqual(['On the Origin of Species', 'The Voyage of the Beagle'])
  expect(titles('darwin poetry')).toEqual([])
  expect(titles('   ')).toEqual([])
})

test('a hit carries its type, a snippet and the matches in it', () => {
  const [hit] = search(index, 'pond').hits
  expect(hit).toMatchObject({ url: '/books/walden/', title: 'Walden', type: 'Book' })
  expect(hit!.snippet).toBe('Two years beside a pond, told as one.')
  expect(hit!.marks.map(([a, b]) => hit!.snippet.slice(a, b))).toEqual(['pond'])
})

test('limit cuts the hits and keeps the total, and type keeps one type', () => {
  const result = search(index, 'the', { limit: 2 })
  expect(result.hits).toHaveLength(2)
  expect(result.total).toBeGreaterThan(2)
  expect(titles('eliot', { type: 'Author' })).toEqual(['George Eliot'])
})
