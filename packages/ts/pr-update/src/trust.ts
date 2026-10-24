/**
 * The repository-trust gate of a standalone run, over `@osdlc/trust-repo`.
 *
 * Five `pr_update` keys make the tool run a command, or an agent that can run
 * tools, chosen by the repository it is acting on: `lockfile_install`,
 * `resolvers[].run`, `repair.command`, `repair.agent` and `test_command`. A
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

function isSet(value: unknown): boolean {
  if (value === undefined || value === null) return false
  return !(Array.isArray(value) && value.length === 0)
}

/** The command-running keys the project file sets and the overlay does not override. */
export function projectSourcedCommands(
  project: Record<string, unknown> | null,
  local: Record<string, unknown> | null,
): string[] {
  return COMMAND_KEYS.filter(
    (path) => isSet(getIn(project, path).value) && !isSet(getIn(local, path).value),
  ).map((path) => path.join('.'))
}

/**
 * `project` without the repair choice, for a run whose command line already
 * made it. A flag is the person's own consent. The project file's
 * `repair.command` or `repair.agent` that it overrides never runs, so it needs
 * no consent.
 */
export function withoutRepairChoice(
  project: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const section = project?.['pr_update']
  if (project === null || typeof section !== 'object' || section === null) return project
  const repair = (section as Record<string, unknown>)['repair']
  if (typeof repair !== 'object' || repair === null) return project
  const { command: _command, agent: _agent, ...rest } = repair as Record<string, unknown>
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
