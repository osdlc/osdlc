/**
 * `@osdlc/config-layers` — a CLI tool's two config files and the check a
 * command runs before it starts.
 *
 * A tool has a committed project file (the tool picks its name) and a
 * per-machine file in its standalone config home (`<config>/<tool>/config.yaml`).
 * Each is read through a Zod schema. {@link machineConfigFile} loads the machine
 * file. It never throws, keeps the valid sections and reports what it dropped.
 * An env var can move the file. It migrates older files in memory and writes
 * the file atomically.
 *
 * {@link configNeeds} takes both schemas. For a command that declares
 * `{ config: 'dotted.key' }`, it says whether the setting is set in either
 * file. If not, it gives one message that says what the key is for and where
 * to set it. {@link valueAt}, {@link valueIsSet} and {@link keyDescription} are
 * the functions it uses, exported for a tool that needs only one of them.
 *
 * {@link pathsSchema} and {@link substitutePathNames} handle the `paths:` map
 * that both files can carry. The map names directories, and any other
 * path-valued setting refers to one as `{name}`.
 *
 * {@link systemDirs}, {@link TieredDirs}, {@link envVars} and {@link VendorDirs}
 * resolve the tool's machine-local directories. {@link closestMatches} and
 * {@link didYouMean} suggest close names for a mistyped noun, verb, key or repo.
 */

export { closestMatches, didYouMean } from './did-you-mean.ts'
export { envStem, envVars, systemDirs, TieredDirs } from './dirs.ts'
export type { EnvVars, ResolveOptions, VendorDirs } from './dirs.ts'

export { getIn, valueAt, valueIsSet } from './value.ts'

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

export { MACHINE_CONFIG_ISSUE_CODES, machineConfigFile } from './machine.ts'
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
