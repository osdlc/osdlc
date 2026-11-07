/**
 * The platforms a binary ships for, and the names derived from them.
 */

/**
 * A platform as npm sees it: an `os` from `process.platform` and a `cpu` from
 * `process.arch`. The common values are named for completion; any other value
 * Node reports, such as `freebsd` or `ia32`, is accepted too.
 */
export interface NpmPlatform {
  readonly os: 'darwin' | 'linux' | 'win32' | (string & {})
  readonly cpu: 'arm64' | 'x64' | (string & {})
}

/**
 * The default platform list, in publish and listing order: macOS on Apple
 * silicon and Intel, Linux on x64 and arm64, and Windows on x64. Linux
 * packages carry no `libc` gate, so one Linux build serves glibc and musl
 * hosts alike: ship a static (musl) build. A product that ships for fewer or
 * more passes its own list.
 */
export const NPM_PLATFORMS: readonly NpmPlatform[] = [
  { os: 'darwin', cpu: 'arm64' },
  { os: 'darwin', cpu: 'x64' },
  { os: 'linux', cpu: 'x64' },
  { os: 'linux', cpu: 'arm64' },
  { os: 'win32', cpu: 'x64' },
]

/** The names one product ships under. */
export interface BinaryProduct {
  /** The executable name, on the user's PATH and inside each platform package. */
  readonly binary: string
  /** The launcher package users install. */
  readonly launcher: string
  /** The npm scope platform packages are published under, such as `@acme`. */
  readonly scope: string
  /**
   * Platform packages are `<scope>/<platformPrefix>-<os>-<cpu>`, such as
   * `@acme/tool-linux-x64`. With `''` they are `<scope>/<os>-<cpu>`, the way
   * esbuild names them (`@esbuild/linux-x64`).
   */
  readonly platformPrefix: string
  /** Directory inside a platform package that holds the binary; `''` is the package root. */
  readonly binaryDir: string
}

/** `darwin-arm64`: the key a platform goes by in directories and in the launcher. */
export function platformKey(p: NpmPlatform): string {
  return `${p.os}-${p.cpu}`
}

/**
 * `<scope>/<platformPrefix>-<os>-<cpu>`, e.g. `@acme/tool-linux-x64`, or
 * `<scope>/<os>-<cpu>` when `platformPrefix` is `''`. Throws when `scope` is
 * not an npm scope.
 */
export function platformPackageName(product: BinaryProduct, p: NpmPlatform): string {
  if (!/^@[^/@\s]+$/.test(product.scope)) {
    throw new Error(
      `scope must be an npm scope such as "@acme", got ${JSON.stringify(product.scope)}`,
    )
  }
  const prefix = product.platformPrefix === '' ? '' : `${product.platformPrefix}-`
  return `${product.scope}/${prefix}${platformKey(p)}`
}

/** The executable's extension, with its dot: `.exe` on Windows, empty elsewhere. */
export function binaryExt(p: Pick<NpmPlatform, 'os'>): string {
  return p.os === 'win32' ? '.exe' : ''
}

/** The executable's file name on that platform: `tool`, or `tool.exe` on Windows. */
export function binaryFileName(product: BinaryProduct, p: Pick<NpmPlatform, 'os'>): string {
  return `${product.binary}${binaryExt(p)}`
}

/** The binary's path inside its platform package, `/`-separated. */
export function binaryPathInPackage(product: BinaryProduct, p: Pick<NpmPlatform, 'os'>): string {
  const file = binaryFileName(product, p)
  return product.binaryDir === '' ? file : `${product.binaryDir}/${file}`
}

/** The entry in `platforms` whose key is `key`. Throws, naming the known keys, when none is. */
export function findPlatform<P extends NpmPlatform>(platforms: readonly P[], key: string): P {
  const found = platforms.find((p) => platformKey(p) === key)
  if (!found) {
    throw new Error(`unknown platform "${key}"; known: ${platforms.map(platformKey).join(', ')}`)
  }
  return found
}

/**
 * The entry for the machine this runs on, from `process.platform` and
 * `process.arch`. Throws when the host is not in `platforms`.
 */
export function hostPlatform<P extends NpmPlatform>(platforms: readonly P[]): P {
  return findPlatform(platforms, `${process.platform}-${process.arch}`)
}
