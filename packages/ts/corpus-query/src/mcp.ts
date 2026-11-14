/**
 * `@osdlc/corpus-query/mcp`: the query functions as an MCP server, so an agent can read a
 * corpus. Each function is a tool whose input is the same JSON the function takes. Answers are
 * small by default (see `McpOptions`), and each answer says how to ask for more.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import {
  CallToolRequestSchema,
  type CallToolResult,
  ErrorCode,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js'
import type { LoadedCorpus } from '@osdlc/corpus-schema'

import { describeCorpus, describeType } from './describe.ts'
import { QueryError } from './model.ts'
import { FACET_SCHEMA, QUERY_SCHEMA } from './openapi.ts'
import { countFacets, type FacetQuery, findRecords, type Query } from './query.ts'
import {
  getBacklinks,
  getReferences,
  readRecord,
  traverse,
  type TraverseOptions,
} from './record.ts'
import { VERSION } from './version.generated.ts'

/**
 * Options for the MCP server.
 *
 * @experimental
 */
export interface McpOptions {
  /** The server's name to the client. Default `corpus-query`. */
  name?: string
  /** How many records `find_records` returns when the call gives no `limit`. Default 20. */
  defaultLimit?: number
  /** The most records, references or backlinks one call may ask for. Default 200. */
  maxLimit?: number
  /** How many characters of a body `get_record` returns when the call gives no `bodyLimit`. Default 8000. */
  bodyLimit?: number
}

type Args = Record<string, unknown>
type Schema = Tool['inputSchema']

/** How many characters of a body `get_record` returns when the call gives no `bodyLimit`. */
const DEFAULT_BODY_LIMIT = 8000

/** How many items `get_references`, `get_backlinks` and `traverse` return when the call gives no `limit`. */
const DEFAULT_PAGE = 50

const RECORD = {
  type: 'string',
  description:
    'The record, by its ref: <type>/<id>, as every result gives it. <corpus key>/<type>/<id> for a record of a referenced corpus.',
}
const PAGE = {
  offset: { type: 'integer', minimum: 0, description: 'How many to skip. Default 0.' },
  limit: {
    type: 'integer',
    minimum: 0,
    description: `How many to return. Default ${DEFAULT_PAGE}.`,
  },
}
const object = (properties: Record<string, object>, required: string[] = []): Schema => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required,
})

const TOOLS: Tool[] = [
  {
    name: 'describe_corpus',
    description:
      'Start here. The corpus: its name and version, each type with its record count, and the corpora it references.',
    inputSchema: object({}),
  },
  {
    name: 'describe_type',
    description:
      'One type: each field with its kind, description and allowed values, and which fields are references to which types. Call it before filtering on a type.',
    inputSchema: object(
      {
        type: { type: 'string', description: 'The type name, as describe_corpus lists it.' },
        corpus: {
          type: 'string',
          description: 'The key of a referenced corpus. Absent: the loaded corpus.',
        },
      },
      ['type'],
    ),
  },
  {
    name: 'find_records',
    description:
      'Find records by type, conditions and full-text search. Returns total, the page of records and next, the offset of the next page (null on the last). ' +
      'Each record has its ref (<type>/<id>), its title when that is not the id, and a snippet with search. By default 20 records and no data: name the fields you need in fields (or * for all), ' +
      'pass body: true for Markdown bodies, raise limit, or page with offset. Read one record in full with get_record.',
    inputSchema: QUERY_SCHEMA as Schema,
  },
  {
    name: 'get_record',
    description:
      'One record in full: its data, its Markdown body, what it refers to and what refers to it. A long body is cut: bodyNext is the bodyOffset of the rest. ' +
      'Only the first 20 backlinks are returned; backlinksTotal says how many there are, and get_backlinks pages through them.',
    inputSchema: object(
      {
        record: RECORD,
        body: { type: 'boolean', description: 'false leaves the body out. Default true.' },
        bodyOffset: {
          type: 'integer',
          minimum: 0,
          description: 'Where in the body to start. Default 0.',
        },
        bodyLimit: {
          type: 'integer',
          minimum: 0,
          description: `How many characters of the body to return. Default ${DEFAULT_BODY_LIMIT}.`,
        },
      },
      ['record'],
    ),
  },
  {
    name: 'get_references',
    description:
      'What a record refers to: each value of its reference fields and each link in its body, with the record it points at.',
    inputSchema: object({ record: RECORD, ...PAGE }, ['record']),
  },
  {
    name: 'get_backlinks',
    description:
      'What refers to a record: each record whose reference field or body links to it, with the field.',
    inputSchema: object({ record: RECORD, ...PAGE }, ['record']),
  },
  {
    name: 'traverse',
    description:
      'The records within a few hops of a record, following its references (direction out) or what refers to it (direction in). Returns nodes with their depth, and edges.',
    inputSchema: object(
      {
        record: RECORD,
        direction: { enum: ['out', 'in'], description: 'Default out.' },
        via: {
          anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
          description: 'The reference field or fields to follow. Absent: every one.',
        },
        links: {
          type: 'boolean',
          description: 'Whether to follow links in Markdown bodies too. Default false.',
        },
        depth: {
          type: 'integer',
          minimum: 1,
          maximum: 10,
          description: 'How many hops. Default 1.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          description: `How many records at most. Default ${DEFAULT_PAGE}.`,
        },
      },
      ['record'],
    ),
  },
  {
    name: 'count_facets',
    description:
      'Count the values of one or more fields over the records a query selects, most frequent first. Use it to see which values a field has before filtering on it.',
    inputSchema: FACET_SCHEMA as Schema,
  },
]

/**
 * The tools the server offers, with their input schemas.
 *
 * @experimental
 */
export const mcpTools = (): Tool[] => TOOLS.map((t) => ({ ...t }))

const SCHEME = 'corpus:'

/** The MCP error code for a resource that does not exist. */
const RESOURCE_NOT_FOUND = -32002

function need(args: Args, name: string): string {
  const value = args[name]
  if (typeof value !== 'string' || value === '')
    throw new QueryError('bad-query', `${name}: expected a string`)
  return value
}

function whole(args: Args, name: string, otherwise: number, most = Infinity): number {
  const value = args[name]
  if (value === undefined) return otherwise
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0)
    throw new QueryError('bad-query', `${name}: expected a whole number, 0 or more`)
  return Math.min(value, most)
}

function keys(args: Args, tool: Tool): void {
  const known = Object.keys(tool.inputSchema.properties ?? {})
  const stray = Object.keys(args).find((k) => !known.includes(k))
  if (stray !== undefined)
    throw new QueryError(
      'bad-query',
      `no argument '${stray}' for ${tool.name}; arguments: ${known.join(', ') || 'none'}`,
    )
}

function page<T>(all: T[], args: Args, most: number, name: string): Record<string, unknown> {
  const offset = whole(args, 'offset', 0)
  const limit = whole(args, 'limit', DEFAULT_PAGE, most)
  const items = all.slice(offset, offset + limit)
  const end = offset + items.length
  return { total: all.length, offset, limit, next: end < all.length ? end : null, [name]: items }
}

/**
 * Cuts each nested record header as `createMcpServer` describes. The result's own keys stay, so
 * `get_record` still says the record's path.
 */
function slim(value: unknown, top = true): unknown {
  if (Array.isArray(value)) return value.map((v) => slim(v, false))
  if (typeof value !== 'object' || value === null) return value
  const o = value as Record<string, unknown>
  const header = !top && typeof o['ref'] === 'string' && 'path' in o && 'type' in o && 'id' in o
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) {
    if (header && (k === 'corpus' || k === 'type' || k === 'id' || k === 'path')) continue
    if (header && ((k === 'identity' && v === null) || (k === 'title' && v === o['id']))) continue
    // A record's own data is the corpus's, not a result of this server: leave it as it is.
    out[k] = k === 'data' || k === 'value' ? v : slim(v, false)
  }
  return out
}

/**
 * An MCP server over a corpus, or over a function that returns the current one, not yet
 * connected. Connect it with `server.connect(transport)`, or use `serveMcpStdio`.
 *
 * Tools: `describe_corpus`, `describe_type`, `find_records`, `get_record`, `get_references`,
 * `get_backlinks`, `traverse` and `count_facets`. A record inside a result is cut to its `ref`,
 * its `title` when that is not the id, and its `identity` when it has one. An error a query can
 * make, such as an unknown type or field, is a tool result with `isError` whose text lists what
 * exists. Each record of the loaded corpus is also a resource,
 * `corpus://<corpus name>/<type>/<id>`, read as JSON.
 *
 * @experimental
 */
export function createMcpServer(
  corpus: LoadedCorpus | (() => LoadedCorpus),
  options: McpOptions = {},
): Server {
  const model = (): LoadedCorpus => (typeof corpus === 'function' ? corpus() : corpus)
  const maxLimit = options.maxLimit ?? 200
  const first = model()
  const server = new Server(
    { name: options.name ?? 'corpus-query', version: VERSION },
    {
      capabilities: { tools: {}, resources: {} },
      instructions:
        `Read-only access to the corpus '${first.name}': ${first.records.length} records of the types ` +
        `${first.types.map((t) => t.name).join(', ')}. Call describe_corpus first, describe_type before ` +
        `filtering on a type's fields, then find_records and get_record. A record is named by its ref, <type>/<id>.`,
    },
  )

  const call = (name: string, args: Args): unknown => {
    const m = model()
    switch (name) {
      case 'describe_corpus':
        return describeCorpus(m)
      case 'describe_type':
        return describeType(m, need(args, 'type'), args['corpus'] as string | undefined)
      case 'find_records': {
        const limit = whole(args, 'limit', options.defaultLimit ?? 20, maxLimit)
        return findRecords(m, { ...(args as Query), limit })
      }
      case 'count_facets':
        return countFacets(m, args as unknown as FacetQuery)
      case 'get_record': {
        const offset = whole(args, 'bodyOffset', 0)
        const limit = whole(args, 'bodyLimit', options.bodyLimit ?? DEFAULT_BODY_LIMIT)
        const {
          body,
          backlinks = [],
          ...record
        } = readRecord(m, need(args, 'record'), {
          body: args['body'] !== false,
        })
        const cut = typeof body === 'string' ? body.slice(offset, offset + limit) : body
        return {
          ...record,
          ...(body === undefined ? {} : { body: cut }),
          ...(typeof body === 'string'
            ? {
                bodyLength: body.length,
                bodyNext: offset + limit < body.length ? offset + limit : null,
              }
            : {}),
          backlinks: backlinks.slice(0, 20),
          backlinksTotal: backlinks.length,
        }
      }
      case 'get_references':
        return page(getReferences(m, need(args, 'record')), args, maxLimit, 'references')
      case 'get_backlinks':
        return page(getBacklinks(m, need(args, 'record')), args, maxLimit, 'backlinks')
      case 'traverse': {
        const { record: _record, ...rest } = args
        return traverse(m, need(args, 'record'), {
          ...(rest as TraverseOptions),
          limit: Math.max(1, whole(args, 'limit', DEFAULT_PAGE, maxLimit)),
        })
      }
      default:
        throw new McpError(ErrorCode.InvalidParams, `no tool '${name}'`)
    }
  }

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: TOOLS.map((t) => ({
      ...t,
      annotations: { readOnlyHint: true, openWorldHint: false },
    })),
  }))
  server.setRequestHandler(CallToolRequestSchema, (request): CallToolResult => {
    const tool = TOOLS.find((t) => t.name === request.params.name)
    // The protocol names an unknown tool as a request error, not a tool result.
    if (tool === undefined)
      throw new McpError(ErrorCode.InvalidParams, `no tool '${request.params.name}'`)
    try {
      const args = request.params.arguments ?? {}
      keys(args, tool)
      const result = slim(call(tool.name, args)) as Record<string, unknown>
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
      }
    } catch (e) {
      if (!(e instanceof QueryError)) throw e
      return {
        content: [{ type: 'text', text: e.message }],
        isError: true,
        _meta: { code: e.code },
      }
    }
  })

  const uriOf = (name: string, ref: string): string =>
    `${SCHEME}//${name}/${ref.split('/').map(encodeURIComponent).join('/')}`
  server.setRequestHandler(ListResourceTemplatesRequestSchema, () => ({
    resourceTemplates: [
      {
        uriTemplate: `${SCHEME}//${model().name}/{type}/{id}`,
        name: 'record',
        description: 'One record of the corpus as JSON: its data, body and references.',
        mimeType: 'application/json',
      },
    ],
  }))
  server.setRequestHandler(ListResourcesRequestSchema, (request) => {
    const m = model()
    const at = Number(request.params?.cursor ?? 0)
    if (!Number.isInteger(at) || at < 0) throw new McpError(ErrorCode.InvalidParams, 'bad cursor')
    const end = at + 100
    return {
      resources: m.records.slice(at, end).map((r) => ({
        uri: uriOf(m.name, `${r.type}/${r.id}`),
        name: r.title,
        description: `${r.type}/${r.id}`,
        mimeType: 'application/json',
      })),
      ...(end < m.records.length ? { nextCursor: String(end) } : {}),
    }
  })
  server.setRequestHandler(ReadResourceRequestSchema, (request) => {
    const { uri } = request.params
    try {
      const url = new URL(uri)
      if (url.protocol !== SCHEME) throw new QueryError('not-found', `no resource ${uri}`)
      const ref = url.pathname
        .split('/')
        .filter((p) => p !== '')
        .map(decodeURIComponent)
        .join('/')
      const record = readRecord(model(), ref, { backlinks: false })
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(record) }] }
    } catch (e) {
      const message = e instanceof Error ? e.message : `no resource ${uri}`
      if (e instanceof QueryError && e.code === 'not-found')
        throw new McpError(RESOURCE_NOT_FOUND, message, { uri })
      throw new McpError(ErrorCode.InvalidParams, message)
    }
  })
  return server
}

/**
 * Serve a corpus over `transport`, by default stdio, until the client goes away. Under stdio,
 * stdout carries only the protocol.
 *
 * @experimental
 */
export async function serveMcpStdio(
  corpus: LoadedCorpus | (() => LoadedCorpus),
  options: McpOptions & { transport?: Transport; signal?: AbortSignal } = {},
): Promise<void> {
  const server = createMcpServer(corpus, options)
  const closed = new Promise<void>((done) => {
    server.onclose = () => done()
  })
  const stop = (): void => void server.close()
  // The stdio transport does not close when stdin ends, so a client that exits would leave it running.
  if (options.transport === undefined) process.stdin.once('end', stop)
  options.signal?.addEventListener('abort', stop, { once: true })
  await server.connect(options.transport ?? new StdioServerTransport())
  if (options.signal?.aborted === true) stop()
  await closed
  process.stdin.off('end', stop)
  options.signal?.removeEventListener('abort', stop)
}

/**
 * The MCP server over streamable HTTP, as a `(Request) => Response` function to mount at one
 * path, such as `/mcp`. It keeps no session: each request gets a server of its own, and answers
 * come back as JSON.
 *
 * @experimental
 */
export function createMcpHandler(
  corpus: LoadedCorpus | (() => LoadedCorpus),
  options: McpOptions = {},
): (request: Request) => Promise<Response> {
  return async (request) => {
    const server = createMcpServer(corpus, options)
    const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true })
    await server.connect(transport)
    try {
      return await transport.handleRequest(request)
    } finally {
      void server.close()
    }
  }
}
