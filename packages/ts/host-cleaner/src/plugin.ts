/**
 * `@osdlc/host-cleaner/plugin`: what a code plugin is written with, and
 * nothing more. `definePlugin`, the API version, the contract's types, the
 * kit, and `z`, so a plugin's settings schema uses the same zod as the core.
 * The guide is `docs/guide/writing-a-plugin.md`. A plugin's tests use
 * `@osdlc/host-cleaner/testing` beside it.
 */

export { z } from 'zod'
export {
  COST_DESCRIPTIONS,
  FatalRun,
  HOOKS,
  LEVELS,
  PLUGIN_API,
  definePlugin,
  type Candidate,
  type CostDescription,
  type Ctx,
  type Detection,
  type Hook,
  type Level,
  type MaybePromise,
  type Objection,
  type PathCandidate,
  type Plugin,
  type PluginDefinition,
  type PluginInit,
  type RefCandidate,
  type Root,
  type RunCtx,
} from './types.ts'
export {
  DEFAULT_IDLE_HOURS,
  MEASURE_BUDGET_MS,
  RUN_LIMIT_MS,
  idleHoursSetting,
  pluginKit,
  type CandidateFields,
  type Idle,
  type Kit,
  type KitOptions,
  type KitRunOptions,
  type KitRunResult,
  type Running,
} from './kit.ts'
export { containedIn } from './roots.ts'
