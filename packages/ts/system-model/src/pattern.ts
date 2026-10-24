/**
 * The one file-pattern language, shared by markers, `ctx.files()` and the
 * cache fingerprint. It follows `.gitignore`'s anchoring:
 *
 *   - no `/` (ignoring a trailing one): matches a basename at any depth;
 *   - a `/` at the start or in the middle: a path from the root;
 *   - a trailing `/`: every file under that directory;
 *   - `*` matches any run of characters within one segment.
 */

export interface CompiledPattern {
  /** The pattern as written. */
  source: string
  /** Anchored at the root. */
  anchored: boolean
  /** No `*` anywhere, so the path it names can be checked on disk. */
  literal: boolean
  /** Matches a directory's contents rather than a file. */
  directory: boolean
  /** The path the pattern names, without slashes at either end. Meaningful when `literal`. */
  path: string
  /**
   * The directory a matching path is relative to: `.` for an anchored
   * pattern, the parent directory for a basename. `null` when it does not match.
   */
  base(path: string): string | null
}

const cache = new Map<string, CompiledPattern>()

export function compilePattern(pattern: string): CompiledPattern {
  const hit = cache.get(pattern)
  if (hit !== undefined) return hit

  const directory = pattern.endsWith('/')
  const trimmed = pattern.replace(/\/+$/, '')
  const anchored = trimmed.includes('/')
  const body = trimmed.replace(/^\/+/, '')
  const segments = body.split('/').map(segmentRegExp)
  const literal = !pattern.includes('*')

  const base = (path: string): string | null => {
    const parts = path.split('/')
    if (anchored) {
      if (directory ? parts.length <= segments.length : parts.length !== segments.length) {
        return null
      }
      return segments.every((re, i) => re.test(parts[i]!)) ? '.' : null
    }
    // Unanchored: one segment, matched against the basename, or for a
    // directory pattern, against any directory segment above the file.
    const re = segments[0]!
    if (!directory) {
      return re.test(parts[parts.length - 1]!) ? dirOfParts(parts.slice(0, -1)) : null
    }
    for (let i = 0; i < parts.length - 1; i++) {
      if (re.test(parts[i]!)) return dirOfParts(parts.slice(0, i))
    }
    return null
  }

  const compiled: CompiledPattern = {
    source: pattern,
    anchored,
    literal,
    directory,
    path: body,
    base,
  }
  cache.set(pattern, compiled)
  return compiled
}

function segmentRegExp(segment: string): RegExp {
  const escaped = segment.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')
  return new RegExp(`^${escaped}$`)
}

function dirOfParts(parts: string[]): string {
  return parts.length === 0 ? '.' : parts.join('/')
}

/** The directory part of a root-relative path, `.` for the root. */
export function dirOf(relPath: string): string {
  const at = relPath.lastIndexOf('/')
  return at === -1 ? '.' : relPath.slice(0, at)
}

/** `dir/name`, or `name` at the root. */
export function joinRel(dir: string, name: string): string {
  return dir === '.' ? name : `${dir}/${name}`
}
