/**
 * `@osdlc/workstation-cleaner/plugin`: what a code plugin is written with, and
 * nothing of the run. `z` is re-exported so a plugin's settings schema uses
 * the same zod as the core. See `docs/guide/writing-a-plugin.md`.
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
  type PartIdleHours,
  type PathCandidate,
  type Plugin,
  type PluginDefinition,
  type PluginInit,
  type RefCandidate,
  type Root,
  type RunCtx,
  type SettingSource,
} from './types.ts'
export {
  DEFAULT_IDLE_HOURS,
  MEASURE_BUDGET_MS,
  RUN_LIMIT_MS,
  commandHasName,
  coveredBy,
  idleHoursOr,
  idleHoursSetting,
  pluginKit,
  present,
  type CandidateFields,
  type Idle,
  type Kit,
  type KitOptions,
  type KitRunOptions,
  type KitRunResult,
  type Running,
} from './kit.ts'
export { containedIn } from './roots.ts'
/** What `kit.run` throws, with `check: true`, when the program does not exit 0. */
export { CommandFailed } from '@osdlc/command-seam'
