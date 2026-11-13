/**
 * Query one corpus-schema corpus: describe it, find records by type, filter and full-text
 * search, read one record with what it refers to and what refers to it, walk references, and
 * count the values of a field. Every function reads a `LoadedCorpus`, the plain data
 * `loadCorpus` of `@osdlc/corpus-schema` returns, and returns plain JSON.
 *
 * This entry loads no `node:` module, so a browser bundle can import it. `./node` loads a corpus
 * from disk and serves it, `./rest` is the HTTP handler, `./mcp` the MCP server and `./cli` the
 * `corpus-query` command.
 */
import type { LoadedCorpus } from '@osdlc/corpus-schema'

import {
  type CorpusSummary,
  describeCorpus,
  describeType,
  listTypes,
  type TypeDescription,
  type TypeSummary,
} from './describe.ts'
import type { RecordRef } from './model.ts'
import {
  countFacets,
  type FacetQuery,
  type FacetResult,
  findRecords,
  type Query,
  type QueryResult,
} from './query.ts'
import {
  getBacklinks,
  getReferences,
  type IncomingReference,
  type OutgoingReference,
  type ReadOptions,
  readRecord,
  type RecordDetail,
  traverse,
  type TraverseOptions,
  type TraverseResult,
} from './record.ts'

export {
  type CorpusLink,
  type CorpusSummary,
  describeCorpus,
  describeType,
  type FieldDescription,
  type FieldValue,
  listTypes,
  type TypeDescription,
  type TypeSummary,
} from './describe.ts'
export { type Filter, type FilterOp, formatFilter, parseFilter, parseTerm } from './filter.ts'
export { QueryError, type QueryErrorCode, type RecordHeader, type RecordRef } from './model.ts'
export {
  countFacets,
  type Facet,
  type FacetQuery,
  type FacetResult,
  findRecords,
  type Query,
  type QueryResult,
  type RecordHit,
} from './query.ts'
export {
  getBacklinks,
  getReferences,
  type IncomingReference,
  type OutgoingReference,
  type ReadOptions,
  readRecord,
  type RecordDetail,
  traverse,
  type TraverseOptions,
  type TraverseResult,
} from './record.ts'

/**
 * The query functions bound to one loaded corpus.
 *
 * @experimental
 */
export interface CorpusQuery {
  /** The corpus the functions read. */
  readonly model: LoadedCorpus
  /** `describeCorpus`. */
  describe(): CorpusSummary
  /** `listTypes`. */
  types(corpus?: string): TypeSummary[]
  /** `describeType`. */
  type(name: string, corpus?: string): TypeDescription
  /** `findRecords`. */
  find(query?: Query): QueryResult
  /** `countFacets`. */
  facets(query: FacetQuery): FacetResult
  /** `readRecord`. */
  get(ref: RecordRef, options?: ReadOptions): RecordDetail
  /** `getReferences`. */
  references(ref: RecordRef): OutgoingReference[]
  /** `getBacklinks`. */
  backlinks(ref: RecordRef): IncomingReference[]
  /** `traverse`. */
  traverse(ref: RecordRef, options?: TraverseOptions): TraverseResult
}

/**
 * The query functions bound to `model`, so a caller passes the corpus once.
 *
 * @experimental
 */
export function corpusQuery(model: LoadedCorpus): CorpusQuery {
  return {
    model,
    describe: () => describeCorpus(model),
    types: (corpus) => listTypes(model, corpus),
    type: (name, corpus) => describeType(model, name, corpus),
    find: (query) => findRecords(model, query),
    facets: (query) => countFacets(model, query),
    get: (ref, options) => readRecord(model, ref, options),
    references: (ref) => getReferences(model, ref),
    backlinks: (ref) => getBacklinks(model, ref),
    traverse: (ref, options) => traverse(model, ref, options),
  }
}
