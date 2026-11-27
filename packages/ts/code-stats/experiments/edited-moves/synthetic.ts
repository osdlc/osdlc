/* oxlint-disable no-console -- an experiment reports on stdout */
/**
 * Scores move and change pairing against edits whose right answer is known.
 *
 * Each case takes a chunk of real code from the repository it runs in (lines between
 * blank lines), moves it elsewhere in its file, and maybe edits some of its
 * lines, keeping track of which line each new line came from. The diff git
 * makes of the two versions is paired, and every reported pair is checked
 * against that record. Run from the package:
 *
 *   node experiments/edited-moves/synthetic.ts [cases-per-scenario]
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Git } from '@osdlc/typed-git'

import { pairLines } from '../../src/diff/operations.ts'
import { parseDiff } from '../../src/diff/parse.ts'
import { DIFF_FLAGS } from '../../src/git/change.ts'

const top = new Git(process.cwd()).topLevel()
if (top === null) throw new Error('run it inside a git repository')
const REPO = top

/** mulberry32: a small seeded generator, so every run makes the same cases. */
function random(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Where a line of the new version came from: the index of a line of the old one, kept or edited, or nowhere. */
type Origin = number | null

interface Case {
  scenario: string
  before: string[]
  after: string[]
  origin: Origin[]
}

const alnum = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, '').length

/** Chunks of non-blank lines between blank lines, as [start, end) line ranges. */
function chunks(lines: readonly string[]): [number, number][] {
  const out: [number, number][] = []
  let start = -1
  for (let i = 0; i <= lines.length; i += 1) {
    const blank = i === lines.length || lines[i]!.trim() === ''
    if (!blank && start < 0) start = i
    if (blank && start >= 0) {
      out.push([start, i])
      start = -1
    }
  }
  return out
}

/** One small, realistic edit: rename a word, change a number, add an argument, or append a comment. */
function edit(line: string, rand: () => number): string {
  const words = [...line.matchAll(/\b[A-Za-z_][A-Za-z0-9_]{2,}\b/g)]
  const pick = rand()
  if (words.length > 0 && pick < 0.5) {
    const w = words[Math.floor(rand() * words.length)]!
    return line.slice(0, w.index) + `${w[0]}Next` + line.slice(w.index + w[0].length)
  }
  if (/\d/.test(line) && pick < 0.65) return line.replace(/\d+/, (n) => String(Number(n) + 7))
  if (line.includes(')') && pick < 0.85) return line.replace(/\)(?!.*\))/, ', extra)')
  return `${line} // revised`
}

/** A line nothing else in the case resembles. */
const UNRELATED = [
  'const retryBudget = Math.max(attempts, 3)',
  'logger.warn("cache miss for", key)',
  'if (!session.isOpen) throw new Error("closed")',
  'let checksum = crc32(buffer)',
  'yield* drain(queue)',
]

const SCENARIOS = [
  'moved, unedited',
  'moved, one middle line edited',
  'moved, first line edited',
  'moved, last line edited',
  'moved, two lines edited',
  'moved, half its lines edited',
  'moved, a name renamed throughout',
  'moved, with unrelated lines beside both ends',
  'part of a block moved and edited, look-alike lines beside both ends',
] as const

/**
 * Moves lines from inside a block, so their neighbours are code, and edits
 * one of them. The line after them at the old place is deleted, and a
 * different line of the same file is inserted after them at the new place:
 * two lines that look alike but must not pair.
 */
function lookAlikeCase(lines: string[], rand: () => number): Case | null {
  const all = chunks(lines).filter(([s, e]) => e - s >= 6)
  if (all.length < 3) return null
  const index = Math.floor(rand() * all.length)
  const [cs, ce] = all[index]!
  const s = cs + 1 + Math.floor(rand() * (ce - cs - 5))
  const e = s + 3
  if (alnum(lines.slice(s, e).join('')) < 40) return null
  const deleted = e
  const others = all.filter((_, i) => i !== index)
  const [ds, de] = others[Math.floor(rand() * others.length)]!
  const insertBefore = ds + Math.floor(rand() * (de - ds))
  const pool = lines.filter(
    (l, i) => l.trim() !== '' && (i < cs || i >= ce) && l.trim() !== lines[deleted]!.trim(),
  )
  const lookAlike = pool[Math.floor(rand() * pool.length)]
  if (lookAlike === undefined) return null
  const editedAt = Math.floor(rand() * 3)
  const moved = lines.slice(s, e).map((l, j) => (j === editedAt ? edit(l, rand) : l))
  const after: string[] = []
  const origin: Origin[] = []
  for (let i = 0; i < lines.length; i += 1) {
    if (i === insertBefore) {
      for (const [j, line] of moved.entries()) {
        after.push(line)
        origin.push(s + j)
      }
      after.push(lookAlike)
      origin.push(null)
    }
    if ((i >= s && i < e) || i === deleted) continue
    after.push(lines[i]!)
    origin.push(i)
  }
  return {
    scenario: 'part of a block moved and edited, look-alike lines beside both ends',
    before: lines,
    after,
    origin,
  }
}

function makeCase(
  scenario: (typeof SCENARIOS)[number],
  lines: string[],
  rand: () => number,
): Case | null {
  if (scenario === 'part of a block moved and edited, look-alike lines beside both ends') {
    return lookAlikeCase(lines, rand)
  }
  const all = chunks(lines).filter(
    ([s, e]) => e - s >= 3 && e - s <= 25 && alnum(lines.slice(s, e).join('')) >= 60,
  )
  if (all.length < 3) return null
  const index = Math.floor(rand() * all.length)
  const [s, e] = all[index]!
  const others = all.filter((_, i) => i !== index && i !== index - 1 && i !== index + 1)
  if (others.length === 0) return null
  const insertBefore = others[Math.floor(rand() * others.length)]![1] // the end of another chunk

  const n = e - s
  const edited = new Set<number>()
  const middle = 1 + Math.floor(rand() * (n - 2))
  if (scenario === 'moved, one middle line edited') edited.add(middle)
  if (scenario === 'moved, first line edited') edited.add(0)
  if (scenario === 'moved, last line edited') edited.add(n - 1)
  if (scenario === 'moved, two lines edited') {
    edited.add(middle)
    edited.add(middle === 1 ? n - 1 : 0)
  }
  if (scenario === 'moved, half its lines edited') {
    for (let j = 0; j < n; j += 2) edited.add(j)
  }
  let moved = lines.slice(s, e).map((l, j) => (edited.has(j) ? edit(l, rand) : l))
  if (scenario === 'moved, a name renamed throughout') {
    const words = [
      ...lines
        .slice(s, e)
        .join('\n')
        .matchAll(/\b[a-z][A-Za-z0-9]{3,}\b/g),
    ].map((m) => m[0])
    const name = words[Math.floor(rand() * words.length)]
    if (name === undefined) return null
    const re = new RegExp(`\\b${name}\\b`, 'g')
    moved = lines.slice(s, e).map((l) => l.replace(re, `${name}Renamed`))
  }

  // Old lines kept in order without the chunk, the chunk going in before line `insertBefore`.
  const before = lines
  const after: string[] = []
  const origin: Origin[] = []
  const distractors = scenario === 'moved, with unrelated lines beside both ends'
  for (let i = 0; i < lines.length; i += 1) {
    if (i >= s && i < e) continue
    if (distractors && (i === s - 1 || i === e)) {
      // The lines next to the chunk's old place are rewritten into something unrelated.
      after.push(UNRELATED[Math.floor(rand() * UNRELATED.length)]!)
    } else {
      after.push(lines[i]!)
    }
    origin.push(i)
    if (i === insertBefore - 1) {
      if (distractors) {
        after.push(UNRELATED[Math.floor(rand() * UNRELATED.length)]!)
        origin.push(null)
      }
      for (const [j, line] of moved.entries()) {
        after.push(line)
        origin.push(s + j)
      }
      if (distractors) {
        after.push(UNRELATED[Math.floor(rand() * UNRELATED.length)]!)
        origin.push(null)
      }
    }
  }
  return { scenario, before, after, origin }
}

interface Score {
  truePairs: number
  reported: number
  correct: number
  wrongMoveLines: number
}

const emptyScore = (): Score => ({
  truePairs: 0,
  reported: 0,
  correct: 0,
  wrongMoveLines: 0,
})

/** Pairs the diff of a case at each threshold, and scores the pairs against its record. */
function scoreCase(c: Case, dir: string, thresholds: readonly (number | null)[]): Score[] {
  writeFileSync(join(dir, 'a'), `${c.before.join('\n')}\n`)
  writeFileSync(join(dir, 'b'), `${c.after.join('\n')}\n`)
  // `--no-index` exits 1 when the files differ, so the run is read whatever its exit.
  const out = new Git(dir).raw(['diff', '--no-index', '-U0', ...DIFF_FLAGS, 'a', 'b'])
  const [file] = parseDiff(out.stdout)
  if (file === undefined) return thresholds.map(emptyScore)
  const removedAt = new Set(file.removed.map((l) => l.at - 1))
  const addedAt = new Set(file.added.map((l) => l.at - 1))
  // A true pair: an old line and the new line that came from it, both in the diff.
  const truth = new Map<number, number>()
  for (const [j, o] of c.origin.entries()) {
    if (o !== null && removedAt.has(o) && addedAt.has(j)) truth.set(o, j)
  }
  const movedChunk = new Set(c.origin.flatMap((o, j) => (o !== null && o !== j ? [o] : [])))
  return thresholds.map((t) => {
    const { pairs } = pairLines([file], () => true, { editedMoveSimilarity: t })
    if (SHOW !== undefined && t === SHOW) show(c, file, pairs, truth)
    const score = emptyScore()
    score.truePairs = truth.size
    for (const p of pairs) {
      const from = file.removed[p.removed.index]!.at - 1
      const to = file.added[p.added.index]!.at - 1
      score.reported += 1
      if (truth.get(from) === to) score.correct += 1
      else if (movedChunk.has(from)) score.wrongMoveLines += 1
    }
    return score
  })
}

/** With `SHOW=<threshold>`, print the wrong pairs and some misses at that threshold. */
const SHOW = process.env.SHOW === undefined ? undefined : Number(process.env.SHOW)
let shownMisses = 0
function show(
  c: Case,
  file: ReturnType<typeof parseDiff>[number],
  pairs: ReturnType<typeof pairLines>['pairs'],
  truth: Map<number, number>,
): void {
  const reported = new Map(
    pairs.map((p) => [file.removed[p.removed.index]!.at - 1, file.added[p.added.index]!.at - 1]),
  )
  for (const [from, to] of reported) {
    if (truth.get(from) !== to) {
      console.log(
        `WRONG [${c.scenario}]\n  - ${c.before[from]!.trim()}\n  + ${c.after[to]!.trim()}`,
      )
    }
  }
  for (const [from, to] of truth) {
    if (reported.get(from) !== to && shownMisses < 12) {
      shownMisses += 1
      console.log(
        `MISSED [${c.scenario}]\n  - ${c.before[from]!.trim()}\n  + ${c.after[to]!.trim()}`,
      )
    }
  }
}

const perScenario = Number(process.argv[2] ?? 150)
const THRESHOLDS = [null, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8] as const
const sources = new Git(REPO)
  .lsFiles({ paths: ['*.ts', '*.rs', '*.py'] })
  .filter((p) => !/(^|\/)(packs|_generated|dist|vendor)\/|\.min\.|\.generated\.|\.d\.ts$/.test(p))
  .sort()

const rand = random(20261107)
const dir = mkdtempSync(join(tmpdir(), 'edited-moves-'))
const totals = new Map<string, Score[]>()
let made = 0
try {
  for (const scenario of SCENARIOS) {
    const scores = THRESHOLDS.map(emptyScore)
    let count = 0
    let tries = 0
    while (count < perScenario && tries < perScenario * 20) {
      tries += 1
      const path = sources[Math.floor(rand() * sources.length)]!
      let text: string
      try {
        text = readFileSync(join(REPO, path), 'utf8')
      } catch {
        continue
      }
      const lines = text.split('\n')
      if (lines.length < 30 || lines.length > 800) continue
      const c = makeCase(scenario, lines, rand)
      if (c === null) continue
      for (const [i, s] of scoreCase(c, dir, THRESHOLDS).entries()) {
        const total = scores[i]!
        for (const k of Object.keys(s) as (keyof Score)[]) total[k] += s[k]
      }
      count += 1
    }
    made += count
    totals.set(scenario, scores)
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}

const pct = (a: number, b: number) => (b === 0 ? '-' : `${((100 * a) / b).toFixed(1)}%`)
const label = (t: number | null) => (t === null ? 'off (before)' : `≥ ${t}`)
console.log(`${made} cases, ${perScenario} per scenario, seed 20261107\n`)
console.log('Recall: true pairs found. Precision: reported pairs that are right.')
console.log('Wrong on moved lines: pairs that give a moved line the wrong partner.\n')
console.log(`| Scenario | ${THRESHOLDS.map(label).join(' | ')} |`)
console.log(`|---|${THRESHOLDS.map(() => '---').join('|')}|`)
const all = THRESHOLDS.map(emptyScore)
for (const [scenario, scores] of totals) {
  console.log(
    `| ${scenario} | ${scores.map((s) => `${pct(s.correct, s.truePairs)} / ${pct(s.correct, s.reported)} / ${s.wrongMoveLines}`).join(' | ')} |`,
  )
  for (const [i, s] of scores.entries())
    for (const k of Object.keys(s) as (keyof Score)[]) all[i]![k] += s[k]
}
console.log(
  `| **All** | ${all.map((s) => `**${pct(s.correct, s.truePairs)} / ${pct(s.correct, s.reported)} / ${s.wrongMoveLines}**`).join(' | ')} |`,
)
console.log('\nEach cell: recall / precision / wrong pairs on moved lines.\n')
console.log(`| Wrong pairs | ${THRESHOLDS.map(label).join(' | ')} |`)
console.log(`|---|${THRESHOLDS.map(() => '---').join('|')}|`)
for (const [scenario, scores] of totals) {
  console.log(`| ${scenario} | ${scores.map((s) => String(s.reported - s.correct)).join(' | ')} |`)
}
console.log(`| **All** | ${all.map((s) => `**${s.reported - s.correct}**`).join(' | ')} |`)
