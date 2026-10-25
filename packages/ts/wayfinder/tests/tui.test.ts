/**
 * The terminal UI, driven through `createTui` with a fake host: every key,
 * every frame and every write to disk, without a terminal. Each test gets its
 * own instance over a session in a throwaway repository and HOME.
 */

import { EventEmitter } from 'node:events'
import { chmod, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, test, vi } from 'vitest'

import {
  CATALOG_SCHEMA_VERSION,
  type Catalog,
  type RunnerCacheState,
  type RunnerReport,
  type Task,
} from '@osdlc/system-model/detect'
import { appTrustStore } from '../src/trust-store.ts'

import { openSurface } from '../src/commands/browse.ts'
import { configLocations } from '../src/config.ts'
import { KEY_TABLE, keysFor } from '../src/keys.ts'
import { refreshNote } from '../src/tui/app.ts'
import { clipboardCommands, copyText, writeClipboard } from '../src/tui/copy.ts'
import { installQuitHandlers, runTui } from '../src/tui/index.ts'
import { makeStyles, stylesFor, terminalTheme } from '../src/tui/style.ts'
import { cleanupAll, lineOf, screen, temp, testTui } from './tui-support.ts'

afterAll(cleanupAll)

function task(runner: string, name: string, over: Partial<Task> = {}): Task {
  return {
    id: `${runner}:${name}`,
    runner,
    path: [runner, name],
    argv: [runner, name],
    cwd: '.',
    display: `${runner} ${name}`,
    parameters: [],
    source: 'Makefile',
    origin: 'declared',
    tags: [],
    persistent: { value: false, declared: false },
    executes: 'local',
    ...over,
  }
}

function report(runner: string, tasks: Task[], over: Partial<RunnerReport> = {}): RunnerReport {
  return {
    runner,
    status: 'ok',
    chain: [{ label: 'target', hint: 'The target name.' }],
    tasks,
    skippedForExec: false,
    diagnostics: [],
    ...over,
  }
}

function catalog(names: string[], extra: RunnerReport[] = []): Catalog {
  return {
    kind: 'catalog',
    schemaVersion: CATALOG_SCHEMA_VERSION,
    root: '/tmp/repo',
    generatedAt: new Date(0).toISOString(),
    discovery: 'walk',
    allowExec: false,
    reports: [
      report(
        'make',
        names.map((n) => task('make', n)),
      ),
      ...extra,
    ],
  }
}

/** A UI showing `cat`, as if a probe had answered. */
async function showing(cat: Catalog, opts: Parameters<typeof testTui>[0] = {}) {
  const made = await testTui(opts)
  made.tui.state.catalog = cat
  made.tui.state.probed = true
  made.tui.state.cache = cat.reports.map((r) => ({
    runner: r.runner,
    state: 'fresh' as const,
    estimateMs: null,
    slow: false,
  }))
  made.tui.recompute()
  return made
}

const clock = new Date(new Date(0).toISOString()).toLocaleTimeString()

describe('selection across a refresh', () => {
  test('survives rows being reordered and dropped underneath it', async () => {
    const { tui } = await showing(catalog(['build', 'lint', 'test']))
    tui.state.selectedId = tui.state.rows[2]!.task.id
    expect(tui.cursor()).toBe(2)
    // A refresh drops "build" and reorders the rest. The cursor stays on
    // "test", at a different index.
    tui.state.catalog = catalog(['test', 'lint', 'ship'])
    tui.recompute()
    expect(tui.state.selectedId).toBe('make:test')
    expect(tui.cursor()).toBe(0)
  })

  test('re-anchors onto a real row when the selected task disappears', async () => {
    const { tui } = await showing(catalog(['build', 'lint']))
    tui.state.selectedId = 'make:build'
    tui.state.catalog = catalog(['lint'])
    tui.recompute()
    expect(tui.state.selectedId).toBe('make:lint')
  })
})

describe('refreshNote — the three states', () => {
  const row = (over: Partial<RunnerCacheState>): RunnerCacheState => ({
    runner: 'make',
    state: 'fresh',
    estimateMs: null,
    slow: false,
    ...over,
  })

  test('fresh says nothing at all', () => {
    expect(refreshNote([row({}), row({ runner: 'cargo' })], true)).toBeNull()
    expect(refreshNote([], true)).toBeNull()
  })

  test('stale and refreshing names the runners and their measured cost', () => {
    const note = refreshNote(
      [
        row({ runner: 'make', state: 'stale', ageMs: 120_000, estimateMs: 180 }),
        row({ runner: 'just', state: 'stale', ageMs: 60_000, estimateMs: null }),
      ],
      true,
    )
    expect(note).toEqual({
      slow: false,
      text: 'cached rows — re-probing make (~180ms), just (never timed here)',
    })
  })

  test('stale and measured slow reads differently', () => {
    const note = refreshNote(
      [
        row({ runner: 'moon', state: 'stale', ageMs: 7_200_000, estimateMs: 6200, slow: true }),
        row({ runner: 'make', state: 'stale', ageMs: 60_000, estimateMs: 180 }),
      ],
      true,
    )
    expect(note!.slow).toBe(true)
    expect(note!.text).toBe(
      'cached rows — moon (~6.2s) is slow to probe here, so this takes a moment; ' +
        'also re-probing make (~180ms)',
    )
  })

  test('with no refresh running it reports ages', () => {
    const note = refreshNote([row({ state: 'stale', ageMs: 7_200_000, estimateMs: 100 })], false)
    expect(note).toEqual({ slow: false, text: 'cached rows: make 2h old — ^r to re-probe' })
  })

  test('a group runner is named by its group', () => {
    const note = refreshNote(
      [row({ runner: 'package-manager', state: 'stale', ageMs: 1000 })],
      false,
    )
    expect(note!.text).toContain('dependencies')
  })
})

describe('the status line and tabs', () => {
  test('fresh: counts and a clock, and nothing else', async () => {
    const { tui } = await showing(catalog(['build', 'lint']))
    expect(lineOf(tui, 2)).toBe(`2/2  checked ${clock}`)
    expect(lineOf(tui, 0)).toContain(' make 2 ')
    expect(lineOf(tui, 0)).not.toContain('~make')
  })

  test('stale and refreshing: the tab is marked and the note names the cost', async () => {
    const { tui } = await showing(catalog(['build', 'lint']))
    tui.state.loading = true
    tui.state.cache = [
      {
        runner: 'make',
        state: 'stale',
        reason: 'changed',
        ageMs: 120_000,
        estimateMs: 180,
        slow: false,
      },
    ]
    expect(lineOf(tui, 2)).toBe(`2/2  checked ${clock}  cached rows — re-probing make (~180ms)`)
    expect(lineOf(tui, 0)).toContain(' ~make 2 ')
  })

  test('after a fresh probe the measured time is shown', async () => {
    const { tui } = await showing(catalog(['build']))
    tui.state.cache = [
      { runner: 'make', state: 'fresh', estimateMs: 1200, slow: false, probeMs: 1200 },
    ]
    expect(lineOf(tui, 2)).toBe(`1/1  checked ${clock}, probed in 1.2s`)
  })

  test('"collecting" while the first probe runs, then "nothing collected"', async () => {
    const { tui } = await testTui()
    tui.state.loading = true
    tui.recompute()
    expect(lineOf(tui, 2)).toBe('0/0  collecting')
    expect(lineOf(tui, 3)).toBe('    collecting…')
    tui.state.loading = false
    tui.state.probed = true
    expect(lineOf(tui, 3)).toBe('    nothing collected')
  })

  test('a bar separates the task runners from each group, named by the group', async () => {
    const { tui } = await showing(
      catalog(
        ['lint'],
        [
          report('package-manager', [task('package-manager', 'ci')]),
          report('hook-manager', [task('hook-manager', 'install')]),
        ],
      ),
    )
    expect(lineOf(tui, 0)).toContain(' make 1 │ dependencies 1 │ git hooks 1 ')
  })

  test('the selected tab is marked with brackets, which show without color', async () => {
    const { tui } = await showing(catalog(['build']))
    expect(lineOf(tui, 0)).toMatch(/^\[all 1\] make 1 /)
    tui.handle('\t')
    expect(lineOf(tui, 0)).toMatch(/^ all 1 \[make 1\]/)
  })

  test('the tab row scrolls to keep the selected tab in view', async () => {
    const many = Array.from({ length: 12 }, (_, i) => {
      const id = `runner${String(i).padStart(2, '0')}`
      return report(id, [task(id, 'x')])
    })
    const { tui } = await showing({ ...catalog([]), reports: many })
    tui.handle('\x1b[Z') // shift-tab from `all`: the last tab
    const row = lineOf(tui, 0, 60)
    expect(row).toContain('[runner11 1]')
    expect(row.startsWith('‹')).toBe(true)
    // The mode flags keep their room at the right.
    expect(row.trimEnd().endsWith('fuzzy')).toBe(true)
    tui.handle('\t') // wraps to `all`
    expect(lineOf(tui, 0, 60)).toMatch(/^\[all 12\].*›/)
  })

  test('a withheld runner is marked on its tab, and its empty list says why', async () => {
    const { tui } = await showing(
      catalog(['build'], [report('moon', [], { skippedForExec: true })]),
    )
    expect(lineOf(tui, 0)).toContain(' moon – ')
    expect(lineOf(tui, 2)).toContain(
      '1 runner withheld: this repository is not trusted (^s to trust)',
    )
    tui.handle('\t')
    tui.handle('\t')
    tui.recompute()
    expect(tui.state.runner).toBe('moon')
    expect(lineOf(tui, 3)).toContain('withheld: this repository is not trusted — ^s to trust')
  })

  test('under --no-exec the withheld note names the flag and offers no trust key', async () => {
    const { tui } = await showing(
      catalog(['build'], [report('moon', [], { skippedForExec: true })]),
      { flags: { allowExec: false } },
    )
    const status = lineOf(tui, 2)
    expect(status).toContain('1 runner withheld: --no-exec was given')
    expect(status).not.toContain('^s')
  })
})

describe('marks and the line under the selection', () => {
  test('a service is marked, and the mark is spelled out for the selected row', async () => {
    const { tui } = await showing({
      ...catalog([]),
      reports: [
        report('just', [task('just', 'dev', { persistent: { value: true, declared: true } })]),
      ],
    })
    expect(lineOf(tui, 3)).toBe('>*  just > dev')
    expect(lineOf(tui, 22)).toBe('* service  ')
  })

  test('a task with unknown parameters is marked with the shared label', async () => {
    const { tui } = await showing({
      ...catalog([]),
      reports: [report('just', [task('just', 'deploy', { parametersUnknown: 'exec-withheld' })])],
    })
    expect(lineOf(tui, 3)).toBe('> ? just > deploy')
    expect(lineOf(tui, 22)).toContain(
      '? parameters unknown: reading them needs execution, which is withheld',
    )
  })

  test('matches are bold and underlined, so they show without color', () => {
    const s = makeStyles({ level: 'none', theme: 'light', attributes: true })
    expect(s.match('x')).toContain('\x1b[4m')
    expect(s.match('x')).toContain('\x1b[1m')
    expect(s.match('x')).not.toContain('\x1b[3')
  })

  test('NO_COLOR keeps attributes on a terminal; a pipe gets none', () => {
    const tty = stylesFor({ NO_COLOR: '1', TERM: 'xterm-256color' }, true)
    expect(tty.selected('x')).toBe('\x1b[7mx\x1b[27m')
    expect(tty.warning('x')).toBe('x')
    const pipe = stylesFor({ TERM: 'xterm-256color' }, false)
    expect(pipe.selected('x')).toBe('x')
  })

  test('yellow is kept for warnings: notes and the accent use other tokens', () => {
    const s = makeStyles({ level: 'ansi16', theme: 'light', attributes: true })
    expect(s.warning('x')).toContain('\x1b[33m')
    expect(s.note('x')).not.toContain('\x1b[33m')
    expect(s.accent('x')).not.toContain('\x1b[33m')
    expect(s.match('x')).not.toContain('\x1b[33m')
  })

  test('the terminal theme comes from COLORFGBG', () => {
    expect(terminalTheme({ COLORFGBG: '0;15' })).toBe('light')
    expect(terminalTheme({ COLORFGBG: '15;0' })).toBe('dark')
    expect(terminalTheme({})).toBe('dark')
  })
})

describe('the footer and the help screen', () => {
  test('the footer fits the width and keeps ? help and esc quit', async () => {
    const { tui } = await showing(catalog(['build']))
    for (const width of [100, 78, 40, 24]) {
      const foot = lineOf(tui, 23, width)
      expect(foot.length).toBeLessThanOrEqual(width)
      expect(foot).toContain('? help')
      expect(foot).toContain('esc quit')
      expect(foot).not.toContain('…')
    }
    expect(lineOf(tui, 23, 100)).toContain('enter run')
  })

  test('? opens a screen with every list key from the shared table; esc closes it', async () => {
    const { tui } = await showing(catalog(['build']))
    tui.handle('?')
    expect(tui.state.view).toBe('help')
    expect(tui.state.query).toBe('')
    const text = screen(tui, 120, 80).join('\n')
    for (const binding of keysFor('tui', 'list')) {
      expect(text).toContain(binding.keys.join(', '))
      expect(text).toContain(binding.action)
    }
    expect(text).toContain('a service: it runs until you stop it')
    tui.handle('\x1b')
    expect(tui.state.view).toBe('list')
  })

  test('the help screen scrolls', async () => {
    const { tui } = await showing(catalog(['build']))
    tui.handle('?')
    const top = lineOf(tui, 3, 100, 12)
    tui.handle('\x1b[6~')
    expect(lineOf(tui, 3, 100, 12)).not.toBe(top)
    tui.handle('\x1b[5~')
    expect(lineOf(tui, 3, 100, 12)).toBe(top)
  })

  test('every binding has keys and an action', () => {
    for (const k of KEY_TABLE) {
      expect(k.action.length).toBeGreaterThan(0)
      expect(k.keys.length).toBeGreaterThan(0)
    }
  })
})

describe('the key reader', () => {
  test('text typed after an escape sequence is kept, and rows follow each key', async () => {
    const { tui } = await showing(catalog(['build', 'lint', 'check']))
    tui.feed('\x1b[Zcheck')
    expect(tui.state.query).toBe('check')
    expect(tui.state.runner).toBe('make')
    // ^u then End in one read: End acts on the whole list, not the filtered one.
    tui.feed('\x15\x1b[F')
    expect(tui.state.query).toBe('')
    expect(tui.state.selectedId).toBe('make:check')
    expect(tui.cursor()).toBe(2)
  })

  test.each([
    ['\x1b[1~', '\x1b[4~'],
    ['\x1b[7~', '\x1b[8~'],
    ['\x1bOH', '\x1bOF'],
    ['\x1b[H', '\x1b[F'],
  ])('Home %j and End %j', async (home, end) => {
    const { tui } = await showing(catalog(['a', 'b', 'c']))
    tui.feed(end)
    expect(tui.cursor()).toBe(2)
    tui.feed(home)
    expect(tui.cursor()).toBe(0)
  })

  test('a lone escape at the end of a read is Esc', async () => {
    const { tui, host } = await showing(catalog(['a']))
    tui.feed('\x1b')
    expect(host.exits).toEqual([0])
  })
})

describe('arguments', () => {
  const parameterised = (): Task =>
    task('just', 'deploy', {
      display: 'just deploy <env> [tag]',
      parameters: [
        { name: 'env', required: true, variadic: false },
        { name: 'tag', required: false, variadic: false },
      ],
    })

  test('Enter asks for them; the line shows what will run, with one cursor', async () => {
    const { tui } = await showing({ ...catalog([]), reports: [report('just', [parameterised()])] })
    tui.handle('\r')
    for (const ch of 'staging') tui.handle(ch)
    expect(lineOf(tui, 22)).toBe('$ just deploy staging█')
    expect(lineOf(tui, 23)).toContain('takes <env> [tag]')
    expect(lineOf(tui, 23)).toContain('enter run')
    expect(lineOf(tui, 23)).toContain('esc back')
    expect(lineOf(tui, 1)).toBe('> ')
  })

  test('the entry line costs the list a row, not the bottom line', async () => {
    const { tui } = await showing({ ...catalog([]), reports: [report('just', [parameterised()])] })
    const lines = tui.frame(100, 24).split('\r\n').length
    tui.handle('\r')
    expect(tui.frame(100, 24).split('\r\n').length).toBe(lines)
  })

  test('Enter runs with the arguments split as in sh', async () => {
    const { tui, host } = await showing({
      ...catalog([]),
      reports: [report('just', [parameterised()])],
    })
    tui.handle('\r')
    for (const ch of "prod 'v 1'") tui.handle(ch)
    tui.handle('\r')
    expect(host.released).toBe(1)
    expect(host.handedOff[0]!.argv).toEqual(['just', 'deploy', 'prod', 'v 1'])
    expect(host.exits).toEqual([0])
  })

  test('unknown parameters: Enter asks, and an empty line runs the task as it is', async () => {
    const { tui, host } = await showing({
      ...catalog([]),
      reports: [report('just', [task('just', 'build', { parametersUnknown: 'tool-missing' })])],
    })
    tui.handle('\r')
    expect(tui.state.entering).not.toBeNull()
    expect(lineOf(tui, 23)).toContain(
      'parameters unknown: the tool is not installed; type any, or none',
    )
    tui.handle('\r')
    expect(host.handedOff[0]!.argv).toEqual(['just', 'build'])
  })

  test('an editor-variable task is not run, and says why', async () => {
    const { tui, host } = await showing({
      ...catalog([]),
      reports: [report('vscode', [task('vscode', 'x', { parametersUnknown: 'editor-variable' })])],
    })
    tui.handle('\r')
    expect(tui.state.entering).toBeNull()
    expect(host.handedOff).toEqual([])
    expect(host.released).toBe(0)
    expect(tui.state.message?.text).toContain('editor variable')
  })

  test('a task that will not start is reported after the terminal is given back', async () => {
    const { tui, host } = await showing(catalog(['build']))
    host.handOffResult = { exit: 1, error: 'not found' }
    tui.handle('\r')
    expect(host.written.join('')).toContain('make: not found')
    expect(host.exits).toEqual([1])
  })
})

describe('copy', () => {
  test('^y copies the command line built from argv, with the directory change', async () => {
    const { tui, host } = await showing({
      ...catalog([]),
      reports: [report('npm', [task('npm', 'x', { argv: ['npm', 'run', 'a b'], cwd: 'my pkg' })])],
    })
    tui.handle('\x19')
    await tui.idle()
    expect(host.copied).toEqual(["cd 'my pkg' && npm run 'a b'"])
    expect(tui.state.message).toEqual({ text: 'copied', tone: 'note' })
  })

  test('no clipboard is a warning on the status line', async () => {
    const { tui, host } = await showing(catalog(['build']))
    host.clipboardOk = false
    tui.handle('\x19')
    await tui.idle()
    expect(tui.state.message).toEqual({ text: 'clipboard unavailable', tone: 'warning' })
  })

  test('copy text quotes for PowerShell on Windows', () => {
    expect(copyText(task('npm', 'x', { argv: ['npm', 'run', 'x'] }), 'win32')).toBe('& npm run x')
  })

  test('the clipboard programs per platform', () => {
    const names = (platform: NodeJS.Platform, env: Record<string, string> = {}) =>
      clipboardCommands(platform, env).map((c) => c.binary)
    expect(names('darwin')).toEqual(['pbcopy'])
    expect(names('linux')).toEqual(['xclip', 'xsel'])
    expect(names('linux', { WAYLAND_DISPLAY: 'wayland-0' })).toEqual(['wl-copy', 'xclip', 'xsel'])
    expect(names('win32')).toEqual([])
  })

  test.skipIf(process.platform === 'win32')(
    'a clipboard program that leaves a child holding its output does not hold up the copy',
    async () => {
      const bin = await temp('wayfinder-clip-')
      // As xclip does: fork a child that keeps the selection, and the pipes, then exit.
      await writeFile(join(bin, 'xclip'), '#!/bin/sh\ncat > /dev/null\nsleep 20 &\nexit 0\n')
      await chmod(join(bin, 'xclip'), 0o755)
      const saved = process.env['PATH']
      process.env['PATH'] = `${bin}:/usr/bin:/bin`
      try {
        const started = Date.now()
        const ok = await writeClipboard('hello', { cwd: bin, platform: 'linux', env: {} })
        expect(ok).toBe(true)
        expect(Date.now() - started).toBeLessThan(1500)
      } finally {
        process.env['PATH'] = saved
      }
    },
  )
})

describe('filters', () => {
  test('^d keeps declared tasks, ^o cycles the scope, and both show as flags', async () => {
    const { tui } = await showing({
      ...catalog([]),
      reports: [
        report('make', [
          task('make', 'top', { source: 'Makefile' }),
          task('make', 'deep', { source: 'a/b/c/Makefile' }),
          task('make', 'guess', { origin: 'synthesized' }),
        ]),
      ],
    })
    tui.handle('\x04')
    tui.recompute()
    expect(tui.state.rows.map((r) => r.task.id)).toEqual(['make:top', 'make:deep'])
    expect(lineOf(tui, 0)).toContain('fuzzy declared')
    tui.handle('\x0f') // the root only
    tui.recompute()
    expect(tui.state.rows.map((r) => r.task.id)).toEqual(['make:top'])
    expect(lineOf(tui, 0)).toContain('scope root')
  })
})

describe('trust', () => {
  const withheldCatalog = () => catalog(['build'], [report('moon', [], { skippedForExec: true })])

  test('^s asks, and y grants, re-probes and clears the note', async () => {
    const { tui, home, root } = await showing(withheldCatalog())
    tui.handle('\x13')
    expect(lineOf(tui, 2)).toContain('trust this repository? y/n')
    tui.handle('y')
    await tui.idle()
    expect(tui.session.gate.trusted).toBe(true)
    expect(tui.state.catalog?.allowExec).toBe(true)
    expect(tui.state.message).toBeNull()
    expect(tui.state.loading).toBe(false)
    expect(await appTrustStore({ env: {}, home }).isTrusted(root)).toBe(true)
  })

  test('any other key cancels the question and does nothing else', async () => {
    const { tui } = await showing(withheldCatalog())
    tui.handle('\x13')
    tui.handle('x')
    expect(tui.state.confirmingTrust).toBe(false)
    expect(tui.state.query).toBe('')
    expect(tui.session.gate.trusted).toBe(false)
  })

  test('a grant with a probe in flight abandons that probe and probes again', async () => {
    const { tui } = await showing(withheldCatalog())
    const stale = new AbortController()
    tui.state.loading = true
    tui.state.inFlight = stale
    tui.state.confirmingTrust = true
    tui.handle('y')
    await tui.idle()
    expect(stale.signal.aborted).toBe(true)
    expect(tui.state.catalog?.allowExec).toBe(true)
  })

  test('settings: t grants after y, and u removes the grant', async () => {
    const { tui, home, root } = await showing(withheldCatalog())
    tui.handle(',')
    await tui.idle()
    expect(screen(tui, 100, 40).join('\n')).toContain('trust: not trusted (t to trust)')
    tui.handle('t')
    tui.handle('y')
    await tui.idle()
    expect(screen(tui, 100, 40).join('\n')).toContain('trust: trusted (u removes the grant)')
    tui.handle('u')
    await tui.idle()
    expect(await appTrustStore({ env: {}, home }).isTrusted(root)).toBe(false)
    expect(screen(tui, 100, 40).join('\n')).toContain('trust: removed')
    expect(tui.state.message?.text).toContain('trust removed')
  })

  test('a root trusted by a user-config rule reads as trusted, with no marker', async () => {
    const { tui, home, root } = await showing(catalog(['build']), {
      userConfig: { trust: { paths: [`${await realpath(tmpdir())}/**`] } },
    })
    tui.handle(',')
    await tui.idle()
    expect(screen(tui, 100, 40).join('\n')).toContain('trust: trusted')
    expect(await appTrustStore({ env: {}, home }).isTrusted(root)).toBe(false)
  })
})

describe('the settings screen', () => {
  async function open(opts: Parameters<typeof testTui>[0] = {}) {
    const made = await showing(catalog(['build'], [report('just', [task('just', 'x')])]), opts)
    made.tui.handle(',')
    await made.tui.idle()
    return made
  }

  const projectFile = async (root: string): Promise<Record<string, unknown>> =>
    JSON.parse(await readFile(join(root, 'wayfinder.config.json'), 'utf-8')) as Record<
      string,
      unknown
    >

  test('a broken config is reported on the status line', async () => {
    const { tui, root } = await showing(catalog(['build']))
    await writeFile(join(root, 'wayfinder.config.json'), '{ not json', 'utf-8')
    tui.handle(',')
    await tui.idle()
    expect(tui.state.message?.text).toContain('settings unavailable')
    expect(tui.state.view).toBe('list')
  })

  test('space turns a runner off in the project file, and the session stops collecting it', async () => {
    const { tui, root } = await open()
    expect(screen(tui)[4]).toMatch(
      /^> on {3}make {2}https:\/\/www\.gnu\.org\/software\/make\/ {2}A build/,
    )
    tui.handle(' ')
    await tui.idle()
    expect(await projectFile(root)).toMatchObject({ runners: { disabled: ['make'] } })
    expect(tui.session.options.exclude).toEqual(['make'])
    // The probe that follows replaced the rows; the cursor is still on make.
    expect(screen(tui)).toContainEqual(expect.stringMatching(/^> off {2}make\s+not collected/))
    expect(tui.state.message?.text).toContain('saved runners.disabled')
  })

  test('a flag that decides the setting is named, and the session keeps the flag', async () => {
    const { tui } = await open({ flags: { exclude: ['nothing'] } })
    tui.handle(' ')
    await tui.idle()
    expect(tui.session.options.exclude).toEqual(['nothing'])
    expect(tui.state.message).toMatchObject({ tone: 'warning' })
    expect(tui.state.message?.text).toContain('a command-line flag decides it')
  })

  test('discovery cycles through its values', async () => {
    const { tui, root } = await open()
    const lines = () => screen(tui, 100, 60)
    const at = lines().findIndex((l) => l.startsWith('DISCOVERY'))
    while (!lines()[at + 1]!.startsWith('>')) tui.handle('\x1b[B')
    tui.handle('\r')
    await tui.idle()
    expect(await projectFile(root)).toMatchObject({ discovery: 'git' })
    expect(tui.session.options.discovery).toBe('git')
  })

  test('a adds an excluded path and x removes it', async () => {
    const { tui, root } = await open()
    tui.handle('a')
    for (const ch of 'vendor') tui.handle(ch)
    expect(screen(tui).at(-1)).toContain('add path: vendor█')
    tui.handle('\r')
    await tui.idle()
    expect(await projectFile(root)).toMatchObject({ excludePaths: ['vendor'] })
    expect(tui.session.options.excludePaths).toEqual(['vendor'])
    while (!screen(tui, 100, 60).includes('> vendor')) tui.handle('\x1b[B')
    tui.handle('x')
    await tui.idle()
    expect(await projectFile(root)).toMatchObject({ excludePaths: [] })
  })

  test('] moves a runner later in the order, written to the user file', async () => {
    const { tui, root, home } = await open()
    tui.handle(']')
    await tui.idle()
    const user = configLocations(root, { PATH: process.env['PATH'] }, home).user
    expect(JSON.parse(await readFile(user, 'utf-8'))).toMatchObject({
      runners: { order: ['just', 'make'] },
    })
    expect(tui.state.catalog?.reports.map((r) => r.runner)).toEqual(['just', 'make'])
    // The cursor stays on the runner it moved.
    expect(screen(tui)[5]).toMatch(/^> on {3}make/)
  })

  test('] writes the order to the project file when that file sets it', async () => {
    const { tui, root } = await showing(catalog(['build'], [report('just', [task('just', 'x')])]))
    await writeFile(join(root, 'wayfinder.config.json'), '{"runners":{"order":["make","just"]}}')
    tui.handle(',')
    await tui.idle()
    tui.handle(']')
    await tui.idle()
    expect(await projectFile(root)).toMatchObject({ runners: { order: ['just', 'make'] } })
    expect(tui.state.message?.text).toContain('saved runners.order to')
  })

  test('a write that fails is reported, and nothing else changes', async () => {
    const { tui, root } = await open()
    await mkdir(join(root, 'wayfinder.config.json'))
    tui.handle(' ')
    await tui.idle()
    expect(tui.state.message).toMatchObject({ tone: 'error' })
    expect(tui.state.message?.text).toContain('not saved')
    expect(tui.session.options.exclude).toEqual([])
  })

  test('the screen scrolls to keep the cursor in view', async () => {
    const { tui } = await open({ size: { columns: 100, rows: 10 } })
    for (let i = 0; i < 10; i++) tui.handle('\x1b[B')
    const shown = screen(tui, 100, 10)
    expect(shown.some((l) => l.startsWith('> + add a path'))).toBe(true)
    expect(shown.some((l) => l.startsWith('RUNNERS'))).toBe(false)
  })

  test('esc goes back to the list; ? opens help and returns to settings', async () => {
    const { tui } = await open()
    tui.handle('?')
    expect(tui.state.view).toBe('help')
    tui.handle('\x1b')
    expect(tui.state.view).toBe('settings')
    tui.handle('\x1b')
    expect(tui.state.view).toBe('list')
  })
})

describe('boot', () => {
  test('probes and shows the rows with the measured time', async () => {
    const { tui } = await testTui()
    await tui.boot()
    expect(tui.state.probed).toBe(true)
    expect(tui.state.rows.map((r) => r.task.id)).toContain('node-scripts:package.json:build')
    expect(lineOf(tui, 2)).toMatch(/probed in/)
  })
})

describe('quitting', () => {
  test.each([
    ['^C', '\x03'],
    ['Esc', '\x1b'],
  ])('%s stops the probe in flight, gives the terminal back and exits 0', async (_, key) => {
    const { tui, host } = await showing(catalog(['a']))
    const probe = new AbortController()
    tui.state.inFlight = probe
    tui.handle(key)
    expect(probe.signal.aborted).toBe(true)
    expect(host.released).toBe(1)
    expect(host.exits).toEqual([0])
  })

  test.each([
    ['SIGINT', 130],
    ['SIGTERM', 143],
    ['SIGHUP', 129],
    ['SIGQUIT', 131],
  ] as const)('%s quits with %i, and the listeners can be removed', (signal, code) => {
    const target = new EventEmitter()
    const codes: number[] = []
    const uninstall = installQuitHandlers((c) => codes.push(c), target)
    target.emit(signal)
    expect(codes).toEqual([code])
    uninstall()
    expect(target.listenerCount(signal)).toBe(0)
  })

  test('without a TTY it refuses on stderr, with the way: prefix', async () => {
    const { tui } = await testTui()
    const was = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY')
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      expect(await runTui(tui.session)).toBe(2)
      expect(String(write.mock.calls[0]?.[0])).toMatch(/^way: the terminal UI needs a TTY/)
    } finally {
      write.mockRestore()
      if (was === undefined) delete (process.stdin as { isTTY?: boolean }).isTTY
      else Object.defineProperty(process.stdin, 'isTTY', was)
    }
  })
})

describe('the open setting', () => {
  test('the bare command opens what the user config says', async () => {
    expect(openSurface((await testTui()).tui.session)).toBe('tui')
    expect(openSurface((await testTui({ userConfig: { open: 'web' } })).tui.session)).toBe('web')
  })
})
