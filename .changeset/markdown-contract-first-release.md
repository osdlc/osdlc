---
'@osdlc/markdown-contract': minor
---

The first release on npm. Earlier versions were used only during development and were never published, so this entry lists everything the package does. Contracts for markdown documents. A contract states what a document of one type must hold: frontmatter fields checked by a Zod schema, a grammar over its heading sections, and typed blocks (tables, lists, code, paragraphs) inside them. One parse checks the document and returns findings with line numbers. A document that passes reads back as a typed model. Contracts can be written in TypeScript or in YAML. A runner and the `markdown-contract` command check a folder of documents against a config that maps globs to contracts.

- Four entry points. `@osdlc/markdown-contract/core` holds the parser, the contract builders, the typed model and the read helpers, and imports no Node module. `@osdlc/markdown-contract` adds the folder runner (`runCorpus`, `defineConfig`, `CorpusConfig` and `RunStats`). `/declarative` loads YAML contracts and configs. `/cli` exports `runCli` and `CliResult`; importing it runs nothing.
- The `markdown-contract` bin runs when it is called through a symlink, as `node_modules/.bin` and `npx` call it.
- `markdown-contract migrate <file>... [--write]` rewrites version 1 YAML contracts and configs as version 2.
- `parse()` applies the micromark extensions passed in `extensions`. `MicromarkExtension` is micromark's own `Extension` type.
- `lenientBody` and `strictBody` type the body, as `sections()` does.
- Stability tiers. `inferConfig`, `InferOptions`, `InferResult`, `InferredContract`, `InferredFile`, `TextEdit`, `runCli` and `CliResult` are tagged `@experimental` and may change in a minor release. Everything else is stable for 0.x.
- TSDoc on every export, with `@throws` where a function can throw. Runnable examples for every export, a test of the exports, and a README.
- Node.js 22 or later is supported (`engines.node`). Linux and macOS are supported; Windows is expected to work but is untested.
- The shared validation corpus (documents, YAML contracts and expected findings) is in the package's `corpus/` folder in the repository. It is not published to npm.

- **Breaking:** YAML contracts and configs must declare `mcVersion: 2`. Loading a file with `mcVersion: 1` throws a `DeclarativeError` that names `markdown-contract migrate --write <file>`.
- **Breaking:** `compileContractObject(raw)` drops its `mcVersion` argument and always compiles version 2.
- **Breaking:** `zod` is a peer dependency (`^4`). Signatures take zod's own `ZodType`; the package no longer exports its own `ZodType`, and `LeafSpec` has no `schema` field.
- **Breaking:** `runCorpus` drops its `format` option. Format findings with `formatFinding`, or run the command with `--format`.
- **Breaking:** the `./cli/run` entry point is removed. Import `runCli` from `./cli`.
- **Breaking:** these exports are removed from the package root: `VERSION`; the internal functions `buildModel`, `buildTextFindings`, `matchText`, `synthesizeTextId`, `read`, `validate`, `finding` and `notImplemented` (use `Contract.validate` and `Contract.read`); and the internal types `TextFindingInput`, `TextFindingKind`, `TextKind`, `TextMatchResult`, `UnionToIntersection`, `SectionValueBase`, `BodyEntry` and `NamesTupleOf`. `DeclarativeDoc` is removed from `./declarative`. The `setTyped` and `setTypedItem` writers on table and list blocks are internal and left out of the type declarations.
