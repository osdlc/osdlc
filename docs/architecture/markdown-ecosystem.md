# The osdlc markdown crates

How the osdlc markdown crates fit together, before and after
[osdlc#618](https://github.com/osdlc/osdlc/pull/618), including the planned
split of the general walk into `vfs-walk`. Arrows point from a
crate to what it depends on. Versions are the ones in each `Cargo.toml`.
The [decisions](../decisions/README.md) give the reasons, and
[crate-dependencies.md](crate-dependencies.md) shows how skillwright and
determined use these crates.

## Before (osdlc `main`)

There is no shared vault model. `markdown-vault-fs` walks with `std::fs` and
`walkdir`, `markdown-relink` builds its own link facts from that walk, and
`markdown-contract` doesn't depend on any other osdlc crate and isn't
published. Each tool builds its own vault graph: determined has `LinkGraph`
and skillwright has `VaultIndex`.

```mermaid
%%{init: {"flowchart": {"htmlLabels": false, "wrappingWidth": 400}}}%%
flowchart TB
  classDef md fill:#eef4ff,stroke:#5b7fc7
  classDef base fill:#f5f5f5,stroke:#888
  classDef ext fill:#ffffff,stroke:#bbb,stroke-dasharray:3 3,color:#666

  subgraph VAULT[vault]
    MVF["<b>markdown-vault-fs</b> 0.3<br/>vault walk, excluded files,<br/>_system rules<br/>(std::fs)"]:::md
    MR["<b>markdown-relink</b> 0.1<br/>rename / move plans;<br/>its own VaultFacts scan"]:::md
  end

  subgraph DOC[one note]
    ML["<b>markdown-link</b> 0.5<br/>parse links, code spans,<br/>LinkIndex"]:::md
    MC["<b>markdown-contract</b> 0.3<br/>document tree, contract checks<br/>(not published)"]:::md
  end

  subgraph BASE[building blocks]
    FL["<b>frontmatter-lossless</b><br/>split frontmatter / body"]:::base
    YS["<b>yaml-splice</b><br/>edit YAML, keep bytes"]:::base
    SC["<b>slug-collate</b><br/>slugs, name matching"]:::base
    PG["<b>path-guard</b><br/>path containment"]:::base
    EW["<b>etag-write</b><br/>compare-and-swap writes"]:::base
  end

  WD["walkdir, std::fs"]:::ext
  CM["comrak"]:::ext

  MVF --> PG
  MVF --> WD
  MR --> MVF
  MR --> ML
  MR --> FL
  MR --> YS
  MR --> SC
  MR --> EW
  ML --> YS
  ML --> SC
  MC --> CM
```

As an image: [markdown-ecosystem-before.svg](img/markdown-ecosystem-before.svg).

## After (osdlc#618)

New crates have a thick green border. File access goes through one trait,
`vfs-seam`, so the same code runs on disk, in memory, as a preview and in
the browser. `vfs-walk` walks any tree through it and knows nothing about
Markdown or vaults. `markdown-vault-fs` is the vault layer on top: it reads
the vault's excluded files (Obsidian's `userIgnoreFilters`, for example) and
passes them to the walk as a filter. `markdown-vault` is the one vault model, built from
determined's `LinkGraph`. Everything that needs a vault graph uses it.

```mermaid
%%{init: {"flowchart": {"htmlLabels": false, "wrappingWidth": 400}}}%%
flowchart TB
  classDef md fill:#eef4ff,stroke:#5b7fc7
  classDef base fill:#f5f5f5,stroke:#888
  classDef new fill:#eaf7ee,stroke:#3f9b5b,stroke-width:3px
  classDef ext fill:#ffffff,stroke:#bbb,stroke-dasharray:3 3,color:#666

  subgraph VAULT[vault]
    MR["<b>markdown-relink</b> 0.2<br/>rename / move plans,<br/>facts from the vault model"]:::md
    MV["<b>markdown-vault</b> 0.1<br/>the vault model: link graph,<br/>backlinks, frontmatter index,<br/>tolerant note read, refresh"]:::new
    MVF["<b>markdown-vault-fs</b> 0.4<br/>vault layer: notes vs attachments,<br/>excluded files, _system rules"]:::md
  end

  subgraph DOC[one note]
    MC["<b>markdown-contract</b> 0.4<br/>document tree, heading and<br/>block selection (published)"]:::md
    ML["<b>markdown-link</b> 0.7<br/>parse links with options,<br/>strict resolve, link encoding"]:::md
  end

  subgraph IO[file access]
    VW["<b>vfs-walk</b> 0.1<br/>general walk: prune, skip, filter,<br/>symlink and error policy, mtimes"]:::new
    VFS["<b>vfs-seam</b> 0.1<br/>Vfs trait: native, memory,<br/>preview; Clock"]:::new
  end

  subgraph BASE[building blocks]
    FL["<b>frontmatter-lossless</b>"]:::base
    YS["<b>yaml-splice</b>"]:::base
    SC["<b>slug-collate</b>"]:::base
    PG["<b>path-guard</b>"]:::base
    EW["<b>etag-write</b>"]:::base
  end

  CM["comrak"]:::ext

  MR --> MV
  MR --> MVF
  MR --> ML
  MR --> VFS
  MR --> FL
  MR --> YS
  MR --> SC
  MR --> EW
  MV --> MVF
  MV --> ML
  MV --> MC
  MV --> VFS
  MV --> FL
  MV --> YS
  MV --> SC
  MVF --> VW
  MVF --> VFS
  MVF --> PG
  VW --> VFS
  MC --> ML
  MC --> CM
  ML --> YS
  ML --> SC
```

As an image: [markdown-ecosystem-after.svg](img/markdown-ecosystem-after.svg).

## What changed

| Crate               | Before                                              | After                                                                                   |
| ------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `vfs-seam`          | — (lived in skillwright core)                       | New. The one file-access trait.                                                         |
| `markdown-vault`    | — (determined's `LinkGraph` and `FrontmatterIndex`) | New. The one vault model.                                                               |
| `vfs-walk`          | — (inside `markdown-vault-fs`)                      | New. The general walk, with no Markdown or vault rules.                                 |
| `markdown-vault-fs` | 0.3, walks with `std::fs`                           | 0.4, the vault layer on `vfs-walk`; reads the vault's excluded files and passes them in |
| `markdown-link`     | 0.5                                                 | 0.7, scan options, strict resolve, link encoding from skillwright                       |
| `markdown-contract` | 0.3, not published                                  | 0.4, published; heading and block selection from skillwright                            |
| `markdown-relink`   | 0.1, its own scan                                   | 0.2, facts from `markdown-vault`; plans read through `vfs-seam`                         |

`markdown-tags` is still in the dev repo, so `markdown-vault` takes a
`TagLexer` instead of depending on it.

## Regenerating the images

The SVGs in `img/` are rendered from the Mermaid blocks above. After changing
a diagram, run from `docs/architecture`:

```sh
mmdc -i markdown-ecosystem.md -o img/me.svg   # writes me-1.svg, me-2.svg
mmdc -i crate-dependencies.md -o img/cd.svg   # writes cd-1.svg, cd-2.svg
```

Then rename them over the files above. The diagrams use plain SVG text
(`htmlLabels: false`), so a viewer with a different font doesn't clip the
labels.
