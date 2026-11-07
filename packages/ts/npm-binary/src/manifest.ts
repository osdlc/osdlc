/**
 * The package.json of a platform package and of the launcher.
 *
 * `template` fields keep the position they have in the template. Fields this
 * module sets that the template does not name are appended, so a product
 * controls key order (and with it the bytes written) through its template.
 */
import { chmodSync, copyFileSync, writeFileSync } from 'node:fs'

import {
  type BinaryProduct,
  binaryPathInPackage,
  type NpmPlatform,
  platformKey,
  platformPackageName,
} from './platform.ts'

/** A package.json as a plain object. */
export type Manifest = Record<string, unknown>

/** Options for {@link platformManifest}. */
export interface PlatformManifestOptions {
  version: string
  description: string
  /**
   * Fields to carry, such as `license`, `author` or `publishConfig`. Each keeps
   * its position. `name`, `version` and `description` here only fix their
   * position: their values come from the arguments.
   */
  template?: Manifest
}

/**
 * One platform package's package.json: gated by `os` and `cpu`, so npm
 * installs it only on a matching host. `files` defaults to the binary alone.
 * `preferUnplugged` keeps the binary a real file under Yarn PnP, so the
 * launcher can run it.
 */
export function platformManifest(
  product: BinaryProduct,
  platform: NpmPlatform,
  { version, description, template = {} }: PlatformManifestOptions,
): Manifest {
  const m = withIdentity(platformPackageName(product, platform), version, description, template)
  m.os = [platform.os]
  m.cpu = [platform.cpu]
  m.files ??= [binaryPathInPackage(product, platform)]
  m.preferUnplugged = true
  return m
}

/** Options for {@link launcherManifest}. */
export interface LauncherManifestOptions {
  version: string
  description: string
  /** The launcher script's path inside the package, e.g. `bin/launcher.js`. */
  launcherPath: string
  /** As {@link PlatformManifestOptions.template}. */
  template?: Manifest
}

/**
 * The launcher package's package.json. Lists every platform package as an
 * optional dependency at the same version, built or not. `files` defaults to
 * the launcher and the README, and `engines.node` to `>=18`. No `type`
 * field: the launcher is CommonJS.
 */
export function launcherManifest(
  product: BinaryProduct,
  platforms: readonly NpmPlatform[],
  { version, description, launcherPath, template = {} }: LauncherManifestOptions,
): Manifest {
  const m = withIdentity(product.launcher, version, description, template)
  m.bin = { [product.binary]: launcherPath }
  m.files ??= [launcherPath, 'README.md']
  m.optionalDependencies = Object.fromEntries(
    platforms.map((p) => [platformPackageName(product, p), version]),
  )
  m.engines ??= { node: '>=18' }
  return m
}

/**
 * `name`, `version` and `description` first, then the template's fields. A
 * template that names one of the three keeps its position, but the argument's
 * value wins.
 */
function withIdentity(
  name: string,
  version: string,
  description: string,
  template: Manifest,
): Manifest {
  const m: Manifest = { name, version, description }
  Object.assign(m, template)
  m.name = name
  m.version = version
  m.description = description
  return m
}

/**
 * The launcher's lookup table: platform key to package and binary path.
 * Internal: `renderLauncher` writes it into the launcher.
 */
export function launcherTable(
  product: BinaryProduct,
  platforms: readonly NpmPlatform[],
): Record<string, { package: string; binary: string }> {
  return Object.fromEntries(
    platforms.map((p) => [
      platformKey(p),
      { package: platformPackageName(product, p), binary: binaryPathInPackage(product, p) },
    ]),
  )
}

/** Writes `value` as JSON with two-space indent and a final newline, as npm does. */
export function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

/** Copies a binary into a package and marks it executable (mode `0o755`). */
export function copyExecutable(src: string, dest: string): void {
  copyFileSync(src, dest)
  chmodSync(dest, 0o755)
}
