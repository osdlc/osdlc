# @osdlc/markdown-astro

Brings [Obsidian](https://obsidian.md)-vault markdown (wikilinks, embeds) into
[Astro](https://astro.build) content collections. The vault is the **canonical
source of truth**; the Astro `src/content/` tree is generated from it.

**Who it is for.** A site built with Astro (tested with Astro 7) whose notes are written in an Obsidian vault
and that wants `[[wikilinks]]` and `![[embeds]]` to work as they do in Obsidian: links resolve to
routed pages, embedded images, video, audio and PDFs are copied and served, and an embedded note,
heading or block is spliced into the page.

**When not to use it.** If you only need wikilinks turned into links with no embeds, assets or
collection-aware resolution, a small remark plugin ([prior art](#prior-art)) is enough. If your
markdown does not live in a vault, you do not need the transform. It is not a markdown renderer; for
that, see `@osdlc/markdown-render`, which it uses for embeds.

## Install

```sh
npm install @osdlc/markdown-astro zod
```

ESM only. Node.js 22 or later. `zod` is a peer dependency (`^4`, the version Astro 7 uses); it is
loaded only by `wikilinkRef`. Linux and macOS are supported; Windows is untested. The package ships
compiled JavaScript and type declarations, and runs on Node only.

## Quick start

1. Write `markdown-astro.config.yaml` next to your Astro project (see [Configuration](#configuration)).
2. Add scripts to the site's `package.json`:

```json
{
  "scripts": {
    "vault:transform": "markdown-astro transform",
    "vault:check": "markdown-astro check",
    "vault:export": "markdown-astro export-vault",
    "build": "markdown-astro transform && astro build"
  }
}
```

3. Add the plugin to `astro.config.mjs` (see [Build-time wikilink resolution](#build-time-wikilink-resolution)).

The transform is deliberately **minimal**. It only touches the things that
actually differ between Obsidian and Astro markdown:

| Construct            | In the vault (Obsidian)        | In Astro `src/content`              |
| -------------------- | ------------------------------ | ----------------------------------- |
| Embedded image       | `![[photo.png]]`               | `![photo.png](/_media/photo.png)`   |
| Sized image          | `![[photo.png\|300]]`          | **left as-is**, rendered at build   |
| Other embed          | `![[Note]]`, `![[clip.mp4]]`   | **left as-is**, rendered at build   |
| Frontmatter asset    | `cover: "[[photo.png]]"`       | `cover: "/_media/photo.png"`        |
| Relational wikilink  | `[[Some Note]]`                | `[[Some Note]]` — **left as-is**    |

Relational `[[wikilinks]]`, non-image embeds and sized images are **not** rewritten by the
transform. An image is sized when the last `|` part of its alias is a size (`|300`, `|300x200`,
`|Caption|300`). A markdown image cannot carry a size, and leaving the embed keeps it for the way
back to the vault. The bundled remark plugin renders them at **build time**, so adding a link target
never requires re-running the transform.

An embed's kind comes from its target, by markdown-render's `embedKind`: `image`,
markdown-render uses: `image`, `video`, `audio`, `pdf`, `note`, `heading`
(`![[Note#Heading]]`) or `block` (`![[Note#^id]]`). A media extension wins
over a fragment, so `![[doc.pdf#page=3]]` is a PDF. An image embed's alt text
is its alias, else its target; a size such as `|300` is never alt text. An
embed inside code is never touched.

**Media embeds are resolved against the whole vault**, not just
`_attachments/`. A bare `![[photo.png]]` is found wherever it lives; an
explicit `![[images/photo.png]]` is honoured. Assets under `_attachments/`
flatten to `/_media/photo.png` (unless a file outside `_attachments/` already
has that path, in which case the prefix is kept); assets elsewhere keep their sub-path
(`images/photo.png` → `/_media/images/photo.png`) and are copied there. Every
media embed is copied, image or not, and the transform records where each one
went in an asset manifest, `.markdown-astro/assets.json` under the Astro root
(`ASSET_MANIFEST`).

## Configuration

One YAML file, `markdown-astro.config.yaml` in the site's root, drives both the transform and the
build-time resolver.

```yaml
astroRoot: .
vault: vault
assets:
  publicDir: public/_media # assets land here for the site
  publicBase: /_media # URL prefix in the rewritten markdown
  vaultDir: _attachments # folder in the vault holding the assets
frontmatterAssets: [cover]
collections:
  - { name: posts, vaultDir: Posts, contentDir: src/content/posts, route: /posts/:slug }
  - { name: people, vaultDir: People, contentDir: src/content/people, route: null }
```

The vault is, first match wins: the `vault` option of `loadConfig(path, { vault })` or the CLI's
`--vault <dir>`; the file's `vault:`, relative to `astroRoot`; then `<astroRoot>/vault`. A host
with its own vault lookup passes its answer as the option.

## CLI

```sh
markdown-astro transform      # vault  ->  src/content  (build input)
markdown-astro export-vault   # src/content  ->  vault   (one-time canonicalisation)
markdown-astro check          # dry run: resolve everything, write nothing
```

Options: `-c, --config <path>`, `--vault <dir>`, `--clean`, `-q, --quiet`, `--version`.
`--clean` deletes the destination before writing, but not when the source has no notes.

## Build-time wikilink resolution

`astro.config.mjs`:

```js
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'astro/config'
import { remarkWikilinksFromConfig } from '@osdlc/markdown-astro'

const configPath = fileURLToPath(new URL('./markdown-astro.config.yaml', import.meta.url))

export default defineConfig({
  // A second argument can carry `{ vault }`, like `loadConfig`, and plugin options.
  markdown: { remarkPlugins: [remarkWikilinksFromConfig(configPath)] },
})
```

`[[Note]]` resolves against the configured collections **in order** — the first
collection that owns a matching key wins:

- resolvable **and** the collection has a `route` → real `<a class="wikilink">`
- resolvable but `route: null` → `<span class="wikilink">` (relation, not clickable)
- no note, but a media file the transform published (`[[report.pdf]]`) → `<a class="wikilink">` to
  its copy
- no match anywhere                                → `<span class="wikilink wikilink-missing">`

A target can be a **bare name** (`[[some-file]]`) or a **vault-relative path**
(`[[00/posts/some-file]]`, optionally with `.md`); `./` and `../` segments
are resolved, and a leading `../` is dropped. The path form keeps working
even though the transform moved the file to `src/content/posts/` — the
resolver reconstructs each note's vault path from `vaultDir`. A `#heading` or
`|alias` suffix is allowed; the label defaults to the last path segment.

> **Ordering matters.** `[[Ada]]` resolves to `posts/ada.md` before
> `people/ada.md` if posts is listed first. Order `collections` to match
> the meaning you want for ambiguous names — or disambiguate with a path link.

### Typed references in frontmatter

`wikilinkRef(type, index?)` is a zod 4 schema for a quoted `"[[type/slug]]"` frontmatter value, for
use in a content collection schema. An optional `|Alias` is allowed. Give it an index from
`buildRefIndex` to also require that the target exists.

```ts
import { z } from 'astro/zod'
import { wikilinkRef } from '@osdlc/markdown-astro'

const place = z.object({ place: wikilinkRef('location') })
```

## Build-time embeds

The same remark plugin renders every embed the transform left in place, with
`@osdlc/markdown-render`'s `remarkEmbeds`, into the markup that library gives it (the
same `markdown-embed-*` classes):

| Kind                      | Renders as                                                    |
| ------------------------- | ------------------------------------------------------------- |
| `video`                   | `<video controls>`, sized by a `\|300` or `\|300x200` alias   |
| `audio`                   | `<audio controls>`                                            |
| `pdf`                     | a link that opens the file in a new tab                       |
| `image`                   | `<img>`, sized like a video (a sized image, or content that skipped the transform) |
| `note`, `heading`, `block` | the note, or its section or block, inside `div.markdown-embed-note` |

The size and alt rules, the element per kind, the placeholders and the guard
order are `@osdlc/markdown-render`'s shared embed rules, which its Vue `Embed`
component also calls.

A media embed points at the copy the asset manifest names. The plugin's
`assets` option gives the manifest path and the public URL prefix
(`remarkWikilinksFromConfig` fills it from the config). The manifest is
re-read whenever it changes, so `astro dev` picks up media the transform
copies while it runs.

A transcluded note is read from its content file, frontmatter dropped and
sliced to the heading or block, then parsed by the site's own processor, so
its syntax extensions apply. It is spliced into the page: links and embeds
inside it resolve like any others, and its link definitions and footnotes are
renamed so they cannot collide with the page's.

What cannot render says so in a placeholder: a missing file or
note, a note that embeds itself (including a same-note `![[#Heading]]`),
nesting deeper than `@osdlc/markdown-render`'s `MAX_EMBED_DEPTH`, or more than
`MAX_EMBEDS_PER_DOCUMENT` transclusions on one page. Run outside a unified
processor, the plugin has no parser, and a note embed shows its target in an
inert placeholder.

> **Caching.** Astro caches each page's rendered HTML and re-renders a page
> only when its own file changes. A page that embeds a note keeps the old copy
> when only the embedded note changes. Clear Astro's cache before a build
> (a site builder that sets `cacheDir` under `.astro/` can delete it each build).

## Slugs

`slugify` turns a wikilink target or title into the filename stem used on disk, so
`[[Maple Street School]]` and `maple-street-school.md` meet at one key.

```ts
import { slugify } from '@osdlc/markdown-astro'

slugify('Maple Street School') // 'maple-street-school'
```

## API stability

Stable: `loadConfig`, `resolveDefaultConfig`, `DEFAULT_CONFIG_NAME`, `ASSET_MANIFEST`, `transform`,
`remarkWikilinks` (also from `@osdlc/markdown-astro/remark`), `remarkWikilinksFromConfig`,
`slugify`, `wikilinkRef`, the `markdown-astro` CLI commands, and the types in their signatures. The
package is 0.x, so a breaking change to a stable item ships in a minor release, marked Breaking in
the changelog.

Experimental items are reachable from the root entry but may change in any minor release. Their
TSDoc says `@experimental`.

Experimental: `rewriteFile`, `buildRefIndex`, `resolveRef`, `pathKey`, `exportVault`

Errors are plain `Error`s with a one-line message. One named error class is planned for 0.9.

## Prior art

- [`astro-loader-obsidian`](https://www.npmjs.com/package/astro-loader-obsidian): a content-collection
  loader with wikilinks and image embeds; no export back to the vault, no note, heading or block embeds.
- [`@oddevan/astro-obsidian-toolkit`](https://www.npmjs.com/package/@oddevan/astro-obsidian-toolkit):
  a link-slug filter, a building block rather than a pipeline.
- [`@flowershow/remark-wiki-link`](https://www.npmjs.com/package/@flowershow/remark-wiki-link),
  `remark-wiki-link`, `remark-obsidian-link`: parse wikilinks and media embeds; no note embeds,
  collections, asset copy or round trip.
- [`@osdlc/markdown-render`](https://www.npmjs.com/package/@osdlc/markdown-render) and
  [`@osdlc/markdown-link`](https://www.npmjs.com/package/@osdlc/markdown-link): this package's
  renderer and link scanner. It is built on them.

## Claims and the tests that hold them

| Claim | Test |
| --- | --- |
| Assets flatten from `_attachments/` unless that would collide | `tests/assets.test.ts` |
| The first collection that owns a key wins | `tests/remark-wikilinks.test.ts` |
| The manifest holds copied media only, and is re-read on change | `tests/run.test.ts`, `tests/remark-embeds.test.ts` |
| Embeds over the depth or count limit render a placeholder | `tests/remark-embeds.test.ts` |
| A sized image or non-image embed stays as written | `tests/markdown.test.ts` |
| Pathological input does not hang a build | `tests/redos.test.ts` |
| Asset and link text is escaped in the markup | `tests/escaping.test.ts` |
| The built CLI runs and exits with the documented codes | `tests/cli.test.ts` |
| The built package loads as a consumer would load it | `tests/smoke.mjs` |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). To try a change with the `markdown-astro` already on your
PATH, link a checkout of this package:

```sh
markdown-astro dev link <path-to-checkout>   # every run now uses that checkout
markdown-astro dev status                    # which code runs, and why
markdown-astro dev off                       # back to the installed copy
```

`MARKDOWN_ASTRO_HOME=<checkout> markdown-astro …` does the same for one run. The checkout runs
`src/cli.ts` from source, with its own installed dependencies. The installed copy says which
checkout it hands off to on stderr; `MARKDOWN_ASTRO_QUIET=1` silences that line. `dev` is a command
word, so `markdown-astro dev …` never reaches `transform`, `export-vault` or `check`. See
[`@osdlc/cli-tool`'s devlink](https://github.com/osdlc/osdlc/tree/main/packages/ts/cli-tool#running-from-a-checkout).

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
