# D-ODPP: `markdown-vault` is the one vault model

Accepted 2026-11-04. Part of
[D-YRKH](D-YRKH-one-implementation-per-vault-concept.md).

## Decision

- **New crate `markdown-vault`, extracted from determined.** It is
  `determined-notes`' `LinkGraph`, `NoteFacts` and `FrontmatterIndex`, moved
  here and put on `vfs-seam`: every file, every note, outgoing links,
  backlinks, inline tags, link resolution through `markdown-link`, and
  incremental refresh.
- **It adds** typed edges (link, embed, frontmatter), unresolved edges, and
  a one-shot `Vault::load` beside incremental refresh.
- **A note's document tree is not part of it.** A caller that needs headings
  or blocks parses the note with `markdown-contract` itself, so tools that
  only need the graph don't build a Markdown parser.
- **One bad note never stops a load.** A note with malformed frontmatter
  reads as body only.
- **Tags come through a `TagLexer`** the caller supplies, since the tag
  lexer is not in osdlc yet.
- **`markdown-relink` builds its facts from it** (`VaultFacts::from_vault`)
  instead of scanning on its own.

## Why

`LinkGraph` was the most complete of the four vault models and already used
the shared crates.

## Options rejected

- Write a new model.
- Keep `markdown-relink`'s own scan.

## Consequences

- The TS `@osdlc/markdown-vault` becomes this crate's twin: the same
  model, with a shared `conformance.json` both suites pass, as
  `markdown-link` does. Not done yet.
- determined's graph, `markdown-relink` and skillwright's load use one model.
- `VaultFacts::from_vault` needs a whole `Vault`. Building it from a
  `LinkGraph` alone is a follow-up; determined does it itself until then.

## Reopen if

- A caller needs a model shape this one can't provide with an option.
- Checking heading and block links across the whole vault becomes a
  feature; then the document tree may join, behind a feature flag.
