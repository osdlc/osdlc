# @osdlc/markdown-contract

Say what a markdown document of a given type must contain, and check it.

Markdown files are used as data: notes, planning docs, decision records,
runbooks. People edit them by hand, so they drift from the shape the tools
that read them expect. A required section goes missing, a table loses a
column, a frontmatter field has the wrong type. Each tool then checks for this
in its own way, or not at all.

This package gives each document type one **contract**:

1. **One parse.** A markdown file is parsed once into frontmatter, sections and
   blocks (tables, lists, code blocks, paragraphs), each with its source line.
2. **One contract per document type.** A contract has a structure plane (which
   sections and block kinds appear, and in what order), a content plane (Zod
   schemas over the frontmatter and each block's data) and named rules for
   checks a grammar cannot express.
3. **Validate gives findings.** `validate` returns findings with a path and a
   line. It does not throw on a bad document.
4. **A typed model.** The contract that checks a document also types it.
   `read` returns the frontmatter, the sections and the table rows as typed
   values, or throws `ContractError` when the document has errors.
5. **Code or YAML.** Write a contract in TypeScript, or as YAML loaded through
   `@osdlc/markdown-contract/declarative`.
6. **A folder runner and a command.** `runCorpus` and the
   `markdown-contract` command check a folder against a config that maps globs
   to contracts.

It is not a markdown renderer or editor, and it does not rewrite YAML. It
never changes the documents it checks. Only `markdown-contract init` and
`migrate --write` write files, and only the ones you ask for.

## Install

```sh
npm install @osdlc/markdown-contract zod
```

ESM only. Node.js 22 or later. `zod` 4 is a peer dependency, so your schemas
and the package use the same copy.

## Quick start

```ts
import { contract, section, sections, table } from '@osdlc/markdown-contract'
import { z } from 'zod'

const decision = contract({
  frontmatter: z.object({
    title: z.string(),
    status: z.enum(['proposed', 'accepted', 'rejected']),
  }),
  body: sections({ order: 'strict', allowUnknown: false }, [
    section('Context'),
    section('Decision'),
    section('Options', {
      content: table({ columns: ['Option', 'Cost'], cells: { Cost: z.coerce.number() } }),
    }),
  ]),
})

const source = `---
title: Use zod for config
status: accepted
---

## Context

Config is checked by hand.

## Decision

Use zod.

## Options

| Option | Cost |
| ------ | ---- |
| zod    | 1    |
| ajv    | 2    |
`
```

```ts
const result = decision.validate(source, { path: 'decisions/zod.md' })
// result.findings is []

const doc = decision.read(source, { path: 'decisions/zod.md' })
const status = doc.frontmatter.status
const costs = doc.body.Options.column('Cost')
// status is 'accepted'; costs is [1, 2], as numbers
```

Change `status` to `done` and a cost to `lots`, and `validate` returns two
findings: `frontmatter/enum` on line 3 and `content/table/cell` on line 19.
`read` then throws `ContractError`, which carries the findings.

The files in [`examples/`](./examples) run as tests and use every export.

## Contracts

`contract({ frontmatter, body, rules, description })` takes:

- **frontmatter**: a Zod schema for the YAML frontmatter.
- **body**: a grammar from `sections(levelOptions, specs)`. A spec is
  `section(name, options)`, `optional(spec)`, `oneOf(names)` or `gap()`.
  `order` is `strict`, `recognized-relative` or `none`, and `allowUnknown`
  says whether undeclared sections may appear. `LENIENT`, `STRICT`,
  `lenientBody`, `strictBody` and `optionalSection` are shorthands.
- **content leaves**, in a section's `content`: `table({ columns, cells,
  minRows })`, `list({ everyItem, minItems })`, `code({ lang })` and
  `maxWords(n)`. A `content` record of leaves binds each one to a block by its
  `^anchor` id.
- **rules**: `rule(id, fn)` on a section and `docRule(id, fn)` on the whole
  document, for checks a grammar cannot express. `requires`, `forbids` and
  `textRule` check that a phrase or a regular expression appears, or does
  not.
- **description**: guidance for authors. A finding carries the nearest
  `description` as its `hint`.

A finding is `{ id, level, path, pos?, message, hint?, fix? }`. Its `level`
comes from the contract: `error`, `warn` or `report`. Only `error` fails a
document.

## YAML contracts

A contract can be data instead of code. `loadContract`, `loadContractFile`
and `compileContractObject` compile it to the same `Contract`, with the same
findings and the same typed model:

```yaml
mcVersion: 2
kind: contract
frontmatter:
  type: object
  required: [status]
  properties:
    status: { enum: [open, accepted] }
body:
  order: strict
  additionalSections: false
  sections:
    - section: Context
    - section: Decision
      content:
        table:
          columns: [Option, Cost]
```

The frontmatter schema is a subset of JSON Schema 2020-12. The body grammar
has `order`, `additionalSections`, nested `sections`, repeat counts
(`minContains`, `maxContains`), content leaves, `requires` / `forbids` and
`description`. Custom `rule` and `docRule` functions need code. The
[markdown-contract documentation site](https://markdown-contract-docs.pages.dev/)
describes the format in full.

A config maps globs to contracts:

```yaml
mcVersion: 2
kind: config
rules:
  - include: ['decisions/*.md']
    contract: ./decision.contract.yaml
```

Only `mcVersion: 2` is read. A version 1 file throws a `DeclarativeError`
that names the fix: `markdown-contract migrate --write <file>` rewrites it as
version 2.

## Command line

```sh
markdown-contract validate ./docs                  # exit 0 clean, 1 error findings, 2 usage error
markdown-contract validate ./docs --format sarif   # human (the default), json or sarif
markdown-contract validate ./docs --contract decision.contract.yaml
markdown-contract init ./docs --dry-run            # infer contracts from existing files
markdown-contract init ./docs --check              # fail when files drift from the config
markdown-contract migrate old.contract.yaml --write
```

Without `--config <file>` or `--contract <file>`, `validate` looks in the
current folder for `markdown-contract.config.js`, `.mjs`, `.yaml` or `.yml`,
then `markdown-contract.yaml` or `.yml`. `--glob`, `--include` and `--exclude`
narrow the files. `markdown-contract --help` prints the full usage.

`runCli(argv, { cwd })` from `@osdlc/markdown-contract/cli` runs the same
command in process and returns `{ code, stdout, stderr }` as a `CliResult`.

## API

`@osdlc/markdown-contract/core` holds the parser, the contract builders, the
typed model and the read helpers. It imports no Node module, so it can go in
a browser bundle. `@osdlc/markdown-contract` is `./core` plus the folder
runner. `./declarative` reads YAML and `./cli` runs the command; both need
Node.

- Parse: `parse(source, options)` returns a `DocTree` of `SectionNode`s and
  `BlockNode`s (`BlockKind`), with `SourcePos` positions, `InlineSpan`s and
  the `Mdast` tree. `ParseOptions` takes `MicromarkExtension`s.
  `splitFrontmatter` returns a `FrontmatterSplit` without a full parse.
- Build a contract: `contract`, `ContractDef`, `Contract`, `sections`,
  `section`, `optional`, `oneOf`, `gap`, `LevelOpts`, `SectionOpts`, `Spec`,
  `SectionSpec`, `OptionalSpec`, `OneOfSpec`, `GapSpec`, `SectionSeq`,
  `LENIENT`, `STRICT`, `lenientBody`, `strictBody` and `optionalSection`.
- Content leaves: `table`, `list`, `code`, `maxWords`, `LeafSpec` and
  `RowOf`.
- Rules and text checks: `rule`, `docRule`, `Rule`, `DocRule`, `Ctx`,
  `requires`, `forbids`, `textRule`, `TextRuleSpec` and `TextMatchSpec`.
- Validate: `ValidateCtx`, `ValidationResult`, `Finding`, `FindingLevel`,
  `TextEdit`, `ContractError`, and the finding helpers `countByLevel`,
  `filterFindings`, `findingLocation`, `formatFinding` and `hasErrors`.
- The typed model: `Doc`, `Infer`, `BodyOf`, `SectionValue`, `SectionGroup`,
  `SectionView`, `TableView`, `ListView`, `ListItem`, `CodeView`,
  `ParagraphView` and `BlockView`.
- Read the parse tree: `findSection`, `sectionsAt`, `sectionForLine`,
  `sectionSpans` with `SectionSpan`, `blocksOfKind`, `codeBlockLines`,
  `tableRowLines`, `rawTableRow` and `rawTableRows`.
- Folders, from the root entry: `runCorpus`, `defineConfig`, `CorpusConfig`
  and `RunStats`.
- YAML, from `./declarative`: `loadContract`, `loadContractFile`,
  `compileContractObject`, `loadConfig`, `loadConfigFile`,
  `DeclarativeError`, and config inference with `inferConfig`,
  `InferOptions`, `InferResult`, `InferredContract` and `InferredFile`.
- The command, from `./cli`: `runCli` and `CliResult`.

Each export has TSDoc, including `@throws` where it can throw. Your editor
shows it.

### Stability

The package is 0.x. The stable exports follow semantic versioning for 0.x: a
breaking change goes in a minor release and is marked `Breaking` in the
changelog. The experimental exports may change in any minor release.

The experimental exports:

`inferConfig`, `InferOptions`, `InferResult`, `InferredContract`,
`InferredFile`, `TextEdit`, `runCli` and `CliResult`.

Config inference and the in-process command work and are tested, but their
shape is not settled. No check fills `TextEdit` yet; it is carried on
`Finding.fix`. The `markdown-contract` command, its flags and its output
formats are experimental in the same way.

## Runtimes and platforms

- **Runtimes:** Node.js 22 or later. ESM only. `./core` has no Node imports.
  A test checks its built import graph; no test runs it in a browser.
- **Platforms:** Linux and macOS are supported and tested in CI. Windows is
  expected to work but is untested. Support for it is planned.

## How it compares

- **`@jackchuka/mdschema`** is a Go command that checks markdown structure
  against a YAML schema. It overlaps with the YAML contracts here. This
  package adds Zod checks on table cells and list items, rules in code, and a
  typed model of a valid document.
- **`remark-lint-frontmatter-schema`** checks frontmatter against a JSON
  Schema. It overlaps with the frontmatter plane only; it does not check
  sections or blocks.
- **markdownlint** and **remark-lint** check style: heading levels, list
  markers, line length. They do not know what a document of one type must
  contain. Use them alongside this package.

## Typed rows since 0.2.0

The typed model reads table rows back with the output type of each declared
cell schema. A cell whose schema transforms its value, such as
`z.coerce.number()`, reads back as the transformed value; other columns stay
strings. `table()`, `section()`, `sections()` and `Infer` carry the cell
types, and `RowOf` computes the row type. Code written for 0.1 that treated
every row as `Record<string, string>`, or passed explicit type arguments to
these functions, needs updating.

## Security

`.js` and `.mjs` configs run code when they load, and regular expressions in
contracts run on every document. Load only configs and contracts you trust.
See [SECURITY.md](./SECURITY.md).

## Development

The tests run on [Vitest](https://vitest.dev) under Node. From the package
folder, `pnpm test` builds `dist/` once, then runs the unit tests, the fixture
suites and `examples/`. `corpus/` holds the shared validation corpus: YAML
contracts, documents and expected findings that any engine for these
contracts can run. See [corpus/README.md](./corpus/README.md) and
[CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT OR Apache-2.0, at your option. See [LICENSE-MIT](./LICENSE-MIT) and
[LICENSE-APACHE](./LICENSE-APACHE).
