/** The MCP server, with the SDK's client over an in-memory transport and over HTTP. */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createMcpHandler, createMcpServer, mcpTools, serveMcpStdio } from '../src/mcp.ts'
import { serveRest } from '../src/node.ts'
import { corpus, HARNESS, LIBRARY } from './support.ts'

const library = corpus(LIBRARY)

interface Answer {
  isError?: boolean
  text: string
  data: Record<string, unknown>
}

async function connect(model = library, options = {}): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await createMcpServer(model, options).connect(serverSide)
  const client = new Client({ name: 'test', version: '0' })
  await client.connect(clientSide)
  return client
}

const call = async (
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<Answer> => {
  const result = await client.callTool({ name, arguments: args })
  const [first] = result.content as { type: string; text: string }[]
  return {
    ...(result.isError === true ? { isError: true } : {}),
    text: first?.text ?? '',
    data: (result.structuredContent ?? {}) as Record<string, unknown>,
  }
}

describe('tools', () => {
  let client: Client
  beforeAll(async () => {
    client = await connect()
  })
  afterAll(() => client.close())

  test('the server says what it holds and lists its tools', async () => {
    expect(client.getInstructions()).toMatch(
      /^Read-only access to the corpus 'library': 9 records of the types authors, books\. Call describe_corpus first/,
    )
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name)).toEqual([
      'describe_corpus',
      'describe_type',
      'find_records',
      'get_record',
      'get_references',
      'get_backlinks',
      'traverse',
      'count_facets',
    ])
    for (const tool of tools) {
      expect(tool.description?.length, tool.name).toBeGreaterThan(40)
      expect(tool.inputSchema.type).toBe('object')
      expect(tool.annotations?.readOnlyHint).toBe(true)
    }
    expect(mcpTools().map((t) => t.name)).toEqual(tools.map((t) => t.name))
  })

  test('describe_corpus and describe_type', async () => {
    expect((await call(client, 'describe_corpus')).data).toMatchObject({
      name: 'library',
      records: 9,
    })
    const type = await call(client, 'describe_type', { type: 'books' })
    expect((type.data['fields'] as unknown[]).length).toBe(10)
    expect(JSON.parse(type.text)).toEqual(type.data)
  })

  test('find_records is small by default, and says how to get more', async () => {
    const found = await call(client, 'find_records', { type: 'books', where: ['status=read'] })
    expect(found.data).toMatchObject({ total: 3, limit: 20, next: null })
    // A record in a result is its ref, and its title when that is not the id.
    expect(found.data['records']).toEqual([
      { ref: 'books/Cosmicomics' },
      { ref: 'books/The Dispossessed' },
      { ref: 'books/The Left Hand of Darkness' },
    ])
    const titled = await call(client, 'find_records', { where: ['@id~cities'] })
    expect(titled.data['records']).toEqual([
      { ref: 'books/Invisible Cities', title: 'Le città invisibili' },
    ])
    const more = await call(client, 'find_records', {
      type: 'books',
      where: [{ field: 'rating', op: 'gte', value: 4 }],
      search: 'utopia',
      fields: ['rating', 'tags'],
      body: true,
      limit: 1,
    })
    expect(more.data).toMatchObject({ total: 1, limit: 1 })
    expect((more.data['records'] as object[])[0]).toMatchObject({
      ref: 'books/The Dispossessed',
      data: { rating: 4.5, tags: ['science-fiction', 'utopia'] },
      snippet: expect.stringContaining('utopia'),
    })
  })

  test('the default and the largest limit are options', async () => {
    const small = await connect(library, { defaultLimit: 2, maxLimit: 3 })
    expect((await call(small, 'find_records')).data).toMatchObject({ total: 9, limit: 2, next: 2 })
    expect((await call(small, 'find_records', { limit: 99 })).data['limit']).toBe(3)
    await small.close()
  })

  test('get_record cuts a long body and says where the rest starts', async () => {
    const whole = await call(client, 'get_record', { record: 'books/The Dispossessed' })
    expect(whole.data).toMatchObject({
      ref: 'books/The Dispossessed',
      path: 'books/The Dispossessed.md',
      type: 'books',
      bodyLength: 188,
      bodyNext: null,
      backlinksTotal: 0,
    })
    expect((whole.data['references'] as { target: unknown }[])[0]?.target).toEqual({
      ref: 'authors/Ursula Le Guin',
    })
    expect((whole.data['references'] as unknown[]).length).toBe(2)
    const cut = await call(client, 'get_record', {
      record: 'books/The Dispossessed',
      bodyLimit: 20,
    })
    expect(cut.data).toMatchObject({ body: '\nAn ambiguous utopia', bodyNext: 20 })
    const rest = await call(client, 'get_record', {
      record: 'books/The Dispossessed',
      bodyOffset: 20,
      bodyLimit: 9,
    })
    expect(rest.data).toMatchObject({ body: ': a physi', bodyNext: 29 })
    const none = await call(client, 'get_record', { record: 'books/The Dispossessed', body: false })
    expect(none.data).not.toHaveProperty('body')
    expect(
      (await call(client, 'get_record', { record: 'books/Cosmicomics' })).data['body'],
    ).toBeNull()
  })

  test('get_references, get_backlinks and traverse', async () => {
    const refs = await call(client, 'get_references', { record: 'books/Too Like the Lightning' })
    expect(refs.data).toMatchObject({ total: 2, offset: 0, limit: 50, next: null })
    const back = await call(client, 'get_backlinks', { record: 'authors/Ada Palmer', limit: 1 })
    expect(back.data).toMatchObject({ total: 2, next: 1 })
    expect((back.data['backlinks'] as { from: { ref: string } }[])[0]?.from.ref).toBe(
      'books/Seven Surrenders',
    )
    const walk = await call(client, 'traverse', {
      record: 'authors/Ada Palmer',
      direction: 'in',
      depth: 2,
    })
    expect((walk.data['nodes'] as unknown[]).length).toBe(2)
  })

  test('count_facets', async () => {
    const facets = await call(client, 'count_facets', { type: 'books', fields: ['status'] })
    expect(facets.data).toMatchObject({
      total: 6,
      facets: [{ field: 'status', values: [{ value: 'read', count: 3 }, {}, {}] }],
    })
  })

  test('a query error is a tool result that lists what exists', async () => {
    expect(await call(client, 'find_records', { type: 'shelves' })).toEqual({
      isError: true,
      text: "no type 'shelves' in corpus 'library'; types: authors, books",
      data: {},
    })
    expect((await call(client, 'find_records', { type: 'books', where: ['nope=1'] })).text).toMatch(
      /^no field 'nope' in type 'books'; fields: title, author, /,
    )
    expect((await call(client, 'get_record', { record: 'books/Invisible' })).text).toMatch(
      /did you mean: Invisible Cities$/,
    )
    expect((await call(client, 'get_record', {})).text).toBe('record: expected a string')
    expect(
      (await call(client, 'get_record', { record: 'books/Cosmicomics', full: true })).text,
    ).toBe("no argument 'full' for get_record; arguments: record, body, bodyOffset, bodyLimit")
    expect((await call(client, 'find_records', { limit: -1 })).isError).toBe(true)
    await expect(client.callTool({ name: 'nope', arguments: {} })).rejects.toThrow(/no tool 'nope'/)
  })
})

describe('resources', () => {
  test('each record is a resource, read as JSON', async () => {
    const client = await connect()
    const { resources, nextCursor } = await client.listResources()
    expect(nextCursor).toBeUndefined()
    expect(resources).toHaveLength(9)
    expect(resources[4]).toEqual({
      uri: 'corpus://library/books/Invisible%20Cities',
      name: 'Le città invisibili',
      description: 'books/Invisible Cities',
      mimeType: 'application/json',
    })
    const { contents } = await client.readResource({ uri: resources[4]?.uri as string })
    const record = JSON.parse((contents[0] as { text: string }).text) as Record<string, unknown>
    expect(record).toMatchObject({ ref: 'books/Invisible Cities', data: { pages: 165 } })
    expect(record['body']).toMatch(/Marco Polo/)
    const { resourceTemplates } = await client.listResourceTemplates()
    expect(resourceTemplates[0]?.uriTemplate).toBe('corpus://library/{type}/{id}')
    await expect(client.readResource({ uri: 'corpus://library/books/Dune' })).rejects.toThrow(
      /no record 'Dune'/,
    )
    await client.close()
  })

  test('a large corpus is listed a page at a time', async () => {
    const client = await connect(corpus(HARNESS))
    const first = await client.listResources()
    expect(first.resources).toHaveLength(100)
    expect(first.nextCursor).toBe('100')
    const second = await client.listResources({ cursor: first.nextCursor })
    expect(second.resources[0]?.uri).not.toBe(first.resources[0]?.uri)
    await client.close()
  })
})

describe('transports', () => {
  test('serveMcpStdio runs over a transport until it is aborted', async () => {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    const stop = new AbortController()
    const served = serveMcpStdio(library, { transport: serverSide, signal: stop.signal })
    const client = new Client({ name: 'test', version: '0' })
    await client.connect(clientSide)
    expect((await call(client, 'describe_corpus')).data['name']).toBe('library')
    stop.abort()
    await served
  })

  test('streamable HTTP, mounted beside the REST API', async () => {
    const mcp = createMcpHandler(library)
    const server = await serveRest(library, {
      before: (request) => (new URL(request.url).pathname === '/mcp' ? mcp(request) : undefined),
    })
    try {
      const client = new Client({ name: 'test', version: '0' })
      await client.connect(new StreamableHTTPClientTransport(new URL(`${server.url}/mcp`)))
      expect((await client.listTools()).tools).toHaveLength(8)
      const found = await call(client, 'find_records', { type: 'authors', where: ['born<1925'] })
      expect(found.data['records']).toEqual([{ ref: 'authors/Italo Calvino' }])
      await client.close()
      expect((await fetch(`${server.url}/types`)).status).toBe(200)
    } finally {
      await server.close()
    }
  })
})
