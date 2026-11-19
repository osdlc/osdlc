# @osdlc/corpus-site

A corpus is a folder of typed records. People read it best as a site: a list of each type that can
be filtered, a page for each record, and a search box. This package builds that site. It is an
[Astro](https://astro.build) integration, and the parts that run in the browser are
[Vue](https://vuejs.org) components.

It is for anyone who keeps a [corpus-schema](https://github.com/osdlc/osdlc/blob/main/packages/conformance/corpus-schema/SPEC.md)
corpus and wants to publish it, alone or inside a larger Astro site. The site is static files: no
server, no database. The corpus is read with `loadCorpus` from
[`@osdlc/corpus-schema`](https://www.npmjs.com/package/@osdlc/corpus-schema), so the site shows
what the validator sees.

The site also writes the corpus as JSON files with a fixed layout, and the package exports the
composables and components its own pages use. A page of your own can load one type and draw it
your way: a small app over the data.

Do not use it for a corpus of many tens of thousands of records: each record is a page, and the
search index is one file. See [Size](#size).

## Install

```sh
npm install @osdlc/corpus-site astro @astrojs/vue vue
```

`astro` 7, `@astrojs/vue` 7 and `vue` 3.5 are peer dependencies. ESM only. Node.js 22 or later.

## Use it in three steps

1. Add the integration to `astro.config.mjs`, after `vue()`, and point it at the corpus folder.

   ```js
   import vue from '@astrojs/vue'
   import { corpusSite } from '@osdlc/corpus-site'
   import { defineConfig } from 'astro/config'

   export default defineConfig({
     integrations: [vue(), corpusSite({ root: '../corpus' })],
   })
   ```

2. Optionally say more about the fields in `corpus-site.config.ts` (or `.json`, `.mjs`, `.js`)
   beside it.

   ```ts
   import { defineCorpusSite } from '@osdlc/corpus-site'

   export default defineCorpusSite({
     types: {
       books: {
         summary: '{author}, {year}',
         columns: ['title', 'author', 'status', 'year'],
         filters: ['status', 'author', 'year'],
         fields: {
           status: {
             note: 'Abandoned books stay on the list.',
             values: { finished: { color: 'green', description: 'Read to the last page.' } },
           },
         },
       },
     },
   })
   ```

3. Run `astro dev` to work on it and `astro build` to write the site to `dist/`.

With no config the site still works: labels, columns, filters and controls come from the schemas.
[`examples/site`](./examples/site) is a full project over the corpus in
[`examples/corpus`](./examples/corpus). Build it from this folder with `pnpm run example`.

## Options

`corpusSite(options)` takes:

| Option        | Default                    | What it does                                                               |
| ------------- | -------------------------- | -------------------------------------------------------------------------- |
| `root`        | required                   | The corpus folder, relative to the Astro project root                      |
| `base`        | `/`                        | The path the corpus pages sit under, inside Astro's own `base`             |
| `title`       | the root file's heading    | The site's title                                                           |
| `description` | none                       | One line for the home page and the meta description                        |
| `config`      | `corpus-site.config.*`     | The config object, or the path of a file that holds it                     |
| `components`  | none                       | Astro components to replace, by name                                       |
| `customCss`   | none                       | Stylesheets loaded after the site's own                                    |
| `search`      | `true`                     | Build the search page and its index                                        |
| `strict`      | `false`                    | Fail the build when the validator reports an error in the corpus           |

A project may hold one `corpusSite`. A `.ts` config file is loaded by Node itself, which needs
Node.js 22.18 or later.

## Pages

| Path                                | Page                                                                |
| ----------------------------------- | ------------------------------------------------------------------- |
| `/`                                 | Home: the root file's body, and each type with its count            |
| `/<type>/`                          | A type: a table with filters, sorting, a text box and pages         |
| `/<type>/<record>/`                 | A record: its fields, its body, its files and what links to it      |
| `/<type>/<view>/`                   | A view of a type from its config, such as a matrix                  |
| `/ref/<corpus>/<type>/<record>/`    | A record of a corpus this one references or extends                 |
| `/search/`                          | Search across every type                                            |

A type's path is its name as a slug (lower case, with `-` between words), or `slug` from its config. `data`, `search` and `ref` are the site's
own, so a type with one of those names needs a `slug`.

The state of a type page is in its address, so a filtered view can be shared:
`/books/?status=finished&status=reading&year=1850..1900&q=whale&sort=-year&page=2`. A field named
like one of the site's own parameters (`q`, `sort`, `page`) is written with an `f.` prefix.

Without JavaScript a type page shows its first page of rows, and every record page and link works.
A related table and a matrix are whole in the HTML. Filtering, sorting, search and the matrix's
pickers need JavaScript.

A reference field shows the title of the record it points at and links to its page. A relative
link or a wikilink in a body goes to the page of the record it resolves to. A link to a file in a
record folder goes to a copy of the file.

## Config

Everything in the config is optional, and all of it is JSON. `defineCorpusSite` returns its
argument and gives the file types. The build checks the config against the corpus and stops with
every problem at once, each with the names that do exist:

```text
corpus-site config:
  - types.books.columns: type "books" has no field "titel". Fields: title, author, status, year
  - types.books.fields.status.control: "pills" is not a control. Controls: select, chips, range, toggle, search, hidden
```

For a type: `label`, `singular`, `icon`, `blurb`, `intro` (Markdown above the list), `hidden`,
`slug`, `title` and `summary` (text with `{field}` places), `columns`, `filters`,
`defaultFilters`, `sort`, `sections` (groups of fields on the record page), `fields`, `derived`,
`related`, `views` and `searchWeight`. For the site: `title`, `description`, `intro` (Markdown at
the top of the home page), `typeOrder` and `searchSynonyms`.

For a field:

| Setting   | What it does                                                                         |
| --------- | ------------------------------------------------------------------------------------ |
| `label`   | The label. Default: the schema's `title`, else the field name in words               |
| `help`    | What the field holds. Default: the schema's `description`                            |
| `note`    | A short line under the filter control, always visible                                |
| `info`    | A longer explanation, opened from a `?` button beside the label                      |
| `link`    | A link to a document about the field, shown with `info` and on the record page       |
| `control` | `select`, `chips`, `range`, `toggle`, `search` or `hidden`                           |
| `order`   | The field's place among the filters and on the record page                           |
| `hidden`  | Keep the field off the record page, the columns and the filters                      |
| `format`  | `text`, `date`, `datetime`, `number`, `badge`, `code` or `link`, with options        |
| `values`  | For each enum value: a `label`, a `description` and a badge `color`                  |
| `keysFrom` | For an object value: the record whose JSON Schema labels its keys                   |
| `show`    | For a field that names records: fields of each record, shown beside its link         |
| `linkText` | For a field that names records: the text of each link, with `{field}` places        |
| `mark`    | A badge after the value on the records that hold certain values                      |

A dotted name such as `scope.platform` names a field inside an object field, and makes it usable
as a column or a filter. A path also steps through a list, and in `related` and a matrix through
a reference field to the record it names (`subject.category`).

### Object and list values

A field may hold an object or a list, and so may a column. A record page shows the whole value:
each key in words with its value, `true` and `false` as Yes and No, a string that looks like code
(a flag, a path, a command) in code type, and a list inside as a list. A table cell shows the
first three keys and cuts a long text, with "Show all" to open the rest. In a `title` or `summary`
template such a value becomes one line: `Syntax: /review · Cli only: Yes`.

The keys of an object are often described elsewhere. `keysFrom` takes their labels and help from
a JSON Schema that another record holds:

```ts
fields: {
  'proposition.object': {
    label: 'Answer',
    keysFrom: { ref: 'subject', schemaAt: 'valueSchema' },
  },
}
```

`ref` is a reference field of the same record. `schemaAt` is the path of the schema in the record
it names. A key's label is its `title` there and its help its `description`.

### Links and sources

A URL is a link out wherever it shows: on a record page, in a table cell, in a related table and
in a matrix. That holds for a field whose schema says `format: uri`, for one with
`format: 'link'`, and for any string that starts with `http://` or `https://`. The link opens in
a new tab, carries a mark, and shows the address without its scheme: `example.com/docs/guide`.

A reference shows the title of the record it names. Often the reader wants something that record
holds, such as the URL of a source document. `show` puts fields of the named record beside its
link:

```ts
fields: {
  reportedIn: { label: 'Source', show: ['urls', 'publisher'] },
}
```

Each document is then its title, which links to its page, its URLs as links out, and its
publisher. `show` may also be text with `{field}` places, where `{title}` is the link:
`'{title} by {publisher}'`. A place with no value is left out with the text before it.

`linkText` changes the text of the link itself: `linkText: '{observed} · {kind}'` shows a study
result as its date and kind in place of its long title.

Both work for a reference field and for Markdown links inside an object or a list, such as
`'hasEvidenceLines.hasEvidenceItems'`. A record shown this way shows its own `show` fields too,
one level down. A path can also step through such links, as it does through a reference:
`hasEvidenceLines.hasEvidenceItems.reportedIn`. A reference column with `show` or `linkText` is
drawn whole in a type's table, and is then not a filter.

`mark` adds a badge after a field's value on the records that hold certain values:

```ts
fields: {
  urls: { mark: { when: { url_status: 'dead' }, label: 'Dead link', color: 'red' } },
}
```

A type's `summary` that is one place holding links, such as `'{urls}'`, is drawn under the title
of a record page as those links.

### Counts

`derived` adds a number the build works out. It can be a column, a filter and a sort:

```ts
subjects: {
  columns: ['title', 'category', 'answered'],
  derived: {
    answered: {
      label: 'Harnesses',
      help: 'How many harnesses have a current answer.',
      count: { from: 'statements', via: 'subject', where: { status: 'current' }, distinct: 'harness' },
    },
  },
}
```

It counts the records of `from` whose reference field `via` names the record. `where` keeps only
some of them, and `distinct` counts the different values of one of their fields.

### Related tables

By default a record page ends with "Referenced by": a list of the records that link to it.
`related` shows them as a table of their fields instead:

```ts
subjects: {
  related: [
    {
      label: 'Across harnesses',
      note: 'The current answer of each harness.',
      from: 'statements',
      via: 'subject',
      where: { status: 'current' },
      columns: ['harness', 'proposition.object', 'scope', 'strength'],
      sort: 'harness',
    },
  ],
}
```

`via` is a reference field of `from`, or a path to Markdown links inside an object or a list.
`columns` are fields of `from`. Without `title` among them, each row ends in a link to its record.
`fields` changes a column for this table only: `fields: { reportedIn: { label: 'Source', show: [] } }`
gives it another label, `show` or `linkText`.
`groupBy` puts the rows that share a value under one heading. A column with no value in any row is
left out. The table is in the page's HTML and needs no script. The records it lists are left out
of "Referenced by".

### A matrix

`views` adds pages beside a type's index. A matrix crosses two fields of the type: one row for
each value of one, one column for each value of the other, and in each cell the records that hold
both.

```ts
statements: {
  views: [
    {
      kind: 'matrix',
      label: 'Compare harnesses',
      slug: 'compare',
      rows: 'subject',
      columns: 'harness',
      cell: 'proposition.object',
      where: { status: 'current' },
      groupRowsBy: 'category',
      rowSummary: '{description}',
    },
  ],
}
```

This is `/statements/compare/`. `rows` and `columns` are usually reference fields, and then every
record the row field can name gets a row, with or without cells. `cell` is a field path or a
template. `groupRowsBy` and `rowSummary` read the row's record. A column with no cell is left out.

The page holds the whole table. Its header row and first column stay in place while it scrolls.
Above it are a chip for each group, a chip for each column and a text box that filters the rows.
With no column chip pressed every column shows, and pressing chips shows only those. A column
also has a small button in its header that takes it away. Past 24 columns the chips become a list
with a search box. The choice is in the address:
`?group=skills&col=claude-code&col=codex-cli&q=name`, and each choice is a step the back button
undoes. The browser remembers the chosen columns for an address that names none.
Below 50rem wide the page shows one row at a time as a list, with a picker and Previous and Next
(`row=` in the address). The home page and the navigation link to each view, and the home page
links to each group.

### Default filters

`defaultFilters: { status: 'current' }` starts a type page with those filters on. The address
stays bare while they hold. A reader who removes one gets `?status=` in the address, so the wider
list can be shared too. Each name must be one of the type's `filters`.

When the config names no control, the schema picks one: chips for an enum of up to six values and
a select above that, a toggle for a boolean, a range for a number or a date, a select for a
reference, and a text box for text. The counts beside the options follow the other filters.

The site adds no keywords to the schemas. The validator rejects a keyword it does not know, so
what a site says about a field stays in the site's config.

The types are in [`src/config.ts`](./src/config.ts): `CorpusSiteConfig`, `TypeConfig`,
`FieldConfig`, `ValueConfig`, `FieldFormat`, `SectionConfig`, `DocLink`, `KeysFrom`, `MarkConfig`,
`WhereConfig`, `DerivedConfig`, `RelatedConfig`, `RelatedFieldConfig`, `MatrixViewConfig`,
`ViewConfig` and
`ReferencedCorpusConfig`.

## Search

The search box finds records by their title, their summary line, their field text and the start
of their body. A hit shows its title, its type and its summary, with the matched words marked.

A query is read as words, not as a phrase. Common words such as "how", "are" and "the" are left
out, and a word also matches without its ending: "skills" finds "skill" and "called" finds
"call". A query of one or two words needs both. A longer one needs more than half of its words,
and a record that holds more of them ranks higher. A match in the title counts most, then the
summary, then the fields, then the body.

Two settings tune it. `searchWeight` on a type makes its records rank higher: `3` puts a type
three times ahead of the others. `searchSynonyms` on the site names words that mean the same:

```ts
searchSynonyms: [['call', 'invoke', 'invocation']],
```

With it, "how are skills called" finds a record that says "invocation".

## Data files

The build writes the corpus as JSON under `data/`. This layout is part of the package's API, and
each file holds `"version": 1`.

| File                                  | Holds                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------- |
| `data/corpus.json`                    | The title and each type: label, count, page path and data path          |
| `data/types/<type>.json`              | One type: its fields, columns and a slim row for each record            |
| `data/views/<type>/<view>.json`       | One matrix: its columns, groups, rows and cells                         |
| `data/records/<page path>.json`       | One record in full: its data, Markdown body, files, links and backlinks |
| `data/search.json`                    | The search index: a title and text for each record                      |
| `data/files/<path in the corpus>`     | Every file in the folder of each record that has a page                 |

The types of these files are `CorpusData`, `TypeData`, `RecordData`, `MatrixData` and
`SearchData`. A browser loads one type's file on that type's page and the search index on first
use of the search box. A record page and its `data/records/` file share the page's path, so a record of a
referenced corpus is at `data/records/ref/<corpus>/<type>/<record>.json`. A matrix page loads no data file: its table is in the HTML, and the JSON is
there for pages of your own. No page loads the whole corpus.

A column value is a string, a number, a boolean, a list of those, or for an object or a list of
objects a `DataTree`: text, a link (`{ text, url, external }`), a list,
`{ entries: [{ label, value }] }`, or `{ group: [...] }` for values on one line. Its field holds
`"tree": true`.

## Your own pages

`@osdlc/corpus-site/client` is the browser side: fetchers, composables and the query functions.
`@osdlc/corpus-site/components` is the Vue components.

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useTypeData } from '@osdlc/corpus-site/client'

const props = defineProps<{ dataUrl: string }>()
const { data } = useTypeData(() => props.dataUrl)
const finished = computed(
  () => data.value?.records.filter((r) => r.values.status === 'finished').length ?? 0,
)
</script>

<template>
  <p v-if="data">{{ finished }} of {{ data.count }} books finished.</p>
</template>
```

Put the component on a page with the site's layout. `getSite()` gives a page the loaded corpus
and the addresses of its pages and data files:

```astro
---
import { getSite } from '@osdlc/corpus-site'
import { Layout } from 'virtual:corpus-site/components'
import ShelfStats from '../components/ShelfStats.vue'

const site = getSite()
---

<Layout title="Shelf">
  <ShelfStats client:load dataUrl={site.dataUrl('types/books.json')} />
</Layout>
```

- Fetchers: `fetchCorpusData`, `fetchTypeData`, `fetchRecordData`, `fetchSearchIndex`, `fetchData`.
- Composables: `useData`, `useTypeData`, `useFilterState` (filter state kept in the address) and
  `useTypeQuery` (the filtered, sorted and paged rows of a type).
- Query functions: `filterRecords`, `facetCounts`, `fieldBounds`, `paginate`, `search`,
  `parseState` and `formatState`.
- Value text: `oneLine`, `treeText`, `keyLabel`, `looksLikeCode` and `shortUrl`.
- Components: `TypeExplorer`, `SearchApp`, `FilterPanel`, `FilterControl`, `ActiveFilters`,
  `ResultTable`, `ValueCell`, `TreeValue`, `MatrixTable`, `MatrixControls`, `FieldInfo` and
  `Pager`. Each takes data as props and emits events.

The node entry also exports what the pages are built from: `loadSite`, `Site`, `dataFiles`,
`typeData`, `recordData`, `searchData`, `matrixData`, `relatedTables`, `renderMarkdown`,
`fieldSections`, `displayPath`, `toTree` and `backlinkGroups`.

## Replace a component

`components` swaps an Astro component of the site for one of yours:

```js
corpusSite({ root: '../corpus', components: { Footer: './src/components/Footer.astro' } })
```

The names are `Layout`, `Header`, `Sidebar`, `Footer`, `Home`, `TypeIndex`, `RecordPage`,
`MatrixPage`, `SearchPage` and `FieldValue`. A replacement gets the same props as the one it replaces. Import
the others from `virtual:corpus-site/components`.

## Look

The stylesheet is plain CSS with custom properties, all named `--cs-*`. It follows the reader's
light or dark setting, and the header has a switch. Set the properties in a stylesheet named in
`customCss`:

```css
:root {
  --cs-accent: #0f766e;
  --cs-font: 'Source Sans 3', system-ui, sans-serif;
}
```

Below 50rem wide the navigation becomes a row, a table becomes a list of cards and the filters
sit behind a button. `@osdlc/corpus-site/corpus-site.css` is the stylesheet, for a page that does
not use the layout.

## Size

Measured on the harness reference in this repository: 2,417 records in six types, with related
tables on two types and one matrix of 85 rows by 16 columns.

| What                                     | Size                             |
| ---------------------------------------- | -------------------------------- |
| `astro build`                            | 2,426 pages in about 4 seconds   |
| JavaScript on a type page (Vue included) | 110 kB, 41 kB gzipped            |
| CSS                                      | 41 kB, 8 kB gzipped              |
| The largest type file (824 records)      | 562 kB, 80 kB gzipped            |
| The matrix page (85 by 16)               | 752 kB, 77 kB gzipped            |
| The largest record page (78 related rows) | 154 kB                          |
| The search index                         | 915 kB, 148 kB gzipped           |

The largest type file is the one with an object column: each row carries its answer. A matrix
page grows with rows times columns, and it is the page to watch on a larger corpus.

Search is a file the package writes itself: each record's title, its field text and the first
4,000 characters of its body. The browser scans it, which takes 1 to 11 milliseconds here. Two
other ways were measured on the same corpus. A prebuilt MiniSearch index came to 207 kB gzipped.
Pagefind wrote 11 MB in 2,481 files and loads them in pieces, so it costs more files and less per
visit.

The search file grows with the corpus. At ten times this size it would be about 1.5 MB gzipped, and
a type page of 12,000 rows would be slow to filter. Past a few thousand records per type, set
`search: false` and run Pagefind over the built pages (the pages mark their content with
`data-pagefind-body`).

## Tests

`pnpm run test` runs unit tests of the config check, the schema reading, the filter and search
functions, the address state, and the object values, counts, related tables and matrix over a
small corpus, component tests in jsdom, and a test that builds the example site
with Astro and reads the output.

## Stability

This is a 0.x package. A minor release may change any export, the config or the data files, and
the CHANGELOG marks the change as breaking. A change to the layout of the data files also raises
their `version`.

Known gaps:

- The pages are written in the locale named in the config. There is one locale per site.
- In `astro dev` an edited record shows after a reload. A new or renamed record may need a
  restart.
- The site has its own layout. It has not been tried inside a Starlight site.

## Runtimes and platforms

Node.js 22 or later, ESM only. The tests run on macOS and Linux. Windows is not tested.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and
[LICENSE-APACHE](./LICENSE-APACHE).
