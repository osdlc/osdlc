/**
 * `way` and `way browse`: the terminal UI. Enter runs the selected task.
 * `serve`: the same catalog as a live page.
 */

import { UsageError, type CommandContext } from '@osdlc/cli-tool/command'

import type { Session } from '../core/session.ts'
import { keyLines } from '../keys.ts'
import { serve } from '../serve/index.ts'
import { runTui } from '../tui/index.ts'
import { kit, openSession, type Globals } from './shared.ts'

/** The terminal UI's list keys, for help text. */
export const TUI_KEYS_HELP = `Keys in the list (? shows every key):\n${keyLines('tui', 'list').join('\n')}`

/** The exit code for each signal that stops `serve`: 128 + its number. */
const STOP_SIGNALS = { SIGINT: 130, SIGTERM: 143 } as const

/**
 * An abort signal that fires on SIGINT or SIGTERM, with the exit code as its
 * reason, linked to `parent`. `dispose` removes the listeners.
 */
export function abortOnSignals(parent: AbortSignal): { signal: AbortSignal; dispose(): void } {
  const aborter = new AbortController()
  const handlers = Object.entries(STOP_SIGNALS).map(([name, code]) => {
    const handler = (): void => aborter.abort(code)
    process.on(name, handler)
    return [name, handler] as const
  })
  const onParent = (): void => aborter.abort(parent.reason)
  if (parent.aborted) onParent()
  else parent.addEventListener('abort', onParent, { once: true })
  return {
    signal: aborter.signal,
    dispose() {
      for (const [name, handler] of handlers) process.off(name, handler)
      parent.removeEventListener('abort', onParent)
    },
  }
}

/**
 * Make the terminal UI command. With `followOpen` it is the bare `way`: it
 * opens the web view instead when the user config says `open: "web"`.
 */
export function browseCommand(home: string, opts: { followOpen?: boolean } = {}) {
  return kit.command({
    summary: 'the terminal UI; Enter runs the selected task',
    description:
      'Type to filter. It starts from the stored probe, then refreshes. Needs a terminal; ' +
      '"list" and "query" answer a script.' +
      (opts.followOpen === true
        ? ' The bare command opens the web view instead when the user config sets open to "web".'
        : '') +
      `\n\n${TUI_KEYS_HELP}`,
    positionals: [{ name: 'dir', help: 'the directory to inspect (beats -C)' }],
    interactive: true,
    async run({ globals, positionals }, ctx) {
      const session = await openSession(globals, ctx, home, positionals[0])
      if (opts.followOpen === true && openSurface(session) === 'web') {
        const stopper = abortOnSignals(ctx.signal)
        try {
          return await serveSession(session, globals, ctx, stopper.signal, { open: true })
        } finally {
          stopper.dispose()
        }
      }
      return runTui(session)
    },
  })
}

/** What the bare `way` opens, from the user config. */
export function openSurface(session: Session): 'tui' | 'web' {
  return session.settings().settings.open.value === 'web' ? 'web' : 'tui'
}

/**
 * Serve `session` as a live page until `signal` aborts or a run takes the
 * terminal. Returns the run's exit code, or the signal's.
 */
async function serveSession(
  session: Session,
  globals: Globals,
  ctx: CommandContext,
  signal: AbortSignal,
  opts: { open: boolean; port?: number },
): Promise<number> {
  const exit = await serve({
    session,
    app: ctx.app,
    globals: globals as Record<string, unknown>,
    cwd: ctx.cwd,
    open: opts.open,
    signal,
    stdout: (text) => ctx.io.stdout(text),
    stderr: (text) => ctx.io.stderr(text),
    // Enter in the terminal prints a new sign-in link.
    ...(ctx.terminal?.stdin === true ? { input: process.stdin } : {}),
    ...(opts.port !== undefined ? { port: opts.port } : {}),
  })
  if (exit !== null) return exit
  const reason: unknown = signal.reason
  return typeof reason === 'number' ? reason : 0
}

/** Make the `serve` command: the same catalog as a live page. */
export function serveCommand(home: string) {
  return kit.command({
    summary: 'the same catalog as a live page in the browser',
    description:
      'Serves 127.0.0.1 only, on an OS-assigned port unless --port gives one, and opens a ' +
      'browser signed in to it. --no-open prints the URL instead. A reload stays signed in; for a ' +
      'new tab or another browser, press Enter in the terminal for a new sign-in link. Every action on the page is ' +
      'a command of this tool, called over HTTP with a token made for this run. It starts from ' +
      'the stored probe, then refreshes. Ctrl-C stops it, and any probe it is running.',
    positionals: [{ name: 'dir', help: 'the directory to inspect (beats -C)' }],
    flags: {
      port: { kind: 'string', valueName: 'N', help: 'a fixed port (default: an OS-assigned one)' },
      open: {
        kind: 'boolean',
        negatable: true,
        help: 'print the URL rather than opening a browser',
      },
    },
    interactive: true,
    async run({ flags, globals, positionals }, ctx) {
      const port = flags.port === undefined ? undefined : parsePort(flags.port)
      // Ctrl-C aborts the session's probes and stops the server.
      const stopper = abortOnSignals(ctx.signal)
      try {
        const session = await openSession(
          globals,
          { ...ctx, signal: stopper.signal },
          home,
          positionals[0],
        )
        return await serveSession(session, globals, ctx, stopper.signal, {
          open: flags.open,
          ...(port !== undefined ? { port } : {}),
        })
      } finally {
        stopper.dispose()
      }
    },
  })
}

/**
 * A port number, checked as digits first. `Number('')` is 0, `Number('0x10')`
 * is 16 and `Number('1e3')` is 1000, so a bare `Number()` would accept a port
 * nobody typed. Port 0 means "let the OS pick", which `--port` exists to
 * prevent.
 */
function parsePort(raw: string): number {
  const trimmed = raw.trim()
  const port = /^\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : Number.NaN
  if (!(port >= 1 && port <= 65535)) {
    throw new UsageError('--port needs a port number from 1 to 65535')
  }
  return port
}
