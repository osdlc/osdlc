---
'@osdlc/markdown-render-vue': minor
---

First release. Vue 3 components for `@osdlc/markdown-render`: `MarkdownRender`, which walks the renderer's hast into VNodes (never `v-html`), the built-in components for wikilinks, tags, embeds, callouts, tasks, math, mermaid, code blocks and tables, and the `NoteSource` context. It was the `./vue` entry of `@osdlc/markdown-render`, which no longer ships it. `vue` `^3.5` is a required peer; `katex` and `mermaid` are optional peers. `package.json` was set to 0.7.0 by hand so the package starts at 0.8.0, the same line as `@osdlc/markdown-render`.
