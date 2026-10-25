/**
 * `way` and `way browse`: the terminal UI. Enter runs the selected task.
 */

import { UsageError } from '@osdlc/cli-tool/command'

import { serve } from '../serve/index.ts'
import { runTui } from '../tui.ts'
import { kit, openSession } from './shared.ts'

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

/** Make the terminal UI command, the root's default. */
export function browseCommand(home: string) {
  return kit.command({
    summary: 'the terminal UI; Enter runs the selected task',
    description:
      'Type to filter; the key line at the foot of the screen lists the keys. It starts from the ' +
      'stored probe, then refreshes. Needs a terminal; "list" and "query" answer a script.',
    positionals: [{ name: 'dir', help: 'the directory to inspect (beats -C)' }],
    interactive: true,
    async run({ globals, positionals }, ctx) {
      const session = await openSession(globals, ctx, home, positionals[0])
      return runTui({
        project: session.project,
        projectToolsPending: session.projectToolsPending,
        root: session.root,
        options: session.options,
        runnerOrder: session.runnerOrder(),
        gate: session.gate,
        env: session.env,
        home: session.home,
      })
    },
  })
}

/** Make the `serve` command: the same catalog as a live page. */
export function serveCommand(home: string) {
  return kit.command({
    summary: 'the same catalog as a live page in the browser',
    description:
      'Serves 127.0.0.1 only, on an OS-assigned port unless --port gives one, and opens a ' +
      'browser signed in to it. --no-open prints the URL instead. Every action on the page is ' +
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
        const exit = await serve({
          session,
          app: ctx.app,
          globals: globals as Record<string, unknown>,
          cwd: ctx.cwd,
          open: flags.open,
          signal: stopper.signal,
          stdout: (text) => ctx.io.stdout(text),
          stderr: (text) => ctx.io.stderr(text),
          ...(port !== undefined ? { port } : {}),
        })
        if (exit !== null) return exit
        const reason: unknown = stopper.signal.reason
        return typeof reason === 'number' ? reason : 0
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
export function parsePort(raw: string): number {
  const trimmed = raw.trim()
  const port = /^\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : Number.NaN
  if (!(port >= 1 && port <= 65535)) {
    throw new UsageError('--port needs a port number from 1 to 65535')
  }
  return port
}
