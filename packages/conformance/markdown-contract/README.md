# markdown-contract

Contracts for markdown documents: a contract states what a document type must
hold (frontmatter, heading sections, typed tables, lists and code blocks), and
validating a document against it gives a list of findings. This family covers
contracts written as YAML (`mcVersion: 2`).

| Implementation | Language | Directory |
|---|---|---|
| `@osdlc/markdown-contract` (reference) | TypeScript | `packages/ts/markdown-contract` |
| `markdown-contract` | Rust | `packages/rust/markdown-contract` |

`suite.json` holds the cases. It has one section, `validate`. Each case gives
a `contract` (the YAML text) and a `source` (the document, bytes as they are:
line numbers in the findings depend on them), and its `expect.findings` lists
every finding in engine order as `{ id, level, line?, hint? }`. `line` is the
1-based line of the finding's position and `hint` is the text from a
`description:`; each is left out when the finding has none. A case validates
with the path `fixture.md`. Both runners compare every field of every finding.

Message text, columns and `fix` edits are not compared.

Write a new case's `contract` and `source` by hand, then run

```sh
pnpm --filter @osdlc/markdown-contract build
pnpm --filter @osdlc/markdown-contract conformance:write
```

to write its `expect`. Never write that by hand. The generator imports the
package by name, so it loads the built `dist/`. The case `name` is the
document's file name, such as `01-single-required-section.pass.md`, and the
TypeScript fixture modules find their documents and expected findings by it.

## Not in the suite

- Fixtures that need custom `rule` or `docRule` functions, or `.refine()`.
  YAML cannot express them, so they are TypeScript-only. Their documents and
  expected findings are in `packages/ts/markdown-contract/tests/fixtures/ts-only/`.
- Reading a document into a typed model, inference, migration of `mcVersion: 1`
  contracts and the command-line tool. The crate has none of them.
- Findings on documents that no case covers.
