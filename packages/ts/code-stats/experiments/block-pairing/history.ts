/* oxlint-disable no-console -- an experiment reports on stdout */
/**
 * Runs the pairing over the recent commits of the repository it runs in, as it was before
 * the similarity floor and at each floor, and reports what the floor
 * changes there: how many changed pairs it splits into a removed and an
 * added line, how many it makes or re-partners, how long pairing takes,
 * and seeded samples of the split and the made pairs, to read by eye. Run
 * from the package:
 *
 *   node experiments/block-pairing/history.ts [commits] [sample]
 *
 * With `BETWEEN=0.3,0.4`, it also samples 30 of the pairs one floor keeps
 * and the next splits, to read what a higher floor would give up.
 */
import { runFailed } from '@osdlc/command-seam'
import { Git } from '@osdlc/typed-git'

import { CHANGED_SIMILARITY, pairLines, type Pairing } from '../../src/diff/operations.ts'
import { parseDiff, type FileDiff } from '../../src/diff/parse.ts'
import { DIFF_FLAGS } from '../../src/git/change.ts'
import { pairLinesBefore } from './before.ts'

const root = new Git(process.cwd()).topLevel()
if (root === null) throw new Error('run it inside a git repository')
const git = new Git(root)
const commits = Number(process.argv[2] ?? 400)
const sample = Number(process.argv[3] ?? 40)
const FLOORS = [0, 0.1, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6] as const
const between = process.env.BETWEEN?.split(',').map(Number)

const before = pairLinesBefore
const shas = git
  .rawChecked(['rev-list', '--no-merges', `--max-count=${commits}`, 'HEAD'])
  .stdout.split('\n')
  .filter((s) => s !== '')

interface Tally {
  /** Changed pairs made inside blocks. */
  blockPairs: number
  /** Pairs before made that this setting leaves as a removed and an added line. */
  split: number
  /** Pairs this setting makes whose removed line before left unpaired. */
  made: number
  /** Removed lines paired both before and now, with a different partner. */
  repartnered: number
  ms: number
}
const tallies = new Map<string, Tally>(
  ['before', ...FLOORS.map(String)].map((k) => [
    k,
    { blockPairs: 0, split: 0, made: 0, repartnered: 0, ms: 0 },
  ]),
)

let files = 0
let lines = 0
const splitAtDefault: string[] = []
const splitBetween: string[] = []
const madeAtDefault: string[] = []

/** A pair as text: its commit, its file, and its two lines. */
function describe(sha: string, parsed: readonly FileDiff[], p: Pairing['pairs'][number]): string {
  const from = parsed[p.removed.file]!.removed[p.removed.index]!.text.trim()
  const to = parsed[p.added.file]!.added[p.added.index]!.text.trim()
  return `${sha.slice(0, 10)} ${parsed[p.added.file]!.path}\n  - ${from}\n  + ${to}`
}

for (const sha of shas) {
  const r = git.raw(['diff', '-U0', ...DIFF_FLAGS, `${sha}^`, sha], {
    maxOutputBytes: 64_000_000,
  })
  if (runFailed(r)) continue
  const parsed = parseDiff(r.stdout).filter(
    (f) => !f.binary && f.added.length + f.removed.length < 20_000,
  )
  files += parsed.length
  for (const f of parsed) lines += f.added.length + f.removed.length
  const key = (l: { file: number; index: number }) => `${l.file}:${l.index}`

  let t = performance.now()
  const old = before(parsed)
  const oldMs = performance.now() - t
  const oldPartner = new Map(old.pairs.map((p) => [key(p.removed), key(p.added)]))
  const runs: [string, Pairing, number][] = [['before', old, oldMs]]
  for (const floor of FLOORS) {
    t = performance.now()
    const now = pairLines(parsed, () => true, { changedSimilarity: floor })
    runs.push([String(floor), now, performance.now() - t])
  }
  if (between !== undefined) {
    const [lo, hi] = between as [number, number]
    const kept = runs.find(([label]) => label === String(lo))![1]
    const higher = new Set(
      runs.find(([label]) => label === String(hi))![1].pairs.map((p) => key(p.removed)),
    )
    for (const p of kept.pairs) {
      if (p.by === 'block' && !higher.has(key(p.removed))) {
        splitBetween.push(describe(sha, parsed, p))
      }
    }
  }
  for (const [label, now, ms] of runs) {
    const tally = tallies.get(label)!
    tally.ms += ms
    const partner = new Map(now.pairs.map((p) => [key(p.removed), key(p.added)]))
    for (const p of now.pairs) {
      if (p.by === 'block') tally.blockPairs += 1
      const was = oldPartner.get(key(p.removed))
      if (was === undefined) {
        tally.made += 1
        if (label === String(CHANGED_SIMILARITY)) madeAtDefault.push(describe(sha, parsed, p))
      } else if (was !== key(p.added)) tally.repartnered += 1
    }
    for (const p of old.pairs) {
      if (partner.has(key(p.removed))) continue
      tally.split += 1
      if (label === String(CHANGED_SIMILARITY)) splitAtDefault.push(describe(sha, parsed, p))
    }
  }
}

console.log(
  `${shas.length} commits, ${files} files, ${lines} changed lines; default floor ${CHANGED_SIMILARITY}\n`,
)
console.log(
  '| Floor | Changed pairs in blocks | Pairs split into removed + added | Pairs made | Pairs re-partnered | Pairing time |',
)
console.log('| --- | ---: | ---: | ---: | ---: | ---: |')
for (const [label, t] of tallies) {
  console.log(
    `| ${label === 'before' ? 'before' : `≥ ${label}`} | ${t.blockPairs} | ${t.split} | ${t.made} | ${t.repartnered} | ${(t.ms / 1000).toFixed(1)} s |`,
  )
}

/** A seeded shuffle, so the sample is the same on every run. */
function seeded<T>(items: readonly T[], n: number, start = 7): T[] {
  let seed = start
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
  return items
    .map((e) => ({ e, k: next() }))
    .sort((a, b) => a.k - b.k)
    .slice(0, n)
    .map((x) => x.e)
}
console.log(
  `\nrandom sample of ${Math.min(sample, splitAtDefault.length)} of the ${splitAtDefault.length} pairs split at ${CHANGED_SIMILARITY}:\n${seeded(splitAtDefault, sample).join('\n')}`,
)
console.log(
  `\nrandom sample of ${Math.min(10, madeAtDefault.length)} of the ${madeAtDefault.length} pairs made at ${CHANGED_SIMILARITY}:\n${seeded(madeAtDefault, 10).join('\n')}`,
)
if (between !== undefined) {
  console.log(
    `\nrandom sample of ${Math.min(30, splitBetween.length)} of the ${splitBetween.length} pairs kept at ${between[0]} and split at ${between[1]}:\n${seeded(splitBetween, 30, 11).join('\n')}`,
  )
}
