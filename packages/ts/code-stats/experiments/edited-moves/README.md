# Experiment: pairing edited moves

## The question

When a block of code moves and some of its lines are also edited, does `code-stats` pair each
edited line with its new version? And if we teach it to, how strict should the match be?

Before this change, the identical lines of a moved block were found as `moved`. An edited line
inside it was only paired within its own diff block. Its new version sits in a different block
(where the code moved to), so the edited line was either left as `removed`, or paired with an
unrelated line that happened to be in its old block.

The fix: after a moved run is found, step outward from both of its ends, on the old and the new
side together. Pair each next pair of lines while they are similar enough. Identical lines pair
as `moved`, and the rest as `changed`. Stop at the first pair that is not similar enough. The
setting is `EDITED_MOVE_SIMILARITY` in `src/diff/operations.ts`, a Dice coefficient over
character pairs from 0 to 1.

## Method

Two experiments, both in this folder.

### 1. Edits with a known answer (`synthetic.ts`)

Each case takes a real file from the repository it runs in (TypeScript, Rust or Python). It moves a chunk
of it elsewhere in the file and, depending on the scenario, edits some of the chunk's lines. The
script records which old line every new line came from, so the right pairs are known. It diffs
the two versions with git, pairs the diff, and scores every reported pair against that record.

The scenarios:

- **moved, unedited**: a control case.
- **moved, one middle line edited**, **first line edited**, **last line edited**, **two lines
  edited**, **half its lines edited**: the case being fixed, at increasing amounts of editing.
- **moved, a name renamed throughout**: a common refactor.
- **moved, with unrelated lines beside both ends**: the lines next to both places change into
  something unrelated.
- **part of a block moved and edited, look-alike lines beside both ends**: the adversarial
  case. The line after the moved code is deleted at the old place, and a *different real line
  from the same file* is inserted after it at the new place. Those two lines look alike, but
  pairing them is wrong.

It ran 300 cases per scenario, 2,700 in all, with a fixed seed, so a rerun gives the same cases.

### 2. A repository's history (`history.ts`)

It runs the pairing over the last 400 commits, with and without the fix. It counts how many
lines get a different operation, and prints a seeded random sample of the pairs the fix makes,
to check by reading.

## Results

### Known answers

Recall is the share of the true pairs that were found. Precision is the share of reported pairs
that are right.

| Similarity needed | Recall | Precision | Wrong pairs |
| --- | ---: | ---: | ---: |
| fix off (before) | 79.1% | 99.7% | 48 |
| ≥ 0.3 | 95.4% | 99.7% | 61 |
| ≥ 0.4 | 95.3% | 99.8% | 54 |
| ≥ 0.5 | 95.1% | 99.8% | 52 |
| **≥ 0.6 (chosen)** | **94.7%** | **99.8%** | **49** |
| ≥ 0.7 | 94.2% | 99.8% | 47 |
| ≥ 0.8 | 92.6% | 99.8% | 47 |

By scenario, recall before → after at 0.6:

| Scenario | Before | After |
| --- | ---: | ---: |
| moved, unedited | 99.9% | 99.9% |
| moved, one middle line edited | 85.5% | 98.2% |
| moved, first line edited | 89.3% | 98.7% |
| moved, last line edited | 88.6% | 92.4% |
| moved, two lines edited | 73.3% | 94.0% |
| moved, half its lines edited | 26.0% | 77.2% |
| moved, a name renamed throughout | 77.1% | 97.7% |
| moved, with unrelated lines beside both ends | 99.1% | 99.3% |
| part of a block moved and edited, look-alike lines beside both ends | 56.7% | 92.9% |

All the extra wrong pairs at low settings come from the look-alike scenario: 15 at 0.3, 6 at
0.5, 3 at 0.6, and 1 (the same as before) at 0.7. At 0.5 they include
`pub struct CaptureTarget {` paired with `pub struct CaptureProposal {`, and `message: String,`
with `key: String,`. These are lines of the same shape that are not the same line. The 47 wrong
pairs present at every setting come from the old steps, not this one.

### History of the development repository

Over 400 commits and 147,184 changed lines, the fix relabels 871 lines (0.59%) and makes 438 new
pairs. Pairing takes the same time with and without it (about 0.4 s for all 400 commits). In a
random sample of 40 of those pairs, 39 are right. Most are renames inside moved code
(`&state.ctx_for` → `&host.ctx_for`, `splitRow` → `splitRow3`) or small edits to moved lines
(`const MAX_INTERVAL_MINS` → `pub const MAX_INTERVAL_MINS`). The one wrong pair is two
`version = "…"` lines in `Cargo.lock`, a generated file that reports leave out.

## Decision

**0.6.** It keeps almost all of the gain: recall goes from 79.1% to 94.7%, against 95.1% at 0.5.
In the look-alike scenario it makes 3 wrong pairs where the old code made 1, against 6 at 0.5
and 8 at 0.4. 0.7 makes no extra wrong pairs, but gives up another half point of recall. That
lost recall is mostly short edited lines, whose few characters leave little to compare.

## What it does not fix

- **A moved block with no identical run.** A move is still found only from 20 or more identical
  letters and digits in a row. A block whose every line was edited is not seen as moved, so its
  lines pair only within their old block, or not at all. This is the remaining gap in the
  half-edited scenario.
- **Very short edited lines,** such as `}` becoming `}, extra)`, share too little to pass 0.6.
- **Pairing inside a block had no similarity floor** when this experiment ran. A block's
  leftover lines paired as `changed` even when unrelated. Of the 508 pairs that changed in the
  history run, 70 came from that step re-pairing the leftovers, and some were of this kind.
  [`../block-pairing/`](../block-pairing/README.md) added a floor of 0.3. Rerun after it, this
  experiment makes the same edited-move pairs, and its wrong pairs at 0.6 fall from 57 to 22.

## Rerun

From `packages/ts/code-stats`:

```sh
node experiments/edited-moves/synthetic.ts 300        # cases per scenario
SHOW=0.6 node experiments/edited-moves/synthetic.ts   # also print wrong pairs and some misses
node experiments/edited-moves/history.ts 400 40       # commits, sample size
```

The numbers above are from the repository the package was developed in, which is private, so a
rerun on another repository gives other numbers. The synthetic cases depend on the repository's
files, so they shift a little as the code changes.
