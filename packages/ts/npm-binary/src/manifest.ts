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
   * position: their values come from the arguments. The template is copied,
   * so the result shares no objects with it.
   */
  template?: Manifest
}

/**
 * One platform package's package.json: gated by `os` and `cpu`, so npm
 * installs it only on a matching host. `files` defaults to the binary alone;
 * a template's `files` gets the binary added when it lacks it.
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
  m.files = withFile(m.files, binaryPathInPackage(product, platform), [])
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
 * the launcher and the README; a template's `files` gets the launcher added
 * when it lacks it. `engines.node` defaults to `>=18`. The launcher is
 * CommonJS, so a template with `"type": "module"` is refused.
 */
export function launcherManifest(
  product: BinaryProduct,
  platforms: readonly NpmPlatform[],
  { version, description, launcherPath, template = {} }: LauncherManifestOptions,
): Manifest {
  if (template.type === 'module') {
    throw new Error(
      'launcherManifest: the template sets "type": "module", but the launcher is CommonJS; leave "type" out of the launcher template',
    )
  }
  const m = withIdentity(product.launcher, version, description, template)
  m.bin = { [product.binary]: launcherPath }
  m.files = withFile(m.files, launcherPath, ['README.md'])
  m.optionalDependencies = Object.fromEntries(
    platforms.map((p) => [platformPackageName(product, p), version]),
  )
  m.engines ??= { node: '>=18' }
  return m
}

/**
 * The template's fields in order, with `name`, `version` and `description`
 * set from the arguments. An identity field the template names keeps the
 * template's position; one it does not name goes first.
 */
function withIdentity(
  name: string,
  version: string,
  description: string,
  template: Manifest,
): Manifest {
  const identity = { name, version, description }
  const first = Object.fromEntries(
    Object.entries(identity).filter(([key]) => !Object.hasOwn(template, key)),
  )
  return Object.assign(first, structuredClone(template), identity)
}

/**
 * The `files` list with `file` in it: the template's list plus `file` when it
 * is missing, or `file` and `rest` when the template has none.
 */
function withFile(files: unknown, file: string, rest: string[]): unknown[] {
  if (!Array.isArray(files)) return [file, ...rest]
  return files.includes(file) ? files : [...files, file]
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
