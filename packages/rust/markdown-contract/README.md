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
It reads the same YAML contracts. A shared corpus checks that both give the
same findings; see [Parity with the TypeScript package](#parity-with-the-typescript-package)
for exactly what it checks.

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
`tests/corpus.rs` loads each shared contract, validates each document and
compares the findings with the expected ones, as the TypeScript test does:

- the number of findings;
- each finding id, in order;
- the level, line and hint, where the expected file records them.

That is the whole claim. Message text, columns, `fix` edits and findings on
documents outside the corpus are not checked. Fixtures that need custom `rule`
or `docRule` functions cannot be written in YAML, so the corpus marks them
TypeScript-only and the crate skips them.

The crate and the package share the major and minor version. `comrak` is
pinned to an exact version: the line numbers come from its parser, and a
release of `comrak` can move them.

### Regex dialect

A text rule's `regex` and a frontmatter string's `pattern` are compiled with
the [`regex`](https://docs.rs/regex) crate, not as JavaScript regexes:

- lookaround (`(?=`, `(?!`, `(?<=`, `(?<!`) and backreferences are not
  supported;
- `\w`, `\d` and `\b` match Unicode letters and digits, where JavaScript
  matches ASCII only;
- a regex matches code points, where the TypeScript package (no `u` flag)
  matches UTF-16 units. Outside the Basic Multilingual Plane, `.` and a
  negated class match a whole character where JavaScript matches half of it,
  and an empty match before such a character is counted once where
  JavaScript counts it twice;
- `ignoreCase` folds case by Unicode rules, so `k` also matches the Kelvin
  sign (U+212A). JavaScript without the `u` flag does not.

`load_contract` rejects a source the crate cannot compile and names its key.
For a text rule's `regex`, the TypeScript package instead accepts the
contract and throws when it validates.

A text rule's `pattern` is a phrase, not a regex, so it does not depend on
this dialect. Nor do the string `format`s or the whitespace rules (`\s` and
trimming), which follow JavaScript.

### What the crate does not share with the TypeScript package

- No Zod and no typed frontmatter model. The schema runtime covers the JSON
  Schema subset that `mcVersion: 2` contracts use.
- No `read`, `inferConfig`, `migrate` or command-line tool.
- `load_config` takes a resolver for the contract files it names, so it does
  no I/O; `load_config_file` (with `native`) reads them from disk.
- Frontmatter YAML is parsed with `serde_yaml`, not the `yaml` package. A
  document whose frontmatter does not parse gets one `frontmatter/yaml`
  finding, where the TypeScript package can report several. Its message text
  differs, and its line can differ in cases the corpus does not cover.
- A frontmatter finding on a value inside a flow collection (`{a: 1}`,
  `[1, 2]`) has no line, and unknown keys in a flow mapping are reported in
  sorted order rather than document order.
- A `gap` bound must be a non-negative integer. The TypeScript package accepts
  any number.
- Contract load errors carry the same paths but not always the same text.
  An unknown key gets no "did you mean" suggestion.
- Globs in a config cover the common subset of picomatch (`*`, `**`, `?`,
  `[...]`, `{a,b}`), through `globset`.

## Stability

The crate stays on 0.x for now. A breaking change ships only in a new 0.x
minor release, with a CHANGELOG entry.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT License](LICENSE-MIT), at your option.
