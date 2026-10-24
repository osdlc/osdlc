/** The `node:http` adapter the web view serves through. */

import { expect, test } from 'vitest'
import { request } from 'node:http'

import { serveFetch } from '../src/http.ts'

test('hands the handler a web Request with its method, path, headers and body', async () => {
  const server = await serveFetch({
    hostname: '127.0.0.1',
    port: 0,
    fetch: async (req) =>
      Response.json({
        method: req.method,
        path: new URL(req.url).pathname + new URL(req.url).search,
        header: req.headers.get('x-test'),
        body: await req.text(),
      }),
  })
  try {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/x?force`, {
      method: 'POST',
      headers: { 'x-test': 'yes' },
      body: 'hello',
    })
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await res.json()).toEqual({
      method: 'POST',
      path: '/api/x?force',
      header: 'yes',
      body: 'hello',
    })
  } finally {
    await server.stop()
  }
})

test('streams a body chunk by chunk, so an event stream reaches the client as it is written', async () => {
  let push!: (chunk: string) => void
  const server = await serveFetch({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            push = (chunk) => controller.enqueue(new TextEncoder().encode(chunk))
            push('first\n')
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      ),
  })
  try {
    const res = await fetch(`http://127.0.0.1:${server.port}/`)
    const reader = res.body!.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('first\n')
    push('second\n')
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('second\n')
    await reader.cancel()
  } finally {
    await server.stop()
  }
})

test('a handler that throws is a 500 with its message', async () => {
  const server = await serveFetch({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () => {
      throw new Error('boom')
    },
  })
  try {
    const res = await fetch(`http://127.0.0.1:${server.port}/`)
    expect(res.status).toBe(500)
    expect(await res.text()).toBe('boom')
  } finally {
    await server.stop()
  }
})

test('stop resolves with a keep-alive connection still open', async () => {
  const server = await serveFetch({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () => new Response('ok'),
  })
  const agentDone = new Promise<void>((resolve) => {
    const req = request(
      { host: '127.0.0.1', port: server.port, path: '/', headers: { connection: 'keep-alive' } },
      (res) => {
        res.resume()
        res.on('end', resolve)
      },
    )
    req.end()
  })
  await agentDone
  const started = Date.now()
  await server.stop()
  expect(Date.now() - started).toBeLessThan(900)
})
