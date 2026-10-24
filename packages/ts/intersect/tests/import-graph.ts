/**
 * Reads an entry's import graph for the dependency-isolation tests
 * (`fs.test.ts`, `exports.test.ts`). It reads only this package's source files
 * and collects every bare (non-relative, non-`node:`) module specifier
 * reachable from the entry.
 *
 * It reads source text and does not use Node's module resolution. Imports in
 * this package carry explicit `.ts` extensions, so a plain `resolve` against
 * the importing file's directory gives the target file.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/** Every static/dynamic module specifier in `src`, across the four import forms. */
export function specifiersOf(src: string): string[] {
  const specs: string[] = []
  const patterns = [
    /\b(?:import|export)\b[^;\n]*?\bfrom\s*["']([^"']+)["']/g, // import/export ... from "x"
    /\bimport\s*["']([^"']+)["']/g, // side-effect: import "x"
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g, // dynamic: import("x")
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g, // require("x")
  ]
  for (const re of patterns) {
    for (const m of src.matchAll(re)) {
      if (m[1] !== undefined) specs.push(m[1])
    }
  }
  return specs
}

/**
 * The set of bare (non-relative, non-`node:`) specifiers transitively reachable
 * from `entryFile`: the external runtime dependencies that entry loads.
 */
export function reachableBareImports(entryFile: string): Set<string> {
  const visited = new Set<string>()
  const bare = new Set<string>()
  const stack = [entryFile]
  while (stack.length > 0) {
    const file = stack.pop()
    if (file === undefined || visited.has(file)) continue
    visited.add(file)
    const src = readFileSync(file, 'utf8')
    for (const spec of specifiersOf(src)) {
      if (spec.startsWith('.')) {
        stack.push(resolve(dirname(file), spec))
      } else if (!spec.startsWith('node:')) {
        bare.add(spec)
      }
    }
  }
  return bare
}

/** Whether `specs` includes the fs entry's dependency, `tinyglobby`. */
export function importsGlobber(specs: Set<string>): boolean {
  return [...specs].some((s) => s === 'tinyglobby' || s.startsWith('tinyglobby/'))
}
