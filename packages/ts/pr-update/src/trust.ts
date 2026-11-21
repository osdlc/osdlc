/**
 * The repository-trust gate of a standalone run, over `@osdlc/trust-repo`.
 *
 * These `pr_update` keys make the tool run a command, or an agent that can run
 * tools, chosen by the repository it is acting on: `lockfile_install`,
 * `resolvers[].run`, `repair.command`, `repair.agent`, `test_command`, and
 * `verify: detect`, whose command the repository's own files choose. A
 * setting the repository itself can write cannot authorize running it. So a
 * value from the project config file needs consent: `--trust` for one run, or
 * a trust recorded with `pr-update trust`. A value from the `.local` overlay is
 * the person's own and needs no consent.
 */

import { getIn } from '@osdlc/config-layers'
import { resolveExecGate, trustStore, type TrustStore } from '@osdlc/trust-repo'

/** The exit code of a run refused for want of repository trust. */
export const EXIT_UNTRUSTED = 21

/** The tool name the trust store is keyed under: `$XDG_STATE_HOME/pr-update/trusted/`. */
export const TRUST_TOOL = 'pr-update'

/** Every key whose value is a command to run, as a path under the config root. */
const COMMAND_KEYS: readonly (readonly string[])[] = [
  ['pr_update', 'lockfile_install'],
  ['pr_update', 'resolvers'],
  ['pr_update', 'repair', 'command'],
  ['pr_update', 'repair', 'agent'],
  ['pr_update', 'test_command'],
]

/** {@link COMMAND_KEYS} as dotted keys. */
export const COMMAND_KEY_NAMES: readonly string[] = COMMAND_KEYS.map((path) => path.join('.'))

/**
 * The keys `config set` writes from the command line only: every command key, `verify`, whose
 * `detect` value makes the repository's own files choose a command to run, and `repair.mode`,
 * whose attended modes run the agent without the headless call's project-settings isolation.
 */
export const CLI_ONLY_KEYS: readonly string[] = [
  ...COMMAND_KEY_NAMES,
  'pr_update.verify',
  'pr_update.repair.mode',
]

function isSet(value: unknown): boolean {
  if (value === undefined || value === null) return false
  return !(Array.isArray(value) && value.length === 0)
}

const VERIFY_KEY = ['pr_update', 'verify'] as const
const REPAIR_MODE_KEY = ['pr_update', 'repair', 'mode'] as const

/** An interactive or terminal repair session reads the repository like an agent does. */
function isNonHeadless(mode: unknown): boolean {
  return typeof mode === 'string' && mode !== 'headless'
}

/** The project-file keys that choose a command to run and that the overlay does not override. */
export function projectSourcedCommands(
  project: Record<string, unknown> | null,
  local: Record<string, unknown> | null,
): string[] {
  const keys = COMMAND_KEYS.filter(
    (path) => isSet(getIn(project, path).value) && !isSet(getIn(local, path).value),
  ).map((path) => path.join('.'))
  // Not in COMMAND_KEYS: the value is a mode, not a command.
  if (
    isNonHeadless(getIn(project, REPAIR_MODE_KEY).value) &&
    !isSet(getIn(local, REPAIR_MODE_KEY).value)
  ) {
    keys.push(REPAIR_MODE_KEY.join('.'))
  }
  if (getIn(project, VERIFY_KEY).value === 'detect' && !isSet(getIn(local, VERIFY_KEY).value)) {
    keys.push(VERIFY_KEY.join('.'))
  }
  return keys
}

/**
 * `project` without the repair keys in `keys`, for a run whose command line
 * already chose them. A flag is the person's own consent. A project value it
 * overrides never runs, so it needs no consent.
 */
export function withoutRepairChoice(
  project: Record<string, unknown> | null,
  keys: readonly ('command' | 'agent' | 'mode')[] = ['command', 'agent', 'mode'],
): Record<string, unknown> | null {
  const section = project?.['pr_update']
  if (project === null || typeof section !== 'object' || section === null) return project
  const repair = (section as Record<string, unknown>)['repair']
  if (typeof repair !== 'object' || repair === null) return project
  const rest = Object.fromEntries(
    Object.entries(repair).filter(([key]) => !keys.some((k) => k === key)),
  )
  return { ...project, pr_update: { ...section, repair: rest } }
}

/** The trust store for a run's environment. */
export function prUpdateTrustStore(env: Record<string, string | undefined>): TrustStore {
  return trustStore({ tool: TRUST_TOOL, env })
}

/**
 * Whether `root` may run its project-sourced commands: `null` when it may (no
 * such command, `--trust`, or a recorded trust), else the refusal message.
 */
export async function untrustedMessage(args: {
  root: string
  project: Record<string, unknown> | null
  local: Record<string, unknown> | null
  trust: boolean
  env: Record<string, string | undefined>
}): Promise<string | null> {
  const keys = projectSourcedCommands(args.project, args.local)
  if (keys.length === 0) return null
  const gate = await resolveExecGate(prUpdateTrustStore(args.env), {
    root: args.root,
    configured: true,
    ...(args.trust ? { flag: true } : {}),
  })
  if (gate.allowExec) return null
  return (
    `refusing to run commands read from this repository's config (${keys.join(', ')}): ` +
    `${gate.root} is not trusted. Run \`pr-update trust\` to trust it, or pass --trust for this run only`
  )
}
