---
id: D-K7CS
type: decision
state: accepted
created: 2026-11-07
---

# D-K7CS: code-stats counts lines by kind and operation, from scc's table and git's own facts

## Summary

- Every line is one of five content kinds: `logic`, `boilerplate`, `comment`, `doc`, `blank`.
  A pure scanner (`@osdlc/code-stats/scan`) assigns them from a whole file, so the same
  classification serves a tree count, a diff and a comparison of two changes.
- A changed line also has an operation: `added`, `removed`, `changed` or `moved`. A changed or
  moved pair counts once, under its kind. A pair whose two lines are of different kinds, such as
  a comment replaced by code, counts as removed under the old kind and added under the new, so
  each kind's net is the lines of that kind gained or lost.
- File groups (source, tests, docs, instructions, other, generated, vendored) come from caller
  globs, then linguist attributes, then general built-in rules. No repository's own paths are
  built in.

## Context

The `stats` command of an earlier review-prep tool counted code, comment, blank and prose lines with a one-line prefix
check. It could not tell doc comments or boilerplate from logic, nor a changed line from an added
one, and it read no whole tree. Reviewing a pull request needs those splits.

## Decision

Build a new package, `@osdlc/code-stats`. It began in sksizer/dev (a private repository) and
moved to osdlc/osdlc for its first public release. It has three commands, `count`, `diff` and
`compare`, over one scanner:

- **Kinds.** `doc` is doc comments, docstrings and prose. `boilerplate` is narrow: imports and
  module lines, licence headers, SPDX lines, shebangs and bracket-only lines. Lines of agent
  instruction files count as logic.
- **Scanner data.** scc's `languages.json`, vendored and pinned by sha256, gives comment and string
  syntax for 366 languages. Our overlay adds doc-comment markers, boilerplate rules and each
  language's category (programming, data, prose, legal). A file the scanner cannot read falls back
  to the one-line rule, and the report says so.
- **Operations.** A removed run that reappears, consecutive and with indentation ignored, outside
  its own block is moved, with git's `--color-moved` minimum of 20 alphanumerics. The lines beside
  a moved run pair with the lines beside its new place, outward from the run, while each pair is
  at least 0.6 alike (Dice over character bigrams): moved when the texts match, else changed. So
  an edit inside a moved block stays with the block. Then, inside a block, the remaining lines
  pair as changed, most similar first, while a pair is at least 0.3 alike; the rest stay added
  and removed. Of equally similar candidates, the one nearer the line's own place wins. A block
  with more than 64 lines on a side compares each removed line with the 32 added lines either
  side of its place, unless one side is short enough to compare in full.
- **File groups.** Caller globs first, then `linguist-generated`, `linguist-vendored` and
  `linguist-documentation`, read at the measured commit and on by default, then general rules:
  lockfiles, minified files, `DO NOT EDIT` and `@generated` markers, vendor directories.
- **Lexing beyond scc's table**, in the overlay: regex, character and percent literals, strings
  that cross lines where the language allows it, string interpolation (`${…}`, `#{…}`, `$(…)`)
  that may hold quotes of its own, heredocs anywhere on a line, C++ raw strings, Markdown fences,
  tokens that look like an opener but open nothing (PHP `#[`, Ruby `$'`, shell escapes), and Python
  docstrings only as the first statement of a module, class or function. Each was found by
  comparing the table with tree-sitter over large corpora, and is checked against it.
- **Reports** are zod schemas (`countReportSchema`, `diffReportSchema`, `compareReportSchema`), the
  contract of `--json`.

## Why

- One scanner over whole files gives every command the same answer, and a whole-file pass is
  what tells a block comment, a string or a docstring apart. A prefix check cannot.
- scc's table is the broadest maintained source of comment and quote syntax. Writing our own
  would rediscover its edge cases.
- Moves detected on the parsed diff work for GitHub's diff as well as a local one; parsing
  `--color-moved` output would need git and coloured text.
- Similarity pairing puts a rewritten line with its rewrite, not with a comment added above it,
  so the kind a change is counted under is the kind that actually changed.
- Pairing outward from a moved run keeps a moved-and-edited block together. Without it, an edited
  line inside the block paired only within its old block, often with an unrelated line. On 2,700
  edits of real code with known answers, it raised the share of right pairs found from 79% to 95%,
  with almost no new wrong pairs. The threshold of 0.6 came from the same experiment, in
  `experiments/edited-moves/`: lower settings start pairing same-shaped lines such as
  `pub struct CaptureTarget {` with `pub struct CaptureProposal {`.
- The 0.3 floor inside a block keeps code replaced by unrelated code from counting as edited,
  which understated new code. It was chosen by the experiment in `experiments/block-pairing/`,
  on 3,000 edits of real code with known answers and 400 commits of history. In blocks of up to
  64 lines it cuts wrong pairs from 2,399 to 244 and keeps 2,371 of 2,510 right ones; above 0.3
  the trade evens out. Over the 400 commits it splits 980 of 8,980 changed pairs into a removed
  and an added line, and 35 of a sample of 40 of those were unrelated lines. Big blocks used to
  pair by position, so one inserted line put every later pair off by one; comparing nearby lines,
  with the floor, finds 91% of their true pairs against 60%.
- Linguist attributes are how a repository already marks generated files for GitHub. Reading them
  keeps any one repository's layout out of a general library.

## Prior art

| System or pattern | What it does | Source | Verdict |
| --- | --- | --- | --- |
| scc | Whole-file code, comment and blank counts; language table with quote rules | <https://github.com/boyter/scc>, v4.1.0, read 2026-11-07 | Adopt its table; it labels no line |
| tokei | Whole-file counts, docstring markers for a few languages | <https://github.com/XAMPPRocky/tokei>, v15.0.0 | Borrow the docstring idea; scc's table is broader |
| cloc `--diff` | Same, modified, added, removed counts between two trees | cloc man page | Use as an oracle; a Perl CLI, not a library |
| GitHub linguist | `.gitattributes` attributes for generated, vendored and documentation files | linguist overrides docs | Adopt |
| git `--color-moved` | Moved-line detection with a 20-alphanumeric minimum | git-diff(1) | Borrow the threshold |
| GitClear | Line operations apart from content | gitclear.com | Borrow the idea; closed |
| rust-code-analysis | Logical lines of code, among other metrics | docs.rs, 0.0.25 | Reject: Rust-only build, upstream quiet |

## Consequences

- The kinds are heuristics with documented limits (the [counting guide](../../guide/counting.md)). A language the table
  reads poorly can be fixed with a `LanguageScanner` from the caller, or a row in the overlay.
- That earlier `stats` command is superseded by `code-stats`.
- A repository's generated paths must be marked in `.gitattributes` or passed as globs.

## The tree-sitter tier and PR descriptions

- **A tree-sitter tier** (`@osdlc/code-stats/tree-sitter`), optional: `web-tree-sitter` and the
  official grammar packages are peers a caller installs, never bundled. Comments, strings and
  imports come from the grammar's nodes; the doc, licence and directive rules stay the table's,
  so the two tiers cannot drift apart on them. Lines a grammar cannot parse take the table's
  reading. Measured against the table over 1.5 million lines of TypeScript, JavaScript, Rust and
  Python, they disagree on 8, in minified bundles, a `use` inside a Rust
  function and closing brackets after an import list; the table stays the default.
- **A PR description** (`code-stats describe`): the sections of a conventional PR template, with
  prompts where only the author can write. The diagram is deterministic:
  the packages a change touches and their direct dependents, from `@osdlc/system-model` over
  the manifests at the change's head commit (the working tree's, git-ignored ones left out, only
  for uncommitted work or a PR whose commits are not here), with deleted packages named from the
  base commit. Risk is a list of facts from the report, not a tier or a verdict, so a
  team's own risk policy can read them. `--write` refreshes the generated blocks and leaves the
  author's text alone.

## Counting needs no git

`count` reads the files on disk by default, as scc, tokei and cloc do, and gives the same answer
whether or not git is installed. An earlier draft counted `HEAD` and would have fallen back to
the disk when git was missing. That was rejected: a metric should not change with the tools
installed. `.gitignore`, `info/exclude` and `.gitattributes` are read as files, from the
repository's top down. On a large repository that listing matches `git ls-files`, apart from files
committed despite a `.gitignore` rule, which only git's index knows. Git stays for history:
`count --rev`, `diff`, `compare` and `describe`, which fail with a `needs-git` error without it.

## Answered questions

- Whether the package map should read manifests at the change's head commit rather than the
  working tree: yes. Read from the working tree, `describe 123` run from a checkout of `main`
  drew the map of `main`, not of the PR. The library walks a folder, so the commit's manifests
  are written to a scratch folder and walked there.
