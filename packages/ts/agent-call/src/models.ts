// Node-free entry point (the package's `./models` subpath export): the effort vocabulary.
// Imports nothing, so a browser bundle can take it without pulling in the
// process runner (`node:child_process`) that the package barrel re-exports.
// This package takes a resolved model; which levels a model accepts is not
// decided here.

/**
 * Reasoning-effort intent, a separate axis from model choice: the closed set
 * the adapters translate. Maps to claude `--effort`, codex
 * `model_reasoning_effort`, antigravity `--effort` (clamped to `high`), opencode
 * `--variant`. Frozen at run time.
 */
export const EFFORT_LEVELS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max'] as const)
/** One of {@link EFFORT_LEVELS}. */
export type EffortLevel = (typeof EFFORT_LEVELS)[number]
