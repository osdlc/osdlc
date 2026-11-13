// The effort-mismatch policy: an effort the tool and model do not accept moves
// at most one step on agent-call's `EFFORT_LEVELS` scale, up first. Making it
// configurable is an open task in the planning folder (docs/planning/tasks/).
import { EFFORT_LEVELS } from '@osdlc/agent-call/models'

/** How a resolve moved an effort the tool and model do not accept. */
export type EffortAdjustment = {
  /** The effort the reference asked for; the resolved `effort` is the one used. */
  requested: string
  /** `up` is one step more reasoning, `down` one step less. */
  direction: 'up' | 'down'
  /** The effort the resolve used. */
  used: string
}

const SCALE: readonly string[] = EFFORT_LEVELS

/**
 * The effort to run with when `effort` is asked for and `supported` are the
 * accepted levels: `effort` itself when supported, else the next level up on
 * `EFFORT_LEVELS` when supported, else the next level down. `undefined` when
 * neither neighbour is supported, or `effort` is not on the scale.
 */
export function adjustEffort(
  effort: string,
  supported: readonly string[],
): { effort: string; adjusted?: EffortAdjustment } | undefined {
  if (supported.includes(effort)) return { effort }
  const at = SCALE.indexOf(effort)
  if (at < 0) return undefined
  const up = SCALE[at + 1]
  if (up !== undefined && supported.includes(up)) {
    return { effort: up, adjusted: { requested: effort, direction: 'up', used: up } }
  }
  const down = at > 0 ? SCALE[at - 1] : undefined
  if (down !== undefined && supported.includes(down)) {
    return { effort: down, adjusted: { requested: effort, direction: 'down', used: down } }
  }
  return undefined
}

/** The line a trace and a warning carry for an adjusted effort. */
export function effortAdjustedMessage(adjusted: EffortAdjustment): string {
  return `effort '${adjusted.requested}' is not supported; using '${adjusted.used}', one step ${adjusted.direction}`
}
