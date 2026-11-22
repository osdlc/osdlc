/**
 * `@osdlc/code-stats`: lines of source by kind (logic, boilerplate, comment,
 * doc, blank) for a directory on disk or a commit, for a change, and for two
 * changes side by side, with file categories, public API delta and
 * complexity movers for a change. Counting a directory needs no git; the
 * rest reads git history. The line scanner is `@osdlc/code-stats/scan`.
 */

export {
  compareChanges,
  countTree,
  describeChange,
  diffChange,
  measureChange,
  spliceDescription,
  writeDescription,
  writePrBody,
  type CountTreeOptions,
  type DescribeOptions,
  type Description,
  type DiffChangeOptions,
  type MeasureChangeOptions,
  type MeasuredChange,
  type RepoOptions,
} from './measure.ts'
export {
  buildPackageMap,
  type PackageDependency,
  type PackageManifest,
  type PackageMap,
  type PackageMapOptions,
  type PackageNode,
} from './describe/packages.ts'
export {
  PACKAGES_SECTION,
  RISK_SECTION,
  renderDescription,
  renderPackageMap,
  renderRisk,
  riskSignals,
} from './describe/render.ts'
export { countDirectory, type CountDirectoryOptions } from './files/count.ts'
export { buildCountReport, type CountFile, type CountOptions } from './report/count.ts'
export { buildDiffReport, type DiffContent, type DiffOptions } from './report/diff.ts'
export {
  compareReportSchema,
  countReportSchema,
  diffReportSchema,
  type CompareReport,
  type CountReport,
  type DiffReport,
  type KindOperations,
  type OperationCounts,
} from './report/schema.ts'
export { renderCompare, renderCount, renderDiff, type RenderOptions } from './report/render.ts'
export { STATS_SECTION, spliceSection, type MarkedSection } from './report/splice.ts'
export {
  changeSpecFrom,
  DIFF_FLAGS,
  parseChangeSpec,
  readDiff,
  type ChangeSelectors,
} from './git/change.ts'
export { openRepo, type Repo, type Runners } from './git/repo.ts'
export {
  CHANGE_KINDS,
  type Change,
  type ChangeSpec,
  type FileContent,
  type LinguistAttributes,
} from './types.ts'
export {
  DEFAULT_RULES,
  FILE_GROUPS,
  RULE_GROUPS,
  createGroupClassifier,
  type FileFacts,
  type FileGroup,
  type GroupClassifier,
  type GroupRules,
  type RuleGroup,
} from './groups.ts'
export {
  ENTRY_KINDS,
  FILE_STATUSES,
  parseDiff,
  type DiffBlock,
  type DiffLine,
  type EntryKind,
  type FileDiff,
  type FileStatus,
} from './diff/parse.ts'
export {
  OPERATIONS,
  assignOperations,
  type FileOperations,
  type Operation,
} from './diff/operations.ts'
export {
  CHANGE_CATEGORIES,
  categorizeChange,
  dependencyChange,
  type ChangeCategory,
  type ChangeFacts,
  type DependencyChange,
  type DependencyEntry,
  type FileSides,
} from './diff/categories.ts'
export {
  createLizardAnalyzer,
  createTypescriptAnalyzer,
  defaultAnalyzers,
  type Analyzer,
  type AnalyzeAllOptions,
  type AnalyzerSource,
  type FunctionComplexity,
} from './analysis/complexity.ts'
export {
  isTsSource,
  loadTypeScript,
  parseSource,
  withParseMemo,
  type TypeScript,
  type TypeScriptSource,
} from './analysis/typescript.ts'
export { CodeStatsError, type CodeStatsErrorKind, type Failure } from './error.ts'
