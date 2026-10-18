---
'@osdlc/markdown-contract': minor
---

The first release of `@osdlc/markdown-contract` on npm. Contracts for markdown documents. A contract states what a document of one type must hold: frontmatter fields checked by a Zod schema, a grammar over its heading sections, and typed blocks (tables, lists, code, paragraphs) inside them. One parse checks the document and returns findings with line numbers. A document that passes reads back as a typed model. Contracts can be written in TypeScript or in YAML. A runner and the `markdown-contract` command check a folder of documents against a config that maps globs to contracts.

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
