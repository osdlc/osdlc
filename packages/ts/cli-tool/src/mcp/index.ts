/**
 * `@osdlc/cli-tool/mcp`: serve an app's command tree as an MCP server.
 *
 * Each data command is a tool. Its name is the command's path joined with
 * `_` (the app's name for the root command), and two commands that join to
 * the same name are an error when the tools are listed. Its input schema comes from the command's flags and positionals, and
 * its output schema and `structuredContent` are the command's `--json`
 * document. Interactive commands and `cli-only` commands are not tools. A
 * command whose `exposureOf` marks an input `cli-only` is a tool, and a call
 * with that input is refused.
 *
 * The app's global flags are fixed when the server starts, from the command
 * line that started it (`tool -C repo mcp`). A client cannot set them.
 *
 * This entry needs `@modelcontextprotocol/sdk`, an optional peer dependency.
 * No other entry loads it.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type CallToolResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js'

import {
  commandKit,
  type App,
  type CallResult,
  type InteractiveCommand,
  type JsonSchema,
  type SchemaEntry,
} from '../command/index.ts'
import type { FlagSpec } from '../define-cli.ts'
import type { CliContext } from '../io.ts'

/**
 * Which commands become tools.
 * @experimental
 */
export interface McpOptions {
  /** Only commands declared `readOnly`. Default false: every data command that is not `cli-only`. */
  readOnly?: boolean
  /** A further filter over the commands that would be tools. */
  filter?(entry: SchemaEntry): boolean
  /** The app's global flag values for every call. A client cannot set them. */
  globals?: Record<string, unknown>
}

/**
 * One tool, as `tools/list` lists it, with the command path it calls.
 * @experimental
 */
export interface McpTool extends Tool {
  /** The command path the tool runs. */
  path: string[]
}

/**
 * The tool name for a command path: the words joined with `_`, or the app's
 * name for the root command.
 * @experimental
 */
export function toolName(app: App, path: readonly string[]): string {
  return path.length === 0 ? app.name : path.join('_')
}

/**
 * The tools `app` serves under `options`.
 *
 * Throws when two commands get the same tool name, such as a group `a` with a
 * command `b` and a root command `a_b`, or a command named after the app.
 * Rename one of them.
 * @experimental
 */
export function mcpTools(app: App, options: McpOptions = {}): McpTool[] {
  const tools = listTools(app, options)
  const seen = new Map<string, readonly string[]>()
  for (const tool of tools) {
    const other = seen.get(tool.name)
    if (other !== undefined) {
      const show = (path: readonly string[]) => [app.name, ...path].join(' ')
      throw new Error(
        `mcp: '${show(other)}' and '${show(tool.path)}' are both the tool '${tool.name}'; rename one`,
      )
    }
    seen.set(tool.name, tool.path)
  }
  return tools
}

function listTools(app: App, options: McpOptions): McpTool[] {
  return app
    .schema()
    .filter(
      (e) =>
        e.output !== undefined &&
        !e.interactive &&
        e.exposure !== 'cli-only' &&
        (options.readOnly !== true || e.readOnly === true) &&
        (options.filter?.(e) ?? true),
    )
    .map((e) => {
      const readOnly = e.readOnly === true
      return {
        name: toolName(app, e.path),
        path: e.path,
        title: e.command,
        description: e.description !== undefined ? `${e.summary}\n\n${e.description}` : e.summary,
        inputSchema: toolSchema(app.argsSchema(e.path)) as Tool['inputSchema'],
        outputSchema: toolSchema(e.output!) as Tool['outputSchema'],
        annotations: {
          title: e.command,
          readOnlyHint: readOnly,
          // The protocol's default for a tool that writes is destructive, so say it outright.
          destructiveHint: !readOnly && e.destructive === true,
          openWorldHint: false,
        },
      }
    })
}

/** Drop the `$schema` key: MCP schemas are JSON Schema 2020-12 by definition. */
function toolSchema(schema: JsonSchema): JsonSchema {
  const { $schema: _drop, ...rest } = schema
  return rest
}

function text(value: string): { type: 'text'; text: string } {
  return { type: 'text', text: value }
}

/** A call's answer as a tool result. A document is `structuredContent`; anything else is an error. */
function toolResult(result: CallResult): CallToolResult {
  if (result.status === 'refused') return { content: [text(result.message)], isError: true }
  const notes = result.stderr !== '' ? [text(result.stderr)] : []
  if (result.status === 'error') {
    const hint = result.hint !== undefined ? `\n${result.hint}` : ''
    return {
      content: [text(`exit ${result.exit}: ${result.message}${hint}`), ...notes],
      isError: true,
    }
  }
  return {
    content: [text(JSON.stringify(result.document)), ...notes],
    structuredContent: result.document,
    ...(result.exit !== 0 ? { isError: true } : {}),
    _meta: { exitCode: result.exit },
  }
}

/**
 * An MCP server over `app`'s commands, not yet connected. Commands run with
 * `ctx`'s directory and environment. Connect it to a transport with
 * `server.connect(transport)`, or use {@link serveMcp} for stdio.
 *
 * A call's events go to the client as progress notifications when it asked
 * for progress, one JSON event line per notification. Cancelling a call
 * aborts the command's `ctx.signal`.
 * @experimental
 */
export function createMcpServer(
  app: App,
  ctx: Omit<CliContext, 'io'>,
  options: McpOptions = {},
): Server {
  return serverFor(app, ctx, options, mcpTools(app, options))
}

function serverFor(
  app: App,
  ctx: Omit<CliContext, 'io'>,
  options: McpOptions,
  tools: readonly McpTool[],
): Server {
  const byName = new Map(tools.map((t) => [t.name, t]))
  const server = new Server(
    { name: app.name, version: app.version },
    { capabilities: { tools: {} }, instructions: app.summary },
  )
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: tools.map(({ path: _path, ...tool }) => tool),
  }))
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const tool = byName.get(request.params.name)
    // The protocol names an unknown tool as a request error, not a tool result.
    if (tool === undefined) {
      throw new McpError(ErrorCode.InvalidParams, `no tool '${request.params.name}'`)
    }
    const progressToken = request.params._meta?.progressToken
    let progress = 0
    const result = await app.call(tool.path, request.params.arguments ?? {}, ctx, {
      surface: 'mcp',
      signal: extra.signal,
      ...(options.globals !== undefined ? { globals: options.globals } : {}),
      onEvent(line) {
        if (progressToken === undefined) return
        progress += 1
        void extra
          .sendNotification({
            method: 'notifications/progress',
            params: { progressToken, progress, message: JSON.stringify(line) },
          })
          .catch(() => {})
      },
    })
    return toolResult(result)
  })
  return server
}

/**
 * Serve `app` over `transport` (default: stdio) until the client goes away.
 * Diagnostics go to `ctx.io.stderr`; under stdio, stdout carries only the
 * protocol.
 * @experimental
 */
export async function serveMcp(
  app: App,
  ctx: CliContext,
  options: McpOptions & { transport?: Transport } = {},
): Promise<void> {
  const { io: _io, ...rest } = ctx
  const tools = mcpTools(app, options)
  const server = serverFor(app, rest, options, tools)
  const closed = new Promise<void>((resolve) => {
    server.onclose = () => resolve()
  })
  const transport = options.transport ?? new StdioServerTransport()
  const stop = (): void => void server.close()
  // The stdio transport does not close when stdin ends, so a client that exits would leave it running.
  if (options.transport === undefined) process.stdin.once('end', stop)
  ctx.signal?.addEventListener('abort', stop, { once: true })
  await server.connect(transport)
  if (ctx.signal?.aborted === true) stop()
  ctx.io.stderr(`${app.name}: serving ${tools.length} tools over MCP\n`)
  await closed
  process.stdin.off('end', stop)
  ctx.signal?.removeEventListener('abort', stop)
}

/**
 * The `mcp` command: serve the app this command is mounted in over stdio.
 * Mount it as `mcp: mcpCommand()`. `--read-only` serves only the commands
 * that change nothing.
 * @experimental
 */
export function mcpCommand<G extends FlagSpec = Record<never, never>>(
  options: { globals?: G; summary?: string; filter?: McpOptions['filter'] } = {},
): InteractiveCommand {
  const kit = commandKit({ globals: options.globals ?? ({} as G) })
  return kit.command({
    summary: options.summary ?? 'serve these commands to an agent over MCP (stdio)',
    description:
      'Each command that answers with data is an MCP tool, with its input and output schema. ' +
      'Commands that run from the command line only, such as granting trust, are not tools. The ' +
      'global flags given before this command apply to every call.',
    interactive: true,
    flags: {
      readOnly: { kind: 'boolean', help: 'serve only the commands that change nothing' },
    },
    async run({ flags, globals }, ctx) {
      await serveMcp(ctx.app, ctx, {
        readOnly: flags.readOnly,
        globals: globals as Record<string, unknown>,
        ...(options.filter !== undefined ? { filter: options.filter } : {}),
      })
    },
  }) as InteractiveCommand
}
