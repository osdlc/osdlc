/**
 * `@osdlc/markdown-contract/core`: the parser, the contract builders, the typed model and the
 * read helpers, with no Node import, so it also runs in a browser. The package root adds the
 * folder runner.
 */

// Parse.
export { parse } from './projection.js'
export { splitFrontmatter } from './frontmatter.js'
export type { FrontmatterSplit } from './frontmatter.js'

// Build a contract.
export {
  ContractBuildError,
  contract,
  docRule,
  gap,
  oneOf,
  optional,
  rule,
  section,
  sections,
} from './grammar.js'
export { LENIENT, lenientBody, optionalSection, STRICT, strictBody } from './presets.js'
export { code, list, maxWords, table } from './leaves.js'
export type { RowOf } from './leaves.js'
export { forbids, requires, textRule } from './text-constraints.js'
export type { TextRuleSpec } from './text-constraints.js'
export type { TextMatchSpec } from './text-match.js'

// Findings.
export { ContractError } from './finding.js'
export {
  countByLevel,
  filterFindings,
  findingLocation,
  formatFinding,
  hasErrors,
} from './finding-view.js'

// Read the parse tree.
export { blocksOfKind, findSection, sectionForLine, sectionSpans, sectionsAt } from './navigate.js'
export type { SectionSpan } from './navigate.js'
export { codeBlockLines, tableRowLines } from './block-lines.js'
export { rawTableRow, rawTableRows } from './table-source.js'

export type {
  BlockKind,
  BlockNode,
  BlockView,
  BodyOf,
  CodeView,
  Contract,
  ContractDef,
  Ctx,
  Doc,
  DocRule,
  DocTree,
  Finding,
  FindingLevel,
  GapSpec,
  Infer,
  InlineSpan,
  LeafSpec,
  LevelOpts,
  ListItem,
  ListView,
  Mdast,
  MicromarkExtension,
  OneOfSpec,
  OptionalSpec,
  ParagraphView,
  ParseOptions,
  Rule,
  SectionGroup,
  SectionNode,
  SectionOpts,
  SectionSeq,
  SectionSpec,
  SectionValue,
  SectionView,
  SourcePos,
  Spec,
  TableView,
  TextEdit,
  ValidateCtx,
  ValidationResult,
} from './types.js'
