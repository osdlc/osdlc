---
id: T-05
type: task
state: open
created: 2026-11-22
---

# T-05: Move onto the corpus model

## Goal

Run the query engine over the planned corpus model when it replaces `@osdlc/markdown-vault`.

## Today

The package imports `createLinkResolver` (in `src/expr/eval.ts`) and `scanVault` (in `src/cli.ts`)
from `@osdlc/markdown-vault` at run time, and `VaultIndex` and `VaultNote` as types only. A
planned corpus model may absorb that package, and its query layer may sit on the corpus model
instead.

## Approach

- [ ] When the corpus model exists, decide whether this package moves onto it, merges into its query
      layer, or stays on the vault index.
- [ ] Record the decision, and the name if it changes ([D-01](../decisions/D-01-name.md)).

## Acceptance criteria

- [ ] A decision note records where the query engine runs.
