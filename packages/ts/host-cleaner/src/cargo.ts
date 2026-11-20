/**
 * The `cargo` plugin: Rust `target/` directories nobody is building into, and
 * `target/*\/incremental` directories left by a checkout that has incremental
 * builds off.
 *
 * Detected when `cargo` runs or a swept checkout has a `Cargo.toml`. A
 * `target/` counts only with a `CACHEDIR.TAG`, the marker cargo writes. Its
 * idle time is the age of the newest file under `target/*\/.fingerprint/`.
 * Settings: `plugins.cargo.idleHours` (default 24).
 */

import { existsSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

import {
  artifactPlugin,
  artifactRow,
  checkoutsOf,
  holdersIn,
  idleHoursSince,
  inside,
  newestMtime,
  present,
  refusedRow,
  type ArtifactOptions,
  type Checkout,
  type Env,
  type Row,
} from './artifacts.ts'
import type { Plugin } from './types.ts'

export const CARGO_PLUGIN = 'cargo'

const BUILDERS = /^(cargo|rustc)$/

/** Whether `cargo` runs on this machine. */
function cargoOnPath(env: Env): boolean {
  try {
    return (
      env.command('cargo').run(['--version'], { cwd: env.targets[0] ?? process.cwd() }).exitCode ===
      0
    )
  } catch {
    return false
  }
}

/**
 * Whether incremental builds are off for `checkout`: `CARGO_BUILD_INCREMENTAL`
 * wins, as it does in cargo, then `cargo config get build.incremental`. An
 * answer that cannot be read counts as on, so no row is made.
 */
export function incrementalOff(env: Env, checkout: string): boolean {
  const setting = process.env.CARGO_BUILD_INCREMENTAL?.trim().toLowerCase()
  if (setting === 'false' || setting === '0') return true
  if (setting === 'true' || setting === '1') return false
  try {
    const out = env.command('cargo').run(['config', 'get', 'build.incremental'], { cwd: checkout })
    return out.exitCode === 0 && /=\s*false\s*$/m.test(out.stdout)
  } catch {
    return false
  }
}

const subdirs = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(dir, e.name))

/** The profile directories: `target/<profile>` and, for `--target`, `target/<triple>/<profile>`. */
const profileDirs = (target: string): string[] =>
  subdirs(target).flatMap((d) =>
    existsSync(join(d, '.fingerprint'))
      ? [d]
      : subdirs(d).filter((p) => existsSync(join(p, '.fingerprint'))),
  )

function rowsFor(env: Env, checkout: Checkout): Row[] {
  try {
    return rowsOrThrow(env, checkout)
  } catch {
    // A directory that cannot be read may hide a build in progress: no row.
    return []
  }
}

function rowsOrThrow(env: Env, checkout: Checkout): Row[] {
  const threshold = env.idleHours
  const target = join(checkout.path, 'target')
  if (!present(target)) return []
  const safeTarget = inside(checkout.path, 'target')
  if (safeTarget === null) return [refusedRow(CARGO_PLUGIN, 'cargo-target', target, checkout.path)]
  if (!existsSync(join(safeTarget, 'CACHEDIR.TAG'))) return []

  const held = holdersIn(env, checkout.path, (all) => all.filter((h) => BUILDERS.test(h.command)))
  const now = env.now()
  const profiles = profileDirs(safeTarget)
  const prints = profiles.flatMap((p) => {
    const m = newestMtime(join(p, '.fingerprint'))
    return m === null ? [] : [m]
  })
  const newest = prints.length > 0 ? Math.max(...prints) : null
  const idle = newest !== null && idleHoursSince(newest, now) >= threshold

  const rows: Row[] = []
  if (idle) {
    rows.push(
      artifactRow(
        CARGO_PLUGIN,
        {
          kind: 'cargo-target',
          path: safeTarget,
          checkout: checkout.path,
          newestMtimeMs: newest,
          idle: true,
          why: `no build for ${idleHoursSince(newest, now)} hours (threshold ${threshold})`,
          held,
        },
        now,
      ),
    )
  }
  // An idle target/ takes its incremental directories with it.
  if (!idle && incrementalOff(env, checkout.path)) {
    for (const profile of profiles) {
      const dir = inside(checkout.path, relative(checkout.path, join(profile, 'incremental')))
      if (dir === null) {
        rows.push(
          refusedRow(
            CARGO_PLUGIN,
            'cargo-incremental',
            join(profile, 'incremental'),
            checkout.path,
          ),
        )
        continue
      }
      if (!present(dir)) continue
      const mtime = newestMtime(dir)
      rows.push(
        artifactRow(
          CARGO_PLUGIN,
          {
            kind: 'cargo-incremental',
            path: dir,
            checkout: checkout.path,
            newestMtimeMs: mtime,
            idle: mtime !== null && idleHoursSince(mtime, now) >= threshold,
            why: 'incremental builds are off for this checkout',
            held,
          },
          now,
        ),
      )
    }
  }
  return rows
}

/** Idle `target/` directories, and `incremental` directories where incremental builds are off. Settings: `idleHours`. */
export function cargoPlugin(opts: ArtifactOptions = {}): Plugin {
  return artifactPlugin(
    CARGO_PLUGIN,
    opts,
    (env) =>
      cargoOnPath(env) || checkoutsOf(env).some((c) => existsSync(join(c.path, 'Cargo.toml'))),
    rowsFor,
  )
}
