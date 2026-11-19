/**
 * The `cargo` adapter: Rust `target/` directories nobody is building into, and
 * `target/*\/incremental` directories left by a checkout that has incremental
 * builds off.
 *
 * Detected when `cargo` runs or a swept checkout has a `Cargo.toml`. A
 * `target/` counts only with a `CACHEDIR.TAG`, the marker cargo writes. Its
 * idle time is the age of the newest file under `target/*\/.fingerprint/`.
 * Settings: `config.adapters.cargo.idleHours` (default 24).
 */

import { existsSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

import type { HostAdapter, HostContext, HostRow } from './adapter.ts'
import {
  artifactRow,
  checkoutsOf,
  holdersIn,
  idleHoursSetting,
  idleHoursSince,
  inside,
  newestMtime,
  present,
  refusedRow,
  removeArtifact,
  type Checkout,
} from './artifacts.ts'

export const CARGO_ADAPTER = 'cargo'

const BUILDERS = /^(cargo|rustc)$/

/** Whether `cargo` runs on this machine. */
function cargoOnPath(ctx: HostContext): boolean {
  try {
    return (
      ctx.command('cargo').run(['--version'], { cwd: ctx.targets[0] ?? process.cwd() }).exitCode ===
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
export function incrementalOff(ctx: HostContext, checkout: string): boolean {
  const env = process.env.CARGO_BUILD_INCREMENTAL?.trim().toLowerCase()
  if (env === 'false' || env === '0') return true
  if (env === 'true' || env === '1') return false
  try {
    const out = ctx.command('cargo').run(['config', 'get', 'build.incremental'], { cwd: checkout })
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

function rowsFor(ctx: HostContext, checkout: Checkout, threshold: number): HostRow[] {
  try {
    return rowsOrThrow(ctx, checkout, threshold)
  } catch {
    // A directory that cannot be read may hide a build in progress: no row.
    return []
  }
}

function rowsOrThrow(ctx: HostContext, checkout: Checkout, threshold: number): HostRow[] {
  const target = join(checkout.path, 'target')
  if (!present(target)) return []
  const safeTarget = inside(checkout.path, 'target')
  if (safeTarget === null) return [refusedRow(CARGO_ADAPTER, 'cargo-target', target, checkout.path)]
  if (!existsSync(join(safeTarget, 'CACHEDIR.TAG'))) return []

  const held = holdersIn(ctx, checkout.path, (all) => all.filter((h) => BUILDERS.test(h.command)))
  const now = ctx.now()
  const profiles = profileDirs(safeTarget)
  const prints = profiles.flatMap((p) => {
    const m = newestMtime(join(p, '.fingerprint'))
    return m === null ? [] : [m]
  })
  const newest = prints.length > 0 ? Math.max(...prints) : null
  const idle = newest !== null && idleHoursSince(newest, now) >= threshold

  const rows: HostRow[] = []
  if (idle) {
    rows.push(
      artifactRow(
        CARGO_ADAPTER,
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
  if (!idle && incrementalOff(ctx, checkout.path)) {
    for (const profile of profiles) {
      const dir = inside(checkout.path, relative(checkout.path, join(profile, 'incremental')))
      if (dir === null) {
        rows.push(
          refusedRow(
            CARGO_ADAPTER,
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
          CARGO_ADAPTER,
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

const rowsIn = (ctx: HostContext, c: Checkout): HostRow[] =>
  rowsFor(ctx, c, idleHoursSetting(ctx, CARGO_ADAPTER))

export const cargoAdapter: HostAdapter = {
  name: CARGO_ADAPTER,
  detect: (ctx) =>
    cargoOnPath(ctx) || checkoutsOf(ctx).some((c) => existsSync(join(c.path, 'Cargo.toml'))),
  gather: (ctx) => checkoutsOf(ctx).flatMap((c) => rowsIn(ctx, c)),
  execute: (step, ctx) => removeArtifact(rowsIn, step, ctx),
}
