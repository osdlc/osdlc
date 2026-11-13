import type { PlannedCall } from './plan.js'
import type { AgentCallSpec } from './spec.js'

/**
 * Variable names a CLI usually needs to start: the executable search path, the
 * home and user identity, the shell, the locale, the terminal, the temp
 * directory, and the Windows system variables. Spread it into
 * `spec.inheritEnv` and add the names your agent needs, such as its API key:
 *
 * `inheritEnv: [...BASELINE_ENV, 'ANTHROPIC_API_KEY']`
 *
 * The runner never adds these on its own. A list without `PATH` fails the call
 * before spawn when the binary is a bare name.
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
const fold = (name: string): string => (windows() ? name.toUpperCase() : name)

/**
 * The environment the child process gets, built in one place for every
 * adapter. In order:
 *
 * 1. the parent environment, cut to `spec.inheritEnv` when that is a list
 *    (`'all'` or unset keeps everything);
 * 2. `spec.unsetEnv` names removed;
 * 3. `plannedEnv` laid over it: what the adapter sets, and `spec.env` on top
 *    of that. An explicit value therefore wins over a removal and over the
 *    list: `spec.env` can put back a name that `unsetEnv` removed.
 *
 * `resolve` is applied to each `plannedEnv` value (temp-dir substitution).
 */
export function buildChildEnv(
  parent: NodeJS.ProcessEnv,
  spec: AgentCallSpec,
  plannedEnv: PlannedCall['env'],
  resolve: (value: string) => string = (v) => v,
): NodeJS.ProcessEnv {
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
  const has = Object.keys(env).some((k) => fold(k) === 'PATH' && env[k] !== undefined)
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
