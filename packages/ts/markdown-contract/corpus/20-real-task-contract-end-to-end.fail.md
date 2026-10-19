---
id: T-AB12
type: task
status: open/ready
title: Pin remark-gfm and project table nodes
tags: [markdown, tooling]
impact: medium
complexity: small
---

# Pin remark-gfm and project table nodes

## Goal

Today the projection sees pipe tables as a single paragraph because the parser
omits `remark-gfm`. Pin it so `table`/`list` leaves have real nodes to read.

## Files to touch

| Location | Kind | Change |
|---|---|---|

## Acceptance criteria

- AC-1: a pipe table parses to a `table` BlockNode, not a paragraph
- [ ] AC-2: the projection test fixture for tables passes

## Out of scope

- none