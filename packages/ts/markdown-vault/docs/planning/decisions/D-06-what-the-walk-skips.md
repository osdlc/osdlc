---
id: D-06
type: decision
state: accepted
created: 2026-11-22
---

# D-06: What the walk skips

## Decision

`scanVault` skips every entry, file or folder, whose name starts with `.` (so `.obsidian`, `.git`
and `.trash`) and every entry named `node_modules`, at any depth. It indexes everything else,
including files that are not Markdown, unless `includeNonMarkdown` is `false`.

## Why

- A dot entry is hidden state, such as application settings and version control data, and not
  content.
- The Obsidian trash folder holds deleted notes, which a link must not resolve to.
- A `node_modules` folder in a vault is a dependency tree, not notes.
- One rule, "starts with a dot", is simpler to state than a list of names.

## Consequences

- A note whose file name starts with a dot is not indexed.
- Rules that depend on a vault's own settings, such as the files an application excludes, are
  not read. The Rust `markdown-vault-fs` crate reads those.
