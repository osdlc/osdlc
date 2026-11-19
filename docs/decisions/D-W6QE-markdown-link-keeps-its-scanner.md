# D-W6QE: markdown-link keeps its own scanner, and stops growing it toward CommonMark

Proposed 2026-11-19. Answers [#836](https://github.com/osdlc/osdlc/issues/836).

## Question

Should `markdown-link` keep finding links and code by itself, or leave code
detection to a Markdown parser (comrak in Rust, remark in TypeScript) wherever
one already runs?

## Drivers

- #649 grew `code.rs` and `code.ts` from fences and spans to list items, block
  quotes, indented code, raw HTML, math and autolinks: about 1,630 lines of
  Rust and 1,160 of TypeScript, "most of a CommonMark block parser".
- #649 and #651 were merged with accepted Rust slowdowns. #868 then won part
  of one back; it did not change what the scanner does.
- Two places still read links their own way: `markdown-contract`'s
  `dialect/wikilinks` (a regex) and `markdown-relink`'s `target_span`.
- Standards bounding it: one answer in Rust and TypeScript, held by the
  shared suite in `packages/conformance/markdown-link/`; one answer to "is
  this a link" for every consumer ([D-YRKH](D-YRKH-one-implementation-per-vault-concept.md)).

## Facts

Verified against the code on `main` at 12c4a290 unless marked inferred.

- `markdown-link` has no parser dependency. It scans each document once, plus an internal pass for code regions, and reports
  byte offsets (Rust) and UTF-16 offsets (TS) into the raw note
  (`packages/rust/markdown-link/src/spanned.rs`, `code.rs`;
  `packages/ts/markdown-link/src/body-links.ts`, `code.ts`).
- `CodeRules` has three sets: `CommonMark`, `SkillExport` (looser fences, to
  match some agent-skill renderers) and `None`. Its own docs list the known
  gaps: lazy continuation lines are not tracked, and indented code inside a
  block quote is missed (`code.rs` header).
- comrak is already in the Rust workspace, pinned `=0.53.0` because line
  numbers are part of `markdown-contract`'s contract with its TS twin
  (`packages/rust/Cargo.toml`). Only `markdown-contract` uses it, through
  `sourcepos` (line and column, not byte offset). `markdown-contract` also
  calls `markdown_link::code::Fences` with `SkillExport` (`select.rs`), so it
  already uses both.
- remark is in `markdown-contract`, `markdown-render` and
  `markdown-vault-astro` (TS). `markdown-render/src/plugins/link-scan.ts`
  already combines them: it runs `scanBodyWith` over the raw source with
  `codeRules: 'commonmark'` and places links on remark's nodes by offset. It
  falls back to `codeRules: 'none'` over one node's text only when a node
  cannot be aligned with its source.
- Consumers of the scanner's code detection: `markdown-tags`,
  `markdown-relink` (`code_ranges` in `rewrite.rs`), `markdown-corpus`,
  `markdown-contract` (Rust), `markdown-render`, `markdown-vault-astro`,
  `corpus-schema`. Corpus indexing and relink scan whole vaults with no tree.
- Cost: #868 reports `vault` at 24.3 ms and the gate's `perf-accepted` label
  exists for deliberate slowdowns (`.github/workflows/perf-gate.yml`). The
  #651 destination work was reported as 46 to 67% slower on the Rust
  benchmarks. Whether comrak parsing would be slower or faster on the same
  corpus is inferred, not measured: a full tree allocates every node, which
  the scanner does not.
- Not verifiable here: the reasons the scanner was built are not recorded in
  the repo. The four in #836 are read from the code, and the first three
  are checked against it: one answer in Rust and TypeScript under one
  conformance suite; byte offsets in the raw note; matching Obsidian and the
  skill renderers; no parser dependency and a fast vault scan.

## Prior art

| System | What it does | Verdict |
| --- | --- | --- |
| comrak (Rust), sourcepos | Full CommonMark/GFM tree; positions are line and column. Source: `markdown-contract` use in this repo; https://github.com/kivikakk/comrak, read 2026-11-19 | Borrow for callers that need a tree. Reject as the link scanner: no byte offsets to splice at without a line index, no Obsidian wikilinks, no `SkillExport` |
| remark / micromark (TS), `position.offset` | Full mdast with UTF-16 offsets; wikilinks need a plugin. Source: `markdown-render` use; https://github.com/remarkjs/remark, read 2026-11-19 | Borrow as `link-scan.ts` already does: scan source, place by offset. Reject as the scanner |
| `markdown-render` `link-scan.ts` | Scanner decides links, parser supplies the nodes | Adopt as the pattern |
| `markdown-contract` `dialect/wikilinks` | Regex over flattened text, in both languages | Reject: a second answer to "is this a link" |
| pulldown-cmark (`Parser::into_offset_iter`) | Event stream with byte ranges into the source, no tree; https://docs.rs/pulldown-cmark/latest/pulldown_cmark/struct.Parser.html#method.into_offset_iter, read 2026-11-19 | Borrow as a future Rust-side check on the criteria. Not adopted: no wikilinks, no `SkillExport`, no TS twin with the same answers, and not in the workspace today |

## Criteria

1. One answer to "is this a link", the same in Rust and TypeScript, held by
   the shared suite.
2. Offsets into the raw note that a rewrite can splice at.
3. Obsidian and `SkillExport` behaviour, which CommonMark parsers do not give.
4. Needs no parser: indexing a vault must not build a tree per note.
5. Work still to be done on code detection, counted in lines and gaps.
6. Parse cost on the perf gate's corpus.

## Options

**A. Keep the scanner and its code rules as they are, and keep extending them.**
Costs: each gap (lazy continuation, indented code in quotes) is more state
machine in two languages, and each step so far has cost a slowdown.
Forecloses: nothing, but it commits to keeping a second CommonMark
implementation current. Scores: 1 yes, 2 yes, 3 yes, 4 yes, 5 worst (open
ended), 6 degrades over time.

**B. Keep the scanner for reading links, freeze its code detection at what
it does now, and prefer scanning the source when a parser runs.** Link
reading (wikilinks, aliases, destinations) stays here. Code detection is not
extended toward CommonMark: the documented gaps stay documented, and a
change needs a failing case from a real note. A caller that already has a tree
scans the source and places links by the tree's offsets, as `link-scan.ts`
does, and uses `CodeRules::None` only for text it already knows holds no
code. Costs: the two gaps remain, and a caller with a tree can disagree with
it about a code block in those gaps. Forecloses: a fully CommonMark-exact
scanner. Scores: 1 yes, 2 yes, 3 yes, 4 yes, 5 bounded, 6 unchanged.

**C. Parse first everywhere a parser runs, and scan the text with
`CodeRules::None`; keep the code rules only for callers with no parser.**
The issue's own option. Costs: two answers for code, one from the parser and
one from the scanner, which differ on exactly the cases the suite covers; in
Rust the parser is comrak and offsets are line and column, so a rewrite
needs a line index; in TS a link that crosses nodes (`[[Note|the *key*
idea]]`) is split by remark and `link-scan.ts` exists to avoid that.
Forecloses: criterion 1 on the parser side. Scores: 1 no, 2 partial, 3 no
(`SkillExport`, Obsidian), 4 yes for the fallback, 5 low, 6 adds a parse pass over every note, unmeasured.

**D. Replace the scanner's code detection with comrak and remark entirely.**
Costs: a parser dependency in every consumer, including `markdown-tags` and
`markdown-corpus`, which now have none; a TS and a Rust parser that differ on
edge cases, so the shared suite needs two expected answers or a lower
common denominator. Forecloses: `SkillExport`, byte offsets, a parser-free
build. Scores: 1 no, 2 no, 3 no, 4 no, 5 lowest, 6 worst for vault scans.

## Choice

**B.** It keeps what only the scanner gives (criteria 1 to 4) and stops the
open-ended cost (criterion 5). C is the issue's option and loses on criterion
1: it makes two answers for the same note. A loses on cost with no end. D
loses on 1 to 4.

What B does not claim: the scanner is not exact CommonMark and will not be.
Its code detection is "good enough for links in notes", and the suite is the
definition of correct (`packages/conformance/markdown-link/`).

## Consequences

- #649's direction stops. `code.rs` and `code.ts` take a change only for a
  case seen in a real note, with a suite row. The known gaps stay in the
  crate's docs as accepted: lazy continuation lines, indented code in a block
  quote, a span that ends early at a container marker, and a pipe-prefixed
  paragraph read as a table row (`code.rs` header).
- Follow-ups, each its own PR, none done here:
  - `markdown-relink`'s `target_span` moves into `markdown-link`, so the
    destination is read once. This is the follow-up #836 names.
  - `markdown-contract`'s wikilink regex (Rust and TS) calls the scanner
    with `CodeRules::None` over the flattened text it already holds. That
    text keeps inline-code contents (`parse.rs`, `projection.ts`), so a
    `[[Note]]` in a span stays a link there, as it does today. Its tree
    comes from comrak and remark; its links come from the scanner. This is
    an explicit exception to B's rule; the follow-up must either keep it or
    exclude code before flattening.
  - The `link-scan.ts` pattern, scan the source and place by offset, is
    written into the `markdown-link` README as the way to combine it with a
    parser.
- Amends nothing. It fills in the four reasons the scanner exists (Facts), which the
  repo did not record.

## Reopen if

- The suite's code-block cases stop being enough: a real note loses or
  gains a link because of one of the known gaps, and the fix would cost
  more than a few lines.
- A parser exposes byte offsets and wikilink and `SkillExport` hooks in both
  languages, with the same answers on the suite.
- A benchmark on the perf gate's corpus shows a tree-based pass within the
  gate's tolerance of the scanner. The "tree is slower" claim above is
  inferred, not measured.
- A consumer needs a rule the scanner cannot take without a parser, such as
  reference-style links resolved across a document.
