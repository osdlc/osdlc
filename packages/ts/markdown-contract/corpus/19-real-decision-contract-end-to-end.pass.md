---
id: D-0042
status: open/accepted
title: Adopt the projection layer as the validator substrate
related: []
---
# Adopt the projection layer as the validator substrate

## Summary

The position-carrying section tree (projection) is the one substrate both the
grammar and the Zod leaves read, so findings localize to a source line.

^summary

## Context

Raw mdast is flat siblings with inline-subtree cells — hostile for direct rule
authoring. We need a stable intermediate form.

## Decision

We adopt a single projection pass between mdast and the typed model.

### Components

| # | Component | Resolution |
| - | --------- | ---------- |
| 1 | projection | one parse → positioned section tree |

## Consequences

Rules read the projection, not mdast; positions survive into findings.