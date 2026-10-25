/**
 * Repository text never reaches the terminal as a control sequence: the
 * helper itself, then `--list`, `query`, the terminal UI and stderr, with
 * `--json` printed exactly.
 */

import { afterAll, beforeEach, describe, expect, test } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { captureIo } from '@osdlc/cli-tool'
import type { Catalog, Task } from '@osdlc/system-model/detect'

import { main } from '../src/cli.ts'
import { safeStderr, terminalSafe } from '../src/terminal-text.ts'
import { frame, recompute, state } from '../src/tui.ts'

/** OSC 52: put "echo hi" on the clipboard. */
const CLIPBOARD = '\u001b]52;c;ZWNobyBoaQ==\u0007'
/** OSC 0: set the window title, ended by ST. */
const TITLE = '\u001b]0;pwned\u001b\\'
/** C1 CSI, then DEL. */
const C1 = '\u009b2J\u007f'

/** Any C0 except tab and newline, DEL, or C1. */
const RAW_CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/

const dirs: string[] = []
afterAll(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })))
})
async function temp(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'wayfinder-esc-'))
  dirs.push(d)
  return d
}

describe('terminalSafe', () => {
  test('replaces OSC 52, title and C1 sequences, one character for one', () => {
    for (const seq of [CLIPBOARD, TITLE, C1]) {
      const text = `build${seq}done`
      const safe = terminalSafe(text)
      expect(safe).not.toMatch(RAW_CONTROL)
      expect(safe).toHaveLength(text.length)
      expect(safe.startsWith('build')).toBe(true)
      expect(safe.endsWith('done')).toBe(true)
    }
  })

  test('single-line output loses tab, newline and CR; multiline keeps tab and newline', () => {
    expect(terminalSafe('a\tb\nc\rd')).toBe('a�b�c�d')
    expect(terminalSafe('a\tb\nc\rd', { multiline: true })).toBe('a\tb\nc�d')
  })

  test('leaves printable text, including non-ASCII, alone', () => {
    expect(terminalSafe('déploy — 部署 ✓')).toBe('déploy — 部署 ✓')
  })

  test('safeStderr cleans stderr only', () => {
    const io = captureIo()
    const safe = safeStderr(io)
    safe.stderr(`warn ${CLIPBOARD}\n`)
    safe.stdout(`out ${CLIPBOARD}`)
    expect(io.err).not.toMatch(RAW_CONTROL)
    expect(io.err.endsWith('\n')).toBe(true)
    expect(io.out).toBe(`out ${CLIPBOARD}`)
  })
})

describe('CLI output', () => {
  const name = `build${CLIPBOARD}`
  const body = `echo ${TITLE}${C1}`

  async function repo(): Promise<string> {
    const dir = await temp()
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'esc', scripts: { [name]: body } }),
    )
    return dir
  }

  async function run(argv: string[]): Promise<{ code: number; out: string; err: string }> {
    const io = captureIo()
    const code = await main([...argv, '-C', await repo(), '--no-exec'], {}, await temp(), io)
    return { code, out: io.out, err: io.err }
  }

  test('--list prints no control characters from a script name', async () => {
    const r = await run(['--list'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('build')
    expect(r.out).not.toMatch(RAW_CONTROL)
  })

  test('query prints no control characters from a script name', async () => {
    const r = await run(['query', 'build'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('build')
    expect(r.out).not.toMatch(RAW_CONTROL)
  })

  test('--json keeps the name exactly', async () => {
    const r = await run(['--json'])
    const tasks = (
      JSON.parse(r.out) as { reports: Array<{ tasks: Array<{ path: string[] }> }> }
    ).reports.flatMap((rep) => rep.tasks)
    expect(tasks.some((t) => t.path.includes(name))).toBe(true)
  })
})

describe('terminal UI', () => {
  function task(over: Partial<Task>): Task {
    return {
      id: 'npm:x',
      runner: 'npm',
      path: ['npm', 'x'],
      argv: ['npm', 'run', 'x'],
      cwd: '.',
      display: 'npm run x',
      parameters: [],
      source: 'package.json',
      origin: 'declared',
      tags: [],
      persistent: { value: false, declared: false },
      executes: 'local',
      ...over,
    }
  }

  beforeEach(() => {
    state.query = ''
    state.runner = 'all'
    state.servicesOnly = false
    state.selectedId = null
    state.scroll = 0
    state.cache = []
  })

  test('a frame holds no control sequence from a task name, doc or path', () => {
    const catalog: Catalog = {
      root: `/tmp/repo${TITLE}`,
      generatedAt: new Date(0).toISOString(),
      discovery: 'walk',
      allowExec: false,
      reports: [
        {
          runner: 'npm',
          status: 'ok',
          chain: [{ label: 'script', hint: 'a script' }],
          tasks: [
            task({
              display: `npm run build${CLIPBOARD}`,
              doc: `does ${TITLE} things`,
              detail: `echo ${C1}`,
              cwd: `pkg${C1}`,
            }),
          ],
          skippedForExec: false,
          diagnostics: [],
        },
      ],
    }
    state.catalog = catalog
    recompute()
    // frame() writes its own cursor and clear escapes; strip those first.
    const own = /\u001b\[(?:\?\d+[hl]|[HJK]|\d*(?:;\d+)*m)/g
    const screen = frame(100, 20).replace(own, '').replace(/\r\n/g, '\n')
    expect(screen).toContain('build')
    expect(screen).not.toMatch(RAW_CONTROL)
  })
})
