/**
 * Project-root resolution, by walking up from a directory.
 *
 * Repository markers (`.git`, and any marker a tool flags `workspaceRoot`,
 * such as moon's) are checked across the whole ancestor chain before any
 * package marker. Checking both at each level would stop at the first
 * `package.json` in a monorepo. The nearest repository marker wins, so a
 * nested checkout resolves to itself.
 */

import { resolve } from 'node:path'

import { pathExists } from './discovery.ts'
import { compilePattern } from './pattern.ts'
import { markersOf, type Registry } from './registry.ts'

export async function findRoot(registry: Registry, from: string): Promise<string> {
  const repoMarkers = ['.git']
  const packageMarkers: string[] = []
  for (const tool of registry.tools) {
    for (const marker of markersOf(tool)) {
      const compiled = compilePattern(marker.files)
      if (!compiled.literal || compiled.directory) continue
      if (marker.workspaceRoot) repoMarkers.push(compiled.path)
      else if (!compiled.anchored && !marker.lockfile) packageMarkers.push(compiled.path)
    }
  }
  for (const eco of registry.ecosystems) {
    for (const manifest of eco.manifests) {
      const compiled = compilePattern(manifest.files)
      if (compiled.literal && !compiled.anchored) packageMarkers.push(compiled.path)
    }
  }

  const start = resolve(from)
  const chain: string[] = []
  for (let dir = start; ;) {
    chain.push(dir)
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  for (const markers of [repoMarkers, packageMarkers]) {
    for (const dir of chain) {
      for (const marker of markers) {
        if (await pathExists(dir, marker)) return dir
      }
    }
  }
  return start
}
