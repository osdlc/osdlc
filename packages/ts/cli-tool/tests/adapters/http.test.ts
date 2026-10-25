import { request as httpRequest } from 'node:http'

import { afterEach, describe, expect, test } from 'vitest'

import { createHttpApi, serveHttp, type HttpApi, type HttpServer } from '../../src/http/index.ts'
import { captureContext } from '../../src/io.ts'
import { fixture, type Fixture } from './fixture.ts'

const CTX = { cwd: '/repo', env: {} }

interface Sent {
  status: number
  headers: Record<string, string | string[] | undefined>
  body: string
  json<T = Record<string, unknown>>(): T
}

/** A raw request, so a test can send any Host or Origin header. */
function send(
  server: HttpServer,
  options: { method?: string; path: string; headers?: Record<string, string>; body?: string },
): Promise<Sent> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port: server.port,
        method: options.method ?? 'GET',
        path: options.path,
        headers: options.headers ?? {},
      },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (c: string) => (body += c))
        res.on('end', () =>
          resolve({
            status: res.statusCode!,
            headers: res.headers,
            body,
            json: () => JSON.parse(body),
          }),
        )
      },
    )
    req.on('error', reject)
    if (options.body !== undefined) req.write(options.body)
    req.end()
  })
}

let running: HttpServer[] = []
afterEach(async () => {
  await Promise.all(running.map((s) => s.stop()))
  running = []
})

async function start(
  f: Fixture = fixture(),
  options: Partial<Parameters<typeof createHttpApi>[1]> = {},
): Promise<{ f: Fixture; api: HttpApi; server: HttpServer; auth: Record<string, string> }> {
  const api = createHttpApi(f.app, { context: CTX, ...options })
  const server = await serveHttp(api.fetch)
  running.push(server)
  return { f, api, server, auth: { authorization: `Bearer ${api.token}` } }
}

const post = (
  server: HttpServer,
  path: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<Sent> =>
  send(server, {
    method: 'POST',
    path,
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

describe('checks', () => {
  test('every route needs the token, and answers the same 401 without it', async () => {
    const { server, api } = await start()
    for (const path of ['/schema', '/help', '/commands/items', '/nope']) {
      const res = await send(server, { path })
      expect([res.status, res.body]).toEqual([401, 'unauthorized'])
    }
    const wrong = await send(server, { path: '/schema', headers: { authorization: 'Bearer nope' } })
    expect(wrong.status).toBe(401)
    const cookie = await send(server, { path: '/schema', headers: { cookie: `t=${api.token}` } })
    expect(cookie.status).toBe(401)
  })

  test('a Host that is not loopback is refused, even with the token', async () => {
    const { server, auth } = await start()
    const res = await send(server, { path: '/schema', headers: { ...auth, host: 'evil.test' } })
    expect([res.status, res.body]).toEqual([403, 'forbidden'])
    for (const host of [`localhost:${server.port}`, `127.0.0.1:${server.port}`, '[::1]']) {
      expect((await send(server, { path: '/schema', headers: { ...auth, host } })).status).toBe(200)
    }
  })

  test('an Origin that is not this server, or a cross-site fetch, is refused', async () => {
    const { server, auth } = await start()
    const other = await send(server, {
      path: '/schema',
      headers: { ...auth, origin: 'http://evil.test' },
    })
    expect(other.status).toBe(403)
    const port = await send(server, {
      path: '/schema',
      headers: { ...auth, origin: 'http://localhost:1' },
    })
    expect(port.status).toBe(403)
    const site = await send(server, {
      path: '/schema',
      headers: { ...auth, 'sec-fetch-site': 'cross-site' },
    })
    expect(site.status).toBe(403)
    const same = await send(server, {
      path: '/schema',
      headers: { ...auth, origin: `http://127.0.0.1:${server.port}` },
    })
    expect(same.status).toBe(200)
  })

  test('the Host check comes before the token check', async () => {
    const { server } = await start()
    expect((await send(server, { path: '/schema', headers: { host: 'evil.test' } })).status).toBe(
      403,
    )
  })

  test('a body over the limit is refused, after the token check', async () => {
    const { server, auth } = await start(fixture(), { maxBodyBytes: 64 })
    const big = JSON.stringify({ name: 'x'.repeat(100) })
    const unauthenticated = await post(server, '/commands/items/add', big, {})
    expect(unauthenticated.status).toBe(401)
    const res = await post(server, '/commands/items/add', big, auth)
    expect(res.status).toBe(413)
    // Without a length header, the limit holds as the body is read.
    const api = createHttpApi(fixture().app, { context: CTX, maxBodyBytes: 64 })
    const streamed = await api.fetch(
      new Request('http://127.0.0.1/commands/items/add', {
        method: 'POST',
        headers: {
          host: '127.0.0.1',
          authorization: `Bearer ${api.token}`,
          'content-type': 'application/json',
        },
        body: new ReadableStream({
          start(c) {
            c.enqueue(new TextEncoder().encode(big))
            c.close()
          },
        }),
        duplex: 'half',
      } as RequestInit),
    )
    expect(streamed.status).toBe(413)
  })

  test('a command call must be JSON', async () => {
    const { server, auth } = await start()
    const res = await send(server, {
      method: 'POST',
      path: '/commands/items/add',
      headers: { ...auth, 'content-type': 'text/plain' },
      body: '{}',
    })
    expect(res.status).toBe(415)
    expect((await post(server, '/commands/items/add', '{nope', auth)).status).toBe(400)
  })

  test('the wrong method is refused', async () => {
    const { server, auth } = await start()
    expect((await send(server, { path: '/commands/items', headers: auth })).status).toBe(405)
    expect((await post(server, '/schema', {}, auth)).status).toBe(405)
    expect((await post(server, '/help', {}, auth)).status).toBe(405)
  })

  test('there is no CORS', async () => {
    const { server, auth } = await start()
    const res = await send(server, {
      method: 'OPTIONS',
      path: '/commands/items',
      headers: { ...auth, origin: `http://127.0.0.1:${server.port}` },
    })
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
    expect(res.status).toBe(405)
  })
})

describe('routes', () => {
  test('GET /schema lists the callable commands with their args', async () => {
    const { server, auth } = await start()
    const res = await send(server, { path: '/schema', headers: auth })
    const doc = res.json<{ kind: string; commands: { path: string[]; args: unknown }[] }>()
    expect(doc.kind).toBe('http-schema')
    const paths = doc.commands.map((c) => c.path.join(' '))
    expect(paths).toContain('items add')
    expect(paths).not.toContain('secret')
    expect(paths).not.toContain('tui')
    expect(paths).not.toContain('serve-api')
    expect(doc.commands.find((c) => c.path.join(' ') === 'items add')!.args).toMatchObject({
      required: ['name'],
    })
  })

  test('GET /help answers the help document', async () => {
    const { server, auth } = await start()
    const res = await send(server, { path: '/help/items?depth=all&full', headers: auth })
    expect(res.json()).toMatchObject({ kind: 'help', help: { path: ['items'] } })
    expect((await send(server, { path: '/help/nope', headers: auth })).status).toBe(404)
  })

  test('POST /commands/<path> round-trips the same document as --json', async () => {
    const { f, server, auth } = await start(fixture(), { globals: { dir: '/fixed' } })
    const res = await post(server, '/commands/items/add', { name: 'c' }, auth)
    expect(res.status).toBe(200)
    expect(res.headers['x-exit-code']).toBe('0')
    expect(res.headers['cache-control']).toBe('no-store')
    const doc = res.json()
    expect(f.app.documentContract(['items', 'add']).safeParse(doc).success).toBe(true)
    expect(doc).toMatchObject({ schemaVersion: 1, kind: 'items', dir: '/fixed' })
    const list = await post(server, '/commands/items', '', auth)
    expect(list.json()).toMatchObject({ kind: 'items' })
  })

  test('wrong arguments are 400, a failed run is 422, no such command is 404', async () => {
    const { server, auth } = await start()
    const usage = await post(server, '/commands/items/add', {}, auth)
    expect([usage.status, usage.json()]).toEqual([
      400,
      { schemaVersion: 1, kind: 'error', exit: 2, message: "'name' is required" },
    ])
    const failed = await post(server, '/commands/fails', {}, auth)
    expect([failed.status, failed.json()]).toEqual([
      422,
      { schemaVersion: 1, kind: 'error', exit: 1, message: 'it broke', hint: 'try again' },
    ])
    expect((await post(server, '/commands/nope', {}, auth)).status).toBe(404)
    expect((await post(server, '/commands/tui', {}, auth)).status).toBe(404)
    expect((await send(server, { path: '/nope', headers: auth })).status).toBe(404)
  })

  test('a non-zero exit with a document is 200 with the exit code', async () => {
    const { server, auth } = await start()
    const res = await post(server, '/commands/trust', { untrust: true }, auth)
    expect([res.status, res.headers['x-exit-code']]).toEqual([200, '1'])
  })

  test('under a prefix, only paths under it are answered', async () => {
    const { server, auth, api } = await start(fixture(), { prefix: '/api/' })
    expect(api.prefix).toBe('/api')
    expect((await send(server, { path: '/api/schema', headers: auth })).status).toBe(200)
    expect((await send(server, { path: '/schema', headers: auth })).status).toBe(404)
    expect(api.handles(new Request('http://x/api/help'))).toBe(true)
    expect(api.handles(new Request('http://x/apix'))).toBe(false)
  })

  test('readOnly mounts only the commands that change nothing', async () => {
    const { server, auth } = await start(fixture(), { readOnly: true })
    expect((await post(server, '/commands/items/add', { name: 'c' }, auth)).status).toBe(404)
    expect((await post(server, '/commands/items/list', {}, auth)).status).toBe(200)
  })
})

describe('cli-only commands', () => {
  test('a cli-only command and a trust grant are refused with 403', async () => {
    const { f, server, auth } = await start()
    expect((await post(server, '/commands/secret', {}, auth)).status).toBe(404)
    const grant = await post(server, '/commands/trust', {}, auth)
    expect([grant.status, grant.json()]).toEqual([
      403,
      {
        schemaVersion: 1,
        kind: 'error',
        exit: 1,
        message: "'tooly trust' runs from the command line only",
        refused: 'cli-only',
      },
    ])
    const write = await post(server, '/commands/config/set', { key: 'trust', value: '{}' }, auth)
    expect(write.status).toBe(403)
    expect(f.trusted.size).toBe(0)
    const show = await post(server, '/commands/trust', { show: true }, auth)
    expect(show.status).toBe(200)
  })

  test('a mount that lists one in confirm runs it only with a fresh nonce for the same request', async () => {
    const { f, server, auth } = await start(fixture(), { confirm: [['trust']] })
    const first = await post(server, '/commands/trust', {}, auth)
    expect(first.status).toBe(428)
    const ask = first.json<{ kind: string; nonce: string; command: string }>()
    expect(ask).toMatchObject({ kind: 'confirm', command: 'tooly trust' })
    expect(f.trusted.size).toBe(0)

    // The nonce is bound to the request it was issued for.
    const other = await post(
      server,
      '/commands/trust',
      { scope: 'x' },
      { ...auth, 'x-confirm': ask.nonce },
    )
    expect(other.status).toBe(403)

    const again = await post(server, '/commands/trust', {}, auth)
    const nonce = again.json<{ nonce: string }>().nonce
    const ok = await post(server, '/commands/trust', {}, { ...auth, 'x-confirm': nonce })
    expect(ok.status).toBe(200)
    expect(f.trusted.has('/repo')).toBe(true)
    // And it works once.
    const replay = await post(server, '/commands/trust', {}, { ...auth, 'x-confirm': nonce })
    expect(replay.status).toBe(403)
    // A cli-only command not listed in confirm is still refused.
    expect(
      (await post(server, '/commands/config/set', { key: 'trust', value: '1' }, auth)).status,
    ).toBe(403)
  })

  test('a nonce expires', async () => {
    const { server, auth } = await start(fixture(), { confirm: [['trust']], confirmTtlMs: -1 })
    const nonce = (await post(server, '/commands/trust', {}, auth)).json<{ nonce: string }>().nonce
    expect(
      (await post(server, '/commands/trust', {}, { ...auth, 'x-confirm': nonce })).status,
    ).toBe(403)
  })

  test('the schema marks a confirmable command', async () => {
    const { server, auth } = await start(fixture(), { confirm: [['secret']] })
    const doc = (await send(server, { path: '/schema', headers: auth })).json<{
      commands: { path: string[]; confirm?: boolean }[]
    }>()
    expect(doc.commands.find((c) => c.path[0] === 'secret')).toMatchObject({ confirm: true })
  })
})

describe('streaming', () => {
  test('Accept: application/x-ndjson streams the events, then the document', async () => {
    const { server, auth } = await start()
    const res = await post(
      server,
      '/commands/watch',
      { steps: '2' },
      {
        ...auth,
        accept: 'application/x-ndjson',
      },
    )
    expect(res.headers['content-type']).toBe('application/x-ndjson')
    expect(
      res.body
        .trimEnd()
        .split('\n')
        .map((l) => JSON.parse(l)),
    ).toEqual([
      { schemaVersion: 1, kind: 'step', step: 1 },
      { schemaVersion: 1, kind: 'step', step: 2 },
      { schemaVersion: 1, kind: 'watch', steps: 2, cancelled: false },
    ])
  })

  test('a failure ends the stream with an error line', async () => {
    const { server, auth } = await start()
    const res = await post(
      server,
      '/commands/fails',
      {},
      { ...auth, accept: 'application/x-ndjson' },
    )
    expect(res.status).toBe(200)
    expect(JSON.parse(res.body)).toMatchObject({ kind: 'error', message: 'it broke' })
  })

  test('a refusal keeps its status', async () => {
    const { server, auth } = await start()
    const res = await post(
      server,
      '/commands/trust',
      {},
      { ...auth, accept: 'application/x-ndjson' },
    )
    expect(res.status).toBe(403)
  })

  test('closing the connection cancels the command', async () => {
    const { f, server, auth } = await start()
    await new Promise<void>((resolve, reject) => {
      const req = httpRequest(
        {
          host: '127.0.0.1',
          port: server.port,
          method: 'POST',
          path: '/commands/watch',
          headers: { ...auth, 'content-type': 'application/json', accept: 'application/x-ndjson' },
        },
        (res) => {
          res.once('data', () => {
            req.destroy()
            resolve()
          })
        },
      )
      req.on('error', () => {})
      req.on('close', resolve)
      req.end(JSON.stringify({ steps: '1', hang: true }))
      setTimeout(() => reject(new Error('no first line')), 2000)
    })
    await f.aborted
  })

  test('the stream can be cancelled from the reader side', async () => {
    const f = fixture()
    const api = createHttpApi(f.app, { context: CTX })
    const res = await api.fetch(
      new Request('http://127.0.0.1/commands/watch', {
        method: 'POST',
        headers: {
          host: '127.0.0.1',
          authorization: `Bearer ${api.token}`,
          'content-type': 'application/json',
          accept: 'application/x-ndjson',
        },
        body: JSON.stringify({ steps: '1', hang: true }),
      }),
    )
    const reader = res.body!.getReader()
    await reader.read()
    await reader.cancel()
    await f.aborted
  })
})

describe('mounting', () => {
  test('checkOrigin and hasToken guard an app’s own routes', () => {
    const api = createHttpApi(fixture().app, { context: CTX, token: 'fixed' })
    expect(api.token).toBe('fixed')
    const ok = new Request('http://127.0.0.1/', { headers: { host: 'localhost:9' } })
    expect(api.checkOrigin(ok)).toBeNull()
    expect(api.hasToken(ok)).toBe(false)
    const bad = new Request('http://127.0.0.1/', { headers: { host: 'evil.test' } })
    expect(api.checkOrigin(bad)!.status).toBe(403)
    expect(
      api.hasToken(
        new Request('http://127.0.0.1/', { headers: { authorization: 'Bearer fixed' } }),
      ),
    ).toBe(true)
  })

  test('the serve-api command prints the address and token, and stops on the signal', async () => {
    const { app } = fixture()
    const aborter = new AbortController()
    const ctx = { ...captureContext({ cwd: '/repo', env: {} }), signal: aborter.signal }
    const done = app.run(['serve-api', '--read-only'], ctx)
    for (let i = 0; i < 100 && !ctx.io.out.includes('token'); i++) {
      await new Promise((r) => setTimeout(r, 10))
    }
    const url = /api {2}(http:\/\/127\.0\.0\.1:\d+)/.exec(ctx.io.out)![1]!
    const token = /token {2}(\S+)/.exec(ctx.io.out)![1]!
    const res = await fetch(`${url}/schema`, { headers: { authorization: `Bearer ${token}` } })
    expect(res.status).toBe(200)
    aborter.abort()
    expect(await done).toBe(0)
  })

  test('serve-api refuses a bad port', async () => {
    const { app } = fixture()
    const ctx = captureContext({ cwd: '/repo', env: {} })
    expect(await app.run(['serve-api', '--port', 'x'], ctx)).toBe(2)
    expect(ctx.io.err).toContain('--port needs a number')
  })
})

describe('serveHttp', () => {
  test('a handler that throws answers 500', async () => {
    const server = await serveHttp(() => {
      throw new Error('boom')
    })
    running.push(server)
    const res = await send(server, { path: '/' })
    expect([res.status, res.body]).toEqual([500, 'internal error'])
  })

  test('a large body streams out whole, and a body-less response ends', async () => {
    const big = 'x'.repeat(8 * 1024 * 1024)
    const server = await serveHttp((req) =>
      new URL(req.url).pathname === '/empty'
        ? new Response(null, { status: 204 })
        : new Response(big),
    )
    running.push(server)
    expect((await send(server, { path: '/' })).body.length).toBe(big.length)
    expect((await send(server, { path: '/empty' })).status).toBe(204)
  })

  test('a reader that disconnects mid-stream cancels the body', async () => {
    let cancelled!: () => void
    const gone = new Promise<void>((resolve) => (cancelled = resolve))
    const server = await serveHttp(
      () =>
        new Response(
          new ReadableStream({
            pull(c) {
              c.enqueue(new Uint8Array(64 * 1024))
            },
            cancel() {
              cancelled()
            },
          }),
        ),
    )
    running.push(server)
    await new Promise<void>((resolve) => {
      const req = httpRequest({ host: '127.0.0.1', port: server.port, path: '/' }, (res) => {
        res.once('data', () => {
          req.destroy()
          resolve()
        })
      })
      req.on('error', () => {})
      req.end()
    })
    await gone
  })

  test('the port is in use: listening fails', async () => {
    const first = await serveHttp(() => new Response('a'))
    running.push(first)
    await expect(serveHttp(() => new Response('b'), { port: first.port })).rejects.toThrow()
  })
})
