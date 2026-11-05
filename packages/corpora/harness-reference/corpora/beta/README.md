# Beta corpus

A small, plain record of coding-agent harnesses: one Markdown file per harness, checked against a
schema. This is step one. It records only what each harness is. Later steps add questions about
how harnesses behave.

Every value is backed by an upstream page: the vendor's site, docs, repository, license file or
release list. Our own research notes are never the evidence.

The corpus follows [markdown-db](../../../docs/standards/S-GFFY-markdown-db.md). It is data only.
The validator lives in `../../src/markdown-db/`.

## Layout

- `markdown-db.md`: the root file. Its frontmatter marks the folder as a corpus; its body is the
  front page.
- `harnesses/`: the `harnesses` type. One record per harness, named after the product as the vendor
  writes it, such as `Claude Code.md`.
- `harnesses/harnesses.schema.md`: the schema, a hand-written JSON Schema in the frontmatter. It is
  the source of truth for the fields; the body explains them.

`successor` and `fork_of` are relative links to another harness record, written as quoted strings:
`successor: "[Antigravity](Antigravity.md)"`.

A public repository that holds only issues, docs or install scripts is not a source repository, so
`repository` stays unset. When a required value cannot be confirmed, use the honest value (for
`versioning`, `unknown`) and say so in the body.

## Adding a harness

1. Copy a sibling file to `harnesses/<name>.md`, using the product's name as the vendor writes it.
2. Fill each field from the vendor's own pages, and list every page you used under `sources`.
   Never guess a URL, license or command name; leave an optional field out instead.
3. Set `checked` to today's date and write the body.
4. Run the check.

## Checking it

From `harness-reference/`:

```sh
pnpm run validate:beta   # node src/markdown-db/cli.ts validate corpora/beta
pnpm run check           # every corpus: validate, test, typecheck, generate
```

The validator checks each record against the schema, its id, and every link in it: `successor` and
`fork_of` must link to an existing harness. `node src/markdown-db/cli.ts validate --fix corpora/beta`
rewrites any wikilinks as relative links first.
