/**
 * The install command for a package manager that a package pins to one
 * version. It uses the first executable that has that version: PATH first,
 * then each tool manager detected at the root that can run a tool (proto, then
 * mise, in registration order).
 *
 * An older `bun` on PATH can rewrite a lockfile the pinned `bun` wrote, so the
 * version is checked before the command is chosen. If none matches, the first
 * executable found is used, and the command carries a warning.
 *
 * Trust: `allowExec` controls the tool-manager probes, since proto and mise
 * both read config the repository controls. The PATH probe always runs, from
 * a neutral directory, because a corepack shim reads the current directory's
 * `package.json` to decide what to run.
 */

import { tmpdir } from 'node:os'

import { type CommandRunner, shellJoin, spawnRunner } from '@osdlc/command-seam'

import type { Registry } from './registry.ts'
import { packageAt, rootTools, type ToolAction } from './roles.ts'
import type { ProjectProfile } from './tool.ts'

/**
 * Where a pinned manager was found: `path`, or a tool manager's id.
 *
 * @experimental
 */
export type PinnedSource = 'path' | (string & {})

/**
 * A pinned install, resolved.
 *
 * @experimental
 */
export interface PinnedInstall {
  /** The frozen install argv through the resolved executable. */
  argv: string[]
  /**
   * `argv` as one shell string, each word quoted where the shell would split
   * or expand it. On a version mismatch it starts with an `echo … >&2;`
   * warning, so whoever runs it later sees the mismatch.
   */
  command: string
  source: PinnedSource
  /** The resolved executable's own reported version. */
  resolvedVersion: string
  versionMismatch: boolean
}

/**
 * Options for `Project.pinnedInstall`.
 *
 * @experimental
 */
export interface PinnedInstallOptions {
  /** Allow the tool-manager probes. Pass the caller's own trust decision. */
  allowExec: boolean
  /**
   * Defaults to `spawnRunner` that runs a bare name only from an absolute PATH
   * entry, as `defaultRunner` does. Tests inject a fake per binary.
   */
  runnerFor?: ((binary: string) => CommandRunner) | undefined
}

/**
 * A version safe to put unquoted in a double-quoted `sh` string: `1.4.2`, or
 * `1.4.2+sha512-…`. Anything else is treated as no pin or no match.
 */
const SAFE_VERSION_RE = /^[A-Za-z0-9_.+-]+$/

interface Probe {
  source: PinnedSource
  binary: string
  versionArgs: string[]
  prefix: string[]
  cwd: string
}

export function pinnedInstall(
  registry: Registry,
  profile: ProjectProfile,
  install: ToolAction,
  options: PinnedInstallOptions,
): PinnedInstall | null {
  const tool = registry.byId.get(install.tool)
  const role = tool?.roles.packageManager
  const pkg = packageAt(profile, install.dir)
  if (tool === undefined || role?.pin === undefined || pkg === undefined) return null

  const pin = role.pin(pkg)
  if (pin === undefined || !SAFE_VERSION_RE.test(pin)) return null

  const [binary, ...rest] = [...role.install, ...(role.frozen ?? [])]
  if (binary === undefined) return null

  const probes: Probe[] = [
    { source: 'path', binary, versionArgs: ['--version'], prefix: [binary], cwd: tmpdir() },
  ]
  if (options.allowExec) {
    for (const { def: manager } of rootTools(registry, profile, 'toolManager')) {
      const tm = manager.roles.toolManager
      if (tm?.exec === undefined) continue
      const env = Object.entries(tm.trustEnv?.(profile.root) ?? {}).map(([k, v]) => `${k}=${v}`)
      const run = [...(env.length > 0 ? ['env', ...env] : []), ...tm.exec(binary)]
      probes.push({
        source: manager.id,
        binary: run[0]!,
        versionArgs: [...run.slice(1), '--version'],
        prefix: run,
        cwd: profile.root,
      })
    }
  }

  const runnerFor = options.runnerFor ?? ((b: string) => spawnRunner(b, { absolutePathOnly: true }))
  let fallback: { source: PinnedSource; prefix: string[]; version: string } | null = null
  for (const probe of probes) {
    const result = runnerFor(probe.binary).run(probe.versionArgs, { cwd: probe.cwd })
    if (result.exitCode !== 0) continue
    const version = result.stdout.trim()
    if (!SAFE_VERSION_RE.test(version)) continue
    if (stripHash(version) === stripHash(pin)) {
      const argv = [...probe.prefix, ...rest]
      return {
        argv,
        command: shellJoin(argv),
        source: probe.source,
        resolvedVersion: version,
        versionMismatch: false,
      }
    }
    fallback ??= { source: probe.source, prefix: probe.prefix, version }
  }
  if (fallback === null) return null

  const argv = [...fallback.prefix, ...rest]
  const warning =
    `echo "package manager mismatch: ${tool.id} ${fallback.version} found, repo pins` +
    ` ${pin} (packageManager)" >&2;`
  return {
    argv,
    command: `${warning} ${shellJoin(argv)}`,
    source: fallback.source,
    resolvedVersion: fallback.version,
    versionMismatch: true,
  }
}

/** corepack's `+sha512-…` suffix never appears in `--version` output. */
function stripHash(version: string): string {
  const plus = version.indexOf('+')
  return plus === -1 ? version : version.slice(0, plus)
}
