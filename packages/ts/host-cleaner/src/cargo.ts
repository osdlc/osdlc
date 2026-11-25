/**
 * The `cargo` plugin: Rust `target/` directories nobody is building into, and
 * `target/*\/incremental` directories left by a checkout that has incremental
 * builds off.
 *
 * Detected when `cargo` is on PATH or a swept checkout has a `Cargo.toml`. A
 * `target/` counts only with a `CACHEDIR.TAG`, the marker cargo writes. Its
 * idle time is the age of the newest file under `target/*\/.fingerprint/`.
 * Settings: `plugins.cargo.idleHours` (default {@link DEFAULT_IDLE_HOURS}).
 */

import { existsSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

import { z } from 'zod'

import {
  artifactPlugin,
  artifactRow,
  checkoutsOf,
  hoursText,
  inside,
  refusedRow,
  type ArtifactOptions,
  type Checkout,
  type Env,
  type Row,
} from './artifacts.ts'
import { idleHoursSetting, present, type Idle, type Kit } from './kit.ts'
import { PLUGIN_API, definePlugin, type Plugin } from './types.ts'

export const CARGO_PLUGIN = 'cargo'

/**
 * Whether incremental builds are off for `checkout`: `CARGO_INCREMENTAL`, then
 * `CARGO_BUILD_INCREMENTAL`, then `cargo config get build.incremental`, in cargo's
 * own order. Stable cargo refuses `config get`, so that step answers only on
 * nightly. An answer that cannot be read counts as on, so no row is made.
 */
export async function incrementalOff(env: Env, checkout: string): Promise<boolean> {
  const setting = (process.env.CARGO_INCREMENTAL ?? process.env.CARGO_BUILD_INCREMENTAL)
    ?.trim()
    .toLowerCase()
  if (setting === 'false' || setting === '0') return true
  if (setting === 'true' || setting === '1') return false
  try {
    const out = await env.kit.run(['cargo', 'config', 'get', 'build.incremental'], {
      cwd: checkout,
      signal: env.ctx.signal,
    })
    return out.ok && /=\s*false\s*$/m.test(out.stdout)
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

/** The idle time of the newest of `dirs`; unmeasured when any one is. */
function newestOf(env: Env, dirs: readonly string[]): Idle {
  let newest: Extract<Idle, { unmeasured: false }> = {
    unmeasured: false,
    newestMs: null,
    hours: null,
  }
  for (const dir of dirs) {
    const one = env.kit.idle(dir)
    if (one.unmeasured) return one
    if (one.newestMs !== null && (newest.newestMs === null || one.newestMs > newest.newestMs)) {
      newest = one
    }
  }
  return newest
}

async function rowsOrThrow(env: Env, checkout: Checkout): Promise<Row[]> {
  const { kit, idleHours: threshold } = env
  const target = join(checkout.path, 'target')
  if (!present(target)) return []
  const safeTarget = inside(checkout.path, 'target')
  if (safeTarget === null) return [refusedRow(kit, 'cargo-target', target, checkout.path)]
  if (!existsSync(join(safeTarget, 'CACHEDIR.TAG'))) return []

  const held = kit.running({ in: checkout.path }, env.ctx)
  const profiles = profileDirs(safeTarget)
  const last = newestOf(
    env,
    profiles.map((p) => join(p, '.fingerprint')),
  )
  const facts = { kind: 'cargo-target' as const, path: safeTarget, checkout: checkout.path, held }
  if (last.unmeasured) {
    return [
      artifactRow(kit, {
        ...facts,
        idle: false,
        unmeasured: true,
        why: 'its last build could not be dated in the time budget',
      }),
    ]
  }
  if (last.hours !== null && last.hours >= threshold) {
    // An idle target/ takes its incremental directories with it.
    return [
      artifactRow(kit, {
        ...facts,
        idle: true,
        why: `no build for ${hoursText(last.hours)} hours (threshold ${threshold})`,
      }),
    ]
  }
  if (!(await incrementalOff(env, checkout.path))) return []
  const rows: Row[] = []
  for (const profile of profiles) {
    const dir = inside(checkout.path, relative(checkout.path, join(profile, 'incremental')))
    if (dir === null) {
      rows.push(refusedRow(kit, 'cargo-incremental', join(profile, 'incremental'), checkout.path))
      continue
    }
    if (!present(dir)) continue
    const since = kit.idle(dir)
    rows.push(
      artifactRow(kit, {
        kind: 'cargo-incremental',
        path: dir,
        checkout: checkout.path,
        idle: !since.unmeasured && since.hours !== null && since.hours >= threshold,
        ...(since.unmeasured ? { unmeasured: true } : {}),
        why: 'incremental builds are off for this checkout',
        held,
      }),
    )
  }
  return rows
}

/** The `cargo` plugin on `kit`, or on a kit built from `opts`. Idle `target/` directories, and `incremental` directories where incremental builds are off. Settings: `idleHours`. */
export function cargoPlugin(opts: ArtifactOptions = {}, kit?: Kit): Plugin {
  return artifactPlugin(
    CARGO_PLUGIN,
    opts,
    (env) =>
      env.kit.onPath('cargo') ||
      checkoutsOf(env).some((c) => existsSync(join(c.path, 'Cargo.toml'))),
    rowsOrThrow,
    kit,
  )
}

/** The `cargo` plugin as the command line builds it. */
export const cargoDefinition = definePlugin({
  name: CARGO_PLUGIN,
  api: PLUGIN_API,
  settings: z.strictObject({ idleHours: idleHoursSetting }),
  create: ({ settings, kit }) => cargoPlugin({ idleHours: settings.idleHours }, kit),
})
