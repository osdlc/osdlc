/**
 * One command tree served three ways: the command line, MCP and local HTTP.
 * A list command prints JSON lines under `--output jsonl`, a long-running
 * command sends events, and granting trust stays on the command line.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { expect, test } from 'vitest'
import { z } from 'zod'

import { captureContext } from '@osdlc/cli-tool'
import {
  commandKit,
  defineApp,
  type CallOptions,
  type CallResult,
  type EventsSpec,
  type Exposure,
  type OutputMode,
  type Surface,
} from '@osdlc/cli-tool/command'
import {
  createHttpApi,
  httpApiCommand,
  newToken,
  readBody,
  serveHttp,
  tokenEquals,
  type HttpApi,
  type HttpApiOptions,
  type HttpServer,
  type ServeHttpOptions,
} from '@osdlc/cli-tool/http'
import {
  createMcpServer,
  mcpCommand,
  mcpTools,
  serveMcp,
  toolName,
  type McpOptions,
  type McpTool,
} from '@osdlc/cli-tool/mcp'
import { runApp } from '@osdlc/cli-tool/testing'
import { trustCommand, type TrustService } from '@osdlc/cli-tool/trust-command'

const { command, group } = commandKit({ globals: {} })
const notes = ['buy milk']
const trusted = new Set<string>()

const list = command({
  summary: 'every note',
  output: z.object({ notes: z.array(z.object({ text: z.string() })) }),
  kind: 'notes',
  // `--output jsonl` prints one `note` line per element of `notes`.
  items: { field: 'notes', kind: 'note' },
  readOnly: true,
  run: () => ({ notes: notes.map((text) => ({ text })) }),
  text: (o) => o.notes.map((n) => `${n.text}\n`).join(''),
})

const add = command({
  summary: 'add a note',
  positionals: [{ name: 'text', required: true, help: 'the note' }],
  output: z.object({ count: z.number() }),
  run: ({ positionals }) => ({ count: notes.push(positionals[0]!) }),
})

const progress: EventsSpec = {
  schema: z.object({ done: z.number() }),
  kind: 'progress',
  text: (e) => `${String(e['done'])} done\n`,
}
const sync = command({
  summary: 'sync the notes, reporting as it goes',
  output: z.object({ synced: z.number() }),
  events: progress,
  run(_input, ctx) {
    notes.forEach((_n, i) => ctx.emit({ done: i + 1 }))
    return { synced: notes.length }
  },
})

const wipe = command({
  summary: 'delete every note',
  output: z.object({ removed: z.number() }),
  destructive: true,
  // An agent or a page may not run this; a person at the terminal may.
  exposure: 'cli-only' satisfies Exposure,
  run: () => ({ removed: notes.splice(0).length }),
})

const service: TrustService = {
  trust: async (ctx) => (
    trusted.add(ctx.cwd),
    { root: ctx.cwd, trusted: true, by: 'marker', changed: true }
  ),
  untrust: async (ctx) => ({
    root: ctx.cwd,
    trusted: false,
    by: null,
    changed: trusted.delete(ctx.cwd),
  }),
  show: async (ctx) => ({ root: ctx.cwd, trusted: trusted.has(ctx.cwd), by: null }),
  list: async () => [],
}

const app = defineApp({
  name: 'notes',
  version: '1.0.0',
  summary: 'keep notes',
  commands: {
    note: group({ summary: 'the notes', default: list, commands: { list, add, sync, wipe } }),
    trust: trustCommand(service),
    mcp: mcpCommand(),
    'serve-api': httpApiCommand(),
  },
})

test('a list prints one JSON line per item; events print as they come', async () => {
  const mode: OutputMode = 'jsonl'
  const lines = (await runApp(app, ['note', '--output', mode])).out.trimEnd().split('\n')
  expect(JSON.parse(lines[0]!)).toEqual({ schemaVersion: 1, kind: 'note', text: 'buy milk' })
  expect((await runApp(app, ['note', 'sync'])).out).toContain('1 done\n')
})

test('App.call runs a command from a JSON object, as the adapters do', async () => {
  const surface: Surface = 'http'
  const options: CallOptions = { surface }
  const result: CallResult = await app.call(
    ['note', 'add'],
    { text: 'call mum' },
    { cwd: '/w', env: {} },
    options,
  )
  expect(result).toMatchObject({ status: 'ok', document: { kind: 'note-add', count: 2 } })
  expect(await app.call(['note', 'wipe'], {}, { cwd: '/w', env: {} }, options)).toMatchObject({
    status: 'refused',
    reason: 'cli-only',
  })
})

test('MCP: each data command is a tool, and the cli-only ones are not', async () => {
  const options: McpOptions = { readOnly: false }
  const tools: McpTool[] = mcpTools(app, options)
  expect(tools.map((t) => t.name)).toContain(toolName(app, ['note', 'add']))
  expect(tools.map((t) => t.name)).not.toContain('note_wipe')

  // In process. `notes mcp` serves the same server over stdio.
  const server = createMcpServer(app, { cwd: '/w', env: {} }, options)
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await server.connect(serverSide)
  const client = new Client({ name: 'example', version: '0' })
  await client.connect(clientSide)
  const result = await client.callTool({ name: 'note_list', arguments: {} })
  expect(result.structuredContent).toMatchObject({ kind: 'notes' })
  const grant = await client.callTool({ name: 'trust', arguments: {} })
  expect(grant.isError).toBe(true)
  expect(trusted.size).toBe(0)
  await client.close()

  // serveMcp takes any transport; a pre-aborted signal makes it return at once.
  const stopped = new AbortController()
  stopped.abort()
  const [, other] = InMemoryTransport.createLinkedPair()
  await serveMcp(app, { ...captureContext(), signal: stopped.signal }, { transport: other })
})

test('HTTP: a token, loopback only, and the same documents as --json', async () => {
  const options: HttpApiOptions = { context: { cwd: '/w', env: {} }, prefix: '/api' }
  const api: HttpApi = createHttpApi(app, options)
  const listen: ServeHttpOptions = { port: 0 }
  const server: HttpServer = await serveHttp(
    // The app's own page would be answered here; the API takes the paths under /api.
    (req) => (api.handles(req) ? api.fetch(req) : new Response('page', { status: 200 })),
    listen,
  )
  try {
    const headers = { authorization: `Bearer ${api.token}`, 'content-type': 'application/json' }
    const res = await fetch(`${server.url}/api/commands/note/list`, {
      method: 'POST',
      headers,
      body: '{}',
    })
    expect(await res.json()).toMatchObject({ schemaVersion: 1, kind: 'notes' })
    const denied = await fetch(`${server.url}/api/schema`)
    expect(denied.status).toBe(401)
    const grant = await fetch(`${server.url}/api/commands/trust`, {
      method: 'POST',
      headers,
      body: '{}',
    })
    expect(grant.status).toBe(403)
  } finally {
    await server.stop()
  }
})

test("HTTP: the pieces an app's own routes share with the API", async () => {
  const token = newToken()
  expect(token).toMatch(/^[0-9a-f]{32}$/)
  expect(tokenEquals(token, token)).toBe(true)
  expect(tokenEquals(token, newToken())).toBe(false)
  const small = new Request('http://127.0.0.1/session', { method: 'POST', body: '{"a":1}' })
  expect(await readBody(small, 64)).toBe('{"a":1}')
  const large = new Request('http://127.0.0.1/session', { method: 'POST', body: 'x'.repeat(65) })
  expect(await readBody(large, 64)).toBeNull()
})
