/**
 * `@osdlc/code-stats/scan`: classify every line of a source file as logic,
 * boilerplate, comment, doc or blank. Pure: no git, no file system.
 */

export {
  CONTENT_KINDS,
  addKindCounts,
  countKinds,
  emptyKindCounts,
  splitLines,
  stripBom,
  type ContentKind,
  type KindCounts,
} from './kinds.ts'
export {
  createScannerRegistry,
  type FileLanguage,
  type FileScan,
  type LanguageScanner,
  type ScanFallback,
  type ScanReader,
  type ScannerRegistry,
  type ScannerRegistryOptions,
} from './registry.ts'
export { detectLanguage, knownLanguages, languageNamed, type Language } from './language.ts'
export { classifyLines } from './classify.ts'
export type {
  DocMarkers,
  InsignificantWhitespace,
  LanguageCategory,
  SyntaxFlags,
} from './overlay.ts'
export type { LanguageSyntax, QuoteSyntax } from './syntax.ts'
export { prefixKind } from './prefix.ts'
