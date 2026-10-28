// Every name and platform the tradecraft binary release uses: package names,
// the binary, rustc targets, runners and the tag. dist.ts and, through it,
// .github/workflows/tradecraft-release.yml read them from here. install.sh and
// the package templates spell the same names; dist.test.ts checks they agree.

export const PRODUCT = {
  /** The cargo package whose `[[bin]]` ships, and whose version every package carries. */
  crate: 'tradecraft',
  /** The executable name, in the crate, inside each platform package and on PATH. */
  binary: 'tradecraft',
  /** The launcher package users install: `npx @osdlc/tradecraft`. */
  launcher: '@osdlc/tradecraft',
  /** Platform packages are `<scope>/<platformPrefix>-<os>-<cpu>`. */
  scope: '@osdlc',
  platformPrefix: 'tradecraft',
  /** The release-plz tag is `<tagPrefix><version>`. */
  tagPrefix: 'tradecraft/v',
  description:
    'Publishes a vault of markdown skill notes into the formats of coding-agent tools (Claude Code, Codex, Cursor and Pi).',
  /** The Homebrew `desc`: at most 80 characters, no leading article, no period. */
  brewDescription: 'Publish markdown skill notes into the formats of coding-agent tools',
  homepage: 'https://github.com/osdlc/osdlc/tree/main/packages/rust/tradecraft',
  license: 'MIT OR Apache-2.0',
  /** The binary sits under `bin/` in each platform package. */
  binaryDir: 'bin',
  /** The workflow named by each package's trusted publisher on npmjs.com. */
  workflow: 'tradecraft-release.yml',
  repository: 'osdlc/osdlc',
} as const

/** A platform as npm sees it: `process.platform` and `process.arch`. */
export interface Platform {
  readonly os: 'darwin' | 'linux'
  readonly cpu: 'arm64' | 'x64'
  /** The rustc target triple the binary is built for. */
  readonly rustTarget: string
  /** The GitHub-hosted runner that builds it. */
  readonly runner: string
  /** Plain cargo, or cargo-zigbuild for the static musl builds. */
  readonly builder: 'cargo' | 'zigbuild'
}

// No Windows: the crate's README says Windows is not supported yet.
export const PLATFORMS: readonly Platform[] = [
  {
    os: 'darwin',
    cpu: 'arm64',
    rustTarget: 'aarch64-apple-darwin',
    runner: 'macos-latest',
    builder: 'cargo',
  },
  {
    os: 'darwin',
    cpu: 'x64',
    rustTarget: 'x86_64-apple-darwin',
    runner: 'macos-latest',
    builder: 'cargo',
  },
  // musl, statically linked: one binary runs on any glibc age and on Alpine.
  {
    os: 'linux',
    cpu: 'x64',
    rustTarget: 'x86_64-unknown-linux-musl',
    runner: 'ubuntu-latest',
    builder: 'zigbuild',
  },
  {
    os: 'linux',
    cpu: 'arm64',
    rustTarget: 'aarch64-unknown-linux-musl',
    runner: 'ubuntu-latest',
    builder: 'zigbuild',
  },
]

/** `darwin-arm64`: the key a platform goes by in directories and in the launcher. */
export function platformKey(p: Pick<Platform, 'os' | 'cpu'>): string {
  return `${p.os}-${p.cpu}`
}

export function platformPackageName(p: Pick<Platform, 'os' | 'cpu'>): string {
  return `${PRODUCT.scope}/${PRODUCT.platformPrefix}-${platformKey(p)}`
}

/** The binary's path inside its platform package, `/`-separated. */
export function binaryPathInPackage(): string {
  return `${PRODUCT.binaryDir}/${PRODUCT.binary}`
}

/** The GitHub Release asset name of one platform's binary. cargo-binstall builds the same name. */
export function releaseAssetName(p: Platform, version: string): string {
  return `${PRODUCT.binary}-${version}-${p.rustTarget}`
}

export function findPlatform(key: string): Platform {
  const found = PLATFORMS.find((p) => platformKey(p) === key)
  if (!found) {
    throw new Error(`unknown platform "${key}"; known: ${PLATFORMS.map(platformKey).join(', ')}`)
  }
  return found
}
