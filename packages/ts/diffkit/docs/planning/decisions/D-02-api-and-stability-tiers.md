---
id: D-02
type: decision
state: proposed
created: 2026-11-22
---

# D-02: The API for the first release and its stability tiers

## Decision

The root entry point, `@osdlc/diffkit`, exports:

| Export | Tier |
| --- | --- |
| `runPrep`, `PrepArgs`, `PrepEnv`, `DEFAULT_THRESHOLDS` | stable |
| `prepManifestSchema`, `PrepManifest`, `PrepFile`, `PrepFlag`, `PrepGroup`, `Thresholds` | stable |
| `DiffkitError` | stable |
| `PACKAGE_MARKERS`, `packageRoots`, `nearestRoot`, `buildGroups` | experimental |

- `splitEven` is not exported. It is the even-split rule the grouping uses, and it is a copy of
  a private helper in `@osdlc/rule-review`. A public export would make that copy a second place
  to change ([T-01](../tasks/T-01-share-the-even-split-rule.md)).
- The four grouping pieces are experimental: their markers, and how a group is packed, may
  change as more ecosystems are covered. A change to them is not a breaking change.
- `prepManifestSchema` is public, so a consumer can check the manifest it reads. `zod` is a peer
  dependency at `^4`, as in `@osdlc/cli-tool`, so the schema shares the consumer's zod.
- `PrepEnv` takes `CommandRunner`s from `@osdlc/command-seam`, so a caller can fake `git` and
  `gh`. A caller imports `spawnRunner` from that package to get real ones.
- The `diffkit` binary and its `prep` options are part of the API.
- The `change` object and the group, category and status words in the manifest are
  `@osdlc/code-stats`'s. A change to them there is a change to the manifest's `schema`.

A README section lists the experimental exports, and `tests/exports.test.ts` fails when the
`@experimental` tags, that list, the `exports` map or the examples disagree.

## Why

- A first release should publish only what a caller needs and what the package can keep. The
  manifest, the way to produce it and the failure it raises are that.
- Everything is documented and used in `examples/`, so each export has a tested example.

## What is proposed

The owner signs off the API above for 0.3.0.

## Reopen if

A second consumer needs the splitting rule or a different runner type.
