/** The REST API: the handler called directly, and served on a free port. */
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { type RestServer, serveRest } from '../src/node.ts'
import { createRestHandler, queryFromParams } from '../src/rest.ts'
import { corpus, LIBRARY, XREF } from './support.ts'

const library = corpus(LIBRARY)

describe('queryFromParams', () => {
  test('each parameter is a key of the query', () => {
    const params = new URLSearchParams(
      'type=books&type=authors&where=status%3Dread&where=rating>%3D4&search=utopia&sort=-pages&limit=5&offset=10&fields=pages,rating&body=true&corpus=*',
    )
    expect(queryFromParams(params)).toEqual({
      type: ['books', 'authors'],
      corpus: '*',
      where: ['status=read', 'rating>=4'],
      search: 'utopia',
      sort: ['-pages'],
      limit: 5,
      offset: 10,
      fields: ['pages,rating'],
      body: true,
    })
    expect(queryFromParams(new URLSearchParams(''))).toEqual({})
    expect(
      queryFromParams(new URLSearchParams('q=status%3Dread+tags%3Dutopia&body=false')),
    ).toEqual({
      where: 'status=read tags=utopia',
      body: false,
    })
  })
})

describe('the handler', () => {
  const handle = createRestHandler(library)
  const get = async (path: string, init?: RequestInit) => {
    const response = await handle(new Request(`http://corpus.test${path}`, init))
    // oxlint-disable-next-line typescript/no-explicit-any -- the tests read answers of every shape
    const body: any = await response.json()
    return { status: response.status, headers: response.headers, body }
  }
  const post = (path: string, body: unknown) =>
    get(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })

  test('GET / is the corpus', async () => {
    const r = await get('/')
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(r.headers.get('access-control-allow-origin')).toBeNull()
    expect(r.body).toMatchObject({ name: 'library', records: 9 })
  })

  test('types', async () => {
    expect((await get('/types')).body).toHaveLength(2)
    expect((await get('/types/books')).body).toMatchObject({ name: 'books', records: 6 })
    expect(await get('/types/shelves')).toMatchObject({
      status: 400,
      body: {
        error: {
          code: 'unknown-type',
          message: "no type 'shelves' in corpus 'library'; types: authors, books",
        },
      },
    })
  })

  test('GET /records and POST /query answer the same', async () => {
    const byUrl = await get(
      '/records?type=books&where=status%3Dread&where=rating%3E%3D4&sort=-rating&fields=rating',
    )
    expect(byUrl.body).toEqual({
      total: 2,
      offset: 0,
      limit: 50,
      next: null,
      records: [
        expect.objectContaining({ ref: 'books/The Left Hand of Darkness', data: { rating: 5 } }),
        expect.objectContaining({ ref: 'books/The Dispossessed', data: { rating: 4.5 } }),
      ],
    })
    const byBody = await post('/query', {
      type: 'books',
      where: ['status=read', { field: 'rating', op: 'gte', value: 4 }],
      sort: '-rating',
      fields: ['rating'],
    })
    expect(byBody.body).toEqual(byUrl.body)
    expect((await get('/records?q=status%3Dread+rating%3E%3D4&type=books')).body.total).toBe(2)
    expect((await get('/records?search=venice')).body.records[0].snippet).toMatch(/Venice/)
  })

  test('one record, and what is under it', async () => {
    const id = encodeURIComponent('Too Like the Lightning')
    const record = await get(`/records/books/${id}`)
    expect(record.body).toMatchObject({ ref: 'books/Too Like the Lightning', data: { pages: 432 } })
    expect(record.body.body).toMatch(/The year 2454/)
    expect((await get(`/records/books/${id}?body=false&backlinks=false`)).body).not.toHaveProperty(
      'body',
    )
    expect((await get(`/records/books/${id}/references`)).body).toHaveLength(2)
    expect((await get('/records/authors/Ada%20Palmer/backlinks')).body).toHaveLength(2)
    const walk = await get('/records/authors/Ada%20Palmer/traverse?direction=in&depth=2&limit=1')
    expect(walk.body).toMatchObject({ truncated: true, nodes: [{ depth: 1 }] })
    expect(await get('/records/books/Dune')).toMatchObject({
      status: 404,
      body: { error: { code: 'not-found' } },
    })
  })

  test('facets, by URL and by body', async () => {
    const byUrl = await get('/facets?type=books&fields=status&where=owned%3Dtrue')
    expect(byUrl.body.facets[0].values).toEqual([
      { value: 'read', count: 2 },
      { value: 'queued', count: 1 },
    ])
    expect(
      (await post('/facets', { type: 'books', fields: ['status'], where: 'owned=true' })).body,
    ).toEqual(byUrl.body)
    expect((await get('/facets?type=books')).status).toBe(400)
  })

  test('the OpenAPI description names every route', async () => {
    const { body } = await get('/openapi.json')
    expect(body.openapi).toBe('3.1.0')
    expect(Object.keys(body.paths)).toEqual([
      '/',
      '/types',
      '/types/{type}',
      '/records',
      '/query',
      '/records/{type}/{id}',
      '/records/{type}/{id}/references',
      '/records/{type}/{id}/backlinks',
      '/records/{type}/{id}/traverse',
      '/facets',
    ])
  })

  test('errors are JSON with a status', async () => {
    const cases: [string, RequestInit | undefined, number, string][] = [
      ['/nope', undefined, 404, 'not-found'],
      ['/records?limit=many', undefined, 400, 'bad-query'],
      ['/records?where=status', undefined, 400, 'bad-filter'],
      ['/records?type=books&where=nope%3D1', undefined, 400, 'unknown-field'],
      ['/records?corpus=nope', undefined, 400, 'unknown-corpus'],
      ['/records?q=a%3D1&where=b%3D2', undefined, 400, 'bad-query'],
      ['/records/Cosmicomics/x/y/z', undefined, 404, 'not-found'],
      ['/records', { method: 'DELETE' }, 405, 'method-not-allowed'],
      [
        '/records',
        { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } },
        405,
        'method-not-allowed',
      ],
      ['/query', undefined, 405, 'method-not-allowed'],
      ['/query', { method: 'POST', body: 'type=books' }, 415, 'unsupported-media-type'],
      [
        '/query',
        { method: 'POST', body: '{', headers: { 'content-type': 'application/json' } },
        400,
        'bad-query',
      ],
      [
        '/query',
        { method: 'POST', body: '{"nope":1}', headers: { 'content-type': 'application/json' } },
        400,
        'bad-query',
      ],
    ]
    for (const [path, init, status, code] of cases) {
      const r = await get(path, init)
      expect([path, r.status, r.body.error?.code]).toEqual([path, status, code])
      expect(typeof r.body.error.message).toBe('string')
    }
  })

  test('HEAD answers the headers only, and a large limit is cut', async () => {
    const head = await handle(new Request('http://corpus.test/records', { method: 'HEAD' }))
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
    const small = createRestHandler(library, { maxLimit: 2 })
    const r = await small(new Request('http://corpus.test/records?limit=500'))
    expect(((await r.json()) as { limit: number }).limit).toBe(2)
  })

  test('cors: any origin, or one', async () => {
    const any = createRestHandler(library, { cors: true })
    const r = await any(new Request('http://corpus.test/types'))
    expect(r.headers.get('access-control-allow-origin')).toBe('*')
    const preflight = await any(new Request('http://corpus.test/query', { method: 'OPTIONS' }))
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-methods')).toBe('GET, HEAD, POST, OPTIONS')
    const one = createRestHandler(library, { cors: 'https://docs.example' })
    const o = await one(new Request('http://corpus.test/nope'))
    expect(o.headers.get('access-control-allow-origin')).toBe('https://docs.example')
    expect(o.headers.get('vary')).toBe('origin')
  })

  test('a base path, and a referenced corpus by key', async () => {
    const mounted = createRestHandler(corpus(XREF), { basePath: '/api/corpus/' })
    const at = async (path: string) => {
      const r = await mounted(new Request(`http://corpus.test${path}`))
      return { status: r.status, body: (await r.json()) as Record<string, unknown> }
    }
    expect((await at('/api/corpus')).body['name']).toBe('references-xref')
    expect((await at('/api/corpus/types?corpus=*')).body).toHaveLength(4)
    expect((await at('/api/corpus/records?type=org/principles')).body['total']).toBe(2)
    expect((await at('/api/corpus/records/principles/Be%20Kind?corpus=org')).body['ref']).toBe(
      'base/principles/Be Kind',
    )
    expect((await at('/api/corpus/types/org%2Fprinciples')).body['records']).toBe(2)
    expect((await at('/types')).status).toBe(404)
    const spec = (await at('/api/corpus/openapi.json')).body as { servers: { url: string }[] }
    expect(spec.servers[0]?.url).toBe('/api/corpus')
  })
})

describe('serveRest', () => {
  let server: RestServer
  beforeAll(async () => {
    server = await serveRest(library)
  })
  afterAll(() => server.close())

  test('binds 127.0.0.1 on a free port and answers fetch', async () => {
    expect(server.host).toBe('127.0.0.1')
    expect(server.url).toBe(`http://127.0.0.1:${server.port}`)
    const r = await fetch(`${server.url}/records?type=authors&sort=born&fields=born`)
    expect(r.status).toBe(200)
    const body = (await r.json()) as { records: { id: string; data: { born: number } }[] }
    expect(body.records.map((x) => [x.id, x.data.born])).toEqual([
      ['Italo Calvino', 1923],
      ['Ursula Le Guin', 1929],
      ['Ada Palmer', 1981],
    ])
  })

  test('POST carries a JSON query', async () => {
    const r = await fetch(`${server.url}/query`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ search: 'utopia', limit: 1 }),
    })
    expect(await r.json()).toMatchObject({
      total: 3,
      next: 1,
      records: [{ id: 'The Dispossessed' }],
    })
    const big = await fetch(`${server.url}/query`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ search: 'x'.repeat(1024 * 1024 + 1) }),
    })
    expect(big.status).toBe(413)
  })

  test('refuses a request whose Host names another host', async () => {
    const r = await fetch(`${server.url}/`, { headers: { host: 'evil.example' } })
    // fetch may not let a caller set Host; a raw request always can.
    if (r.status !== 200) expect(r.status).toBe(403)
    const { request } = await import('node:http')
    const status = await new Promise<number>((done, fail) => {
      const req = request(
        { host: '127.0.0.1', port: server.port, path: '/', headers: { host: 'evil.example' } },
        (res) => {
          res.resume()
          done(res.statusCode ?? 0)
        },
      )
      req.on('error', fail)
      req.end()
    })
    expect(status).toBe(403)
  })

  test('a corpus given by path is loaded, and loaded again when a file changes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'corpus-query-rest-'))
    cpSync(LIBRARY, join(dir, 'library'), { recursive: true })
    const lines: string[] = []
    const watched = await serveRest(join(dir, 'library'), {
      watch: true,
      log: (l) => lines.push(l),
    })
    try {
      const total = async (): Promise<number> =>
        (
          (await (await fetch(`${watched.url}/records?type=authors&limit=0`)).json()) as {
            total: number
          }
        ).total
      expect(await total()).toBe(3)
      writeFileSync(join(dir, 'library/authors/Octavia Butler.md'), '---\nborn: 1947\n---\n')
      await expect.poll(total, { timeout: 5000 }).toBe(4)
      expect(lines).toContain('reloaded library: 10 records')
    } finally {
      await watched.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('a folder that is no corpus is refused', async () => {
    await expect(serveRest(join(LIBRARY, 'books'))).rejects.toThrow(/not a corpus/)
  })
})
