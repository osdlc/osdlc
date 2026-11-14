/**
 * `@osdlc/corpus-query/rest`: the query functions as a read-only HTTP API, as one
 * `(Request) => Response` function. It uses only web-standard APIs, so it mounts in any runtime
 * that has `fetch`: an Astro endpoint, a worker, or `serveRest` of `./node` for `node:http`.
 */
import type { LoadedCorpus } from '@osdlc/corpus-schema'

import { describeCorpus, describeType, listTypes } from './describe.ts'
import { given } from './given.ts'
import { MAX_BODY, QueryError } from './model.ts'
import { openApi } from './openapi.ts'
import { countFacets, type FacetQuery, findRecords, type Query } from './query.ts'
import {
  getBacklinks,
  getReferences,
  readRecord,
  traverse,
  type TraverseOptions,
} from './record.ts'

/**
 * Options for `createRestHandler`.
 *
 * @experimental
 */
export interface RestOptions {
  /** The path the API is mounted under, such as `/api/corpus`. Default: the root. */
  basePath?: string
  /**
   * Answer cross-origin requests: `true` for any origin, or the one origin to allow. Default
   * false, which sends no CORS header.
   */
  cors?: boolean | string
  /** The most records or nodes one request may ask for. A larger `limit` is cut to it. Default 1000. */
  maxLimit?: number
}

/**
 * The handler `createRestHandler` returns.
 *
 * @experimental
 */
export type RestHandler = (request: Request) => Promise<Response>

class HttpError extends Error {
  readonly status: number
  readonly code: string
  readonly headers: Record<string, string>
  constructor(status: number, code: string, message: string, headers: Record<string, string> = {}) {
    super(message)
    this.status = status
    this.code = code
    this.headers = headers
  }
}

const ALLOW = 'GET, HEAD, POST, OPTIONS'

const STATUS: Record<string, number> = { 'not-found': 404, ambiguous: 409 }

const flag = (value: string | null): boolean | undefined =>
  value === null ? undefined : value !== 'false' && value !== '0'

function whole(name: string, value: string | null): number | undefined {
  if (value === null) return undefined
  if (!/^\d+$/.test(value))
    throw new QueryError('bad-query', `${name}: expected a whole number, 0 or more, got '${value}'`)
  return Number(value)
}

const all = (p: URLSearchParams, name: string): string[] | undefined => {
  const values = p.getAll(name)
  return values.length === 0 ? undefined : values
}

/** The values of a parameter that may repeat or join its values with commas. */
const list = (p: URLSearchParams, name: string): string[] | undefined =>
  all(p, name)?.flatMap((v) => v.split(','))

/**
 * A query from URL parameters: `type`, `corpus`, `search`, `sort`, `limit`, `offset`, `fields`
 * and `body` as the query's keys, `where` once per term, and `q` for a whole filter in the
 * string form. `type`, `sort` and `fields` may repeat or join their values with commas.
 *
 * @throws QueryError `bad-query` for a `limit` or `offset` that is not a whole number.
 * @experimental
 */
export function queryFromParams(params: URLSearchParams): Query {
  const q = params.get('q')
  const where = all(params, 'where')
  return given({
    type: list(params, 'type'),
    corpus: params.get('corpus') ?? undefined,
    where: q === null ? where : where === undefined ? q : undefined,
    search: params.get('search') ?? undefined,
    sort: list(params, 'sort'),
    limit: whole('limit', params.get('limit')),
    offset: whole('offset', params.get('offset')),
    fields: list(params, 'fields'),
    body: flag(params.get('body')),
  })
}

function facetsFromParams(params: URLSearchParams): FacetQuery {
  if (params.has('q') && params.has('where'))
    throw new QueryError('bad-query', 'give q or where, not both')
  const { type, corpus, where, search } = queryFromParams(params)
  return given({
    type,
    corpus,
    where,
    search,
    fields: list(params, 'fields') ?? list(params, 'field') ?? [],
    top: whole('top', params.get('top')),
  })
}

/**
 * The query functions over HTTP, for a corpus or a function that returns the current one.
 *
 * | Route | Answers |
 * | --- | --- |
 * | `GET /` | `describeCorpus` |
 * | `GET /types` | `listTypes`; `?corpus=` |
 * | `GET /types/<type>` | `describeType`; `?corpus=` |
 * | `GET /records` | `findRecords`, from `queryFromParams` |
 * | `POST /query` | `findRecords`, from a JSON `Query` body |
 * | `GET /records/<type>/<id>` | `readRecord`; `?corpus=`, `?body=false`, `?references=false`, `?backlinks=false` |
 * | `GET /records/<type>/<id>/references` | `getReferences` |
 * | `GET /records/<type>/<id>/backlinks` | `getBacklinks` |
 * | `GET /records/<type>/<id>/traverse` | `traverse`; `?direction=`, `?via=`, `?links=`, `?depth=`, `?limit=` |
 * | `GET /facets` | `countFacets`; `?fields=` and the filter parameters of `/records` |
 * | `POST /facets` | `countFacets`, from a JSON `FacetQuery` body |
 * | `GET /openapi.json` | an OpenAPI 3.1 description of these routes |
 *
 * Every answer is JSON. An error is `{ "error": { "code", "message" } }` with status 400 for a
 * query that cannot run, 404 for a record or a route that does not exist, 405 for a method a
 * route does not take, 409 for an ambiguous record name, 413 for a body over 1 MiB and 415 for
 * a body that is not JSON. It never writes: only `GET`, `HEAD`, `POST` and `OPTIONS` are taken,
 * and `POST` only carries a query.
 *
 * @experimental
 */
export function createRestHandler(
  corpus: LoadedCorpus | (() => LoadedCorpus),
  options: RestOptions = {},
): RestHandler {
  const base = (options.basePath ?? '').replace(/\/+$/, '')
  const maxLimit = options.maxLimit ?? 1000
  const origin = options.cors === true ? '*' : options.cors === false ? undefined : options.cors
  const cors: Record<string, string> =
    origin === undefined
      ? {}
      : {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': ALLOW,
          'access-control-allow-headers': 'content-type',
          ...(origin === '*' ? {} : { vary: 'origin' }),
        }
  const json = (status: number, value: unknown, headers: Record<string, string> = {}): Response =>
    new Response(JSON.stringify(value), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8', ...cors, ...headers },
    })
  const capped = <Q extends { limit?: number }>(query: Q): Q =>
    typeof query === 'object' &&
    query !== null &&
    typeof query.limit === 'number' &&
    query.limit > maxLimit
      ? { ...query, limit: maxLimit }
      : query

  async function bodyOf(request: Request): Promise<unknown> {
    const type = request.headers.get('content-type') ?? ''
    if (!/^application\/json\b/i.test(type))
      throw new HttpError(415, 'unsupported-media-type', 'send the query as application/json')
    const tooLarge = new HttpError(413, 'too-large', 'the body is over 1 MiB')
    const declared = Number(request.headers.get('content-length'))
    if (declared > MAX_BODY) throw tooLarge
    const chunks: Uint8Array[] = []
    let size = 0
    if (request.body !== null) {
      const reader = request.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > MAX_BODY) {
          await reader.cancel()
          throw tooLarge
        }
        chunks.push(value)
      }
    }
    const bytes = new Uint8Array(size)
    let at = 0
    for (const chunk of chunks) {
      bytes.set(chunk, at)
      at += chunk.byteLength
    }
    try {
      return JSON.parse(new TextDecoder().decode(bytes))
    } catch {
      throw new HttpError(400, 'bad-query', 'the body is not JSON')
    }
  }

  async function route(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const method = request.method === 'HEAD' ? 'GET' : request.method
    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (method !== 'GET' && method !== 'POST')
      return json(
        405,
        { error: { code: 'method-not-allowed', message: 'the API is read-only' } },
        {
          allow: ALLOW,
        },
      )
    if (base !== '' && url.pathname !== base && !url.pathname.startsWith(`${base}/`))
      throw new HttpError(404, 'not-found', `no route ${url.pathname}`)
    let parts: string[]
    try {
      parts = url.pathname
        .slice(base.length)
        .split('/')
        .filter((p) => p !== '')
        .map(decodeURIComponent)
    } catch {
      throw new HttpError(400, 'bad-query', 'the path is not valid percent-encoding')
    }
    const p = url.searchParams
    const model = typeof corpus === 'function' ? corpus() : corpus
    const [head, second, third, fourth] = parts
    const get = (): void => {
      if (method !== 'GET')
        throw new HttpError(405, 'method-not-allowed', `${url.pathname} takes GET`, {
          allow: 'GET, HEAD, OPTIONS',
        })
    }

    if (head === undefined) {
      get()
      return json(200, describeCorpus(model))
    }
    if (head === 'openapi.json' && parts.length === 1) {
      get()
      return json(200, openApi(model, base))
    }
    if (head === 'types' && parts.length <= 2) {
      get()
      const key = p.get('corpus') ?? undefined
      return json(
        200,
        second === undefined ? listTypes(model, key) : describeType(model, second, key),
      )
    }
    if (head === 'query' && parts.length === 1) {
      if (method !== 'POST')
        throw new HttpError(405, 'method-not-allowed', '/query takes POST', {
          allow: 'POST, OPTIONS',
        })
      return json(200, findRecords(model, capped((await bodyOf(request)) as Query)))
    }
    if (head === 'facets' && parts.length === 1)
      return json(
        200,
        countFacets(
          model,
          method === 'POST' ? ((await bodyOf(request)) as FacetQuery) : facetsFromParams(p),
        ),
      )
    if (head === 'records' && parts.length === 1) {
      get()
      if (p.has('q') && p.has('where'))
        throw new QueryError('bad-query', 'give q or where, not both')
      return json(200, findRecords(model, capped(queryFromParams(p))))
    }
    if (head === 'records' && second !== undefined && third !== undefined && parts.length <= 4) {
      get()
      const key = p.get('corpus')
      const ref = { type: second, id: third, ...(key === null ? {} : { corpus: key }) }
      if (fourth === undefined)
        return json(
          200,
          readRecord(
            model,
            ref,
            given({
              body: flag(p.get('body')),
              references: flag(p.get('references')),
              backlinks: flag(p.get('backlinks')),
            }),
          ),
        )
      if (fourth === 'references') return json(200, getReferences(model, ref))
      if (fourth === 'backlinks') return json(200, getBacklinks(model, ref))
      if (fourth === 'traverse')
        return json(
          200,
          traverse(
            model,
            ref,
            given({
              direction: (p.get('direction') ?? undefined) as TraverseOptions['direction'],
              via: list(p, 'via'),
              links: flag(p.get('links')),
              depth: whole('depth', p.get('depth')),
              limit: Math.min(whole('limit', p.get('limit')) ?? 200, maxLimit),
            }),
          ),
        )
    }
    throw new HttpError(404, 'not-found', `no route ${url.pathname}`)
  }

  return async (request) => {
    try {
      const response = await route(request)
      return request.method === 'HEAD'
        ? new Response(null, { status: response.status, headers: response.headers })
        : response
    } catch (e) {
      if (e instanceof HttpError)
        return json(e.status, { error: { code: e.code, message: e.message } }, e.headers)
      if (e instanceof QueryError)
        return json(STATUS[e.code] ?? 400, { error: { code: e.code, message: e.message } })
      return json(500, { error: { code: 'internal', message: 'the query failed' } })
    }
  }
}
