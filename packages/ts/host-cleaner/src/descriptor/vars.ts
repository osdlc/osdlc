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
 *   command  a command's output, trimmed: argv only, with its own `env`
 *            entries, only when the program is on PATH, run from the home
 *            folder with a short time limit
 *   value    a fixed value, per OS or for all, which may use other variables
 *
 * A source that gives no value, or one that is not an absolute folder, moves
 * on to the next. A variable set in the config also wins over the sources of
 * the variables built from it: in each of those, the sources before the first
 * one that uses it are skipped. `HOME` and the `XDG_*` folders are built in,
 * the `XDG_*` ones with their XDG defaults on every OS.
 */

import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, join, normalize, sep } from 'node:path'

import { getIn } from '@osdlc/config-layers'
import { parse as parseToml } from 'smol-toml'
import { parse as parseYaml } from 'yaml'

import { runFailure } from '../helpers.ts'
import type { Kit } from '../kit.ts'
import { within } from '../roots.ts'
import type { VarValue, Vars } from '../types.ts'
import type { Os } from './schema.ts'
import {
  BUILT_IN_VARS,
  VAR_FILE_EXTENSIONS,
  VAR_REF,
  sourceTemplates,
  varRefs,
  type VarFileExtension,
} from './var-names.ts'

export { BUILT_IN_VARS, VAR_FILE_EXTENSIONS, badVarRef, varRefs } from './var-names.ts'
export type { VarValue, Vars } from '../types.ts'

/** How long a `command` source may run, or a `file` source be read, before the next source is tried. */
export const VAR_COMMAND_LIMIT_MS = 5_000

/** The parser for each extension a `file` source may have. */
const PARSERS = {
  '.toml': parseToml,
  '.json': JSON.parse,
  '.yaml': parseYaml,
  '.yml': parseYaml,
} satisfies Record<VarFileExtension, (text: string) => unknown>

/** A folder per OS; `all` covers every OS. */
type PerOs = { [K in Os | 'all']?: string | undefined }

/** Where one variable's value may come from, as a descriptor's `vars` lists it. */
export type VarSource =
  | { env: string }
  | { file: string; key: string }
  | { command: string[]; env?: Record<string, string> | undefined }
  | { value: string | PerOs }

/** The text of `v` on `os`: `v` itself, its `all`, or its `os` entry. */
export const forOs = (v: string | PerOs, os: Os): string | undefined =>
  typeof v === 'string' ? v : (v.all ?? v[os])

/** How `source` is named in an outcome. A `command` source may have `env` too, so it is told apart first. */
function describeSource(source: VarSource): string {
  if ('command' in source) return `command ${source.command.join(' ')}`
  if ('env' in source) return `env ${source.env}`
  if ('file' in source) return `file ${source.file} key ${source.key}`
  return 'value'
}

/**
 * `path` with a leading `~` read as `home`, normalized and without a trailing
 * separator, except on a root such as `/` or `C:\`, which would then be
 * relative.
 */
function folderOf(path: string, home: string): string {
  const full = path === '~' ? home : /^~[/\\]/.test(path) ? join(home, path.slice(2)) : path
  const n = normalize(full)
  const bare = n.endsWith(sep) ? n.slice(0, -1) : n
  return bare === '' || /^[A-Za-z]:$/.test(bare) ? n : bare
}

/**
 * `template` with each `${NAME}` replaced by its value in `vars`, `~` read as
 * `home`. Trusted when it starts with a trusted variable as a whole folder
 * name (`${VAR}` alone or followed by a separator) and stays inside that
 * variable's folder, by real paths. `missing` names the first variable with no
 * value.
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
  /**
   * Whether an `XDG_*` folder the environment sets is trusted, as the person's
   * own setting: given the folder, absolute and normalized. Default: never.
   */
  trustsXdg?: ((folder: string) => boolean) | undefined
  /** Runs `command` sources: `onPath` decides whether one runs, `run` runs it. */
  kit: Pick<Kit, 'onPath' | 'run'>
  /** The hook's signal; a command still running when it aborts gives no value. */
  signal: AbortSignal
  /** Each command's, and each file read's, time limit. Default {@link VAR_COMMAND_LIMIT_MS}. */
  timeoutMs?: number | undefined
  /**
   * The declared variables to resolve; default all. The ones their sources use
   * are resolved as those sources need them. The rest, and the built-ins none
   * of these use, are left out of the outcome, and their commands never run.
   */
  only?: Iterable<string> | undefined
}

type Given = { value: string; trusted: boolean } | { failed: string }

/**
 * Every variable in `declared` and the built-ins, or those `at.only` uses,
 * resolved now. Variables that don't use each other resolve at the same time; one
 * variable's sources are tried one at a time. So a descriptor whose longest
 * chain of variables has `n` command sources can take `n` times the time
 * limit.
 */
export async function resolveVars(
  declared: Readonly<Record<string, readonly VarSource[]>>,
  at: VarsAt,
): Promise<Vars> {
  const done: Vars = builtIns(at)
  const refs = refsMemo(at.os)
  const fromConfig = configSet(declared, at.config, refs)
  const limit = at.timeoutMs ?? VAR_COMMAND_LIMIT_MS
  const started = new Map<string, Promise<void>>()
  // Which variables each one is waiting for. A wait that would close a cycle
  // is not made, so a variable on a cycle gives no value instead of hanging.
  const waits = new Map<string, Set<string>>()
  const waitsFor = (from: string, to: string): boolean => {
    const seen = new Set<string>()
    const todo = [from]
    for (let n = todo.pop(); n !== undefined; n = todo.pop()) {
      if (n === to) return true
      if (seen.has(n)) continue
      seen.add(n)
      todo.push(...(waits.get(n) ?? []))
    }
    return false
  }

  // Every name asked for or used by a source on the way, built in or declared.
  const asked = new Set<string>()

  /** Resolves `name`, a variable `by`'s sources use, or one asked for when `by` is undefined. */
  const resolve = async (name: string, by?: string): Promise<void> => {
    asked.add(name)
    if (!started.has(name) && (Object.hasOwn(done, name) || !Object.hasOwn(declared, name))) return
    if (by !== undefined && waitsFor(name, by)) return
    let running = started.get(name)
    if (running === undefined) {
      // Started on a later tick, so `started` and the wait below are in place first.
      running = Promise.resolve().then(async () => {
        done[name] = await resolveOne(name, declared[name]!)
      })
      started.set(name, running)
    }
    if (by === undefined) return running
    if (!waits.has(by)) waits.set(by, new Set())
    waits.get(by)!.add(name)
    try {
      await running
    } finally {
      waits.get(by)!.delete(name)
    }
  }

  /** `template`, which a source of `by` holds, filled once every variable it uses is resolved. */
  const fill = async (template: string, by: string): Promise<Given> => {
    await Promise.all([...new Set(varRefs(template))].map((ref) => resolve(ref, by)))
    const filled = fillTemplate(template, done, at.home)
    return 'missing' in filled
      ? { failed: `\${${filled.missing}} has no value` }
      : { value: filled.path, trusted: filled.trusted }
  }

  const fromSource = async (source: VarSource, by: string): Promise<Given> => {
    if ('command' in source) return commandValue(source, at, limit)
    if ('env' in source) {
      const v = ownValue(at.env, source.env)
      if (v === undefined || v === '') return { failed: 'not set' }
      // An `XDG_*` folder read this way keeps the trust its built-in has.
      const xdg = Object.hasOwn(BUILT_IN_VARS, source.env) ? done[source.env] : undefined
      const trusted = xdg?.from === `env ${source.env}` && xdg.trusted
      return { value: v, trusted }
    }
    if ('file' in source) {
      const file = await fill(source.file, by)
      if ('failed' in file) return file
      const v = await keyIn(file.value, source.key, at.signal, limit)
      return typeof v === 'string' ? { value: v, trusted: false } : { failed: v.failed }
    }
    const template = forOs(source.value, at.os)
    return template === undefined ? { failed: `none for ${at.os}` } : fill(template, by)
  }

  const resolveOne = async (name: string, sources: readonly VarSource[]): Promise<VarValue> => {
    const set = ownValue(at.config, name)
    if (set !== undefined) {
      return { value: folderOf(set, at.home), from: 'config', trusted: true, tried: [] }
    }
    const tried: VarValue['tried'] = []
    const uses = (s: VarSource) => refs(s).find((r) => fromConfig.has(r))
    const first = sources.findIndex((s) => uses(s) !== undefined)
    if (first > 0) {
      const failed = `skipped: \${${uses(sources[first]!)}} is set in the config`
      for (const source of sources.slice(0, first)) {
        tried.push({ source: describeSource(source), failed })
      }
    }
    for (const source of sources.slice(Math.max(first, 0))) {
      const given = await fromSource(source, name)
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

  await Promise.all([...new Set(at.only ?? Object.keys(declared))].map((name) => resolve(name)))
  return Object.fromEntries(
    [...Object.keys(BUILT_IN_VARS), ...Object.keys(declared)]
      .filter((n) => Object.hasOwn(done, n) && (at.only === undefined || asked.has(n)))
      .map((n) => [n, done[n]!]),
  )
}

/**
 * The names `source`'s folder templates use on `os`: those of
 * {@link sourceTemplates} that apply there, a per-OS `value`'s `all` before
 * its `os` entry, as {@link forOs} reads it.
 */
function refsOf(source: VarSource, os: Os): string[] {
  const templates = sourceTemplates(source)
  const perOs = templates.filter((t) => t.os !== undefined)
  const onOs = perOs.find((t) => t.os === 'all') ?? perOs.find((t) => t.os === os)
  const apply = templates.filter((t) => t.os === undefined || t === onOs)
  return apply.flatMap((t) => varRefs(t.text))
}

/** {@link refsOf} on `os`, worked out once per source. */
function refsMemo(os: Os): (source: VarSource) => string[] {
  const memo = new Map<VarSource, string[]>()
  return (source) => {
    let refs = memo.get(source)
    if (refs === undefined) {
      refs = refsOf(source, os)
      memo.set(source, refs)
    }
    return refs
  }
}

/**
 * The declared variables the config sets, and those with a source on `at.os`
 * that uses one of them, at any depth.
 */
function configSet(
  declared: Readonly<Record<string, readonly VarSource[]>>,
  config: VarsAt['config'],
  refs: (source: VarSource) => string[],
): Set<string> {
  const out = new Set(Object.keys(declared).filter((n) => ownValue(config, n) !== undefined))
  for (let grew = true; grew;) {
    grew = false
    for (const [name, sources] of Object.entries(declared)) {
      if (out.has(name) || !sources.some((s) => refs(s).some((r) => out.has(r)))) continue
      out.add(name)
      grew = true
    }
  }
  return out
}

/** `record[name]` when `record` has it as its own key, so `constructor` is not read from the prototype. */
function ownValue<T>(record: Readonly<Record<string, T>> | undefined, name: string): T | undefined {
  return record !== undefined && Object.hasOwn(record, name) ? record[name] : undefined
}

/** The built-ins, in an object with no prototype, so a declared `constructor` or `__proto__` is an ordinary key. */
function builtIns(at: Pick<VarsAt, 'home' | 'env' | 'trustsXdg'>): Vars {
  const out = Object.create(null) as Vars
  out.HOME = { value: folderOf(at.home, at.home), from: 'home', trusted: false, tried: [] }
  for (const [name, under] of Object.entries(BUILT_IN_VARS)) {
    if (under === undefined) continue
    const set = at.env[name]
    if (set !== undefined && set !== '' && isAbsolute(set)) {
      const value = folderOf(set, at.home)
      const trusted = at.trustsXdg?.(value) === true
      out[name] = { value, from: `env ${name}`, trusted, tried: [] }
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

/**
 * The text of the regular file `file`, or why there is none: a FIFO or other
 * special file is not read, and a read still waiting after `limit`, as on a
 * stalled network mount, gives up and is stopped. A read the system call
 * already blocks holds its thread until that call returns.
 */
async function textOf(
  file: string,
  signal: AbortSignal,
  limit: number,
): Promise<string | { failed: string }> {
  const stop = new AbortController()
  const read = (async () => {
    if (!(await stat(file)).isFile()) return { failed: `${file} is not a file` }
    return readFile(file, { encoding: 'utf-8', signal: AbortSignal.any([signal, stop.signal]) })
  })()
  // The read may end after the limit; its outcome is then dropped.
  read.catch(() => undefined)
  let timer: NodeJS.Timeout | undefined
  const late = new Promise<{ failed: string }>((done) => {
    timer = setTimeout(() => {
      done({ failed: `${file} not read within ${limit / 1000} s` })
      stop.abort()
    }, limit)
  })
  try {
    return await Promise.race([read, late])
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    return { failed: code === 'ENOENT' ? `no file ${file}` : `cannot read ${file}: ${code}` }
  } finally {
    clearTimeout(timer)
  }
}

/** The string at the dotted `key` in the TOML, JSON or YAML file at `file`, or why there is none. */
async function keyIn(
  file: string,
  key: string,
  signal: AbortSignal,
  limit: number,
): Promise<string | { failed: string }> {
  const text = await textOf(file, signal, limit)
  if (typeof text !== 'string') return text
  // The schema allows only these extensions, and a filled template keeps its
  // end. Matched on the end, as the schema does, so `.yaml` alone is YAML.
  const ext = VAR_FILE_EXTENSIONS.find((e) => file.endsWith(e))
  if (ext === undefined) return { failed: `${file} is not a TOML, JSON or YAML file` }
  const parse: (text: string) => unknown = PARSERS[ext]
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

/** The one line `source.command` prints, run from home within `limit`, or why there is none. */
async function commandValue(
  source: { command: readonly string[]; env?: Readonly<Record<string, string>> | undefined },
  at: Pick<VarsAt, 'home' | 'kit' | 'signal'>,
  limit: number,
): Promise<Given> {
  const argv = source.command
  const program = argv[0]!
  if (!at.kit.onPath(program)) return { failed: `${program} is not on PATH` }
  let r
  try {
    r = await at.kit.run(argv, {
      signal: at.signal,
      cwd: at.home,
      env: source.env,
      timeoutMs: limit,
    })
  } catch (err) {
    return { failed: `did not run: ${(err as Error).message}` }
  }
  if (r.reason === 'timeout') return { failed: `timed out after ${limit / 1000} s` }
  if (!r.ok) {
    const { how, said } = runFailure(r)
    return { failed: said === '' ? how : `${how}: ${said}` }
  }
  const out = r.stdout.trim()
  if (out === '') return { failed: 'printed nothing' }
  if (out.includes('\n')) return { failed: 'printed more than one line' }
  return { value: out, trusted: false }
}
