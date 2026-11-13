---
"@osdlc/corpus-site": minor
---

The first release of `@osdlc/corpus-site`: an Astro integration that publishes a corpus-schema
corpus as a static site. `corpusSite({ root })` adds a home page, a page for each type with
filters, sorting and pages, a page for each record with its fields, body, files and backlinks, and
a search page. `defineCorpusSite` describes types and fields: labels, help, notes and longer
explanations in the filter controls, badge colours, columns, filters and sections. It also
describes object and list values as columns, counts worked out at build time, tables of related
records on a record page, a matrix page that crosses two fields of a type, default filters, and
search weights and synonyms. The build
writes the corpus as JSON files with a fixed layout, and `@osdlc/corpus-site/client` and
`@osdlc/corpus-site/components` export the composables and Vue components for pages of your own.
It needs `astro` 7, `@astrojs/vue` 7 and `vue` 3.5. Licence `MIT OR Apache-2.0`.
