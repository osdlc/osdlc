/**
 * Host paths to the core's path form and back.
 *
 * The core runs on `wasm32-unknown-unknown`, where `std::path` splits on `/`
 * only and a path is absolute only when it starts with `/`. A Windows path such
 * as `C:\Users\me\vault` would reach it as one relative component, so every
 * containment check would compare the wrong things. On Windows, every path
 * crosses the boundary in this form:
 *
 * | Windows | Core |
 * |---|---|
 * | `C:\Users\me\vault` | `/C:/Users/me/vault` |
 * | `C:\` | `/C:/` |
 * | `\\server\share\dir` | `/UNC/server/share/dir` |
 * | `\\?\C:\x`, `\\?\UNC\server\share\x` | as their plain forms |
 *
 * The drive is one whole component after the root, so containment compares
 * `C:/vault` against `C:/vault-bee` component by component. The drive letter
 * is upper-cased, as `realpath` answers it. `.` and `..` are folded the way
 * Windows folds them: `..` stops at `C:\` and at `\\server\share`. The core's
 * own folding does not know where a drive or share starts.
 *
 * `/`, `/UNC` and `/UNC/<server>` name no Windows directory. They exist only so
 * the core can resolve a path one leading part at a time: {@link toHostPath}
 * answers `null` for them, and {@link toCorePath} refuses them, so none can
 * be a root.
 *
 * On any other platform both functions return the path unchanged.
 */

/** An error with a Node-style `code`, which the wasm bridge reads. */
export function pathError(message: string, code: string): Error {
  return Object.assign(new Error(message), { code })
}

/** The code for a path this boundary cannot convert. Not one the core treats as "missing". */
export const UNSUPPORTED_PATH = 'ERR_TRADECRAFT_UNSUPPORTED_PATH'

const CORE_DRIVE = /^\/([A-Za-z]):(\/.*)?$/

/** `rest` split into parts, with `.` and `..` folded and clamped at the root. */
function fold(rest: string): string[] {
  const parts: string[] = []
  for (const part of rest.split('/')) {
    if (part === '..') parts.pop()
    else if (part !== '' && part !== '.') parts.push(part)
  }
  return parts
}

function drivePath(letter: string, rest: string): string {
  return `/${letter.toUpperCase()}:/${fold(rest).join('/')}`
}

/** A server or share name Windows does not accept. */
const NOT_A_NAME = new Set(['', '.', '..'])

/** `rest` is what follows `\\` or `/UNC/`: a server, a share, then the path. */
function sharePath(rest: string, original: string): string {
  const [server = '', share = '', ...path] = rest.split('/')
  if (NOT_A_NAME.has(server) || NOT_A_NAME.has(share)) {
    throw pathError(`${original} names no share; give a drive or a share`, UNSUPPORTED_PATH)
  }
  return ['/UNC', server, share, ...fold(path.join('/'))].join('/')
}

/**
 * A host path in the core's form. Accepts `\` and `/` alike, and a path already
 * in the core's form when it has no `\`. Throws `UNSUPPORTED_PATH` for
 * anything that is not a drive or share path: a path relative to the current
 * directory or drive (`x`, `C:x`, `\x`, `\UNC\x`), a name above a share
 * (`\\server`), or a device or volume path (`\\.\pipe\x`, `\\?\Volume{…}\x`).
 */
export function toCorePath(p: string, platform: string = process.platform): string {
  if (platform !== 'win32') return p

  if (!p.includes('\\')) {
    const core = CORE_DRIVE.exec(p)
    if (core !== null) return drivePath(core[1]!, core[2] ?? '/')
    if (p === '/' || p === '/UNC') {
      throw pathError(`${p} names no directory; give a drive or a share`, UNSUPPORTED_PATH)
    }
    if (p.startsWith('/UNC/')) return sharePath(p.slice(5), p)
  }

  let s = p.replace(/\\/g, '/')
  const prefixed = /^\/\/[?.]\//.test(s)
  if (prefixed) s = /^\/\/[?.]\/UNC\//i.test(s) ? `//${s.slice(8)}` : s.slice(4)

  if (s.startsWith('//')) return sharePath(s.slice(2), p)
  const drive = /^([A-Za-z]):\/(.*)$/.exec(s)
  if (drive !== null) return drivePath(drive[1]!, drive[2]!)
  if (prefixed) throw pathError(`${p} is not a drive or share path`, UNSUPPORTED_PATH)
  throw pathError(`${p} depends on the current directory; give a full path`, UNSUPPORTED_PATH)
}

/**
 * A core path as the host spells it, or `null` for one of the names that are
 * not a Windows directory (`/`, `/UNC`, `/UNC/<server>`). Throws for any other
 * absolute path, which no Windows path converts to.
 */
export function toHostPath(p: string, platform: string = process.platform): string | null {
  if (platform !== 'win32') return p
  const drive = CORE_DRIVE.exec(p)
  if (drive !== null) {
    return `${drive[1]!.toUpperCase()}:\\${(drive[2] ?? '/').slice(1).replace(/\//g, '\\')}`
  }
  if (p === '/' || p === '/UNC') return null
  if (p.startsWith('/UNC/')) {
    const [server, share, ...rest] = p.slice(5).split('/')
    if (share === undefined || share === '') return null
    return `\\\\${[server, share, ...rest].join('\\')}${rest.length === 0 ? '\\' : ''}`
  }
  if (p.startsWith('/')) {
    throw pathError(`${p} is not a Windows path`, UNSUPPORTED_PATH)
  }
  return p.replace(/\//g, '\\')
}

/**
 * A link's target text in the core's form. A relative target stays relative.
 * A root-relative one (`\x`) takes the drive of the link it was read from.
 */
export function linkTargetToCore(
  target: string,
  linkCorePath: string,
  platform: string = process.platform,
): string {
  if (platform !== 'win32') return target
  const s = target.replace(/\\/g, '/')
  if (s.startsWith('/') && !s.startsWith('//')) {
    const drive = CORE_DRIVE.exec(linkCorePath)
    if (drive === null) {
      throw pathError(`${target} is relative to a drive this link is not on`, UNSUPPORTED_PATH)
    }
    return drivePath(drive[1]!, s)
  }
  if (/^[A-Za-z]:/.test(s) || s.startsWith('//')) return toCorePath(target, platform)
  return s
}
