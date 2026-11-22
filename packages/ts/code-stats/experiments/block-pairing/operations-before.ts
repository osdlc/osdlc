/**
 * `src/diff/operations.ts` as it was before the similarity floor, kept so the
 * experiments can score the old pairing beside the current one. Only the
 * import path below differs from that version. Do not fix or tidy it: a change
 * here changes the "before" columns.
 */
import type { DiffLine, FileDiff } from '../../src/diff/parse.ts'

/**
 * What happened to a changed line. A `changed` or `moved` line has a partner
 * on the other side, so each such pair is one line of change, not two.
 */
export const OPERATIONS = ['added', 'removed', 'changed', 'moved'] as const
export type Operation = (typeof OPERATIONS)[number]

export interface FileOperations {
  /** One per {@link FileDiff.added} line: `added`, `changed` or `moved`. */
  added: Operation[]
  /** One per {@link FileDiff.removed} line: `removed`, `changed` or `moved`. */
  removed: Operation[]
}

/**
 * A moved run must hold this many letters and digits, as git's
 * `--color-moved` requires, so a lone `}` or `return` reappearing elsewhere
 * is not a move.
 */
const MOVE_MIN_ALNUM = 20

/** Candidate starts tried per removed line, which bounds the work on a line as common as `}`. */
const MAX_CANDIDATES = 64

/** A line's place: its file's index among the diff's files, and its index among that file's added or removed lines. */
export interface Located {
  file: number
  index: number
}

const alnum = (text: string): number => text.replace(/[^\p{L}\p{N}]/gu, '').length

/** A removed line and the added line it became, each by file and index in that file's lines. */
export interface LinePair {
  removed: Located
  added: Located
  operation: 'changed' | 'moved'
  /** Which step paired them: a moved run, a line beside one, or the pairing inside a block. */
  by: 'move' | 'edited-move' | 'block'
}

export interface PairingOptions {
  /**
   * How similar (0 to 1) a line beside a moved run must be to the line
   * beside its new place to pair with it, so a block that moved and was
   * edited keeps its edited lines together. Null turns this off.
   * Default {@link EDITED_MOVE_SIMILARITY}.
   */
  editedMoveSimilarity?: number | null
}

/** Each line's operation, and which removed line each changed or moved line pairs with. */
export interface Pairing {
  operations: FileOperations[]
  pairs: LinePair[]
}

/**
 * Marks moved and changed lines across `files`. A run of removed lines that
 * reappears, consecutive and with indentation ignored, among added lines
 * outside its own block is moved; the longest such run wins. Lines just
 * before and after a moved run that are similar to the lines just before
 * and after its new place pair as changed, so an edit inside a moved block
 * stays with the block. Then, in each block, the remaining removed and added
 * lines pair up as changed, most similar first; the rest stay added or
 * removed. Files `include` rejects are left as plain additions and removals
 * and offer no lines to a move.
 */
export function assignOperations(
  files: readonly FileDiff[],
  include: (file: FileDiff) => boolean = () => true,
): FileOperations[] {
  return pairLines(files, include).operations
}

/** {@link assignOperations}, with the pairs it made. */
export function pairLines(
  files: readonly FileDiff[],
  include: (file: FileDiff) => boolean = () => true,
  options: PairingOptions = {},
): Pairing {
  const operations = files.map((f) => ({
    added: f.added.map((): Operation => 'added'),
    removed: f.removed.map((): Operation => 'removed'),
  }))
  const pairs: LinePair[] = []
  const trimmed = files.map((f) => ({
    added: f.added.map((l) => l.text.trim()),
    removed: f.removed.map((l) => l.text.trim()),
  }))
  const runs = markMoves(files, trimmed, include, operations, pairs)
  const threshold =
    options.editedMoveSimilarity === undefined
      ? EDITED_MOVE_SIMILARITY
      : options.editedMoveSimilarity
  if (threshold !== null) {
    for (const run of runs) extendMove(files, trimmed, run, threshold, operations, pairs)
  }
  for (const [fi, f] of files.entries()) {
    pairChanges(f, fi, trimmed[fi]!, operations[fi]!, pairs)
  }
  return { operations, pairs }
}

/** One file's added and removed lines with indentation and trailing space trimmed, as moves and similarity compare them. */
interface Trimmed {
  added: readonly string[]
  removed: readonly string[]
}

/** A moved run: `length` removed lines from `removed` that reappear from `added` on. */
interface Run {
  removed: Located
  added: Located
  length: number
}

/** Whether `lines[start + j]` exists and sits `j` lines after `lines[start]` in its file. */
const follows = (lines: readonly DiffLine[], start: number, j: number): boolean =>
  lines[start + j] !== undefined && lines[start + j]!.at === lines[start]!.at + j

function markMoves(
  files: readonly FileDiff[],
  trimmed: readonly Trimmed[],
  include: (file: FileDiff) => boolean,
  ops: FileOperations[],
  pairs: LinePair[],
): Run[] {
  const addedAt = new Map<string, Located[]>()
  for (const [fi, f] of files.entries()) {
    if (!include(f)) continue
    for (const [index, key] of trimmed[fi]!.added.entries()) {
      if (key === '') continue
      const list = addedAt.get(key)
      if (list === undefined) addedAt.set(key, [{ file: fi, index }])
      else list.push({ file: fi, index })
    }
  }

  const runs: Run[] = []
  for (const [fi, f] of files.entries()) {
    if (!include(f)) continue
    const removed = f.removed
    const removedKeys = trimmed[fi]!.removed
    let k = 0
    while (k < removed.length) {
      const candidates: Located[] = []
      for (const c of addedAt.get(removedKeys[k]!) ?? []) {
        if (ops[c.file]!.added[c.index] !== 'added') continue
        candidates.push(c)
        if (candidates.length === MAX_CANDIDATES) break
      }
      let best: { at: Located; length: number } | null = null
      for (const c of candidates) {
        const target = files[c.file]!.added
        const targetKeys = trimmed[c.file]!.added
        let length = 0
        while (
          follows(removed, k, length) &&
          follows(target, c.index, length) &&
          ops[fi]!.removed[k + length] === 'removed' &&
          ops[c.file]!.added[c.index + length] === 'added' &&
          !(c.file === fi && target[c.index + length]!.block === removed[k + length]!.block) &&
          removedKeys[k + length] === targetKeys[c.index + length]
        ) {
          length += 1
        }
        if (length > (best?.length ?? 0)) best = { at: c, length }
      }
      const run = best === null ? [] : removedKeys.slice(k, k + best.length)
      if (best !== null && alnum(run.join('')) >= MOVE_MIN_ALNUM) {
        for (let j = 0; j < best.length; j += 1) {
          ops[fi]!.removed[k + j] = 'moved'
          ops[best.at.file]!.added[best.at.index + j] = 'moved'
          pairs.push({
            removed: { file: fi, index: k + j },
            added: { file: best.at.file, index: best.at.index + j },
            operation: 'moved',
            by: 'move',
          })
        }
        runs.push({ removed: { file: fi, index: k }, added: best.at, length: best.length })
        k += best.length
      } else {
        k += 1
      }
    }
  }
  return runs
}

/**
 * Default for {@link PairingOptions.editedMoveSimilarity}, chosen by the
 * experiment in `experiments/edited-moves/`.
 */
export const EDITED_MOVE_SIMILARITY = 0.6

/**
 * Pairs the lines on either side of a moved run with the lines on either
 * side of its new place, outward from the run while each pair is still
 * free, still next to the last, and at least `threshold` similar: as moved
 * when the texts match, else as changed.
 */
function extendMove(
  files: readonly FileDiff[],
  trimmed: readonly Trimmed[],
  run: Run,
  threshold: number,
  ops: FileOperations[],
  pairs: LinePair[],
): void {
  const from = files[run.removed.file]!.removed
  const to = files[run.added.file]!.added
  const fromKeys = trimmed[run.removed.file]!.removed
  const toKeys = trimmed[run.added.file]!.added
  const fromOps = ops[run.removed.file]!.removed
  const toOps = ops[run.added.file]!.added
  const tryPair = (r: number, a: number, step: number): boolean => {
    const rLine = from[r]
    const aLine = to[a]
    if (rLine === undefined || aLine === undefined) return false
    if (rLine.at !== from[r - step]!.at + step || aLine.at !== to[a - step]!.at + step) return false
    if (fromOps[r] !== 'removed' || toOps[a] !== 'added') return false
    if (similarity(profile(fromKeys[r]!), profile(toKeys[a]!)) < threshold) return false
    // An identical line here was split from the run by an edit, or was too short to move alone.
    const operation = fromKeys[r] === toKeys[a] ? 'moved' : 'changed'
    fromOps[r] = operation
    toOps[a] = operation
    pairs.push({
      removed: { file: run.removed.file, index: r },
      added: { file: run.added.file, index: a },
      operation,
      by: 'edited-move',
    })
    return true
  }
  for (let j = run.length; tryPair(run.removed.index + j, run.added.index + j, 1); j += 1);
  for (let j = 1; tryPair(run.removed.index - j, run.added.index - j, -1); j += 1);
}

function pairChanges(
  f: FileDiff,
  fi: number,
  trimmed: Trimmed,
  ops: FileOperations,
  pairs: LinePair[],
): void {
  const free = (count: number, offset: number, side: Operation[], plain: Operation): number[] =>
    Array.from({ length: count }, (_, j) => offset + j).filter((i) => side[i] === plain)
  let addedIndex = 0
  let removedIndex = 0
  for (const b of f.blocks) {
    const removed = free(b.removed.length, removedIndex, ops.removed, 'removed')
    const added = free(b.added.length, addedIndex, ops.added, 'added')
    const pairing = pairBySimilarity(
      removed.map((i) => trimmed.removed[i]!),
      added.map((i) => trimmed.added[i]!),
    )
    for (const [r, a] of pairing) {
      ops.removed[removed[r]!] = 'changed'
      ops.added[added[a]!] = 'changed'
      pairs.push({
        removed: { file: fi, index: removed[r]! },
        added: { file: fi, index: added[a]! },
        operation: 'changed',
        by: 'block',
      })
    }
    removedIndex += b.removed.length
    addedIndex += b.added.length
  }
}

/** Blocks larger than this pair in order, which keeps the pairing quadratic in a small number. */
const MAX_PAIRING = 64

/** A trimmed line and its character bigrams, each keyed by its two UTF-16 code units. */
interface Profile {
  text: string
  bigrams: Map<number, number>
}

function profile(text: string): Profile {
  const bigrams = new Map<number, number>()
  for (let i = 0; i + 1 < text.length; i += 1) {
    const g = text.charCodeAt(i) * 65536 + text.charCodeAt(i + 1)
    bigrams.set(g, (bigrams.get(g) ?? 0) + 1)
  }
  return { text, bigrams }
}

/** Dice's coefficient over character bigrams: 1 for equal texts, 0 for nothing in common. */
function similarity(a: Profile, b: Profile): number {
  if (a.text === b.text) return 1
  let shared = 0
  let total = 0
  for (const [g, n] of a.bigrams) {
    shared += Math.min(n, b.bigrams.get(g) ?? 0)
    total += n
  }
  for (const n of b.bigrams.values()) total += n
  return total === 0 ? 0 : (2 * shared) / total
}

/**
 * Pairs one block's free removed and added lines, given trimmed, by their
 * positions in those lists: `min(removed, added)` pairs in all, most similar
 * first, so a rewritten line pairs with its rewrite rather than with a
 * comment added or removed beside it. Ties go to the earlier lines.
 */
function pairBySimilarity(
  removed: readonly string[],
  added: readonly string[],
): [number, number][] {
  const count = Math.min(removed.length, added.length)
  if (count === 0) return []
  if (removed.length > MAX_PAIRING || added.length > MAX_PAIRING) {
    return Array.from({ length: count }, (_, j): [number, number] => [j, j])
  }
  const addedProfiles = added.map(profile)
  const scored: { r: number; a: number; score: number }[] = []
  for (const [r, text] of removed.entries()) {
    const p = profile(text)
    for (const [a, q] of addedProfiles.entries()) scored.push({ r, a, score: similarity(p, q) })
  }
  scored.sort((x, y) => y.score - x.score || x.r - y.r || x.a - y.a)
  const usedRemoved = new Set<number>()
  const usedAdded = new Set<number>()
  const pairs: [number, number][] = []
  for (const { r, a } of scored) {
    if (pairs.length === count) break
    if (usedRemoved.has(r) || usedAdded.has(a)) continue
    usedRemoved.add(r)
    usedAdded.add(a)
    pairs.push([r, a])
  }
  return pairs
}
