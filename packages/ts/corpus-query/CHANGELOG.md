# @osdlc/corpus-query

## 0.1.6

### Patch Changes

- Updated dependencies [0b3fbfa]
  - @osdlc/cli-tool@0.22.0

## 0.1.5

### Patch Changes

- Updated dependencies [fb0034a]
- Updated dependencies [3e9f995]
- Updated dependencies [f9fc6f0]
  - @osdlc/corpus-schema@0.6.0

## 0.1.4

### Patch Changes

- c6b292d: The `watch` option says that a change made just after the server starts can go unseen: `fs.watch` has no ready signal.

## 0.1.3

### Patch Changes

- Updated dependencies [976bbee]
- Updated dependencies [976bbee]
  - @osdlc/cli-tool@0.21.0

## 0.1.2

### Patch Changes

- Updated dependencies [acf57e6]
  - @osdlc/cli-tool@0.20.0

## 0.1.1

### Patch Changes

- Updated dependencies [55b4303]
  - @osdlc/cli-tool@0.19.0

## 0.1.0

### Minor Changes

- 94d8b23: First release. Query one corpus-schema corpus through four surfaces that share one core: a TypeScript API (`findRecords`, `countFacets`, `readRecord`, `getReferences`, `getBacklinks`, `traverse`, `describeCorpus`, `listTypes`, `describeType`, and `corpusQuery` to bind them to a corpus), the `corpus-query` command, a read-only REST server (`serveRest`, and `createRestHandler` as a fetch-style handler) and an MCP server (`createMcpServer`, `serveMcpStdio`, `createMcpHandler`). A query is plain JSON: type, corpus, filters, full-text search, sort, limit, offset and field projection. Filters also have a short string form, such as `status=done kind~claim confidence>=0.7`. Queries span referenced corpora, and an unknown type or field is an error that lists what exists. The core reads the data `loadCorpus` of `@osdlc/corpus-schema` returns and loads no `node:` module. Every export is experimental.
