/**
 * A terminal UI over a real session in a throwaway repository, with a fake
 * host: writes, exits, hand-offs and clipboard calls are recorded instead of
 * reaching a terminal. HOME and the environment are throwaway too, so no
 * test reads or writes the developer's own config, trust or cache.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { configLocations } from '../src/config.ts'

import { createSession } from '../src/core/session.ts'
import type { RunPlan } from '../src/core/session.ts'
import type { HandOffResult } from '../src/core/run.ts'
import { createTui, type Tui, type TuiHost } from '../src/tui/app.ts'
import { makeStyles, type StyleInput } from '../src/tui/style.ts'

/** What the fake host saw. */
export interface FakeHost extends TuiHost {
  written: string[]
  exits: number[]
  handedOff: RunPlan[]
  copied: string[]
  released: number
  /** What the next hand-off returns. */
  handOffResult: HandOffResult
  /** What the clipboard answers. */
  clipboardOk: boolean
}

export function fakeHost(size = { columns: 100, rows: 24 }): FakeHost {
  const host: FakeHost = {
    written: [],
    exits: [],
    handedOff: [],
    copied: [],
    released: 0,
    handOffResult: { exit: 0 },
    clipboardOk: true,
    write: (text) => void host.written.push(text),
    columns: () => size.columns,
    rows: () => size.rows,
    platform: 'linux',
    clipboard: async (text) => {
      host.copied.push(text)
      return host.clipboardOk
    },
    release: () => void host.released++,
    handOff: (plan) => {
      host.handedOff.push(plan)
      return host.handOffResult
    },
    exit: (code) => void host.exits.push(code),
  }
  return host
}

/** Plain text, as a test runner's non-TTY stdout gets it. */
export const PLAIN: StyleInput = { level: 'none', theme: 'dark', attributes: false }

/** A temp directory removed by {@link cleanupAll}. */
const dirs: string[] = []
export async function temp(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

export async function cleanupAll(): Promise<void> {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
}

/** A repository with `files` (default: one npm script), a session over it, and a UI. */
export async function testTui(
  opts: {
    files?: Record<string, string>
    /** The user config file's contents. */
    userConfig?: object
    flags?: Parameters<typeof createSession>[0]['flags']
    style?: StyleInput
    size?: { columns: number; rows: number }
    /** The session's environment. Default: this process's PATH only. */
    env?: Record<string, string | undefined>
  } = {},
): Promise<{ tui: Tui; host: FakeHost; root: string; home: string }> {
  const root = await temp('wayfinder-tui-')
  const home = await temp('wayfinder-tui-home-')
  const files = opts.files ?? {
    'package.json': JSON.stringify({ name: 'p', scripts: { build: 'echo b' } }),
  }
  for (const [name, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, name)), { recursive: true })
    await writeFile(join(root, name), content, 'utf-8')
  }
  const env = opts.env ?? { PATH: process.env['PATH'] }
  if (opts.userConfig !== undefined) {
    const file = configLocations(root, env, home).user
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, JSON.stringify(opts.userConfig), 'utf-8')
  }
  const session = await createSession({
    dir: root,
    cwd: root,
    env,
    home,
    ...(opts.flags !== undefined ? { flags: opts.flags } : {}),
  })
  const host = fakeHost(opts.size)
  const tui = createTui({ session, host, styles: makeStyles(opts.style ?? PLAIN) })
  return { tui, host, root, home }
}

/** One line of a frame, without the trailing clear-to-end-of-line. */
export function lineOf(tui: Tui, n: number, width = 100, height = 24): string {
  return (
    tui
      .frame(width, height)
      .split('\r\n')
      // eslint-disable-next-line no-control-regex
      [n]!.replace(/\x1b\[K$/, '')
      // eslint-disable-next-line no-control-regex
      .replace(/^\x1b\[H/, '')
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[J$/, '')
  )
}

/** The frame as plain lines. */
export function screen(tui: Tui, width = 100, height = 24): string[] {
  return (
    tui
      .frame(width, height)
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
      .split('\r\n')
  )
}
