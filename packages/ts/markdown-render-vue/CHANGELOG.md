# @osdlc/markdown-render-vue

## 0.8.1

### Patch Changes

- 48bad7e: Export `NoteSourceKey` and `EmbedAncestorsKey` again, for a host that provides the note source app-wide or injects the embed chain outside `setup`. A PDF embed's `href` takes the asset URL check again, so a host that serves attachments as `blob:` URLs gets a working PDF link; every other link, note-authored ones included, still refuses `blob:`.

## 0.8.0

### Minor Changes

- 258384e: First release. Vue 3 components for `@osdlc/markdown-render`: `MarkdownRender`, which walks the renderer's hast into VNodes (never `v-html`), the built-in components for wikilinks, tags, embeds, callouts, tasks, math, mermaid, code blocks and tables, and the `NoteSource` context. It was the `./vue` entry of `@osdlc/markdown-render`, which no longer ships it. `vue` `^3.5` is the only peer: `katex` and `mermaid` are optional peers of `@osdlc/markdown-render`, which loads them, and this package never imports them. `package.json` was set to 0.7.0 by hand so the package starts at 0.8.0, the same line as `@osdlc/markdown-render`.
  
  Hardening: the walker also refuses `script`, `iframe`, `object` and `embed` elements, `srcdoc`, and `href`, `src`, `action` and `formaction` values with a script scheme, so a tree that skipped the sanitizer (`sanitize: false`) cannot run code. "Copy table as CSV" clamps `colspan` to 1000 and `rowspan` to 65534 and keeps columns aligned when a row is shorter than a rowspan above it. A foldable callout's toggle is now a button beside the title, so a link in the title no longer folds the callout. A Mermaid redraw after a failure keeps the source fallback until it succeeds. Two headings with the same id no longer share a fold key.

### Patch Changes

- Updated dependencies [258384e]
  - @osdlc/markdown-render@0.8.0
