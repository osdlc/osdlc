import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, test } from 'vitest'

import { captureContext } from '../../src/io.ts'
import { createMcpServer, mcpTools, serveMcp, toolName } from '../../src/mcp/index.ts'
import { fixture } from './fixture.ts'

const CTX = { cwd: '/repo', env: {} }

async function connect(f = fixture(), options = {}) {
  const server = createMcpServer(f.app, CTX, options)
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await server.connect(serverSide)
  const client = new Client({ name: 'test', version: '0' })
  await client.connect(clientSide)
  return { f, client, server }
}

describe('tools/list', () => {
  test('lists each data command, and leaves out interactive and cli-only ones', async () => {
    const { client } = await connect()
    const { tools } = await client.listTools()
    const names = tools.map((t) => t.name).sort()
    expect(names).toEqual(
      [
        'config_explain',
        'config_get',
        'config_list',
        'config_path',
        'config_set',
        'config_unset',
        'config',
        'fails',
        'help',
        'items_add',
        'items_clear',
        'items_list',
        'items',
        'schema',
        'trust',
        'watch',
      ].sort(),
    )
    expect(names).not.toContain('secret')
    expect(names).not.toContain('tui')
    expect(names).not.toContain('mcp')
    expect(names).not.toContain('serve-api')
  })

  test('each tool has its input and output schema, description and hints', async () => {
    const { client } = await connect()
    const { tools } = await client.listTools()
    const add = tools.find((t) => t.name === 'items_add')!
    expect(add.title).toBe('tooly items add')
    expect(add.description).toBe('add an item')
    expect(add.inputSchema).toMatchObject({
      type: 'object',
      properties: { name: { type: 'string' }, times: { type: 'integer' } },
      required: ['name'],
    })
    expect(Object.keys(add.inputSchema.properties!)).not.toContain('dir')
    expect(add.outputSchema).toMatchObject({
      type: 'object',
      properties: { kind: { const: 'items' }, schemaVersion: { const: 1 } },
    })
    expect(add.annotations).toEqual({
      title: 'tooly items add',
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    })
    const list = tools.find((t) => t.name === 'items_list')!
    expect(list.description).toBe('every item\n\nLists the items.')
    expect(list.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false })
    expect(tools.find((t) => t.name === 'items_clear')!.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    })
  })

  test('readOnly serves only the commands that change nothing', () => {
    const { app } = fixture()
    const names = mcpTools(app, { readOnly: true }).map((t) => t.name)
    expect(names).toContain('items_list')
    expect(names).not.toContain('items_add')
    expect(names).not.toContain('trust')
  })

  test('filter narrows the tools further', () => {
    const { app } = fixture()
    const names = mcpTools(app, { filter: (e) => e.path[0] === 'items' }).map((t) => t.name)
    expect(names).toEqual(['items', 'items_list', 'items_add', 'items_clear'])
  })

  test('the root command is named after the app', () => {
    const { app } = fixture()
    expect(toolName(app, [])).toBe('tooly')
    expect(toolName(app, ['config', 'get'])).toBe('config_get')
  })
})

describe('tools/call', () => {
  test("answers with structuredContent that matches the tool's output schema", async () => {
    const { f, client } = await connect(fixture(), { globals: { dir: '/fixed' } })
    const result = await client.callTool({ name: 'items_add', arguments: { name: 'c' } })
    expect(result.isError).toBeUndefined()
    // The client has already checked structuredContent against the outputSchema.
    const doc = result.structuredContent as Record<string, unknown>
    expect(f.app.documentContract(['items', 'add']).safeParse(doc).success).toBe(true)
    expect(doc).toMatchObject({ kind: 'items', dir: '/fixed' })
    expect(result.content).toEqual([
      { type: 'text', text: JSON.stringify(doc) },
      { type: 'text', text: 'tooly: added c\n' },
    ])
    expect(result._meta).toEqual({ exitCode: 0 })
    expect(f.items).toEqual(['a', 'b', 'c'])
  })

  test('a caller cannot set a global flag', async () => {
    const { client } = await connect()
    const result = await client.callTool({ name: 'items_list', arguments: { dir: '/elsewhere' } })
    expect(result.isError).toBe(true)
    expect(result.content).toEqual([{ type: 'text', text: "exit 2: unknown argument 'dir'" }])
  })

  test('a failed command is an error result with its exit code and hint', async () => {
    const { client } = await connect()
    const result = await client.callTool({ name: 'fails', arguments: {} })
    expect(result).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: 'exit 1: it broke\ntry again' }],
    })
  })

  test('a document with a non-zero exit is an error result that keeps the document', async () => {
    const { client } = await connect()
    const result = await client.callTool({ name: 'trust', arguments: { untrust: true } })
    expect(result.isError).toBe(true)
    expect(result.structuredContent).toMatchObject({ action: 'untrust', changed: false })
    expect(result._meta).toEqual({ exitCode: 1 })
  })

  test('granting trust is refused; showing it is not', async () => {
    const { f, client } = await connect()
    const grant = await client.callTool({ name: 'trust', arguments: {} })
    expect(grant).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: "'tooly trust' runs from the command line only" }],
    })
    expect(f.trusted.size).toBe(0)
    const show = await client.callTool({ name: 'trust', arguments: { show: true } })
    expect(show.structuredContent).toMatchObject({ action: 'show', roots: [{ trusted: false }] })
  })

  test('a config write of a trust key is refused', async () => {
    const { f, client } = await connect()
    const result = await client.callTool({
      name: 'config_set',
      arguments: { key: 'trust.paths', value: '["/"]', user: true },
    })
    expect(result.isError).toBe(true)
    expect(f.config['user']!['trust.paths']).toEqual(['/home/**'])
  })

  test('a cli-only command cannot be called by name', async () => {
    const { client } = await connect()
    const result = await client.callTool({ name: 'secret', arguments: {} })
    expect(result).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: "no tool 'secret'" }],
    })
  })

  test('events arrive as progress notifications', async () => {
    const { client } = await connect()
    const messages: string[] = []
    const result = await client.callTool({ name: 'watch', arguments: { steps: '2' } }, undefined, {
      onprogress: (p) => messages.push(p.message!),
    })
    expect(result.structuredContent).toMatchObject({ steps: 2 })
    expect(messages.map((m) => JSON.parse(m))).toEqual([
      { schemaVersion: 1, kind: 'step', step: 1 },
      { schemaVersion: 1, kind: 'step', step: 2 },
    ])
  })

  test('cancelling a call aborts the command', async () => {
    const { f, client } = await connect()
    const aborter = new AbortController()
    const pending = client.callTool(
      { name: 'watch', arguments: { steps: '0', hang: true } },
      undefined,
      { signal: aborter.signal },
    )
    setTimeout(() => aborter.abort(), 20)
    await expect(pending).rejects.toThrow()
    await f.aborted
  })
})

describe('serveMcp', () => {
  test('serves until the transport closes, with a note on stderr', async () => {
    const { app } = fixture()
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    const ctx = captureContext({ cwd: '/repo', env: {} })
    const serving = serveMcp(app, ctx, { transport: serverSide })
    const client = new Client({ name: 'test', version: '0' })
    await client.connect(clientSide)
    expect((await client.listTools()).tools.length).toBeGreaterThan(0)
    await client.close()
    await serving
    expect(ctx.io.err).toBe('tooly: serving 16 tools over MCP\n')
    expect(ctx.io.out).toBe('')
  })

  test('the signal stops it', async () => {
    const { app } = fixture()
    const [, serverSide] = InMemoryTransport.createLinkedPair()
    const aborter = new AbortController()
    const ctx = { ...captureContext({ cwd: '/repo', env: {} }), signal: aborter.signal }
    const serving = serveMcp(app, ctx, { transport: serverSide })
    aborter.abort()
    await serving
  })

  test('the mcp command serves the app it is mounted in, with --read-only', async () => {
    const { app } = fixture()
    const aborter = new AbortController()
    aborter.abort()
    const ctx = { ...captureContext({ cwd: '/repo', env: {} }), signal: aborter.signal }
    expect(await app.run(['-C', '/d', 'mcp', '--read-only'], ctx)).toBe(0)
    expect(ctx.io.err).toBe(
      `tooly: serving ${mcpTools(app, { readOnly: true }).length} tools over MCP\n`,
    )
    expect(ctx.io.out).toBe('')
  })
})
