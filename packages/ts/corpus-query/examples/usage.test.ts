/**
 * The package used the way a consumer uses it: through its name only. Each export of each entry
 * appears here at least once, and the README's examples run here on this package's own fixture
 * corpus.
 */
import { join } from 'node:path'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { runApp } from '@osdlc/cli-tool/testing'
import { loadCorpus } from '@osdlc/corpus-schema'
import { expect, test } from 'vitest'

import {
  type CorpusLink,
  type CorpusQuery,
  corpusQuery,
  type CorpusSummary,
  countFacets,
  describeCorpus,
  describeType,
  type Facet,
  type FacetQuery,
  type FacetResult,
  type FieldDescription,
  type FieldValue,
  type Filter,
  type FilterOp,
  findRecords,
  formatFilter,
  getBacklinks,
  getReferences,
  type IncomingReference,
  listTypes,
  type OutgoingReference,
  parseFilter,
  parseTerm,
  type Query,
  QueryError,
  type QueryErrorCode,
  type QueryResult,
  type ReadOptions,
  readRecord,
  type RecordDetail,
  type RecordHeader,
  type RecordHit,
  type RecordRef,
  traverse,
  type TraverseOptions,
  type TraverseResult,
  type TypeDescription,
  type TypeSummary,
} from '@osdlc/corpus-query'
import { type CliOptions, createApp, runCli } from '@osdlc/corpus-query/cli'
import {
  createMcpHandler,
  createMcpServer,
  type McpOptions,
  mcpTools,
  serveMcpStdio,
} from '@osdlc/corpus-query/mcp'
import {
  findCorpusRoot,
  loadCorpusAt,
  openCorpus,
  type RestServer,
  type ServeOptions,
  serveRest,
} from '@osdlc/corpus-query/node'
import {
  createRestHandler,
  queryFromParams,
  type RestHandler,
  type RestOptions,
} from '@osdlc/corpus-query/rest'

const ROOT = join(import.meta.dirname, '../tests/fixtures/library')

test('quick start: open a corpus and find records', () => {
  const corpus: CorpusQuery = openCorpus(ROOT)
  const { records } = corpus.find({ type: 'books', where: 'status=read', search: 'utopia' })
  expect(records.map((r) => r.ref)).toEqual(['books/The Dispossessed'])
  expect(findCorpusRoot(join(ROOT, 'books'))).toBe(ROOT)
  expect(loadCorpusAt('library', join(ROOT, '..')).name).toBe('library')
})

test('the core: every function over one loaded corpus', () => {
  const model = loadCorpus(ROOT)
  const corpus = corpusQuery(model)

  const summary: CorpusSummary = describeCorpus(model)
  const links: CorpusLink[] = summary.corpora
  const types: TypeSummary[] = listTypes(model)
  expect([summary.records, links.length, types.map((t) => t.name)]).toEqual([
    9,
    0,
    ['authors', 'books'],
  ])
  expect(corpus.describe()).toEqual(summary)
  expect(corpus.types()).toEqual(types)

  const books: TypeDescription = describeType(model, 'books')
  const status = books.fields.find((f) => f.name === 'status') as FieldDescription
  const values: FieldValue[] = status.values ?? []
  expect(values.map((v) => v.title)).toEqual(['Read', 'Reading now', 'On the list'])
  expect(corpus.type('books')).toEqual(books)

  const op: FilterOp = 'gte'
  const filter: Filter = { field: 'rating', op, value: 4 }
  const query: Query = {
    type: 'books',
    where: ['status=read', filter],
    sort: '-rating',
    fields: ['rating'],
  }
  const result: QueryResult = findRecords(model, query)
  const [best]: RecordHit[] = result.records
  expect([result.total, best?.ref, best?.data]).toEqual([
    2,
    'books/The Left Hand of Darkness',
    { rating: 5 },
  ])
  expect(corpus.find(query)).toEqual(result)

  const facetQuery: FacetQuery = { type: 'books', fields: ['status'] }
  const counted: FacetResult = countFacets(model, facetQuery)
  const [facet]: Facet[] = counted.facets
  expect(facet?.values[0]).toEqual({ value: 'read', count: 3 })
  expect(corpus.facets(facetQuery)).toEqual(counted)

  const ref: RecordRef = 'books/Too Like the Lightning'
  const options: ReadOptions = { body: false }
  const record: RecordDetail = readRecord(model, ref, options)
  const header: RecordHeader = record
  expect([header.ref, record.data['pages'], 'body' in record]).toEqual([ref, 432, false])
  expect(corpus.get(ref, options)).toEqual(record)

  const out: OutgoingReference[] = getReferences(model, ref)
  expect(out.map((r) => r.target?.ref)).toEqual(['authors/Ada Palmer', 'books/Seven Surrenders'])
  expect(corpus.references(ref)).toEqual(out)
  const back: IncomingReference[] = getBacklinks(model, 'authors/Ada Palmer')
  expect(back.map((b) => b.from.ref)).toEqual([
    'books/Seven Surrenders',
    'books/Too Like the Lightning',
  ])
  expect(corpus.backlinks('authors/Ada Palmer')).toEqual(back)

  const walk: TraverseOptions = { direction: 'in', depth: 2 }
  const reached: TraverseResult = traverse(model, 'authors/Ada Palmer', walk)
  expect(reached.nodes.map((n) => n.depth)).toEqual([1, 1])
  expect(corpus.traverse('authors/Ada Palmer', walk)).toEqual(reached)
})

test('the string form of a filter, and the error a query can make', () => {
  expect(parseFilter('status=read rating>=4')).toEqual([
    { field: 'status', op: 'eq', value: 'read' },
    { field: 'rating', op: 'gte', value: '4' },
  ])
  expect(formatFilter(parseTerm('harness=Claude Code'))).toBe('harness="Claude Code"')
  let code: QueryErrorCode | undefined
  try {
    findRecords(loadCorpus(ROOT), { type: 'book' })
  } catch (e) {
    if (e instanceof QueryError) code = e.code
    expect((e as Error).message).toBe("no type 'book' in corpus 'library'; types: authors, books")
  }
  expect(code).toBe('unknown-type')
})

test('REST: a fetch-style handler, and a server on node:http', async () => {
  const restOptions: RestOptions = { basePath: '/api/corpus' }
  const handle: RestHandler = createRestHandler(loadCorpus(ROOT), restOptions)
  const types = await handle(new Request('http://docs.example/api/corpus/types'))
  expect(await types.json()).toHaveLength(2)
  expect(queryFromParams(new URLSearchParams('type=books&where=status%3Dread'))).toEqual({
    type: ['books'],
    where: ['status=read'],
  })

  const serveOptions: ServeOptions = { port: 0 }
  const server: RestServer = await serveRest(ROOT, serveOptions)
  try {
    const found = await fetch(`${server.url}/records?type=books&where=status=read&search=utopia`)
    expect(((await found.json()) as QueryResult).records.map((r) => r.id)).toEqual([
      'The Dispossessed',
    ])
  } finally {
    await server.close()
  }
})

test('MCP: the tools, over a transport and as an HTTP handler', async () => {
  const options: McpOptions = { defaultLimit: 2 }
  expect(mcpTools().map((t) => t.name)).toContain('find_records')

  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await createMcpServer(loadCorpus(ROOT), options).connect(serverSide)
  const client = new Client({ name: 'example', version: '0' })
  await client.connect(clientSide)
  const found = await client.callTool({ name: 'find_records', arguments: { type: 'books' } })
  expect(found.structuredContent).toMatchObject({ total: 6, limit: 2, next: 2 })
  await client.close()

  const [a, b] = InMemoryTransport.createLinkedPair()
  const stop = new AbortController()
  const served = serveMcpStdio(loadCorpus(ROOT), { transport: b, signal: stop.signal })
  const other = new Client({ name: 'example', version: '0' })
  await other.connect(a)
  expect((await other.listTools()).tools).toHaveLength(8)
  stop.abort()
  await served

  const handle = createMcpHandler(loadCorpus(ROOT))
  const listed = await handle(
    new Request('http://docs.example/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    }),
  )
  const answer = (await listed.json()) as { result: { tools: unknown[] } }
  expect(answer.result.tools).toHaveLength(8)
})

test('the command, for a corpus package that serves itself', async () => {
  const options: CliOptions = {
    root: new URL('../tests/fixtures/library/', import.meta.url),
    name: 'library',
  }
  const app = createApp(options)
  const run = await runApp(app, ['find', 'books', 'status=read', '-s', 'utopia'])
  expect(run.out).toMatch(/^RECORD +MATCH\nbooks\/The Dispossessed +An ambiguous utopia/)
  expect(typeof runCli).toBe('function')
})
