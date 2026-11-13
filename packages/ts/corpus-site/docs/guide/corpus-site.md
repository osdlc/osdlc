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

**Search is a plain scan.** On a corpus of 2,417 records the index is 113 kB gzipped and a query
takes under a millisecond. A prebuilt MiniSearch index was larger, and Pagefind wrote thousands of
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
- Each record is a page, so a corpus of many tens of thousands of records builds slowly and makes
  many files.
