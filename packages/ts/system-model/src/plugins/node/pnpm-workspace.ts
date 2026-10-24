/**
 * The `packages` list of a `pnpm-workspace.yaml`: the globs that make a
 * directory a pnpm workspace member. pnpm reads this file, not
 * `package.json#workspaces`.
 */

import type { ProviderContext } from '../../contract.ts'
import type { Package, ToolFact } from '../../tool.ts'
import { joinRel } from '../support/shared.ts'
import { leadingSpaces, matchKey, scanLine, unquote } from '../support/yaml-lite.ts'

export const PNPM_WORKSPACE = 'pnpm-workspace.yaml'

/** The fact pnpm's `describe` records at a directory holding a `pnpm-workspace.yaml`. */
interface PnpmWorkspaceFact {
  pnpmWorkspacePackages: string[]
}

/**
 * The `packages:` entries, in a block list or a one-line flow list. `!`
 * negations are kept as they are written.
 */
export function parsePnpmWorkspace(text: string): string[] {
  const out: string[] = []
  let inPackages = false
  for (const raw of text.split('\n')) {
    const line = scanLine(raw).cleaned.replace(/\s+$/, '')
    if (line.trim() === '') continue
    const indent = leadingSpaces(line)
    if (indent === 0) {
      const key = matchKey(line, 0)
      inPackages = key?.key === 'packages'
      const value = key?.value.trim() ?? ''
      if (inPackages && value.startsWith('[')) {
        const inner = value.replace(/^\[/, '').replace(/\]$/, '')
        out.push(
          ...inner
            .split(',')
            .map(unquote)
            .filter((v) => v !== ''),
        )
        inPackages = false
      }
      continue
    }
    if (!inPackages) continue
    const item = /^\s*-\s+(.*)$/.exec(line)
    if (item) out.push(unquote(item[1]!))
  }
  return out
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

/** The globs a `pnpm-workspace.yaml` at this package declares, if it has one. */
export function pnpmWorkspacePackages(pkg: Package): string[] | undefined {
  for (const fact of pkg.tools.find((t) => t.tool === 'pnpm')?.facts ?? []) {
    const packages = (fact as Partial<PnpmWorkspaceFact> | null)?.pnpmWorkspacePackages
    if (Array.isArray(packages)) return packages
  }
  return undefined
}
