# @osdlc/markdown-vault

## History before the first public release

These versions were never published. They are rebuilt from the development history, which began in
a private repository. The first public release is 0.4.0 and its notes are written by the release.

### [0.3.2] - 2026-11-22 (unpublished)

#### Fixed

- Takes `@osdlc/markdown-link` `^0.11.0` (was `^0.8.1`) and `@osdlc/markdown-tags` `^0.4.3`, so a scan
  and `@osdlc/markdown-render` agree on what is a link. More of a body counts as code (indented
  code, math, `<pre>` and similar blocks, autolinks), and a Markdown link destination may carry a
  title, balanced parentheses or a `<…>` URL with spaces.

### [0.3.1] - 2026-10-31 (unpublished)

#### Added

- `createLinkResolver(index)` returns a resolver that takes an optional second argument, the note a
  link was written in, so a relative target (`./sib`, `../b/note`) resolves from that note's folder.

#### Fixed

- A relative link (`[[./sib]]`, `[[../b/note]]`) resolves from the linking note's folder, and only
  to the file at that path. It used to resolve only through the same-name fallback, so `[[./note]]`
  could land on a shorter same-name note elsewhere. One with no file at its path, or that climbs
  out of the vault, stays unresolved.

### [0.3.0] - 2026-10-31 (unpublished)

#### Changed

- Breaking: the package is named `@osdlc/markdown-vault`.

### [0.2.1] - 2026-10-30 (unpublished)

#### Added

- `createLinkResolver(index)`: the scanner's link-target resolver, exported so a consumer resolves a
  target it found elsewhere (a frontmatter value, an expression argument) by the same rules as
  body links. Its basename table is built on first use, so build a new resolver after changing the
  index.

#### Fixed

- A link that names no file type (`[[note]]`) resolves to the Markdown note before a same-name
  image or other file at a shorter path, then to a file with no extension (`[[Makefile]]`). It
  never resolves to an attachment such as `note.png`.
- A folder-qualified link (`[[projects/plan]]`) matches whole path segments, and one with no match
  in that folder stays unresolved instead of falling back to a same-name note in another folder.

### [0.2.0] - 2026-10-18 (unpublished)

#### Added

- `ScanOptions.tagDialect` and a `tagDialect` argument on `extractInlineTags`: which
  `@osdlc/markdown-tags` rule reads inline tags. Default `obsidian`.

#### Changed

- Breaking: inline tags come from `@osdlc/markdown-tags` and links from `@osdlc/markdown-link`,
  replacing the private code stripper, wikilink pattern and tag pattern. Code is now blanked by
  CommonMark rules, so a `~~~` fence and a longer backtick fence are skipped. Link and image
  destinations and reference definitions no longer give tags (`[see](#section)`). A `^` in a link
  target stays part of the target.
- Breaking: a link's `display` is the link's alias: code inside an alias is kept, and an empty
  alias gives `null`.

### [0.1.5] - 2026-10-06 (unpublished)

#### Fixed

- Wikilinks with an escaped pipe (`[[a\|b]]`) scan correctly.

### [0.1.4] - 2026-09-06 (unpublished)

#### Fixed

- A symlinked note is indexed and resolves as a link target, a symlinked directory is walked, a
  broken symlink is skipped instead of throwing, and a symlink that points back up the tree ends
  the walk.

### [0.1.3] - 2026-09-03 (unpublished)

#### Fixed

- A link target that names a non-Markdown file resolves by its file name, and a name that contains a
  dot (`[[v1.2]]`) still resolves. A target written with an extension prefers the file with that
  name, and one that names an extension that exists nowhere stays unresolved.

### [0.1.2] - 2026-08-22 (unpublished)

#### Fixed

- Inline tags accept any Unicode letter. An accented tag such as `#santé` used to be cut short.

### [0.1.1] - 2026-08-22 (unpublished)

#### Added

- `createVaultIndex` builds a `VaultIndex` from externally supplied notes, with no filesystem scan,
  with the types `ExternalNote` and `CreateVaultIndexOptions`.

#### Changed

- Importing the package no longer loads `node:fs`. It loads when `scanVault` first runs, so a
  browser bundle can import `createVaultIndex`.

### [0.1.0] - 2026-08-14 (unpublished)

#### Added

- Initial version: `scanVault`, the `VaultIndex`, `VaultNote`, `FileMeta`, `LinkRef` and
  `ScanOptions` model, and the `parseFrontmatter`, `extractLinks` and `extractInlineTags` helpers.
