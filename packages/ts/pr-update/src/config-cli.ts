/**
 * `pr-update config`: cli-tool's shared `config` group (`list`, `get`, `set`,
 * `unset`, `path`, `explain`) over the mounted sections
 * (`STANDALONE_SECTIONS`), plus `scaffold`, which prints a starter file from
 * the schema. {@link prUpdateConfigStore} is the `ConfigStore` the group runs
 * on.
 *
 * pr-update mounts one section of its own, so `pr_update` is the default
 * namespace. A key whose first segment is not a mounted section name gets a
 * `pr_update.` prefix (`config set strategy merge` is
 * `config set pr_update.strategy merge`). Output and messages always show the
 * full key.
 *
 * The caller names the config file (a `ConfigFileSpec`). Writes go to the file
 * `resolveConfigFile` names for it: the file and its overlay under the project
 * root, or the file its env variable names and that file's overlay. They go
 * through the library's `setPath`/`unsetPath`, which keep the rest of the file
 * as it was, and only after the merged result validates. Only the result is
 * checked, so `set` and `unset` can repair a file that is invalid now. A change
 * that leaves the config invalid is a usage error (exit 2), and the file is
 * left untouched. A layer file that does not parse as YAML, or a config
 * variable naming a missing file, exits 14 (`CONFIG_INVALID_EXIT`); so does
 * reading (`list`, `get`, `explain`) an invalid config. `path` lists the files
 * whatever their state.
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'

import {
  CONFIG_INVALID_EXIT,
  ConfigInvalidError,
  deepMergeConfig,
  defaultOf,
  getIn,
  nestedFields,
  overlayPath,
  readMappingFile,
  resolveConfigFile,
  resolveKeyPath,
  scaffoldLocalYaml,
  scaffoldYaml,
  setPath,
  splitKeyPath,
  unsetPath,
  type ConfigLayers,
  type ResolvedConfigFile,
} from '@osdlc/config-layers'

import { CommandError, commandKit, type CommandContext, type Group } from '@osdlc/cli-tool/command'
import {
  ConfigUsageError,
  configCommands,
  type ConfigLayerValue,
  type ConfigStore,
} from '@osdlc/cli-tool/config-command'
import { atomicWrite } from '@osdlc/etag-write'
import { parse as parseYaml } from 'yaml'
import type { z } from 'zod'

import {
  STANDALONE_SECTIONS,
  loadConfigLayers,
  standaloneConfig,
  type ConfigFileSpec,
  type StandaloneConfig,
} from './config-file.ts'
import { COMMAND_KEY_NAMES } from './trust.ts'

/** The namespace an unqualified key belongs to. */
const DEFAULT_SECTION = 'pr_update'

const SHAPE: Record<string, z.ZodType> = Object.fromEntries(
  STANDALONE_SECTIONS.map((s) => [s.key, s.schema]),
)

const LAYERS = ['project', 'local'] as const
type Layer = (typeof LAYERS)[number]

/** Every top-level field of every mounted section, as a dotted key. */
const KEYS: readonly string[] = STANDALONE_SECTIONS.flatMap((section) =>
  nestedFields(section.schema).map((field) => `${section.key}.${field.name}`),
)

function localHeader(file: ConfigFileSpec): string {
  return `# Per-checkout override for ${file.name} (gitignored). Keys here deep-merge over\n# the committed file.\n`
}
const PROJECT_HEADER = '# Project configuration.\n'

/** Prefix the default namespace onto a key whose first segment is not a mounted section. */
export function qualifyKey(key: string): string[] {
  const path = splitKeyPath(key)
  return path[0] !== undefined && path[0] in SHAPE ? path : [DEFAULT_SECTION, ...path]
}

/** The key's path and schema, or a {@link ConfigUsageError} naming what does not resolve. */
function resolveKey(key: string, file: ConfigFileSpec) {
  try {
    return resolveKeyPath(SHAPE, qualifyKey(key), { file: file.name })
  } catch (err) {
    throw new ConfigUsageError(err instanceof Error ? err.message : String(err))
  }
}

/** An invalid or unreadable file, as the command's failure: exit 14, as every other command. */
function invalidFile(err: unknown): never {
  if (err instanceof ConfigInvalidError) {
    throw new CommandError(err.message, { exit: CONFIG_INVALID_EXIT, code: 'config-invalid' })
  }
  throw err
}

function layerFile(files: ResolvedConfigFile, layer: Layer): string {
  return layer === 'project' ? files.project : files.local
}

/** Read one layer file as a mapping; a broken file is exit 14. */
function readLayerFile(path: string): Record<string, unknown> | null {
  const layer = readMappingFile(path)
  if (layer.problem !== null) {
    invalidFile(
      new ConfigInvalidError(
        [path],
        [{ path: '(root)', message: layer.problem }],
        'pr-update config',
      ),
    )
  }
  return layer.data
}

/** {@link resolveConfigFile} for `ctx`; a variable naming a missing file is exit 14. */
function configFiles(ctx: CommandContext, spec: ConfigFileSpec): ResolvedConfigFile {
  try {
    return resolveConfigFile(ctx.cwd, { ...spec, env: ctx.env, cwd: ctx.cwd })
  } catch (err) {
    return invalidFile(err)
  }
}

/** The schema issues of `merged`, or an empty list when it validates. */
function issuesOf(ctx: CommandContext, file: ConfigFileSpec, merged: unknown) {
  const parsed = standaloneConfig(file, { env: ctx.env, cwd: ctx.cwd }).schema.safeParse(merged)
  return parsed.success
    ? []
    : parsed.error.issues.map((i) => ({
        path: i.path.length > 0 ? i.path.join('.') : '(root)',
        message: i.message,
      }))
}

/**
 * Write a change into one layer file after validating the merged outcome.
 * Only the result is checked, so a change can repair a file that is invalid
 * now. A result that is invalid is a usage error; a layer file that does not
 * parse as YAML at all is exit 14.
 */
function writeLayer(
  ctx: CommandContext,
  spec: ConfigFileSpec,
  layer: Layer,
  path: readonly string[],
  value: { set: unknown } | { unset: true },
  dryRun: boolean,
): { file: string; changed: boolean } {
  const files = configFiles(ctx, spec)
  const file = layerFile(files, layer)
  const created = !existsSync(file)
  // A file that is not a YAML mapping cannot be edited in place.
  if (!created) readLayerFile(file)
  const current = created ? null : readFileSync(file, 'utf8')
  if (created && 'unset' in value) return { file, changed: false }
  const source = current ?? (layer === 'project' ? PROJECT_HEADER : localHeader(spec))
  const next = 'unset' in value ? unsetPath(source, path) : setPath(source, path, value.set)
  if (!created && next === current) return { file, changed: false }

  const otherFile = layerFile(files, layer === 'project' ? 'local' : 'project')
  const other = readLayerFile(otherFile) ?? {}
  const merge = (data: Record<string, unknown>) =>
    layer === 'project' ? deepMergeConfig(data, other) : deepMergeConfig(other, data)
  const afterIssues = issuesOf(ctx, spec, merge((parseYaml(next) ?? {}) as Record<string, unknown>))
  if (afterIssues.length > 0) {
    throw new ConfigUsageError(
      `the change would leave ${file} invalid:\n` +
        afterIssues.map((i) => `  ${i.path}: ${i.message}`).join('\n'),
    )
  }
  if (!dryRun) {
    mkdirSync(dirname(file), { recursive: true })
    atomicWrite(file, next)
  }
  return { file, changed: true }
}

/** Where a key's effective value comes from: the overlay, the project file or the default. */
function sourceOf(layers: ConfigLayers<StandaloneConfig>, path: readonly string[]): string {
  if (getIn(layers.local, path).found) return 'local'
  return getIn(layers.project, path).found ? 'project' : 'default'
}

function asLayer(layer: string): Layer {
  return layer === 'local' ? 'local' : 'project'
}

/**
 * pr-update's `ConfigStore`: the project file (the default for `set` and
 * `unset`) and its `.local` overlay. The keys that name a command to run are
 * written from the command line only.
 */
export function prUpdateConfigStore(file: ConfigFileSpec): ConfigStore {
  const load = (ctx: CommandContext): ConfigLayers<StandaloneConfig> => {
    try {
      return loadConfigLayers(file, ctx.cwd, { env: ctx.env, cwd: ctx.cwd })
    } catch (err) {
      return invalidFile(err)
    }
  }
  return {
    layers: LAYERS,
    defaultLayer: 'project',
    keys: KEYS,
    cliOnlyKeys: COMMAND_KEY_NAMES,
    dryRun: true,
    resolveKey(key) {
      try {
        return resolveKey(key, file).path.join('.')
      } catch {
        return undefined
      }
    },

    async list(ctx) {
      const layers = load(ctx)
      const settings = KEYS.map((key) => {
        const path = key.split('.')
        return { key, value: getIn(layers.merged, path).value, source: sourceOf(layers, path) }
      })
      return { settings }
    },

    // Existence only: `config path` is what you run when a file will not load,
    // so a variable naming a missing file still lists that path, as missing.
    async locations(ctx) {
      let files: ResolvedConfigFile
      try {
        files = resolveConfigFile(ctx.cwd, { ...file, env: ctx.env, cwd: ctx.cwd })
      } catch (err) {
        const named = err instanceof ConfigInvalidError ? err.files[0] : undefined
        if (named === undefined) throw err
        files = { project: named, local: overlayPath(named), source: 'env' }
      }
      return [
        {
          layer: 'project',
          path: files.project,
          exists: existsSync(files.project),
          envVar: files.source === 'env' ? file.envVar : null,
        },
        { layer: 'local', path: files.local, exists: existsSync(files.local) },
      ]
    },

    async set(ctx, layer, key, value, options = {}) {
      const { path } = resolveKey(key, file)
      const written = writeLayer(
        ctx,
        file,
        asLayer(layer),
        path,
        { set: value },
        options.dryRun === true,
      )
      return { file: written.file, value }
    },

    async unset(ctx, layer, key, options = {}) {
      const { path } = resolveKey(key, file)
      const written = writeLayer(
        ctx,
        file,
        asLayer(layer),
        path,
        { unset: true },
        options.dryRun === true,
      )
      return { file: written.file, removed: written.changed }
    },

    async explain(ctx, key) {
      const resolved = resolveKey(key, file)
      const layers = load(ctx)
      const fallback = defaultOf(resolved.schema)
      const project = getIn(layers.project, resolved.path)
      const local = getIn(layers.local, resolved.path)
      const layerValues: ConfigLayerValue[] = [
        { layer: 'default', set: fallback !== undefined, value: fallback },
        {
          layer: 'project',
          set: project.found,
          value: project.value,
          file: layers.files.project,
          ...(layers.files.source === 'env' ? { envVar: file.envVar } : {}),
        },
        { layer: 'local', set: local.found, value: local.value, file: layers.files.local },
      ]
      return { layers: layerValues }
    },
  }
}

/** `config scaffold`: pr-update's own, since cli-tool's store has no schema to render. */
function scaffoldCommand(file: ConfigFileSpec) {
  const LOCAL_FILE_NAME = overlayPath(file.name)
  return commandKit({ globals: {} }).command({
    summary: `print a schema-driven starter ${file.name} (--local: a commented ${LOCAL_FILE_NAME} template)`,
    interactive: true,
    flags: {
      local: { kind: 'boolean', help: `render the commented ${LOCAL_FILE_NAME} template` },
    },
    run({ flags }, ctx) {
      const schema = standaloneConfig(file, { env: ctx.env, cwd: ctx.cwd }).schema
      ctx.io.stdout(
        flags.local
          ? scaffoldLocalYaml(schema, [
              `# Per-checkout override for ${file.name} (gitignored). Every key is commented out at`,
              '# its default; uncomment only what THIS checkout should override.',
            ])
          : scaffoldYaml(schema, [
              `# pr-update configuration: the pr_update and code_host blocks of ${file.name}.`,
              '# Every key is shown at its default with its description as a comment.',
            ]),
      )
    },
  })
}

/** The `config` group, reading and writing the config file `file` names. */
export function configCommand(file: ConfigFileSpec): Group {
  const shared = configCommands(prUpdateConfigStore(file))
  return commandKit({ globals: {} }).group({
    summary: 'list, read, edit and explain the pr_update and code_host config',
    description:
      `${shared.description ?? ''} The project layer is ${file.name} and the local one ` +
      `${overlayPath(file.name)} (gitignored). ${file.envVar} names another file, whose overlay ` +
      'sits beside it. A key without a section prefix means pr_update.<key>.',
    ...(shared.default !== undefined ? { default: shared.default } : {}),
    commands: { ...shared.commands, scaffold: scaffoldCommand(file) },
  })
}
