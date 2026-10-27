/**
 * Checks, once before the suite, that the workspace libraries wayfinder
 * imports are built and current. They resolve by name to their dist/, so a
 * missing build fails every import, and a build older than a pull runs the
 * tests against the old library. The check walks the workspace dependencies
 * transitively and fails when a library has no dist/, or a file in its src/
 * is newer than everything in its dist/.
 */
import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

interface Manifest {
  name: string
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
}

const ROOT = fileURLToPath(new URL('..', import.meta.url))

function manifest(dir: string): Manifest {
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Manifest
}

/** The newest file under `dir`, or undefined when it has none. */
function newest(dir: string): { path: string; mtimeMs: number } | undefined {
  let best: { path: string; mtimeMs: number } | undefined
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue
    const path = join(entry.parentPath, entry.name)
    const { mtimeMs } = statSync(path)
    if (best === undefined || mtimeMs > best.mtimeMs) best = { path, mtimeMs }
  }
  return best
}

/** Why the library in `dir` needs a build, or undefined when it is current. */
function staleness(dir: string): string | undefined {
  let built: ReturnType<typeof newest>
  try {
    built = newest(join(dir, 'dist'))
  } catch {
    return 'no dist/'
  }
  if (built === undefined) return 'dist/ is empty'
  const source = newest(join(dir, 'src'))
  if (source !== undefined && source.mtimeMs > built.mtimeMs) {
    return `${relative(dir, source.path)} is newer than dist/`
  }
  return undefined
}

export default function setup(): void {
  const stale: string[] = []
  const seen = new Set<string>()
  const visit = (dir: string): void => {
    for (const [name, spec] of Object.entries(manifest(dir).dependencies ?? {})) {
      if (!spec.startsWith('workspace:') || seen.has(name)) continue
      seen.add(name)
      const dep = realpathSync(join(dir, 'node_modules', name))
      if (manifest(dep).scripts?.['build'] !== undefined) {
        const why = staleness(dep)
        if (why !== undefined) stale.push(`  ${name}: ${why}`)
      }
      visit(dep)
    }
  }
  visit(ROOT)
  if (stale.length === 0) return
  throw new Error(
    [
      "wayfinder's tests import these workspace libraries through their built dist/, which is missing or out of date:",
      ...stale.sort(),
      'Build them from the repository root, then run the tests again:',
      "  pnpm install && pnpm --filter '@osdlc/wayfinder^...' run build",
    ].join('\n'),
  )
}
