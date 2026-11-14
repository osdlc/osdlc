/**
 * Render the Node launcher shim from `launcher-template.cjs`.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  type BinaryProduct,
  binaryPathInPackage,
  type NpmPlatform,
  platformKey,
  platformPackageName,
} from './platform.ts'

const TEMPLATE = fileURLToPath(new URL('./launcher-template.cjs', import.meta.url))

/** Options for {@link renderLauncher}. */
export interface LauncherOptions {
  /**
   * The name of an environment variable. When it is set to a non-empty value,
   * the launcher prints the platform, package and binary it resolved to stderr.
   * Empty (the default) turns the debug line off.
   */
  debugEnv?: string
}

/**
 * The launcher script's source: a dependency-free CommonJS file for the
 * launcher package's `bin`. On the user's machine it finds the platform package
 * npm installed for the host, runs its binary with inherited stdio, passes
 * signals through and exits with the binary's code (or `128 + signal`).
 *
 * Every value is written into the script as a JavaScript string literal, so a
 * name with quotes or backslashes is safe.
 *
 * @param product - The names the product ships under.
 * @param platforms - The platforms the launcher knows. A host outside this list
 *   gets an error that names the supported ones.
 */
export function renderLauncher(
  product: BinaryProduct,
  platforms: readonly NpmPlatform[],
  { debugEnv = '' }: LauncherOptions = {},
): string {
  const values: Record<string, string> = {
    platformPackages: JSON.stringify(launcherTable(product, platforms)),
    binary: product.binary,
    launcher: product.launcher,
    debugEnv,
  }
  // The template holds each placeholder as a quoted string, `'{{name}}'`, so it
  // stays valid JavaScript. The whole quoted token becomes a JSON string
  // literal, which is also a valid JavaScript string literal.
  return readFileSync(TEMPLATE, 'utf8').replace(/'\{\{(\w+)\}\}'/g, (_, key: string) => {
    const value = values[key]
    if (value === undefined) throw new Error(`launcher template has an unknown placeholder: ${key}`)
    return JSON.stringify(value)
  })
}

/** The launcher's lookup table: platform key to package and binary path. */
function launcherTable(
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
