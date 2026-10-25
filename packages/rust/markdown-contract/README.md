# markdown-contract

Say what a markdown document of a given type must contain, and check it, for Rust.

Markdown files are used as data: notes, planning docs, decision records,
runbooks. People edit them by hand, so they drift from the shape the tools
that read them expect. A required section goes missing, a table loses a
column, a frontmatter field has the wrong type.

A **contract** states what one type of document must hold: a schema for the
frontmatter, a grammar over its heading sections, and typed blocks (tables,
lists, code, paragraphs) inside them. One parse checks the document and
returns findings, each with a finding id, a level and a line number.

- `load_contract` compiles a YAML contract (`mcVersion: 2`) and `validate`
  checks a document against it. `validate` does not fail on a bad document; it
  returns the findings, sorted by line.
- A contract can also be built in code with `Contract` and the builders
  `section`, `sections`, `optional`, `one_of`, `gap` and `rule`.
- `load_config` and `run_corpus` route the files of a folder to contracts by
  glob and return the findings and an exit code (0 when no finding has level
  `error`, 1 otherwise).
- The crate never changes the documents it checks.

This is the Rust twin of the npm package
[`@osdlc/markdown-contract`](https://www.npmjs.com/package/@osdlc/markdown-contract).
It reads the same YAML contracts and gives the same finding ids, levels and
line numbers.

## Install

```sh
cargo add markdown-contract
```

### Cargo features

- `native` (on by default): the code that reads files. `load_contract_file`,
  `load_config_file`, `walk_dir` and `run_corpus_dir`. Without it the crate
  does no I/O: every function takes strings. Build with
  `default-features = false` for `wasm32-unknown-unknown`:

  ```toml
  markdown-contract = { version = "0.3", default-features = false }
  ```

## Quick start

```rust
use markdown_contract::{FindingLevel, load_contract, validate};

let contract = load_contract("\
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
")?;

let document = "---\nstatus: done\n---\n\n## Context\n\nConfig is checked by hand.\n";
let findings = validate(document, &contract, "decisions/zod.md");

// `status: done` is not in the enum, and the Decision section is missing.
assert_eq!(findings.len(), 2);
assert_eq!(findings[0].id, "frontmatter/enum");
assert_eq!(findings[0].pos.map(|p| p.line), Some(2));
assert_eq!(findings[1].id, "structure/section-missing");
assert!(findings.iter().all(|f| f.level == FindingLevel::Error));
# Ok::<(), markdown_contract::DeclarativeError>(())
```

`examples/validate.rs` is the same program with printed output. Run it with
`cargo run --example validate`.

## Parity with the TypeScript package

Both packages are checked against one corpus of contracts, documents and
expected findings: `packages/ts/markdown-contract/corpus/` in the
[osdlc/osdlc](https://github.com/osdlc/osdlc) repository. This crate's
`tests/corpus.rs` loads each contract, validates each document and compares
the findings with the expected ones: the count, each id in order, and the
level, line and hint where the corpus pins them. Fixtures that need custom
`rule` or `docRule` functions cannot be written in YAML, so the corpus marks
them TypeScript-only and the crate skips them.

The crate and the package share the major and minor version. The crate has
no Zod; its schema runtime covers the JSON Schema subset that `mcVersion: 2`
contracts use.

`comrak` is pinned to an exact version. The line numbers the crate reports
come from its parser, and a release of `comrak` can move them.

## Stability

The crate stays on 0.x for now. A breaking change ships only in a new 0.x
minor release, with a CHANGELOG entry.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT License](LICENSE-MIT), at your option.
