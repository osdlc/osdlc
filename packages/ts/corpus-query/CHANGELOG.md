# @osdlc/corpus-query

## 0.1.0

### Minor Changes

- 94d8b23: First release. Query one corpus-schema corpus through four surfaces that share one core: a TypeScript API (`findRecords`, `countFacets`, `readRecord`, `getReferences`, `getBacklinks`, `traverse`, `describeCorpus`, `listTypes`, `describeType`, and `corpusQuery` to bind them to a corpus), the `corpus-query` command, a read-only REST server (`serveRest`, and `createRestHandler` as a fetch-style handler) and an MCP server (`createMcpServer`, `serveMcpStdio`, `createMcpHandler`). A query is plain JSON: type, corpus, filters, full-text search, sort, limit, offset and field projection. Filters also have a short string form, such as `status=done kind~claim confidence>=0.7`. Queries span referenced corpora, and an unknown type or field is an error that lists what exists. The core reads the data `loadCorpus` of `@osdlc/corpus-schema` returns and loads no `node:` module. Every export is experimental.
