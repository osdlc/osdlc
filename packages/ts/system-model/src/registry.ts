/**
 * The registered tools and the ecosystems they name, indexed once per
 * `createProject` call.
 */

import type { EvidenceKind } from './aspect.ts'
import type { EcosystemDef, RoleName, ToolDef, ToolInfo } from './tool.ts'

export interface Registry {
  tools: readonly ToolDef[]
  byId: ReadonlyMap<string, ToolDef>
  ecosystems: readonly EcosystemDef[]
  ecosystemById: ReadonlyMap<string, EcosystemDef>
}

/** A marker: one the tool declares, or one from its role's lockfiles or configs. */
export interface MarkerEntry {
  files: string
  tier: EvidenceKind
  /** A package-manager lockfile: a directory holding one is a package. */
  lockfile: boolean
  workspaceRoot: boolean
}

export function buildRegistry(tools: readonly ToolDef[]): Registry {
  const byId = new Map<string, ToolDef>()
  const ecosystemById = new Map<string, EcosystemDef>()
  for (const tool of tools) {
    if (byId.has(tool.id)) throw new Error(`tool "${tool.id}" is registered twice`)
    byId.set(tool.id, tool)
    const eco = tool.ecosystem
    if (eco === undefined) continue
    const known = ecosystemById.get(eco.id)
    if (known !== undefined && known !== eco) {
      throw new Error(`two different ecosystems are named "${eco.id}"; import the one definition`)
    }
    ecosystemById.set(eco.id, eco)
  }
  return { tools, byId, ecosystems: [...ecosystemById.values()], ecosystemById }
}

/** Every file pattern that indicates `tool` is in use: its markers and its role files. */
export function markersOf(tool: ToolDef): MarkerEntry[] {
  const out: MarkerEntry[] = (tool.markers ?? []).map((m) => ({
    files: m.files,
    tier: m.tier,
    lockfile: false,
    workspaceRoot: m.workspaceRoot === true,
  }))
  const role = tool.roles
  for (const files of role.packageManager?.lockfiles ?? []) {
    out.push({ files, tier: 'files', lockfile: true, workspaceRoot: false })
  }
  for (const files of [
    ...(role.toolManager?.configs ?? []),
    ...(role.hookManager?.configs ?? []),
  ]) {
    out.push({ files, tier: 'files', lockfile: false, workspaceRoot: false })
  }
  return out
}

/** The manifest patterns that imply `tool`, from its ecosystem. */
export function manifestsOf(tool: ToolDef): string[] {
  return (tool.ecosystem?.manifests ?? []).filter((m) => m.tool === tool.id).map((m) => m.files)
}

/** The roles a tool plays, in a fixed order. */
export function rolesOf(tool: ToolDef): RoleName[] {
  const order: RoleName[] = ['packageManager', 'runner', 'toolManager', 'hookManager']
  return order.filter((name) => tool.roles[name] !== undefined)
}

/** A tool's data without its functions, safe to print as JSON. */
export function toolInfo(tool: ToolDef): ToolInfo {
  const runner = tool.roles.runner
  const brand = tool.brand ?? runner?.brand
  return {
    id: tool.id,
    ...(tool.homepage === undefined ? {} : { homepage: tool.homepage }),
    ...(tool.description === undefined ? {} : { description: tool.description }),
    ...(brand === undefined ? {} : { brand: { ...brand } }),
    ...(tool.binary === undefined ? {} : { binary: tool.binary }),
    ...(tool.commandWords === undefined ? {} : { commandWords: [...tool.commandWords] }),
    ...(tool.ecosystem === undefined ? {} : { ecosystem: tool.ecosystem.id }),
    markers: markersOf(tool).map((m) => ({
      files: m.files,
      tier: m.tier,
      ...(m.workspaceRoot ? { workspaceRoot: true } : {}),
    })),
    roles: rolesOf(tool),
    ...(runner === undefined
      ? {}
      : {
          runner: {
            kind: runner.kind,
            ...(runner.chain === undefined ? {} : { chain: runner.chain.map((c) => ({ ...c })) }),
            ...(runner.probe === undefined ? {} : { probe: { ...runner.probe } }),
            ...(runner.watch === undefined ? {} : { watch: [...runner.watch] }),
          },
        }),
  }
}
