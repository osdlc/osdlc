---
id: D-01
type: decision
state: accepted
created: 2026-11-08
---

# D-01: The dialect consumes remark's parse

## Decision

Every dialect feature is a remark or rehype plugin over the standard mdast and hast trees. The package has no parser of its own.

## Why

Code, links, tables and escapes are already decided by a CommonMark-conformant parser. A second parser would disagree with it at the edges, and a host that adds its own remark plugin would not compose with it.

## Consequences

- Fenced and inline code never become `text` nodes, so no dialect feature reads inside them.
- A feature that needs source positions reads the offsets the parse already gives. Wikilinks and embeds are placed by them (D-05).
- Escaped syntax is masked at parse time by a `mdast-util-from-markdown` extension and restored after the last plugin.
