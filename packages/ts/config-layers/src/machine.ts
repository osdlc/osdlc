/**
 * The machine config file. It holds values that describe this machine, not a
 * project.
 *
 * The project file is committed, so it is the wrong place for a path like
 * `~/Developer` that only means something on one laptop. The machine file
 * lives in the tool's standalone config home (`<config>/<tool>/config.yaml`).
 * It is never committed and holds only machine-specific keys.
 *
 * The Zod schema defines the file, and every key has a default. The loader
 * never throws. `loadWithIssues()` reports what it dropped. The result is
 * memoised per path. The path is computed on each call, so a test or a one-off
 * run can move the file with an environment variable and not write into the
 * developer's real config home.
 */

import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { atomicWrite } from '@osdlc/etag-write'
import { parse as yamlParse, stringify as yamlStringify } from 'yaml'
import type { z } from 'zod'

import {
  currentMachineVersion,
  machineVersionOf,
  migrateMachineRaw,
  type MachineMigration,
} from './machine-migrate.ts'
import { stripUnknownKeys } from './unknown-keys.ts'
import { isPlainObject } from './value.ts'
import { systemDirs, type TieredDirs, type VendorDirs } from './dirs.ts'

/**
 * `tooly` → `TOOLY`; `pr-updater` → `PR_UPDATER`. The stem the tool's override variables are built from.
 *
 * @experimental
 */
export function envStem(tool: string): string {
  return tool.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
}

/**
 * Options for describing a tool's machine file: the tool name, its schema, and where it lives.
 * @experimental
 */
export interface MachineConfigFileOptions<S extends z.ZodTypeAny> {
  /** The tool's standalone name: the directory segment under the config home. */
  tool: string
  /**
   * Every key with a default; the loader parses `{}` to get the defaults.
   * Unknown keys are reported only when every object in it is `.strict()`.
   */
  schema: S
  /** Env var that relocates the file. Default `<STEM>_MACHINE_CONFIG`. */
  env?: string
  /** The file's name inside the tool's config dir. Default `config.yaml`. */
  fileName?: string
  /** Whose config home the file lives in: the vendor and its override variables. */
  vendorDirs: VendorDirs
  /** Resolve the directories per call instead: tests inject a rooted one. */
  dirs?: () => TieredDirs
  /**
   * Ordered steps from older file versions to the current one, run on the raw
   * document before validation. The schema should declare an optional
   * integer `version`. Default none: every file is version 1.
   */
  migrations?: readonly MachineMigration[]
}

/**
 * The codes a machine file load can report an issue under.
 * @experimental
 */
export const MACHINE_CONFIG_ISSUE_CODES = [
  'unknown_key',
  'invalid',
  'unreadable',
  'yaml',
  'not_mapping',
  'newer_version',
] as const

/**
 * One thing the loader dropped. `path` is the key path inside the file; `[]` for the whole file.
 *
 * @experimental
 */
export interface MachineConfigIssue {
  path: string[]
  code: (typeof MACHINE_CONFIG_ISSUE_CODES)[number]
  message: string
}

/**
 * The result of loading a machine file: the value and any issues found.
 * @experimental
 */
export interface MachineConfigLoad<T> {
  value: T
  issues: MachineConfigIssue[]
}

/**
 * What {@link MachineConfigFile.migrate} did. `applied` lists the version each step produced.
 *
 * @experimental
 */
export interface MachineMigrateResult {
  path: string
  from: number
  to: number
  applied: number[]
  written: boolean
}

/**
 * A handle on a tool's machine file: its path, load, write and migrate.
 * @experimental
 */
export interface MachineConfigFile<S extends z.ZodTypeAny> {
  readonly tool: string
  readonly schema: S
  /** The env var that relocates the file (tests, one-off runs). */
  readonly env: string
  /** `<config-home>/<tool>/<fileName>` (default `config.yaml`), unless {@link env} says otherwise. */
  path(): string
  /**
   * The file, all defaults filled. An unknown key is dropped; an invalid
   * section takes its default. A missing or unreadable file, a YAML error and
   * a non-mapping document give the defaults. Never throws. Memoised per
   * path, so a run that swaps {@link env} is read fresh.
   */
  load(): z.output<S>
  /** {@link load}'s value plus one issue per thing it dropped. Shares its cache. */
  loadWithIssues(): MachineConfigLoad<z.output<S>>
  /** Drop the memoised value. Call from tests between runs. */
  clearCache(): void
  /** The version the last migration produces; 1 when there are none. */
  readonly currentVersion: number
  /**
   * The load issues `raw` would have that the file on disk does not. A
   * problem already in the file does not block an unrelated edit.
   */
  check(raw: Record<string, unknown>): MachineConfigIssue[]
  /**
   * Replace the file with `text`. Throws, writing nothing, when `text` is not
   * a YAML mapping or {@link check} finds a new issue. Copies the old file to
   * `<path>.bak`, writes atomically and clears the cache.
   */
  write(text: string): void
  /**
   * Run the migrations on the file and write the result when any applied,
   * unless `dryRun`. The rewrite drops the file's comments; the `.bak` keeps
   * them. Throws when the file cannot be read or parsed.
   */
  migrate(opts?: { dryRun?: boolean }): MachineMigrateResult
}

/**
 * Describe a tool's machine file and return a handle that finds, loads, writes and migrates it.
 * @experimental
 */
export function machineConfigFile<S extends z.ZodTypeAny>(
  opts: MachineConfigFileOptions<S>,
): MachineConfigFile<S> {
  const { tool, schema } = opts
  const env = opts.env ?? `${envStem(tool)}_MACHINE_CONFIG`
  const fileName = opts.fileName ?? 'config.yaml'
  const dirs = opts.dirs ?? (() => systemDirs(opts.vendorDirs))
  const migrations = opts.migrations ?? []
  const currentVersion = currentMachineVersion(migrations)
  let cache: { path: string; result: MachineConfigLoad<z.output<S>> } | null = null

  const path = (): string => {
    const override = process.env[env]
    if (override !== undefined && override.trim() !== '') return override
    return join(dirs().standalone(tool).config().path, fileName)
  }

  const loadUncached = (file: string): MachineConfigLoad<z.output<S>> => {
    const defaults = (): z.output<S> => schema.parse({}) as z.output<S>
    if (!existsSync(file)) return { value: defaults(), issues: [] }
    const fail = (code: MachineConfigIssue['code'], err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      return { value: defaults(), issues: [{ path: [], code, message }] }
    }
    let text: string
    try {
      text = readFileSync(file, 'utf-8')
    } catch (err) {
      return fail('unreadable', err)
    }
    let raw: unknown
    try {
      raw = yamlParse(text)
    } catch (err) {
      return fail('yaml', err)
    }
    if (raw === null || raw === undefined) raw = {}
    if (!isPlainObject(raw)) {
      const message = 'the document is not a mapping; using defaults'
      return { value: defaults(), issues: [{ path: [], code: 'not_mapping', message }] }
    }
    const version = machineVersionOf(raw)
    if (version > currentVersion) {
      const result = salvage(schema, raw)
      const message = `version ${version} is newer than this tool's ${currentVersion}; read as-is`
      result.issues.unshift({ path: ['version'], code: 'newer_version', message })
      return result
    }
    return salvage(schema, migrateMachineRaw(raw, migrations).raw)
  }

  const loadWithIssues = (): MachineConfigLoad<z.output<S>> => {
    const file = path()
    if (cache !== null && cache.path === file) return cache.result
    const result = loadUncached(file)
    cache = { path: file, result }
    return result
  }

  const issuesOf = (raw: Record<string, unknown>): MachineConfigIssue[] =>
    salvage(schema, migrateMachineRaw(raw, migrations).raw).issues

  const issueKey = (i: MachineConfigIssue): string => `${i.code}:${i.path.join('.')}`

  const check = (raw: Record<string, unknown>): MachineConfigIssue[] => {
    const file = path()
    let current: unknown = {}
    try {
      current = existsSync(file) ? (yamlParse(readFileSync(file, 'utf-8')) ?? {}) : {}
    } catch {
      // An unparseable file has no issue a replacement could keep.
    }
    const known = new Set(isPlainObject(current) ? issuesOf(current).map(issueKey) : [])
    return issuesOf(raw).filter((i) => !known.has(issueKey(i)))
  }

  const write = (text: string): void => {
    const file = path()
    const raw: unknown = yamlParse(text) ?? {}
    if (!isPlainObject(raw)) throw new Error(`${file}: the document is not a mapping`)
    const added = check(raw)
    if (added.length > 0) {
      const lines = added.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      throw new Error(`refusing to write ${file}:\n  ${lines.join('\n  ')}`)
    }
    if (existsSync(file)) copyFileSync(file, `${file}.bak`)
    atomicWrite(file, text)
    cache = null
  }

  const migrate = (o: { dryRun?: boolean } = {}): MachineMigrateResult => {
    const file = path()
    if (!existsSync(file)) {
      return { path: file, from: currentVersion, to: currentVersion, applied: [], written: false }
    }
    const raw: unknown = yamlParse(readFileSync(file, 'utf-8')) ?? {}
    if (!isPlainObject(raw)) throw new Error(`${file}: the document is not a mapping`)
    const from = machineVersionOf(raw)
    const migrated = migrateMachineRaw(raw, migrations)
    const to = machineVersionOf(migrated.raw)
    const written = migrated.applied.length > 0 && o.dryRun !== true
    if (written) write(yamlStringify(migrated.raw))
    return { path: file, from, to, applied: migrated.applied, written }
  }

  return {
    tool,
    schema,
    env,
    path,
    load: () => loadWithIssues().value,
    loadWithIssues,
    clearCache() {
      cache = null
    },
    currentVersion,
    check,
    write,
    migrate,
  }
}

/**
 * Parse `raw`, dropping what fails: first every unknown key, then the
 * top-level section of each remaining issue. Full defaults only if that still
 * fails.
 */
function salvage<S extends z.ZodTypeAny>(
  schema: S,
  raw: Record<string, unknown>,
): MachineConfigLoad<z.output<S>> {
  const first = schema.safeParse(raw)
  if (first.success) return { value: first.data as z.output<S>, issues: [] }

  const stripped = stripUnknownKeys(schema, raw)
  const { unknown } = stripped
  // The deletes below must not reach the caller's object, which is what
  // stripUnknownKeys hands back when it found no unknown key.
  const draft = stripped.value === raw ? { ...raw } : stripped.value
  const issues: MachineConfigIssue[] = unknown.map((path) => ({
    path,
    code: 'unknown_key',
    message: 'unknown key; ignored',
  }))

  const second = schema.safeParse(draft)
  if (second.success) return { value: second.data as z.output<S>, issues }

  for (const issue of second.error.issues) {
    const path = issue.path.map(String)
    const top = path[0]
    if (top !== undefined) delete draft[top]
    const fallback = top === undefined ? 'using defaults' : `using the default for '${top}'`
    issues.push({ path, code: 'invalid', message: `${issue.message}; ${fallback}` })
  }

  const third = schema.safeParse(draft)
  if (third.success) return { value: third.data as z.output<S>, issues }
  issues.push({
    path: [],
    code: 'invalid',
    message: 'the file could not be salvaged; using defaults',
  })
  return { value: schema.parse({}) as z.output<S>, issues }
}
