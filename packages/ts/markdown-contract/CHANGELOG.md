# Changelog

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
