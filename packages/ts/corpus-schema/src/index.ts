/**
 * Find the corpora that hold a corpus-schema root file, validate them against version 0 of the
 * corpus-schema spec (packages/conformance/corpus-schema/SPEC.md), sync the copies of the corpora
 * they reference, and build the package URLs that identify packaged corpora, types and records.
 */
export { type CorpusReport, type Data, findCorpora, idProblem, validateCorpus } from './validate.ts'
export { type SyncReport, syncCorpus } from './sync.ts'
export { encodePath, fold, markdownLink } from './links.ts'
export { npmPackageUrl, type PackageUrl, packageUrl } from './identity.ts'
