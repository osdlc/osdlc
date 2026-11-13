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
| `/ref/<corpus>/<type>/<record>/`    | A record of a corpus this one references or extends                 |
| `/search/`                          | Search across every type                                            |

A type's path is its name, or `slug` from its config. `data`, `search` and `ref` are the site's
own, so a type with one of those names needs a `slug`.

The state of a type page is in its address, so a filtered view can be shared:
`/books/?status=finished&status=reading&year=1850..1900&q=whale&sort=-year&page=2`. A field named
like one of the site's own parameters (`q`, `sort`, `page`) is written with an `f.` prefix.

Without JavaScript a type page shows its first page of rows, and every record page and link works.
Filtering, sorting and search need JavaScript.

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
`slug`, `title` and `summary` (text with `{field}` places), `columns`, `filters`, `sort`,
`sections` (groups of fields on the record page) and `fields`.

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

A dotted name such as `scope.platform` names a field inside an object field, and makes it usable
as a column or a filter.

When the config names no control, the schema picks one: chips for an enum of up to six values and
a select above that, a toggle for a boolean, a range for a number or a date, a select for a
reference, and a text box for text. The counts beside the options follow the other filters.

The site adds no keywords to the schemas. The validator rejects a keyword it does not know, so
what a site says about a field stays in the site's config.

The types are in [`src/config.ts`](./src/config.ts): `CorpusSiteConfig`, `TypeConfig`,
`FieldConfig`, `ValueConfig`, `FieldFormat`, `SectionConfig`, `DocLink` and
`ReferencedCorpusConfig`.

## Data files

The build writes the corpus as JSON under `data/`. This layout is part of the package's API, and
each file holds `"version": 1`.

| File                                  | Holds                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------- |
| `data/corpus.json`                    | The title and each type: label, count, page path and data path          |
| `data/types/<type>.json`              | One type: its fields, columns and a slim row for each record            |
| `data/records/<type>/<record>.json`   | One record in full: its data, Markdown body, files, links and backlinks |
| `data/search.json`                    | The search index: a title and text for each record                      |
| `data/files/<path in the corpus>`     | The files of record folders that a record links to                      |

The types of these files are `CorpusData`, `TypeData`, `RecordData` and `SearchData`. A browser
loads one type's file on that type's page and the search index on first use of the search box. It
never loads the whole corpus.

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
- Components: `TypeExplorer`, `SearchApp`, `FilterPanel`, `FilterControl`, `ActiveFilters`,
  `ResultTable`, `ValueCell`, `FieldInfo` and `Pager`. Each takes data as props and emits events.

The node entry also exports what the pages are built from: `loadSite`, `Site`, `dataFiles`,
`typeData`, `recordData`, `searchData`, `renderMarkdown`, `fieldSections` and `backlinkGroups`.

## Replace a component

`components` swaps an Astro component of the site for one of yours:

```js
corpusSite({ root: '../corpus', components: { Footer: './src/components/Footer.astro' } })
```

The names are `Layout`, `Header`, `Sidebar`, `Footer`, `Home`, `TypeIndex`, `RecordPage`,
`SearchPage` and `FieldValue`. A replacement gets the same props as the one it replaces. Import
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

Measured on the harness reference in this repository: 2,417 records in six types.

| What                                    | Size                           |
| --------------------------------------- | ------------------------------ |
| `astro build`                           | 2,425 pages in about 4 seconds |
| JavaScript on a type page (Vue included) | 98 kB, 37 kB gzipped           |
| CSS                                     | 34 kB, 7 kB gzipped            |
| The largest type file (1,189 records)   | 381 kB, 23 kB gzipped          |
| The search index                        | 695 kB, 113 kB gzipped         |

Search is a file the package writes itself: each record's title, its field text and the first
4,000 characters of its body. The browser scans it, which takes under a millisecond here. Two
other ways were measured on the same corpus. A prebuilt MiniSearch index came to 207 kB gzipped.
Pagefind wrote 11 MB in 2,481 files and loads them in pieces, so it costs more files and less per
visit.

The search file grows with the corpus. At ten times this size it would be about 1 MB gzipped, and
a type page of 12,000 rows would be slow to filter. Past a few thousand records per type, set
`search: false` and run Pagefind over the built pages (the pages mark their content with
`data-pagefind-body`).

## Tests

`pnpm run test` runs unit tests of the config check, the schema reading, the filter and search
functions and the address state, component tests in jsdom, and a test that builds the example site
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
