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
 * developer's real config home. The YAML is read by the same rules as a
 * project file (`parseYamlText` in `./loader.ts`), so the Rust crate reads it
 * the same way.
 */

import { copyFileSync, existsSync, lstatSync, readFileSync, readlinkSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { atomicWrite, etag, WriteConflictError, writeCas } from '@osdlc/etag-write'
import type { z } from 'zod'

import { rewriteMigrated } from './edit.ts'
import { parseYamlText } from './loader.ts'
import {
  configVersionOf,
  currentConfigVersion,
  migrateConfigRaw,
  type ConfigMigration,
  type MigrationWarning,
} from './migrate.ts'
import { stripUnknownKeys } from './unknown-keys.ts'
import { isPlainObject } from './value.ts'
import { envStem, systemDirs, type TieredDirs, type VendorDirs } from './dirs.ts'

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
   * document before validation ({@link defineMigrations} builds them from
   * declarative moves). The schema should declare an optional integer
   * `version`. Default none: every file is version 1.
   */
  migrations?: readonly ConfigMigration[]
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
 * `text` is the file as the migration rewrites it, `null` when no step
 * applied. `rewrite` says how it was made: `edited` when only the values
 * that changed were edited, so every comment outside them is kept;
 * `reserialized` when the change could not be made as edits and the whole
 * document was rendered again, which drops its comments; `null` when no step
 * applied.
 *
 * @experimental
 */
export interface MachineMigrateResult {
  path: string
  from: number
  to: number
  applied: number[]
  written: boolean
  warnings: MigrationWarning[]
  rewrite: 'edited' | 'reserialized' | null
  text: string | null
}

/**
 * Options for {@link MachineConfigFile.write}.
 *
 * @experimental
 */
export interface MachineWriteOptions {
  /**
   * The etag of the file as the caller read it ({@link MachineConfigFile.read}),
   * or `null` when it read no file. The write is then a compare-and-swap: it
   * throws `WriteConflictError` from `@osdlc/etag-write`, and writes nothing,
   * when the file changed since. Leave it out to replace the file whatever is
   * on disk.
   */
  etag?: string | null
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
   * The file's text and its etag, to edit and hand back to {@link write}
   * with `{ etag }`. `null` when there is no file. Throws when it cannot be
   * read.
   */
  read(): { text: string; etag: string } | null
  /**
   * The load issues `raw` would have that the file on disk does not. A
   * problem already in the file does not block an unrelated edit.
   */
  check(raw: Record<string, unknown>): MachineConfigIssue[]
  /**
   * Replace the file with `text` and return its new etag. Throws, writing
   * nothing, when `text` is not a YAML mapping or {@link check} finds a new
   * issue, and, given `etag`, when the file changed since it was read. Copies
   * the old file to `<path>.bak`, writes atomically and clears the cache.
   * When {@link path} is a symlink, the write and the `.bak` go to the file
   * it points to, and the link is left in place.
   * Given `etag`, the copy is made only once the swap went through, so a
   * conflict leaves the old `.bak` as it was.
   */
  write(text: string, opts?: MachineWriteOptions): string
  /**
   * Run the migrations on the file and write the result when any applied,
   * unless `dryRun`. Only the values that changed are edited, so the file's
   * comments are kept (`rewrite: 'edited'`); when that cannot be done, the
   * document is rendered again (`rewrite: 'reserialized'`) and the `.bak`
   * keeps the comments. The write is a compare-and-swap against the text the
   * migration read: an edit saved in between makes it throw
   * `WriteConflictError` and write nothing. Throws when the file cannot be
   * read or parsed.
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
  const currentVersion = currentConfigVersion(migrations)
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
      raw = parseYamlText(text)
    } catch (err) {
      return fail('yaml', err)
    }
    if (raw === null || raw === undefined) raw = {}
    if (!isPlainObject(raw)) {
      const message = 'the document is not a mapping; using defaults'
      return { value: defaults(), issues: [{ path: [], code: 'not_mapping', message }] }
    }
    const version = configVersionOf(raw)
    if (version > currentVersion) {
      const result = salvage(schema, raw)
      const message = `version ${version} is newer than this tool's ${currentVersion}; read as-is`
      result.issues.unshift({ path: ['version'], code: 'newer_version', message })
      return result
    }
    return salvage(schema, migrateConfigRaw(raw, migrations).raw)
  }

  const loadWithIssues = (): MachineConfigLoad<z.output<S>> => {
    const file = path()
    if (cache !== null && cache.path === file) return cache.result
    const result = loadUncached(file)
    cache = { path: file, result }
    return result
  }

  const issuesOf = (raw: Record<string, unknown>): MachineConfigIssue[] =>
    salvage(schema, migrateConfigRaw(raw, migrations).raw).issues

  const issueKey = (i: MachineConfigIssue): string => `${i.code}:${i.path.join('.')}`

  const check = (raw: Record<string, unknown>): MachineConfigIssue[] => {
    const file = path()
    let current: unknown = {}
    try {
      current = existsSync(file) ? (parseYamlText(readFileSync(file, 'utf-8')) ?? {}) : {}
    } catch {
      // An unparseable file has no issue a replacement could keep.
    }
    const known = new Set(isPlainObject(current) ? issuesOf(current).map(issueKey) : [])
    return issuesOf(raw).filter((i) => !known.has(issueKey(i)))
  }

  const read = (): { text: string; etag: string } | null => {
    const bytes = readOrNull(path())
    if (bytes === null) return null
    // The etag is of the bytes, so text that does not round-trip through UTF-8 still matches.
    return { text: bytes.toString('utf-8'), etag: etag(bytes) }
  }

  const write = (text: string, o: MachineWriteOptions = {}): string => {
    const file = path()
    const raw: unknown = parseYamlText(text) ?? {}
    if (!isPlainObject(raw)) throw new Error(`${file}: the document is not a mapping`)
    const added = check(raw)
    if (added.length > 0) {
      const lines = added.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      throw new Error(`refusing to write ${file}:\n  ${lines.join('\n  ')}`)
    }
    // A rename would replace a symlink with a regular file, so write to the file it points to.
    const target = followLinks(file)
    if (o.etag === undefined) {
      if (existsSync(target)) copyFileSync(target, `${target}.bak`)
      cache = null
      atomicWrite(target, text)
      return etag(text)
    }
    // The backup is taken only once the swap went through, so a conflict, however late it
    // lands, leaves the old `.bak` alone. It is made from these bytes: they match the etag
    // `writeCas` checked, so they are what the swap replaced.
    const before = readOrNull(target)
    if (before !== null && etag(before) !== o.etag) {
      throw new WriteConflictError(file, o.etag === null ? 'exists-without-etag' : 'changed')
    }
    cache = null
    const next = writeCas(target, text, o.etag)
    if (before !== null) {
      atomicWrite(`${target}.bak`, before, { mode: statSync(target).mode & 0o777 })
    }
    return next
  }

  const migrate = (o: { dryRun?: boolean } = {}): MachineMigrateResult => {
    const file = path()
    const current = read()
    if (current === null) {
      return {
        path: file,
        from: currentVersion,
        to: currentVersion,
        applied: [],
        written: false,
        warnings: [],
        rewrite: null,
        text: null,
      }
    }
    const raw: unknown = parseYamlText(current.text) ?? {}
    if (!isPlainObject(raw)) throw new Error(`${file}: the document is not a mapping`)
    const from = configVersionOf(raw)
    const migrated = migrateConfigRaw(raw, migrations)
    const to = configVersionOf(migrated.raw)
    const base = { path: file, from, to, applied: migrated.applied, warnings: migrated.warnings }
    if (migrated.applied.length === 0) {
      return { ...base, written: false, rewrite: null, text: null }
    }
    const next = rewriteMigrated(current.text, migrated.raw)
    const written = o.dryRun !== true
    if (written) write(next.text, { etag: current.etag })
    return { ...base, written, rewrite: next.rewrite, text: next.text }
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
    read,
    check,
    write,
    migrate,
  }
}

/**
 * The file a symlink at `file` points to, through every link in the chain; `file` itself when it
 * is not a link. A link to a missing file gives that file's path, so the write creates it.
 */
function followLinks(file: string): string {
  let at = file
  // The kernel's own limit on a chain of links; a loop past it fails in the write.
  for (let hops = 0; hops < 40; hops++) {
    try {
      if (!lstatSync(at).isSymbolicLink()) return at
    } catch {
      return at
    }
    at = resolve(dirname(at), readlinkSync(at))
  }
  return at
}

/** The file's bytes, or `null` when it does not exist. Any other read error is thrown. */
function readOrNull(file: string): Buffer | null {
  try {
    return readFileSync(file)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
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
