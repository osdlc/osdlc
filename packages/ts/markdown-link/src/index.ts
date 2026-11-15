/**
 * Wikilink parsing that follows documented link-resolution conventions: the TypeScript twin of the `markdown-link`
 * crate's parsing half. Each function gives the same answer as its Rust
 * namesake. Both run the family's conformance suite,
 * `packages/conformance/markdown-link/suite.json`.
 *
 * Spans and ranges are UTF-16 offsets, so they index a JavaScript string.
 * The Rust crate reports byte offsets.
 */

export { type CodeRules, stripCode, stripCodeWith } from './code.ts'
export {
  ATTACHMENT_EXTENSIONS,
  type Size,
  type TextRange,
  type WikiLink,
  isSizeSpec,
  isVaultLinkUrl,
  mdLinkTarget,
  parseInner,
  parseInnerSelf,
  parseSize,
  percentDecode,
  targetRange,
} from './parse.ts'
export { type TypedRef, displayText, parseTypedRef } from './display.ts'
export {
  type AbandonReason,
  type AbandonedLink,
  type BodyLink,
  type BodyLinkKind,
  type BodyScan,
  type LinkKind,
  type RawLink,
  type ScanOptions,
  bodyLinks,
  bodyLinksSpanned,
  bodyLinksSpannedWith,
  scanBodyWith,
} from './body-links.ts'
