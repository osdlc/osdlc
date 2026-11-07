/**
 * The current terminal: run it right here and wait for it.
 *
 * An interactive process is the one thing that must NOT be captured — it
 * owns the TTY until the person leaves it — so this runs through the command
 * seam's STREAMING door (`streamRunner`; stdio fully
 * inherited, resolves to `{exitCode}`) rather than a capture door. `req.argv`
 * names a different binary on every call, so the injected dependency is a
 * runner FACTORY — `(binary) => StreamRunner`, the same shape `streamRunner`
 * itself has — not a runner bound to one binary the way `hosts/tmux.ts` and
 * `hosts/cmux.ts` inject theirs (their binary, `tmux`/`cmux`, is fixed).
 */

import { streamRunner, type StreamRunner } from '@osdlc/command-seam'

import type { CommandRequest, Host } from '../contract.ts'
import { onPath } from '../contract.ts'
import { sessionViaTerminal } from '../harness.ts'

/**
 * The current-terminal host: runs the command right here with inherited stdio and waits for it.
 * Needs no binary or app, runs on every platform, and is always available.
 */
export function makeTerminalHost(
  opts: { streamRunner?: ((binary: string) => StreamRunner) | undefined } = {},
): Host {
  const makeRunner = opts.streamRunner ?? streamRunner
  return {
    name: 'terminal',
    platforms: 'all',
    available() {
      return true
    },
    terminal(req: CommandRequest) {
      const [bin, ...rest] = req.argv
      if (bin === undefined) throw new Error('empty argv')
      if (!onPath(bin)) throw new Error(`'${bin}' is not on PATH`)
      return makeRunner(bin).run(rest, { cwd: req.cwd }).exitCode
    },
    // Builds the harness's argv, runs it via this host's own (blocking)
    // `terminal()`, and best-effort resolves a session id — the one body
    // every wrapper host now shares; see `wrapperSession`'s doc in
    // `../harness.ts` for what it returns and why.
    session: sessionViaTerminal,
  }
}

/** The production terminal host — `streamRunner` as its runner factory. */
export const terminalHost: Host = makeTerminalHost()
