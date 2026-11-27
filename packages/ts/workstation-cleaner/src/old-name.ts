/**
 * What is left of the name this package had up to 0.3, `host-cleaner` (#1032):
 * a config file in its folders and `HOST_CLEANER_*` variables. Neither is read.
 * Every command warns about them, and a `clean` that deletes refuses with
 * exit 2, since the run would fall back to the defaults and lose the config's
 * `ignore` list. The rename script leaves this file as written.
 */

import { envVars, type VendorDirs } from '@osdlc/cli-tool'

/** The folders the old name used, placed by its own variables, as `config.ts` places the current ones. */
export const OLD_DIRS: VendorDirs = { vendor: 'host-cleaner', envVars: envVars('HOST_CLEANER') }

const OLD_PREFIX = 'HOST_CLEANER_'
const NEW_PREFIX = 'WORKSTATION_CLEANER_'

/** An old variable set in the environment, and the name it has now. */
export interface OldVariable {
  old: string
  now: string
}

/**
 * The `HOST_CLEANER_*` variables `env` sets, by name. An empty or blank value
 * counts as unset, as it does for the current variables.
 */
export function oldVariables(env: Record<string, string | undefined>): OldVariable[] {
  return Object.keys(env)
    .filter((k) => k.startsWith(OLD_PREFIX) && (env[k]?.trim() ?? '') !== '')
    .sort()
    .map((old) => ({ old, now: NEW_PREFIX + old.slice(OLD_PREFIX.length) }))
}

/** The warning for each old variable. */
export const oldVariableWarnings = (found: readonly OldVariable[]): string[] =>
  found.map((v) => `${v.old} is not read; it is now ${v.now}`)

/** Why a `clean` that deletes refuses while old variables are set. */
export function oldVariablesRefusal(found: readonly OldVariable[]): string {
  const list = (names: string[]): string =>
    names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names.at(-1)!}`
  const one = found.length === 1
  return `${list(found.map((v) => v.old))} ${one ? 'is' : 'are'} not read: rename ${one ? 'it' : 'them'} to ${list(found.map((v) => v.now))}, or unset ${one ? 'it' : 'them'}; clean deletes nothing until then`
}
