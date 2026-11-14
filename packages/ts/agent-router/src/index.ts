/** What the fallible functions return: `{ ok: true, value }` or `{ ok: false, error }`. Re-exported from `@osdlc/result`. */
export type { Result } from '@osdlc/result'
export {
  TIERS,
  TOOL_ID_PATTERN,
  TRAITS,
  formatQualifiers,
  formatRef,
  isTier,
  isToolId,
  isEffortLevel,
  isWildcard,
  modelKind,
  modelProblem,
  parseRef,
} from './ref.ts'
export type { Qualifiers, Ref, RefParseError, RefParseErrorKind, Tier } from './ref.ts'
export { contextArgs, defaultWindow, formatSize, MAX_SIZE, parseSize } from './context.ts'
export { launchMode, viaArgs } from './launch-mode.ts'
export type { LaunchMode } from './launch-mode.ts'
export type { ContextArgs } from './context.ts'
export { BUILTIN_CLASSIFY_RULES, classify, classifyModel } from './classify.ts'
export type { ClassifyRule, Placement } from './classify.ts'
export { DEFAULT_CHAIN_ORDER, expandChain, PIN_KEY_PATTERN, pinKey, PinsSchema } from './chains.ts'
export type { Chain, ChainEntry, ChainSkip, ChainSkipReason, Pins } from './chains.ts'
export { expandWildcard } from './wildcard.ts'
export type { Expansion, WildcardSkip, WildcardSkipReason } from './wildcard.ts'
export { resolveRef } from './resolve.ts'
export { adjustEffort, effortAdjustedMessage } from './effort.ts'
export type { EffortAdjustment } from './effort.ts'
export type { ResolveContext, ResolveError, Resolved } from './resolve.ts'
export { checkRef } from './validity.ts'
export type {
  CheckContext,
  Validity,
  ValidityError,
  ValidityErrorCode,
  ValiditySkipCode,
  ValidityWarningCode,
} from './validity.ts'
export {
  BUILTIN_PROFILES,
  ProfileConfigSchema,
  ProfilesConfigSchema,
  parseProfile,
  parseProfiles,
} from './profile.ts'
export type { Profile, ProfileConfig, ProfileError } from './profile.ts'
export { authorRule, authorRuleFields, IfOnlyAuthorLeftSchema } from './author-rule.ts'
export type { AuthorRule, IfOnlyAuthorLeft } from './author-rule.ts'
export {
  AVAILABILITY_REASONS,
  checkContext,
  chooseFromProfile,
  PROFILE_SKIP_REASONS,
  refProfile,
  skipReasonText,
  validateProfile,
} from './choose.ts'
export type {
  AuthorStep,
  Availability,
  AvailabilityReason,
  Choice,
  ChooseContext,
  ContextCheck,
  ProfileEntryError,
  ProfileSkip,
  ProfileSkipReason,
} from './choose.ts'
export { resolveBinding } from './binding.ts'
export type { Binding, BindingError } from './binding.ts'
export {
  formatWhen,
  matchRule,
  parseRouting,
  RoutingConfigSchema,
  shadowedRules,
} from './routing.ts'
export type {
  RouteRequest,
  RoutingError,
  RoutingKey,
  RoutingRule,
  RoutingVocabulary,
  RoutingWhen,
} from './routing.ts'
export * from './catalogue/index.ts'
export { DetectReportSchema, DetectRuntimeSchema, DetectToolSchema } from './detect-report.ts'
export type {
  DetectHost,
  DetectModel,
  DetectProvider,
  DetectReport,
  DetectRuntime,
  DetectTool,
} from './detect-report.ts'
