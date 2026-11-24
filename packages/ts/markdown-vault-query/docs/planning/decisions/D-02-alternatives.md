---
id: D-02
type: decision
state: proposed
created: 2026-11-22
---

# D-02: Alternatives, and why this package continues

## Decision

The answer is to continue and publish. This is proposed: the owner confirms it. The spike in
[T-04](../tasks/T-04-try-the-alternatives.md) compared the two engines, and the comparison supports
this decision; see [Findings of the spike](#findings-of-the-spike).

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

The other package gains paged ad hoc queries with `offset`, `limit` and `total`, a command line, a
vault scanner and index, or embedded base extraction; or the first consumer stops needing them.
Then this package would be reduced to the layer that supplies what is still missing, or retired.

A `BaseHost` over `VaultIndex` that covers the first consumer's table is not on its own a reopening
condition: the spike shows it is possible, and the findings below rest on it.

## Findings of the spike

Run on 2026-11-23. The result supports the decision above; the owner confirms it.

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

### The bases compared

Fifteen cases. Each runs against one of this package's fixture vaults under
`packages/ts/markdown-vault-query/tests/fixtures/`, with `this` set to the note given. Case 1 is
the fixture file, read from disk. Cases 2 to 15 are the bases the spike wrote; each is copied from
the script's case list, without the script's leading line break.

1. Planning vault (`planning-vault`), view `All tasks`, `this` is `planning/tasks/tasks.base`. The
   fixture is `tests/fixtures/planning-vault/planning/tasks/tasks.base`; it is not copied here.
2. Planning vault, view `V`, `this` is `planning/tasks/tasks.base`, grouped by status with Empty and
   Filled summaries:

   ```yaml
   filters: file.inFolder("planning/tasks")
   views:
     - type: table
       name: V
       order: [file.name, status, impact, last_reviewed]
       sort: [{property: file.name, direction: ASC}]
       groupBy: {property: status, direction: ASC}
       summaries: {last_reviewed: Empty, impact: Filled}
   ```

3. Planning vault, view `V`, `this` is `planning/tasks/tasks.base`, formulas with date arithmetic:

   ```yaml
   filters: file.inFolder("planning/tasks")
   formulas:
     due: 'last_reviewed + "30d"'
     label: 'status + " / " + impact'
   views:
     - type: table
       name: V
       order: [file.name, formula.due, formula.label]
       sort: [{property: file.name, direction: ASC}]
   ```

4. Planning vault, view `V`, `this` is `planning/tasks/tasks.base`, a custom summary and Latest:

   ```yaml
   filters: file.inFolder("planning/tasks")
   summaries:
     n: values.length
   views:
     - type: table
       name: V
       order: [file.name, last_reviewed]
       summaries: {file.name: n, last_reviewed: Latest}
   ```

5. Basic vault (`basic-vault`), view `V`, `this` is `note-1.md`, a view filter, sort descending and
   `limit`:

   ```yaml
   filters: 'file.ext == "md"'
   views:
     - type: table
       name: V
       filters: 'status == "active"'
       order: [file.name, priority]
       sort: [{property: priority, direction: DESC}]
       limit: 1
   ```

6. Basic vault, view `V`, `this` is `note-1.md`, empty values sorted last (descending):

   ```yaml
   views:
     - type: table
       name: V
       order: [file.name, priority]
       sort: [{property: priority, direction: DESC}]
   ```

7. Basic vault, view `V`, `this` is `note-1.md`, a two-key sort:

   ```yaml
   views:
     - type: table
       name: V
       order: [file.name, file.ext]
       sort: [{property: file.ext, direction: ASC}, {property: file.name, direction: DESC}]
   ```

8. Basic vault, view `V`, `this` is `note-1.md`, string and number functions:

   ```yaml
   filters: 'file.ext == "md"'
   formulas:
     up: 'title.upper()'
     has: 'title.contains("Note")'
     len: 'title.length'
     prio: 'if(priority == "high", 1, 0)'
   views:
     - type: table
       name: V
       order: [file.name, formula.up, formula.has, formula.len, formula.prio]
       sort: [{property: file.name, direction: ASC}]
   ```

9. Basic vault, view `V`, `this` is `note-1.md`, `date()`, `format` and a date comparison:

   ```yaml
   filters: 'file.ext == "md"'
   formulas:
     y: 'date(created).format("YYYY")'
     old: 'created < date("2025-06-01")'
   views:
     - type: table
       name: V
       order: [file.name, created, formula.y, formula.old]
       sort: [{property: file.name, direction: ASC}]
   ```

10. Tags vault (`tags-vault`), view `V`, `this` is `mixed-tags.md`, `file.hasTag("project")`:

    ```yaml
    filters: 'file.hasTag("project")'
    views:
      - type: table
        name: V
        order: [file.name, file.tags]
        sort: [{property: file.name, direction: ASC}]
    ```

11. Tags vault, view `V`, `this` is `mixed-tags.md`, `file.tags` of every note:

    ```yaml
    views:
      - type: table
        name: V
        order: [file.name, file.tags]
        sort: [{property: file.name, direction: ASC}]
    ```

12. Links vault (`links-vault`), view `V`, `this` is `hub.md`, the backlinks, links and embeds
    columns:

    ```yaml
    views:
      - type: table
        name: V
        order: [file.name, file.backlinks, file.links, file.embeds]
        sort: [{property: file.name, direction: ASC}]
    ```

13. Links vault, view `V`, `this` is `hub.md`, `file.hasLink(this.file)`:

    ```yaml
    filters: 'file.hasLink(this.file)'
    views:
      - type: table
        name: V
        order: [file.name]
        sort: [{property: file.name, direction: ASC}]
    ```

14. Links vault, view `V`, `this` is `hub.md`, grouped by `type`:

    ```yaml
    views:
      - type: table
        name: V
        order: [file.name, type]
        sort: [{property: file.name, direction: ASC}]
        groupBy: {property: type, direction: DESC}
    ```

15. Links vault, view `V`, `this` is `hub.md`, a call of an unknown method:

    ```yaml
    formulas:
      bad: 'title.nope()'
    views:
      - type: table
        name: V
        order: [file.name, formula.bad]
        sort: [{property: file.name, direction: ASC}]
    ```

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

- `file.name`: the other package returns the name without its extension (`task-1`). This package
  returns `task-1.md`. Obsidian's Bases functions page describes `file.name` as "the name of this
  file" and `file.basename` as "the name of this file without the file extension"
  ([obsidian.md/help/bases/functions](https://obsidian.md/help/bases/functions)). The page does not
  say outright that `file.name` keeps the extension; the contrast with `file.basename` implies it.
- A missing value (no `title` or `created` on the note), raw results. Here: `upper()` and `length`
  give null, `contains("Note")` gives `false`, and `date(created).format("YYYY")` and
  `created < date(...)` give an error. The other package gives null for all of them. The display
  text of a null is `""` here and `null` there.
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

The comparison supports D-02, and no new decision supersedes it. The other package is a credible
engine for the table, group and summary part of the job, and its host over `VaultIndex` is small.
It does not replace this package: it has no paged ad hoc query with `offset`, `limit` and `total`,
no command line, no vault scanner and index, and no embedded base extraction. Adopting it would
cost the first consumer a port with no new result. The owner confirms D-02; its state stays
`proposed` until then.

The reopening condition is not met. The host covers the planning table, which the condition does
not turn on; the other package still lacks the four gaps listed above, and the first consumer still
needs them.

Of these differences, the ones that change text a user sees are the file name, missing values, tag
order, error text and link display.

The differences feed other work. The `file.name` and null-propagation cases are worth checking
against Obsidian 1.15 under [T-03](../tasks/T-03-newer-bases-behaviour.md).
