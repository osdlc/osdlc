# Experiment: pairing lines inside a block

## The question

Inside one block of a diff, which removed line became which added line? And when should a
removed and an added line not pair at all?

Before this change, `code-stats` always paired `min(removed, added)` lines in a block, most
similar first, however little they shared. So code replaced by unrelated code was reported as
`changed`. Deleting one 10-line function and adding an unrelated one in its place gave 10
changed lines and no added or removed ones. A block with more than 64 lines on a side paired
its lines by position, first with first, so one inserted line put every later pair off by one.

The fix has three parts, all in `src/diff/operations.ts`:

- **A floor.** A pair must be at least `CHANGED_SIMILARITY` alike (Dice over character pairs,
  0 to 1, the same measure the edited-move step uses). Lines less alike stay `removed` and
  `added`.
- **Ties go to the nearer line.** Of two equally similar candidates, the one nearer the removed
  line's own place in the block wins. Before, the earlier line won. This keeps repeated lines,
  such as `}`, in order.
- **Big blocks compare nearby lines.** A block with more than 64 lines on a side still compares
  every pair when one side is short: while `removed × added ≤ 32 × (removed + added)`. Past
  that, each removed line is compared with the 32 added lines on either side of its own place.
  That is `PAIRING_WORK`, the same work per line as a block of 64 and 64 lines.

## Method

Two experiments, both in this folder. `operations-before.ts` holds `operations.ts` as it was
before the floor, so both score the old code beside the new.

### 1. Edits with a known answer (`synthetic.ts`)

Each case takes real code from the repository it runs in (TypeScript, Rust or Python) and edits it in
place. The script records which old line every new line came from. An edited line should pair
with its edit; unrelated code should pair with nothing. It diffs the two versions with git, using
the production `DIFF_FLAGS`, pairs the diff, and scores every reported pair.

The scenarios, run inside a run of non-blank lines:

- **one or two small edits**: rename a word, change a number, add an argument, or append a
  comment, as in `experiments/edited-moves/`.
- **a name renamed**: one name, everywhere in the chunk, becomes another name from the file.
- **a comment reworded**: one or two comment lines get other words from the file's comments.
- **a literal changed**: a string becomes another string from the file, or a number changes.
- **one line rewritten heavily**: most of a line's names become other names, and it gains an
  argument. Still the same line.
- **code replaced by unrelated code**: a chunk becomes a chunk of another file in the same
  language. No pair is right.
- **edits, with unrelated lines inserted and deleted**: one or two lines edited, one or two
  deleted, and lines from another file inserted, all in one place.
- **big block edited in place**: a run of 65 or more lines, every line re-indented (so git sees
  one block), one in four also edited, two deleted and two unrelated lines inserted.
- **big block replaced by unrelated code**: a run of 65 or more lines becomes a run of 65 or
  more from another file.
- **big block cut to a few edited lines**: a run of 65 or more lines becomes one to four of its
  lines, edited.

It ran 300 cases per scenario, 3,000 in all, with a fixed seed.

### 2. A repository's history (`history.ts`)

It pairs the last 400 commits with the old code and at each floor. It counts the pairs the floor
splits into a removed and an added line, and prints a seeded random sample of them to read. With
`BETWEEN`, it also samples the pairs one floor keeps and the next splits.

## Results

Recall is the share of the true pairs that were found. Precision is the share of reported pairs
that are right. "Lines wrongly changed" counts lines that paired but should not have; "lines
wrongly not changed" counts lines that should have paired and did not, whatever the partner.
These two are what the report's totals depend on.

### Blocks of up to 64 lines

| Floor | Recall | Precision | Right pairs | Wrong pairs | Lines wrongly changed | Lines wrongly not changed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| before | 99.2% | 51.0% | 2,506 | 2,403 | 4,781 | 15 |
| ≥ 0 | 99.4% | 51.1% | 2,510 | 2,399 | 4,778 | 12 |
| ≥ 0.1 | 97.0% | 62.7% | 2,451 | 1,461 | 2,917 | 145 |
| ≥ 0.2 | 96.2% | 79.5% | 2,429 | 626 | 1,248 | 190 |
| ≥ 0.25 | 95.5% | 86.1% | 2,412 | 390 | 777 | 225 |
| **≥ 0.3 (chosen)** | **93.9%** | **90.7%** | **2,371** | **244** | **485** | **307** |
| ≥ 0.35 | 92.3% | 94.0% | 2,332 | 148 | 293 | 385 |
| ≥ 0.4 | 90.6% | 96.1% | 2,288 | 92 | 181 | 473 |
| ≥ 0.5 | 86.7% | 97.5% | 2,191 | 57 | 111 | 667 |
| ≥ 0.6 | 79.9% | 97.5% | 2,019 | 51 | 99 | 1,011 |

### Big blocks (more than 64 lines on a side), with 32 per line

| Floor | Recall | Precision | Right pairs | Wrong pairs | Lines wrongly changed | Lines wrongly not changed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| before | 60.0% | 38.0% | 20,292 | 33,067 | 41,049 | 2,015 |
| ≥ 0 | 94.3% | 60.0% | 31,929 | 21,299 | 40,164 | 1,392 |
| ≥ 0.2 | 91.8% | 79.8% | 31,067 | 7,877 | 13,944 | 3,740 |
| **≥ 0.3** | **91.4%** | **88.8%** | **30,915** | **3,901** | **6,139** | **4,191** |
| ≥ 0.4 | 91.3% | 93.4% | 30,893 | 2,198 | 2,746 | 4,248 |
| ≥ 0.6 | 90.6% | 95.0% | 30,650 | 1,603 | 1,594 | 4,772 |

The jump from "before" to "≥ 0" comes from comparing nearby lines instead of pairing by position,
and from the nearer-line tie-break.

### By scenario: wrong pairs / missed pairs

| Scenario | True pairs | before | ≥ 0.2 | ≥ 0.25 | ≥ 0.3 | ≥ 0.35 | ≥ 0.4 | ≥ 0.5 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| in place: one or two small edits | 450 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| in place: a name renamed | 602 | 0 / 0 | 0 / 7 | 0 / 11 | 0 / 14 | 0 / 19 | 0 / 26 | 0 / 35 |
| in place: a comment reworded | 411 | 0 / 0 | 0 / 1 | 0 / 2 | 0 / 3 | 0 / 4 | 0 / 8 | 0 / 17 |
| in place: a literal changed | 300 | 0 / 0 | 0 / 13 | 0 / 15 | 0 / 26 | 0 / 37 | 0 / 50 | 0 / 76 |
| in place: one line rewritten heavily | 300 | 0 / 0 | 0 / 9 | 0 / 19 | 0 / 27 | 0 / 49 | 0 / 69 | 0 / 119 |
| code replaced by unrelated code | 0 | 2,193 / 0 | 605 / 0 | 376 / 0 | 235 / 0 | 141 / 0 | 87 / 0 | 53 / 0 |
| edits, with unrelated lines inserted and deleted | 463 | 210 / 20 | 21 / 67 | 14 / 67 | 9 / 85 | 7 / 85 | 5 / 85 | 4 / 88 |
| big block edited in place | 33,102 | 12,780 / 12,843 | 1,021 / 2,726 | 942 / 2,784 | 923 / 2,878 | 915 / 2,882 | 910 / 2,900 | 897 / 2,977 |
| big block replaced by unrelated code | 0 | 19,580 / 0 | 6,807 / 0 | 4,525 / 0 | 2,929 / 0 | 1,903 / 0 | 1,239 / 0 | 775 / 0 |
| big block cut to a few edited lines | 740 | 707 / 707 | 49 / 49 | 49 / 49 | 49 / 49 | 49 / 49 | 49 / 49 | 49 / 49 |

How alike the true pairs are, as the share below each floor:

| Scenario | Median | < 0.2 | < 0.3 | < 0.4 | < 0.5 |
| --- | ---: | ---: | ---: | ---: | ---: |
| one or two small edits | 0.92 | 0.0% | 0.0% | 0.0% | 0.0% |
| a name renamed | 0.85 | 1.2% | 2.3% | 4.3% | 5.8% |
| a comment reworded | 0.79 | 0.2% | 0.7% | 1.9% | 4.1% |
| a literal changed | 0.73 | 4.3% | 8.7% | 16.7% | 25.3% |
| one line rewritten heavily | 0.54 | 3.0% | 9.0% | 23.0% | 39.7% |
| edits, with unrelated lines inserted and deleted | 0.90 | 14.3% | 18.1% | 18.1% | 18.8% |

Most misses in the mixed scenario are very short lines: `}` that became `} // revised` shares no
character pair with `}`, so it scores 0 at any floor.

### Big blocks: compare nearby lines, or pair by position?

Wrong pairs / missed pairs over the three big-block scenarios, and the time spent pairing them:

| Floor | By position | 8 per line | **32 per line** | 128 per line |
| --- | --- | --- | --- | --- |
| ≥ 0 | 32,936 / 13,419 (284 ms) | 21,053 / 1,858 (1.2 s) | 21,299 / 1,913 (2.7 s) | 21,454 / 1,945 (5.5 s) |
| ≥ 0.3 | 4,137 / 14,165 (383 ms) | 3,166 / 2,928 (1.0 s) | **3,901 / 2,927 (2.1 s)** | 4,209 / 2,929 (3.8 s) |
| ≥ 0.4 | 2,557 / 14,180 (381 ms) | 1,873 / 2,950 (1.0 s) | 2,198 / 2,949 (2.1 s) | 2,336 / 2,951 (3.8 s) |

By position, with the floor, still misses 14,000 pairs: one inserted line shifts every later
pair. Comparing nearby lines finds almost all of them. Eight lines either side does as well here,
with fewer wrong pairs, because these cases shift by at most two lines; 32 allows for larger
shifts at about 2 ms per case. A wider window, 128 per line, adds time and no accuracy.

### History of the development repository

400 commits, 151,839 changed lines:

| Floor | Changed pairs in blocks | Pairs split into removed + added | Pairs made | Pairs re-partnered |
| --- | ---: | ---: | ---: | ---: |
| before | 8,980 | 0 | 0 | 0 |
| ≥ 0 | 8,980 | 98 | 98 | 196 |
| ≥ 0.2 | 8,431 | 605 | 56 | 128 |
| ≥ 0.25 | 8,280 | 752 | 52 | 125 |
| **≥ 0.3** | **8,045** | **980** | **45** | **121** |
| ≥ 0.35 | 7,797 | 1,217 | 34 | 114 |
| ≥ 0.4 | 7,533 | 1,474 | 27 | 111 |
| ≥ 0.5 | 6,934 | 2,066 | 20 | 96 |
| ≥ 0.6 | 6,200 | 2,798 | 18 | 91 |

Pairing takes 0.2 s for all 400 commits, before and after. "Pairs made" and "re-partnered" come
from the tie-break and from big blocks, where a few lines against many now pair by similarity
rather than by position.

Read by eye, a seeded sample of 40 of the 980 pairs split at 0.3:

- **35 are rightly split.** The lines are unrelated: `total.added += c.added` and
  `) as OperationCounts`, `isEntryPoint,` and `import {`, `sample_min: u64,` and
  `big: HashSet<PathBuf>,`, two different doc-comment sentences.
- **4 are the same line, heavily edited:** a Markdown table row that gained a PR link
  (`| UX-36 | | open |`), `return {}` that gained two fields, a `<th>` that gained attributes,
  and a fixture string rewritten.
- **1 is unclear:** a lone `{` joined onto the line before it.

Two more samples of 30 (`BETWEEN`, below) test the floor's neighbours. Of the pairs split
between 0.25 and 0.3, about 24 are unrelated lines and 6 are edits (`.take(limit)` to
`.take(self.rows as usize)`, `Ledger: {` to `Rows: {`). Of those between 0.3 and 0.4, about 16
are unrelated, 9 are edits (`title="Store"` to `title="Backup location"`, `v-else` to
`v-else-if`, a version bump in a lockfile) and 5 are unclear, mostly a line split over several.

The 45 pairs made at 0.3 are mixed: in a sample of 10, three pair `}` with `}`, one is a reworded
doc comment, and six pair lines that only share a few letters.

## Decision

**A floor of 0.3, and 32 per line for big blocks.**

- In blocks of up to 64 lines, 0.3 removes 90% of the wrong pairs (2,399 to 244) and keeps 94.5%
  of the right ones (2,510 to 2,371). Up to 0.3, each step removes at least three wrong pairs for
  every right one it loses. Above it the trade evens out: 0.3 to 0.4 removes 152 wrong pairs and
  loses 83 right ones, and in history about a third of the extra splits are real edits.
- The losses at 0.3 are heavy rewrites (9% of them) and changed literals (9%), where the old and
  new lines share little text. Small edits, renames and reworded comments keep 97% or more.
- Comparing nearby lines beats pairing by position in big blocks by a wide margin, at a bounded
  cost. A short side against a long one is compared in full, which fixes the "cut to a few
  edited lines" case (707 wrong pairs to 49).

## What it does not fix

- **Very short lines.** Dice needs two characters in a row to compare. `}` against `})` scores 0,
  so such an edit is now a removed and an added line.
- **A line split or joined.** Reformatting one line into three, or three into one, pairs at most
  one of them, and only if it is alike enough.
- **Big blocks whose two sides differ a lot in length**, with the edited lines far from where
  even spacing puts them: they fall outside the 32-line window and stay unpaired.

## Effect on the edited-moves experiment

Rerun with this change, `experiments/edited-moves/synthetic.ts` finds the same edited-move pairs.
At its 0.6 setting, wrong pairs fall from 57 to 22, and recall from 94.3% to 92.0%. Most of both
changes come from one scenario, "moved, with unrelated lines beside both ends": its wrong pairs
fall from 31 to 2 and its recall from 98.9% to 82.8%. That scenario counts a line rewritten into
an unrelated one as a true pair; the floor now leaves those unpaired, as intended.
`history.ts` there makes the same 464 edited-move pairs, and the block step re-pairs 14 leftover
lines instead of 74.

## Rerun

From `packages/ts/code-stats`:

```sh
node experiments/block-pairing/synthetic.ts 300              # cases per scenario
SHOW='≥ 0.3' node experiments/block-pairing/synthetic.ts 20  # also print wrong pairs and some misses
node experiments/block-pairing/history.ts 400 40             # commits, sample size
BETWEEN=0.3,0.4 node experiments/block-pairing/history.ts    # also sample pairs kept at 0.3, split at 0.4
```

The numbers above are from the repository the package was developed in, which is private, with
this change applied. A rerun on another repository gives other numbers. The cases depend on the
repository's files, so they shift a little as the code changes.

The "before" columns score the pairing as it was before the 0.3 floor, from
`operations-before.ts`.
