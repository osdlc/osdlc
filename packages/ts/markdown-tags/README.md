# @osdlc/markdown-tags

Inline `#tag` lexing for Markdown note bodies, in three dialects. The
TypeScript twin of the Rust `markdown-tags` crate
(`packages/rust/markdown-tags`). Each function gives the same answer as its
Rust namesake, and both suites read the crate's
`tests/fixtures/conformance.json`. The crate README states each dialect's rule
and where they differ.

- `obsidian`, the default: the `@osdlc/markdown-render` renderer's rule, read
  from the source. A Unicode alphabet, at least one character that is not a
  number, code and then link destinations and reference definitions blanked
  first, and `(` also opens a tag.
- `unicode`: a Unicode alphabet, any first character, code scanned, and only
  the start or whitespace opens a tag.
- `ascii`: ASCII, a letter or `_` first, code blanked first, and `(` also
  opens a tag.

Code blanking is `stripCode` from `@osdlc/markdown-link`, so links and tags agree
on what counts as code.

## Exports

- `inlineTags(body, dialect = 'obsidian')`: the tags in encounter order, not
  deduplicated.
- `extractBoth(body)`: `[unicode, ascii]`, the pair a search index and a link
  graph read.
- `tagAt(text, index, dialect = 'obsidian')`: the tag whose `#` is at `index`,
  or `null`, by the dialect's character rule alone. For text that holds no
  code or link syntax, such as a renderer's text node or an editor's inline
  parser.
- `type TagDialect`, `TAG_DIALECTS`, `DEFAULT_TAG_DIALECT` and
  `isTagDialect(value)`, for an option or setting that names a dialect.

```ts
import { inlineTags } from '@osdlc/markdown-tags'

inlineTags('#santé and (#draft) #2024') // ['santé', 'draft']
inlineTags('#santé and (#draft) #2024', 'unicode') // ['santé', '2024']
inlineTags('#santé and (#draft) #2024', 'ascii') // ['sant', 'draft']
```
