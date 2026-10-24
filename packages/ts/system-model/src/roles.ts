/**
 * Role actions: narrow questions asked by role, answered from the profile
 * and the registered tools. Nothing here spawns.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { compilePattern, dirOf, joinRel } from './pattern.ts'
import type { Registry } from './registry.ts'
import type { Evidence } from './aspect.ts'
import type { Detected, EcosystemDef, Package, ProjectProfile, ToolDef } from './tool.ts'

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
    const choice = chosenAbove(registry, profile, dir, managers)
    if (choice !== null) {
      out.push({ ...choice, ecosystem: eco.id, fallback: false })
      continue
    }
    // Nothing chose a manager. A workspace member installs at its workspace root.
    const home = workspaceRoot(profile, eco, dir) ?? dir
    const implied = bestAt(registry, profile, home, managers, (e) => !chooses(e))
    if (implied !== null) {
      out.push({ ...implied, ecosystem: eco.id, fallback: false })
      continue
    }
    const homePkg = packageAt(profile, home)
    const manifest = homePkg?.manifestFiles.find((f) =>
      eco.manifests.some((m) => compilePattern(m.files).base(f) === home),
    )
    const fallback = eco.fallback
    if (fallback !== undefined && registry.byId.has(fallback) && manifest !== undefined) {
      out.push({
        tool: fallback,
        ecosystem: eco.id,
        dir: home,
        source: manifest,
        locked: false,
        fallback: true,
      })
    }
  }
  return out
}

type Found = Omit<PackageManagerChoice, 'ecosystem' | 'fallback'>

/**
 * The nearest package at or above `dir` whose lockfile, marker or pin
 * chooses one of `managers`. A manifest that merely implies a tool (a
 * `Cargo.toml` implies cargo) does not choose here.
 */
function chosenAbove(
  registry: Registry,
  profile: ProjectProfile,
  dir: string,
  managers: readonly string[],
): Found | null {
  for (let current = dir; ; current = dirOf(current)) {
    const found = bestAt(registry, profile, current, managers, chooses)
    if (found !== null) return found
    if (current === '.') return null
  }
}

/**
 * The manager with the most direct evidence that passes `counts` in the
 * package at `dir`, then the ecosystem's precedence.
 */
function bestAt(
  registry: Registry,
  profile: ProjectProfile,
  dir: string,
  managers: readonly string[],
  counts: (e: Evidence) => boolean,
): Found | null {
  const found = (packageAt(profile, dir)?.tools ?? [])
    .filter((t) => managers.includes(t.tool))
    .map((t) => ({ t, evidence: t.evidence.filter(counts) }))
    .filter((c) => c.evidence.length > 0)
    .sort(
      (a, b) =>
        bestTier(a.evidence) - bestTier(b.evidence) ||
        managers.indexOf(a.t.tool) - managers.indexOf(b.t.tool),
    )[0]
  if (found === undefined) return null
  const best = [...found.evidence].sort((a, b) => a.tier - b.tier)[0]!
  const lockfiles = registry.byId.get(found.t.tool)?.roles.packageManager?.lockfiles ?? []
  const locked = found.t.evidence.some((e) =>
    lockfiles.some((l) => compilePattern(l).base(e.source) === dir),
  )
  return { tool: found.t.tool, dir, source: best.source, locked }
}

/** The nearest package above `dir` whose manifest declares `dir` a workspace member. */
function workspaceRoot(profile: ProjectProfile, eco: EcosystemDef, dir: string): string | null {
  if (eco.workspace === undefined || dir === '.') return null
  for (let current = dirOf(dir); ; current = dirOf(current)) {
    const pkg = packageAt(profile, current)
    const members = pkg === undefined ? undefined : eco.workspace(pkg)
    const rel = current === '.' ? dir : dir.slice(current.length + 1)
    if (members?.some((glob) => memberMatches(glob, rel))) return current
    if (current === '.') return null
  }
}

/** A workspace member glob against a relative path: `*` is one segment, `**` any. */
function memberMatches(glob: string, rel: string): boolean {
  const g = glob.replace(/^\.\//, '').replace(/\/$/, '').split('/')
  const r = rel.split('/')
  const match = (i: number, j: number): boolean => {
    if (i === g.length) return j === r.length
    if (g[i] === '**') return match(i + 1, j) || (j < r.length && match(i, j + 1))
    if (j === r.length) return false
    const re = new RegExp(
      `^${g[i]!.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`,
    )
    return re.test(r[j]!) && match(i + 1, j + 1)
  }
  return match(0, 0)
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
 * The install commands whose dependency directory is missing. Only a
 * manager with its lockfile counts: an install with nothing locked may
 * create no directory, so the step would re-run forever.
 */
export function missingDepsActions(
  registry: Registry,
  profile: ProjectProfile,
  dir = '.',
): ToolAction[] {
  return choosePackageManagers(registry, profile, dir).flatMap((choice) => {
    const role = registry.byId.get(choice.tool)?.roles.packageManager
    const dirs = role?.depsDirs
    if (role === undefined || dirs === undefined || !choice.locked) return []
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
