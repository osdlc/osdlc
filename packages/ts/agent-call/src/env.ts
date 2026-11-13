import type { PlannedCall } from './plan.js'
import type { AgentCallSpec } from './spec.js'

/**
 * Names a CLI usually needs to start. Never added for you: spread it into
 * `spec.inheritEnv` with the agent's own key, as in
 * `[...BASELINE_ENV, 'ANTHROPIC_API_KEY']`.
 */
export const BASELINE_ENV: readonly string[] = Object.freeze([
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'LANG',
  'LANGUAGE',
  'LC_ALL',
  'LC_CTYPE',
  'TERM',
  'TZ',
  'TMPDIR',
  'TMP',
  'TEMP',
  'USERPROFILE',
  'SYSTEMROOT',
  'COMSPEC',
  'PATHEXT',
  'APPDATA',
  'LOCALAPPDATA',
])

const windows = (): boolean => process.platform === 'win32'

/** Windows names match in any case, so compare them upper-cased there. */
const envNameFolder =
  (win: boolean) =>
  (name: string): string =>
    win ? name.toUpperCase() : name

/**
 * The child process environment, built in the order documented on
 * `AgentCallSpec.inheritEnv` (`./spec.ts`).
 *
 * @param plannedEnv what the adapter sets, with `spec.env` already laid over it
 * @param resolve applied to each `plannedEnv` value (temp-dir substitution)
 * @param win fold names case-insensitively; defaults to whether this is
 * Windows, and a test passes it to exercise Windows matching anywhere
 */
export function buildChildEnv(
  parent: NodeJS.ProcessEnv,
  spec: AgentCallSpec,
  plannedEnv: PlannedCall['env'],
  resolve: (value: string) => string = (v) => v,
  win: boolean = windows(),
): NodeJS.ProcessEnv {
  const fold = envNameFolder(win)
  const inherit = spec.inheritEnv
  const keep = inherit === undefined || inherit === 'all' ? undefined : new Set(inherit.map(fold))
  const drop = new Set((spec.unsetEnv ?? []).map(fold))
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(parent)) {
    if (keep !== undefined && !keep.has(fold(key))) continue
    if (drop.has(fold(key))) continue
    env[key] = value
  }
  for (const [key, value] of Object.entries(plannedEnv)) {
    // On Windows `Path` and `PATH` are one variable: replace, never duplicate.
    for (const existing of Object.keys(env)) {
      if (existing !== key && fold(existing) === fold(key)) delete env[existing]
    }
    env[key] = resolve(value)
  }
  return env
}

/**
 * A reason to refuse the call when the spec restricts or trims the
 * environment and a bare binary name would be looked up on a `PATH` the child
 * does not have. `undefined` when the call can go on.
 */
export function missingPathReason(
  binary: string,
  spec: AgentCallSpec,
  env: NodeJS.ProcessEnv,
): string | undefined {
  const touched =
    (spec.inheritEnv !== undefined && spec.inheritEnv !== 'all') ||
    (spec.unsetEnv !== undefined && spec.unsetEnv.length > 0)
  if (!touched) return undefined
  if (binary.includes('/') || (windows() && binary.includes('\\'))) return undefined
  const has = Object.keys(env).some(
    (k) => envNameFolder(windows())(k) === 'PATH' && env[k] !== undefined,
  )
  if (has) return undefined
  return `spawn ${binary}: the child environment has no PATH (inheritEnv or unsetEnv dropped it). Add 'PATH' to inheritEnv, set it in env, or give the binary as a path`
}

/** Plan lines naming the environment policy of a spec. Names only, never values. */
export function envPolicyLines(spec: AgentCallSpec): string[] {
  const lines: string[] = []
  const inherit = spec.inheritEnv
  if (inherit !== undefined && inherit !== 'all') {
    lines.push(`inheritEnv: only ${[...inherit].sort().join(', ') || '(nothing)'}`)
  }
  if (spec.unsetEnv !== undefined && spec.unsetEnv.length > 0) {
    lines.push(`unsetEnv: ${[...spec.unsetEnv].sort().join(', ')}`)
  }
  return lines
}
