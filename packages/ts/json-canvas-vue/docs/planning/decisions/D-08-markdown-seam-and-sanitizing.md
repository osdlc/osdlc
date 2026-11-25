---
id: D-08
type: decision
state: accepted
created: 2026-11-22
---

# D-08: The markdown seam and sanitizing

## Decision

- A text node renders through the active `MarkdownRenderer`. Its `render` may return a string or a
  promise of one.
- The only built-in is `plainTextRenderer`, the default. It escapes HTML and keeps whitespace. A
  host registers a markdown pipeline to get more.
- `renderedMarkdown` is the one seam that turns a renderer's output into page HTML. It runs
  DOMPurify over the output unless the renderer declares `sanitized: true`.
- A slow render never overwrites a newer one. A renderer that rejects leaves the node showing its
  escaped source.
- The renderer registry is module-wide, so every board on a page shares the active renderer. Its
  functions are experimental. Replacing the active renderer under its own id re-renders open nodes.

## Alternatives

- Bundle a markdown parser. An earlier version did, and it was dropped: it fixed one dialect and
  one set of extensions for every host, and it made the package larger.
- A `renderer` prop on each board. It removes the shared state. It is a larger change to the
  contract, so it waits (T-01).

## Why

- The output lands in `v-html`, so safety has to be on the path every renderer takes. A renderer
  cannot take sanitizing out by not thinking about it.
- A second DOMPurify pass over output that was already sanitized is wasted work and can strip
  custom elements a sanitizing pipeline chose to keep, so a renderer that sanitizes says so.

## Consequences

- A host that wants Obsidian's dialect, wiki links or embeds writes or installs a renderer. The
  package does not ship one.
