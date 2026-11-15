---
id: D-01
type: decision
state: accepted
created: 2026-11-08
---

# D-01: Name and home

## Decision

- The package is `@osdlc/markdown-vault-astro`, published to npm from this repository under `packages/ts/markdown-vault-astro`.
- It depends on `@osdlc/markdown-render`, `@osdlc/markdown-link`, `@osdlc/frontmatter-lossless` and `@osdlc/cli-tool`, all in this repository.

## Why

- No package of this name existed on npm when it was chosen, and none of the similar ones (`astro-loader-obsidian`, `@oddevan/astro-obsidian-toolkit`, the `remark-wiki-link` family) covers the job: note, heading and block embeds, asset copying, collection-aware resolution and a round trip back to the vault.
- Its only dependencies are libraries in this repository, so a change to one lands with the change to the other.

- The name was `markdown-astro` until before the first release. `-vault-` says what the package reads, an Obsidian vault, so it is not mistaken for a general markdown integration for Astro.

## Consequences

Renaming means a new package and a deprecation of this one. Treat the name as fixed.
