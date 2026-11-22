# @osdlc/markdown-vault-query

## History before the first public release

These versions were never published. The package was developed in a private repository, and its
history is rebuilt here from that repository's commits, so a reader can see how the behaviour came
to be. The first public release is the one the changeset describes, and it follows 0.4.1.

### [0.4.1] - 2026-11-22 (unpublished)

#### Added

- `markdown-vault-query --version` prints the package version.

### [0.4.0] - 2026-10-31 (unpublished)

#### Added

- `EvalContext.resolveLink`: an optional link resolver shared by one query run. The query functions
  set it; a caller of `evaluate` that leaves it out gets a fresh resolver per lookup.

#### Changed

- Breaking: `file.links[i].asFile()` and `file(link)` on a body link return `null` when the index
  was built without `resolveLinks` (`createVaultIndex(notes)`). They no longer re-resolve the link
  from the row.
- Breaking: `toNumber` and `number()` reject a blank or whitespace-only string instead of reading it
  as 0, so the numeric summaries skip blank cells.
- Breaking: the list aggregates `sum`/`mean`/`average`/`median`/`stddev` skip null, error and
  non-numeric entries: `["a", 1].sum()` is 1, not an error. `[].sum()` is still 0.
- Breaking: the Empty and Filled summaries use `isEmpty()`: an empty string, list or object counts
  as empty.
- Breaking: adding a duration with an hour, minute or second part to a date-only value keeps it
  date-only only while the result is at local midnight. A date-only value plus `24h` across a DST
  change now has a time. Whole days, weeks and months keep it date-only.
- Breaking: `formula.<name>.<field>` no longer reads a member of an object-valued formula; the whole
  suffix is the formula name. Use `formula["<name>"].<field>` in an expression instead.

#### Fixed

- `markdown-vault-query query` no longer overflows the call stack on very large tables under Node.
- Expression-side link resolution (frontmatter links, `link()`, `file()`, `asFile()`, `linksTo()`,
  `hasLink()`) uses the vault package's own resolver, built once per query run. A folder-qualified
  target matches on a path-segment boundary, a target with an extension (`cover.png`) resolves, and
  an external URL never resolves to a vault note. A relative target (`[[./sib]]`) resolves from the
  folder of the note it was written in.
- Names inherited from `Object.prototype` (`constructor`, `toString`, `__proto__`) are no longer
  read as formulas, note properties, lambda locals or object keys.
- A formula called inside a list lambda reads the note, not the lambda's `value`/`index`/`acc`.
- `filter`/`map`/`reduce` on a missing list return null instead of an error.
- Week tokens `YYYY`, `GGGG` and `gggg` pad a year under 1000 to four digits, and the week and
  day-of-year tokens keep a year under 100. `relative()` rounds before choosing a unit and reads a
  date equal to now as the past.
- `parseDate` keeps years 0000-0099.
- A self-referential YAML alias in frontmatter no longer crashes a query.
- Fractional months add to a date as the days `totalMs` counts them as. Hour-based durations and
  date differences add as elapsed time across DST, and adding a date difference back returns the
  original date.
- A string added to a date or a duration concatenates. Durations display in whole milliseconds.
  Nested dates and links in an object display as their display strings.
- A formula property ID whose name holds a dot (`formula.incl. tax`) names that formula. A bare
  property ID named `file`, `this`, `note`, `formula`, `true`, `false` or `null` reads the note
  property.

### [0.3.0] - 2026-10-31 (unpublished)

#### Changed

- Breaking: the package is `@osdlc/markdown-vault-query`, its binary is `markdown-vault-query`, and
  its environment variables are `MARKDOWN_VAULT_QUERY_*`. The `dev link` record now lives in the
  new configuration directory, so run `markdown-vault-query dev link` again to relink a checkout.

### [0.2.9] - 2026-10-30 (unpublished)

#### Fixed

- `link()`, `file()` and frontmatter links resolve through the vault package's `createLinkResolver`,
  so they agree with `file.links` and backlinks. A `#heading` or `#^block` subpath no longer blocks
  resolution.
- `w`, `ww` and `gggg` use Moment's en-locale Sunday-start weeks; `W`, `WW` and `GGGG` stay ISO.
- Property and formula lookups ignore inherited names such as `toString`, so they no longer crash a
  query.
- `matches()` resets a reused `/g` regex; error group keys with the same message share one group; a
  zoned leap second parses; the CLI prints `file.name` when the view has no `order`.

### [0.2.8] - 2026-10-27 (unpublished)

#### Added

- `markdown-vault-query dev link`, `dev status` and `dev off` run the installed command from a
  development checkout, and an environment variable does the same for one run.

### [0.2.7] - 2026-10-25 (unpublished)

#### Fixed

- `query` takes a base file as `this` only when the file lies inside the vault once symlinks are
  resolved, so a symlink out of the vault no longer counts as inside it.

### [0.2.6] - 2026-10-11 (unpublished)

#### Fixed

- `query` defaults `this` to the base file's vault-relative path through one shared containment
  check instead of a string-prefix test.

### [0.2.5] - 2026-09-07 (unpublished)

#### Fixed

- Stricter internal typing across the parser, the evaluator and the query code; no change to the
  public API.

### [0.2.4] - 2026-09-05 (unpublished)

#### Fixed

- The query options and the CLI leave an unset `now` and `this` out instead of passing `undefined`,
  for strict optional-property typing; no change to behaviour.

### [0.2.3] - 2026-09-03 (unpublished)

#### Fixed

- A bug sweep of the expression engine: date formatting, parser edge cases, value coercion and query
  evaluation.

### [0.2.2] - 2026-08-26 (unpublished)

#### Fixed

- `repeat()` refuses a negative or non-finite count and a result over one million characters, and
  `toFixed()` refuses digits outside 0 to 100, with an evaluation error instead of a native
  exception.

### [0.2.1] - 2026-08-23 (unpublished)

#### Fixed

- Stricter internal typing; no change to the public API.

### [0.2.0] - 2026-08-14 (unpublished)

#### Removed

- Breaking: the vault scanner and its model types are no longer exported from this package. They
  moved to `@osdlc/markdown-vault`; import them from there.

### [0.1.2] - 2026-08-07 (unpublished)

#### Fixed

- A note's frontmatter is read when the fence has a byte-order mark, padding or leading blank lines.

### [0.1.1] - 2026-07-19 (unpublished)

#### Added

- `queryVault`: an ad hoc paged query that filters by an expression, sorts by property keys and
  returns one page with the total match count, with `FilterQueryOptions` and `FilterQueryResult`.

### [0.1.0] - 2026-07-12 (unpublished)

#### Added

- Parse `.base` files and run their filters, formulas, views and summaries over a folder of
  markdown notes in memory.
- An expression language with the documented function library, a command-line tool, and a vault
  scanner (moved out in 0.2.0).
