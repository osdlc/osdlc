import { createRequire } from 'node:module'
import { join } from 'node:path'

/**
 * Where an optional peer `specifier` resolves: from the project at `from`
 * (a directory), else beside this package. The first place whose path
 * `accept` takes wins; null when neither resolves to one it takes.
 */
export function resolvePeer(
  specifier: string,
  from: string,
  accept: (path: string) => boolean = () => true,
): string | null {
  for (const base of [join(from, 'package.json'), import.meta.url]) {
    let path: string
    try {
      path = createRequire(base).resolve(specifier)
    } catch {
      continue
    }
    if (accept(path)) return path
  }
  return null
}
