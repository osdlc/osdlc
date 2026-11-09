/**
 * The tmux host against a real tmux server ([[T-EKIV]]): a process started in a
 * session receives a multi-line comment through the host's `send`, the same
 * call `sendLive` makes on the Router's live route. Skipped where tmux is not
 * installed.
 *
 * The server is the test's own. `TMUX_TMPDIR` points at a fresh directory for
 * the whole file, so the socket is not the person's, and `afterAll` kills the
 * server on that socket only — never by process name.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { spawnRunner } from '@osdlc/command-seam'

import { makeTmuxHost } from '../src/hosts/tmux.ts'

import { sleep } from './fixtures/child.ts'

const host = makeTmuxHost({})
const tmuxAvailable = host.available()

// A short root: a unix socket path is capped near 100 bytes on macOS.
let root = ''
const saved = { tmuxTmpdir: process.env.TMUX_TMPDIR, tmux: process.env.TMUX }

beforeAll(() => {
  root = mkdtempSync('/tmp/sdlc-tmux-')
  process.env.TMUX_TMPDIR = root
  // Inside a tmux client $TMUX would name the person's server and win over TMUX_TMPDIR.
  delete process.env.TMUX
})

afterAll(() => {
  if (tmuxAvailable) spawnRunner('tmux').run(['kill-server'], { cwd: root, timeoutMs: 10_000 })
  rmSync(root, { recursive: true, force: true })
  if (saved.tmuxTmpdir === undefined) delete process.env.TMUX_TMPDIR
  else process.env.TMUX_TMPDIR = saved.tmuxTmpdir
  if (saved.tmux !== undefined) process.env.TMUX = saved.tmux
})

async function waitFor(
  path: string,
  timeoutMs: number,
  done: (text: string) => boolean = () => true,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const text = readFileSync(path, 'utf8')
      if (text !== '' && done(text)) return text
    } catch {
      // not written yet
    }
    await sleep(100)
  }
  return null
}

describe.skipIf(!tmuxAvailable)('tmux host against a real server', () => {
  test('a two-line comment sent to a session reaches the process, first line first', async () => {
    const cwd = join(root, 'work')
    mkdirSync(cwd, { recursive: true })
    host.terminal!({
      cwd,
      // Ask for bracketed paste (as a TUI does), then record each byte with control
      // characters made visible. Raw mode, so the pasted newline arrives as a newline and Enter is ^M.
      // Only a real paste is wrapped in ^[[200~ ... ^[[201~; per-line send-keys is not.
      // A paste sent before the terminal is set up is neither wrapped (tmux wraps only for a pane
      // that asked) nor read in raw mode, so the test waits for the `pane-ready` marker on screen.
      argv: [
        'bash',
        '-c',
        `printf '\\033[?2004h'; stty raw -echo; printf pane-ready; while IFS= read -r -n1 -d '' c; do printf %s "$c" | cat -v >> out.txt; done`,
      ],
      title: 'tmux-live',
    })
    expect(host.find!({ cwd })).toMatchObject([{ cwd, alive: true }])
    // tmux parses pane output in order, so once the marker is on screen it has applied ESC[?2004h.
    // A file written by the pane would only show the bytes reached the pty, not that tmux read them.
    const deadline = Date.now() + 10_000
    while (!host.capture!({ cwd })?.includes('pane-ready') && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50))
    }
    expect(host.capture!({ cwd }), 'pane never signalled ready').toContain('pane-ready')

    const receipt = host.send!({ cwd, text: 'first line\nsecond line' })

    // tmux has no delivery acknowledgement: accepted, never acked.
    expect(receipt).toEqual({ accepted: true, ack: false })
    const received = await waitFor(join(cwd, 'out.txt'), 10_000, (t) => t.endsWith('^[[201~^M'))
    // Both lines arrive intact inside one paste, then Enter submits it.
    expect(received).toBe('^[[200~first line\nsecond line^[[201~^M')
  }, 30_000)

  test('a send to a cwd with no session is not accepted, so the Router falls through', () => {
    const receipt = host.send!({ cwd: join(root, 'nobody-here'), text: 'hello' })
    expect(receipt.accepted).toBe(false)
  })
})
