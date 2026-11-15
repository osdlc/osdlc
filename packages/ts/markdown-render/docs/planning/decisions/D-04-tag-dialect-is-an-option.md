---
id: D-04
type: decision
state: accepted
created: 2026-11-08
---

# D-04: The tag dialect is an option

## Decision

`MarkdownRenderOptions.tagDialect` and `RemarkTagsOptions.tagDialect` choose the rule that reads `#tag` text. The default is `obsidian`.

## Why

The tag rule lives in `@osdlc/markdown-tags`, which has three dialects. The renderer passes the choice through and keeps the default that matches what Obsidian shows.

## Consequences

- The renderer reads the tags a text node holds; the shared tag cases in `packages/conformance/markdown-tags` pin what it shows.
