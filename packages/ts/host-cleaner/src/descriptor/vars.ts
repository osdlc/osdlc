/**
 * Descriptor variables (tier 2): a `${VAR}` in a folder is worked out on each
 * survey, so a store a person moved is found. {@link resolveVars} gives every
 * variable's value, the source that gave it and why each earlier source gave
 * none. A variable takes the first value of:
 *
 *   config   `plugins.<name>.vars.<VAR>`, which is trusted: its folder may
 *            sit outside the home folder
 *   env      an environment variable
 *   file     a key in a TOML, JSON or YAML file
 *   command  a command's output, trimmed: argv only, only when the program is
 *            on PATH, run from the home folder with a short time limit
 *   value    a fixed value, per OS or for all, which may use other variables
 *
 * A source that gives no value, or one that is not an absolute folder, moves
 * on to the next. `HOME` and the `XDG_*` folders are built in, the `XDG_*`
 * ones with their XDG defaults on every OS.
 */

import { readFile } from 'node:fs/promises'
import { extname, isAbsolute, join, normalize, sep } from 'node:path'

import { getIn } from '@osdlc/config-layers'
import { parse as parseToml } from 'smol-toml'
import { parse as parseYaml } from 'yaml'

import type { Kit } from '../kit.ts'
import type { Os } from './schema.ts'

/** How long a `command` source may run before the next source is tried. */
export const VAR_COMMAND_LIMIT_MS = 5_000

/**
 * The variables every descriptor has: each `XDG_*` folder with its default
 * under the home folder, used when the environment does not set it to an
 * absolute path, as the tools that read them do.
 */
export const BUILT_IN_VARS = {
  HOME: undefined,
  XDG_CACHE_HOME: '.cache',
  XDG_DATA_HOME: '.local/share',
  XDG_CONFIG_HOME: '.config',
  XDG_STATE_HOME: '.local/state',
} as const satisfies Record<string, string | undefined>

/** A `${VAR}` reference; the name is an environment variable's name. */
const VAR_REF = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g

/** The parser for each extension a `file` source may have. */
const PARSERS = {
  '.toml': parseToml,
  '.json': JSON.parse,
  '.yaml': parseYaml,
  '.yml': parseYaml,
} satisfies Record<string, (text: string) => unknown>

type VarFileExtension = keyof typeof PARSERS

/** The extensions a `file` source may have, by the format read. */
export const VAR_FILE_EXTENSIONS = Object.keys(PARSERS) as VarFileExtension[]

/** A folder per OS; `all` covers every OS. */
type PerOs = { [K in Os | 'all']?: string | undefined }

/** Where one variable's value may come from, as a descriptor's `vars` lists it. */
export type VarSource =
  | { env: string }
  | { file: string; key: string }
  | { command: string[] }
  | { value: string | PerOs }

/** The text of `v` on `os`: `v` itself, its `all`, or its `os` entry. */
export const forOs = (v: string | PerOs, os: Os): string | undefined =>
  typeof v === 'string' ? v : (v.all ?? v[os])

/** One variable's outcome. */
export interface VarValue {
  /** The folder, absolute and normalized; null when no source gave one. */
  value: string | null
  /**
   * The source that gave it, as {@link describeSource} names it; `config`;
   * `home` for `HOME`; or `default` for an `XDG_*` folder's default.
   */
  from?: string
  /**
   * Set in the config, or a `value` inside a trusted variable's folder
   * ({@link fillTemplate}): its folders may sit outside home.
   */
  trusted: boolean
  /** The sources before it that gave nothing, in order, and why. */
  tried: Array<{ source: string; failed: string }>
}

/** Every variable's outcome: the built-ins, then the declared ones in the order declared. */
export type Vars = Record<string, VarValue>

/** The names `text` refers to as `${NAME}`, in order, repeats kept. */
export const varRefs = (text: string): string[] => [...text.matchAll(VAR_REF)].map((m) => m[1]!)

/** Whether `text` has a `${` that is not a well-formed `${NAME}`. */
export const badVarRef = (text: string): boolean => text.replace(VAR_REF, '').includes('${')

/** How `source` is named in an outcome. */
function describeSource(source: VarSource): string {
  if ('env' in source) return `env ${source.env}`
  if ('file' in source) return `file ${source.file} key ${source.key}`
  if ('command' in source) return `command ${source.command.join(' ')}`
  return 'value'
}

/** `path` with a leading `~` read as `home`, normalized and without a trailing separator. */
function folderOf(path: string, home: string): string {
  const full = path === '~' ? home : /^~[/\\]/.test(path) ? join(home, path.slice(2)) : path
  const n = normalize(full)
  return n.length > 1 && n.endsWith(sep) ? n.slice(0, -1) : n
}

/** Whether `path` is `folder` or inside it. */
const within = (folder: string, path: string): boolean =>
  path === folder || path.startsWith(folder.endsWith(sep) ? folder : folder + sep)

/**
 * `template` with each `${NAME}` replaced by its value in `vars`, `~` read as
 * `home`. Trusted when it starts with a trusted variable as a whole folder
 * name (`${VAR}` alone or followed by a separator) and stays inside that
 * variable's folder. `missing` names the first variable with no value.
 */
export function fillTemplate(
  template: string,
  vars: Readonly<Vars>,
  home: string,
): { path: string; trusted: boolean } | { missing: string } {
  const refs = varRefs(template)
  for (const name of refs) {
    if (!Object.hasOwn(vars, name) || vars[name]!.value === null) return { missing: name }
  }
  const text = template.replace(VAR_REF, (_, name: string) => vars[name]!.value!)
  const path = folderOf(text, home)
  const first = refs[0]
  const lead = first === undefined ? '' : `\${${first}}`
  const trusted =
    first !== undefined &&
    vars[first]!.trusted &&
    template.startsWith(lead) &&
    /^([/\\]|$)/.test(template.slice(lead.length)) &&
    within(vars[first]!.value!, path)
  return { path, trusted }
}

export interface VarsAt {
  home: string
  os: Os
  /** The environment `env` sources and the `XDG_*` built-ins read. */
  env: Readonly<Record<string, string | undefined>>
  /** The config's `plugins.<name>.vars`: each wins over every source, and is trusted. */
  config?: Readonly<Record<string, string | undefined>> | undefined
  /** Runs `command` sources: `onPath` decides whether one runs, `run` runs it. */
  kit: Pick<Kit, 'onPath' | 'run'>
  /** The hook's signal; a command still running when it aborts gives no value. */
  signal: AbortSignal
  /** Each command's time limit. Default {@link VAR_COMMAND_LIMIT_MS}. */
  timeoutMs?: number | undefined
  /**
   * The declared variables to resolve, with the ones they use; default all.
   * The rest are left out of the outcome, and their commands never run.
   */
  only?: Iterable<string> | undefined
}

type Given = { value: string; trusted: boolean } | { failed: string }

/**
 * Every variable in `declared`, or in `at.only`, and the built-ins, resolved
 * now. Commands run one at a time, so a descriptor with `n` command sources
 * can take `n` times the time limit.
 */
export async function resolveVars(
  declared: Readonly<Record<string, readonly VarSource[]>>,
  at: VarsAt,
): Promise<Vars> {
  const done: Vars = builtIns(at)
  const visiting = new Set<string>()
  const limit = at.timeoutMs ?? VAR_COMMAND_LIMIT_MS

  const resolve = async (name: string): Promise<void> => {
    if (Object.hasOwn(done, name) || !Object.hasOwn(declared, name) || visiting.has(name)) return
    visiting.add(name)
    done[name] = await resolveOne(name, declared[name]!)
    visiting.delete(name)
  }

  /** `template` filled, once every variable it uses is resolved. */
  const fill = async (template: string): Promise<Given> => {
    for (const ref of varRefs(template)) await resolve(ref)
    const filled = fillTemplate(template, done, at.home)
    return 'missing' in filled
      ? { failed: `\${${filled.missing}} has no value` }
      : { value: filled.path, trusted: filled.trusted }
  }

  const fromSource = async (source: VarSource): Promise<Given> => {
    if ('env' in source) {
      const v = ownValue(at.env, source.env)
      return v === undefined || v === '' ? { failed: 'not set' } : { value: v, trusted: false }
    }
    if ('file' in source) {
      const file = await fill(source.file)
      if ('failed' in file) return file
      const v = await keyIn(file.value, source.key)
      return typeof v === 'string' ? { value: v, trusted: false } : { failed: v.failed }
    }
    if ('command' in source) return commandValue(source.command, at, limit)
    const template = forOs(source.value, at.os)
    return template === undefined ? { failed: `none for ${at.os}` } : fill(template)
  }

  const resolveOne = async (name: string, sources: readonly VarSource[]): Promise<VarValue> => {
    const set = ownValue(at.config, name)
    if (set !== undefined) {
      return { value: folderOf(set, at.home), from: 'config', trusted: true, tried: [] }
    }
    const tried: VarValue['tried'] = []
    for (const source of sources) {
      const given = await fromSource(source)
      const said = describeSource(source)
      if ('failed' in given) {
        tried.push({ source: said, failed: given.failed })
        continue
      }
      const value = folderOf(given.value, at.home)
      if (!isAbsolute(value)) {
        tried.push({ source: said, failed: `${given.value} is not an absolute folder` })
        continue
      }
      return { value, from: said, trusted: given.trusted, tried }
    }
    return { value: null, trusted: false, tried }
  }

  for (const name of at.only ?? Object.keys(declared)) await resolve(name)
  return Object.fromEntries(
    [...Object.keys(BUILT_IN_VARS), ...Object.keys(declared)]
      .filter((n) => Object.hasOwn(done, n))
      .map((n) => [n, done[n]!]),
  )
}

/** `record[name]` when `record` has it as its own key, so `constructor` is not read from the prototype. */
function ownValue<T>(record: Readonly<Record<string, T>> | undefined, name: string): T | undefined {
  return record !== undefined && Object.hasOwn(record, name) ? record[name] : undefined
}

/** The built-ins, in an object with no prototype, so a declared `constructor` or `__proto__` is an ordinary key. */
function builtIns(at: Pick<VarsAt, 'home' | 'env'>): Vars {
  const out = Object.create(null) as Vars
  out.HOME = { value: folderOf(at.home, at.home), from: 'home', trusted: false, tried: [] }
  for (const [name, under] of Object.entries(BUILT_IN_VARS)) {
    if (under === undefined) continue
    const set = at.env[name]
    if (set !== undefined && set !== '' && isAbsolute(set)) {
      out[name] = { value: folderOf(set, at.home), from: `env ${name}`, trusted: false, tried: [] }
      continue
    }
    out[name] = {
      value: join(at.home, under),
      from: 'default',
      trusted: false,
      tried: [
        {
          source: `env ${name}`,
          failed: set === undefined || set === '' ? 'not set' : `${set} is not an absolute folder`,
        },
      ],
    }
  }
  return out
}

/** The string at the dotted `key` in the TOML, JSON or YAML file at `file`, or why there is none. */
async function keyIn(file: string, key: string): Promise<string | { failed: string }> {
  let text: string
  try {
    text = await readFile(file, 'utf-8')
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    return { failed: code === 'ENOENT' ? `no file ${file}` : `cannot read ${file}: ${code}` }
  }
  // The schema allows only these extensions, and a filled template keeps its end.
  const parse: (text: string) => unknown = PARSERS[extname(file) as VarFileExtension]
  let data: unknown
  try {
    data = parse(text)
  } catch (err) {
    return { failed: `${file} does not parse: ${(err as Error).message.split('\n')[0]}` }
  }
  const at = getIn(data, key.split('.'))
  if (!at.found) return { failed: `${file} has no ${key}` }
  return typeof at.value === 'string' && at.value !== ''
    ? at.value
    : { failed: `${key} in ${file} is not a string` }
}

/** The one line `argv` prints, run from home within `limit`, or why there is none. */
async function commandValue(
  argv: readonly string[],
  at: Pick<VarsAt, 'home' | 'kit' | 'signal'>,
  limit: number,
): Promise<Given> {
  const program = argv[0]!
  if (!at.kit.onPath(program)) return { failed: `${program} is not on PATH` }
  let r
  try {
    r = await at.kit.run(argv, { signal: at.signal, cwd: at.home, timeoutMs: limit })
  } catch (err) {
    return { failed: `did not run: ${(err as Error).message}` }
  }
  if (r.reason === 'timeout') return { failed: `timed out after ${limit / 1000} s` }
  if (!r.ok) {
    const said = (r.stderr || r.error || '').trim().split('\n')[0] ?? ''
    const how =
      r.neverExited === true ? `did not run (${r.reason ?? 'unknown'})` : `exit ${r.exitCode}`
    return { failed: said === '' ? how : `${how}: ${said}` }
  }
  const out = r.stdout.trim()
  if (out === '') return { failed: 'printed nothing' }
  if (out.includes('\n')) return { failed: 'printed more than one line' }
  return { value: out, trusted: false }
}
