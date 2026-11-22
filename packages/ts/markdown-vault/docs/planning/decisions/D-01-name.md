---
id: D-01
type: decision
state: proposed
created: 2026-11-22
---

# D-01: The name

## Decision

Proposed: the package is `@osdlc/markdown-vault` on npm. The owner confirms the name before the
first release.

## Alternatives

| Name                         | Why not                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `@osdlc/obsidian-vault`      | An earlier name. It names one application, and the package reads any folder of Markdown notes. |
| `@osdlc/markdown-corpus`     | The planned name of the shared corpus model. See [D-04](D-04-planned-corpus-model.md). |
| `@osdlc/markdown-vault-core` | Says nothing more than the short name.                                        |

## Why

- "Vault" is the word Obsidian users use for a folder of notes, and the package reads that
  convention: wikilinks, embeds, tags and frontmatter.
- It matches the family: `markdown-vault-fs` and `markdown-vault-astro` in this repository, and
  `@osdlc/markdown-vault-query` over this model.
- The name was free on npm and crates.io when it was chosen. Other ecosystems hold unrelated
  projects with the name, such as a REST service on PyPI.

## Consequences

- If the corpus model absorbs the package, the name is retired with a final release that points
  there. See [T-03](../tasks/T-03-fold-into-the-corpus-model.md).
