/**
 * The `packages` list of a `pnpm-workspace.yaml`: the globs that make a
 * directory a pnpm workspace member. pnpm reads this file, not
 * `package.json#workspaces`.
 */

import { parse } from 'yaml'

import type { ProviderContext } from '../../contract.ts'
import type { Package, ToolFact } from '../../tool.ts'
import { isTable, joinRel } from '../support/shared.ts'

export const PNPM_WORKSPACE = 'pnpm-workspace.yaml'

/** The fact pnpm's `describe` records at a directory holding a `pnpm-workspace.yaml`. */
interface PnpmWorkspaceFact {
  /** `null` when the members are unknown. */
  pnpmWorkspacePackages: string[] | null
}

/**
 * The `packages:` globs, with `!` negations as written. `null` when the file
 * does not parse or lists no package: the members are then unknown, not none.
 */
export function parsePnpmWorkspace(text: string): string[] | null {
  let doc: unknown
  try {
    // A low alias limit keeps a hostile file cheap to parse. `logLevel: 'error'`
    // keeps yaml's warnings (such as an unknown tag) off stderr during detection.
    doc = parse(text, { maxAliasCount: 16, logLevel: 'error' })
  } catch {
    return null
  }
  const packages = isTable(doc) ? doc['packages'] : undefined
  if (!Array.isArray(packages)) return null
  const globs = packages.filter((g): g is string => typeof g === 'string' && g !== '')
  return globs.length > 0 ? globs : null
}

/** Reads each detected `pnpm-workspace.yaml` once, at detect time. */
export async function describePnpmWorkspaces(
  ctx: ProviderContext,
  packages: readonly Package[],
): Promise<ToolFact[]> {
  const facts: ToolFact[] = []
  for (const pkg of packages) {
    const path = joinRel(pkg.dir, PNPM_WORKSPACE)
    // Reuse the marker's evidence, so describing adds no second claim.
    const evidence = pkg.tools
      .find((t) => t.tool === 'pnpm')
      ?.evidence.find((e) => e.source === path)
    if (evidence === undefined) continue
    const text = await ctx.readText(path)
    if (text === null) continue
    const fact: PnpmWorkspaceFact = { pnpmWorkspacePackages: parsePnpmWorkspace(text) }
    facts.push({ dir: pkg.dir, fact, evidence })
  }
  return facts
}

/**
 * The globs a `pnpm-workspace.yaml` at this package declares: `undefined`
 * with no such file, `null` when the file lists no readable member.
 */
export function pnpmWorkspacePackages(pkg: Package): string[] | null | undefined {
  for (const { fact } of pkg.tools.find((t) => t.tool === 'pnpm')?.facts ?? []) {
    if (fact !== null && typeof fact === 'object' && 'pnpmWorkspacePackages' in fact) {
      return (fact as PnpmWorkspaceFact).pnpmWorkspacePackages
    }
  }
  return undefined
}
