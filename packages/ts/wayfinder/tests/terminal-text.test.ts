/**
 * Repository text never reaches the terminal as a control sequence: the
 * helpers themselves, then `--list`, `query`, `trust`, `config`, `providers`,
 * the `--serve` summary, the terminal UI, the copied text and
 * stderr, with `--json` keeping every value exact.
 */

import { afterAll, beforeEach, describe, expect, test } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { captureIo } from '@osdlc/cli-tool'
import { stripControls } from '@osdlc/ux'
import { CATALOG_SCHEMA_VERSION, type Catalog, type Task } from '@osdlc/system-model/detect'

import { main } from '../src/cli.ts'
import { startupSummary } from '../src/serve.ts'
import {
  guardedExit,
  jsonText,
  safeJsonStdout,
  safeStderr,
  safeStdout,
  terminalSafe,
} from '../src/terminal-text.ts'
import { frame, recompute, state } from '../src/tui.ts'
import { copyText } from '../src/web/view.ts'

/** OSC 52: put "echo hi" on the clipboard. */
const CLIPBOARD = '\u001b]52;c;ZWNobyBoaQ==\u0007'
/** OSC 0: set the window title, ended by ST. */
const TITLE = '\u001b]0;pwned\u001b\\'
/** C1 CSI, then DEL. */
const C1 = '\u009b2J\u007f'

/** Right-to-left override and first-strong isolate: text that reads in another order. */
const BIDI = '\u202e\u2066'

/** Any C0 except tab and newline, DEL, C1, or a bidi control. */
const RAW_CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/
/** What `JSON.stringify` leaves raw: DEL, C1 and the bidi controls. */
const RAW_IN_JSON = /[\u007f-\u009f\u202a-\u202e\u2066-\u2069]/

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

  test('replaces bidi embedding, override and isolate characters', () => {
    const all = '\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069'
    expect(terminalSafe(`a${all}b`)).toBe(`a${'�'.repeat(9)}b`)
    expect(terminalSafe(`a${BIDI}b`, { multiline: true })).toBe('a��b')
  })

  test('replaces the bidi marks ALM, LRM and RLM, as stripControls removes them', () => {
    const marks = '\u061c\u200e\u200f'
    expect(terminalSafe(`a${marks}b`)).toBe('a���b')
    expect(stripControls(`a${marks}b`)).toBe('ab')
    expect(jsonText(marks)).toBe('"\\u061c\\u200e\\u200f"')
  })

  test('replaces every character stripControls removes, one for one', () => {
    const controls = [
      ...Array.from({ length: 0x20 }, (_, i) => i),
      ...Array.from({ length: 0x21 }, (_, i) => 0x7f + i),
      0x061c,
      0x200e,
      0x200f,
      ...Array.from({ length: 5 }, (_, i) => 0x202a + i),
      ...Array.from({ length: 4 }, (_, i) => 0x2066 + i),
    ].map((c) => String.fromCharCode(c))
    // At the end of the text, so stripControls has no sequence to take with it.
    for (const c of controls) {
      expect(stripControls(`a${c}`)).toBe('a')
      expect(terminalSafe(`a${c}`)).toBe('a�')
    }
  })

  test('jsonText escapes DEL, C1 and bidi, and parses to the same value', () => {
    const value = { name: `x${C1}${BIDI}${CLIPBOARD}`, n: [1, 'é'] }
    for (const indent of [undefined, 2]) {
      const text = jsonText(value, indent)
      expect(text).not.toMatch(RAW_IN_JSON)
      expect(text).not.toMatch(RAW_CONTROL)
      expect(JSON.parse(text)).toEqual(value)
    }
    expect(jsonText('\u007f\u009b\u202e')).toBe('"\\u007f\\u009b\\u202e"')
  })

  test('safeStdout cleans stdout and keeps lines', () => {
    const io = captureIo()
    safeStdout(io).stdout(`a ${CLIPBOARD}\tb\n`)
    expect(io.out).not.toMatch(RAW_CONTROL)
    expect(io.out.endsWith('\tb\n')).toBe(true)
  })

  test('safeJsonStdout keeps JSON values exact and escapes DEL, C1 and bidi', () => {
    const io = captureIo()
    const value = { path: `a${C1}${BIDI}${CLIPBOARD}` }
    safeJsonStdout(io).stdout(`${JSON.stringify(value, null, 2)}\n`)
    expect(io.out).not.toMatch(RAW_CONTROL)
    expect(JSON.parse(io.out)).toEqual(value)
  })

  test('guardedExit prints a thrown error as one terminal-safe line and returns 1', async () => {
    const lines: string[] = []
    const code = await guardedExit(
      () => {
        throw new Error(`bad ${CLIPBOARD}\nnext`)
      },
      (text) => lines.push(text),
    )
    expect(code).toBe(1)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^wayfinder: bad /)
    expect(lines[0]?.slice(0, -1)).not.toMatch(RAW_CONTROL)
    expect(await guardedExit(async () => 3)).toBe(3)
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

  test('--json keeps the name exactly, with no raw DEL, C1 or bidi character', async () => {
    const r = await run(['--json'])
    expect(r.out).not.toMatch(RAW_CONTROL)
    const tasks = (
      JSON.parse(r.out) as { reports: Array<{ tasks: Array<{ path: string[] }> }> }
    ).reports.flatMap((rep) => rep.tasks)
    expect(tasks.some((t) => t.path.includes(name))).toBe(true)
  })

  test('query --json has no raw DEL, C1 or bidi character', async () => {
    const r = await run(['query', 'build', '--json'])
    expect(r.out).not.toMatch(RAW_CONTROL)
    expect(JSON.stringify(JSON.parse(r.out))).toContain('build')
  })
})

describe('trust, config and providers output', () => {
  /** A repository whose directory name, config key and config value carry escapes. */
  async function hostile(): Promise<{ dir: string; home: string }> {
    const parent = await temp()
    const dir = join(parent, `repo${TITLE}${BIDI}`)
    await mkdir(dir)
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'esc', scripts: { x: 'true' } }),
    )
    await writeFile(
      join(dir, 'wayfinder.config.json'),
      JSON.stringify({ [`key${CLIPBOARD}`]: 1, excludePaths: [`dir${C1}${BIDI}`] }),
    )
    return { dir, home: await temp() }
  }

  async function run(argv: string[], dir: string, home: string) {
    const io = captureIo()
    const code = await main(argv, {}, home, io)
    return { code, out: io.out, err: io.err, dir }
  }

  test.each([
    [['trust', '--show']],
    [['trust']],
    [['trust', '--list']],
    [['trust', '--show', '--json']],
    [['config', 'list']],
    [['config', 'list', '--json']],
    [['config', 'path']],
    [['config', 'get', 'excludePaths']],
    [['providers']],
    [['providers', '--json']],
  ])('%j prints no control character from the repository', async (argv) => {
    const { dir, home } = await hostile()
    // Trust first, so `trust --list` has the hostile path to print.
    await run(['trust', '-C', dir], dir, home)
    const r = await run([...argv, '-C', dir], dir, home)
    expect(r.out).not.toMatch(RAW_CONTROL)
    expect(r.err).not.toMatch(RAW_CONTROL)
  })
})

describe('the --serve summary', () => {
  test('prints the root and runner names without control characters', () => {
    const text = startupSummary('http://127.0.0.1:1', {
      catalog: {
        root: `/tmp/repo${TITLE}${BIDI}`,
        generatedAt: new Date(0).toISOString(),
        discovery: 'walk',
        allowExec: false,
        reports: [
          {
            runner: `npm${C1}`,
            status: 'ok',
            chain: [],
            tasks: [],
            skippedForExec: false,
            diagnostics: [],
          },
        ],
      },
      cache: [{ runner: `just${CLIPBOARD}`, state: 'stale', ageMs: 1000 }],
    } as unknown as Parameters<typeof startupSummary>[1])
    expect(text).toContain('root')
    expect(text).toContain('cached')
    expect(text).not.toMatch(RAW_CONTROL)
  })
})

describe('copied text', () => {
  test('the web copy text has no control characters', () => {
    const t = {
      display: `npm run x${CLIPBOARD}\u001b[201~; rm -rf ~`,
      cwd: `pkg${BIDI}`,
    } as unknown as Task
    expect(copyText(t)).not.toMatch(RAW_CONTROL)
    expect(copyText({ ...t, cwd: '.' })).not.toMatch(RAW_CONTROL)
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
      kind: 'catalog',
      schemaVersion: CATALOG_SCHEMA_VERSION,
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
