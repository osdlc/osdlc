// The `./models` subpath export: the effort levels, with no Node imports.
// A browser bundle can import it without the process runner
// (`node:child_process`) that the package index re-exports.
// This package does not decide which levels a given model accepts.

/**
 * The reasoning-effort levels the adapters translate, ordered least to most
 * reasoning. Effort is set separately from the model. Each agent's mapping is
 * in the README capability map. Frozen at run time.
 */
export const EFFORT_LEVELS = Object.freeze([
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const)
/** One of {@link EFFORT_LEVELS}. */
export type EffortLevel = (typeof EFFORT_LEVELS)[number]

/** True for the levels below `low` (`none`, `minimal`). Agents whose lowest level is `low` raise these to `low`. */
export function isBelowLow(effort: string): boolean {
  return effort === 'none' || effort === 'minimal'
}
