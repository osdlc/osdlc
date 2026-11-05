/**
 * The layered config loader. {@link assembleConfig} builds a config handle from
 * a list of sections. The handle reads the project file and its overlay,
 * deep-merges the overlay over the file before validation, validates once, and
 * memoizes the result.
 *
 * A tool mounts the sections it needs. `unknownTopLevel` says what happens to a
 * top-level key that no mounted section owns:
 *
 *   - `'warn'` (a host that mounts every section): an unknown key at any depth
 *     is removed from the parsed copy and reported ({@link UnknownKeyUse}, and
 *     one stderr line per file and key per handle). A newer tool's key then
 *     does not break an older tool that reads the same file. The file on disk
 *     is never rewritten. Objects named in `strictAt` still fail on an unknown
 *     key. These are matchers, where a dropped key widens the match.
 *   - `'reject'`: an unknown top-level key fails the file.
 *   - `'ignore'` (a standalone tool that mounts a few): the key is dropped
 *     unparsed, however malformed its contents, with no warning. The tool runs
 *     on a file the host would reject.
 *
 * In every mode these are errors ({@link ConfigInvalidError}, exit
 * {@link CONFIG_INVALID_EXIT}): a mounted section that is present but invalid,
 * and a file that is unreadable, not YAML or not a mapping. Under `'reject'`
 * and `'ignore'`, a key nested inside a mounted section that the section does
 * not define is also an error, given that the section is `.strict()` at every
 * level. Only `'warn'` drops it. A file that does not exist is not an error.
 * With neither file present the result is the all-defaults object.
 *
 * With `migrations`, each file is versioned: its top-level `version` is read
 * and the steps from that version on run on the file's raw mapping, in
 * memory, before anything else looks at it. The project file and its overlay
 * each carry their own version. `version` is then not a section key, so it is
 * never an unknown key. Loading never writes; {@link ConfigHandle.migrate}
 * rewrites the files on request.
 *
 * Only {@link resolveConfigFile} decides where the files are. The memo is keyed
 * by the resolved project file, so two files never share an entry. Each entry
 * records the stat signature of both files, so a long-running host sees an edit
 * at its next call.
 */

import { readFileSync, statSync } from 'node:fs'
import { basename, resolve } from 'node:path'

import { etag, writeCas } from '@osdlc/etag-write'

import { isAlias, isMap, isScalar, isSeq, parseDocument, visit } from 'yaml'
import { z } from 'zod'

import { ConfigInvalidError, type ConfigIssue } from './config-error.ts'
import { deprecatedKeysSet, deprecationMessage } from './deprecation.ts'
import { rewriteMigrated } from './edit.ts'
import {
  configVersionOf,
  currentConfigVersion,
  migrateConfigRaw,
  type ConfigMigration,
  type MigrationWarning,
} from './migrate.ts'

/**
 * Whether a loaded handle re-reads its files when their stat signature
 * changes, so a long-running host sees an edit at its next call. `loadLayers`
 * reads this flag to decide. With it off, a cached entry is returned until the
 * cache is cleared. A host can show it, for example to label a key `live` or
 * `restart needed`.
 * @experimental
 */
export const RELOADS_ON_CHANGE = true
import { deepMergeConfig } from './merge.ts'
import {
  resolveConfigFile,
  type ConfigFileSpec,
  type ResolveConfigFileOptions,
  type ResolvedConfigFile,
} from './resolve-file.ts'
import { layerCheckIssues, type ConfigSection } from './section.ts'
import { pathMatcher, stripUnknownKeys } from './unknown-keys.ts'

/**
 * What {@link readParsedFile} found.
 *
 * @experimental
 */
export type ParsedFileRead =
  | { kind: 'absent'; path: string }
  | { kind: 'unreadable'; path: string; message: string }
  | { kind: 'unparsable'; path: string; message: string }
  | { kind: 'ok'; path: string; value: unknown }

/**
 * Parse YAML text the way the Rust crate `config-layers` reads a file:
 *
 * - only `true` and `false` are booleans (`yes` and `on` are strings);
 * - a scalar key such as `1` is the string `"1"`, and an alias to a scalar is that
 *   scalar; a collection key or a null key (also an empty one) is an error;
 * - `.inf`, `-.inf`, `.nan` and a number that overflows, such as `1e999`, read
 *   as their source text, a string, because JSON cannot hold them;
 * - a tag on a string or an integer (`!!str 5`, `!!int "7"`) is dropped and its value kept, with no
 *   process warning (`!!float` and unknown tags differ from the crate, below);
 * - `<<` is an ordinary key, not a merge;
 * - a duplicate key is an error.
 *
 * Where TypeScript differs from the crate: an integer beyond 2^53 reads as a
 * lossy number, `1e999` reads as `1e999` (the crate reads `.inf`), `!!float 1`
 * and an unknown tag read as text (the crate reads a number), and an empty
 * document is `null` here ({@link readMappingFile} turns it into `{}`, which is
 * what the crate's `read_mapping` gives).
 *
 * The one YAML reader: the machine file (`./machine.ts`) reads through it too.
 * Internal, not in the package index.
 */
export function parseYamlText(text: string): unknown {
  const doc = parseDocument(text, { logLevel: 'error' })
  const first = doc.errors[0]
  if (first) throw first
  visit(doc, {
    Pair(_, pair) {
      const key = isAlias(pair.key) ? pair.key.resolve(doc) : pair.key
      if (isSeq(key) || isMap(key)) {
        throw new Error('a mapping key must be a scalar, not a list or a mapping')
      }
      if (isScalar(key) && (key.value === null || key.value === undefined)) {
        throw new Error('a mapping key must not be null')
      }
    },
    Scalar(_, node) {
      if (typeof node.value === 'number' && !Number.isFinite(node.value)) {
        node.value = node.source ?? String(node.value)
      }
    },
  })
  return doc.toJS()
}

/**
 * Read and parse one config file. It does not check the shape of the value.
 * The result is absent (the normal case, never an error), unreadable,
 * unparsable, or a parsed value of any type. The tool decides what a value
 * that is not a mapping means and how to word each failure.
 * {@link readMappingFile} is the mapping-only layer over this. Every project
 * file read goes through this function; the machine file reads its text with
 * the same parser.
 *
 * YAML text is read as the README's "The Rust crate" section describes.
 * @experimental
 */
export function readParsedFile(path: string, format: 'yaml' | 'json' = 'yaml'): ParsedFileRead {
  let text: string
  try {
    text = readFileSync(path, 'utf-8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'absent', path }
    return { kind: 'unreadable', path, message: (e as Error).message }
  }
  try {
    return { kind: 'ok', path, value: format === 'json' ? JSON.parse(text) : parseYamlText(text) }
  } catch (e) {
    return { kind: 'unparsable', path, message: (e as Error).message }
  }
}

/**
 * A layer file read but not validated.
 *
 * @experimental
 */
export interface RawLayer {
  path: string
  exists: boolean
  /** The parsed mapping; `null` when absent or unusable. An empty document normalises to `{}`. */
  data: Record<string, unknown> | null
  /** Why an existing file is unusable; `null` when absent or a mapping. */
  problem: string | null
}

/**
 * How {@link readMappingFile} reads.
 *
 * @experimental
 */
export interface ReadMappingOptions {
  /** `yaml` (default) or `json`. */
  format?: 'yaml' | 'json'
  /** Turn a parser's message into the problem text. Default `YAML parse error: <message>` / `JSON parse error: <message>`. */
  parseProblem?: (message: string) => string
}

/**
 * Read one config file as a mapping, without validating it. An absent file is
 * `exists: false`. A file that cannot be read or parsed, or whose top level is
 * not a mapping, carries a `problem` and `data: null`. An empty document is
 * `{}`. It reads through {@link readParsedFile}.
 * @experimental
 */
export function readMappingFile(path: string, opts: ReadMappingOptions = {}): RawLayer {
  const format = opts.format ?? 'yaml'
  const read = readParsedFile(path, format)
  switch (read.kind) {
    case 'absent':
      return { path, exists: false, data: null, problem: null }
    case 'unreadable':
      return { path, exists: true, data: null, problem: `read failed: ${read.message}` }
    case 'unparsable': {
      const problem =
        opts.parseProblem?.(read.message) ??
        `${format === 'json' ? 'JSON' : 'YAML'} parse error: ${read.message}`
      return { path, exists: true, data: null, problem }
    }
    case 'ok': {
      const raw = read.value
      if (raw === null || raw === undefined) return { path, exists: true, data: {}, problem: null }
      if (typeof raw !== 'object' || Array.isArray(raw)) {
        return { path, exists: true, data: null, problem: 'top level must be a mapping' }
      }
      return { path, exists: true, data: raw as Record<string, unknown>, problem: null }
    }
  }
}

/**
 * What a tool hands {@link assembleConfig}.
 *
 * @experimental
 */
export interface AssembleConfigOptions<S extends readonly ConfigSection[]> {
  /** Which file, and which variable relocates it. */
  file: ConfigFileSpec
  /** The sections this tool mounts, in key order. */
  sections: S
  /** What a top-level key no mounted section owns means. */
  unknownTopLevel: 'reject' | 'ignore' | 'warn'
  /**
   * `'warn'` only: objects whose unknown keys stay an error (matchers and
   * selectors, where dropping a key widens what they match), as dotted
   * patterns in which `*` stands for one segment (an array index or a key).
   */
  strictAt?: readonly string[]
  /** Names the config in error text (`not valid <label>`). Default `config`. */
  label?: string
  /** Turn a YAML parser message into the problem text, to add a hint. */
  parseProblem?: (message: string) => string
  /** Checks across sections, run on the parsed merged config. */
  crossFieldIssues?: (config: ConfigOf<S>) => ConfigIssue[]
  /** Reading options for tests: the environment and working directory the resolver sees. */
  resolve?: Pick<ResolveConfigFileOptions, 'env' | 'cwd'>
  /**
   * Version the files: ordered steps from older file versions to the current
   * one ({@link defineMigrations} builds them from declarative moves). Each
   * file's top-level `version` must then be an integer of at least 1, and a
   * file without one is version 1. `[]` versions the files with no step yet.
   * Leave it out and `version` is an ordinary key.
   */
  migrations?: readonly ConfigMigration[]
}

/** The parsed shape of a section list. */
type ShapeOf<S extends readonly ConfigSection[]> = {
  [E in S[number] as E['key']]: E['schema']
}

/**
 * The typed, hydrated config of a section list.
 *
 * @experimental
 */
export type ConfigOf<S extends readonly ConfigSection[]> = z.infer<z.ZodObject<ShapeOf<S>>>

/**
 * An unknown key a layer file sets, removed from the loaded config.
 *
 * @experimental
 */
export interface UnknownKeyUse {
  /** The layer file that sets it. */
  file: string
  /** Dotted path of the key inside the file. */
  path: string
}

/** The one line that says a layer file is newer than the last migration. */
function newerVersionMessage(file: string, version: number, current: number): string {
  return `${basename(file)}: version ${version} is newer than this tool's ${current}; read as-is`
}

/**
 * Parse `text` as {@link readMappingFile} does, or say why it is not a
 * mapping. For a caller that needs the exact text it parsed.
 */
function mappingOf(
  text: string,
  parseProblem: ((message: string) => string) | undefined,
): Record<string, unknown> | string {
  let raw: unknown
  try {
    raw = parseYamlText(text)
  } catch (e) {
    const message = (e as Error).message
    return parseProblem?.(message) ?? `YAML parse error: ${message}`
  }
  if (raw === null || raw === undefined) return {}
  if (typeof raw !== 'object' || Array.isArray(raw)) return 'top level must be a mapping'
  return raw as Record<string, unknown>
}

/**
 * The one line that says an unknown key was ignored.
 *
 * @experimental
 */
export function unknownKeyMessage(file: string, path: string): string {
  return `${basename(file)}: unknown key ${path} ignored (a newer version, or a typo)`
}

/**
 * A layer file that loaded through migrations: the version it has on disk and
 * the one it was read as.
 *
 * @experimental
 */
export interface LayerMigration {
  /** The layer file. */
  file: string
  from: number
  to: number
  /** The version each step that ran produced, in order. */
  applied: number[]
  warnings: MigrationWarning[]
}

/**
 * The two raw layers plus the merged, validated result, and where the files are.
 *
 * @experimental
 */
export interface ConfigLayers<C> {
  /** Parsed project file mapping, after any migration; `null` when absent. */
  project: Record<string, unknown> | null
  /** Parsed overlay mapping, after any migration; `null` when absent. */
  local: Record<string, unknown> | null
  /** The schema parse over `deepMergeConfig(project, local)`. */
  merged: C
  /** Unknown keys the layers set, removed before the parse (`'warn'` mode; empty otherwise). */
  unknownKeys: UnknownKeyUse[]
  /** The resolved pair the layers were read from. */
  files: ResolvedConfigFile
  /** Each layer file a migration step ran on, in memory; empty when every file is current. */
  migrated: LayerMigration[]
}

/**
 * What {@link ConfigHandle.migrate} did to one layer file. `text` is the file
 * as the migration rewrites it, `null` when no step applied. `rewrite` is
 * `edited` when only the values that changed were edited, so the file's
 * comments are kept, and `reserialized` when the document had to be rendered
 * again, which drops them.
 *
 * @experimental
 */
export interface ConfigFileMigrateResult {
  layer: 'project' | 'local'
  path: string
  from: number
  to: number
  applied: number[]
  warnings: MigrationWarning[]
  written: boolean
  rewrite: 'edited' | 'reserialized' | null
  text: string | null
}

/**
 * A config handle: the schema, and a loader memoized per resolved file.
 *
 * @experimental
 */
export interface ConfigHandle<S extends readonly ConfigSection[]> {
  /** The schema over every mounted section (`.strict()` unless `unknownTopLevel` is `'ignore'`). */
  readonly schema: z.ZodObject<ShapeOf<S>>
  /**
   * The schema for validating one file alone: the same shape, with each
   * section's `fileSchema` in place of its schema where the section has one.
   */
  readonly fileSchema: z.ZodObject<ShapeOf<S>>
  /**
   * Load and type-check the project file deep-merged with its overlay (when
   * present), returning the config with all defaults filled. Neither file
   * present is not an error. Memoized per resolved file, successes only. A
   * call whose files differ from the recorded stat signature reloads. When a
   * reload throws, the entry is left unchanged and every call throws until the
   * files are valid again.
   */
  load(projectRoot: string): ConfigOf<S>
  /** {@link load}, with the two raw layers and the resolved files alongside. Same memo, same throws. */
  loadLayers(projectRoot: string): ConfigLayers<ConfigOf<S>>
  /**
   * The two layer files as raw mappings, with no validation and no memo. `null`
   * for an absent or unusable file. For diagnostics that must look at a broken
   * config.
   */
  readLayers(projectRoot: string): {
    project: Record<string, unknown> | null
    local: Record<string, unknown> | null
    files: ResolvedConfigFile
  }
  /**
   * Run the migrations on each layer file that exists (the project file, then
   * its overlay) and rewrite each one a step applied to, unless `dryRun`. Only
   * the values that changed are edited, so comments elsewhere are kept. Each
   * write is a compare-and-swap against the text the migration read: an edit
   * saved in between throws `WriteConflictError` (`@osdlc/etag-write`) and
   * leaves that file as it is. Throws {@link ConfigInvalidError}, writing
   * nothing, when a file cannot be read or parsed, is not a mapping or has an
   * invalid `version`. The result is not validated against the schema: it
   * reads back as what {@link load} already reads in memory. Without
   * `migrations`, no step applies to any file.
   */
  migrate(projectRoot: string, opts?: { dryRun?: boolean }): ConfigFileMigrateResult[]
  /** Drop every memo entry (tests). */
  clearCache(): void
}

/**
 * `mtimeMs:ctimeMs:size:ino` of a file, or `absent`. It changes when the file
 * is edited, replaced, created or removed. The kernel sets `ctimeMs` on every
 * write, so a same-size edit inside one mtime tick (or one that restores mtime
 * with `utimes`) is still seen. `ino` catches an atomic rename over the file.
 * One `stat` per file, never a read. Only ENOENT reads as absent. Any other
 * stat error (EACCES, EIO) is rethrown, so the token never claims a state the
 * read might disagree with.
 */
function statToken(path: string): string {
  try {
    const st = statSync(path)
    return `${st.mtimeMs}:${st.ctimeMs}:${st.size}:${st.ino}`
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return 'absent'
    throw e
  }
}

/**
 * Build a config handle from the sections a tool mounts.
 *
 * @experimental
 */
export function assembleConfig<const S extends readonly ConfigSection[]>(
  options: AssembleConfigOptions<S>,
): ConfigHandle<S> {
  const { sections, unknownTopLevel } = options
  const label = options.label ?? 'config'
  const resolveOpts = (): ResolveConfigFileOptions => ({ ...options.file, ...options.resolve })

  const shape = Object.fromEntries(sections.map((s) => [s.key, s.schema])) as ShapeOf<S>
  const fileShape = Object.fromEntries(
    sections.map((s) => [s.key, s.fileSchema ?? s.schema]),
  ) as ShapeOf<S>
  const build = (fields: ShapeOf<S>): z.ZodObject<ShapeOf<S>> => {
    const object = z.object(fields)
    return (unknownTopLevel === 'ignore' ? object : object.strict()) as z.ZodObject<ShapeOf<S>>
  }
  const schema = build(shape)
  const fileSchema = build(fileShape)
  const keepStrict = pathMatcher(options.strictAt ?? [])
  const mounted = new Set<string>(sections.map((s) => s.key))
  const migrations = options.migrations
  const currentVersion = currentConfigVersion(migrations ?? [])

  // One entry per `project\0root` key, never evicted. A host sees only a few config files
  // (per project, the root pair or the file the env var names), so the map stays small.
  const cache = new Map<string, { layers: ConfigLayers<ConfigOf<S>>; signature: string }>()
  // `<project file>\0<key>` already warned about, so a reload of an edited file does not repeat the line.
  const warned = new Set<string>()

  const readRaw = (path: string): RawLayer =>
    readMappingFile(path, {
      ...(options.parseProblem !== undefined ? { parseProblem: options.parseProblem } : {}),
    })

  /** Why a layer's `version` is not an integer of at least 1, or `null` when it is (or need not be). */
  const versionProblem = (path: string, data: Record<string, unknown> | null): string | null => {
    if (migrations === undefined || data === null || !Object.hasOwn(data, 'version')) return null
    const v = data.version
    if (typeof v === 'number' && Number.isInteger(v) && v >= 1) return null
    return `${path}: must be an integer of at least 1, got ${JSON.stringify(v) ?? String(v)}`
  }

  /**
   * Run the migrations on one layer's data. A file at or past the last step
   * is left as it is. `null` when no step applied.
   */
  const migrateData = (
    file: string,
    data: Record<string, unknown> | null,
  ): { raw: Record<string, unknown>; migration: LayerMigration } | null => {
    if (migrations === undefined || data === null) return null
    const from = configVersionOf(data)
    if (from >= currentVersion) return null
    const result = migrateConfigRaw(data, migrations)
    if (result.applied.length === 0) return null
    const to = configVersionOf(result.raw)
    const { applied, warnings } = result
    return { raw: result.raw, migration: { file, from, to, applied, warnings } }
  }

  /** A layer's data as the sections see it: with `migrations`, `version` is not a section key. */
  const sectionData = (data: Record<string, unknown>): Record<string, unknown> => {
    if (migrations === undefined || !Object.hasOwn(data, 'version')) return data
    const { version: _version, ...rest } = data
    return rest
  }

  /** Under `'ignore'`, only the mounted keys reach the parse; the rest is never looked at. */
  const mountedOnly = (merged: Record<string, unknown>): Record<string, unknown> =>
    unknownTopLevel !== 'ignore'
      ? merged
      : Object.fromEntries(Object.entries(merged).filter(([key]) => mounted.has(key)))

  function loadUncached(files: ResolvedConfigFile, projectRoot: string): ConfigLayers<ConfigOf<S>> {
    const projectLayer = readRaw(files.project)
    const localLayer = readRaw(files.local)
    const existing = [projectLayer, localLayer].filter((l) => l.exists).map((l) => l.path)

    const unusable = [projectLayer, localLayer].filter((l) => l.problem !== null)
    if (unusable.length > 0) {
      throw new ConfigInvalidError(
        existing,
        unusable.map((l) => ({ path: '(root)', message: `${l.path}: ${l.problem}` })),
        label,
      )
    }
    const badVersions = [projectLayer, localLayer].flatMap(
      (l) => versionProblem(l.path, l.data) ?? [],
    )
    if (badVersions.length > 0) {
      throw new ConfigInvalidError(
        existing,
        badVersions.map((message) => ({ path: 'version', message })),
        label,
      )
    }
    const migrated: LayerMigration[] = []
    for (const layer of [projectLayer, localLayer]) {
      const step = migrateData(layer.path, layer.data)
      if (step === null) continue
      layer.data = step.raw
      migrated.push(step.migration)
    }
    // A file a newer tool wrote: read as-is. Its new keys may then fail the schema, and the
    // error says why; when it loads, one stderr line per handle says so (below).
    const newer = [projectLayer, localLayer].flatMap((layer) => {
      if (migrations === undefined || layer.data === null) return []
      const version = configVersionOf(layer.data)
      return version > currentVersion ? [{ file: layer.path, version }] : []
    })

    // `'warn'`: unknown keys are stripped from each layer separately, against the per-file
    // schema, so each removal names the file that set it. The merge sees only known keys.
    const unknownKeys: UnknownKeyUse[] = []
    const known = (layer: RawLayer): Record<string, unknown> => {
      const data = sectionData(layer.data ?? {})
      if (unknownTopLevel !== 'warn') return data
      const stripped = stripUnknownKeys(fileSchema, data, keepStrict)
      for (const path of stripped.unknown) {
        unknownKeys.push({ file: layer.path, path: path.join('.') })
      }
      return stripped.value
    }
    const result = schema.safeParse(
      mountedOnly(deepMergeConfig(known(projectLayer), known(localLayer))),
    )
    if (!result.success) {
      throw new ConfigInvalidError(
        existing,
        [
          ...result.error.issues.map((issue) => ({
            path: issue.path.length > 0 ? issue.path.join('.') : '(root)',
            message: issue.message,
          })),
          ...newer.map(({ file, version }) => ({
            path: 'version',
            message: newerVersionMessage(file, version, currentVersion),
          })),
        ],
        label,
      )
    }
    const config = result.data as ConfigOf<S>
    const issues: ConfigIssue[] = [...(options.crossFieldIssues?.(config) ?? [])]
    issues.push(
      ...layerCheckIssues(sections, {
        projectRoot,
        project: projectLayer.data,
        local: localLayer.data,
        value: config as Record<string, unknown>,
      }),
    )
    if (issues.length > 0) throw new ConfigInvalidError(existing, issues, label)
    // Warn about deprecated keys only once the config is known good. The id includes the project
    // file, so a host loading several projects through one handle warns for each.
    for (const { key, deprecated, layer } of deprecatedKeysSet(sections, [
      projectLayer.data,
      localLayer.data,
    ])) {
      const id = `${files.project}\0${key}`
      if (warned.has(id)) continue
      warned.add(id)
      const setIn = basename([files.project, files.local][layer]!)
      process.stderr.write(`${deprecationMessage(`${setIn} key '${key}'`, deprecated)}\n`)
    }
    // Same once-per-handle rule: a reload of an edited file does not repeat a line.
    for (const { file, version } of newer) {
      const id = `${files.project}\0version\0${file}\0${version}`
      if (warned.has(id)) continue
      warned.add(id)
      process.stderr.write(`${newerVersionMessage(file, version, currentVersion)}\n`)
    }
    for (const { file, path } of unknownKeys) {
      const id = `${files.project}\0unknown\0${file}\0${path}`
      if (warned.has(id)) continue
      warned.add(id)
      process.stderr.write(`${unknownKeyMessage(file, path)}\n`)
    }
    return {
      project: projectLayer.data,
      local: localLayer.data,
      merged: config,
      unknownKeys,
      files,
      migrated,
    }
  }

  function migrate(projectRoot: string, o: { dryRun?: boolean } = {}): ConfigFileMigrateResult[] {
    const files = resolveConfigFile(projectRoot, resolveOpts())
    const write = o.dryRun !== true
    const plans: { result: ConfigFileMigrateResult; seen: string }[] = []
    const existing: string[] = []
    const problems: ConfigIssue[] = []
    for (const [layer, path] of [
      ['project', files.project],
      ['local', files.local],
    ] as const) {
      let bytes: Buffer
      try {
        bytes = readFileSync(path)
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue
        existing.push(path)
        problems.push({ path: '(root)', message: `${path}: read failed: ${(e as Error).message}` })
        continue
      }
      existing.push(path)
      const text = bytes.toString('utf-8')
      const raw = mappingOf(text, options.parseProblem)
      if (typeof raw === 'string') {
        problems.push({ path: '(root)', message: `${path}: ${raw}` })
        continue
      }
      const bad = versionProblem(path, raw)
      if (bad !== null) {
        problems.push({ path: 'version', message: bad })
        continue
      }
      const from = configVersionOf(raw)
      const step = migrateData(path, raw)
      if (step === null) {
        const result: ConfigFileMigrateResult = {
          layer,
          path,
          from,
          to: from,
          applied: [],
          warnings: [],
          written: false,
          rewrite: null,
          text: null,
        }
        plans.push({ result, seen: '' })
        continue
      }
      const next = rewriteMigrated(text, step.raw)
      const { to, applied, warnings } = step.migration
      const result: ConfigFileMigrateResult = {
        layer,
        path,
        from,
        to,
        applied,
        warnings,
        written: write,
        rewrite: next.rewrite,
        text: next.text,
      }
      plans.push({ result, seen: etag(bytes) })
    }
    if (problems.length > 0) throw new ConfigInvalidError(existing, problems, label)
    for (const { result, seen } of plans) {
      if (result.written && result.text !== null) writeCas(result.path, result.text, seen)
    }
    return plans.map((p) => p.result)
  }

  function loadLayers(projectRoot: string): ConfigLayers<ConfigOf<S>> {
    const files = resolveConfigFile(projectRoot, resolveOpts())
    const signature = `${statToken(files.project)}|${statToken(files.local)}`
    // The key holds the resolved file, so two files never share an entry. It also holds the
    // root, because a section's layer check reads the project the file belongs to.
    const key = `${files.project}\0${resolve(projectRoot)}`
    const cached = cache.get(key)
    if (cached !== undefined && (!RELOADS_ON_CHANGE || cached.signature === signature)) {
      return cached.layers
    }
    const layers = loadUncached(files, projectRoot)
    cache.set(key, { layers, signature })
    return layers
  }

  return {
    schema,
    fileSchema,
    load: (projectRoot) => loadLayers(projectRoot).merged,
    loadLayers,
    migrate,
    readLayers(projectRoot) {
      const files = resolveConfigFile(projectRoot, resolveOpts())
      return { project: readRaw(files.project).data, local: readRaw(files.local).data, files }
    },
    clearCache: () => {
      cache.clear()
      warned.clear()
    },
  }
}
