/**
 * `@osdlc/config-layers` — a CLI tool's two config files and the check a
 * command runs before it starts.
 *
 * A tool has a committed project file (its name is the tool's) and a per-machine file in
 * the config home of its standalone tier (`<config>/<tool>/config.yaml`), each read through a
 * Zod schema. {@link machineConfigFile} is the machine loader: never throws,
 * keeps the valid sections and reports what it dropped, relocates through an
 * env var, migrates older files in memory, and writes the file atomically.
 * {@link configNeeds} takes both schemas and answers, for a command that
 * declares `{ config: 'dotted.key' }`, whether the setting is set in either
 * file and, if not, one message saying what the key is for and where to set
 * it. {@link valueAt}, {@link valueIsSet} and {@link keyDescription} are the
 * pieces underneath, exported for a tool that only needs one of them.
 *
 * {@link pathsSchema} and {@link substitutePathNames} are the third piece both
 * files share: a `paths:` map of named directories, and the `{name}`
 * expansion any other path-valued setting refers to them by.
 *
 * {@link systemDirs}, {@link TieredDirs}, {@link envVars} and {@link VendorDirs}
 * resolve the tool's machine-local directories. {@link closestMatches} and
 * {@link didYouMean} suggest close names for a mistyped noun, verb, key or repo.
 */

export { closestMatches, didYouMean } from './did-you-mean.ts'
export { envVars, systemDirs, TieredDirs } from './dirs.ts'
export type { EnvVars, ResolveOptions, VendorDirs } from './dirs.ts'

export { valueAt, valueIsSet } from './value.ts'

export { deepMergeConfig } from './merge.ts'

export { CONFIG_INVALID_EXIT, ConfigInvalidError } from './config-error.ts'
export type { ConfigIssue } from './config-error.ts'

export { overlayPath, resolveConfigFile } from './resolve-file.ts'
export type {
  ConfigFileSpec,
  ResolveConfigFileOptions,
  ResolvedConfigFile,
} from './resolve-file.ts'

export { defineConfigSection, projectLayerIssues } from './section.ts'
export type { ConfigSection, ConfigSectionHooks, LayerCheckContext } from './section.ts'

export { deprecatedKeysSet, deprecationMessage } from './deprecation.ts'
export type { DeprecatedKeyUse } from './deprecation.ts'
export {
  assembleConfig,
  readMappingFile,
  readParsedFile,
  RELOADS_ON_CHANGE,
  unknownKeyMessage,
} from './loader.ts'
export { pathMatcher, stripUnknownKeys } from './unknown-keys.ts'
export type { StrippedKeys } from './unknown-keys.ts'
export type {
  AssembleConfigOptions,
  ConfigHandle,
  ConfigLayers,
  ConfigOf,
  ParsedFileRead,
  RawLayer,
  ReadMappingOptions,
  UnknownKeyUse,
} from './loader.ts'

export { setPath, unsetPath } from './edit.ts'

export { renderReference } from './reference.ts'
export type { ReferenceOptions } from './reference.ts'

export { scaffoldLocalYaml, scaffoldYaml, starterYaml } from './scaffold.ts'
export type { ScaffoldOptions, StarterOptions } from './scaffold.ts'

export {
  APPLY_PREFIX,
  CONSUMER_REF,
  PLANNED_PREFIX,
  STABILITY_LEVELS,
  ConfigKeyMetaSchema,
  ConsumerSchema,
  DeprecationSchema,
  RegisteredKeyMetaSchema,
  StabilitySchema,
  applierOf,
  checkConfigMeta,
  isReserved,
  readConfigMeta,
} from './meta.ts'
export type {
  AppliesVia,
  ConfigKeyMeta,
  ConfigMetaIssue,
  Deprecation,
  MetaTerms,
  MetaValidator,
  RegisteredKeyMeta,
  Stability,
} from './meta.ts'

export { defineConfigVocabulary } from './vocabulary.ts'
export type { ConfigVocabulary, ConfigVocabularySpec, TermsOf } from './vocabulary.ts'

export {
  applierAndReservedProblems,
  consumerProblems,
  enforcementProblems,
  machineLayerKeys,
} from './meta-kit.ts'

export {
  PATH_NAME,
  PathNameError,
  pathNames,
  pathsSchema,
  resolveConfigPath,
  substitutePathNames,
} from './paths.ts'
export type {
  PathNames,
  PathsSchemaOptions,
  ResolveConfigPathOptions,
  SubstituteOptions,
} from './paths.ts'

export { keyDescription, keyExists, leafSchema } from './schema.ts'

export {
  defaultOf,
  descriptionOf,
  describeShape,
  getIn,
  jsonSchemaOf,
  nestedFields,
  omitPath,
  resolveKeyPath,
  splitKeyPath,
  topLevelKeys,
} from './explain.ts'
export type { NestedField, ResolveKeyPathOptions, ResolvedKey } from './explain.ts'

export { resolveLayeredSteps, resolveLayeredValue } from './provenance.ts'
export type {
  RawLayeredSteps,
  ResolveLayeredStepsOptions,
  ResolveLayeredValueOptions,
  ResolvedLayeredSteps,
  ResolvedLayeredValue,
  ResolvedStep,
  StepMode,
  StepProvenance,
  ValueLayer,
} from './provenance.ts'

export { MACHINE_CONFIG_ISSUE_CODES, envStem, machineConfigFile } from './machine.ts'
export type {
  MachineConfigFile,
  MachineConfigFileOptions,
  MachineConfigIssue,
  MachineConfigLoad,
  MachineMigrateResult,
} from './machine.ts'

export { currentMachineVersion, migrateMachineRaw } from './machine-migrate.ts'
export type { MachineMigration } from './machine-migrate.ts'

export { configNeeds } from './needs.ts'
export type {
  ConfigNeed,
  ConfigNeeds,
  ConfigNeedsOptions,
  KeyScopes,
  MessageOptions,
  MetOptions,
} from './needs.ts'
