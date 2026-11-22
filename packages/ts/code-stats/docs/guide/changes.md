---
title: Changes
sidebar:
  order: 2
description: How to name a change, what added, changed and moved mean, change categories, and a worked example.
---

`code-stats diff` measures one change, and `code-stats compare` measures two side by side. Both
need git.

```sh
code-stats diff                    # this branch against the remote's default branch
code-stats diff 123                # pull request 123 (or #123)
code-stats diff main...feature     # what feature added since it branched from main
code-stats diff v1..v2             # exactly v1 to v2
code-stats diff --worktree         # uncommitted work: HEAD against the files on disk
code-stats diff main --worktree    # the branch's commits and its uncommitted work together
code-stats diff 123 --write        # also put the table into the PR's description

code-stats compare 123 456         # two pull requests
code-stats compare v1..v2 v2..v3   # any two changes
```

## Naming a change

| You write | It means |
| --- | --- |
| `123` or `#123` | A pull request. Needs an authenticated `gh`. |
| `a..b` | Exactly `a` to `b`. |
| `a...b` | What `b` added since it branched from `a` (their merge base). |
| `ref` | `ref...HEAD`: what this branch added since it left `ref`. |
| nothing | `<default>...HEAD`: `<default>` is the branch `origin/HEAD` names, or `origin/main` when `origin/HEAD` is unset (a CI fetch, for instance). |

`origin/HEAD` is set when a repository is cloned and is not updated by a fetch. If the remote's
default branch has been renamed since, `git remote set-head origin --auto` points it at the new
one.

When a pull request's commits are not in your checkout (a shallow CI clone, for instance), the
diff comes from GitHub instead. Without the file contents, line kinds use the one-line rule from
[Counting](./counting.md#languages). Fetch the PR first (`git fetch origin pull/123/head`) for full
results.

## What happened to each line

A plain diff only knows "added" and "removed". Renaming a field shows as one line removed and one
added, and moving a function shows as its whole body removed and added again. `code-stats`
labels each line with what actually happened:

| Operation | Meaning |
| --- | --- |
| `added` | New. |
| `removed` | Gone. |
| `changed` | Edited: a removed line and the added line it became, paired as the most similar lines within one block of the diff and at least 30% alike (see [Changed lines](#changed-lines)), or edited inside a block that moved (see [Moved and edited](#moved-and-edited)). |
| `moved` | The same lines in a new place: a run of removed lines that reappears among the added lines elsewhere, in this file or another one, with indentation ignored. The run needs at least 20 letters and digits, as git's own `--color-moved` does, so a lone `}` never counts as a move. |

A changed or moved pair counts **once**, under its kind. So `Added + Changed + Moved` is the
number of lines the diff adds, and `Removed + Changed + Moved` is the number it removes. A pair
whose lines are of two different kinds, such as a comment replaced by a line of code, is not the
same line edited: it counts as a removed comment and an added line of logic, so each kind's Net
says how many lines of that kind were gained or lost.

### A worked example

This change renames `qty` to `quantity`, rewords a comment, moves `isEmpty` above `subtotal`,
and adds a `total` function and a `tax.ts` file.

```diff
 import { round } from './money.ts'
+import { TAX_RATE } from './tax.ts'

 /** A line in the cart. */
 export interface Item {
   price: number
-  qty: number
+  quantity: number
 }

-// Sum before tax.
+export function isEmpty(items: Item[]): boolean {
+  return items.length === 0 || items.every((item) => item.qty === 0)
+}
+
+// Sum before tax, in whole cents.
 export function subtotal(items: Item[]): number {
-  return round(items.reduce((n, i) => n + i.price * i.qty, 0))
+  return round(items.reduce((n, i) => n + i.price * i.quantity, 0))
 }

-export function isEmpty(items: Item[]): boolean {
-  return items.length === 0 || items.every((item) => item.qty === 0)
+/** The total a customer pays. */
+export function total(items: Item[]): number {
+  return round(subtotal(items) * (1 + TAX_RATE))
 }
```

Git counts that as 11 lines added and 5 removed in `cart.ts`. `code-stats` sees this:

```text
- changed │   qty: number
- changed │ // Sum before tax.
- changed │   return round(items.reduce((n, i) => n + i.price * i.qty, 0))
- moved   │ export function isEmpty(items: Item[]): boolean {
- moved   │   return items.length === 0 || items.every((item) => item.qty === 0)
+ added   │ import { TAX_RATE } from './tax.ts'
+ changed │   quantity: number
+ moved   │ export function isEmpty(items: Item[]): boolean {
+ moved   │   return items.length === 0 || items.every((item) => item.qty === 0)
+ added   │ }
+ added   │
+ changed │ // Sum before tax, in whole cents.
+ changed │   return round(items.reduce((n, i) => n + i.price * i.quantity, 0))
+ added   │ /** The total a customer pays. */
+ added   │ export function total(items: Item[]): number {
+ added   │   return round(subtotal(items) * (1 + TAX_RATE))
```

The `diff` table, with `tax.ts` included:

```text
| Lines | Added | Changed | Moved | Removed | Net |
|---|---:|---:|---:|---:|---:|
| Logic | 3 | 2 | 2 | 0 | +3 |
| Boilerplate | 2 | 0 | 0 | 0 | +2 |
| Comments | 0 | 1 | 0 | 0 | 0 |
| Docs | 2 | 0 | 0 | 0 | +2 |
| Blank | 1 | 0 | 0 | 0 | +1 |
| **Total** | **8** | **3** | **2** | **0** | **+8** |
```

So "+13 −5" across the two files was three new lines of logic (`total` and `TAX_RATE`), two
rewritten ones (the rename), one function moved without edits, and a reworded comment.

### Moved and edited

Code often moves *and* changes in the same commit: a function moves and a name inside it is
renamed. The identical lines are found as `moved`. Then the lines just before and after the moved
run, on both sides, are compared outward from it. Each pair that is still at least 60% alike
pairs too: as `moved` if the texts match, else as `changed`. It stops at the first pair that is
not alike. For example:

```text
- moved   │ export function isEmpty(items: Item[]): boolean {
- changed │   return items.length === 0 || items.every((item) => item.qty === 0)
+ moved   │ export function isEmpty(items: Item[]): boolean {
+ changed │   return items.length === 0 || items.every((item) => item.quantity === 0)
```

The 60% mark was chosen by experiment, on 2,700 edits of real code with known answers and on 400
commits of the repository code-stats was developed in. With it, 95% of the right pairs are found, against 79%
without it. It makes almost no wrong pairs; lines of the same shape, such as
`pub struct CaptureTarget {` and `pub struct CaptureProposal {`, start to pair below about 50%.
The method and numbers are in
[`experiments/edited-moves/`](https://github.com/osdlc/osdlc/tree/main/packages/ts/code-stats/experiments/edited-moves/README.md).

What it still misses:

- a block where *every* line was edited. A move needs a run of at least 20 identical letters and
  digits to be found at all;
- very short edited lines, such as `}` becoming `}, extra)`, which share too little to compare.

### Changed lines

Inside one block of the diff, the removed and added lines left over pair up as `changed`, most
similar first, but only while a pair is at least 30% alike. Lines less alike stay `removed` and
`added`. So deleting a function and writing an unrelated one in its place counts as lines
removed and lines added, not as edits, and new code is counted as new.

Similarity is Dice's coefficient over pairs of characters, with indentation ignored. A small edit,
a rename or a reworded comment is well above 30%, as `qty: number` and `quantity: number` in the
worked example are. Unrelated lines are not, even in the same block:

```text
- removed │ export function retryLater(job) {
- removed │   queue.push(job)
+ added   │ const TIMEOUT_MS = 5000
+ added   │ logger.flush()
```

When two candidates are equally alike, the one nearer the line's own place in the block wins, so
repeated lines such as `}` keep their order. A block with more than 64 lines on a side compares
each removed line with the 32 added lines either side of its place, unless one side is short
enough to compare in full.

The 30% mark was chosen by experiment, on 3,000 edits of real code with known answers and on 400
commits of the same repository. In blocks of up to 64 lines it removes 90% of the wrong
pairs and keeps 94% of the right ones. The method and numbers are in
[`experiments/block-pairing/`](https://github.com/osdlc/osdlc/tree/main/packages/ts/code-stats/experiments/block-pairing/README.md).

What it misses:

- a line rewritten so much that it shares little text with the old one, such as a string
  literal swapped for another. About one in eleven of those now counts as removed and added;
- very short lines: `}` and `})` share no pair of characters, so that edit is a removed and an
  added line;
- a line split into several, or several joined into one: at most one of them pairs.

Totals are right either way: every line is counted once.

## Change categories

Each file in a diff also gets one category: the first of these that fits.

| Category | When |
| --- | --- |
| `generated`, `vendored` | The file's group (see [Counting](./counting.md#file-groups)). |
| `non-text` | A binary file, a symlink or a submodule. |
| `deleted`, `added`, `renamed` | The whole file went, arrived or moved. |
| `mode` | Only the file's mode changed, such as becoming executable. |
| `dependencies` | A `package.json` or `Cargo.toml` whose dependency entries changed. An `engines` or `version` bump is not a dependency change. |
| `instructions`, `docs`, `tests` | The file's group. |
| `formatting` | Only whitespace that cannot change meaning, or only blank lines. Whitespace inside strings, and beside a tag in JSX, is meaning; other whitespace inside JSX text, such as `a , b`, is not told apart from code's. When a side's text can't be read, or the language is unknown, only trailing whitespace counts as formatting. Changing line endings from CRLF to LF is formatting too, except in shell scripts and Makefiles, where the `\r` is part of the line, and in files whose language is unknown. |
| `config` | A config or data file. |
| `comments` | Only comment, doc and blank lines. |
| `boilerplate` | Only boilerplate and blank lines, such as reordered imports. |
| `logic` | Anything else. |

## Exported API and complexity

For a change, `diff` also reports:

- **Exported API**: what the change added to, removed from or changed in what each file
  exports. It covers TypeScript and JavaScript exports and Rust `pub` items. With the
  `typescript` package available, it also covers public members of exported classes and
  interfaces, as in `Item.qty` above. A file that is a package's entry point is marked.
- **Complexity**: cyclomatic complexity per function, before and after, and the functions that
  moved most. It is exact for TypeScript and JavaScript, and uses
  [lizard](https://github.com/terryyin/lizard) for other languages when it is installed.

Both passes read at most 150 files within 20 seconds, and the report lists anything they skipped.

## Writing into a pull request

`--write` puts the table into the PR's description between two markers:

```markdown
<!-- code-stats:start -->
…
<!-- code-stats:end -->
```

Running it again replaces only what is between the markers. If the description has no markers,
the table goes under a `## Change statistics` heading. That is placed before any trailing
HTML-comment lines that other tools use as footers, or at the end. Everything else in the
description stays exactly as it was. For a whole description, see
[PR descriptions](./pr-descriptions.md).
