/**
 * The terminal UI — browse every task in a repository, and run one.
 *
 * The affordance a browser cannot have: Enter RUNS the selected task, in this
 * shell, with the terminal handed to it. A web view can only ever offer you
 * something to paste.
 *
 * Dependency-free: raw mode, ANSI, and one frame string per keystroke. A TUI
 * toolkit would be a heavier dependency than the code it saves, and this has to
 * keep working from a checkout whose node_modules is the thing you are trying
 * to repair. The CLI routes its output through the `CliIo` seam so
 * `main()` is testable without touching a real stream, but this file writes
 * to `process.stdout` directly — owning the interactive terminal, raw mode,
 * the alternate screen, handing the terminal to a spawned task, is the whole
 * point of it, and that job is outside the seam by design.
 *
 * Collection is asynchronous, which is what most of the state machinery below
 * is for: keystrokes arrive mid-refresh, and a row can be stale.
 */

import { spawnRunner, streamRunner } from '@osdlc/command-seam'
import {
  tasks as allTasks,
  type Catalog,
  type ChainSegment,
  type Project,
  type RunnerCacheState,
  type Task,
} from '@osdlc/system-model/detect'
import { humanAge, humanMs } from '@osdlc/system-model/duration'
import { matchEntry, terms as splitTerms, type Mode } from '@osdlc/system-model/match'
import { paramShape } from '@osdlc/system-model/params'
import { trustStore, type ExecGate } from '@osdlc/trust-repo'

import { APP, BIN } from './app.ts'
import { runArgv, splitArgs } from './args.ts'
import { cacheDir } from './cache.ts'
import {
  collectAndCache,
  freshStates,
  fromStore,
  makeProject,
  orderedCatalog,
  readCachedCatalog,
  type WayOptions,
} from './catalog.ts'
import { TRUST_STORE_TOOL, loadConfig } from './config.ts'
import { groupOf, runnerLabel } from './groups.ts'

// ---------------------------------------------------------------- ansi

const ALT_ON = '\x1b[?1049h'
const ALT_OFF = '\x1b[?1049l'
const HIDE = '\x1b[?25l'
const SHOW = '\x1b[?25h'
const HOME = '\x1b[H'
const CLEAR_EOL = '\x1b[K'
const CLEAR_BELOW = '\x1b[J'

const COLOR = !process.env['NO_COLOR'] && process.stdout.isTTY
const sgr = (code: string) => (s: string) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : s)
const dim = sgr('2')
const bold = sgr('1')
const green = sgr('32')
const cyan = sgr('36')
const yellow = sgr('33')
const red = sgr('31')
const invert = sgr('7')
const hit = sgr('1;33')

/** A run of text plus how to paint it; length is measured before painting. */
interface Chunk {
  text: string
  paint?: ((s: string) => string) | undefined
}

/**
 * Compose chunks into one line of exactly `width` columns. Truncation happens
 * on the PLAIN text — measuring a string that already carries escape sequences
 * counts the escapes as columns and wraps the line.
 */
function line(chunks: Chunk[], width: number): string {
  let used = 0
  let out = ''
  for (const chunk of chunks) {
    if (used >= width) break
    let text = chunk.text
    if (used + text.length > width) text = text.slice(0, Math.max(0, width - used - 1)) + '…'
    used += text.length
    out += chunk.paint ? chunk.paint(text) : text
  }
  return out + CLEAR_EOL
}

// ---------------------------------------------------------------- state

const ALL = 'all'

export interface Row {
  task: Task
  score: number
  labelHits: number[] | null
}

interface State {
  catalog: Catalog | null
  /** The registered tools, built-ins plus any loaded. */
  project: Project
  root: string
  options: WayOptions
  /** `runners.order` from config; applied to every collected catalog. */
  runnerOrder: string[] | undefined
  /**
   * The trust store's environment and home, threaded from the CLI. Injectable
   * for the reason every sibling in this lane is: a test that let them default
   * would grant trust in the developer's own `~/.local/state/waypost/`. Nothing but
   * a test ever passes them.
   */
  env: Record<string, string | undefined> | undefined
  home: string | undefined
  /** Where stored probes live, resolved once from the injected env and home. */
  store: string
  /**
   * Where each runner's rows came from — one entry per selected provider.
   *
   * The boot sequence paints from the store before anything is probed, so a row
   * on screen may be an hour old. This is what says which, and it is cleared to
   * all-fresh the moment a real probe lands.
   */
  cache: RunnerCacheState[]
  runner: string
  query: string
  mode: Mode
  /** Show only services — tasks that run until you stop them. Toggled by ^t. */
  servicesOnly: boolean
  /** Selection is held by task id, not row index — see `refresh`. */
  selectedId: string | null
  scroll: number
  message: string
  loading: boolean
  /**
   * Why execution came out the way it did, resolved once by the CLI. Only
   * `"untrusted"` earns the ^s affordance: when a config file turned execution
   * off, trusting the repository would change nothing, and offering it would be
   * a wrong instruction.
   */
  gate: ExecGate | null
  /**
   * True once ^s has asked and is waiting for `y`. Trust permits this
   * repository's code to run, so it cannot be granted by one keystroke —
   * least of all ^s, which is flow control on many terminals and arrives
   * unintentionally. The second key is what makes it a decision.
   */
  confirmingTrust: boolean
  /**
   * The task whose arguments are being typed, and what has been typed so far.
   *
   * Non-null only for a task that declares parameters: `argv` omits them, so
   * running one straight off Enter spawns `just deploy` with no environment
   * and the terminal is gone before anything can say so. Null is the ordinary
   * case and costs an unparameterised task nothing — Enter still runs it.
   */
  entering: { task: Task; text: string } | null
  /**
   * The settings screen's rendered lines, or null when it is closed.
   *
   * Rendered once on open rather than on every frame: it reads the config
   * from disk, which is IO, and a screen that re-read it per keystroke would
   * be doing that for a view nothing can change from here.
   */
  settings: string[] | null
  /** Bumped per refresh so a superseded result cannot overwrite a newer one. */
  generation: number
  inFlight: AbortController | null
  rows: Row[]
}

/**
 * The module singleton.
 *
 * Exported for one reason: `runTui` owns a real terminal and never returns, so
 * the selection rule — the thing that must survive a refresh reordering and
 * dropping rows underneath the cursor — is only testable through this and
 * { recompute}. Nothing outside a test writes to it.
 */
export const state: State = {
  catalog: null,
  project: makeProject(),
  root: process.cwd(),
  options: {},
  runnerOrder: undefined,
  env: undefined,
  home: undefined,
  store: '',
  cache: [],
  runner: ALL,
  query: '',
  mode: 'fuzzy',
  servicesOnly: false,
  selectedId: null,
  scroll: 0,
  message: '',
  loading: false,
  gate: null,
  confirmingTrust: false,
  entering: null,
  settings: null,
  generation: 0,
  inFlight: null,
  rows: [],
}

function reportFor(runner: string) {
  return state.catalog?.reports.find((r) => r.runner === runner)
}

/** How many runners went uncollected for want of trust; 0 when trust is not the reason. */
function withheldForTrust(): number {
  if (state.gate?.reason !== 'untrusted') return 0
  return state.catalog?.reports.filter((r) => r.skippedForExec).length ?? 0
}

function tabs(): string[] {
  return [ALL, ...(state.catalog?.reports ?? []).map((r) => r.runner)]
}

/** The cache verdict for one runner, or undefined when nothing describes it. */
function cacheFor(runner: string): RunnerCacheState | undefined {
  return state.cache.find((c) => c.runner === runner)
}

/** Every runner whose rows on screen came out of the store and are out of date. */
function staleRunners(): RunnerCacheState[] {
  return state.cache.filter((c) => c.state === 'stale')
}

/**
 * What the status line says about the rows on screen, in three states.
 *
 * Fresh says NOTHING: a line that is always there is a line nobody reads, and
 * there is nothing here to report.
 *
 * Stale-and-slow is separated from ordinary stale because it is the case the
 * whole cache exists for. A runner this repository has MEASURED at several
 * seconds is why the screen would otherwise have been empty, and telling the
 * user "a moment" in the same voice as a 200ms refresh would waste the one
 * warning that matters. Slow is measured, never declared — a runner that is
 * quick here is not called slow because it is slow elsewhere.
 */
export function refreshNote(
  rows: readonly RunnerCacheState[],
  loading: boolean,
): { text: string; slow: boolean } | null {
  const stale = rows.filter((r) => r.state === 'stale')
  if (stale.length === 0) return null

  const named = (r: RunnerCacheState): string =>
    r.estimateMs === null
      ? `${r.runner} (never timed here)`
      : `${r.runner} (~${humanMs(r.estimateMs)})`
  const slow = stale.filter((r) => r.slow)

  if (!loading) {
    // The refresh is over and these rows are still what the store held: it
    // failed, or it has not been asked for yet. Saying "re-probing" would
    // describe work nobody is doing.
    return {
      slow: slow.length > 0,
      text: `cached rows: ${stale.map((r) => `${r.runner} ${humanAge(r.ageMs)}`).join(', ')} — ^r to re-probe`,
    }
  }
  if (slow.length > 0) {
    const rest = stale.filter((r) => !slow.includes(r))
    return {
      slow: true,
      text:
        `cached rows — ${slow.map(named).join(', ')} ` +
        `${slow.length === 1 ? 'is' : 'are'} slow to probe here, so this takes a moment` +
        (rest.length > 0 ? `; also re-probing ${rest.map(named).join(', ')}` : ''),
    }
  }
  return { slow: false, text: `cached rows — re-probing ${stale.map(named).join(', ')}` }
}

function chainOf(runner: string): ChainSegment[] {
  return reportFor(runner)?.chain ?? []
}

function inScope(): Task[] {
  const catalog = state.catalog
  if (catalog === null) return []
  return state.runner === ALL ? allTasks(catalog) : (reportFor(state.runner)?.tasks ?? [])
}

function visibleRows(): Row[] {
  const queryTerms = splitTerms(state.query)
  const rows: Row[] = []
  for (const task of inScope()) {
    if (state.servicesOnly && !task.persistent.value) continue
    if (queryTerms.length === 0) {
      rows.push({ task, score: 0, labelHits: null })
      continue
    }
    const m = matchEntry(task, queryTerms, state.mode)
    if (m) rows.push({ task, score: m.score, labelHits: m.labelHits })
  }
  if (queryTerms.length) rows.sort((a, b) => b.score - a.score)
  return rows
}

/** Index of the selected task, or 0 when its id is no longer present. */
export function cursor(): number {
  if (state.selectedId === null) return 0
  const at = state.rows.findIndex((r) => r.task.id === state.selectedId)
  return at === -1 ? 0 : at
}

function select(index: number): void {
  const clamped = Math.max(0, Math.min(index, state.rows.length - 1))
  state.selectedId = state.rows[clamped]?.task.id ?? null
}

// ---------------------------------------------------------------- render

/** The chain, dimmed except for the leaf, with matched characters picked out. */
function chainChunks(row: Row): Chunk[] {
  const { path } = row.task
  const marks = new Set(row.labelHits ?? [])
  const chunks: Chunk[] = []
  let at = 0
  for (let p = 0; p < path.length; p++) {
    const leaf = p === path.length - 1
    let run = ''
    let marked = marks.has(at)
    for (const ch of path[p]!) {
      const on = marks.has(at)
      if (on !== marked) {
        chunks.push({ text: run, paint: marked ? hit : leaf ? bold : dim })
        run = ''
        marked = on
      }
      run += ch
      at++
    }
    if (run) chunks.push({ text: run, paint: marked ? hit : leaf ? bold : dim })
    if (!leaf) {
      chunks.push({ text: ' > ', paint: dim })
      at++ // the " " the label was joined on
    }
  }
  return chunks
}

/**
 * The whole screen as one string.
 *
 * Exported alongside {@link state} and {@link recompute} so the three cache
 * states can be asserted as RENDERED lines rather than as the helper that feeds
 * them — the status line is the surface a user reads, and a note that is
 * correct but composed into the wrong line helps nobody.
 */
export function frame(width: number, height: number): string {
  const out: string[] = []
  const total = inScope().length
  const at = cursor()

  // 1. tabs
  const tabChunks: Chunk[] = []
  for (const name of tabs()) {
    const count =
      name === ALL
        ? (state.catalog?.reports ?? []).reduce((n, r) => n + r.tasks.length, 0)
        : (reportFor(name)?.tasks.length ?? 0)
    // Marked at the TAB, not per row: the whole runner's rows are as old as
    // each other, so a per-row mark would repeat one fact hundreds of times and
    // the row renderer would have to know about the cache. A leading `~` reads
    // as "about" at a glance and survives NO_COLOR.
    const stale = name === ALL ? staleRunners().length > 0 : cacheFor(name)?.state === 'stale'
    // A bar between groups: tasks, then dependencies, tools and git hooks.
    const prev = tabs()[tabs().indexOf(name) - 1]
    if (name !== ALL && prev !== undefined && prev !== ALL && groupOf(prev) !== groupOf(name)) {
      tabChunks.push({ text: '│', paint: dim })
    }
    const label = name === ALL ? ALL : runnerLabel(name)
    tabChunks.push({
      text: ` ${stale ? '~' : ''}${label} ${count} `,
      paint: name === state.runner ? invert : stale ? yellow : dim,
    })
  }
  const flags = `${state.mode}${state.servicesOnly ? ' services' : ''}${state.catalog?.allowExec ? ' exec' : ''}`
  const used = tabChunks.reduce((n, c) => n + c.text.length, 0)
  tabChunks.push({ text: ' '.repeat(Math.max(1, width - used - flags.length - 1)) })
  tabChunks.push({ text: flags, paint: dim })
  out.push(line(tabChunks, width))

  // 2. query
  out.push(
    line([{ text: '> ', paint: cyan }, { text: state.query }, { text: '█', paint: cyan }], width),
  )

  // 3. counts, clock, transient message, probe failures
  out.push(
    line(
      [
        { text: `${state.rows.length}/${total}`, paint: dim },
        {
          text: state.catalog
            ? `  checked ${new Date(state.catalog.generatedAt).toLocaleTimeString()}`
            : '  collecting',
          paint: dim,
        },
        ...(state.loading && refreshNote(state.cache, true) === null
          ? [{ text: '  refreshing', paint: yellow }]
          : []),
        // The cache's three states. Fresh returns null and says nothing;
        // stale-and-slow paints red so it does not read like the ordinary
        // refresh note beside it.
        ...(() => {
          const note = refreshNote(state.cache, state.loading)
          return note === null ? [] : [{ text: `  ${note.text}`, paint: note.slow ? red : yellow }]
        })(),
        ...(state.message ? [{ text: `  ${state.message}`, paint: yellow }] : []),
        // A note beside the counts, not a modal: you may well have come here to
        // look at what is already collected and run nothing.
        ...(state.confirmingTrust
          ? [{ text: '  trust this repository? y/n', paint: yellow }]
          : withheldForTrust() > 0
            ? [
                {
                  text: `  ${withheldForTrust()} hidden — repo not trusted (^s to trust)`,
                  paint: yellow,
                },
              ]
            : []),
        ...(state.catalog?.reports ?? [])
          .filter((r) => r.status === 'error')
          .map((r) => ({ text: `  ${r.runner} failed`, paint: red })),
      ],
      width,
    ),
  )

  // 4a. the settings screen, which REPLACES the list while it is open. It is
  // a different view of the same repository rather than an overlay on this
  // one, so nothing below it renders.
  if (state.settings !== null) {
    const room = Math.max(1, height - out.length - 2)
    for (let i = 0; i < room; i++) {
      const text = state.settings[i]
      out.push(
        text === undefined
          ? CLEAR_EOL
          : line([{ text, paint: text.startsWith('  ') ? undefined : bold }], width),
      )
    }
    out.push(line([{ text: '─'.repeat(width) }], width))
    out.push(
      line(
        [{ text: `reading only — edit with \`${BIN} config set\`    esc back`, paint: dim }],
        width,
      ),
    )
    return HOME + out.join('\r\n') + CLEAR_BELOW
  }

  // 4. the list, sized by what the chrome leaves. The entry line costs one
  // more row than the key hints it replaces, so the list gives one up while
  // arguments are being typed rather than the bottom line falling off screen.
  const listHeight = Math.max(1, height - out.length - (state.entering ? 5 : 4))
  clampScroll(at, listHeight)
  for (let i = 0; i < listHeight; i++) {
    const row = state.rows[state.scroll + i]
    if (!row) {
      out.push(CLEAR_EOL)
      continue
    }
    out.push(
      line(
        [
          { text: state.scroll + i === at ? '> ' : '  ', paint: cyan },
          { text: row.task.persistent.value ? '* ' : '  ', paint: green },
          ...chainChunks(row),
        ],
        width,
      ),
    )
  }

  // 5. what Enter would run — always on screen, so it is never a surprise
  const current = state.rows[at]
  out.push(line([{ text: '-'.repeat(width), paint: dim }], width))
  if (current) {
    const shape = chainOf(current.task.runner)
      .map((c) => c.label)
      .join(' > ')
    const gap = width - current.task.display.length - shape.length - 1
    out.push(
      line(
        gap >= 3
          ? [
              { text: current.task.display, paint: bold },
              { text: ' '.repeat(gap) },
              { text: shape, paint: dim },
            ]
          : [{ text: current.task.display, paint: bold }],
        width,
      ),
    )
    out.push(line([{ text: current.task.doc ?? current.task.detail ?? '', paint: dim }], width))
  } else {
    out.push(line([{ text: state.query ? 'no match' : 'nothing collected', paint: dim }], width))
    out.push(line([], width))
  }

  // 6. keys — or, while arguments are being typed, the entry line in their
  // place. It replaces the key hints rather than sitting above them because
  // the keys that matter while typing are the two this line names, and a
  // second row would push the list up mid-task.
  if (state.entering) {
    const { task, text } = state.entering
    const shape = paramShape(task.parameters)
    out.push(
      line(
        [
          { text: '$ ', paint: dim },
          { text: task.argv.join(' ') + ' ', paint: bold },
          { text },
          { text: '█', paint: cyan },
        ],
        width,
      ),
    )
    out.push(line([{ text: `  takes ${shape}    enter run  esc back`, paint: dim }], width))
  } else {
    out.push(
      line(
        [
          {
            text: 'enter run  ^y copy  tab runner  ^e exact  ^t services  ^s trust  ^r refresh  , settings  esc quit',
            paint: dim,
          },
        ],
        width,
      ),
    )
  }

  return HOME + out.join('\r\n') + CLEAR_BELOW
}

function clampScroll(at: number, listHeight: number): void {
  if (at < state.scroll) state.scroll = at
  if (at >= state.scroll + listHeight) state.scroll = at - listHeight + 1
  if (state.scroll < 0) state.scroll = 0
}

/**
 * Rebuild the visible rows and re-anchor the selection onto a task that is
 * still there.
 *
 * Split out of {@link draw} so it can be exercised without a terminal. It is
 * the whole reason selection is held by task id: a refresh reorders rows and
 * drops some of them, and an index would silently point at a different task —
 * which is the same keystroke running the wrong command.
 */
export function recompute(): void {
  state.rows = visibleRows()
  if (state.selectedId !== null && !state.rows.some((r) => r.task.id === state.selectedId)) {
    state.selectedId = state.rows[0]?.task.id ?? null
  }
}

function draw(): void {
  recompute()
  process.stdout.write(frame(process.stdout.columns || 100, process.stdout.rows || 30))
}

/**
 * The settings screen, as text — the same four sections the page shows, in the
 * config schema's own key order, so the two surfaces describe a project the
 * same way.
 *
 * READ ONLY, and it says so on screen. The page can edit because it has a
 * server to POST to and a pointer to click with; giving the terminal the same
 * would mean an input mode per field, which is a larger thing than showing
 * someone what their configuration is. `way config set` is the editor
 * this line points at.
 */
async function settingsLines(): Promise<string[]> {
  const loaded = await loadConfig(state.root, state.env, state.home)
  const where = (key: string): string => {
    const layer = loaded.sources.get(key) ?? 'default'
    return layer === 'project' ? 'this project' : layer === 'user' ? 'your user config' : 'default'
  }
  const runners = (loaded.effective.runners ?? {}) as { disabled?: string[]; order?: string[] }
  const disabled = new Set(runners.disabled ?? [])
  const known = [
    ...new Set([...(state.catalog?.reports ?? []).map((r) => r.runner), ...disabled]),
  ].sort()

  const out: string[] = []
  out.push(`RUNNERS  (${where('runners.disabled')})`)
  if (known.length === 0) out.push('  no runners detected')
  for (const name of known) {
    out.push(
      `  ${disabled.has(name) ? '[ ]' : '[x]'} ${name}${disabled.has(name) ? '   not collected' : ''}`,
    )
  }
  const order = runners.order ?? []
  out.push(
    `  order: ${order.length === 0 ? 'alphabetical' : order.join(' ')}  (${where('runners.order')})`,
  )
  out.push('')

  out.push(`EXECUTION  (trust store)`)
  out.push(
    state.gate?.trusted === true
      ? '  trusted — runners may spawn probes'
      : withheldForTrust() > 0
        ? '  not trusted — runners that must be run to be read were skipped (^s to trust)'
        : '  execution is off for this project',
  )
  out.push(`  allowExec: ${String(loaded.effective.allowExec === true)}  (${where('allowExec')})`)
  out.push('  a project file can only turn execution OFF; turning it on is the trust grant')
  out.push('')

  out.push(`DISCOVERY  (${where('discovery')})`)
  out.push(`  ${String(loaded.effective.discovery)}`)
  out.push('')

  out.push(`EXCLUDED PATHS  (${where('excludePaths')})`)
  const excluded = loaded.effective.excludePaths ?? []
  if (excluded.length === 0) out.push('  none')
  for (const path of excluded) out.push(`  ${path}`)
  out.push('')

  out.push(`file: ${loaded.locations.project}`)
  for (const warning of loaded.warnings) out.push(`warning: ${warning}`)
  return out
}

// ---------------------------------------------------------------- actions

/**
 * Put a task's command on the clipboard.
 *
 * What is copied is not always `display`. A task bound to its own directory
 * gets the `cd` that makes it run, quoted where the directory needs it -
 * without it the paste fails. Enter is unaffected: `runAndExit` spawns with
 * the directory already. The web page's copy buttons apply the same rule
 * (`copyText` in web/view.ts).
 */
function copy(task: Task): boolean {
  const dir = /^[\w.\-/@+]+$/.test(task.cwd) ? task.cwd : `'${task.cwd.replace(/'/g, "'\\''")}'`
  const text = task.cwd === '.' ? task.display : `cd ${dir} && ${task.display}`
  const bin = process.platform === 'darwin' ? 'pbcopy' : 'xclip'
  const args = process.platform === 'darwin' ? [] : ['-selection', 'clipboard']
  const res = spawnRunner(bin).run(args, { input: text, cwd: state.root })
  return res.exitCode === 0
}

let restored = false

/** Idempotent: both `runAndExit` and the exit hook call it. */
function restoreTerminal(): void {
  if (restored) return
  restored = true
  if (process.stdin.isTTY) process.stdin.setRawMode(false)
  process.stdout.write(SHOW + ALT_OFF)
}

/**
 * Hand the terminal to the selected task and take this process out of the way.
 * It streams through the command seam, so the task owns the terminal while it
 * runs.
 *
 * `argv` is spawned WITHOUT a shell. `display` would be wrong to run — for a
 * parameterised recipe it carries `<placeholders>`, which a shell reads as
 * redirections.
 */
function runAndExit(task: Task, args: readonly string[] = []): never {
  // Abandon any in-flight probe before the terminal changes hands.
  state.inFlight?.abort()
  restoreTerminal()

  // Echo what actually RAN, not `display` — for a parameterised task those
  // differ, and printing the placeholder form above a command that did not
  // include it would be a lie about what just happened.
  let argv: string[]
  try {
    argv = runArgv(state.project, task, args)
  } catch (err) {
    process.stderr.write(`${APP}: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  }
  process.stdout.write(`${dim('$')} ${bold(argv.join(' '))}\n`)
  // The shape is worth repeating only when it went unanswered: a task run
  // WITH its arguments has just shown them on the line above, and naming the
  // placeholders again would read as a complaint about a command that was
  // complete.
  if (task.parameters.length > 0 && args.length === 0) {
    process.stdout.write(`${dim(`  takes ${paramShape(task.parameters)}`)}\n`)
  }

  const [binary, ...rest] = argv
  const res = streamRunner(binary!).run(rest, {
    cwd: task.cwd === '.' ? state.root : `${state.root}/${task.cwd}`,
    quiet: true,
  })
  // A spawn that never started at all — no such binary, no such directory. The
  // row may simply have been wrong: it came out of the store, and the task it
  // named can have been renamed or deleted since. Naming the staleness turns an
  // unexplained failure into one the user can act on.
  if (res.reason === 'spawn') {
    process.stderr.write(`${APP}: ${binary}: ${res.error ?? 'could not start'}\n`)
    const from = cacheFor(task.runner)
    if (from !== undefined && from.state === 'stale') {
      process.stderr.write(
        `${APP}: that row came from a cached listing of ${task.runner} taken ${humanAge(from.ageMs)}` +
          ` — the task may no longer exist; start ${BIN} again to re-probe\n`,
      )
    }
  }
  process.exit(res.exitCode)
}

/**
 * Re-probe. Guarded three ways, all of which the synchronous version got for
 * free: a single in-flight probe, a generation token so a superseded result is
 * discarded, and an abort signal so an abandoned one stops working.
 */
async function refresh(): Promise<void> {
  if (state.loading) return
  const generation = ++state.generation
  const controller = new AbortController()
  state.inFlight = controller
  state.loading = true
  state.message = ''
  draw()

  try {
    // ALWAYS a real probe, never a cache read — ^r means "ask again", and a
    // refresh that could answer from the store would make the one key that
    // guarantees accuracy indistinguishable from doing nothing. It writes the
    // store on the way out, so the next start still paints instantly.
    const collected = await collectAndCache(
      state.project,
      state.root,
      { ...state.options, signal: controller.signal },
      state.store,
    )
    if (generation !== state.generation) return // a newer refresh won
    state.catalog = orderedCatalog(collected, state.runnerOrder)
    // Everything on screen was measured just now, so nothing is stale.
    state.cache = freshStates(collected)
  } catch (err) {
    if (generation === state.generation) {
      state.message = `refresh failed: ${err instanceof Error ? err.message : String(err)}`
    }
  } finally {
    if (generation === state.generation) {
      state.loading = false
      state.inFlight = null
    }
  }
}

/**
 * Grant trust, then re-probe in place so the runners appear where the note was.
 *
 * The hint is dropped at the same time: it tells the user to trust the
 * repository, which they just did, and a catalog carrying it after the fact
 * would be instructing them to repeat themselves.
 */
async function grantTrust(): Promise<void> {
  try {
    await trustStore({
      tool: TRUST_STORE_TOOL,
      ...(state.env !== undefined ? { env: state.env } : {}),
      ...(state.home !== undefined ? { home: state.home } : {}),
    }).trust(state.root)
  } catch (err) {
    // Never silent: the keystroke did something, and if it failed the user has
    // to know the runners are still hidden for a reason they can act on.
    state.message = `trust failed: ${err instanceof Error ? err.message : String(err)}`
    return
  }
  const { execWithheldHint: _dropped, ...rest } = state.options
  state.options = { ...rest, allowExec: true }
  if (state.gate) state.gate = { ...state.gate, allowExec: true, trusted: true, reason: 'allowed' }
  state.message = 'trusted — re-probing'
  // A probe started before the grant was collected under the old gate, and
  // `refresh` drops a request while one is running — so the grant would be
  // announced and never acted on. Abandon that probe first; `refresh` bumps
  // the generation synchronously, so the abandoned one cannot come back and
  // overwrite the new result or its bookkeeping.
  state.inFlight?.abort()
  state.inFlight = null
  state.loading = false
  await refresh()
}

function cycleRunner(step: number): void {
  const names = tabs()
  const at = names.indexOf(state.runner)
  state.runner = names[(at + step + names.length) % names.length]!
  state.selectedId = null
  state.scroll = 0
}

// ---------------------------------------------------------------- input

/**
 * One keystroke.
 *
 * Exported for the same reason `state` is: `runTui` owns a real terminal and
 * never returns, so the keys that reach disk — settings, trust — are only
 * reachable from a test through this.
 */
export function handle(key: string): void {
  const listHeight = Math.max(1, (process.stdout.rows || 30) - 7)
  const move = (n: number) => {
    select(cursor() + n)
    state.message = ''
  }

  // The armed prompt owns the keyboard for exactly one keystroke. `y` grants;
  // anything else cancels and is swallowed, so the key that cancelled cannot
  // also do its usual job in the same breath.
  if (state.confirmingTrust) {
    state.confirmingTrust = false
    state.message = ''
    if (key === 'y' || key === 'Y') void grantTrust().finally(draw)
    return
  }

  // The settings screen owns the keyboard while it is open, for the same
  // reason the entry line does: the keys below act on a list that is not on
  // screen.
  if (state.settings !== null) {
    if (key === '\x1b' || key === '\x03' || key === ',' || key === 'q') state.settings = null
    return
  }

  // Typing arguments owns the keyboard: every key is text or one of the two
  // that end it. Placed before the switch so ^y, tab and the arrows cannot
  // act on a list the user is no longer looking at.
  if (state.entering) {
    const entering = state.entering
    if (key === '\x1b' || key === '\x03') {
      state.entering = null
      return
    }
    if (key === '\r' || key === '\n') {
      state.entering = null
      runAndExit(entering.task, splitArgs(entering.text))
      return
    }
    if (key === '\x7f' || key === '\x08') {
      entering.text = entering.text.slice(0, -1)
      return
    }
    if (key === '\x15') {
      entering.text = ''
      return
    } // ctrl-u
    if (key.length >= 1 && key >= ' ' && !key.startsWith('\x1b')) entering.text += key
    return
  }

  switch (key) {
    case '\x03': // ctrl-c
    case '\x1b': // esc
      restoreTerminal()
      process.exit(0)
      break
    case '\r':
    case '\n': {
      const row = state.rows[cursor()]
      if (!row) break
      // A parameterised recipe collects its arguments first. Running it here
      // would spawn the command without them and hand over the terminal, so
      // the mistake could not even be reported.
      if (row.task.parameters.length > 0) state.entering = { task: row.task, text: '' }
      else runAndExit(row.task)
      break
    }
    case '\x19': {
      // ctrl-y
      const row = state.rows[cursor()]
      state.message = row ? (copy(row.task) ? 'copied' : 'clipboard unavailable') : ''
      break
    }
    case '\x05': // ctrl-e
      state.mode = state.mode === 'fuzzy' ? 'exact' : 'fuzzy'
      state.selectedId = null
      break
    case '\x14': // ctrl-t
      state.servicesOnly = !state.servicesOnly
      state.selectedId = null
      break
    case ',':
      // Loaded on open, not on every frame — it is a disk read. A disk read
      // fails: an unparseable config throws, and without the catch that is an
      // unhandled rejection instead of a line the user can act on.
      void settingsLines()
        .then((lines) => {
          state.settings = lines
        })
        .catch((err: unknown) => {
          state.message = `settings unavailable: ${err instanceof Error ? err.message : String(err)}`
        })
        .finally(draw)
      break
    case '\x12': // ctrl-r
      void refresh().finally(draw)
      break
    case '\x13': // ctrl-s
      // Arms the question; `y` answers it. Nothing is written here.
      if (withheldForTrust() > 0) state.confirmingTrust = true
      else state.message = 'nothing is withheld'
      break
    case '\t':
      cycleRunner(1)
      break
    case '\x1b[Z': // shift-tab
      cycleRunner(-1)
      break
    case '\x1b[A':
    case '\x10':
      move(-1)
      break
    case '\x1b[B':
    case '\x0e':
      move(1)
      break
    case '\x1b[5~':
      move(-listHeight)
      break
    case '\x1b[6~':
      move(listHeight)
      break
    case '\x1b[H':
    case '\x01':
      select(0)
      break
    case '\x1b[F':
      select(state.rows.length - 1)
      break
    case '\x7f':
    case '\x08':
      state.query = state.query.slice(0, -1)
      state.selectedId = null
      break
    case '\x15': // ctrl-u
      state.query = ''
      state.selectedId = null
      break
    default:
      if (key.length >= 1 && key >= ' ' && !key.startsWith('\x1b')) {
        state.query += key
        state.selectedId = null
      }
  }
}

// ---------------------------------------------------------------- boot

/**
 * `gate` is the CLI's already-resolved trust decision. The TUI needs it, not
 * just the boolean it produced, because "no exec because a file said so" and
 * "no exec because this repository is not trusted" call for different offers —
 * only the second one has an action a keystroke can take.
 */
export interface TuiOptions {
  project: Project
  root: string
  options: WayOptions
  runnerOrder?: string[] | undefined
  gate?: ExecGate | undefined
  env?: Record<string, string | undefined> | undefined
  home?: string | undefined
}

export async function runTui({
  project,
  root,
  options,
  runnerOrder,
  gate,
  env,
  home,
}: TuiOptions): Promise<number> {
  if (!process.stdin.isTTY) {
    process.stderr.write(
      `${APP}: the terminal UI needs a TTY; use --serve for the page, or --json for data.\n`,
    )
    return 2
  }

  state.project = project
  state.root = root
  state.options = options
  state.runnerOrder = runnerOrder
  state.gate = gate ?? null
  state.env = env
  state.home = home
  state.store = cacheDir(env, home)

  process.stdout.write(ALT_ON + HIDE)
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.setEncoding('utf8')

  process.on('exit', restoreTerminal)
  process.on('SIGINT', () => {
    restoreTerminal()
    process.exit(0)
  })
  process.stdout.on('resize', draw)

  process.stdin.on('data', (chunk: string) => {
    // A paste or a fast key repeat arrives as one chunk; escape sequences must
    // stay whole, so split on ESC rather than per character.
    for (const key of chunk.split(/(?=\x1b)/)) {
      if (key.startsWith('\x1b') || key.length === 1) handle(key)
      else for (const ch of key) handle(ch)
    }
    draw()
  })

  // Stale-then-refresh. The first paint costs a few file hashes rather than a
  // full probe, so a repository whose slowest runner takes seconds shows its
  // tasks at once — marked as cached — instead of an empty frame. The probe
  // then lands underneath and the rows update in place.
  const stored = await readCachedCatalog(project, root, options, state.store)
  // Only painted when something came OUT of the store: with execution off, a
  // cold store still yields withheld reports, an empty list posing as an answer.
  if (stored.catalog !== null && fromStore(stored)) {
    state.catalog = orderedCatalog(stored.catalog, runnerOrder)
    state.cache = stored.runners
  }
  draw()
  await refresh()
  draw()

  // The stdin handler drives everything from here; this promise never settles,
  // because every exit path calls `process.exit`.
  return new Promise<number>(() => {})
}
