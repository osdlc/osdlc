/**
 * `way` and `way browse`: the terminal UI. Enter runs the selected task.
 * `serve`: the same catalog as a live page.
 */

import { UsageError } from '@osdlc/cli-tool/command'

import type { Session } from '../core/session.ts'
import { keyLines } from '../keys.ts'
import { serve } from '../serve.ts'
import { runTui } from '../tui/index.ts'
import { kit, openSession } from './shared.ts'

/** The terminal UI's list keys, for help text. */
export const TUI_KEYS_HELP = `Keys in the list (? shows every key):\n${keyLines('tui', 'list').join('\n')}`

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
        return serveSession(session, { open: true })
      }
      return runTui(session)
    },
  })
}

/** What the bare `way` opens, from the user config. */
export function openSurface(session: Session): 'tui' | 'web' {
  return session.settings().settings.open.value === 'web' ? 'web' : 'tui'
}

/** Serve `session` as a live page. */
function serveSession(session: Session, opts: { open: boolean; port?: number }): Promise<number> {
  return serve({
    project: session.project,
    projectToolsPending: session.projectToolsPending,
    root: session.root,
    collectOptions: session.options,
    pinnedByFlag: session.pinnedByFlag,
    open: opts.open,
    runnerOrder: session.runnerOrder(),
    env: session.env,
    home: session.home,
    ...(opts.port !== undefined ? { port: opts.port } : {}),
  })
}

/** Make the `serve` command: the same catalog as a live page. */
export function serveCommand(home: string) {
  return kit.command({
    summary: 'the same catalog as a live page in the browser',
    description:
      'Serves 127.0.0.1 only, on an OS-assigned port unless --port gives one, and opens a ' +
      'browser signed in to it. --no-open prints the URL instead. It starts from the stored ' +
      'probe, then refreshes. Ctrl-C stops it.',
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
      const session = await openSession(globals, ctx, home, positionals[0])
      return serveSession(session, { open: flags.open, ...(port !== undefined ? { port } : {}) })
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
