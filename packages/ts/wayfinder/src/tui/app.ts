/**
 * The terminal UI as an object: its state, the frame it draws and the keys it
 * answers. `createTui` makes one over a {@link Session} and a {@link TuiHost};
 * `runTui` in `./index.ts` gives it a real terminal. Tests give it a fake
 * host, so every key and every frame can be checked without a terminal.
 *
 * Collection is async, which is what much of the state handling is for: keys
 * arrive during a refresh, and a row can be stale.
 */

import type { Catalog, ChainSegment, RunnerCacheState, Task } from '@osdlc/system-model/detect'
import { humanAge, humanMs } from '@osdlc/system-model/duration'
import type { Mode } from '@osdlc/system-model/match'
import { paramShape } from '@osdlc/system-model/params'
import { fitWidth } from '@osdlc/ux'

import { BIN } from '../app.ts'
import { splitArgs } from '../args.ts'
import { fromStore, orderedCatalog, readCachedCatalog } from '../catalog.ts'
import { collectOptionsFromConfig, readSettings, writeSetting, type Settings } from '../config.ts'
import type { TaskHit } from '../core/filter.ts'
import type { HandOffResult } from '../core/run.ts'
import { SessionError, type CacheState, type RunPlan, type Session } from '../core/session.ts'
import { skillLine, type SkillHit, type SkillRow } from '../core/skills.ts'
import { groupOf, SKILLS_GROUP } from '../groups.ts'
import { footerHints, keyLines, keysFor } from '../keys.ts'
import { terminalSafe } from '../terminal-text.ts'
import {
  countRunners,
  displayPath,
  parametersUnknownLabel,
  probeTimeLabel,
  runnerLabel,
  withheldLabel,
} from '../vocabulary.ts'
import { copyText } from './copy.ts'
import { isText, namedKey, splitKeys } from './keys-input.ts'
import {
  cycleDiscovery,
  editPaths,
  execOffCause,
  moveRunner,
  settingsLines,
  toggleRunner,
  type SettingsEdit,
  type SettingsFacts,
  type SettingsItem,
  type SettingsLine,
  type WithheldRunner,
} from './settings.ts'
import { CLEAR_EOL, chunksWidth, line, type Chunk, type Styles } from './style.ts'

/** What the terminal UI needs from the terminal it runs in. */
export interface TuiHost {
  /** Write to the screen. */
  write(text: string): void
  columns(): number
  rows(): number
  platform: NodeJS.Platform
  /** Put text on the clipboard; true when a program took it. */
  clipboard(text: string): Promise<boolean>
  /** Give the terminal back: leave raw mode and the alternate screen. Idempotent. */
  release(): void
  /** Run a task with the terminal, after {@link release}. */
  handOff(plan: RunPlan): HandOffResult
  /** End the process. The real host never returns. */
  exit(code: number): void
}

/** A line of feedback on the status line. */
export interface Message {
  text: string
  tone: 'note' | 'warning' | 'error'
}

/** The scopes `^o` cycles through, as the web view's Scope buttons. */
export const SCOPES: readonly { label: string; maxDepth: number | undefined }[] = [
  { label: 'all', maxDepth: undefined },
  { label: 'root', maxDepth: 0 },
  { label: '+2', maxDepth: 2 },
  { label: '+3', maxDepth: 3 },
]

/** The settings screen while it is open. */
export interface SettingsScreen {
  settings: Settings
  /**
   * The item the cursor is on. Held by item, not line, because an edit and
   * the probe after it change the lines above it.
   */
  at: SettingsItem | null
  /** The cursor's last line, to fall back near when its item is gone. */
  hint: number
  scroll: number
  /** The excluded path being typed, or null. */
  adding: string | null
}

/** The `all` tab. */
export const ALL = 'all'

/**
 * The Skills tab. Its rows are agent skills, not a runner's tasks. The `#`
 * keeps it apart from any runner id.
 */
export const SKILLS_TAB = `#${SKILLS_GROUP.id}`

/** A row of the list: a task, or an agent skill. */
export type ListEntry = { task: TaskHit; skill?: undefined } | { skill: SkillHit; task?: undefined }

/** Everything the screen shows. */
export interface TuiState {
  catalog: Catalog | null
  /** Where each runner's rows came from, one entry per selected runner. */
  cache: CacheState[]
  /** The agent skills from the last probe. */
  skills: SkillRow[]
  /** `runners.order`, applied to every catalog. */
  runnerOrder: string[] | undefined
  /** True once a probe has finished, so an empty list is an answer. */
  probed: boolean
  /** The selected tab: `all`, a runner id or {@link SKILLS_TAB}. */
  runner: string
  query: string
  mode: Mode
  servicesOnly: boolean
  declaredOnly: boolean
  /** Index into {@link SCOPES}. */
  scope: number
  /** Held by task or skill id, not row index, so a refresh cannot move it to another row. */
  selectedId: string | null
  scroll: number
  message: Message | null
  loading: boolean
  /**
   * A trust grant waiting for `y`. Trust lets the repository's code run, so
   * one key cannot grant it; `^s` is also flow control on many terminals.
   */
  confirmingTrust: boolean
  /** The tool the pending grant is for, or null for the whole repository. */
  trustScope: string | null
  /** The task whose arguments are being typed, and the text so far. */
  entering: { task: Task; text: string } | null
  view: 'list' | 'settings' | 'help'
  /** The view `?` was pressed in, to go back to. */
  helpFrom: 'list' | 'settings'
  helpScroll: number
  settings: SettingsScreen | null
  /** The trust grant was removed in this run. */
  revoked: boolean
  /** Increased on each refresh, so an older result cannot overwrite a newer one. */
  generation: number
  inFlight: AbortController | null
  /** The tasks that pass the filters, in the selected tab. */
  rows: TaskHit[]
  /** The skills that pass the filters, listed after the tasks. */
  skillRows: SkillHit[]
}

/** One terminal UI. */
export interface Tui {
  readonly state: TuiState
  readonly session: Session
  /** The whole screen as one string. */
  frame(width: number, height: number): string
  /** One key. */
  handle(key: string): void
  /** One read from the terminal: each key, with the rows rebuilt after each. */
  feed(chunk: string): void
  /** Rebuild the rows and keep the selection on a task that is still there. */
  recompute(): void
  /** Index of the selected row. */
  cursor(): number
  /** The list's rows: the tasks, then the skills. */
  entries(): ListEntry[]
  /** Write a frame to the host. */
  draw(): void
  /** Show the stored probe, then probe. */
  boot(): Promise<void>
  /** Probe again. */
  refresh(): Promise<void>
  /** Stop any probe, give the terminal back and exit. */
  quit(code: number): void
  /** Resolves when the work keys started has finished. For tests. */
  idle(): Promise<void>
}

/** What {@link createTui} takes. */
export interface CreateTuiOptions {
  session: Session
  host: TuiHost
  styles: Styles
}

/**
 * `text` wrapped at word breaks to `width` columns. Each later line is
 * indented to where the text after a key column starts (the first run of two
 * spaces after the first word), so a key's action lines up under itself.
 */
export function wrapHanging(text: string, width: number): string[] {
  if (text.length <= width || width < 20) return [text]
  const column = /^(\s*\S+(?: \S+)*?\s{2,})/.exec(text)?.[1]?.length
  const hang = ' '.repeat(Math.min(column ?? /^\s*/.exec(text)![0].length, Math.floor(width / 2)))
  const out: string[] = []
  let rest = text
  while (rest.length > width) {
    let cut = rest.lastIndexOf(' ', width)
    if (cut <= hang.length) cut = width
    out.push(rest.slice(0, cut).trimEnd())
    rest = hang + rest.slice(cut).trimStart()
  }
  out.push(rest)
  return out
}

/**
 * What the status line says about stale rows, in three states. Fresh says
 * nothing. Stale and measured slow is kept apart from ordinary stale,
 * because it is the case the store exists for.
 */
export function refreshNote(
  rows: readonly RunnerCacheState[],
  loading: boolean,
): { text: string; slow: boolean } | null {
  const stale = rows.filter((r) => r.state === 'stale')
  if (stale.length === 0) return null

  const named = (r: RunnerCacheState): string =>
    r.estimateMs === null
      ? `${runnerLabel(r.runner)} (never timed here)`
      : `${runnerLabel(r.runner)} (~${humanMs(r.estimateMs)})`
  const slow = stale.filter((r) => r.slow)

  if (!loading) {
    // The refresh is over and these rows are still what the store held.
    return {
      slow: slow.length > 0,
      text: `cached rows: ${stale.map((r) => `${runnerLabel(r.runner)} ${humanAge(r.ageMs)}`).join(', ')} — ^r to re-probe`,
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

const HOME = '\x1b[H'
const CLEAR_BELOW = '\x1b[J'
/** The one separator line character. */
const RULE = '─'

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/** Make a terminal UI. Nothing is drawn or probed until {@link Tui.boot}. */
export function createTui({ session, host, styles: s }: CreateTuiOptions): Tui {
  const state: TuiState = {
    catalog: null,
    cache: [],
    skills: [],
    runnerOrder: session.runnerOrder(),
    probed: false,
    runner: ALL,
    query: '',
    mode: 'fuzzy',
    servicesOnly: false,
    declaredOnly: false,
    scope: 0,
    selectedId: null,
    scroll: 0,
    message: null,
    loading: false,
    confirmingTrust: false,
    trustScope: null,
    entering: null,
    view: 'list',
    helpFrom: 'list',
    helpScroll: 0,
    settings: null,
    revoked: false,
    generation: 0,
    inFlight: null,
    rows: [],
    skillRows: [],
  }
  const pending = new Set<Promise<unknown>>()
  const track = (work: Promise<unknown>): void => {
    const p = work
      .catch((err: unknown) => say(errorText(err), 'error'))
      .finally(() => {
        pending.delete(p)
        draw()
      })
    pending.add(p)
  }

  const say = (text: string, tone: Message['tone'] = 'note'): void => {
    state.message = { text, tone }
  }

  // ------------------------------------------------------------ the catalog

  const reports = () => state.catalog?.reports ?? []
  const reportFor = (runner: string) => reports().find((r) => r.runner === runner)
  const tabs = (): string[] => [
    ALL,
    ...reports().map((r) => r.runner),
    ...(state.skills.length > 0 ? [SKILLS_TAB] : []),
  ]
  const showsSkills = (): boolean => state.runner === ALL || state.runner === SKILLS_TAB
  const cacheFor = (runner: string) => state.cache.find((c) => c.runner === runner)
  const chainOf = (runner: string): ChainSegment[] => reportFor(runner)?.chain ?? []

  /** Each withheld runner, with its label and the scopes it needs. */
  const withheldRunners = (): WithheldRunner[] =>
    state.catalog === null
      ? []
      : session
          .unknowns({ catalog: state.catalog, cache: state.cache })
          .filter((u): u is WithheldRunner => u.kind === 'withheld')

  /** The withheld runners, and why, or null when execution is allowed. */
  const withheld = (): { count: number; cause: string; trustable: boolean } | null => {
    const reason = session.withheldReason()
    const held = withheldRunners()
    if (reason === null || held.length === 0) return null
    let cause: string
    if (reason === 'exec-off') {
      cause = `withheld: ${execOffCause(session.settings().settings, session.gate)}`
    } else if (held.some((w) => w.reason === 'tool-untrusted')) {
      const missing = [...new Set(held.flatMap((w) => w.missing ?? []))]
      cause = withheldLabel('tool-untrusted', missing)
    } else {
      cause = withheldLabel('untrusted')
    }
    return { count: held.length, cause, trustable: session.trustable() }
  }

  const tabTasks = (): readonly Task[] =>
    state.runner === ALL
      ? reports().flatMap((r) => r.tasks)
      : (reportFor(state.runner)?.tasks ?? [])
  /** How many rows the selected tab has before filtering. */
  const tabTotal = (): number => tabTasks().length + (showsSkills() ? state.skills.length : 0)

  const entries = (): ListEntry[] => [
    ...state.rows.map((task) => ({ task })),
    ...state.skillRows.map((skill) => ({ skill })),
  ]
  const entryId = (e: ListEntry | undefined): string | null =>
    e === undefined ? null : e.task !== undefined ? e.task.task.id : e.skill.skill.id

  function recompute(): void {
    const filter = {
      query: state.query,
      mode: state.mode,
      servicesOnly: state.servicesOnly,
      declaredOnly: state.declaredOnly,
      maxDepth: SCOPES[state.scope]!.maxDepth,
    }
    if (state.catalog === null || state.runner === SKILLS_TAB) {
      state.rows = []
    } else {
      const scoped =
        state.runner === ALL ? reports() : reports().filter((r) => r.runner === state.runner)
      state.rows = session.search({ ...state.catalog, reports: scoped }, filter)
    }
    state.skillRows = showsSkills() ? session.searchSkills(state.skills, filter) : []
    const all = entries()
    if (state.selectedId !== null && !all.some((e) => entryId(e) === state.selectedId)) {
      state.selectedId = entryId(all[0])
    }
  }

  function cursor(): number {
    if (state.selectedId === null) return 0
    const at = entries().findIndex((e) => entryId(e) === state.selectedId)
    return at === -1 ? 0 : at
  }

  function select(index: number): void {
    const all = entries()
    const clamped = Math.max(0, Math.min(index, all.length - 1))
    state.selectedId = entryId(all[clamped])
  }

  const resetSelection = (): void => {
    state.selectedId = null
    state.scroll = 0
  }

  // ---------------------------------------------------------------- render

  /** The chain, dimmed except for the leaf, with matched characters marked. */
  function chainChunks(row: TaskHit): Chunk[] {
    const { path } = row.task
    const shown = displayPath(path, row.task.runner)
    const marks = new Set(row.labelHits ?? [])
    const chunks: Chunk[] = []
    let at = 0
    for (let p = 0; p < path.length; p++) {
      const leaf = p === path.length - 1
      const plain = leaf ? s.bold : s.dim
      if (shown[p] !== path[p]) {
        // A runner id shown as its label: the marks index the id, so none apply.
        chunks.push({ text: shown[p]!, paint: plain })
        at += path[p]!.length
        if (!leaf) {
          chunks.push({ text: ' > ', paint: s.dim })
          at++
        }
        continue
      }
      let run = ''
      let marked = marks.has(at)
      for (const ch of path[p]!) {
        const on = marks.has(at)
        if (on !== marked) {
          chunks.push({ text: run, paint: marked ? s.match : plain })
          run = ''
          marked = on
        }
        run += ch
        at++
      }
      if (run) chunks.push({ text: run, paint: marked ? s.match : plain })
      if (!leaf) {
        chunks.push({ text: ' > ', paint: s.dim })
        at++ // the " " the label was joined on
      }
    }
    return chunks
  }

  /**
   * A skill's line, `/name [hint]`, with matched name characters marked and
   * its origin dimmed after it. Skill text is repository text, so it is
   * filtered; `terminalSafe` keeps its length, so the offsets still fit.
   */
  function skillChunks(hit: SkillHit): Chunk[] {
    const marks = new Set((hit.labelHits ?? []).map((i) => i + 1)) // after the `/`
    const text = terminalSafe(skillLine(hit.skill))
    const nameEnd = hit.skill.invoke.length
    const paintAt = (i: number) => (marks.has(i) ? s.match : i < nameEnd ? s.bold : undefined)
    const chunks: Chunk[] = []
    let from = 0
    for (let i = 1; i <= text.length; i++) {
      if (i === text.length || paintAt(i) !== paintAt(from)) {
        chunks.push({ text: text.slice(from, i), paint: paintAt(from) })
        from = i
      }
    }
    chunks.push({ text: `  ${terminalSafe(hit.skill.origin)}`, paint: s.dim })
    return chunks
  }

  /**
   * The tab row: each tab's chunks, scrolled so the selected tab is in view,
   * with `‹` and `›` where tabs are cut off. The mode flags keep their room
   * at the right.
   */
  function tabRow(width: number): string {
    const names = tabs()
    const segments: Chunk[][] = names.map((name, i) => {
      const count =
        name === ALL
          ? reports().reduce((n, r) => n + r.tasks.length, 0) + state.skills.length
          : name === SKILLS_TAB
            ? state.skills.length
            : (reportFor(name)?.tasks.length ?? 0)
      // A leading `~` marks rows from the store that are out of date. A `–`
      // in place of the count marks a withheld runner. Both show without color.
      const stale =
        name === ALL
          ? state.cache.some((c) => c.state === 'stale')
          : cacheFor(name)?.state === 'stale'
      const held = name !== ALL && reportFor(name)?.skippedForExec === true
      const title = name === ALL ? ALL : name === SKILLS_TAB ? SKILLS_GROUP.id : runnerLabel(name)
      const label = `${stale ? '~' : ''}${title} ${held ? '–' : count}`
      const selected = name === state.runner
      const chunks: Chunk[] = []
      const prev = names[i - 1]
      const newGroup = name === SKILLS_TAB || groupOf(prev ?? ALL) !== groupOf(name)
      if (name !== ALL && prev !== undefined && prev !== ALL && newGroup) {
        chunks.push({ text: '│', paint: s.dim })
      }
      // Brackets mark the selected tab in the same width as the spaces
      // around the others, so it shows without color or inverse.
      chunks.push({
        text: selected ? `[${label}]` : ` ${label} `,
        paint: selected ? s.selected : stale || held ? s.warning : s.dim,
      })
      return chunks
    })

    const scope = SCOPES[state.scope]!
    const flags = [
      state.mode,
      ...(state.servicesOnly ? ['services'] : []),
      ...(state.declaredOnly ? ['declared'] : []),
      ...(scope.maxDepth !== undefined ? [`scope ${scope.label}`] : []),
      ...(state.catalog?.allowExec ? ['exec'] : []),
    ].join(' ')
    const room = Math.max(1, width - flags.length - 1)

    const widths = segments.map((c) => chunksWidth(c))
    const span = (from: number, to: number): number =>
      widths.slice(from, to + 1).reduce((a, b) => a + b, 0) +
      (from > 0 ? 1 : 0) +
      (to < segments.length - 1 ? 1 : 0)
    const sel = Math.max(0, names.indexOf(state.runner))
    let from = 0
    let to = segments.length - 1
    if (span(from, to) > room) {
      to = 0
      while (to < segments.length - 1 && span(0, to + 1) <= room) to++
      if (sel > to) {
        from = sel
        to = sel
        while (from > 0 && span(from - 1, to) <= room) from--
        while (to < segments.length - 1 && span(from, to + 1) <= room) to++
      }
    }
    const chunks: Chunk[] = []
    if (from > 0) chunks.push({ text: '‹', paint: s.dim })
    for (let i = from; i <= to; i++) chunks.push(...segments[i]!)
    if (to < segments.length - 1) chunks.push({ text: '›', paint: s.dim })
    const used = chunksWidth(chunks)
    chunks.push({ text: ' '.repeat(Math.max(1, width - used - flags.length)) })
    chunks.push({ text: flags, paint: s.dim })
    return line(chunks, width)
  }

  function statusLine(width: number): string {
    const shown = state.rows.length + state.skillRows.length
    const chunks: Chunk[] = [{ text: `${shown}/${tabTotal()}`, paint: s.dim }]
    // The clock and the probe time give way first when the line is too long,
    // so a warning after them is not cut.
    const clock: Chunk[] = []
    if (state.catalog === null) {
      chunks.push({ text: '  collecting', paint: s.dim })
    } else {
      clock.push({
        text: `  checked ${new Date(state.catalog.generatedAt).toLocaleTimeString()}`,
        paint: s.dim,
      })
      const times = state.cache.map((c) => c.probeMs).filter((n) => n !== undefined)
      if (times.length > 0 && !state.loading) {
        clock.push({ text: `, ${probeTimeLabel(Math.max(...times))}`, paint: s.dim })
      }
      chunks.push(...clock)
    }
    const note = refreshNote(state.cache, state.loading)
    if (state.loading && note === null && state.catalog !== null) {
      chunks.push({ text: '  refreshing', paint: s.note })
    }
    if (note !== null) {
      chunks.push({ text: `  ${note.text}`, paint: note.slow ? s.error : s.warning })
    }
    if (state.message !== null) {
      const tone = state.message.tone
      chunks.push({
        text: `  ${state.message.text}`,
        paint: tone === 'error' ? s.error : tone === 'warning' ? s.warning : s.note,
      })
    }
    const held = withheld()
    if (state.confirmingTrust) {
      const what = state.trustScope === null ? 'this repository' : `${state.trustScope} here`
      chunks.push({ text: `  trust ${what}? y/n`, paint: s.warning })
    } else if (held !== null) {
      chunks.push({
        text: `  ${countRunners(held.count)} ${held.cause}${held.trustable ? ' (^s to trust)' : ''}`,
        paint: s.warning,
      })
    }
    for (const r of reports().filter((r) => r.status === 'error')) {
      chunks.push({ text: `  ${runnerLabel(r.runner)} failed`, paint: s.error })
    }
    const length = (list: readonly Chunk[]): number => list.reduce((n, c) => n + c.text.length, 0)
    const fitted = length(chunks) > width ? chunks.filter((c) => !clock.includes(c)) : chunks
    return line(fitted, width)
  }

  function queryLine(width: number): string {
    // One cursor on screen: the query's only while the list takes the keys.
    const active = state.view === 'list' && state.entering === null
    return line(
      [
        { text: '> ', paint: s.accent },
        { text: state.query, paint: active ? undefined : s.dim },
        ...(active ? [{ text: '█', paint: s.accent }] : []),
      ],
      width,
    )
  }

  const footer = (
    view: 'list' | 'arguments' | 'settings' | 'help',
    width: number,
    row: 'task' | 'skill' = 'task',
  ): string =>
    line([{ text: footerHints(keysFor('tui', view), width, '  ', row), paint: s.dim }], width)

  /** The lines of the help screen. */
  function helpLines(width: number): { text: string; heading?: boolean }[] {
    const section = (title: string, view: 'list' | 'arguments' | 'settings') => [
      { text: title, heading: true },
      ...keyLines('tui', view).map((text) => ({ text })),
      { text: '' },
    ]
    const lines: { text: string; heading?: boolean }[] = [
      ...section('LIST', 'list'),
      ...section('ARGUMENTS', 'arguments'),
      ...section('SETTINGS', 'settings'),
      { text: 'MARKS', heading: true },
      { text: '  >        the selected row' },
      { text: '  [all 9]  the selected tab' },
      { text: '  *        a service: it runs until you stop it' },
      { text: '  ?        parameters unknown; Enter asks for arguments' },
      { text: '  ~        a tab whose rows came from the store and are out of date' },
      { text: '  –        a withheld runner: reading it means running it' },
      { text: '' },
      { text: 'SKILLS', heading: true },
      { text: '  An agent skill is typed in the agent as /<name>. Enter and ^y copy it;' },
      { text: '  nothing runs here.' },
    ]
    return lines.flatMap((l) =>
      l.heading === true ? [l] : wrapHanging(l.text, width).map((text) => ({ text })),
    )
  }

  function settingsFacts(screen: SettingsScreen): SettingsFacts {
    const snapshot = session.settings()
    return {
      settings: screen.settings,
      gate: session.gate,
      trustable: session.trustable(),
      revoked: state.revoked,
      reports: reports(),
      withheld: session.withheldReason(),
      withheldRunners: withheldRunners(),
      tools: snapshot.tools,
      trustedTools: snapshot.trustedTools,
    }
  }

  /** A scrolled body of `room` lines, with the cursor line marked. */
  function body(
    lines: readonly (SettingsLine | { text: string; heading?: boolean })[],
    scroll: number,
    room: number,
    cursorAt: number | null,
    width: number,
  ): string[] {
    const out: string[] = []
    for (let i = 0; i < room; i++) {
      const entry = lines[scroll + i]
      if (entry === undefined) {
        out.push(CLEAR_EOL)
        continue
      }
      const item = 'item' in entry && entry.item !== undefined
      const mark = item ? (scroll + i === cursorAt ? '> ' : '  ') : ''
      out.push(
        line(
          [
            { text: mark, paint: s.accent },
            { text: entry.text, paint: entry.heading === true ? s.bold : undefined },
          ],
          width,
        ),
      )
    }
    return out
  }

  function frame(width: number, height: number): string {
    const out: string[] = [tabRow(width), queryLine(width), statusLine(width)]

    if (state.view === 'help') {
      const lines = helpLines(width)
      const room = Math.max(1, height - out.length - 2)
      state.helpScroll = Math.max(0, Math.min(state.helpScroll, lines.length - room))
      out.push(...body(lines, state.helpScroll, room, null, width))
      out.push(line([{ text: RULE.repeat(width), paint: s.dim }], width))
      out.push(footer('help', width))
      return HOME + out.join('\r\n') + CLEAR_BELOW
    }

    if (state.view === 'settings' && state.settings !== null) {
      const screen = state.settings
      const lines = linesOf(screen)
      const at = cursorLine(screen, lines)
      const room = Math.max(1, height - out.length - 2)
      if (at < screen.scroll) screen.scroll = at
      if (at >= screen.scroll + room) screen.scroll = at - room + 1
      out.push(...body(lines, screen.scroll, room, at, width))
      out.push(line([{ text: RULE.repeat(width), paint: s.dim }], width))
      if (screen.adding !== null) {
        out.push(
          line(
            [
              { text: 'add path: ', paint: s.dim },
              { text: screen.adding },
              { text: '█', paint: s.accent },
              { text: '   enter add  esc cancel', paint: s.dim },
            ],
            width,
          ),
        )
      } else {
        out.push(footer('settings', width))
      }
      return HOME + out.join('\r\n') + CLEAR_BELOW
    }

    // The list, in the rows left over. The entry line takes one more row than
    // the key hints it replaces, so the list gives up a row while arguments
    // are typed.
    const at = cursor()
    const list = entries()
    const listHeight = Math.max(1, height - out.length - (state.entering ? 5 : 4))
    if (at < state.scroll) state.scroll = at
    if (at >= state.scroll + listHeight) state.scroll = at - listHeight + 1
    if (state.scroll < 0) state.scroll = 0
    for (let i = 0; i < listHeight; i++) {
      const entry = list[state.scroll + i]
      if (!entry) {
        out.push(i === 0 ? emptyList(width) : CLEAR_EOL)
        continue
      }
      if (entry.skill !== undefined) {
        out.push(
          line(
            [
              { text: state.scroll + i === at ? '>' : ' ', paint: s.accent },
              { text: '   ' },
              ...skillChunks(entry.skill),
            ],
            width,
          ),
        )
        continue
      }
      const row = entry.task
      out.push(
        line(
          [
            { text: state.scroll + i === at ? '>' : ' ', paint: s.accent },
            { text: row.task.persistent.value ? '*' : ' ', paint: s.success },
            { text: row.task.parametersUnknown !== undefined ? '?' : ' ', paint: s.warning },
            { text: ' ' },
            ...chainChunks(row),
          ],
          width,
        ),
      )
    }

    // What Enter would run, always on screen.
    const currentEntry = list[at]
    const current = currentEntry?.task
    out.push(line([{ text: RULE.repeat(width), paint: s.dim }], width))
    if (currentEntry?.skill !== undefined) {
      const skill = currentEntry.skill.skill
      const text = terminalSafe(skillLine(skill))
      const where = terminalSafe(`skill for ${skill.harnesses.join(', ')}`)
      const gap = width - text.length - where.length - 1
      out.push(
        line(
          gap >= 3
            ? [{ text, paint: s.bold }, { text: ' '.repeat(gap) }, { text: where, paint: s.dim }]
            : [{ text, paint: s.bold }],
          width,
        ),
      )
      out.push(
        line(
          [
            {
              text: terminalSafe(`${skill.description ?? ''}  ${skill.path}`.trim()),
              paint: s.dim,
            },
          ],
          width,
        ),
      )
    } else if (current) {
      const shape = chainOf(current.task.runner)
        .map((c) => c.label)
        .join(' > ')
      const gap = width - current.task.display.length - shape.length - 1
      out.push(
        line(
          gap >= 3
            ? [
                { text: current.task.display, paint: s.bold },
                { text: ' '.repeat(gap) },
                { text: shape, paint: s.dim },
              ]
            : [{ text: current.task.display, paint: s.bold }],
          width,
        ),
      )
      out.push(line(infoChunks(current.task), width))
    } else {
      out.push(line([], width))
      out.push(line([], width))
    }

    if (state.entering) {
      const { task, text } = state.entering
      out.push(
        line(
          [
            { text: '$ ', paint: s.dim },
            { text: task.argv.join(' ') + ' ', paint: s.bold },
            { text },
            { text: '█', paint: s.accent },
          ],
          width,
        ),
      )
      const hints = footerHints(keysFor('tui', 'arguments'), width)
      const about =
        task.parametersUnknown !== undefined
          ? `${parametersUnknownLabel(task.parametersUnknown)}; type any, or none`
          : `takes ${paramShape(task.parameters)}`
      const aboutRoom = Math.max(0, width - hints.length - 6)
      out.push(
        line(
          [{ text: `  ${fitWidth(terminalSafe(about), aboutRoom)}    ${hints}`, paint: s.dim }],
          width,
        ),
      )
    } else {
      out.push(footer('list', width, currentEntry?.skill !== undefined ? 'skill' : 'task'))
    }
    return HOME + out.join('\r\n') + CLEAR_BELOW
  }

  /** The first list line when there are no rows: why. */
  function emptyList(width: number): string {
    let text: string
    if (state.runner === SKILLS_TAB) text = state.query !== '' ? 'no match' : 'no skills'
    else if (state.catalog === null) text = state.probed ? 'nothing collected' : 'collecting…'
    else if (state.runner !== ALL && reportFor(state.runner)?.skippedForExec === true) {
      const held = withheld()
      text = held === null ? 'withheld' : `${held.cause}${held.trustable ? ' — ^s to trust' : ''}`
    } else if (state.query !== '') text = 'no match'
    else if (tabTasks().length > 0) text = 'no task passes the filters'
    else text = state.probed || !state.loading ? 'nothing collected' : 'collecting…'
    return line([{ text: `    ${text}`, paint: s.dim }], width)
  }

  /** The line under the selected task: its marks spelled out, then its doc. */
  function infoChunks(task: Task): Chunk[] {
    const chunks: Chunk[] = []
    if (task.persistent.value) chunks.push({ text: '* service  ', paint: s.success })
    if (task.parametersUnknown !== undefined) {
      chunks.push({
        text: `? ${parametersUnknownLabel(task.parametersUnknown)}  `,
        paint: s.warning,
      })
    }
    chunks.push({ text: task.doc ?? task.detail ?? '', paint: s.dim })
    return chunks
  }

  function draw(): void {
    recompute()
    host.write(frame(host.columns() || 100, host.rows() || 30))
  }

  // --------------------------------------------------------------- actions

  function quit(code: number): void {
    state.inFlight?.abort()
    host.release()
    host.exit(code)
  }

  /**
   * Run `task` with `args`, handing it the terminal. The plan is resolved
   * first, so a refusal (an editor variable, arguments the tool will not
   * take) is shown on the status line and nothing is handed over.
   */
  function run(task: Task, args: readonly string[]): void {
    if (state.catalog === null) return
    let plan: RunPlan
    try {
      plan = session.resolveRun(state.catalog, task.id, args)
    } catch (err) {
      if (err instanceof SessionError) {
        say(err.message, 'error')
        return
      }
      throw err
    }
    state.inFlight?.abort()
    host.release()
    host.write(`$ ${terminalSafe(plan.argv.join(' '))}\n`)
    if (task.parameters.length > 0 && args.length === 0) {
      host.write(`  takes ${terminalSafe(paramShape(task.parameters))}\n`)
    }
    const result = host.handOff(plan)
    if (result.error !== undefined) {
      host.write(terminalSafe(`${BIN}: ${plan.argv[0]}: ${result.error}`) + '\n')
      const from = cacheFor(task.runner)
      if (from !== undefined && from.state === 'stale') {
        host.write(
          `${BIN}: that row came from a cached listing of ${terminalSafe(runnerLabel(task.runner))} taken ${humanAge(from.ageMs)}` +
            ` — the task may no longer exist; start ${BIN} again to re-probe\n`,
        )
      }
    }
    host.exit(result.exit)
  }

  /** Enter on a row: run it, or ask for its arguments first. */
  function activate(task: Task): void {
    if (task.parametersUnknown === 'editor-variable') {
      say(parametersUnknownLabel('editor-variable'), 'error')
      return
    }
    // A task that takes arguments, or whose parameters could not be read,
    // asks first. Running it here would spawn it without them and hand over
    // the terminal before the mistake could be reported.
    if (task.parameters.length > 0 || task.parametersUnknown !== undefined) {
      state.entering = { task, text: '' }
      return
    }
    run(task, [])
  }

  async function refresh(note?: Message): Promise<void> {
    if (state.loading) return
    const generation = ++state.generation
    const controller = new AbortController()
    state.inFlight = controller
    state.loading = true
    state.message = note ?? null
    draw()
    try {
      // Always a real probe. ^r means "ask again", and an answer from the
      // store would look the same as doing nothing.
      const snapshot = await session.catalog({ signal: controller.signal })
      if (generation !== state.generation) return
      state.catalog = orderedCatalog(snapshot.catalog, state.runnerOrder)
      state.cache = snapshot.cache
      state.skills = snapshot.skills
      if (state.runner === SKILLS_TAB && state.skills.length === 0) state.runner = ALL
    } catch (err) {
      if (generation === state.generation && !controller.signal.aborted) {
        say(`refresh failed: ${errorText(err)}`, 'error')
      }
    } finally {
      if (generation === state.generation) {
        state.loading = false
        state.inFlight = null
        state.probed = true
        if (note !== undefined && state.message === note) state.message = null
      }
    }
  }

  async function boot(): Promise<void> {
    // The store first: a few file hashes rather than a full probe, so the
    // tasks show at once, marked as cached, even when a runner is slow.
    try {
      const stored = await readCachedCatalog(
        session.project,
        session.root,
        session.options,
        session.store,
      )
      if (stored.catalog !== null && fromStore(stored)) {
        state.catalog = orderedCatalog(stored.catalog, state.runnerOrder)
        state.cache = stored.runners
      }
    } catch {
      // A store that cannot be read is the same as an empty one.
    }
    draw()
    await refresh()
    draw()
  }

  /**
   * Grant trust, to the repository or with `scope` to one tool, then probe
   * again so the withheld runners appear.
   */
  async function grantTrust(scope?: string): Promise<void> {
    let note: string | undefined
    try {
      note = (await session.grantTrust(scope)).note
    } catch (err) {
      // Never silent: the user must know why the runners are still withheld.
      say(`trust failed: ${errorText(err)}`, 'error')
      return
    }
    state.revoked = false
    // A probe started before the grant runs with the old settings, and
    // refresh() ignores a call while one runs. Abandon it first; refresh()
    // raises the generation, so its result is discarded.
    state.inFlight?.abort()
    state.inFlight = null
    state.loading = false
    const trusted = scope === undefined ? 'trusted' : `trusted ${scope}`
    await refresh({
      text: note ? `${trusted} — re-probing; ${note}` : `${trusted} — re-probing`,
      tone: 'note',
    })
  }

  /** Remove one tool's grant; it is withheld again from the next probe. */
  async function revokeToolTrust(scope: string): Promise<void> {
    let changed: boolean
    try {
      changed = (await session.revokeTrust(scope)).changed
    } catch (err) {
      say(`untrust failed: ${errorText(err)}`, 'error')
      return
    }
    if (!changed) {
      say(
        `${scope} has no grant to remove; trust rules in your user config may trust it`,
        'warning',
      )
      return
    }
    state.inFlight?.abort()
    state.inFlight = null
    state.loading = false
    await refresh({ text: `removed trust for ${scope} — re-probing`, tone: 'note' })
    if (state.message === null) say(`removed trust for ${scope}`)
  }

  async function revokeTrust(): Promise<void> {
    try {
      const change = await session.revokeTrust()
      if (change.changed) {
        state.revoked = true
        say(`trust removed; the next ${BIN} run withholds what needs it`)
      } else if (session.gate.trusted) {
        say('no grant to remove; trust rules in your user config trust this repository', 'warning')
      } else {
        say('this repository has no trust grant')
      }
    } catch (err) {
      say(`untrust failed: ${errorText(err)}`, 'error')
    }
  }

  /** Ask `y/n` before a grant: for the repository, or with `scope` for one tool. */
  function askTrust(scope: string | null = null): void {
    if (session.trustable()) {
      state.trustScope = scope
      state.confirmingTrust = true
    } else if (withheld() !== null)
      say('trust would not change this run: execution is off', 'warning')
    else say('nothing is withheld')
  }

  async function copy(task: Task): Promise<void> {
    await toClipboard(copyText(task, host.platform), 'copied')
  }

  /** A skill runs in an agent, so its action copies `/<name>` and spawns nothing. */
  async function copySkill(skill: SkillRow): Promise<void> {
    await toClipboard(
      skill.invoke,
      terminalSafe(`copied ${skill.invoke}; type it in ${skill.harnesses.join(', ')}`),
    )
  }

  async function toClipboard(text: string, done: string): Promise<void> {
    say('copying…')
    let ok = false
    try {
      ok = await host.clipboard(text)
    } catch {
      ok = false
    }
    say(ok ? done : 'clipboard unavailable', ok ? 'note' : 'warning')
  }

  function cycleRunner(step: number): void {
    const names = tabs()
    const at = Math.max(0, names.indexOf(state.runner))
    state.runner = names[(at + step + names.length) % names.length]!
    resetSelection()
  }

  // -------------------------------------------------------------- settings

  /** `session.options` follows the saved config, except where a flag decided. */
  function adoptSettings(settings: Settings): void {
    const derived = collectOptionsFromConfig(settings.loaded.effective) as Record<string, unknown>
    const target = session.options as Record<string, unknown>
    for (const key of ['exclude', 'discovery', 'excludePaths'] as const) {
      if (session.pinnedByFlag.includes(key)) continue
      if (derived[key] === undefined) delete target[key]
      else target[key] = derived[key]
    }
    state.runnerOrder = settings.runnerOrder.value
    if (state.catalog !== null) state.catalog = orderedCatalog(state.catalog, state.runnerOrder)
  }

  const readCurrentSettings = (): Promise<Settings> =>
    readSettings(session.root, session.env, session.home)

  async function openSettings(): Promise<void> {
    let settings: Settings
    try {
      settings = await readCurrentSettings()
    } catch (err) {
      say(`settings unavailable: ${errorText(err)}`, 'error')
      return
    }
    const screen: SettingsScreen = { settings, at: null, hint: 0, scroll: 0, adding: null }
    state.settings = screen
    state.view = 'settings'
  }

  const linesOf = (screen: SettingsScreen): SettingsLine[] => settingsLines(settingsFacts(screen))

  const sameItem = (a: SettingsItem | undefined, b: SettingsItem | null): boolean =>
    a !== undefined && b !== null && JSON.stringify(a) === JSON.stringify(b)

  /** The index of the next line with an item from `from` in direction `step`, or null. */
  function itemIndex(lines: readonly SettingsLine[], from: number, step: 1 | -1): number | null {
    for (let i = from; i >= 0 && i < lines.length; i += step) {
      if (lines[i]!.item !== undefined) return i
    }
    return null
  }

  /**
   * The cursor's line: its item's, else the nearest item at or above where it
   * was, else the first. The screen remembers the answer.
   */
  function cursorLine(screen: SettingsScreen, lines: readonly SettingsLine[]): number {
    let at = lines.findIndex((l) => sameItem(l.item, screen.at))
    if (at === -1) {
      const from = Math.min(screen.hint, lines.length - 1)
      at = itemIndex(lines, from, -1) ?? itemIndex(lines, 0, 1) ?? 0
    }
    screen.at = lines[at]?.item ?? null
    screen.hint = at
    return at
  }

  function moveSettings(screen: SettingsScreen, steps: number): void {
    const lines = linesOf(screen)
    let at = cursorLine(screen, lines)
    const dir = steps > 0 ? 1 : -1
    for (let n = 0; n < Math.abs(steps); n++) {
      const next = itemIndex(lines, at + dir, dir)
      if (next === null) break
      at = next
    }
    screen.at = lines[at]?.item ?? null
    screen.hint = at
  }

  async function applyEdit(edit: SettingsEdit): Promise<void> {
    let file: string
    try {
      ;({ file } = await writeSetting(
        { layer: edit.layer, root: session.root, env: session.env, home: session.home },
        edit.key,
        edit.value,
      ))
    } catch (err) {
      say(`not saved: ${errorText(err)}`, 'error')
      return
    }
    let settings: Settings
    try {
      settings = await readCurrentSettings()
    } catch (err) {
      say(`saved to ${file}, but it cannot be read back: ${errorText(err)}`, 'error')
      return
    }
    adoptSettings(settings)
    if (state.settings !== null) state.settings.settings = settings
    const pinned =
      (edit.key === 'runners.disabled' && session.pinnedByFlag.includes('exclude')) ||
      (edit.key === 'discovery' && session.pinnedByFlag.includes('discovery')) ||
      (edit.key === 'excludePaths' && session.pinnedByFlag.includes('excludePaths'))
    const saved = `saved ${edit.key} to ${file}`
    if (pinned) {
      say(`${saved}; a command-line flag decides it for this run`, 'warning')
      return
    }
    if (edit.key === 'runners.order') {
      say(saved)
      return
    }
    // Probe again so the list shows what the new setting collects.
    state.inFlight?.abort()
    state.inFlight = null
    state.loading = false
    await refresh({ text: `${saved} — re-probing`, tone: 'note' })
    if (state.message === null) say(saved)
  }

  function handleSettings(key: string): void {
    const screen = state.settings
    if (screen === null) {
      state.view = 'list'
      return
    }
    if (screen.adding !== null) {
      if (key === '\x1b' || key === '\x03') screen.adding = null
      else if (key === '\r' || key === '\n') {
        const edit = editPaths(screen.settings, { add: screen.adding })
        screen.adding = null
        if (edit !== null) track(applyEdit(edit))
      } else if (key === '\x7f' || key === '\x08') screen.adding = screen.adding.slice(0, -1)
      else if (key === '\x15') screen.adding = ''
      else if (isText(key)) screen.adding += key
      return
    }
    const lines = linesOf(screen)
    const item = lines[cursorLine(screen, lines)]?.item
    const page = Math.max(1, host.rows() - 6)
    switch (namedKey(key) ?? key) {
      case '\x1b':
      case '\x03':
      case ',':
      case 'q':
        state.view = 'list'
        state.settings = null
        return
      case '?':
        state.helpFrom = 'settings'
        state.view = 'help'
        state.helpScroll = 0
        return
      case 'up':
      case '\x10':
        moveSettings(screen, -1)
        return
      case 'down':
      case '\x0e':
        moveSettings(screen, 1)
        return
      case 'pageUp':
        moveSettings(screen, -page)
        return
      case 'pageDown':
        moveSettings(screen, page)
        return
      case ' ':
      case '\r':
      case '\n':
        if (item?.kind === 'runner') track(applyEdit(toggleRunner(screen.settings, item.runner)))
        else if (item?.kind === 'discovery') track(applyEdit(cycleDiscovery(screen.settings)))
        else if (item?.kind === 'add-path') screen.adding = ''
        else if (item?.kind === 'trust') {
          if (session.trustable()) askTrust()
          else if (session.gate.trusted && !state.revoked) track(revokeTrust())
        } else if (item?.kind === 'tool') {
          if (item.trusted) track(revokeToolTrust(item.tool))
          else askTrust(item.tool)
        }
        return
      case '[':
      case ']': {
        if (item?.kind !== 'runner') return
        const edit = moveRunner(
          { settings: screen.settings, reports: reports() },
          item.runner,
          key === '[' ? -1 : 1,
        )
        if (edit !== null) track(applyEdit(edit))
        return
      }
      case 'a':
        screen.adding = ''
        return
      case 'x':
      case '\x1b[3~': {
        if (item?.kind !== 'path') return
        const edit = editPaths(screen.settings, { remove: item.path })
        if (edit !== null) track(applyEdit(edit))
        return
      }
      case 't':
      case '\x13':
        askTrust(item?.kind === 'tool' && !item.trusted ? item.tool : null)
        return
      case 'u':
        if (item?.kind === 'tool') {
          if (item.trusted) track(revokeToolTrust(item.tool))
          return
        }
        track(revokeTrust())
        return
    }
  }

  // ------------------------------------------------------------------- keys

  function handle(key: string): void {
    // The trust question takes exactly one key. `y` grants; any other key
    // cancels and is used up, so it does not also do its usual job.
    if (state.confirmingTrust) {
      const scope = state.trustScope ?? undefined
      state.confirmingTrust = false
      state.trustScope = null
      state.message = null
      if (key === 'y' || key === 'Y') track(grantTrust(scope))
      return
    }

    if (state.view === 'help') {
      const page = Math.max(1, host.rows() - 6)
      switch (namedKey(key) ?? key) {
        case 'up':
          state.helpScroll = Math.max(0, state.helpScroll - 1)
          return
        case 'down':
          state.helpScroll++
          return
        case 'pageUp':
          state.helpScroll = Math.max(0, state.helpScroll - page)
          return
        case 'pageDown':
          state.helpScroll += page
          return
        case '\x1b':
        case '\x03':
        case '?':
        case 'q':
          state.view =
            state.helpFrom === 'settings' && state.settings !== null ? 'settings' : 'list'
          return
      }
      return
    }

    if (state.view === 'settings') {
      handleSettings(key)
      return
    }

    // While arguments are typed, every key is text or one of the keys that
    // end it, so no key acts on a list the user is not looking at.
    if (state.entering) {
      const entering = state.entering
      if (key === '\x1b' || key === '\x03') state.entering = null
      else if (key === '\r' || key === '\n') {
        state.entering = null
        run(entering.task, splitArgs(entering.text))
      } else if (key === '\x7f' || key === '\x08') entering.text = entering.text.slice(0, -1)
      else if (key === '\x15') entering.text = ''
      else if (isText(key)) entering.text += key
      return
    }

    const page = Math.max(1, host.rows() - 7)
    const move = (n: number): void => {
      select(cursor() + n)
      state.message = null
    }
    switch (namedKey(key) ?? key) {
      case '\x03': // ctrl-c
      case '\x1b': // esc
        quit(0)
        return
      case '\r':
      case '\n': {
        const entry = entries()[cursor()]
        if (entry?.skill !== undefined) track(copySkill(entry.skill.skill))
        else if (entry?.task !== undefined) activate(entry.task.task)
        return
      }
      case '\x19': {
        // ctrl-y
        const entry = entries()[cursor()]
        if (entry?.skill !== undefined) track(copySkill(entry.skill.skill))
        else if (entry?.task !== undefined) track(copy(entry.task.task))
        return
      }
      case '\x05': // ctrl-e
        state.mode = state.mode === 'fuzzy' ? 'exact' : 'fuzzy'
        resetSelection()
        return
      case '\x14': // ctrl-t
        state.servicesOnly = !state.servicesOnly
        resetSelection()
        return
      case '\x04': // ctrl-d
        state.declaredOnly = !state.declaredOnly
        resetSelection()
        return
      case '\x0f': // ctrl-o
        state.scope = (state.scope + 1) % SCOPES.length
        resetSelection()
        return
      case ',':
        track(openSettings())
        return
      case '?':
        state.helpFrom = 'list'
        state.view = 'help'
        state.helpScroll = 0
        return
      case '\x12': // ctrl-r
        track(refresh())
        return
      case '\x13': // ctrl-s
        askTrust()
        return
      case '\t':
        cycleRunner(1)
        return
      case 'shiftTab':
        cycleRunner(-1)
        return
      case 'up':
      case '\x10':
        move(-1)
        return
      case 'down':
      case '\x0e':
        move(1)
        return
      case 'pageUp':
        move(-page)
        return
      case 'pageDown':
        move(page)
        return
      case 'home':
      case '\x01':
        select(0)
        return
      case 'end':
        select(entries().length - 1)
        return
      case '\x7f':
      case '\x08':
        state.query = state.query.slice(0, -1)
        resetSelection()
        return
      case '\x15': // ctrl-u
        state.query = ''
        resetSelection()
        return
      default:
        if (isText(key)) {
          state.query += key
          resetSelection()
        }
    }
  }

  function feed(chunk: string): void {
    for (const key of splitKeys(chunk)) {
      handle(key)
      // Each key acts on the rows the one before it left.
      recompute()
    }
    draw()
  }

  return {
    state,
    session,
    frame,
    handle,
    feed,
    recompute,
    cursor,
    entries,
    draw,
    boot,
    refresh: () => refresh(),
    quit,
    async idle() {
      while (pending.size > 0) await Promise.allSettled(pending)
    },
  }
}
