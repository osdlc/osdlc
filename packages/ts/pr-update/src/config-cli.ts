/**
 * `pr-update config list|get|set|unset|explain|scaffold` — the config
 * subcommands, derived from the mounted sections (`STANDALONE_SECTIONS`) with
 * the pieces `@osdlc/config-layers` exports.
 *
 * pr-update mounts one section of its own, so `pr_update` is the default
 * namespace: a key whose first segment is not a mounted section name gets
 * `pr_update.` prefixed (`config set strategy merge` is
 * `config set pr_update.strategy merge`). Output and
 * messages name a key qualified.
 *
 * The caller names the config file (a `ConfigFileSpec`). Writes go to the file
 * `resolveConfigFile` names for it (the file and its overlay under the project
 * root, or the file its env variable names and that file's overlay) through the
 * library's span-preserving `setPath`/`unsetPath`, and only after the merged
 * result validates; an invalid result is a `ConfigInvalidError` (exit 14) and
 * the file is left untouched.
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'

import {
  ConfigInvalidError,
  deepMergeConfig,
  defaultOf,
  describeShape,
  descriptionOf,
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

import { EXIT, defineCli, type CliContext } from '@osdlc/cli-tool'
import { atomicWrite } from '@osdlc/etag-write'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { z } from 'zod'

import {
  STANDALONE_SECTIONS,
  loadConfigLayers,
  standaloneConfig,
  type ConfigFileSpec,
  type StandaloneConfig,
} from './config-file.ts'

/** The namespace an unqualified key belongs to. */
const DEFAULT_SECTION = 'pr_update'

const SHAPE: Record<string, z.ZodType> = Object.fromEntries(
  STANDALONE_SECTIONS.map((s) => [s.key, s.schema]),
)

const LAYERS = ['project', 'local'] as const
type Layer = (typeof LAYERS)[number]

/** The per-checkout overlay's file name, derived from the project file's. */
function localName(file: ConfigFileSpec): string {
  return overlayPath(file.name)
}

function localHeader(file: ConfigFileSpec): string {
  return `# Per-checkout override for ${file.name} (gitignored). Keys here deep-merge over\n# the committed file.\n`
}
const PROJECT_HEADER = '# Project configuration.\n'

/** The subcommand definitions and help text, which name the caller's file. */
function configUi(file: ConfigFileSpec) {
  const LOCAL_FILE_NAME = localName(file)
  const keyFlags = {
    layer: {
      kind: 'enum',
      choices: LAYERS,
      valueName: 'project|local',
      help: `File to read or write: project (${file.name}) or local (${LOCAL_FILE_NAME}).`,
    },
  } as const

  const LIST_CLI = defineCli({
    name: 'pr-update config list',
    summary: 'List every key of the pr_update and code_host blocks with its effective value.',
    flags: {},
  })
  const GET_CLI = defineCli({
    name: 'pr-update config get',
    summary: 'Print the effective value of one key (or one layer with --layer).',
    flags: keyFlags,
    positionals: [{ name: 'key', required: true }],
  })
  const SET_CLI = defineCli({
    name: 'pr-update config set',
    summary: 'Set one key, validated before it is written; comments and layout are preserved.',
    flags: {
      ...keyFlags,
      dryRun: { kind: 'boolean', help: 'Validate and report; write nothing.' },
    },
    positionals: [
      { name: 'key', required: true },
      { name: 'value', required: true, help: 'YAML: a scalar or a flow list/map.' },
    ],
  })
  const UNSET_CLI = defineCli({
    name: 'pr-update config unset',
    summary: 'Remove one key from a layer file.',
    flags: {
      ...keyFlags,
      dryRun: { kind: 'boolean', help: 'Validate and report; write nothing.' },
    },
    positionals: [{ name: 'key', required: true }],
  })
  const EXPLAIN_CLI = defineCli({
    name: 'pr-update config explain',
    summary:
      'Explain one key: description, shape, default, effective value and the file it came from.',
    flags: {},
    positionals: [{ name: 'key', required: true }],
  })
  const SCAFFOLD_CLI = defineCli({
    name: 'pr-update config scaffold',
    summary: `Print a schema-driven starter file (--local: a commented ${LOCAL_FILE_NAME} template).`,
    flags: {
      local: { kind: 'boolean', help: `Render the commented ${LOCAL_FILE_NAME} template.` },
    },
  })

  const CONFIG_HELP = `pr-update config <command>

  Commands:
    list      List every key with its effective value.
    get       Print the effective value of one key.
    set       Set one key (validated, then written).
    unset     Remove one key from a layer file.
    explain   Explain one key.
    scaffold  Print a starter ${file.name} block (--local for ${LOCAL_FILE_NAME}).

  A key without a section prefix means pr_update.<key>.`

  return { LIST_CLI, GET_CLI, SET_CLI, UNSET_CLI, EXPLAIN_CLI, SCAFFOLD_CLI, CONFIG_HELP }
}

/** Prefix the default namespace onto a key whose first segment is not a mounted section. */
export function qualifyKey(key: string): string[] {
  const path = splitKeyPath(key)
  return path[0] !== undefined && path[0] in SHAPE ? path : [DEFAULT_SECTION, ...path]
}

/** One-line rendering of a value for a table cell. */
function summarize(value: unknown): string {
  if (value === undefined) return '-'
  if (Array.isArray(value)) return `[${value.length} item${value.length === 1 ? '' : 's'}]`
  const s = JSON.stringify(value)
  return s.length > 48 ? `${s.slice(0, 47)}…` : s
}

function render(value: unknown): string {
  return typeof value === 'string' ? value : stringifyYaml(value).trimEnd()
}

function parseCliValue(raw: string): unknown {
  const v = parseYaml(raw) as unknown
  return v === undefined ? null : v
}

function layerFile(files: ResolvedConfigFile, layer: Layer): string {
  return layer === 'project' ? files.project : files.local
}

/** `--help` and usage errors for a config subcommand. */
function usageError(io: CliContext['io'], name: string, message: string): number {
  io.stderr(`${name}: ${message}\n`)
  return EXIT.usage
}

function resolveKey(key: string, file: ConfigFileSpec) {
  const path = qualifyKey(key)
  return resolveKeyPath(SHAPE, path, { file: file.name })
}

/** Read one layer file as a mapping; a broken file is exit 14. */
function readLayerFile(path: string): Record<string, unknown> | null {
  const layer = readMappingFile(path)
  if (layer.problem !== null) {
    throw new ConfigInvalidError(
      [path],
      [{ path: '(root)', message: layer.problem }],
      'pr-update config',
    )
  }
  return layer.data
}

/** Write `mutate`'s result into one layer file after validating the merged outcome. */
function writeLayer(
  ctx: CliContext,
  file_: ConfigFileSpec,
  layer: Layer,
  path: readonly string[],
  value: { set: unknown } | { unset: true },
  dryRun: boolean,
): { file: string; changed: boolean; created: boolean } {
  const files = resolveConfigFile(ctx.cwd, { ...file_, env: ctx.env, cwd: ctx.cwd })
  const file = layerFile(files, layer)
  const created = !existsSync(file)
  const current = created ? null : readFileSync(file, 'utf8')
  if (created && 'unset' in value) return { file, changed: false, created: false }
  const source = current ?? (layer === 'project' ? PROJECT_HEADER : localHeader(file_))
  const next = 'unset' in value ? unsetPath(source, path) : setPath(source, path, value.set)

  const nextData = (parseYaml(next) ?? {}) as Record<string, unknown>
  const otherFile = layerFile(files, layer === 'project' ? 'local' : 'project')
  const other = readLayerFile(otherFile) ?? {}
  const merged =
    layer === 'project' ? deepMergeConfig(nextData, other) : deepMergeConfig(other, nextData)
  const parsed = standaloneConfig(file_, { env: ctx.env, cwd: ctx.cwd }).schema.safeParse(merged)
  if (!parsed.success) {
    throw new ConfigInvalidError(
      [file],
      parsed.error.issues.map((i) => ({
        path: i.path.length > 0 ? i.path.join('.') : '(root)',
        message: i.message,
      })),
      'pr-update config',
    )
  }
  const changed = created || next !== current
  if (changed && !dryRun) {
    mkdirSync(dirname(file), { recursive: true })
    atomicWrite(file, next)
  }
  return { file, changed, created }
}

/** Where a key's effective value comes from: the overlay, the project file or the default. */
function sourceOf(layers: ConfigLayers<StandaloneConfig>, path: readonly string[]): string {
  if (getIn(layers.local, path).found) return 'local'
  return getIn(layers.project, path).found ? 'project' : 'default'
}

function runList(rest: readonly string[], ctx: CliContext, file: ConfigFileSpec): number {
  const { io } = ctx
  const ui = configUi(file)
  const p = ui.LIST_CLI.parse(rest, io)
  if (p.status === 'help') return EXIT.ok
  if (p.status === 'error') return usageError(io, 'pr-update config list', p.message)
  const layers = loadConfigLayers(file, ctx.cwd, { env: ctx.env, cwd: ctx.cwd })
  const rows: { key: string; source: string; summary: string }[] = []
  for (const section of STANDALONE_SECTIONS) {
    for (const field of nestedFields(section.schema)) {
      const path = [section.key, field.name]
      rows.push({
        key: path.join('.'),
        source: sourceOf(layers, path),
        summary: summarize(getIn(layers.merged, path).value),
      })
    }
  }
  const w = Math.max(...rows.map((r) => r.key.length))
  for (const r of rows) io.stdout(`${r.key.padEnd(w)}  ${r.source.padEnd(7)}  ${r.summary}\n`)
  return EXIT.ok
}

function runGet(rest: readonly string[], ctx: CliContext, file: ConfigFileSpec): number {
  const { io } = ctx
  const ui = configUi(file)
  const p = ui.GET_CLI.parse(rest, io)
  if (p.status === 'help') return EXIT.ok
  if (p.status === 'error') return usageError(io, 'pr-update config get', p.message)
  const resolved = resolveKey(p.positionals[0] ?? '', file)
  const layers = loadConfigLayers(file, ctx.cwd, { env: ctx.env, cwd: ctx.cwd })
  const hit = getIn(
    p.values.layer === undefined ? layers.merged : layers[p.values.layer],
    resolved.path,
  )
  if (!hit.found || hit.value === undefined) {
    io.stderr(`pr-update config get: ${resolved.path.join('.')} is not set in that layer\n`)
    return EXIT.error
  }
  io.stdout(`${render(hit.value)}\n`)
  return EXIT.ok
}

/** Report what a `set`/`unset` did (or, with `--dry-run`, would do). */
function reportWrite(
  ctx: CliContext,
  key: string,
  r: { file: string; changed: boolean; created: boolean },
  dryRun: boolean,
): void {
  const verb = dryRun ? 'would update' : 'updated'
  ctx.io.stdout(
    r.changed
      ? `${key}: ${r.created ? verb.replace('update', 'create') : verb} ${r.file}\n`
      : `${key}: unchanged (${r.file})\n`,
  )
}

function runSet(rest: readonly string[], ctx: CliContext, file: ConfigFileSpec): number {
  const { io } = ctx
  const ui = configUi(file)
  const p = ui.SET_CLI.parse(rest, io)
  if (p.status === 'help') return EXIT.ok
  if (p.status === 'error') return usageError(io, 'pr-update config set', p.message)
  const resolved = resolveKey(p.positionals[0] ?? '', file)
  const change = { set: parseCliValue(p.positionals[1] ?? '') }
  const r = writeLayer(
    ctx,
    file,
    p.values.layer ?? 'project',
    resolved.path,
    change,
    p.values.dryRun,
  )
  reportWrite(ctx, resolved.path.join('.'), r, p.values.dryRun)
  return EXIT.ok
}

function runUnset(rest: readonly string[], ctx: CliContext, file: ConfigFileSpec): number {
  const { io } = ctx
  const ui = configUi(file)
  const p = ui.UNSET_CLI.parse(rest, io)
  if (p.status === 'help') return EXIT.ok
  if (p.status === 'error') return usageError(io, 'pr-update config unset', p.message)
  const resolved = resolveKey(p.positionals[0] ?? '', file)
  const change = { unset: true as const }
  const r = writeLayer(
    ctx,
    file,
    p.values.layer ?? 'project',
    resolved.path,
    change,
    p.values.dryRun,
  )
  reportWrite(ctx, resolved.path.join('.'), r, p.values.dryRun)
  return EXIT.ok
}

function runExplain(rest: readonly string[], ctx: CliContext, file: ConfigFileSpec): number {
  const { io } = ctx
  const ui = configUi(file)
  const p = ui.EXPLAIN_CLI.parse(rest, io)
  if (p.status === 'help') return EXIT.ok
  if (p.status === 'error') return usageError(io, 'pr-update config explain', p.message)
  const resolved = resolveKey(p.positionals[0] ?? '', file)
  const layers = loadConfigLayers(file, ctx.cwd, { env: ctx.env, cwd: ctx.cwd })
  const key = resolved.path.join('.')
  const viaEnv = layers.files.source === 'env' ? ` (from ${file.envVar})` : ''
  io.stdout(`${key}\n\n`)
  const description = descriptionOf(resolved.schema)
  if (description !== '') io.stdout(`${description}\n\n`)
  io.stdout(`file:         ${layers.files.project}${viaEnv}\n`)
  io.stdout(`overlay:      ${layers.files.local}\n`)
  io.stdout(`category:     ${resolved.meta.category}\n`)
  io.stdout(`layers:       ${resolved.meta.layers.join(', ')}\n`)
  io.stdout(`shape:        ${describeShape(resolved.schema)}\n`)
  io.stdout(`default:      ${JSON.stringify(defaultOf(resolved.schema)) ?? '(none)'}\n`)
  io.stdout(
    `effective:    ${JSON.stringify(getIn(layers.merged, resolved.path).value) ?? '(none)'} (from ${sourceOf(layers, resolved.path)})\n`,
  )
  const fields = nestedFields(resolved.schema)
  if (fields.length > 0) {
    io.stdout('fields:\n')
    for (const f of fields) {
      io.stdout(`  ${f.name}: ${f.shape}  (default ${JSON.stringify(f.default) ?? '(none)'})\n`)
    }
  }
  return EXIT.ok
}

function runScaffold(rest: readonly string[], ctx: CliContext, file: ConfigFileSpec): number {
  const { io } = ctx
  const ui = configUi(file)
  const p = ui.SCAFFOLD_CLI.parse(rest, io)
  if (p.status === 'help') return EXIT.ok
  if (p.status === 'error') return usageError(io, 'pr-update config scaffold', p.message)
  const schema = standaloneConfig(file, { env: ctx.env, cwd: ctx.cwd }).schema
  io.stdout(
    p.values.local
      ? scaffoldLocalYaml(schema, [
          `# Per-checkout override for ${file.name} (gitignored). Every key is commented out at`,
          '# its default; uncomment only what THIS checkout should override.',
        ])
      : scaffoldYaml(schema, [
          `# pr-update configuration: the pr_update and code_host blocks of ${file.name}.`,
          '# Every key is shown at its default with its description as a comment.',
        ]),
  )
  return EXIT.ok
}

/** `pr-update config <sub> …`, reading and writing the config file `file` names. */
export function runConfigCommand(
  argv: readonly string[],
  ctx: CliContext,
  file: ConfigFileSpec,
): number {
  const { io } = ctx
  const ui = configUi(file)
  const [sub, ...rest] = argv
  if (sub === undefined || sub === '--help' || sub === '-h') {
    io.stdout(`${ui.CONFIG_HELP}\n`)
    return EXIT.ok
  }
  switch (sub) {
    case 'list':
      return runList(rest, ctx, file)
    case 'get':
      return runGet(rest, ctx, file)
    case 'set':
      return runSet(rest, ctx, file)
    case 'unset':
      return runUnset(rest, ctx, file)
    case 'explain':
      return runExplain(rest, ctx, file)
    case 'scaffold':
      return runScaffold(rest, ctx, file)
    default:
      io.stderr(`pr-update config: unknown command '${sub}'\n\n${ui.CONFIG_HELP}\n`)
      return EXIT.usage
  }
}
