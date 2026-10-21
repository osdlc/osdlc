/** Ordered, in-memory migrations that bring an older machine file to the current shape. */

/**
 * One step: `run` turns a version-`from` document into a version-`to` one.
 *
 * @experimental
 */
export interface MachineMigration {
  from: number
  to: number
  run(raw: Record<string, unknown>): Record<string, unknown>
}

/** The version of a file with no `version` key. */
export const BASE_MACHINE_VERSION = 1

/**
 * The version the last migration produces; {@link BASE_MACHINE_VERSION} when there are none.
 *
 * @experimental
 */
export function currentMachineVersion(migrations: readonly MachineMigration[]): number {
  return migrations.at(-1)?.to ?? BASE_MACHINE_VERSION
}

/** A document's integer `version`, else {@link BASE_MACHINE_VERSION}. */
export function machineVersionOf(raw: Record<string, unknown>): number {
  const v = raw.version
  return typeof v === 'number' && Number.isInteger(v) ? v : BASE_MACHINE_VERSION
}

/**
 * Run every migration from `raw`'s version on, in order. `applied` lists the
 * version each step produced; when it is non-empty, the returned document
 * carries the final `version`. `raw` is not mutated.
 * @experimental
 */
export function migrateMachineRaw(
  raw: Record<string, unknown>,
  migrations: readonly MachineMigration[],
): { raw: Record<string, unknown>; applied: number[] } {
  let version = machineVersionOf(raw)
  let next = raw
  const applied: number[] = []
  for (const m of migrations) {
    if (m.from !== version) continue
    next = m.run(structuredClone(next))
    version = m.to
    applied.push(m.to)
  }
  if (applied.length > 0) next = { ...next, version }
  return { raw: next, applied }
}
