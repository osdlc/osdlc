/* oxlint-disable no-console -- an experiment reports on stdout */
/**
 * Runs the pairing over the recent commits of the repository it runs in, with and without
 * edited-move pairing, and reports what it changes there: how many lines
 * get a different operation, how long it takes, and a sample of the pairs
 * it adds, to read by eye. Run from the package:
 *
 *   node experiments/edited-moves/history.ts [commits] [sample]
 */
import { runFailed } from '@osdlc/command-seam'
import { Git } from '@osdlc/typed-git'

import { EDITED_MOVE_SIMILARITY, pairLines } from '../../src/diff/operations.ts'
import { parseDiff } from '../../src/diff/parse.ts'
import { DIFF_FLAGS } from '../../src/git/change.ts'

const root = new Git(process.cwd()).topLevel()
if (root === null) throw new Error('run it inside a git repository')
const git = new Git(root)
const commits = Number(process.argv[2] ?? 300)
const sample = Number(process.argv[3] ?? 25)

const shas = git
  .rawChecked(['rev-list', '--no-merges', `--max-count=${commits}`, 'HEAD'])
  .stdout.split('\n')
  .filter((s) => s !== '')

let files = 0
let lines = 0
let relabelled = 0
let added = 0
let msOff = 0
let msOn = 0
const examples: string[] = []
const bySource = new Map<string, number>()
const editedMovePairs: string[] = []
const relabels = new Map<string, number>()

for (const sha of shas) {
  const r = git.raw(['diff', '-U0', ...DIFF_FLAGS, `${sha}^`, sha], {
    maxOutputBytes: 64_000_000,
  })
  if (runFailed(r)) continue
  const parsed = parseDiff(r.stdout).filter(
    (f) => !f.binary && f.added.length + f.removed.length < 20_000,
  )
  files += parsed.length
  let t = performance.now()
  const off = pairLines(parsed, () => true, { editedMoveSimilarity: null })
  msOff += performance.now() - t
  t = performance.now()
  const on = pairLines(parsed)
  msOn += performance.now() - t
  const key = (p: { removed: { file: number; index: number } }) =>
    `${p.removed.file}:${p.removed.index}`
  const before = new Map(off.pairs.map((p) => [key(p), p]))
  for (const [fi, f] of parsed.entries()) {
    lines += f.added.length + f.removed.length
    for (const side of ['added', 'removed'] as const) {
      for (const [i, op] of on.operations[fi]![side].entries()) {
        const was = off.operations[fi]![side][i]!
        if (op !== was) {
          relabelled += 1
          const k = `${side}: ${was} → ${op}`
          relabels.set(k, (relabels.get(k) ?? 0) + 1)
        }
      }
    }
  }
  for (const p of on.pairs) {
    const old = before.get(key(p))
    if (old !== undefined && old.added.file === p.added.file && old.added.index === p.added.index)
      continue
    added += 1
    bySource.set(p.by, (bySource.get(p.by) ?? 0) + 1)
    const from = parsed[p.removed.file]!
    const to = parsed[p.added.file]!
    const text = `${sha.slice(0, 10)} ${to.path} (${p.operation})\n  - ${from.removed[p.removed.index]!.text.trim()}\n  + ${to.added[p.added.index]!.text.trim()}`
    if (p.by === 'edited-move') editedMovePairs.push(text)
    else if (examples.length < sample) examples.push(text)
  }
}

console.log(
  `${shas.length} commits, ${files} files, ${lines} changed lines; threshold ${EDITED_MOVE_SIMILARITY}`,
)
console.log(`lines relabelled: ${relabelled} (${((100 * relabelled) / lines).toFixed(2)}%)`)
for (const [k, n] of [...relabels].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${n}`)
console.log(`pairs new or with a new partner: ${added}`)
for (const [k, n] of bySource) console.log(`  by ${k}: ${n}`)
console.log(`pairing time: ${msOff.toFixed(0)} ms off, ${msOn.toFixed(0)} ms on`)
// A seeded shuffle, so the sample is the same on every run.
let seed = 7
const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
const picked = editedMovePairs
  .map((e) => ({ e, k: next() }))
  .sort((a, b) => a.k - b.k)
  .slice(0, sample)
  .map((x) => x.e)
console.log(
  `\nrandom sample of ${picked.length} of the ${editedMovePairs.length} edited-move pairs:\n${picked.join('\n')}`,
)
console.log(
  `\nfirst new or re-partnered pairs from the other steps:\n${examples.slice(0, 10).join('\n')}`,
)
