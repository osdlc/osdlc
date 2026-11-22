---
id: D-R8TX
type: decision
state: proposed
created: 2026-11-22
---

# D-R8TX: The API of the first public version

The owner has not yet signed off the API. This note proposes it.

## Decision

- The package has three entry points: `@osdlc/code-stats` (counting, measuring changes, PR
  descriptions, rendering, report schemas), `@osdlc/code-stats/scan` (the line scanner) and
  `@osdlc/code-stats/tree-sitter` (optional syntax-tree scanners), and the `code-stats` command.
- 24 exports are building blocks the commands are made from and that no guide teaches as a first
  step: the description renderers and their section markers, the pipeline stages (operation
  assignment, change categorisation, dependency changes, the complexity analyzers), three constant
  lists and a few scanner helpers. They stay public and carry `@experimental`. The README lists
  them, and `tests/surface.test.ts` fails when the list and the tags disagree.
- Every other export is stable on the 0.x line.
- Every export has TSDoc. Every stable value export is used by a file in `examples/` that imports
  the package by name only. The same test checks both.
- `CodeStatsError` carries a `kind` (`bad-input`, `needs-git`, `failed`) and a classified
  `failure`, so a caller branches on the kind and the error can grow.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Unexport the 24 building blocks | It shrinks the surface, but removes pieces a caller needs to assemble its own pipeline, such as a PR bot that renders only the risk list. |
| Leave every export stable | Their shapes follow what the commands need and may change. A stable promise on them would make each of those changes breaking. |
| Hide the report types behind the functions | A caller that stores or sends a report needs its type and its schema. |

## Why

- `@osdlc/diffkit` already uses a number of these exports (the change categories, file groups,
  the report schema, the TypeScript loader). They stay stable, with the same names and types.
- `@experimental` follows the rule the other `@osdlc` packages use: the shape may change in any
  release, and such a change is not a breaking one.

## Consequences

- Moving an experimental export to stable needs a TSDoc review and an example.
- A stable export is removed or retyped only in a minor release, with a `Breaking:` changelog
  entry.
