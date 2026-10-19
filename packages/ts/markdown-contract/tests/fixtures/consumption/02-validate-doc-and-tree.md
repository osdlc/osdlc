---
id: D-0099
status: open/proposed
title: Adopt the markdown-contract engine
---

## Summary

Replace the bespoke body-schema scanners with a combinator grammar over a
positioned section tree.

## Context

The current validator hand-rolls heading extraction and frontmatter slicing in
several places, each with its own drift.