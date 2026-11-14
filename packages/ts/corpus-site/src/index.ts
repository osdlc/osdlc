/**
 * `@osdlc/corpus-site`: an Astro integration that publishes a corpus-schema corpus as a static
 * site, and the pieces it is made of.
 */
export {
  corpusSite,
  readConfig,
  COMPONENT_NAMES,
  type ComponentName,
  type CorpusSiteOptions,
} from './integration.ts'
export {
  defineCorpusSite,
  configProblems,
  validateConfig,
  templateFields,
  CorpusSiteConfigError,
  type BadgeColor,
  type ControlKind,
  type CorpusSiteConfig,
  type DocLink,
  type FieldConfig,
  type FieldFormat,
  type ReferencedCorpusConfig,
  type SectionConfig,
  type DerivedConfig,
  type KeysFrom,
  type MarkConfig,
  type MatrixViewConfig,
  type RelatedFieldConfig,
  type RelatedConfig,
  type TypeConfig,
  type ValueConfig,
  type ViewConfig,
  type WhereConfig,
} from './config.ts'
export { getSite, getSiteContext, setSiteContext, type SiteContext } from './context.ts'
export {
  Site,
  loadSite,
  readRootBody,
  slugify,
  valueAt,
  parseWholeLink,
  type SiteField,
  type SiteOptions,
  type SiteRecord,
  type SiteType,
  type SiteView,
} from './site.ts'
export {
  defaultColumns,
  defaultControl,
  defaultFilters,
  fieldSchemaAt,
  fieldShape,
  humanize,
  shapeOf,
  MAX_CHIPS,
  MAX_DEFAULT_COLUMNS,
  MAX_DEFAULT_FILTERS,
  type EnumOption,
  type FieldKind,
  type FieldShape,
} from './schema.ts'
export {
  backlinkGroups,
  displayField,
  displayPath,
  toTree,
  MAX_TREE_TEXT,
  fieldSections,
  recordFiles,
  type BacklinkGroup,
  type Display,
  type FieldRow,
  type FieldSection,
} from './display.ts'
export {
  recordByRef,
  recordBySlug,
  viewBySlug,
  recordPaths,
  refPaths,
  typeBySlug,
  typePaths,
} from './routes.ts'
export { plainText, renderBody, renderMarkdown } from './markdown.ts'
export {
  corpusData,
  dataFiles,
  matrixData,
  relatedTables,
  viewDataFile,
  type RelatedTable,
  recordData,
  recordDataFile,
  searchData,
  typeData,
  MAX_TEXT,
  SEARCH_BODY_CHARS,
  type DataFile,
} from './data.ts'
export * from './data-types.ts'
export * from './filter.ts'
export * from './format.ts'
export * from './search.ts'
export * from './url-state.ts'
export * from './value-text.ts'
