---
title: The corpus-site guide
description: How corpus-site turns a corpus into a static site, what it writes, how to describe fields, and the choices behind it.
---

This guide explains `@osdlc/corpus-site` in plain words: what it builds, how to describe a corpus
to it, how to add pages of your own, and why it is shaped as it is. The options and exports are
listed in the [README](../../README.md).

## What it builds

A corpus is a folder of typed records, checked by
[corpus-schema](../../../corpus-schema/README.md). corpus-site is an Astro integration that reads
the folder and adds pages to an Astro site:

- a home page, with the root file's body and each type with its count
- a page for each type, with a table that can be filtered, sorted and searched
- a page for each record, with its fields, its body, its files and the records that link to it
- a matrix page, when the config asks for one, that crosses two fields of a type
- a search page across every type

The result is static files. Any web server or static host can serve it.

## Start

Add the integration after `vue()` and name the corpus folder:

```js
import vue from '@astrojs/vue'
import { corpusSite } from '@osdlc/corpus-site'
import { defineConfig } from 'astro/config'

export default defineConfig({
  integrations: [vue(), corpusSite({ root: '../corpus' })],
})
```

`astro dev` serves the site and `astro build` writes it. Nothing more is needed: labels, columns
and filters come from the schemas. A schema's `title` and `description` become a field's label and
help text, and an enum written as `oneOf` of `const` with `title` gives each value a label.

## Describe the fields

A schema says what a value may be. It does not say which fields matter most, what a reader should
know before filtering, or which colour a status has. That goes in `corpus-site.config.ts`:

```ts
import { defineCorpusSite } from '@osdlc/corpus-site'

export default defineCorpusSite({
  types: {
    statements: {
      title: '{harness} {subject}',
      columns: ['title', 'harness', 'subject', 'status'],
      filters: ['status', 'harness', 'subject', 'scope.platform'],
      fields: {
        status: {
          note: 'Start with Current. Superseded claims are kept for history.',
          info: 'A statement is Current until a newer one replaces it.',
          values: {
            current: { color: 'green' },
            superseded: { color: 'neutral', description: 'Replaced by a newer statement.' },
          },
        },
      },
    },
  },
})
```

Three settings put words into a filter control:

- `note` is a short line under the control. It is always visible.
- `info` is a longer explanation. A `?` button beside the label opens it.
- `values` gives each enum value a label, a description and a badge colour. The description shows
  in the `info` panel and as the badge's tooltip.

The build checks the config against the corpus. A type, a field or a setting that does not exist
stops the build, and the message lists the names that do.

## Show the answers, not only the records

Some corpora hold their real content in an object: a statement whose `proposition.object` is the
answer to a question. A list of record titles hides it. Four settings bring it out.

**Object values.** A column or a field may be an object or a list. The site draws it as labelled
pairs: keys in words, Yes and No for booleans, code type for a flag or a path. A table cell shows
the first three keys with "Show all". `keysFrom` takes the labels of the keys from a JSON Schema
held by another record, such as the question's `valueSchema`.

**Related tables.** `related` puts a table on a record's page: the records of another type that
point at it, with the columns you name. A question's page can then show each tool's answer side
by side, and a tool's page every answer it has, grouped by the question's category.

**A matrix.** `views` with `kind: 'matrix'` adds a page that crosses two fields: questions down
the side, tools across the top, the answer where they meet. A reader picks a group of rows and
the columns to compare, and the choice is in the address.

**Sources.** A claim is only as good as what it was read from, and that is often two records
away: an answer cites an observation, and the observation names a document with a URL. `show` on
a field that names records puts fields of those records beside each link, so the document's URL
is one click from the answer. `linkText` shortens a link to what matters, and `mark` flags a
value, such as a dead link. A URL is always a link that opens in a new tab.

**Counts.** `derived` adds a number worked out at build time, such as how many tools have an
answer to a question. It can be a column, a filter and a sort.

`defaultFilters` starts a type page on the records most readers want, such as the current ones.
`typeOrder` and a site `intro` put the type a reader should start from first. The README shows
each setting.

## Search

Search reads a query as words. It drops common words, matches a word without its ending, and
ranks a match in a title above one in a summary, a field or a body. A question typed in full,
such as "how are skills called", finds the records that hold most of its words. `searchWeight`
puts one type ahead of the others, and `searchSynonyms` names words that mean the same, so
"called" finds "invocation".

## Pages of your own

The build writes the corpus as JSON files under `data/`, and the README lists them. A page of your
own can load one of them and draw it another way: a chart, a board, a comparison. Use the layout
from `virtual:corpus-site/components` so the page looks like the rest, and the composables from
`@osdlc/corpus-site/client` to load and query the data. The example site has such a page,
`src/pages/shelf.astro`.

## Change the look

The site's stylesheet uses custom properties named `--cs-*`. Set them in a stylesheet and name it
in `customCss`. To change the markup, replace a component by name with `components`.

## Choices

**Config, not schema keywords.** The site adds no `x-` keyword to the schemas. The validator
rejects a schema keyword it does not know, and how a field is drawn is a fact about one site, not
about the corpus. Two sites may show the same corpus in two ways.

**The config is JSON.** A title is a template such as `{harness} {subject}`, not a function. The
config can then live in a `.json` file, be checked in full at build time, and be passed to the
browser as it is.

**One file per type, and one for search.** A type page loads its type's rows. The search page
loads one index. A record page loads nothing. No page loads the whole corpus.

**Related tables and the matrix are HTML.** The build draws them, so they read without JavaScript
and cost no data file. The matrix's pickers only hide rows and columns of the table that is
already there. The price is page size: a matrix of 85 rows by 16 columns is 77 kB gzipped.

**Search is a plain scan.** On a corpus of 2,417 records the index is 148 kB gzipped and a query
takes a few milliseconds. A prebuilt MiniSearch index was larger, and Pagefind wrote thousands of
files. At ten times the size Pagefind becomes the better choice, and `search: false` makes room
for it.

**Pages, not endless scroll.** A type page shows 50 rows at a time. The page number is in the
address, and the first page is in the HTML, so it reads without JavaScript.

**The filter logic is one module.** `src/filter.ts` holds every function that filters, sorts and
counts. It has no DOM and no Vue in it, so another query core can replace it.

**Its own layout.** The site looks like the documentation site but does not depend on Starlight.
A corpus is often published alone, and a small site should not need a documentation framework.

## Limits

- One `corpusSite` per Astro project.
- One locale per site.
- Filtering and search need JavaScript. Reading does not.
- A related table cannot be sorted or filtered by the reader. Its order comes from the config.
- A matrix page holds every row and column, so a matrix of many thousands of cells is a large page.
- Each record is a page, so a corpus of many tens of thousands of records builds slowly and makes
  many files.
