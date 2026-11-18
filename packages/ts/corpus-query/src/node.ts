/**
 * `@osdlc/corpus-query/node`: find a corpus on disk, load it, and serve it over HTTP with
 * `node:http`.
 */
import { readdirSync, watch } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { dirname, resolve } from 'node:path'

import { findCorpora, type LoadedCorpus, loadCorpus } from '@osdlc/corpus-schema'

import { type CorpusQuery, corpusQuery } from './index.ts'
import { MAX_BODY } from './model.ts'
import { createRestHandler, type RestHandler, type RestOptions } from './rest.ts'

const ROOT_FILE = /.\.corpus-schema\.(md|yaml|json)$/

function isCorpus(dir: string): boolean {
  try {
    return readdirSync(dir, { withFileTypes: true }).some(
      (d) => d.isFile() && ROOT_FILE.test(d.name),
    )
  } catch {
    return false
  }
}

/**
 * The corpus a directory is in or holds: the nearest folder at or above `from` with a root
 * file, else the one corpus below it.
 *
 * @throws Error when there is no corpus, or more than one below `from`. The message is one line
 *   and lists the corpora found.
 * @experimental
 */
export function findCorpusRoot(from: string = process.cwd()): string {
  const start = resolve(from)
  for (let dir = start; ; dir = dirname(dir)) {
    if (isCorpus(dir)) return dir
    if (dirname(dir) === dir) break
  }
  const below = findCorpora(start)
  if (below.length === 1) return below[0] as string
  if (below.length === 0)
    throw new Error(`no corpus at, above or below ${start}; name a corpus folder`)
  throw new Error(`${below.length} corpora below ${start}; name one: ${below.join(', ')}`)
}

/**
 * Load the corpus at `root`, by default the one `findCorpusRoot` finds from `cwd`. A relative
 * `root` is read from `cwd`, by default the working directory. A corpus with errors still loads;
 * `errors` of the result says what they are.
 *
 * @throws Error when `root` holds no corpus root file, and as `findCorpusRoot`.
 * @experimental
 */
export function loadCorpusAt(root?: string, cwd: string = process.cwd()): LoadedCorpus {
  const dir = root === undefined ? findCorpusRoot(cwd) : resolve(cwd, root)
  const model = loadCorpus(dir)
  if (model.rootFile === null)
    throw new Error(`${dir}: not a corpus: no <name>.corpus-schema.md, .yaml or .json file`)
  return model
}

/**
 * Load a corpus and return the query functions bound to it.
 *
 * ```ts
 * const corpus = openCorpus('docs/corpus')
 * corpus.find({ type: 'decisions', where: 'status=accepted' })
 * ```
 *
 * @throws Error as `loadCorpusAt`.
 * @experimental
 */
export const openCorpus = (root?: string): CorpusQuery => corpusQuery(loadCorpusAt(root))

/**
 * Options for `serveRest`.
 *
 * @experimental
 */
export interface ServeOptions extends RestOptions {
  /** The address to bind. Default `127.0.0.1`, which only this machine reaches. */
  host?: string
  /** The port to bind. Default 0: any free port. */
  port?: number
  /** Load the corpus again when a file below its folder changes. Only for a corpus given by path. */
  watch?: boolean
  /**
   * Routes to try before the API's, such as an MCP endpoint. A handler answers, or returns
   * undefined to pass the request on.
   */
  before?: (request: Request) => Promise<Response | undefined> | Response | undefined
  /** Called with a line for each reload and each reload that failed. */
  log?: (line: string) => void
}

/**
 * A running server.
 *
 * @experimental
 */
export interface RestServer {
  /** The address to send requests to, such as `http://127.0.0.1:4010`. */
  url: string
  /** The address it is bound to. */
  host: string
  /** The port it is bound to. */
  port: number
  /** The `node:http` server. */
  server: Server
  /** The corpus as it is loaded now. */
  corpus(): LoadedCorpus
  /** Stop listening and stop watching. */
  close(): Promise<void>
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

function hostName(header: string | undefined): string {
  const host = header ?? ''
  const end = host.startsWith('[') ? host.indexOf(']') + 1 : host.lastIndexOf(':')
  return (end <= 0 ? host : host.slice(0, end)).toLowerCase()
}

async function requestOf(req: IncomingMessage): Promise<Request | number> {
  const url = `http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers))
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value)
  const method = req.method ?? 'GET'
  if (method === 'GET' || method === 'HEAD') return new Request(url, { method, headers })
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length
    if (size > MAX_BODY) return 413
    chunks.push(chunk)
  }
  return new Request(url, { method, headers, body: Buffer.concat(chunks) })
}

async function send(res: ServerResponse, response: Response): Promise<void> {
  res.writeHead(response.status, Object.fromEntries(response.headers))
  res.end(Buffer.from(await response.arrayBuffer()))
}

const refuse = (status: number, code: string, message: string): Response =>
  Response.json({ error: { code, message } }, { status })

/**
 * Serve a corpus over HTTP on `node:http`: the routes of `createRestHandler`. `corpus` is a
 * loaded corpus, a function that returns the current one, or a corpus folder to load.
 *
 * On a loopback address, a request whose `Host` names another host is refused with 403, so a
 * web page cannot reach the server by pointing its own domain at 127.0.0.1.
 *
 * @throws Error as `loadCorpusAt` for a folder that is no corpus, and the listen error when the
 *   port is taken.
 * @experimental
 */
export async function serveRest(
  corpus: LoadedCorpus | (() => LoadedCorpus) | string,
  options: ServeOptions = {},
): Promise<RestServer> {
  const host = options.host ?? '127.0.0.1'
  let current = typeof corpus === 'string' ? loadCorpusAt(corpus) : undefined
  const read = (): LoadedCorpus =>
    typeof corpus === 'function' ? corpus() : (current ?? (corpus as LoadedCorpus))
  const handler: RestHandler = createRestHandler(read, options)

  let timer: NodeJS.Timeout | undefined
  const watcher =
    options.watch === true && typeof corpus === 'string'
      ? watch(corpus, { recursive: true }, () => {
          clearTimeout(timer)
          timer = setTimeout(() => {
            try {
              current = loadCorpusAt(corpus)
              options.log?.(`reloaded ${current.name}: ${current.records.length} records`)
            } catch (e) {
              options.log?.(`reload failed: ${(e as Error).message}`)
            }
          }, 200)
        })
      : undefined

  const server = createServer((req, res) => {
    void (async () => {
      if (LOOPBACK.has(host) && !LOOPBACK.has(hostName(req.headers.host)))
        return send(res, refuse(403, 'forbidden', 'the Host header names another host'))
      const request = await requestOf(req)
      if (typeof request === 'number')
        return send(res, refuse(request, 'too-large', 'the body is over 1 MiB'))
      return send(res, (await options.before?.(request)) ?? (await handler(request)))
    })().catch(() => {
      if (!res.headersSent) res.writeHead(500)
      res.end()
    })
  })
  await new Promise<void>((done, fail) => {
    server.once('error', fail)
    server.listen(options.port ?? 0, host, () => {
      server.off('error', fail)
      done()
    })
  })
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : (options.port ?? 0)
  return {
    url: `http://${host.includes(':') ? `[${host}]` : host}:${port}`,
    host,
    port,
    server,
    corpus: read,
    close: () =>
      new Promise<void>((done) => {
        clearTimeout(timer)
        watcher?.close()
        server.close(() => done())
        server.closeAllConnections()
      }),
  }
}
