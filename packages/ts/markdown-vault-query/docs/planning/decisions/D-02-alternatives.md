---
id: D-02
type: decision
state: proposed
created: 2026-11-22
---

# D-02: Alternatives, and why this package continues

## Decision

The answer is to continue and publish. This is proposed: the owner confirms it. The spike in
[T-04](../tasks/T-04-try-the-alternatives.md) tested it and it held; see
[Findings of the spike](#findings-of-the-spike).

## What else exists

Two packages do the same core job. The facts are from their published packages in November 2026.

| Package                         | Covers                                                                                                                                                   | Does not cover                                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `@type32/obsidian-bases-parser` | Parses, writes and edits `.base` files. The expression language, and queries over a `BaseHost` the caller supplies. No file system. Follows Obsidian 1.15.1 as observed. | A command line, a vault scanner or index, paged ad hoc queries, and `base` blocks in markdown.          |
| `mdbasequery`                   | `.base` files and queries built from YAML or flags, as a command line and a TypeScript library, over a vault directory.                                  | An in-memory index as input, and editing `.base` files. It is at 0.0.x.                                  |

Other packages cover half the job (an expression parser with no `.base` files), run only inside
Obsidian, or render a base in a site.

## Why this package continues

- It runs over `VaultIndex` from `@osdlc/markdown-vault`, which a caller builds from a folder or
  from data. Using `@type32/obsidian-bases-parser` means writing a `BaseHost` over that index.
- `queryVault` pages and sorts an ad hoc expression and returns the total, the shape a UI list
  needs. Neither package has it.
- It has a command line that reads the index the same way, and `extractEmbeddedBases` for
  `base` blocks in markdown.
- Its first consumer is built on it, so adopting another engine would cost a port with no gain in
  what that consumer shows.

## What it costs

`@type32/obsidian-bases-parser` follows Obsidian 1.15.1 as observed. This package follows the 1.9 to
1.13 documentation ([D-05](D-05-bases-behaviour.md)), so it lags in behaviour that changed after.

## Would reopen it

A host over `VaultIndex` for `@type32/obsidian-bases-parser` that covers what the first consumer
shows. Then this package would be the thin layer that supplies the index, the paging and the
command line, or would be retired.

## Findings of the spike

Run on 2026-11-23. The result confirms the decision above.

### How it was run

- `@type32/obsidian-bases-parser` 0.5.1, licence MIT, installed with `npm install --ignore-scripts`
  into a folder outside the repository. It depends on `dayjs` and `js-yaml`.
- `@osdlc/markdown-vault` 0.3.2 and `@osdlc/markdown-vault-query` 0.4.1, from a built checkout,
  installed by `file:` path.
- A `BaseHost` over a `VaultIndex`, about 35 lines. `file(path)` maps a `VaultNote` to the other
  package's `BaseFile`: `properties` as the frontmatter, `file.ctime` and `file.mtime` as
  milliseconds, the body tags with `#` (the other engine adds the frontmatter `tags` itself, so the
  host leaves them out), and `links` and `embeds` as `{ link, display }`. `resolve(link, from)` uses
  `createLinkResolver(index)`. `backlinks(path)` returns `note.backlinks`.
- A script scanned the four fixture vaults of this package with `scanVault`, then ran each base
  through `runView` here and `parseBase` plus `runQuery` there, with the same clock and the same
  `this`. It compared the paths of the rows in order, the display text of every column, the groups
  and their summaries, and the view summaries. The fixtures hold one `.base` file, so the other
  cases are small bases written for the spike over the fixture notes. The script is not kept in
  the repository.
- Display text was normalised before comparing: a date prints as `2026-06-01` here and
  `06/01/2026` there, and an empty value prints as nothing here and `null` there. That is
  presentation, so it counts as the same. `file.name` was compared without its `.md` (see below).

### Result by fixture

| Vault and base                                                  | Result                                                                              |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| planning, the fixture `tasks.base`, all tasks                   | same rows and order                                                                 |
| planning, `groupBy` status with Empty and Filled summaries      | same rows, same groups, same summaries                                              |
| planning, formulas and `last_reviewed + "30d"`                  | same                                                                                |
| planning, a custom summary and Latest                           | same rows and summaries                                                             |
| basic, view filter, sort descending, `limit`                    | same                                                                                |
| basic, empty values sort last                                   | same                                                                                |
| basic, two-key sort                                             | same                                                                                |
| basic, string and number methods                                | same rows; differs in the text of an error cell, and in a cell over a missing value |
| basic, `date()`, `format` and a date compare over a missing value | same rows; differs: an error cell here, a null there                              |
| tags, `file.hasTag("project")`                                  | same rows; differs in the order of `file.tags`                                      |
| tags, `file.tags` of every note                                 | same rows; differs in the order of `file.tags`                                      |
| links, `file.backlinks`, `file.links`, `file.embeds`            | same rows and same targets; the cells print differently                             |
| links, `file.hasLink(this.file)`                                | same                                                                                |
| links, `groupBy` type                                           | same rows, same groups                                                              |
| links, a call of an unknown method                              | same rows; differs in the text of the error                                         |

No fixture was unsupported by the other package. The rows, their order, `total`, the groups and the
summaries were the same in every case. The differences are in the cells:

- `file.name`: the other package returns the name without its extension (`task-1`), which Obsidian
  documents as `task-1.md`. It is the one difference that changes a value users see.
- A missing value: `date(missing)` and `missing < date(...)` give an error cell here and a null
  there. The other package propagates null, as `format` and string methods on a missing value also
  do (`""` here, null there).
- `file.tags` order: this package lists frontmatter tags first, then body tags. The other lists body
  tags first. Part of that is the host, which has to split the two. Which one Obsidian uses was not
  checked.
- Error cells carry different text, for example `Unknown method "nope" on string` here and
  `Cannot find function "nope" on type String` there.
- Link cells: `file.backlinks` prints as the path here and as `[[path|name]]` there, a link
  value against a text value.

### What the first consumer needs

The first consumer is a planning dashboard that shows a task table (the `tasks.base` fixture is
that shape). The other package returns the same table, groups and summaries for it, through a host
of about 35 lines. What it does not give is the rest of what this package ships:

- `queryVault`: one page of notes for an ad hoc expression with `offset`, `limit` and `total`. The
  other package has `runQuery` over a base. A caller could build a one-view base per request and
  slice the rows, but would write the paging and the expression filter again.
- A command line, a vault scanner and index, and `extractEmbeddedBases`.

It also costs the consumer a port: its code takes this package's `ViewRow` and `Value` types, and
the other package has its own `RowScope` and tagged `Value`.

### Conclusion

D-02 is confirmed, and no new decision supersedes it. The other package is a credible engine for
the table, group and summary part of the job, and its host over `VaultIndex` is small. It does not
replace this package, because the paged query, the command line and the embedded fences are not in
it, and adopting it would cost the first consumer a port with no new result. The decision stays
`proposed` until the owner confirms it.

What the spike adds to the reopening condition: a host exists and covers the planning table. The
condition to retire this package is now only the other package gaining a paged ad hoc query and
the pieces above, or this package being reduced to a thin layer over it.

The differences feed other work. The `file.name` and null-propagation cases are worth checking
against Obsidian 1.15 under [T-03](../tasks/T-03-newer-bases-behaviour.md).
