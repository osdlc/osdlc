/* oxlint-disable no-console -- an experiment reports on stdout */
/**
 * Scores the pairing inside a diff block against edits whose right answer
 * is known.
 *
 * Each case takes real code from the repository it runs in and edits it in place:
 * small edits, renames, reworded comments, changed literals, heavy
 * rewrites, code replaced by unrelated code, or a mix. It records which old
 * line every new line came from, so the right pairs are known: an edited
 * line pairs with its edit, and unrelated code pairs with nothing. The diff
 * git makes of the two versions is paired at each similarity floor, and
 * every reported pair is checked against that record. The pairing as it
 * was before the floor (see `before.ts`) is scored too.
 * Run from the package:
 *
 *   node experiments/block-pairing/synthetic.ts [cases-per-scenario]
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Git } from '@osdlc/typed-git'

import { pairLines, type PairingOptions } from '../../src/diff/operations.ts'
import { parseDiff, type FileDiff } from '../../src/diff/parse.ts'
import { DIFF_FLAGS } from '../../src/git/change.ts'

import { pairLinesBefore, type Pairer } from './before.ts'

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
  scenario: Scenario
  before: string[]
  after: string[]
  origin: Origin[]
}

const SCENARIOS = [
  'in place: one or two small edits',
  'in place: a name renamed',
  'in place: a comment reworded',
  'in place: a literal changed',
  'in place: one line rewritten heavily',
  'code replaced by unrelated code',
  'edits, with unrelated lines inserted and deleted',
  'big block (> 64 lines) edited in place',
  'big block (> 64 lines) replaced by unrelated code',
  'big block (> 64 lines) cut to a few edited lines',
] as const
type Scenario = (typeof SCENARIOS)[number]
const BIG = SCENARIOS.filter((s) => s.startsWith('big'))

const pick = <T>(items: readonly T[], rand: () => number): T | undefined =>
  items[Math.floor(rand() * items.length)]

const alnum = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, '').length

/** Runs of non-blank lines between blank lines, as [start, end) line ranges. */
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

const IDENT = /\b[A-Za-z_][A-Za-z0-9_]{2,}\b/g
const isComment = (line: string) => /^(\/\/|\/\*|\*|#(?!\[|!\[))/.test(line.trim())

/** One small edit, as in `experiments/edited-moves/`: rename a word, change a number, add an argument, or append a comment. */
function edit(line: string, rand: () => number): string {
  const words = [...line.matchAll(IDENT)]
  const choice = rand()
  if (words.length > 0 && choice < 0.5) {
    const w = pick(words, rand)!
    return line.slice(0, w.index) + `${w[0]}Next` + line.slice(w.index + w[0].length)
  }
  if (/\d/.test(line) && choice < 0.65) return line.replace(/\d+/, (n) => String(Number(n) + 7))
  if (line.includes(')') && choice < 0.85) return line.replace(/\)(?!.*\))/, ', extra)')
  return `${line} // revised`
}

/** The file's words, to draw replacements from, so an edit uses the file's own vocabulary. */
function vocabulary(lines: readonly string[]): { idents: string[]; prose: string[] } {
  const idents = new Set<string>()
  const prose = new Set<string>()
  for (const line of lines) {
    for (const m of line.matchAll(IDENT)) idents.add(m[0])
    if (isComment(line)) for (const m of line.matchAll(/\b[a-z]{3,}\b/g)) prose.add(m[0])
  }
  return { idents: [...idents].sort(), prose: [...prose].sort() }
}

/** Replaces one to three of a comment's words with other words from the file's comments, and maybe adds a clause. */
function reword(line: string, prose: readonly string[], rand: () => number): string {
  const words = [...line.matchAll(/\b[a-z]{3,}\b/g)]
  let out = line
  const n = 1 + Math.floor(rand() * Math.min(3, words.length))
  for (const w of words.sort(() => rand() - 0.5).slice(0, n)) {
    const next = pick(prose, rand) ?? 'other'
    out = out.replace(new RegExp(`\\b${w[0]}\\b`), next)
  }
  if (rand() < 0.4) out += `, ${pick(prose, rand) ?? 'then'} ${pick(prose, rand) ?? 'more'}`
  return out
}

const STRING = /'[^'\n]*'|"[^"\n]*"|`[^`\n]*`/

/** Changes a string literal to another from the file, or a number to another number. */
function changeLiteral(line: string, strings: readonly string[], rand: () => number): string {
  const s = STRING.exec(line)
  if (s !== null && (rand() < 0.7 || !/\d/.test(line))) {
    const others = strings.filter((o) => o !== s[0])
    const next = pick(others, rand) ?? `${s[0][0]}changed${s[0][0]}`
    return line.slice(0, s.index) + next + line.slice(s.index + s[0].length)
  }
  return line.replace(/\d+/, (n) => String(Number(n) * 3 + 11))
}

/**
 * Rewrites a line heavily but keeps it the same line: most of its names
 * become other names from the file, and it gains an argument or a tail.
 */
function rewrite(line: string, idents: readonly string[], rand: () => number): string {
  let out = line.replace(IDENT, (w) => (rand() < 0.6 ? (pick(idents, rand) ?? w) : w))
  if (out.includes(')')) out = out.replace(/\)(?!.*\))/, `, ${pick(idents, rand) ?? 'extra'})`)
  else out = `${out} // ${pick(idents, rand) ?? 'note'}`
  return out
}

/** Old lines with `[s, e)` replaced by `replacement`: each new line and the old line it came from. */
function splice(
  lines: readonly string[],
  s: number,
  e: number,
  replacement: readonly [string, Origin][],
): Pick<Case, 'before' | 'after' | 'origin'> {
  const after: string[] = []
  const origin: Origin[] = []
  for (let i = 0; i < s; i += 1) {
    after.push(lines[i]!)
    origin.push(i)
  }
  for (const [line, o] of replacement) {
    after.push(line)
    origin.push(o)
  }
  for (let i = e; i < lines.length; i += 1) {
    after.push(lines[i]!)
    origin.push(i)
  }
  return { before: [...lines], after, origin }
}

/** A chunk of another file of the same language, for unrelated code. */
function otherChunk(
  sources: readonly string[],
  path: string,
  min: number,
  max: number,
  rand: () => number,
): string[] | null {
  const ext = path.replace(/.*\./, '.')
  for (let tries = 0; tries < 20; tries += 1) {
    const other = pick(sources, rand)!
    if (other === path || !other.endsWith(ext)) continue
    const lines = read(other)
    if (lines === null) continue
    const fits = chunks(lines).filter(([s, e]) => e - s >= min && e - s <= max)
    const c = pick(fits, rand)
    if (c !== undefined) return lines.slice(c[0], c[1])
  }
  return null
}

function read(path: string): string[] | null {
  try {
    return readFileSync(join(REPO, path), 'utf8').split('\n')
  } catch {
    return null
  }
}

function makeCase(
  scenario: Scenario,
  path: string,
  lines: string[],
  sources: readonly string[],
  rand: () => number,
): Case | null {
  const big = scenario.startsWith('big')
  const fits = chunks(lines).filter(([s, e]) =>
    big ? e - s >= 65 : e - s >= 3 && e - s <= 25 && alnum(lines.slice(s, e).join('')) >= 60,
  )
  const chunk = pick(fits, rand)
  if (chunk === undefined) return null
  const [s, e] = chunk
  const n = e - s
  const { idents, prose } = vocabulary(lines)
  const kept = (j: number): [string, Origin] => [lines[s + j]!, s + j]
  const each = (f: (line: string, j: number) => string | null): [string, Origin][] | null => {
    const out = Array.from({ length: n }, (_, j): [string, Origin] => {
      const next = f(lines[s + j]!, j)
      return next === null ? kept(j) : [next, s + j]
    })
    return out.some(([l], j) => l !== lines[s + j]) ? out : null
  }
  const someLines = (ok: (line: string) => boolean, most: number): Set<number> => {
    const candidates = Array.from({ length: n }, (_, j) => j).filter((j) => ok(lines[s + j]!))
    const count = 1 + Math.floor(rand() * Math.min(most, candidates.length))
    return new Set(candidates.sort(() => rand() - 0.5).slice(0, count))
  }

  let replacement: [string, Origin][] | null = null
  switch (scenario) {
    case 'in place: one or two small edits': {
      const at = someLines((l) => alnum(l) >= 4, 2)
      replacement = each((l, j) => (at.has(j) ? edit(l, rand) : null))
      break
    }
    case 'in place: a name renamed': {
      const names = [
        ...lines
          .slice(s, e)
          .join('\n')
          .matchAll(/\b[a-z_][A-Za-z0-9_]{3,}\b/g),
      ]
      const name = pick(names, rand)?.[0]
      const to = pick(
        idents.filter((w) => w.length >= 4 && w !== name),
        rand,
      )
      if (name === undefined || to === undefined) return null
      const re = new RegExp(`\\b${name}\\b`, 'g')
      replacement = each((l) => l.replace(re, to))
      break
    }
    case 'in place: a comment reworded': {
      const at = someLines((l) => isComment(l) && /\b[a-z]{3,}\b/.test(l), 2)
      if (at.size === 0) return null
      replacement = each((l, j) => (at.has(j) ? reword(l, prose, rand) : null))
      break
    }
    case 'in place: a literal changed': {
      const strings = lines.flatMap((l) => (STRING.exec(l) ?? []) as string[])
      const at = someLines((l) => !isComment(l) && (STRING.test(l) || /\d/.test(l)), 1)
      if (at.size === 0) return null
      replacement = each((l, j) => (at.has(j) ? changeLiteral(l, strings, rand) : null))
      break
    }
    case 'in place: one line rewritten heavily': {
      const at = someLines((l) => !isComment(l) && [...l.matchAll(IDENT)].length >= 3, 1)
      if (at.size === 0) return null
      replacement = each((l, j) => (at.has(j) ? rewrite(l, idents, rand) : null))
      break
    }
    case 'code replaced by unrelated code': {
      const other = otherChunk(sources, path, Math.max(3, n >> 1), n * 2, rand)
      if (other === null) return null
      replacement = other.map((l): [string, Origin] => [l, null])
      break
    }
    case 'edits, with unrelated lines inserted and deleted': {
      if (n < 5) return null
      const other = otherChunk(sources, path, 3, 40, rand)
      if (other === null) return null
      const order = Array.from({ length: n }, (_, j) => j).sort(() => rand() - 0.5)
      const edited = new Set(order.slice(0, 1 + Math.floor(rand() * 2)))
      const deleted = new Set(order.slice(2, 3 + Math.floor(rand() * 2)))
      const inserts = 1 + Math.floor(rand() * 3)
      const out: [string, Origin][] = []
      for (let j = 0; j < n; j += 1) {
        if (rand() < inserts / n) out.push([pick(other, rand)!, null])
        if (deleted.has(j)) continue
        out.push(edited.has(j) ? [edit(lines[s + j]!, rand), s + j] : kept(j))
      }
      replacement = out
      break
    }
    case 'big block (> 64 lines) edited in place': {
      // Every line re-indented, so git sees one block. One in four also edited, and up to two
      // deleted and up to two unrelated ones inserted.
      const other = otherChunk(sources, path, 3, 200, rand)
      if (other === null) return null
      const out: [string, Origin][] = []
      const deleted = new Set([Math.floor(rand() * n), Math.floor(rand() * n)])
      const inserted = new Set([Math.floor(rand() * n), Math.floor(rand() * n)])
      for (let j = 0; j < n; j += 1) {
        if (inserted.has(j)) out.push([`  ${pick(other, rand)!}`, null])
        if (deleted.has(j)) continue
        const line = `  ${lines[s + j]!}`
        out.push([rand() < 0.25 ? edit(line, rand) : line, s + j])
      }
      replacement = out
      break
    }
    case 'big block (> 64 lines) replaced by unrelated code': {
      const other = otherChunk(sources, path, 65, 400, rand)
      if (other === null) return null
      replacement = other.map((l): [string, Origin] => [l, null])
      break
    }
    case 'big block (> 64 lines) cut to a few edited lines': {
      const at = [...someLines((l) => alnum(l) >= 8, 4)].sort((a, b) => a - b)
      replacement = at.map((j): [string, Origin] => [edit(lines[s + j]!, rand), s + j])
      break
    }
  }
  if (replacement === null) return null
  return { scenario, ...splice(lines, s, e, replacement) }
}

/** Dice's coefficient over character bigrams of trimmed lines, as `src/diff/operations.ts` computes it. */
function dice(x: string, y: string): number {
  const a = x.trim()
  const b = y.trim()
  if (a === b) return 1
  const grams = (t: string) => {
    const m = new Map<string, number>()
    for (let i = 0; i + 1 < t.length; i += 1)
      m.set(t.slice(i, i + 2), (m.get(t.slice(i, i + 2)) ?? 0) + 1)
    return m
  }
  const ga = grams(a)
  const gb = grams(b)
  let shared = 0
  for (const [g, k] of ga) shared += Math.min(k, gb.get(g) ?? 0)
  const total = Math.max(0, a.length - 1) + Math.max(0, b.length - 1)
  return total === 0 ? 0 : (2 * shared) / total
}

interface Score {
  truePairs: number
  reported: number
  correct: number
  /** Lines, on either side, that should pair and did not, whatever partner a paired line got. */
  missedLines: number
  /** Lines, on either side, that paired and should not have. */
  extraLines: number
  /** Time spent pairing, in milliseconds. */
  ms: number
}

const emptyScore = (): Score => ({
  truePairs: 0,
  reported: 0,
  correct: 0,
  missedLines: 0,
  extraLines: 0,
  ms: 0,
})

interface Config {
  label: string
  pair: Pairer
}

/** The similarities of the true pairs, by scenario. */
const trueSimilarities = new Map<Scenario, number[]>()

function scoreCase(c: Case, dir: string, configs: readonly Config[]): Score[] {
  writeFileSync(join(dir, 'a'), `${c.before.join('\n')}\n`)
  writeFileSync(join(dir, 'b'), `${c.after.join('\n')}\n`)
  // `--no-index` exits 1 when the files differ, so the run is read whatever its exit.
  const out = new Git(dir).raw(['diff', '--no-index', '-U0', ...DIFF_FLAGS, 'a', 'b'])
  const [file] = parseDiff(out.stdout)
  if (file === undefined) return configs.map(emptyScore)
  const removedAt = new Set(file.removed.map((l) => l.at - 1))
  const addedAt = new Set(file.added.map((l) => l.at - 1))
  // A true pair: an old line and the new line that came from it, both in the diff.
  const truth = new Map<number, number>()
  for (const [j, o] of c.origin.entries()) {
    if (o !== null && removedAt.has(o) && addedAt.has(j)) truth.set(o, j)
  }
  const sims = trueSimilarities.get(c.scenario) ?? []
  for (const [o, j] of truth) sims.push(dice(c.before[o]!, c.after[j]!))
  trueSimilarities.set(c.scenario, sims)
  return configs.map((config) => {
    const t = performance.now()
    const { pairs } = config.pair([file])
    const score = emptyScore()
    score.ms = performance.now() - t
    if (SHOW !== undefined && config.label === SHOW) show(c, file, pairs, truth)
    score.truePairs = truth.size
    const pairedFrom = new Set<number>()
    const pairedTo = new Set<number>()
    for (const p of pairs) {
      const from = file.removed[p.removed.index]!.at - 1
      const to = file.added[p.added.index]!.at - 1
      pairedFrom.add(from)
      pairedTo.add(to)
      score.reported += 1
      if (truth.get(from) === to) score.correct += 1
    }
    const truthTo = new Set(truth.values())
    for (const from of pairedFrom) if (!truth.has(from)) score.extraLines += 1
    for (const to of pairedTo) if (!truthTo.has(to)) score.extraLines += 1
    for (const from of truth.keys()) if (!pairedFrom.has(from)) score.missedLines += 1
    for (const to of truthTo) if (!pairedTo.has(to)) score.missedLines += 1
    return score
  })
}

/** With `SHOW=<label>`, print the wrong pairs and some misses of that setting, such as `SHOW='≥ 0.3'`. */
const SHOW = process.env.SHOW
let shownMisses = 0
function show(
  c: Case,
  file: FileDiff,
  pairs: ReturnType<typeof pairLines>['pairs'],
  truth: Map<number, number>,
): void {
  const reported = new Map(
    pairs.map((p) => [file.removed[p.removed.index]!.at - 1, file.added[p.added.index]!.at - 1]),
  )
  for (const [from, to] of reported) {
    if (truth.get(from) !== to) {
      console.log(
        `WRONG [${c.scenario}] ${dice(c.before[from]!, c.after[to]!).toFixed(2)}\n  - ${c.before[from]!.trim()}\n  + ${c.after[to]!.trim()}`,
      )
    }
  }
  for (const [from, to] of truth) {
    if (reported.get(from) !== to && shownMisses < 30) {
      shownMisses += 1
      console.log(
        `MISSED [${c.scenario}] ${dice(c.before[from]!, c.after[to]!).toFixed(2)}\n  - ${c.before[from]!.trim()}\n  + ${c.after[to]!.trim()}`,
      )
    }
  }
}

const perScenario = Number(process.argv[2] ?? 150)
const FLOORS = [0, 0.1, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6] as const
/** Settings of {@link PairingOptions.pairingWork} tried on the big blocks: 0 pairs them by position. */
const WORKS = [0, 8, 32, 128] as const
const sources = new Git(REPO)
  .lsFiles({ paths: ['*.ts', '*.rs', '*.py'] })
  .filter((p) => !/(^|\/)(packs|_generated|dist|vendor)\/|\.min\.|\.generated\.|\.d\.ts$/.test(p))
  .sort()

const before = pairLinesBefore
const dir = mkdtempSync(join(tmpdir(), 'block-pairing-'))
const withOptions =
  (options: PairingOptions): Pairer =>
  (files) =>
    pairLines(files, () => true, options)
const CONFIGS: Config[] = [
  { label: 'before', pair: before },
  ...FLOORS.map((f) => ({ label: `≥ ${f}`, pair: withOptions({ changedSimilarity: f }) })),
  ...FLOORS.flatMap((f) =>
    WORKS.map((w) => ({
      label: `≥ ${f}, work ${w}`,
      pair: withOptions({ changedSimilarity: f, pairingWork: w }),
    })),
  ),
]

const rand = random(20261108)
const totals = new Map<Scenario, Score[]>()
let made = 0
try {
  for (const scenario of SCENARIOS) {
    const scores = CONFIGS.map(emptyScore)
    let count = 0
    let tries = 0
    while (count < perScenario && tries < perScenario * 40) {
      tries += 1
      const path = pick(sources, rand)!
      const lines = read(path)
      if (lines === null || lines.length < 30 || lines.length > 3000) continue
      const c = makeCase(scenario, path, lines, sources, rand)
      if (c === null) continue
      for (const [i, s] of scoreCase(c, dir, CONFIGS).entries()) {
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
const sum = (scores: readonly Score[]) =>
  scores.reduce((t, s) => {
    for (const k of Object.keys(s) as (keyof Score)[]) t[k] += s[k]
    return t
  }, emptyScore())
const column = (label: string) => CONFIGS.findIndex((c) => c.label === label)
const MAIN = ['before', ...FLOORS.map((f) => `≥ ${f}`)]

console.log(`${made} cases, ${perScenario} per scenario, seed 20261108\n`)
const summary = (title: string, scenarios: readonly Scenario[]) => {
  console.log(`## ${title}\n`)
  console.log(
    '| Floor | Recall | Precision | Right pairs | Wrong pairs | Missed pairs | Lines wrongly changed | Lines wrongly not changed |',
  )
  console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
  for (const label of MAIN) {
    const s = sum(scenarios.map((scenario) => totals.get(scenario)![column(label)]!))
    console.log(
      `| ${label} | ${pct(s.correct, s.truePairs)} | ${pct(s.correct, s.reported)} | ${s.correct} | ${s.reported - s.correct} | ${s.truePairs - s.correct} | ${s.extraLines} | ${s.missedLines} |`,
    )
  }
  console.log('')
}
summary(
  'Blocks of up to 64 lines',
  SCENARIOS.filter((s) => !BIG.includes(s)),
)
summary('Big blocks, with the default work per line', BIG)
console.log('## Wrong pairs / missed pairs, by scenario\n')
console.log(
  'Each cell: wrong pairs / missed pairs. The default work per line applies to big blocks.\n',
)
console.log(`| Scenario | True pairs | ${MAIN.join(' | ')} |`)
console.log(`| --- | ---: | ${MAIN.map(() => '---:').join(' | ')} |`)
for (const [scenario, scores] of totals) {
  const cells = MAIN.map((label) => {
    const s = scores[column(label)]!
    return `${s.reported - s.correct} / ${s.truePairs - s.correct}`
  })
  console.log(`| ${scenario} | ${scores[0]!.truePairs} | ${cells.join(' | ')} |`)
}

console.log('\n## How alike the true pairs are: the share under each floor\n')
console.log(
  `| Scenario | Median | ${FLOORS.slice(1)
    .map((f) => `< ${f}`)
    .join(' | ')} |`,
)
console.log(
  `| --- | ---: | ${FLOORS.slice(1)
    .map(() => '---:')
    .join(' | ')} |`,
)
for (const scenario of SCENARIOS) {
  const sims = (trueSimilarities.get(scenario) ?? []).sort((a, b) => a - b)
  if (sims.length === 0) continue
  const under = FLOORS.slice(1).map((f) => pct(sims.filter((x) => x < f).length, sims.length))
  console.log(
    `| ${scenario} | ${sims[Math.floor(sims.length / 2)]!.toFixed(2)} | ${under.join(' | ')} |`,
  )
}

console.log('\n## Big blocks: wrong / missed pairs, and pairing time, by work per line\n')
console.log(`| Floor | ${WORKS.map((w) => (w === 0 ? 'by position' : `work ${w}`)).join(' | ')} |`)
console.log(`| --- | ${WORKS.map(() => '---').join(' | ')} |`)
for (const f of FLOORS) {
  const cells = WORKS.map((w) => {
    const s = sum(BIG.map((b) => totals.get(b)![column(`≥ ${f}, work ${w}`)]!))
    return `${s.reported - s.correct} / ${s.truePairs - s.correct} (${s.ms.toFixed(0)} ms)`
  })
  console.log(`| ≥ ${f} | ${cells.join(' | ')} |`)
}
const beforeBig = sum(BIG.map((b) => totals.get(b)![0]!))
console.log(
  `\nbefore: ${beforeBig.reported - beforeBig.correct} / ${beforeBig.truePairs - beforeBig.correct} (${beforeBig.ms.toFixed(0)} ms), of ${beforeBig.truePairs} true pairs`,
)
