/**
 * The machine file's names for the migration driver in `./migrate.ts`, kept
 * from before the project file could be versioned too.
 */

import { currentConfigVersion, migrateConfigRaw, type ConfigMigration } from './migrate.ts'

/**
 * One step: `run` turns a version-`from` document into a version-`to` one.
 *
 * @deprecated Use {@link ConfigMigration}; this is the same type.
 * @experimental
 */
export type MachineMigration = ConfigMigration

/**
 * The version the last migration produces; 1 when there are none.
 *
 * @deprecated Use {@link currentConfigVersion}; this is the same function.
 * @experimental
 */
export const currentMachineVersion: typeof currentConfigVersion = currentConfigVersion

/**
 * Run every migration from `raw`'s version on, in order.
 *
 * @deprecated Use {@link migrateConfigRaw}; this is the same function.
 * @experimental
 */
export const migrateMachineRaw: typeof migrateConfigRaw = migrateConfigRaw
