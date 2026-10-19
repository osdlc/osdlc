---
id: D-0099
status: open/proposed
title: Adopt rumdl for markdown formatting
related: []
---

## Summary

Adopt rumdl as the markdown formatter over the prettier plugin.

^summary

## Context

Two formatters were trialled across the docs corpus over one milestone.

## Options considered

### prettier-plugin-markdown

Familiar, but reflows wikilinks and breaks Obsidian transclusion.

### rumdl

Obsidian-safe; reflow-only diffs; configurable per repo.

## Recommendation

Adopt rumdl. It produces Obsidian-safe, reflow-only diffs and is configurable per repo.