---
id: D-01
type: decision
state: proposed
created: 2026-11-22
---

# D-01: Name

## Decision

The package is `@osdlc/markdown-vault-query` on npm, and its command is `markdown-vault-query`.
This is proposed: the owner of the `@osdlc` scope confirms it before the first release.

## Alternatives

| Name                        | Why not                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| `obsidian-bases`            | The package's first name. It puts a product name first, and the engine reads plain markdown.     |
| `@osdlc/obsidian-bases`     | Same reason. "Obsidian" stays in the description as a descriptive word, not in the name.         |
| `@osdlc/markdown-vault-db`  | The word `db` fits a future query layer on the corpus model. It promises more than this package does. |

## Why

- The name says what it works on, a markdown vault, and what it does, query. It pairs with
  `@osdlc/markdown-vault`, which holds the vault index it queries.
- It was free on npm when it was chosen.
- The package began in sksizer/dev (a private repository) as `obsidian-bases`. That name was never
  published, so no caller has an old name to move from.

## Would reopen it

A decision to rename the whole markdown family, or a query layer on the corpus model that takes
over the name. See [T-05](../tasks/T-05-corpus-model.md).
