// The `@osdlc/path-guard/node` entry: the real disk, through Node `fs`.

import { readlinkSync, realpathSync, statSync } from 'node:fs'
import { posix } from 'node:path'

import { PathGuard } from './guard.ts'
import { WINDOWS, joinPath, type Resolver } from './resolve.ts'
import { components } from './text.ts'

export {
  existingPathInside,
  openContainedFile,
  readContainedFile,
  realPathInside,
  type ContainedFile,
  type ContainedPath,
} from './contained.ts'

/**
 * The real filesystem. On POSIX a `..` is resolved physically, as the OS
 * `realpath` does: `link/..` is the parent of the link's target.
 * `realpathSync` alone cannot be trusted with that: it folds `..` textually
 * first. On Windows, where `..` folds as text, it is `realpathSync.native`,
 * which also expands short (8.3) names.
 *
 * @example
 * ```ts
 * nodeResolver.realpath('/tmp') // '/private/tmp' on macOS, '/tmp' on Linux
 * ```
 */
export const nodeResolver: Resolver = {
  realpath(path) {
    if (path === '') throw fsError('ENOENT', path)
    if (WINDOWS) return realpathSync.native(path)
    const { absolute, segs } = components(path)
    let current = absolute ? '/' : '.'
    for (const seg of segs) {
      if (seg === '..') {
        const real = realpathSync(current)
        if (!statSync(real).isDirectory()) throw fsError('ENOTDIR', current)
        current = posix.dirname(real)
      } else current = joinPath(current, seg)
    }
    return realpathSync(current)
  },
  readlink: (path) => readlinkSync(path),
}

/**
 * A {@link PathGuard} over {@link nodeResolver}, with no warning handler. Build
 * `new PathGuard(nodeResolver, { onWarning })` to hear about Windows names.
 *
 * @example
 * ```ts
 * nodeGuard.resolve('/srv/data', 'notes/a.md') // '/srv/data/notes/a.md'
 * nodeGuard.realPath('/tmp/does-not-exist/x') // '/private/tmp/does-not-exist/x' on macOS
 * ```
 */
export const nodeGuard: PathGuard = new PathGuard(nodeResolver)

function fsError(code: string, path: string): Error {
  return Object.assign(new Error(`${code}: ${path}`), { code })
}
