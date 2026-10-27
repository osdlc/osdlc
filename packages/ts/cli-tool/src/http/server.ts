/**
 * A fetch-style server on `node:http`, bound to loopback. The handler takes a
 * web `Request` and returns a `Response`. The request body is not read until
 * the handler reads it, so a handler can refuse a request before reading its
 * body. The response streams out chunk by chunk, and a client that
 * disconnects aborts `request.signal`.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Readable } from 'node:stream'

/**
 * A running server.
 * @experimental
 */
export interface HttpServer {
  /** `http://127.0.0.1:<port>`. */
  readonly url: string
  readonly port: number
  /** Stop accepting, let open responses finish for up to a second, then resolve. */
  stop(): Promise<void>
}

/**
 * Where {@link serveHttp} listens.
 * @experimental
 */
export interface ServeHttpOptions {
  /** The port. 0, the default, lets the system pick one. */
  port?: number
}

const STOP_GRACE_MS = 1000

function toRequest(req: IncomingMessage, signal: AbortSignal): Request {
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    for (const v of Array.isArray(value) ? value : [value]) headers.append(name, v)
  }
  // The URL's host is fixed: the Host header is the caller's to set, and is checked on its own.
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  const method = req.method ?? 'GET'
  const hasBody = method !== 'GET' && method !== 'HEAD'
  return new Request(url, {
    method,
    headers,
    signal,
    ...(hasBody
      ? { body: Readable.toWeb(req) as ReadableStream<Uint8Array>, duplex: 'half' as const }
      : {}),
  } as RequestInit)
}

async function writeResponse(
  req: IncomingMessage,
  res: ServerResponse,
  response: Response,
): Promise<void> {
  const headers: Record<string, string> = {}
  response.headers.forEach((value, name) => {
    headers[name] = value
  })
  // A body the handler refused to read is not drained: close the connection instead.
  if (!req.complete) headers['connection'] = 'close'
  res.writeHead(response.status, headers)
  if (response.body === null) {
    res.end()
    return
  }
  const reader = response.body.getReader()
  let closed = false
  const onClose = (): void => {
    if (res.writableFinished) return
    closed = true
    void reader.cancel().catch(() => {})
  }
  res.once('close', onClose)
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done || closed) break
      if (!res.write(value)) {
        await new Promise<void>((resolve) => {
          const go = (): void => {
            res.off('drain', go)
            res.off('close', go)
            resolve()
          }
          res.once('drain', go)
          res.once('close', go)
        })
        if (closed) break
      }
    }
  } finally {
    res.off('close', onClose)
  }
  if (!closed) res.end()
}

/**
 * Listen on 127.0.0.1 and answer every request with `fetch`. It never binds
 * another address.
 * @experimental
 */
export function serveHttp(
  fetch: (request: Request) => Response | Promise<Response>,
  options: ServeHttpOptions = {},
): Promise<HttpServer> {
  let stopping = false
  const server = createServer((req, res) => {
    const aborter = new AbortController()
    res.once('close', () => {
      if (!res.writableFinished) aborter.abort()
      if (stopping) setImmediate(() => server.closeIdleConnections())
    })
    void (async () => {
      try {
        const response = await fetch(toRequest(req, aborter.signal))
        await writeResponse(req, res, response)
      } catch {
        if (!res.headersSent) {
          res.writeHead(500, { 'content-type': 'text/plain' })
          res.end('internal error')
        } else res.destroy()
      }
    })()
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port ?? 0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port
      resolve({
        url: `http://127.0.0.1:${port}`,
        port,
        stop: () =>
          new Promise<void>((done) => {
            stopping = true
            const timer = setTimeout(() => server.closeAllConnections(), STOP_GRACE_MS)
            timer.unref()
            server.close(() => {
              clearTimeout(timer)
              done()
            })
            server.closeIdleConnections()
          }),
      })
    })
  })
}
