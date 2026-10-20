/**
 * `current(env)`: which harness this process runs inside, from its environment.
 *
 * Each harness sets a variable in the processes it starts; the table is
 * {@link LOCATIONS}'s `currentEnv`. The order of the checks:
 *   1. every harness's `currentEnv`;
 *   2. `AI_AGENT`, a cross-vendor convention, mapped through {@link harnessId};
 *   3. every harness's `weakEnv`, variables that may also be set outside the
 *      harness (Cursor's `CURSOR_TRACE_ID` is set in its editor terminal).
 *
 * Antigravity sets no variable this package knows, so it is reported only
 * through `AI_AGENT`.
 *
 * Runtime-agnostic: pure.
 */

import { BUILTIN_HARNESSES, harnessId, type BuiltinHarnessId } from './harnesses.ts'
import { LOCATIONS, type HarnessLocations } from './locations.ts'

/** The harness a process runs inside, and the variable that says so. */
export interface CurrentHarness {
  harness: BuiltinHarnessId
  /** The environment variable that decided it. */
  evidence: string
}

type Env = Readonly<Record<string, string | undefined>>

function firstSet(env: Env, list: 'currentEnv' | 'weakEnv'): CurrentHarness | null {
  for (const harness of BUILTIN_HARNESSES) {
    const names: HarnessLocations[typeof list] = LOCATIONS[harness][list]
    const variable = names.find((name) => (env[name] ?? '') !== '')
    if (variable !== undefined) return { harness, evidence: variable }
  }
  return null
}

/** The harness `env` belongs to, or `null` when none of the known variables is set. */
export function current(env: Env = process.env): CurrentHarness | null {
  const strong = firstSet(env, 'currentEnv')
  if (strong) return strong
  const declared = env['AI_AGENT']
  const id = declared ? harnessId(declared.trim().toLowerCase()) : undefined
  if (id) return { harness: id, evidence: 'AI_AGENT' }
  return firstSet(env, 'weakEnv')
}
