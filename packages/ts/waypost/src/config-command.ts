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
import { EXIT, type CliIo } from '@osdlc/cli-tool'

/**
 * A VIEW of `CliIo`: the same output seam, plus the environment this command
 * needs injected.
 */
export interface ConfigCommandIO extends CliIo {
  /** Defaults to `process.env`. Supplies `WAYPOST_CONFIG` and `XDG_CONFIG_HOME`. */
  env?: Record<string, string | undefined>
  /** Defaults to `os.homedir()`. The base for the non-XDG user path. */
  home?: string
  /**
   * waypost's own defaults, between `DEFAULT_CONFIG` and the user file
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
 * `loadConfig`, with the calling tool's defaults slid in under the file layers.
 *
 * `sources` is left alone on purpose: a value the tool defaulted still came
 * from no file, so `(default)` remains the honest attribution. Only the VALUE
 * that label is attached to changes.
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

/** `<path> (exists)` / `<path> (missing)` — the question `config path` is asked to answer. */
async function describeFile(file: string): Promise<string> {
  return `${file} ${(await exists(file)) ? '(exists)' : '(missing)'}`
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length)
}

/**
 * Split `--user` / `--project` off the argument list, leaving the positionals.
 *
 * The two contradict each other, and both callers WRITE, so a last-one-wins
 * reading would silently edit a file the user named the other of. A pair is a
 * usage error instead.
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
 * Exit codes: 0 succeeded. 2 means the
 * command cannot be run as typed — an unknown subcommand or option, a wrong
 * argument count, contradictory flags, an unknown setting name, a value of the
 * wrong type for its setting. Every one of those is decided from the argument
 * list and the static schema alone, with no file involved, so re-running it can
 * only produce the same answer. 1 means a well-formed command that FAILED: a
 * file that will not parse, a key that is not set where you asked to unset it,
 * a `get` that found nothing.
 *
 * The split matters because a script can act on it — 2 means fix the command,
 * 1 means look at the state.
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
      // Usage on stdout with exit 0: `--help` is what was asked for, not a
      // misuse of the command.
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
    // A ConfigError names its file and its problem, and that is the whole point
    // of it: a setting that quietly did not apply is worse than one that
    // refused to load, so this never degrades to a silent fallback.
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
    const rows = [...loaded.sources].map(([key, layer]) => ({
      key,
      value: JSON.stringify(getConfigValue(loaded.effective, key)),
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
  if (loaded.locations.userFromEnv) io.stderr(`         (from ${CONFIG_ENV_VAR})\n`)
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
  // Warnings go to stderr rather than being suppressed: `get` stays scriptable
  // because its STDOUT is only the value, and a file with an ignored key is
  // something the user wants told wherever they read from it.
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

  // configLocations rather than loadConfig: resolving where to write must not
  // depend on the OTHER layer parsing, and `set --user` has to work when
  // WAYPOST_CONFIG names a file that does not exist yet.
  const locations = configLocations(root, env, home)
  const file = taken.target === 'user' ? locations.user : locations.project

  // The RAW record, not the validated one: validation drops keys this version
  // does not know, so writing a validated document back would silently delete a
  // setting a newer version had written into the same file.
  const document = (await readRawConfigFile(file)) ?? {}

  let next: Record<string, unknown>
  try {
    next = setConfigValue(document, key, parseConfigValue(raw))
  } catch (error) {
    // A ConfigError carrying no file is about what was TYPED — an unknown
    // setting name, or a value of the wrong type for a known one. `file` is
    // what separates those from the errors below, which are about a file.
    if (error instanceof ConfigError && error.file === '') {
      io.stderr(`${toolName}: ${error.message}\n\n${usage()}`)
      return EXIT.usage
    }
    throw error
  }

  // Validate the whole document before it reaches disk. A refused value is a
  // message; a written one is a file that fails to load on every later run.
  // A failure HERE names the file — a bad value already in it — so it exits 1.
  validateConfig(next, file)
  await writeConfigFile(file, next)

  // Written, then contradicted. Refusing the write would be a stranger failure
  // — the key is real and the value is valid — but a silent write would leave
  // the author believing the setting took effect, and only `loadConfig`'s
  // warning, which they may never read, would say otherwise.
  if (taken.target === 'project' && key === 'allowExec' && getConfigValue(next, key) === true) {
    io.stderr(
      `${toolName}: warning: allowExec: true in a project file is ignored — a repository cannot grant itself permission to run subprocesses; run "${toolName} trust" to trust this repository\n`,
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

  io.stdout(`${file}: ${key} = ${JSON.stringify(getConfigValue(next, key))}\n`)
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
    // Reported rather than shrugged off: "unset" succeeding on a key that was
    // never there reads as "the setting is gone from where I meant", which is
    // wrong whenever the value actually lives in the other layer.
    io.stderr(`${toolName}: ${key} is not set in ${file}\n`)
    return EXIT.error
  }

  const next = unsetConfigValue(document, key)
  await writeConfigFile(file, next)
  io.stdout(`${file}: removed ${key}\n`)
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
  // Every sibling rejects arguments it does not understand. `path` swallowing
  // them silently would make it the one place a typo looks like it worked.
  if (argv.length > 0) {
    io.stderr(`${toolName}: config path takes no arguments\n\n${usage()}`)
    return EXIT.usage
  }

  // Locations are resolved without reading or parsing either file's CONTENTS —
  // existence is all this checks. `config path` is the command you reach for
  // when a file will not load, so it must not fail on the file it names.
  const locations = configLocations(root, env, home)
  io.stdout(`user:    ${await describeFile(locations.user)}\n`)
  if (locations.userFromEnv) io.stdout(`         (from ${CONFIG_ENV_VAR})\n`)
  io.stdout(`project: ${await describeFile(locations.project)}\n`)
  return EXIT.ok
}
