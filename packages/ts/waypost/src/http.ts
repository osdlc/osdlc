/**
 * A fetch-style server on `node:http`: the handler takes a web `Request` and
 * returns a `Response`, and the body streams out chunk by chunk. Runs under
 * Node and Bun.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

/** A running server. */
export interface FetchServer {
  readonly port: number
  /** Stop accepting, let open responses finish, then resolve. */
  stop(): Promise<void>
}

export type FetchHandler = (req: Request, server: FetchServer) => Response | Promise<Response>

export interface ServeFetchOptions {
  hostname: string
  /** 0 lets the OS pick. */
  port: number
  fetch: FetchHandler
}

/** How long `stop` waits for busy connections before closing them. */
const STOP_GRACE_MS = 1000

function toRequest(req: IncomingMessage, origin: string, body: Buffer | null): Request {
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    for (const v of Array.isArray(value) ? value : [value]) headers.append(name, v)
  }
  return new Request(new URL(req.url ?? '/', origin), {
    method: req.method ?? 'GET',
    headers,
    ...(body !== null ? { body: new Uint8Array(body) } : {}),
  })
}

function readBody(req: IncomingMessage): Promise<Buffer | null> {
  if (req.method === 'GET' || req.method === 'HEAD') return Promise.resolve(null)
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/**
 * Write `response` out. Each chunk is written before the next is read, so a
 * stream's `pull` runs only after the previous chunk reached the socket.
 */
async function writeResponse(res: ServerResponse, response: Response): Promise<void> {
  const headers: Record<string, string> = {}
  response.headers.forEach((value, name) => {
    headers[name] = value
  })
  res.writeHead(response.status, headers)
  if (response.body === null) {
    res.end()
    return
  }
  const reader = response.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!res.write(value)) await new Promise<void>((resolve) => res.once('drain', resolve))
  }
  res.end()
}

/** Bind `hostname:port` and answer every request with `fetch`. */
export function serveFetch(options: ServeFetchOptions): Promise<FetchServer> {
  let handle!: FetchServer
  let stopping = false
  const server = createServer((req, res) => {
    // A response that finishes while stopping leaves an idle keep-alive
    // connection that would hold `close` open.
    res.on('finish', () => {
      if (stopping) setImmediate(() => server.closeIdleConnections())
    })
    void (async () => {
      try {
        const body = await readBody(req)
        const origin = `http://${req.headers.host ?? `${options.hostname}:${handle.port}`}`
        await writeResponse(res, await options.fetch(toRequest(req, origin, body), handle))
      } catch (err) {
        if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' })
        res.end(err instanceof Error ? err.message : String(err))
      }
    })()
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port, options.hostname, () => {
      server.off('error', reject)
      const port = (server.address() as AddressInfo).port
      handle = {
        port,
        stop: () =>
          new Promise<void>((done) => {
            stopping = true
            const force = setTimeout(() => server.closeAllConnections(), STOP_GRACE_MS)
            server.close(() => {
              clearTimeout(force)
              done()
            })
            server.closeIdleConnections()
          }),
      }
      resolve(handle)
    })
  })
}
