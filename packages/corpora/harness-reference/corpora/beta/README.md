# Beta corpus

A small, plain record of coding-agent harnesses: one Markdown file per harness, checked against a
schema, with the pages and observations that back it. It records what each harness is. Later steps
add questions about how harnesses behave, and claims that cite evidence.

Every value is backed by an upstream page: the vendor's site, docs, repository, license file or
release list. Our own research notes are never the evidence.

The corpus follows [markdown-db](../../../docs/standards/S-GFFY-markdown-db.md). It is data only.
The validator is the [`@osdlc/markdown-db`](../../../packages/ts/markdown-db/README.md) package.

## Layout

- `markdown-db.md`: the root file. Its frontmatter marks the folder as a corpus; its body is the
  front page.
- `harnesses/`: the `harnesses` type. One record per harness, named after the product as the vendor
  writes it, such as `Claude Code.md`.
- `references/`: the `references` type. One record per web page, in a folder per publisher, named
  with a short display name: `references/Anthropic/Claude Code overview.md`.
- `evidence/`: the `evidence` type. One record per observation, in a folder per harness, named with
  the date and what was looked at: `evidence/Claude Code/2026-11-08 Claude Code license.md`.

Each type folder holds its schema, `<type>.schema.md`: a hand-written JSON Schema in the
frontmatter. It is the source of truth for the fields; the body explains them.

Links between records are relative Markdown links, written as quoted strings:
`successor: "[Antigravity](Antigravity.md)"`. A harness's `sources` links to reference records, and
an evidence record links to its `harness` and its `reference`.

A public repository that holds only issues, docs or install scripts is not a source repository, so
`repository` stays unset. When a required value cannot be confirmed, use the honest value (for
`versioning`, `unknown`) and say so in the body.

## Adding a harness

1. Copy a sibling file to `harnesses/<name>.md`, using the product's name as the vendor writes it.
2. Fill each field from the vendor's own pages, and link every page you used under `sources`. A
   page with no reference record needs one first: copy a sibling in `references/<publisher>/`, or
   let `capture` add it. Never guess a URL, license or command name; leave an optional field out
   instead.
3. Set `checked` to today's date and write the body.
4. Run the check.

## Recording evidence

`capture` fetches a page, checks that a quote occurs on it, and writes an evidence record. From
`harness-reference/`:

```sh
pnpm run capture --harness "Codex CLI" --reference "https://github.com/openai/codex" \
  --kind docs --locator "Docs" --name "Codex README on the license" \
  --observed-by "person: <you>" \
  --excerpt "This repository is licensed under the Apache-2.0 License."
```

- `--reference` is an https URL or the path of a reference record. A URL with no record gets one:
  its name and title come from the page title (or `--reference-name` and `--title`), its publisher
  from the harness's vendor (or `--publisher`).
- `--kind` is one of `docs`, `changelog`, `source`, `issue` and `third-party`: the kinds that look
  at a page.
- The quote must occur in the page's visible text, compared with whitespace collapsed. Page chrome
  (`nav`, `header`, `footer`, `aside`) is not text. For a GitHub `blob/` URL, `capture` reads the
  raw file, and for a repository URL its README source, instead of the HTML page; quote what that
  source holds, Markdown link syntax included. It stores the quote with 32 characters either side,
  and fails when it is not found.
- `observed` is today. The file is `evidence/<harness>/<today> <name>.md`; `--name` defaults to the
  reference's name. `capture` never overwrites a record; a second look the same day needs its own
  `--name`.
- `--version` sets the harness version the page describes, with `--version-basis` (default
  `inferred`).
- `capture` validates the corpus afterwards and removes what it wrote if the corpus fails.

Evidence is append-only: a correction, or a later look that finds something else, is a new record.

## Checking it

From `harness-reference/`:

```sh
pnpm run validate:beta   # markdown-db validate corpora/beta
pnpm run check           # every corpus: validate, test, typecheck, generate
```

The validator checks each record against its schema, its id, and every link in it: `successor` and
`fork_of` must link to a harness, `sources` and `reference` to a reference record.
`pnpm exec markdown-db validate --fix corpora/beta` rewrites any wikilinks as relative links first.
