/**
 * Find the corpora that hold a corpus-schema root file, and validate them against version 0 of the
 * corpus-schema spec (packages/conformance/corpus-schema/SPEC.md).
 */
export { type CorpusReport, type Data, findCorpora, idProblem, validateCorpus } from './validate.ts'
export { encodePath, fold, markdownLink } from './links.ts'
