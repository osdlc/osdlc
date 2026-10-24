/**
 * Role actions: narrow questions asked by role, answered from the profile
 * and the registered tools. Nothing here spawns.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { compilePattern, dirOf, joinRel } from './pattern.ts'
import type { Registry } from './registry.ts'
import type { Evidence } from './model.ts'
import type { Detected, Package, ProjectProfile, ToolDef } from './tool.ts'

/**
 * The package manager chosen for one ecosystem of one package.
 *
 * @experimental
 */
export interface PackageManagerChoice {
  tool: string
  ecosystem: string
  /** The package whose files chose it: the package itself or one above it. */
  dir: string
  /** The file that decided it. */
  source: string
  /** True when the manager's lockfile is in `dir`, so a frozen install can run. */
  locked: boolean
  /** True when nothing chose a manager and the ecosystem's fallback was assumed. */
  fallback: boolean
}

/**
 * One command a role offers, with the directory to run it in.
 *
 * @experimental
 */
export interface ToolAction {
  tool: string
  ecosystem?: string | undefined
  /** Root-relative directory to run `argv` in. */
  dir: string
  argv: string[]
  /** The file the action was inferred from. */
  source: string
}

export function packageAt(profile: ProjectProfile, dir: string): Package | undefined {
  return profile.packages.find((p) => p.dir === dir)
}

/**
 * The package manager for each ecosystem of the package at `dir`.
 *
 * Walks from `dir` up to the root and stops at the first package that has a
 * manager for that ecosystem, because a workspace keeps its lockfile at its
 * root. Within one package the most direct evidence wins (a `packageManager`
 * field over a lockfile), then the ecosystem's precedence order.
 */
export function choosePackageManagers(
  registry: Registry,
  profile: ProjectProfile,
  dir = '.',
): PackageManagerChoice[] {
  const pkg = packageAt(profile, dir)
  if (pkg === undefined) return []
  const ecoIds = new Set(pkg.ecosystems)
  for (const t of pkg.tools) {
    const tool = registry.byId.get(t.tool)
    if (tool?.roles.packageManager && tool.ecosystem) ecoIds.add(tool.ecosystem.id)
  }

  const out: PackageManagerChoice[] = []
  for (const eco of registry.ecosystems) {
    if (!ecoIds.has(eco.id)) continue
    const managers = eco.tools.filter((id) => registry.byId.get(id)?.roles.packageManager)
    const choice = nearestManager(registry, profile, dir, managers)
    if (choice !== null) {
      out.push({ ...choice, ecosystem: eco.id, fallback: false })
      continue
    }
    const fallback = eco.fallback
    const manifest = pkg.manifestFiles.find((f) =>
      eco.manifests.some((m) => compilePattern(m.files).base(f) === dir),
    )
    if (fallback !== undefined && registry.byId.has(fallback) && manifest !== undefined) {
      out.push({
        tool: fallback,
        ecosystem: eco.id,
        dir,
        source: manifest,
        locked: false,
        fallback: true,
      })
    }
  }
  return out
}

/**
 * The nearest package at or above `dir` whose files choose one of `managers`.
 * A lockfile, a marker or a pin chooses; a manifest that merely implies the
 * tool (a `Cargo.toml` implies cargo) chooses only at `dir` itself, and only
 * when nothing above chose, so a workspace member defers to its root.
 */
function nearestManager(
  registry: Registry,
  profile: ProjectProfile,
  dir: string,
  managers: readonly string[],
): Omit<PackageManagerChoice, 'ecosystem' | 'fallback'> | null {
  const pick = (current: string, implied: boolean) => {
    const candidates = (packageAt(profile, current)?.tools ?? [])
      .filter((t) => managers.includes(t.tool))
      .map((t) => ({ t, evidence: t.evidence.filter((e) => chooses(e) !== implied) }))
      .filter((c) => c.evidence.length > 0)
      .sort(
        (a, b) =>
          bestTier(a.evidence) - bestTier(b.evidence) ||
          managers.indexOf(a.t.tool) - managers.indexOf(b.t.tool),
      )
    const found = candidates[0]
    if (found === undefined) return null
    const best = [...found.evidence].sort((a, b) => a.tier - b.tier)[0]!
    const lockfiles = registry.byId.get(found.t.tool)?.roles.packageManager?.lockfiles ?? []
    const locked = found.t.evidence.some((e) =>
      lockfiles.some((l) => compilePattern(l).base(e.source) === current),
    )
    return { tool: found.t.tool, dir: current, source: best.source, locked }
  }
  for (let current = dir; ; current = dirOf(current)) {
    const found = pick(current, false)
    if (found !== null) return found
    if (current === '.') break
  }
  return pick(dir, true)
}

/** Evidence that chooses a manager, as opposed to a manifest that only implies it. */
function chooses(e: Evidence): boolean {
  return e.kind !== 'manifest' || e.source.includes('#')
}

function bestTier(evidence: readonly Evidence[]): number {
  return Math.min(...evidence.map((e) => e.tier))
}

/** One install command per ecosystem of the package at `dir`. */
export function installActions(
  registry: Registry,
  profile: ProjectProfile,
  dir = '.',
): ToolAction[] {
  return choosePackageManagers(registry, profile, dir).flatMap((choice) => {
    const role = registry.byId.get(choice.tool)?.roles.packageManager
    if (role === undefined) return []
    const argv = choice.locked ? role.install : (role.installUnlocked ?? role.install)
    return [action(choice, [...argv])]
  })
}

/** The install commands that refuse to change a lockfile, where the manager has one. */
export function frozenInstallActions(
  registry: Registry,
  profile: ProjectProfile,
  dir = '.',
): ToolAction[] {
  return choosePackageManagers(registry, profile, dir).flatMap((choice) => {
    const role = registry.byId.get(choice.tool)?.roles.packageManager
    if (role?.frozen === undefined || !choice.locked) return []
    return [action(choice, [...role.install, ...role.frozen])]
  })
}

/**
 * The install commands whose dependency directory is missing. A manager
 * assumed with no lockfile never counts: an install with nothing to install
 * creates no directory, so the step would re-run forever.
 */
export function missingDepsActions(
  registry: Registry,
  profile: ProjectProfile,
  dir = '.',
): ToolAction[] {
  return choosePackageManagers(registry, profile, dir).flatMap((choice) => {
    const role = registry.byId.get(choice.tool)?.roles.packageManager
    const dirs = role?.depsDirs
    if (role === undefined || dirs === undefined || choice.fallback) return []
    const present = dirs.some((d) => existsSync(join(profile.root, joinRel(choice.dir, d))))
    return present ? [] : [action(choice, [...role.install])]
  })
}

function action(choice: PackageManagerChoice, argv: string[]): ToolAction {
  return {
    tool: choice.tool,
    ecosystem: choice.ecosystem,
    dir: choice.dir,
    argv,
    source: choice.source,
  }
}

/** The detected tools at the root that play `role`, in registry order. */
export function rootTools(
  registry: Registry,
  profile: ProjectProfile,
  role: 'toolManager' | 'hookManager',
): Array<{ def: ToolDef; detected: Detected }> {
  const root = packageAt(profile, '.')
  const out: Array<{ def: ToolDef; detected: Detected }> = []
  for (const detected of root?.tools ?? []) {
    const def = registry.byId.get(detected.tool)
    if (def?.roles[role] !== undefined) out.push({ def, detected })
  }
  return out
}

/** `mise exec -- <binary>` through the first detected tool manager that has one, else `[binary]`. */
export function execPrefix(registry: Registry, profile: ProjectProfile, binary: string): string[] {
  for (const { def } of rootTools(registry, profile, 'toolManager')) {
    const exec = def.roles.toolManager?.exec
    if (exec !== undefined) return exec(binary)
  }
  return [binary]
}

/** The one-time trust grant each detected tool manager needs. */
export function trustActions(registry: Registry, profile: ProjectProfile): ToolAction[] {
  return rootTools(registry, profile, 'toolManager').flatMap(({ def, detected }) => {
    const trust = def.roles.toolManager?.trust
    return trust === undefined ? [] : [rootAction(def, detected, [...trust])]
  })
}

/** The command that arms each detected hook manager's git hooks. */
export function armActions(registry: Registry, profile: ProjectProfile): ToolAction[] {
  const root = packageAt(profile, '.')
  if (root === undefined) return []
  return rootTools(registry, profile, 'hookManager').map(({ def, detected }) =>
    rootAction(def, detected, def.roles.hookManager!.arm(root)),
  )
}

export function rootAction(def: ToolDef, detected: Detected, argv: string[]): ToolAction {
  return {
    tool: def.id,
    ...(def.ecosystem ? { ecosystem: def.ecosystem.id } : {}),
    dir: '.',
    argv,
    source: detected.evidence[0]!.source,
  }
}

/** The registered tool a command's first word names (`bunx` is bun, `pip3` is pip). */
export function toolForCommand(registry: Registry, command: string): ToolDef | undefined {
  const word = command.trim().split(/\s+/)[0]
  if (word === undefined || word === '') return undefined
  return registry.tools.find(
    (t) => t.binary === word || (t.commandWords ?? []).includes(word) || t.id === word,
  )
}
