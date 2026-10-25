/**
 * The terminal UI's two cache-facing rules, tested without a terminal.
 *
 * `runTui` owns raw mode and never returns, so nothing here calls it. What it
 * exercises is the pair of decisions a stale-then-refresh boot makes:
 *
 *   1. A refresh reorders rows and drops some of them. The selection is held by
 *      task id precisely so it survives that — an index would quietly point at
 *      a different task, and the next Enter would run the wrong command.
 *   2. The status line distinguishes fresh, stale-and-refreshing, and
 *      stale-and-measured-slow. The third is the case the whole cache exists
 *      for, so it must not read like the second.
 *
 * `state` and `recompute` are exported from the module for this: they are the
 * live singleton the running UI uses, not a copy built for the test.
 */

import { EventEmitter } from 'node:events'

import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { setTimeout as sleep } from 'node:timers/promises'
import { join } from 'node:path'

import {
  CATALOG_SCHEMA_VERSION,
  type Catalog,
  type RunnerCacheState,
  type Task,
} from '@osdlc/system-model/detect'
import { cacheDir } from '../src/cache.ts'
import { trustStore } from '@osdlc/trust-repo'

import {
  cursor,
  frame,
  handle,
  installQuitHandlers,
  recompute,
  refreshNote,
  state,
} from '../src/tui.ts'

function task(runner: string, name: string): Task {
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
  }
}

function catalog(names: string[]): Catalog {
  return {
    kind: 'catalog',
    schemaVersion: CATALOG_SCHEMA_VERSION,
    root: '/tmp/repo',
    generatedAt: new Date(0).toISOString(),
    discovery: 'walk',
    allowExec: false,
    reports: [
      {
        runner: 'make',
        status: 'ok',
        // `hint` is required, not decoration: the TUI's footer reads it to say
        // what each chain position selects, so a fixture without one would not
        // be a report this UI could actually render.
        chain: [
          { label: 'target', hint: 'The target name, as written at column 0 before the colon.' },
        ],
        tasks: names.map((n) => task('make', n)),
        // Required, and false is the correct value: make is a parse provider,
        // so it is never withheld because execution is off.
        skippedForExec: false,
        diagnostics: [],
      },
    ],
  }
}

beforeEach(() => {
  state.catalog = null
  state.cache = []
  state.query = ''
  state.runner = 'all'
  state.servicesOnly = false
  state.selectedId = null
  state.rows = []
  state.scroll = 0
})

describe('selection across a refresh', () => {
  test('survives rows being reordered and dropped underneath it', async () => {
    state.catalog = catalog(['build', 'lint', 'test'])
    recompute()
    state.selectedId = state.rows[2]!.task.id // "test"
    expect(cursor()).toBe(2)

    // The refresh lands: "build" is gone, and the survivors come back in a
    // different order. Nothing about the selected task changed, so the cursor
    // must still be on it — at a different index.
    state.catalog = catalog(['test', 'lint', 'ship'])
    recompute()

    expect(state.selectedId).toBe('make:test')
    expect(state.rows[cursor()]!.task.id).toBe('make:test')
    expect(cursor()).toBe(0)
  })

  test('re-anchors onto a real row when the selected task disappears', async () => {
    // The failure this prevents: a selection pointing past the end of the list,
    // where Enter runs nothing and the arrows appear stuck.
    state.catalog = catalog(['build', 'lint'])
    recompute()
    state.selectedId = 'make:build'

    state.catalog = catalog(['lint'])
    recompute()

    expect(state.selectedId).toBe('make:lint')
    expect(state.rows[cursor()]!.task.id).toBe('make:lint')
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
    // Nothing to report is not worth a line. A status that is always occupied
    // is a status nobody reads.
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

  test('stale and MEASURED slow reads differently, and louder', () => {
    // The case the cache exists for. It must not arrive in the same voice as a
    // 180ms refresh, or the one warning that matters is lost in the noise.
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

  test('with no refresh running it reports ages, not work nobody is doing', () => {
    const note = refreshNote([row({ state: 'stale', ageMs: 7_200_000, estimateMs: 100 })], false)
    expect(note).toEqual({ slow: false, text: 'cached rows: make 2h old — ^r to re-probe' })
  })
})

/**
 * The three states as the user actually reads them: line 3 of the frame, and
 * the runner tabs on line 1. A note that is correct but composed into the wrong
 * line, or a staleness mark that never reaches the tabs, would pass every
 * assertion above and still ship a screen that says nothing.
 */
describe('the rendered frame', () => {
  /** One line of the frame with the trailing clear-to-end-of-line stripped. */
  function lineOf(n: number): string {
    return frame(100, 24)
      .split('\r\n')
      [n]!.replace(/\x1b\[K$/, '')
  }

  // Derived, not written down: the clock is rendered in the runner's own locale
  // and time zone, so a literal here would pass on one machine and fail on the
  // next. What is under test is the line's composition, not the formatter.
  const clock = new Date(new Date(0).toISOString()).toLocaleTimeString()

  beforeEach(() => {
    state.catalog = catalog(['build', 'lint'])
    state.loading = false
    recompute()
  })

  test('fresh: the status line carries counts and a clock, and nothing else', () => {
    state.cache = [{ runner: 'make', state: 'fresh', estimateMs: null, slow: false }]
    expect(lineOf(2)).toBe(`2/2  checked ${clock}`)
    // No mark on the tab either: there is nothing about this runner to flag.
    expect(lineOf(0)).toContain(' make 2 ')
    expect(lineOf(0)).not.toContain('~make')
  })

  test('stale and refreshing: the rows are marked, and the note names the cost', () => {
    state.loading = true
    state.cache = [
      {
        runner: 'make',
        state: 'stale',
        reason: 'changed',
        ageMs: 120_000,
        estimateMs: 180,
        slow: false,
      },
    ]
    expect(lineOf(2)).toBe(`2/2  checked ${clock}  cached rows — re-probing make (~180ms)`)
    // Marked at the tab, not per row: one fact, said once, legible at a glance.
    expect(lineOf(0)).toContain(' ~make 2 ')
  })

  test('stale and MEASURED slow: an earlier, clearer warning than the ordinary one', () => {
    state.loading = true
    state.cache = [
      {
        runner: 'make',
        state: 'stale',
        reason: 'max-age',
        ageMs: 7_200_000,
        estimateMs: 6200,
        slow: true,
      },
    ]
    expect(lineOf(2)).toBe(
      `2/2  checked ${clock}  cached rows — make (~6.2s) is slow to probe here, so this takes a moment`,
    )
    expect(lineOf(0)).toContain(' ~make 2 ')
  })
})

/**
 * The entry line for a parameterised task.
 *
 * `state.entering` is the whole mechanism: while it is set, the frame trades
 * its key hints for a command line, and the key handler routes every keystroke
 * into it. What is asserted here is the half a user reads — that the line shows
 * the command that will run and the parameters it still wants.
 */
describe('the argument entry line', () => {
  function lineOf(n: number): string {
    return frame(100, 24)
      .split('\r\n')
      [n]!.replace(/\x1b\[K$/, '')
  }

  /** A recipe that declares parameters, which the shared fixture's tasks do not. */
  function parameterised(): Task {
    return {
      ...task('just', 'deploy'),
      argv: ['just', 'deploy'],
      display: 'just deploy <env> [tag]',
      parameters: [
        { name: 'env', required: true, variadic: false },
        { name: 'tag', required: false, variadic: false },
      ],
    }
  }

  beforeEach(() => {
    state.catalog = catalog(['build', 'lint'])
    state.loading = false
    state.cache = [{ runner: 'make', state: 'fresh', estimateMs: null, slow: false }]
    recompute()
  })

  test('without it, the last line is the key hints', () => {
    state.entering = null
    expect(lineOf(23)).toContain('enter run')
    expect(lineOf(23)).toContain('^y copy')
  })

  test('with it, the command and what has been typed are on one line', () => {
    state.entering = { task: parameterised(), text: 'staging' }
    // The prefix is the argv that will actually be spawned, never `display` —
    // display carries <placeholders>, which are not a command.
    expect(lineOf(22)).toContain('just deploy staging')
    expect(lineOf(22)).not.toContain('<env>')
  })

  test('the parameters it still wants are named under the line', () => {
    state.entering = { task: parameterised(), text: '' }
    const foot = lineOf(23)
    expect(foot).toContain('takes <env> [tag]')
    expect(foot).toContain('enter run')
    expect(foot).toContain('esc back')
  })

  test('the list gives up one row rather than the bottom line falling off', () => {
    // The entry costs two lines where the hints cost one. Without the matching
    // reserve the last line would render past the bottom of the terminal.
    state.entering = null
    const withHints = frame(100, 24).split('\r\n').length
    state.entering = { task: parameterised(), text: '' }
    expect(frame(100, 24).split('\r\n').length).toBe(withHints)
  })
})

/**
 * The two keys that reach disk.
 *
 * Both are fired through `handle`, the real key dispatcher, because both
 * defects they pin live at the call site rather than in the work it starts:
 * a promise chain with no rejection handler, and a re-probe handed to a
 * `refresh()` that drops it.
 */
describe('keys that reach disk', () => {
  const dirs: string[] = []
  afterAll(async () => {
    await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })))
  })

  async function temp(prefix: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), prefix))
    dirs.push(dir)
    return dir
  }

  /** A repository with one parse-only runner, plus an isolated trust store. */
  async function project(): Promise<{ root: string; home: string }> {
    const root = await temp('wayfinder-tui-')
    const home = await temp('wayfinder-tui-home-')
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ name: 'p', scripts: { build: 'echo b' } }),
      'utf-8',
    )
    return { root, home }
  }

  /** Poll until `done`, or give up — `handle` starts work it does not return. */
  async function settle(done: () => boolean): Promise<void> {
    for (let i = 0; i < 200 && !done(); i++) await sleep(10)
  }

  beforeEach(() => {
    state.message = ''
    state.settings = null
    state.entering = null
    state.confirmingTrust = false
    state.loading = false
    state.inFlight = null
    state.gate = null
    state.options = {}
    state.env = {}
    state.home = undefined
    state.store = ''
  })

  test('a broken config is reported on the status line, not thrown at nobody', async () => {
    // Without a rejection handler this is an unhandled rejection: the settings
    // screen never opens and the failure has nowhere to appear.
    const { root, home } = await project()
    await writeFile(join(root, 'wayfinder.config.json'), '{ not json', 'utf-8')
    state.root = root
    state.home = home

    handle(',')
    await settle(() => state.message !== '')

    expect(state.message).toContain('settings unavailable')
    expect(state.settings).toBeNull()
  })

  test('granting trust re-probes even with a probe already in flight', async () => {
    // The boot probe is still running when ^s y lands. The grant is worthless
    // unless the catalog is collected again with execution on.
    const { root, home } = await project()
    state.root = root
    state.home = home
    state.store = cacheDir({}, home)
    state.gate = {
      allowExec: false,
      trusted: false,
      reason: 'untrusted',
      configured: true,
      root,
      scopes: ['*'],
      missing: ['*'],
    }
    state.loading = true
    state.inFlight = new AbortController()
    state.confirmingTrust = true

    handle('y')
    await settle(() => state.catalog !== null)

    expect(state.catalog).not.toBeNull()
    expect(state.catalog?.allowExec).toBe(true)
  })

  test("the status line does not stick on 'trusted — re-probing'", async () => {
    // The other half of the same drop: the note that says work is happening
    // is cleared by the refresh, so a refresh that never ran leaves it up.
    const { root, home } = await project()
    state.root = root
    state.home = home
    state.store = cacheDir({}, home)
    state.gate = {
      allowExec: false,
      trusted: false,
      reason: 'untrusted',
      configured: true,
      root,
      scopes: ['*'],
      missing: ['*'],
    }
    state.loading = true
    state.inFlight = new AbortController()
    state.confirmingTrust = true

    handle('y')
    await settle(() => state.catalog !== null)

    expect(state.message).toBe('')
    expect(state.loading).toBe(false)
  })

  test('a policy-trusted root (no marker) reads as trusted in the settings screen', async () => {
    // `state.gate` is the CLI's already-resolved decision — cli.ts's own
    // `policyExecGate` call, which checks the marker store AND the user
    // file's trust.paths/trust.owners policy. The TUI must read `gate.trusted`
    // as-is and never re-derive it from the marker store alone, or a
    // policy-only grant (no marker ever written) would render as untrusted.
    const { root, home } = await project()
    state.root = root
    state.home = home
    state.store = cacheDir({}, home)
    state.gate = {
      allowExec: true,
      trusted: true,
      reason: 'allowed',
      configured: true,
      root,
      scopes: ['*'],
      missing: [],
    }
    state.catalog = catalog(['build'])
    recompute()

    handle(',')
    await settle(() => state.settings !== null)

    expect(state.settings).not.toBeNull()
    expect(state.settings!.join('\n')).toContain('trusted — runners may spawn probes')
    // Confirms the scenario is genuinely policy-only: nothing here ever wrote
    // a marker for this root.
    expect(await trustStore({ tool: 'wayfinder', env: {}, home }).isTrusted(root)).toBe(false)

    // `state` is a module singleton. Vitest gives each file its own module
    // graph, but the tests in THIS file share it — leaving the settings screen
    // open would make every later test's frame render the read-only settings
    // view instead of the task list.
    state.settings = null
  })
})

describe('tabs by group', () => {
  test('a bar separates the task runners from each synthesized group, named by the group', () => {
    const base = catalog(['lint'])
    const make = base.reports[0]!
    state.catalog = {
      ...base,
      reports: [
        make,
        { ...make, runner: 'package-manager', tasks: [task('package-manager', 'ci')] },
        { ...make, runner: 'hook-manager', tasks: [task('hook-manager', 'install')] },
      ],
    }
    recompute()
    const tabs = frame(100, 10).split('\n')[0]!
    expect(tabs).toContain(' make 1 │ dependencies 1 │ git hooks 1 ')
  })
})

describe('quitting', () => {
  /** Run `act` with `process.exit` stubbed; the exit code it was called with. */
  function exitCode(act: () => void): number | undefined {
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw Object.assign(new Error('exit'), { code })
    }) as typeof process.exit)
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    try {
      act()
      return undefined
    } catch (err) {
      return (err as { code?: number }).code
    } finally {
      exit.mockRestore()
      write.mockRestore()
    }
  }

  beforeEach(() => {
    state.entering = null
    state.settings = null
    state.confirmingTrust = false
  })

  test.each([
    ['^C', '\x03'],
    ['Esc', '\x1b'],
  ])('%s aborts the probe in flight and exits 0', (_, key) => {
    const probe = new AbortController()
    state.inFlight = probe
    expect(exitCode(() => handle(key))).toBe(0)
    expect(probe.signal.aborted).toBe(true)
  })

  test.each([
    ['SIGINT', 130],
    ['SIGTERM', 143],
    ['SIGHUP', 129],
  ] as const)('%s aborts the probe in flight and exits %i', (signal, code) => {
    const target = new EventEmitter()
    installQuitHandlers(target)
    const probe = new AbortController()
    state.inFlight = probe
    expect(exitCode(() => target.emit(signal))).toBe(code)
    expect(probe.signal.aborted).toBe(true)
  })
})
