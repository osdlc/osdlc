# @osdlc/markdown-contract

## 0.7.2

### Patch Changes

- 84651dd: Under strict order, an undeclared section no longer makes a later optional section, or a repeat of a filled repeatable section, `structure/section-order`. Since 0.5.0, an undeclared section allowed by `allowUnknown: true` moved the order check past the optional sections after it, with or without a `gap()` ahead. A document such as `A B X D` (with `D` optional and `X` undeclared) reported `D` as out of order. Now a declared section for a slot that undeclared sections skipped sends the check back to where they started, unless a declared section has filled a slot since. Under `allowUnknown: true`, a gap no longer counts those undeclared sections. With `allowUnknown: false` the undeclared section is still reported, and the declared section after it is no longer reported, unless a gap took the undeclared section: it then had to be in the gap, so the declared section after it is out of order, as before.
- Updated dependencies [9948d90]
  - @osdlc/cli-tool@0.14.0

## 0.7.1

### Patch Changes

- dd2265e: `markdown-contract --where` shows the version on its first line, as the other CLIs do.
- Updated dependencies [14d4351]
- Updated dependencies [dd2265e]
  - @osdlc/cli-tool@0.13.0

## 0.7.0

### Minor Changes

- 0336626: `markdown-contract dev` runs the tool from a development checkout: `dev link <checkout>` makes the installed command run that checkout's source, `dev status` says which code runs, and `dev off` goes back. `MARKDOWN_CONTRACT_HOME` does the same for one run. `@osdlc/cli-tool` is now a dependency, and the bin is `bin/markdown-contract.js`, which loads `dist/cli/bin.js`.

## 0.6.0

### Minor Changes

- bb61f10: `--version` prints the package version and exits 0.

## 0.5.0

### Minor Changes

- b835ae4: Empty or comment-only frontmatter now reports the missing required keys. A `^word` at the end of inline code is no longer read as an anchor, and a standalone anchor after a blockquote binds to its section. The typed model binds a `oneOf` or repeatable slot under each heading it matched, and finds a content-record table by its record key rather than by the leaf's `anchor` option, as the structure and content checks already did. Under strict order, a section whose slot the walk already passed (an optional slot skipped for a later section, or a repeatable slot a later section closed) is now `structure/section-order`; before, it passed silently.
  **Breaking:** `forbids` and text-rule findings now carry a line but no `column`, since the column they carried was wrong.
  An invalid regex in a declarative contract is a `DeclarativeError`, and `nullable: false` migrates.
  `init` output changes: object-valued frontmatter fields get nested object schemas (a mixed-type field is left out, and its parent no longer sets `additionalProperties: false`), contract names stay unique across folders (`-2`, `-3`), and several roots get include globs routed to each root.
  `validate` exits 2 for a path that is a file, and for a `--path` that is missing, not a folder, or outside the current folder; before, these passed with nothing checked. Integer flags accept only plain integers (`' 3 '` and `1e1` are refused).
  The structure check, the content check and the typed model now share one slot resolver, so they bind the same section to the same slot and the same block to each leaf. A heading that two slots name is content-checked against the first slot only, as the structure check binds it. In the typed model, a second spelling of a filled `oneOf` or alias set no longer gets a key of its own (it is a `structure/duplicate-section`; `.section(name)` still finds it), and a section whose `content` is one `table(...)` leaf promotes to the table the content check validated, its first block: it promotes when other tables follow, and no longer promotes to a later table when the first block is not one.
  `requires`, `forbids` and `textRule` in code and the YAML `requires:` and `forbids:` keys now apply one count-bound check. A `forbids` entry with a negative `max` throws `ContractBuildError` (`contract/text-count-bound`) in code, as it is refused in YAML. A YAML `forbids` entry is no longer refused for a `min` above its `max`, since `min` is ignored on a `forbids` entry, and a YAML `requires` entry whose bound means absence is refused with the code builder's message. A NaN `max` (YAML `.nan`) is still accepted in TS and Rust alike, and when the build-time bound check meets a NaN `min` on a `requires` entry it now uses the default minimum 1 in TS, as it already did in Rust (so `min: .nan, max: 0` is refused on both sides). Validation still compares counts against the NaN, so such an entry never reports a miss.

### Patch Changes

- Updated dependencies [b835ae4]
  - @osdlc/gfm-table@0.4.0

## 0.4.1

### Patch Changes

- 255e2a4: A `forbids` hit (from `forbids` or `textRule`) inside a fenced code block is now reported on its own line. Before, the text of a fenced block was placed from the fence line, so each hit was reported one line too high. Indented code blocks were already right.

## 0.4.0

### Minor Changes

- b9df2d4: Add `extractVaultRefs(text)` and the `VaultRef` type, exported from `@osdlc/markdown-contract` and `@osdlc/markdown-contract/core`. `extractVaultRefs` finds every `[[wikilink]]` and `![[transclusion]]` in flattened text, in document order, and splits each into its `target`, `alias` and `fragment`. `[[Note#^block-id]]` gives the fragment `^block-id`. The text between the brackets cannot contain `[`, and one backslash before a bracket, as `remark-stringify` writes it, is accepted. The search runs in linear time. `parse()` still leaves these references as text in the tree, so pass it text such as `SectionView.text('all')`.

## 0.3.2

### Patch Changes

- fb712e0: Make every package follow the same conventions. The published manifests and READMEs change; the runtime code and the `dist/` files do not.
  
  - `author` is `sksizer` in every manifest (`@osdlc/typed-gh` had none).
  - `engines.node` is no wider than any dependency's. `@osdlc/typed-gh` and `@osdlc/code-host` now declare `^22.22.2 || ^24.15.0 || >=26.0.0`, the range of `@osdlc/typed-git` and its dependency `hosted-git-info`. `@osdlc/cli-tool` and `@osdlc/trust-repo` declare `>=22`, not `>=22.18`: a `dist/` install needs no TypeScript stripping.
  - `@osdlc/tsconfig` and `@osdlc/prettier-config` are ESM with `sideEffects: false`, and ship SECURITY.md and CONTRIBUTING.md. `@osdlc/prettier-config` has an `exports` map (`.` is `index.json`) in place of `main`.
  - Every README has `## Install` and `## Licence` sections, and every CHANGELOG starts `# @osdlc/<name>`.
  - `@osdlc/color` and `@osdlc/markdown-contract` no longer set a coverage threshold.
  - `@osdlc/yaml-splice` reaches its WebAssembly glue through a `#wasm` entry in `imports`. The shipped `dist/` files are the same.
- Updated dependencies [fb712e0]
- Updated dependencies [fb712e0]
  - @osdlc/gfm-table@0.3.1

## 0.3.1

### Patch Changes

- 4fee464: `inferConfig` and `markdown-contract init` skip `.git` and `node_modules` folders, as `runCorpus` and `validate` already do. Before, they read `.md` files under those folders and inferred contracts from them.

## 0.3.0

### Minor Changes

- c9f7022: The first release of `@osdlc/markdown-contract` on npm. Contracts for markdown documents. A contract states what a document of one type must hold: frontmatter fields checked by a Zod schema, a grammar over its heading sections, and typed blocks (tables, lists, code, paragraphs) inside them. One parse checks the document and returns findings with line numbers. A document that passes reads back as a typed model. Contracts can be written in TypeScript or in YAML. A runner and the `markdown-contract` command check a folder of documents against a config that maps globs to contracts.
  
  - Four entry points. `@osdlc/markdown-contract/core` holds the parser, the contract builders, the typed model and the read helpers, and imports no Node module. `@osdlc/markdown-contract` adds the folder runner (`runCorpus`, `defineConfig`, `CorpusConfig` and `RunStats`). `/declarative` loads YAML contracts and configs. `/cli` exports `runCli` and `CliResult`; importing it runs nothing.
  - The typed model's `frontmatter` is the output of the contract's schema, so transforms, defaults and `trim()` apply. A repeatable section is checked on every occurrence. Parsed cell and item values belong to one `validate()` call, so several contracts can validate one parse tree.
  - Frontmatter that is not valid YAML (a duplicate key, broken syntax, an undefined alias) gives a `frontmatter/yaml` finding. `parse` and `validate` do not throw on it.
  - `ContractBuildError` is exported. The builders throw it for a malformed contract, and it carries an `id`.
  - The `markdown-contract` command writes all of its output before it exits, also when the output goes to a pipe and is larger than 64 KB. It runs when it is called through a symlink, as `node_modules/.bin` and `npx` call it. Each command takes only its own flags, and `validate` takes one path; anything else exits with 2.
  - `markdown-contract migrate <file>... [--write]` rewrites version 1 YAML contracts and configs as version 2. It loads each result before it prints or writes it, and a result that version 2 cannot load is reported and left alone. A file that is already version 2 is skipped without an error.
  - `lenientBody` and `strictBody` type the body, as `sections()` does.
  - Stability tiers. `inferConfig`, `InferOptions`, `InferResult`, `InferredContract`, `InferredFile`, `TextEdit`, `runCli` and `CliResult` are tagged `@experimental` and may change in a minor release. Everything else is stable for 0.x.
  - TSDoc on every export, with `@throws` where a function can throw. Runnable examples for every export, a test of the exports, and a README.
  - Node.js 22 or later is supported (`engines.node`). Linux and macOS are supported; Windows is expected to work but is untested.
  - The shared validation corpus (documents, YAML contracts and expected findings) is in the package's `corpus/` folder in the repository. It is not published to npm.
  
  Known limit: `requires`, `forbids` and `textRule` read the text of paragraphs, list items, table cells and code blocks. They do not read blockquotes, nested list items, heading text or raw HTML.
  
  Changes from the previous package, `markdown-contract`, for anyone who used its 0.2.x builds:
  
  - YAML contracts and configs must declare `mcVersion: 2`. Loading a file with `mcVersion: 1` throws a `DeclarativeError` that names `markdown-contract migrate --write <file>`.
  - `compileContractObject(raw)` drops its `mcVersion` argument and always compiles version 2. It rejects an `mcVersion` other than 2 in the object.
  - `zod` is a peer dependency (`^4`). Signatures take zod's own `ZodType`; the package no longer exports its own `ZodType`, and `LeafSpec` has no `schema` field.
  - `runCorpus` drops its `format` option. Format findings with `formatFinding`, or run the command with `--format`. It does not enter `.git` or `node_modules` folders.
  - `parse()` applies the micromark syntax extensions passed in `extensions`. `MicromarkExtension` is micromark's own `Extension` type.
  - The `./cli/run` entry point is removed. Import `runCli` from `./cli`.
  - `BlockNode` has no `typed()`, `typedItem()`, `setTyped()` or `setTypedItem()`. Read transformed cell and item values from the typed model.
  - `init` and `inferConfig` have no `--infer-bounds` flag or `inferBounds` option. Neither did anything. They stop and name the file when its frontmatter is not valid YAML.
  - These exports are removed from the package root: `VERSION`; the internal functions `buildModel`, `buildTextFindings`, `matchText`, `synthesizeTextId`, `read`, `validate`, `finding` and `notImplemented` (use `Contract.validate` and `Contract.read`); and the internal types `TextFindingInput`, `TextFindingKind`, `TextKind`, `TextMatchResult`, `UnionToIntersection`, `SectionValueBase`, `BodyEntry` and `NamesTupleOf`. `DeclarativeDoc` is removed from `./declarative`.

## History before the first public release

These versions were never published. They are rebuilt from the git history.

### [0.2.5] - 2026-07-16 (unpublished)

#### Changed

- `inferConfig` and the `init` command write `mcVersion: 2` contracts: an object schema with a
  `required` list built from field presence, `integer`, `items` and `[T, "null"]` spellings,
  `additionalSections`, and occurrence counts for repeated sections.

### [0.2.4] - 2026-07-16 (unpublished)

#### Added

- YAML contracts version 2 (`mcVersion: 2`), beside version 1. Frontmatter schemas use a subset of
  JSON Schema 2020-12: `properties`, `required`, `additionalProperties`, `minLength`, `maximum`,
  `items`, `integer`, `[T, "null"]` unions, composable `format` and `const`. Fields are optional
  unless listed in `required`. Unknown keys and keys outside the subset are rejected, with a
  suggestion for a likely misspelling and a hint for version 1 spellings.
- Version 2 body grammar: `additionalSections`, `minContains` and `maxContains` for repeated
  sections, nested sections, and `items` for list leaves.
- `description` on schema nodes, sections, leaves, levels and the contract root.
- `Finding.hint`: an optional hint that carries the nearest `description`. The human output prints
  it on an indented line; SARIF output puts it in `properties.hint`. Contracts without a
  description produce the same findings as before.

### [0.2.3] - 2026-07-04 (unpublished)

#### Added

- Repeatable sections. `section(name, { repeatable: true, min, max })` lets a heading appear more
  than once at one level. The typed model reads the occurrences back as an array. A count outside
  `min` and `max` gives a `structure/repeat-count` finding.
- `repeatable`, `min` and `max` on sections in YAML contracts. `inferConfig` detects repeated
  sections.

### [0.2.2] - 2026-07-04 (unpublished)

#### Added

- `list({ everyItem })` keeps the output of an item schema that transforms its value. The typed
  model reads the list back as typed items. Items without a transform stay strings.

### [0.2.1] - 2026-07-03 (unpublished)

#### Fixed

- `init <dir>` writes the config and contracts under `<dir>` by default, so `init <dir> --check`
  finds them from any working directory. With more than one root it writes to the working
  directory and prints a warning that suggests `--out`.

### [0.2.0] - 2026-07-03 (unpublished)

#### Changed

- Breaking: the typed model reads table rows back with the output type of each declared cell
  schema. A cell whose schema transforms its value reads back as the transformed value; other
  columns stay strings. `table()`, `section()`, `sections()` and `Infer` carry the cell types, and
  `RowOf` computes the row type. Code that relied on every row being `Record<string, string>`, or
  that passed explicit type arguments to these functions, must be updated.

### [0.1.27] - 2026-07-03 (unpublished)

#### Added

- `cellPos(row, col)` on table blocks: the source position of one cell's content.
- `inlineSpans()` on paragraph blocks and `inlineSpans(row, col)` on table blocks: the source
  positions of inline code spans.

### [0.1.26] - 2026-07-02 (unpublished)

#### Added

- `./cli/run` entry point: `runCli` without the program entry, for callers that must not run the
  command on import.

### [0.1.25] - 2026-07-02 (unpublished)

#### Added

- Table blocks keep the output of cell schemas that transform their value, read with
  `typed(row, col)`.

### [0.1.24] - 2026-07-02 (unpublished)

#### Added

- `./cli` entry point: `runCli(argv)` runs the `markdown-contract` command and returns its exit
  code, standard output and standard error instead of printing them.

### [0.1.23] - 2026-07-02 (unpublished)

#### Added

- `table()` keeps the type of its `cells` map in its return type, ready for typed rows.

### [0.1.22] - 2026-07-01 (unpublished)

#### Added

- `splitFrontmatter(text)`: splits a document into its frontmatter and body without a full parse.
- `DocTree.body`: the document text after the frontmatter.

### [0.1.21] - 2026-07-01 (unpublished)

#### Added

- Read helpers over the parse tree: `findSection`, `sectionsAt`, `sectionForLine`, `sectionSpans`,
  `blocksOfKind`, `codeBlockLines`, `tableRowLines`, `rawTableRows` and `rawTableRow`.
- Finding helpers: `findingLocation`, `formatFinding`, `filterFindings`, `hasErrors` and
  `countByLevel`.
- Presets: `LENIENT`, `STRICT`, `lenientBody`, `strictBody` and `optionalSection`.

### [0.1.20] - 2026-06-30 (unpublished)

#### Changed

- A `docRule` function receives the parse tree as its third argument, so a whole-document check
  can report exact lines.

### [0.1.19] - 2026-06-30 (unpublished)

#### Added

- `requires` and `forbids` in YAML contracts.

### [0.1.18] - 2026-06-30 (unpublished)

#### Added

- Text checks: `requires` and `forbids` on a section, and `textRule` over the whole document. Each
  check matches a phrase or a regular expression, with optional case folding, whitespace
  normalising and count bounds, and reports `text/*` findings.

### [0.1.17] - 2026-06-29 (unpublished)

#### Added

- `runCorpus` returns `stats`: files scanned, matched and unmatched, and the count matched by each
  rule. A config rule may carry a `name`.
- The `validate` command prints a run summary above the findings in human output. JSON and SARIF
  output and exit codes are unchanged.

### [0.1.16] - 2026-06-28 (unpublished)

#### Fixed

- `TextMatchSpec` is declared once. Two declarations made the build fail. Its `level` accepts
  `error` or `warn`.

### [0.1.15] - 2026-06-28 (unpublished)

#### Added

- The text matcher behind the text checks, and the `text/*` finding area.

### [0.1.14] - 2026-06-28 (unpublished)

#### Added

- `requires`, `forbids` and `textRule` builders, not yet wired to the engine.

### [0.1.13] - 2026-06-27 (unpublished)

#### Fixed

- `inferConfig` infers a nullable schema for frontmatter fields that hold `null`, so the inferred
  config passes its own check.
- `inferConfig` merges headings whose spellings differ only in case into one section with aliases,
  instead of crashing. If both spellings appear in one document, it stops with an error that names
  the file.

### [0.1.12] - 2026-06-27 (unpublished)

#### Added

- `inferConfig` options and `init` flags `--max-const-len` (default 64) and `--min-const-examples`
  (default 3). A long string or a value seen in too few documents is no longer pinned as a
  constant.

### [0.1.11] - 2026-06-26 (unpublished)

#### Added

- The `init` command: infers a config and contracts from a folder of documents, checks the result
  against the folder, and writes it. `--check` compares an existing config with the folder.
- `inferConfig` groups documents by folder into one contract per group.

### [0.1.10] - 2026-06-26 (unpublished)

#### Added

- `inferConfig` infers frontmatter field types: constants, enums, formats, numbers and booleans.

### [0.1.9] - 2026-06-26 (unpublished)

#### Added

- `inferConfig` infers one contract for a set of documents.

### [0.1.8] - 2026-06-26 (unpublished)

#### Added

- The `inferConfig` API and its option and result types, not yet implemented.

### [0.1.7] - 2026-06-25 (unpublished)

#### Fixed

- Frontmatter finding messages name the field, for example "frontmatter field 'id' is required",
  instead of repeating the schema library's generic message.

### [0.1.6] - 2026-06-23 (unpublished)

#### Added

- `validate --glob`, `--include` and `--exclude` limit which files a run checks.

### [0.1.5] - 2026-06-23 (unpublished)

#### Added

- `validate --contract` checks files against one contract, or against inline glob and contract
  pairs, without a config file.

### [0.1.4] - 2026-06-23 (unpublished)

#### Added

- More `format` values in YAML schemas: those that both Zod and JSON Schema support.

### [0.1.3] - 2026-06-23 (unpublished)

#### Added

- `loadConfig` and `loadConfigFile`: a YAML config that maps globs to contracts. The CLI accepts a
  `.yaml` config.

### [0.1.2] - 2026-06-23 (unpublished)

#### Added

- YAML contracts describe the body grammar and the content leaves. `loadContract` and
  `loadContractFile` return a full `Contract`.

### [0.1.1] - 2026-06-23 (unpublished)

#### Added

- `./declarative` entry point: a YAML contract loader whose frontmatter schema compiles to Zod.

### [0.1.0] - 2026-06-21 (unpublished)

#### Added

- `parse()`: one parse of a markdown document into frontmatter, a tree of heading sections and
  typed blocks with source positions.
- `contract()`, `sections()`, `section()`, `optional()`, `oneOf()`, `gap()`, `rule()` and
  `docRule()`: a contract from a frontmatter schema, a body grammar and rules.
- Content leaves `table()`, `list()`, `code()` and `maxWords()`.
- `Contract.validate()` returns findings; `Contract.read()` returns the typed model, and `Infer`
  gives its type.
- `runCorpus()` and `defineConfig()`: check a folder of documents against a config.
- The `markdown-contract validate` command, with human, JSON and SARIF output.
