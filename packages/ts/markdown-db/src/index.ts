/**
 * Find markdown-db corpora and validate them against version 0 of the markdown-db spec
 * (packages/conformance/markdown-db/SPEC.md).
 */
export { type CorpusReport, type Data, findCorpora, idProblem, validateCorpus } from './validate.ts'
export { encodePath, fold, markdownLink } from './links.ts'
