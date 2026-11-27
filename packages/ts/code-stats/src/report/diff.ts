import { apiLanguage, diffApi, extractApi, isEntryPoint } from '../analysis/api.ts'
import type { Analyzer, FunctionComplexity } from '../analysis/complexity.ts'
import {
  typeScriptSource,
  withParseMemo,
  type TypeScript,
  type TypeScriptSource,
} from '../analysis/typescript.ts'
import {
  CHANGE_CATEGORIES,
  categorizeChange,
  dependencyChange,
  type DependencyChange,
} from '../diff/categories.ts'
import { OPERATIONS, pairLines, type FileOperations } from '../diff/operations.ts'
import { parseDiff, type DiffLine, type FileDiff } from '../diff/parse.ts'
import {
  createGroupClassifier,
  FILE_GROUPS,
  isUnreviewed,
  kindInGroup,
  type FileGroup,
  type GroupRules,
} from '../groups.ts'
import {
  CONTENT_KINDS,
  firstLine,
  linesMatch,
  splitLines,
  type ContentKind,
} from '../scan/kinds.ts'
import { languageNamed } from '../scan/language.ts'
import { prefixKind } from '../scan/prefix.ts'
import {
  createScannerRegistry,
  type ScanFallback,
  type ScannerRegistry,
  type ScanReader,
} from '../scan/registry.ts'
import type { Change, FileContent, LinguistAttributes } from '../types.ts'
import { listed, LINGUIST_UNREAD, READER_NAME } from './notes.ts'
import type { DiffReport, KindOperations } from './schema.ts'

/** Where file content and attributes come from: a repository, or any source a caller supplies. */
export interface DiffContent {
  base(paths: readonly string[]): Map<string, FileContent>
  head(paths: readonly string[]): Map<string, FileContent>
  /** Linguist attributes at the head; null when they cannot be read. */
  attributes(paths: readonly string[]): Map<string, LinguistAttributes> | null
}

/**
 * Options for {@link buildDiffReport}: the scanners and group rules, the complexity analyzers, the
 * TypeScript source for the API pass, and the limits on the analysis passes.
 */
export interface DiffOptions {
  registry?: ScannerRegistry
  groups?: GroupRules
  /**
   * Complexity analyzers. Default none, so the builder runs no process;
   * `diffChange` and the other repository entry points default to `defaultAnalyzers`.
   */
  analyzers?: readonly Analyzer[]
  /**
   * The compiler API, for the public members of classes and interfaces: the
   * module, or a source loaded when a TypeScript file first needs it. Default
   * none; `diffChange` and the other repository entry points default to the
   * measured project's own.
   */
  typescript?: TypeScript | TypeScriptSource | null
  /** False skips the API and complexity passes, for a caller that wants only the line and file facts. Default true. */
  analysis?: boolean
  /** Most files read for the API and complexity passes. Default 150. */
  maxAnalysisFiles?: number
  /**
   * Time budget for the API and complexity passes, in ms: no file is read
   * once it is spent. An analyzer that scores files together (lizard) scores
   * the files read after, 25 at a time; no batch starts once the budget is
   * spent, and each has what is left of it, but at least 5 s, to finish.
   * Default 20 000.
   */
  analysisBudgetMs?: number
  /** Complexity movers kept. Default 60. */
  maxMovers?: number
  /** The clock the time budget reads. Default `Date.now`. */
  now?: () => number
}

type FileRow = DiffReport['fileList'][number]

/** Why a file's kinds did not come from its preferred reader, and which reader they came from. */
interface Estimate {
  reason: 'no-commits' | 'unreadable' | ScanFallback['reason']
  reader: Exclude<ScanReader, 'scanner'>
}

interface FileState {
  diff: FileDiff
  group: FileGroup
  language: string | null
  before: string | null
  after: string | null
  reviewed: boolean
  added: ContentKind[]
  removed: ContentKind[]
  estimate: Estimate | null
  dependencies: DependencyChange | null
}

function emptyKindOperations(): KindOperations {
  return Object.fromEntries(
    CONTENT_KINDS.map((k) => [k, Object.fromEntries(OPERATIONS.map((o) => [o, 0]))]),
  ) as KindOperations
}

function textOf(content: FileContent | undefined): string | null {
  return content?.kind === 'text' ? content.text : null
}

/**
 * The kind of each changed line on one side: from a scan of the whole file
 * when its text is there and matches the diff, else from the one-line rule
 * with the language the registry names for that side's path.
 */
function sideKinds(
  registry: ScannerRegistry,
  path: string,
  text: string | null,
  lines: readonly DiffLine[],
  haveContent: boolean,
): { kinds: ContentKind[]; estimate: Estimate | null } {
  if (lines.length === 0) return { kinds: [], estimate: null }
  if (text !== null) {
    if (linesMatch(splitLines(text), lines)) {
      const scan = registry.scan(text, path)
      const kinds = lines.map((l) => scan.kinds[l.at - 1]!)
      const estimate =
        scan.reader === 'scanner' || scan.fallback === null
          ? null
          : { reason: scan.fallback.reason, reader: scan.reader }
      return { kinds, estimate }
    }
  }
  const { name } = registry.languageOf(path, text === null ? undefined : firstLine(text))
  const language = name === null ? null : languageNamed(name)
  return {
    kinds: lines.map((l) => prefixKind(l.text, language)),
    estimate: { reason: haveContent ? 'unreadable' : 'no-commits', reader: 'one-line' },
  }
}

function fileStates(
  files: readonly FileDiff[],
  content: DiffContent | null,
  attributes: Map<string, LinguistAttributes> | null,
  options: DiffOptions,
): FileState[] {
  const registry = options.registry ?? createScannerRegistry()
  const classifyGroup = createGroupClassifier(options.groups)
  const text = files.filter((f) => !f.binary && f.entry === 'file')
  const before = content?.base(
    text.filter((f) => f.status !== 'added').map((f) => f.oldPath ?? f.path),
  )
  const after = content?.head(text.filter((f) => f.status !== 'deleted').map((f) => f.path))

  return files.map((f) => {
    const beforeText = f.status === 'added' ? null : textOf(before?.get(f.oldPath ?? f.path))
    const afterText = f.status === 'deleted' ? null : textOf(after?.get(f.path))
    const sample = afterText ?? beforeText ?? undefined
    const language = registry.languageOf(
      f.path,
      sample === undefined ? undefined : firstLine(sample),
    )
    const group = classifyGroup({
      path: f.path,
      category: language.category,
      attributes: attributes?.get(f.path),
      text: sample,
    })
    const reviewed = !isUnreviewed(group) && !f.binary && f.entry === 'file'
    const none = { kinds: [], estimate: null }
    const removed = reviewed
      ? sideKinds(registry, f.oldPath ?? f.path, beforeText, f.removed, content !== null)
      : none
    const added = reviewed
      ? sideKinds(registry, f.path, afterText, f.added, content !== null)
      : none
    return {
      diff: f,
      group,
      language: language.name,
      before: beforeText,
      after: afterText,
      reviewed,
      added: added.kinds.map((k) => kindInGroup(group, k)),
      removed: removed.kinds.map((k) => kindInGroup(group, k)),
      estimate: removed.estimate ?? added.estimate,
      dependencies: dependencyChange(f, { before: beforeText, after: afterText }),
    }
  })
}

/** A changed or moved pair counts once, under its kind; a pair of two kinds was split before. */
function tally(state: FileState, ops: FileOperations): KindOperations {
  const counts = emptyKindOperations()
  for (const [i, op] of ops.added.entries()) counts[state.added[i]!][op] += 1
  for (const [i, op] of ops.removed.entries()) {
    if (op === 'removed') counts[state.removed[i]!].removed += 1
  }
  return counts
}

function addKindOperations(into: KindOperations, from: KindOperations): void {
  for (const k of CONTENT_KINDS) for (const o of OPERATIONS) into[k][o] += from[k][o]
}

function categoryRows(fileList: readonly FileRow[]): DiffReport['categories'] {
  return CHANGE_CATEGORIES.flatMap((category) => {
    const members = fileList.filter((f) => f.category === category)
    if (members.length === 0) return []
    const top = [...members]
      .sort((a, b) => b.added + b.removed - (a.added + a.removed) || a.path.localeCompare(b.path))
      .slice(0, 5)
      .map((f) => f.path)
    const added = members.reduce((n, f) => n + f.added, 0)
    const removed = members.reduce((n, f) => n + f.removed, 0)
    return [{ category, files: members.length, added, removed, top }]
  })
}

/** What an estimate note says; a change whose commits are missing says so once, as it skips analysis. */
const ESTIMATE_REASON: Record<Exclude<Estimate['reason'], 'no-commits'>, string> = {
  unreadable: 'their text could not be read or did not match the diff',
  'unknown-language': 'their language is not known',
  'scanner-failed': 'their scanner failed',
}

function estimateNotes(states: readonly FileState[]): string[] {
  const reasons = Object.keys(ESTIMATE_REASON) as (keyof typeof ESTIMATE_REASON)[]
  return reasons.flatMap((reason) =>
    (['one-line', 'table'] as const).flatMap((reader) => {
      const paths = states
        .filter((s) => s.estimate?.reason === reason && s.estimate.reader === reader)
        .map((s) => s.diff.path)
      if (paths.length === 0) return []
      return [
        `kinds for ${paths.length} file(s) come from ${READER_NAME[reader]}, because ${ESTIMATE_REASON[reason]}: ${listed(paths)}`,
      ]
    }),
  )
}

/**
 * Assembles a {@link DiffReport} from a unified diff. `content` null means the
 * change's commits are not readable: kinds come from the one-line rule and
 * the API and complexity passes are skipped.
 */
export function buildDiffReport(
  change: Change,
  diff: string,
  content: DiffContent | null,
  options: DiffOptions = {},
): DiffReport {
  return reportOfFiles(change, parseDiff(diff), content, options)
}

/** {@link buildDiffReport} over a diff already parsed. */
export function reportOfFiles(
  change: Change,
  files: FileDiff[],
  content: DiffContent | null,
  options: DiffOptions = {},
): DiffReport {
  const notes: string[] = []
  const attributes = content === null ? new Map() : content.attributes(files.map((f) => f.path))
  if (attributes === null) notes.push(LINGUIST_UNREAD)

  const states = fileStates(files, content, attributes, options)
  const reviewed = new Set(states.filter((s) => s.reviewed).map((s) => s.diff))
  const { operations, pairs } = pairLines(files, (f) => reviewed.has(f))
  // A line that became a line of another kind, such as a comment replaced by code, is not the
  // same line edited: it counts as removed under its old kind and added under its new one.
  for (const p of pairs) {
    const before = states[p.removed.file]!.removed[p.removed.index]
    const after = states[p.added.file]!.added[p.added.index]
    if (before === undefined || after === undefined || before === after) continue
    operations[p.removed.file]!.removed[p.removed.index] = 'removed'
    operations[p.added.file]!.added[p.added.index] = 'added'
  }

  const total = emptyKindOperations()
  const groups = Object.fromEntries(
    FILE_GROUPS.map((g) => [g, { files: 0, added: 0, removed: 0 }]),
  ) as DiffReport['groups']
  const fileList: FileRow[] = states.map((s, i) => {
    const d = s.diff
    const g = groups[s.group]
    g.files += 1
    g.added += d.added.length
    g.removed += d.removed.length
    const counts = s.reviewed ? tally(s, operations[i]!) : null
    if (counts !== null) addKindOperations(total, counts)
    return {
      path: d.path,
      oldPath: d.oldPath,
      status: d.status,
      entry: d.entry,
      similarity: d.similarity,
      binary: d.binary,
      language: s.language,
      group: s.group,
      category: categorizeChange(d, s),
      added: d.added.length,
      removed: d.removed.length,
      kindOperations: counts,
    }
  })
  notes.push(...estimateNotes(states))

  const analysis =
    options.analysis === false
      ? notRequested()
      : content === null
        ? skippedAnalysis(change.label, notes)
        : analyse(
            states.filter((s) => s.reviewed && s.group !== 'docs' && s.group !== 'instructions'),
            options,
            notes,
          )
  return {
    schema: 1,
    change: { ...change },
    files: files.length,
    lines: {
      added: files.reduce((n, f) => n + f.added.length, 0),
      removed: files.reduce((n, f) => n + f.removed.length, 0),
    },
    kindOperations: total,
    groups,
    categories: categoryRows(fileList),
    fileList,
    dependencies: states.flatMap((s) => s.dependencies ?? []),
    ...analysis,
    notes,
  }
}

type Analysis = Pick<DiffReport, 'api' | 'complexity'>

function emptyComplexity(note: string | null): DiffReport['complexity'] {
  return {
    status: 'skipped',
    note,
    analyzers: [],
    totalBefore: 0,
    totalAfter: 0,
    functionsChanged: 0,
    files: [],
    movers: [],
  }
}

function notRequested(): Analysis {
  const why = 'the API and complexity passes were not asked for'
  return { api: { status: 'skipped', note: why, changes: [] }, complexity: emptyComplexity(why) }
}

function skippedAnalysis(label: string, notes: string[]): Analysis {
  const why =
    `${label}'s commits are not in this checkout, so line kinds come from the one-line ` +
    'comment rule and the API and complexity passes are skipped'
  notes.push(why)
  return { api: { status: 'skipped', note: why, changes: [] }, complexity: emptyComplexity(why) }
}

/** Why a file is left out of the analysis passes, or null to read it. */
function analysisSkip(s: FileState, read: number, maxFiles: number, late: boolean): string | null {
  const unreadable =
    (s.before === null && s.diff.status !== 'added') ||
    (s.after === null && s.diff.status !== 'deleted')
  if (unreadable) return 'unreadable'
  if (read >= maxFiles) return `file cap ${maxFiles}`
  return late ? 'time budget' : null
}

/** The API and complexity passes, over at most `maxAnalysisFiles` files within the time budget. */
function analyse(
  candidates: readonly FileState[],
  options: DiffOptions,
  notes: string[],
): Analysis {
  const now = options.now ?? Date.now
  const deadline = now() + (options.analysisBudgetMs ?? 20_000)
  const maxFiles = options.maxAnalysisFiles ?? 150
  const ts = typeScriptSource(options.typescript ?? null)
  const allAnalyzers = options.analyzers ?? []
  let analyzers = allAnalyzers.filter((a) => a.available())

  const api: DiffReport['api'] = { status: 'ok', note: null, changes: [] }
  const complexity = emptyComplexity(null)
  // A note on a file left out, or a file to score, in the candidates' order.
  const steps: (string | Scoring)[] = []
  let read = 0
  withParseMemo(() => {
    for (const s of candidates) {
      const path = s.diff.path
      const language = s.group === 'tests' ? null : apiLanguage(path)
      const analyzer = analyzers.find((a) => a.matches(path))
      if (language === null && analyzer === undefined) continue
      const skip = analysisSkip(s, read, maxFiles, now() > deadline)
      if (skip !== null) {
        steps.push(`${path} (${skip})`)
        continue
      }
      read += 1
      const before = s.before ?? ''
      const after = s.after ?? ''
      if (language !== null) {
        const compiler = language === 'ts' ? ts.load() : null
        const d = diffApi(
          extractApi(language, before, path, compiler),
          extractApi(language, after, path, compiler),
        )
        if (d.added.length + d.removed.length + d.changed.length > 0) {
          const entry = language === 'ts' && isEntryPoint(path)
          api.changes.push({ file: path, language, entry, ...d })
        }
      }
      if (analyzer !== undefined) {
        const step: Scoring = { path, analyzer, texts: [before, after] }
        if (analyzer.analyzeAll === undefined) {
          try {
            step.sides = [scoreText(analyzer, before, path), scoreText(analyzer, after, path)]
          } catch (e) {
            step.sides = errorOf(e)
          }
        }
        steps.push(step)
      }
    }
  })
  scoreBatches(steps, now, deadline)
  const skipped: string[] = []
  for (const step of steps) {
    if (typeof step === 'string') skipped.push(step)
    else if (step.sides instanceof Error) skipped.push(`${step.path} (${step.sides.message})`)
    else scoreComplexity(complexity, step.path, ...step.sides!)
  }

  if (!ts.found()) {
    api.note = 'class and interface members were not read: the typescript package was not found'
  }
  // A `typescript` that resolved but did not load is known only once a file asked for it.
  analyzers = analyzers.filter((a) => a.available())
  complexity.analyzers = analyzers.map((a) => a.id)
  if (analyzers.length === 0) {
    complexity.note = 'no complexity analyzer available (install typescript or lizard)'
  } else {
    complexity.status = 'ok'
    const scored = (path: string) => analyzers.some((a) => a.matches(path))
    const missing = allAnalyzers.filter(
      (u) =>
        !analyzers.includes(u) &&
        candidates.some((s) => u.matches(s.diff.path) && !scored(s.diff.path)),
    )
    if (missing.length > 0) {
      const ids = missing.map((a) => a.id).join(', ')
      complexity.note = `files in languages with no available analyzer (${ids}) were not scored`
      notes.push(complexity.note)
    }
  }
  complexity.movers.sort(
    (x, y) =>
      Math.abs(y.delta) - Math.abs(x.delta) ||
      x.path.localeCompare(y.path) ||
      x.name.localeCompare(y.name),
  )
  complexity.movers = complexity.movers.slice(0, options.maxMovers ?? 60)
  if (skipped.length > 0) {
    notes.push(
      `skipped ${skipped.length} file(s) in the API and complexity passes: ${listed(skipped)}`,
    )
  }
  return { api, complexity }
}

/** A read file's complexity, on each side, or why it could not be scored. */
interface Scoring {
  path: string
  analyzer: Analyzer
  texts: [before: string, after: string]
  /** Unset until its analyzer's batch has run, for an analyzer that scores files together. */
  sides?: [FunctionComplexity, FunctionComplexity] | Error
}

const errorOf = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)))

/** An added or deleted file's empty side has no functions; lizard would start a process to say so. */
const scoreText = (analyzer: Analyzer, text: string, path: string): FunctionComplexity =>
  text === '' ? new Map() : analyzer.analyze(text, path)

/** Files per {@link Analyzer.analyzeAll} call, so a call that fails or hangs costs only its own. */
const BATCH_FILES = 25
/** The least time a batch is given, however little of the budget is left. */
const MIN_BATCH_MS = 5_000

/**
 * Scores the files left to each analyzer that scores files together, in
 * batches of {@link BATCH_FILES}; once the budget is spent, each file left
 * gets a `time budget` error.
 */
function scoreBatches(
  steps: readonly (string | Scoring)[],
  now: () => number,
  deadline: number,
): void {
  const pending = steps.filter((s): s is Scoring => typeof s !== 'string' && s.sides === undefined)
  for (const analyzer of new Set(pending.map((s) => s.analyzer))) {
    const mine = pending.filter((s) => s.analyzer === analyzer)
    for (let i = 0; i < mine.length; i += BATCH_FILES) {
      const batch = mine.slice(i, i + BATCH_FILES)
      const left = deadline - now()
      if (left < 0) {
        for (const s of batch) s.sides = new Error('time budget')
        continue
      }
      const sources = batch.flatMap((s) =>
        s.texts.filter((text) => text !== '').map((text) => ({ text, path: s.path })),
      )
      let scored: FunctionComplexity[]
      try {
        // An unbounded budget leaves the analyzer its own timeout.
        const options = Number.isFinite(left) ? { timeoutMs: Math.max(left, MIN_BATCH_MS) } : {}
        scored = analyzer.analyzeAll!(sources, options)
      } catch (e) {
        for (const s of batch) s.sides = errorOf(e)
        continue
      }
      let next = 0
      const side = (text: string): FunctionComplexity =>
        text === '' ? new Map() : (scored[next++] ?? new Map())
      for (const s of batch) s.sides = [side(s.texts[0]), side(s.texts[1])]
    }
  }
}

function scoreComplexity(
  complexity: DiffReport['complexity'],
  path: string,
  before: FunctionComplexity,
  after: FunctionComplexity,
): void {
  const sum = (m: FunctionComplexity) => [...m.values()].reduce((n, v) => n + v, 0)
  let touched = 0
  for (const name of new Set([...before.keys(), ...after.keys()])) {
    const b = before.get(name) ?? null
    const a = after.get(name) ?? null
    if (b === a) continue
    touched += 1
    complexity.movers.push({
      path,
      name,
      before: b,
      after: a,
      delta: (a ?? 0) - (b ?? 0),
      anonymous: name.includes('<anonymous'),
    })
  }
  const totalBefore = sum(before)
  const totalAfter = sum(after)
  complexity.totalBefore += totalBefore
  complexity.totalAfter += totalAfter
  complexity.functionsChanged += touched
  if (touched > 0 || totalBefore !== totalAfter) {
    complexity.files.push({
      path,
      before: totalBefore,
      after: totalAfter,
      functionsBefore: before.size,
      functionsAfter: after.size,
    })
  }
}
