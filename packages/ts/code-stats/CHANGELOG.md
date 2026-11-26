# @osdlc/code-stats

## History before the first public release

The package was developed inside another repository before its first public release. These versions were never published. They are rebuilt from the git history, newest first, and the first published version follows 0.1.2.

### [0.1.2] - 2026-11-22 (unpublished)

The package counts lines of source by kind (logic, boilerplate, comment, doc, blank) for a
folder, a commit, a change or two changes side by side, with what happened to each line of a
change (added, removed, changed, moved), plus file groups, change categories, public API delta,
complexity movers and PR descriptions. Deterministic, no model.

#### Changed

- Depends on `@osdlc/cli-tool` `^0.19.0`, `@osdlc/typed-gh` `^0.18.1` and `@osdlc/typed-git`
  `^0.17.0`.

### [0.1.1] - 2026-11-19 (unpublished)

#### Added

- `@osdlc/code-stats/scan` exports the `InsignificantWhitespace` type. `Language` gains
  `insignificantWhitespace`, `significantWhitespaceLines`, `significantLineEndings` and
  `markupExtensions`, which say where a language's whitespace and line endings carry meaning.

#### Changed

- A file is `formatting` when each changed line differs only in whitespace its language lets go,
  read by the scanner's lexer over the whole file when both sides' text is available: whitespace
  inside a string, regex or heredoc is content even when it opened lines above, while the spaces
  in a template's `${ x }` or around a `<<` shift are layout. In a JSX, TSX or `.js` file that
  shows a tag, the spaces beside a tag are text. Without a side's text, or for a language the
  table does not know, only trailing whitespace may go.
- SCSS is a language of its own; scc files `.scss` under the indented Sass.
- `countTree` and `code-stats count --rev` read a commit's blobs a few megabytes at a time, so a
  large tree is never held in memory at once.

### [0.1.0] - 2026-11-18 (unpublished)

#### Added

- `@osdlc/code-stats/scan`: a line scanner that labels every line of a file `logic`,
  `boilerplate`, `comment`, `doc` or `blank`, driven by scc's language table (v4.1.0, 366
  languages) and an overlay of doc-comment markers, boilerplate rules and lexing rules scc lacks:
  regex, character and percent literals, string interpolation (`${…}`, `#{…}`, `$(…)`), heredocs,
  raw strings, Markdown fences, Python docstrings by position, line continuations, PHP 8
  attributes and JVM package annotations. Callers can add their own `LanguageScanner`; one that
  fails falls back to the table's reading when the table knows the language.
- `countDirectory` and `code-stats count`: lines by kind, language and file group for the files
  on disk, optionally under some paths. Needs no git: `.gitignore`, `.gitattributes` and the git
  directory's `info/exclude` and `info/attributes` are read as files, from the repository's top
  down, and submodules and nested repositories are left out as git leaves them out.
- `countTree` and `code-stats count --rev <ref>`: the same for a commit, read through git.
- `diffChange` and `code-stats diff`: a change's lines by kind and by operation (`added`,
  `removed`, `changed`, `moved`), file groups, change categories, dependency changes, public API
  delta (TypeScript, JavaScript and Rust, `pub use` re-exports included) and complexity movers
  (exact for TypeScript and JavaScript; other languages through `lizard`, 25 files to a run,
  within the analysis time budget, when it is installed); `--write` splices the table into the PR
  body. With no change named, it measures the current branch against the branch `origin/HEAD`
  names, or `origin/main` when that is unset.
  - Moved code that was also edited keeps its edits paired: lines beside a moved run pair with the
    lines beside its new place while they stay at least 0.6 alike.
  - Inside a diff block, lines pair as `changed` only when at least 0.3 alike, so code replaced by
    unrelated code counts as new. A block of more than 64 lines compares each line with the 32
    either side of its place instead of pairing by position.
  - A pair whose two lines are of different kinds counts as removed and added, so each kind's net
    is right.
- `compareChanges` and `code-stats compare`: two changes measured the same way, side by side.
- For tools built on it: `changeSpecFrom` names a change from separate PR, base, head and
  working-tree selectors and refuses contradictory ones; `measureChange` is `diffChange` plus the
  repository, resolved change, parsed diff and file texts it read, and with `requireCommits` it
  stops before reading the diff when the change's commits are not in the checkout;
  `analysis: false` leaves out the API and complexity passes; `isTsSource` and `parseSource` are
  the TypeScript file rule and parser the API and complexity passes use; `DIFF_FLAGS` are the
  `git diff` flags that keep a user's diff settings out of `parseDiff`'s input.
- `describeChange` and `code-stats describe`: a PR description with prompts for the prose, the
  statistics block, a Mermaid map of the packages the change touches and their direct dependents
  (read from the manifests at the change's head commit), and deterministic risk signals;
  `--write` fills an empty PR body or refreshes only the generated blocks. The base commit's
  manifests are read only when the change deletes or moves one.
- `@osdlc/code-stats/tree-sitter`: `createTreeSitterScanners` loads web-tree-sitter and the
  grammars it finds, for TypeScript, TSX, JavaScript, Rust, Python, Scala, Go, Java, C, C++, C#,
  Ruby, PHP and Bash, and returns scanners for `createScannerRegistry`, listing grammars it could
  not find (`missing`) or load (`failed`); `--tree-sitter` on every command uses them. The runtime
  and the grammar packages are optional peers. A caller adds a language with a
  `TreeSitterGrammar`.
- File groups honour linguist attributes in `.gitattributes` and caller globs, and add
  `instructions` (agent instructions, whose prose counts as logic) and `vendored`. Attributes come
  from the repository's `.gitattributes` files and the clone's `info/attributes`, `[attr]` macros
  included, as `git check-attr` reads them, but not the system or user attributes files; at a
  commit they are read from the commit in one batch, so any git version answers the same.
- `prefixKind`, the one-line rule, takes an optional language and then reads that language's own
  comment markers.
- The CLI is built on `@osdlc/cli-tool`'s `defineApp`: `code-stats help` (with `--full`
  examples), `code-stats schema` (each command's input and output JSON Schema), `--json` and
  `--output json|jsonl`. A `--json` document starts with `schemaVersion` and `kind`, then the
  report; under `--json` a failure prints an error document. Errors go to stderr prefixed
  `code-stats:`, with control characters stripped, and the exit codes are the `@osdlc` tools'
  shared ones: 2 bad input, 22 not installed, 23 `gh` signed out, 24 not a repository, 25
  network, 1 otherwise. `CodeStatsError` carries its `kind` (`bad-input`, `needs-git`, `failed`)
  and the classified `failure`.
- Guides in `docs/guide/`: counting, changes (with a worked example), PR descriptions, the
  library, how it works, and a comparison with scc, tokei, cloc, GitClear and others.
