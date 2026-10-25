/**
 * The `config` subcommand. Everything outside the project root is injected
 * (`stdout`, `stderr`, `env`, `home`), so a test never reads or edits the
 * developer's own config.
 */

import { access } from 'node:fs/promises'
import { homedir } from 'node:os'

import { BIN } from './app.ts'
import {
  CONFIG_ENV_VAR,
  ConfigError,
  configLocations,
  DEFAULT_CONFIG,
  getConfigValue,
  loadConfig,
  mergeConfig,
  parseConfigValue,
  readRawConfigFile,
  setConfigValue,
  unsetConfigValue,
  validateConfig,
  writeConfigFile,
  type ConfigLayer,
  type LoadedConfig,
  type TaskConfig,
} from './config.ts'
import { terminalSafe } from './terminal-text.ts'
import { EXIT, type CliIo } from '@osdlc/cli-tool'

/**
 * `CliIo` plus the environment this command needs injected.
 */
export interface ConfigCommandIO extends CliIo {
  /**
   * Defaults to `process.env`. Supplies `WAYFINDER_CONFIG` (or the old
   * `WAYPOST_CONFIG`) and `XDG_CONFIG_HOME`.
   */
  env?: Record<string, string | undefined>
  /** Defaults to `os.homedir()`. The base for the non-XDG user path. */
  home?: string
  /**
   * wayfinder's own defaults, between `DEFAULT_CONFIG` and the user file
   * (`{ allowExec: true }`), so `list` and `get` report the value in effect.
   */
  defaults?: Partial<TaskConfig>
}

/** Which file `set` and `unset` write. The project file unless asked otherwise. */
type Target = 'user' | 'project'

function usage(): string {
  return `${BIN} config — read and write the layered task configuration

usage: ${BIN} config <command>

  list [--json]                            every setting, and the layer it came from
  get <key>                                one setting's effective value, as JSON
  set <key> <value> [--user|--project]     write a setting (default --project)
  unset <key> [--user|--project]           remove a setting (default --project)
  path                                     where each layer's file lives
  -h, --help                               this text

Keys are dotted: runners.disabled, runners.order, allowExec, discovery,
excludePaths, trust.paths, trust.owners, tools.

A value is read as JSON, falling back to the bare string when that fails — so
\`set discovery git\` and \`set runners.order '["moon","just"]'\` both work, and a
plain word needs no quoting.

Layers, lowest precedence first: built-in defaults, the user file, the project
file, then this tool's own flags. ${CONFIG_ENV_VAR} replaces the user file's
location and nothing else.
`
}

/**
 * `loadConfig`, with the calling tool's defaults placed under the file layers.
 *
 * `sources` is left as it is on purpose. A value from the tool's defaults
 * still came from no file, so `(default)` is still the right label. Only the
 * value next to that label changes.
 */
async function load(
  toolName: string,
  root: string,
  env: Record<string, string | undefined>,
  home: string,
  defaults: Partial<TaskConfig> | undefined,
): Promise<LoadedConfig> {
  const loaded = await loadConfig(root, env, home)
  if (defaults === undefined || Object.keys(defaults).length === 0) return loaded

  const base = mergeConfig(DEFAULT_CONFIG, defaults)
  const effective = mergeConfig(
    mergeConfig(base, loaded.layers.user ?? {}),
    loaded.layers.project ?? {},
  )
  return { ...loaded, effective }
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

/** `<path> (exists)` or `<path> (missing)`, which is what `config path` reports. */
async function describeFile(file: string): Promise<string> {
  return `${terminalSafe(file)} ${(await exists(file)) ? '(exists)' : '(missing)'}`
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length)
}

/**
 * Split `--user` / `--project` off the argument list, leaving the positionals.
 *
 * The two name different files, and both callers write. If the last flag won,
 * a typo could silently edit the wrong file. Giving both is a usage error.
 */
function takeTarget(argv: string[]): { target: Target; rest: string[] } | { error: string } {
  let target: Target | undefined
  const rest: string[] = []
  for (const arg of argv) {
    if (arg === '--user' || arg === '--project') {
      const named: Target = arg === '--user' ? 'user' : 'project'
      if (target !== undefined && target !== named) {
        return { error: '--user and --project name different files; give at most one' }
      }
      target = named
    } else if (arg.startsWith('--')) {
      return { error: `unknown option: ${arg}` }
    } else {
      rest.push(arg)
    }
  }
  return { target: target ?? 'project', rest }
}

/**
 * Pull `-C PATH` / `--dir PATH` out of a `config` argument list.
 *
 * `-C` is a global flag, but subcommands run before the main parser, so
 * without this it would be accepted and ignored. All four spellings are
 * accepted: `-C X`, `-CX`, `--dir X`, `--dir=X`.
 */
export function takeConfigDir(
  argv: string[],
): { dir?: string; rest: string[] } | { error: string } {
  let dir: string | undefined
  const rest: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string
    const attached = arg.startsWith('--dir=')
      ? arg.slice('--dir='.length)
      : arg.startsWith('-C=')
        ? arg.slice('-C='.length)
        : arg.startsWith('-C') && arg.length > 2
          ? arg.slice(2)
          : undefined
    if (attached !== undefined) {
      if (attached === '') return { error: `${arg.split('=')[0] as string} needs a path` }
      dir = attached
    } else if (arg === '-C' || arg === '--dir') {
      const value = argv[++i]
      if (value === undefined) return { error: `${arg} needs a path` }
      dir = value
    } else {
      rest.push(arg)
    }
  }
  return { ...(dir !== undefined ? { dir } : {}), rest }
}

/**
 * `<tool> config <sub> …`. `root` is the resolved project root. Returns the
 * exit code.
 *
 * Exit codes: 0 means success. 2 means the command cannot run as typed: an
 * unknown subcommand or option, a wrong number of arguments, conflicting
 * flags, an unknown setting name, or a value of the wrong type. Each is
 * decided from the arguments and the schema alone, with no file involved, so
 * running it again gives the same answer. 1 means a valid command that
 * failed: a file that will not parse, a key that is not set where you asked
 * to unset it, or a `get` that found nothing.
 *
 * A script can act on the difference: 2 means fix the command, 1 means look
 * at the state.
 */
export async function runConfigCommand(
  toolName: string,
  root: string,
  argv: string[],
  io: ConfigCommandIO,
): Promise<number> {
  const env = io.env ?? process.env
  const home = io.home ?? homedir()
  const fail = (message: string): number => {
    io.stderr(`${toolName}: ${message}\n`)
    return EXIT.error
  }

  const [sub, ...rest] = argv

  try {
    switch (sub) {
      // Usage on stdout with exit 0, because `--help` asked for it.
      case '-h':
      case '--help':
        io.stdout(usage())
        return EXIT.ok
      case undefined:
      case 'list':
        return await listCommand(toolName, root, rest, io, env, home)
      case 'get':
        return await getCommand(toolName, root, rest, io, env, home)
      case 'set':
        return await setCommand(toolName, root, rest, io, env, home)
      case 'unset':
        return await unsetCommand(toolName, root, rest, io, env, home)
      case 'path':
        return await pathCommand(toolName, rest, io, env, home, root)
      default:
        io.stderr(`${toolName}: unknown config command: ${sub}\n\n${usage()}`)
        return EXIT.usage
    }
  } catch (error) {
    // A ConfigError names its file and its problem. A setting that quietly did
    // not apply is worse than one that refused to load, so there is no silent
    // fallback.
    if (error instanceof ConfigError) return fail(error.message)
    throw error
  }
}

async function listCommand(
  toolName: string,
  root: string,
  argv: string[],
  io: ConfigCommandIO,
  env: Record<string, string | undefined>,
  home: string,
): Promise<number> {
  let json = false
  for (const arg of argv) {
    if (arg === '--json') json = true
    else {
      io.stderr(`${toolName}: unknown option: ${arg}\n\n${usage()}`)
      return EXIT.usage
    }
  }

  const loaded = await load(toolName, root, env, home, io.defaults)

  if (json) {
    const sources: Record<string, ConfigLayer> = {}
    for (const [key, layer] of loaded.sources) sources[key] = layer
    io.stdout(
      `${JSON.stringify({ effective: loaded.effective, sources, locations: loaded.locations }, null, 2)}\n`,
    )
  } else {
    // JSON.stringify leaves DEL and C1 characters raw, so the human listing
    // still goes through terminalSafe.
    const rows = [...loaded.sources].map(([key, layer]) => ({
      key: terminalSafe(key),
      value: terminalSafe(JSON.stringify(getConfigValue(loaded.effective, key))),
      layer,
    }))
    const keyWidth = rows.reduce((n, r) => Math.max(n, r.key.length), 0)
    const valueWidth = rows.reduce((n, r) => Math.max(n, r.value.length), 0)
    for (const row of rows) {
      io.stdout(`${pad(row.key, keyWidth)}  ${pad(row.value, valueWidth)}  (${row.layer})\n`)
    }
  }

  // Context and warnings go to stderr so `--json` stays machine-readable and
  // the plain listing stays greppable.
  io.stderr(`user:    ${await describeFile(loaded.locations.user)}\n`)
  if (loaded.locations.userEnvVar !== null)
    io.stderr(`         (from ${loaded.locations.userEnvVar})\n`)
  io.stderr(`project: ${await describeFile(loaded.locations.project)}\n`)
  for (const warning of loaded.warnings) io.stderr(`warning: ${warning}\n`)
  return EXIT.ok
}

async function getCommand(
  toolName: string,
  root: string,
  argv: string[],
  io: ConfigCommandIO,
  env: Record<string, string | undefined>,
  home: string,
): Promise<number> {
  const key = argv[0]
  if (key === undefined || argv.length > 1) {
    io.stderr(`${toolName}: config get takes exactly one key\n\n${usage()}`)
    return EXIT.usage
  }

  const loaded = await load(toolName, root, env, home, io.defaults)
  const value = getConfigValue(loaded.effective, key)
  // Warnings go to stderr rather than being hidden. `get` stays scriptable
  // because its stdout is only the value, and the user should hear about an
  // ignored key wherever they read the config.
  for (const warning of loaded.warnings) io.stderr(`warning: ${warning}\n`)
  if (value === undefined) {
    io.stderr(`${toolName}: no value for ${key}\n`)
    return EXIT.error
  }
  io.stdout(`${JSON.stringify(value)}\n`)
  return EXIT.ok
}

async function setCommand(
  toolName: string,
  root: string,
  argv: string[],
  io: ConfigCommandIO,
  env: Record<string, string | undefined>,
  home: string,
): Promise<number> {
  const taken = takeTarget(argv)
  if ('error' in taken) {
    io.stderr(`${toolName}: ${taken.error}\n\n${usage()}`)
    return EXIT.usage
  }
  const [key, raw] = taken.rest
  if (key === undefined || raw === undefined || taken.rest.length > 2) {
    io.stderr(`${toolName}: config set takes a key and a value\n\n${usage()}`)
    return EXIT.usage
  }

  // configLocations rather than loadConfig: where to write must not depend on
  // the other layer parsing, and `set --user` has to work when
  // WAYFINDER_CONFIG names a file that does not exist yet.
  const locations = configLocations(root, env, home)
  const file = taken.target === 'user' ? locations.user : locations.project

  // The raw record, not the validated one. Validation drops keys this version
  // does not know, so writing a validated document back would silently delete
  // a setting a newer version had written to the same file.
  const document = (await readRawConfigFile(file)) ?? {}

  let next: Record<string, unknown>
  try {
    next = setConfigValue(document, key, parseConfigValue(raw))
  } catch (error) {
    // A ConfigError with no file is about what was typed: an unknown setting
    // name, or a value of the wrong type. An empty `file` tells these apart
    // from the errors below, which are about a file.
    if (error instanceof ConfigError && error.file === '') {
      io.stderr(`${toolName}: ${error.message}\n\n${usage()}`)
      return EXIT.usage
    }
    throw error
  }

  // Validate the whole document before writing it. A refused value is only a
  // message, but a bad written value makes the file fail to load on every
  // later run. A failure here is a bad value already in the file, so the
  // error names the file and exits 1.
  validateConfig(next, file)
  await writeConfigFile(file, next)

  // Written, then warned about. Refusing the write would be odd, since the key
  // is real and the value is valid. But a silent write would let the author
  // believe the setting took effect, with only `loadConfig`'s warning, which
  // they may never read, saying otherwise.
  if (taken.target === 'project' && key === 'allowExec' && getConfigValue(next, key) === true) {
    io.stderr(
      `${toolName}: warning: allowExec: true in a project file is ignored — a repository cannot grant itself permission to run subprocesses; run "${BIN} trust" to trust this repository\n`,
    )
  }
  if (taken.target === 'project' && (key === 'trust.paths' || key === 'trust.owners')) {
    const written = getConfigValue(next, key)
    if (Array.isArray(written) && written.length > 0) {
      io.stderr(
        `${toolName}: warning: ${key} in a project file is ignored — a repository cannot grant itself trust; set it in your user config instead\n`,
      )
    }
  }

  io.stdout(terminalSafe(`${file}: ${key} = ${JSON.stringify(getConfigValue(next, key))}`) + '\n')
  return EXIT.ok
}

async function unsetCommand(
  toolName: string,
  root: string,
  argv: string[],
  io: ConfigCommandIO,
  env: Record<string, string | undefined>,
  home: string,
): Promise<number> {
  const taken = takeTarget(argv)
  if ('error' in taken) {
    io.stderr(`${toolName}: ${taken.error}\n\n${usage()}`)
    return EXIT.usage
  }
  const key = taken.rest[0]
  if (key === undefined || taken.rest.length > 1) {
    io.stderr(`${toolName}: config unset takes exactly one key\n\n${usage()}`)
    return EXIT.usage
  }

  const locations = configLocations(root, env, home)
  const file = taken.target === 'user' ? locations.user : locations.project

  const document = await readRawConfigFile(file)
  if (document === null || getConfigValue(document, key) === undefined) {
    // Reported as an error. Succeeding on a key that was not there would
    // suggest the setting is gone, which is wrong when the value is set in
    // the other layer.
    io.stderr(`${toolName}: ${key} is not set in ${file}\n`)
    return EXIT.error
  }

  const next = unsetConfigValue(document, key)
  await writeConfigFile(file, next)
  io.stdout(terminalSafe(`${file}: removed ${key}`) + '\n')
  return EXIT.ok
}

async function pathCommand(
  toolName: string,
  argv: string[],
  io: ConfigCommandIO,
  env: Record<string, string | undefined>,
  home: string,
  root: string,
): Promise<number> {
  // Every other subcommand rejects arguments it does not understand. If `path`
  // ignored them, a typo here would look like it worked.
  if (argv.length > 0) {
    io.stderr(`${toolName}: config path takes no arguments\n\n${usage()}`)
    return EXIT.usage
  }

  // Locations are resolved without reading either file's contents. Only
  // existence is checked. You use `config path` when a file will not load, so
  // it must not fail on the file it names.
  const locations = configLocations(root, env, home)
  io.stdout(`user:    ${await describeFile(locations.user)}\n`)
  if (locations.userEnvVar !== null) io.stdout(`         (from ${locations.userEnvVar})\n`)
  io.stdout(`project: ${await describeFile(locations.project)}\n`)
  return EXIT.ok
}
