---
type: task
schema_version: "5"
id: T-0006
status: closed/done
created: 2026-05-30
last_reviewed: 2026-06-04
impact: medium
complexity: small
completion_note: Shipped via #275. Declared the markdown standard as an ADR plus a Standard.
tags:
  - markdown
  - standard
prs:
  - https://github.com/example/project/pull/275
---
# Research and declare a markdown standard (ADR + Standard)

## Goal

Settle the markdown formatting choices via an ADR and a Standard, with Obsidian
compatibility as a primary constraint.

## Files to touch

| Location | Kind | Change |
|---|---|---|
| `docs/planning/decisions/markdown-standard.md` | add | ADR with options + recommendation |
| `docs/planning/standards/S-0007-markdown-formatting.md` | add | Standard codifying the rules |

## Acceptance criteria

- [x] AC-1: ADR exists with the required Decision body sections.
- [x] AC-2: ADR enumerates each formatting axis with a recommendation.
- [x] AC-3: Standard exists with `applies_to.paths` scoped, status `proposed`.