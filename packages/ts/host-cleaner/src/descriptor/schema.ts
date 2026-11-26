/**
 * The descriptor format, `descriptor: 1`: a plugin written as a YAML (or JSON)
 * file. `DescriptorSchema` checks it; `schemas/descriptor-1.json` is the same
 * schema as JSON Schema, for editors (`scripts/write-descriptor-schema.ts`
 * writes it). The checks one field can't make on its own, such as a
 * candidate's `path` naming an entry of `paths`, are refinements that only the
 * reader runs. So are the checks on `vars` (tier 2), {@link varIssues}.
 */

import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { LineCounter, isMap, isScalar, isSeq, parseDocument, type Document } from 'yaml'

import { COST_DESCRIPTIONS } from '../cost.ts'
import {
  BUILT_IN_VARS,
  VAR_FILE_EXTENSIONS,
  badVarRef,
  sourceTemplates,
  varRefs,
} from './var-names.ts'

/** The format version this reader takes. */
export const DESCRIPTOR_VERSION = 1

/**
 * Where the JSON Schema is published; a descriptor's `$schema` may name it.
 * The file name carries the format version, so the URL names no release.
 */
export const DESCRIPTOR_SCHEMA_URL =
  'https://unpkg.com/@osdlc/host-cleaner/schemas/descriptor-1.json'

/** How many glob matches become candidates of their own before the rest are combined into one. */
export const DEFAULT_MAX_ENTRIES = 200

/** The operating systems a path may differ on. */
export const OSES = ['macos', 'linux', 'windows'] as const

export type Os = (typeof OSES)[number]

/** A `..` segment, which would climb out of where a path or glob is anchored. */
const CLIMBS = /(^|[/\\])\.\.([/\\]|$)/

/**
 * A glob alternative that climbs or starts outside: a `..` segment, or a
 * leading `/`, `\`, `~/` or drive, at the start or after a brace's `{` or `,`.
 * Test it on each of {@link braceExpansions}' results too, for one that a brace
 * splits, such as `.{.,x}`.
 */
const GLOB_ESCAPES = /(^|[/\\{,])\.\.([/\\},]|$)|(^|[{,])([/\\]|~([/\\,}]|$)|[A-Za-z]:)/

/**
 * A home folder, or the folder that holds them, written out: `/root`,
 * `/var/root`, `/home/<user>` (also under `/var`, `/usr` or `/export`),
 * `/Users/<user>`, `C:\Users\<user>` (also as WSL's `/mnt/c/Users/<user>`),
 * `${HOME}` or `${USERPROFILE}`. Test it on {@link withoutDots}' result.
 */
const HOME_FOLDER =
  /^(\/root|\/(private[/\\])?var[/\\]root|\/(((var|usr|export)[/\\])?home|Users)([/\\][^/]*)?|(\/mnt[/\\][A-Za-z]|[A-Za-z]:)[/\\]Users([/\\][^/\\]*)?|\$\{(HOME|USERPROFILE)\})[/\\]*$/i

const NAME = /^[A-Za-z][A-Za-z0-9_-]*$/

/** Whether a path names something below where it starts: a segment other than empty or `.`. */
const namesEntry = (p: string): boolean =>
  p.split(/[/\\]/).some((part) => part !== '' && part !== '.')

/** `p` without its `.` segments and with each run of separators as one: `//home/./alice` is `/home/alice`. */
const withoutDots = (p: string): string =>
  p.replace(/[/\\]\.(?=[/\\]|$)/g, '').replace(/([/\\])[/\\]+/g, '$1')

/** Past this many `{a,b}` alternatives, a glob is refused rather than expanded. */
const MAX_ALTERNATIVES = 1024

/**
 * Every string the `{a,b}` alternatives in `glob` expand to, nested ones too; a
 * brace with no comma of its own stays as written. Undefined past
 * {@link MAX_ALTERNATIVES}.
 */
export function braceExpansions(glob: string): string[] | undefined {
  if (lastExpanded?.glob !== glob) lastExpanded = { glob, expansions: expand(glob) }
  return lastExpanded.expansions
}

/** The last glob {@link braceExpansions} expanded, since each glob's checks ask for it in turn. */
let lastExpanded: { glob: string; expansions: string[] | undefined } | undefined

function expand(glob: string): string[] | undefined {
  const out: string[] = []
  const todo = [glob]
  for (let g = todo.pop(); g !== undefined; g = todo.pop()) {
    const bounds = outermostBraces(g)
    if (bounds === undefined) out.push(g)
    else {
      // Counted before they are built, so one wide brace never builds them all.
      if (out.length + todo.length + bounds.length - 1 > MAX_ALTERNATIVES) return undefined
      const [open, close] = [bounds[0]!, bounds.at(-1)!]
      for (let k = 0; k + 1 < bounds.length; k++)
        todo.push(g.slice(0, open) + g.slice(bounds[k]! + 1, bounds[k + 1]) + g.slice(close + 1))
    }
    if (out.length + todo.length > MAX_ALTERNATIVES) return undefined
  }
  return out
}

/** Where the first outermost `{a,b}` in `glob` has its `{`, its own commas and its `}`. */
function outermostBraces(glob: string): number[] | undefined {
  let first: number[] | undefined
  const stack: number[][] = []
  for (let i = 0; i < glob.length; i++) {
    if (glob[i] === '{') stack.push([i])
    else if (glob[i] === ',') stack.at(-1)?.push(i)
    else if (glob[i] === '}') {
      const bounds = stack.pop()
      if (bounds !== undefined && bounds.length > 1 && bounds[0]! < (first?.[0] ?? Infinity))
        first = [...bounds, i]
    }
  }
  return first
}

const everyAlternative = (glob: string, ok: (alternative: string) => boolean): boolean =>
  braceExpansions(glob)?.every(ok) ?? false

/** A glob whose `{a,b}` alternatives can all be checked; the checks after it don't run on any other. */
const globText = z
  .string()
  .min(1)
  .refine((g) => braceExpansions(g) !== undefined, {
    message: `must have no more than ${MAX_ALTERNATIVES} {a,b} alternatives`,
    abort: true,
  })

/**
 * A folder: under the home folder (`~/…`), absolute, or starting with a
 * variable (`${VAR}…`, tier 2). Never relative, never the home folder alone or
 * a filesystem root, and never with a `..` segment.
 */
const folder = z
  .string()
  .regex(
    /^(~[/\\]|\/|[A-Za-z]:[/\\]|\$\{)/,
    'must start with ~/, be absolute, or start with a ${VAR}',
  )
  .refine((p) => !CLIMBS.test(p), 'must not have a .. segment')
  .refine(
    (p) => namesEntry(p.replace(/^(~|[A-Za-z]:)/, '')),
    'must name a folder below the home folder or a root, not the home folder or a root itself',
  )
  .refine(
    (p) => !HOME_FOLDER.test(withoutDots(p)),
    'must name a folder below a home folder, not a home folder itself',
  )

/** A problem a refinement finds, at `path` below the value it checks. */
type Issue = { path: PropertyKey[]; message: string }

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const addIssues = (
  ctx: { addIssue: (issue: { code: 'custom'; message: string; path: PropertyKey[] }) => void },
  issues: readonly Issue[],
): void => {
  for (const { path, message } of issues) ctx.addIssue({ code: 'custom', message, path })
}

/** One value for every OS (`all`), or one per OS; an OS with none doesn't have the path. */
const perOs = z
  .strictObject({
    all: folder.optional(),
    macos: folder.optional(),
    linux: folder.optional(),
    windows: folder.optional(),
  })
  .meta({
    anyOf: [
      { required: ['all'], maxProperties: 1 },
      { not: { required: ['all'] }, minProperties: 1 },
    ],
  })
  .superRefine((v, ctx) => addIssues(ctx, perOsIssues(v)))

/**
 * The cross-field problems of a `paths` entry. These checks and the others
 * that read the raw value below take any value, because zod skips a
 * refinement when a field of the same object has a type or required-field
 * error, and the reader runs them itself then (see `crossFieldIssues`).
 */
function perOsIssues(v: Record<string, unknown>): Issue[] {
  const oses = OSES.filter((os) => v[os] !== undefined)
  if (v['all'] !== undefined && oses.length > 0)
    return [{ path: [], message: 'set all or per-OS folders, not both' }]
  if (v['all'] === undefined && oses.length === 0)
    return [{ path: [], message: `set all, or one of ${OSES.join(', ')}` }]
  return []
}

const idleHours = z
  .number()
  .nonnegative()
  .optional()
  .describe(
    "Hours it must sit unchanged before it's selected by default; fractions count. The config's plugins.<name>.idleHours wins over it, and its top-level idleHours can only raise it. Unset: the plugin's idleHours setting.",
  )

const costDescription = z
  .enum(COST_DESCRIPTIONS)
  .describe(
    'What deleting it costs. `lost` is always held, with a `discard-user-data` protest that only --allow grants.',
  )

const NOT_A_NAME = 'the program must be a name on PATH, not a path'

/** Whether `program` is a name PATH lookup can find: no folder and no `{path}` in it. */
const isProgramName = (program: string): boolean => !/[/\\]|\{path\}/.test(program)

/** A program and its arguments; the program is a name looked up on PATH. */
const argv = z
  .array(z.string().min(1))
  .min(1)
  .refine(([program]) => program === undefined || isProgramName(program), NOT_A_NAME)

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * An environment entry that changes which program runs or what it loads:
 * `PATH`, the dynamic loader's `LD_*` and `DYLD_*`, `NODE_OPTIONS` and
 * `BASH_ENV`. Set in `env`, it would get around the program being a name on
 * PATH. Windows reads names in any case.
 */
const REDIRECTS_PROGRAM = /^(PATH|LD_\w+|DYLD_\w+|NODE_OPTIONS|BASH_ENV)$/i

const NOT_A_REDIRECT = 'must not change which program runs or what it loads'

const condition = z
  .strictObject({
    onPath: z
      .string()
      .min(1)
      .refine(isProgramName, NOT_A_NAME)
      .optional()
      .describe('A program on PATH.'),
    exists: z.string().min(1).optional().describe('A name from `paths` whose folder exists.'),
  })
  .meta({ minProperties: 1, maxProperties: 1 })
  .refine(
    (c) => (c.onPath === undefined) !== (c.exists === undefined),
    'set one of onPath or exists',
  )

const conditions = z.array(condition).min(1)

const detect = z
  .strictObject({ any: conditions.optional(), all: conditions.optional() })
  .meta({ minProperties: 1, maxProperties: 1 })
  .refine((d) => (d.any === undefined) !== (d.all === undefined), 'set one of any or all')
  .describe('When the plugin applies. Default: any of its paths exists.')

/** Why a `${` is refused outside the fields that fill it. */
const UNFILLED = 'is not filled here: variables are filled only in paths, vars and locks'

export const DescriptorCandidateSchema = z
  .strictObject({
    path: z.string().min(1).describe('A name from `paths`.'),
    glob: globText
      .refine((g) => !GLOB_ESCAPES.test(g) && everyAlternative(g, (a) => !GLOB_ESCAPES.test(a)), {
        message: 'must stay inside the path: no .. segment, not absolute',
      })
      .refine((g) => everyAlternative(g, namesEntry), {
        message: 'must name entries under the path, in every {a,b} alternative, such as models--*/',
      })
      .optional()
      .describe('Entries under the path, one candidate each, such as `models--*/`.'),
    maxEntries: z
      .int()
      .positive()
      .optional()
      .describe(
        `Glob matches past this many are combined into one candidate. Default: ${DEFAULT_MAX_ENTRIES}.`,
      ),
    costDescription,
    idleHours,
    command: argv
      .optional()
      .describe(
        "The tool's own command, run from the home folder. It must name the checked folder, as a `{path}` argument or in `env`.",
      ),
    env: z
      .record(z.string().regex(ENV_NAME), z.string())
      .superRefine((env, ctx) => {
        for (const name of Object.keys(env))
          if (REDIRECTS_PROGRAM.test(name))
            ctx.addIssue({ code: 'custom', message: NOT_A_REDIRECT, path: [name] })
      })
      .optional()
      .describe("Environment entries for `command`, such as `{ GOMODCACHE: '{path}' }`."),
    removes: z
      .enum(['unused', 'all'])
      .optional()
      .describe(
        '`unused`: the command removes only what nothing uses (a prune), with no idle check. `all`: it empties the folder (a wipe).',
      ),
    held: z.boolean().optional().describe("True: left out of the default, even when it's idle."),
  })
  .meta({
    dependentRequired: {
      command: ['removes'],
      removes: ['command'],
      env: ['command'],
      maxEntries: ['glob'],
    },
    not: { required: ['command', 'glob'] },
  })
  .superRefine((c, ctx) => addIssues(ctx, candidateIssues(c)))

/** The cross-field problems of a candidate; any value, as {@link perOsIssues}. */
function candidateIssues(c: Record<string, unknown>): Issue[] {
  const issues: Issue[] = []
  const at = (field: string, message: string) => issues.push({ path: [field], message })
  const hasPath = (v: unknown) => typeof v === 'string' && v.includes('{path}')
  if (c['command'] !== undefined) {
    if (c['glob'] !== undefined) at('glob', "can't be combined with command")
    if (c['removes'] === undefined) at('removes', 'required with command: unused or all')
    const named =
      !Array.isArray(c['command']) ||
      c['command'].some(hasPath) ||
      (isObject(c['env']) && Object.values(c['env']).some(hasPath))
    if (!named) at('command', 'must name the checked folder, as a {path} argument or in env (D13)')
  } else {
    if (c['removes'] !== undefined) at('removes', 'only with command')
    if (c['env'] !== undefined) at('env', 'only with command')
  }
  if (c['maxEntries'] !== undefined && c['glob'] === undefined) at('maxEntries', 'only with glob')
  return issues
}

/** Whether `n` names one entry: not empty, `.` or `..`, and with no folder in it. */
export const isEntryName = (n: string): boolean =>
  !/[/\\]/.test(n) && n !== '' && n !== '.' && n !== '..'

export const ProjectEntrySchema = z.strictObject({
  dir: z
    .string()
    .min(1)
    .refine(isEntryName, 'must be a folder name, not a path')
    .describe("The build folder's name, such as `obj`."),
  marker: globText
    .refine((g) => everyAlternative(g, isEntryName), 'must be a file name or glob, not a path')
    .describe('A file name or glob beside it that marks the project, such as `*.csproj`.'),
  costDescription,
  idleHours,
})

/** A trailing separator, or a last `.` segment: both name a folder. */
const lock = folder.refine((p) => !/[/\\]\.?$/.test(p), 'must be a file, not a folder')

/** Whether `name` can name a folder in `paths`. */
export const isPathsName = (name: string): boolean => NAME.test(name)

/** Whether `p` can be a folder in `paths`. */
export const isFolder = (p: string): boolean => folder.safeParse(p).success

/** The checks on a folder in `paths`, for a folder set elsewhere, such as a config `vars` value. */
export const FolderSchema = folder

/** Whether `p` can be an `inUse` lock. */
export const isLock = (p: string): boolean => lock.safeParse(p).success

const inUse = z
  .strictObject({
    processes: z
      .array(z.string().min(1))
      .optional()
      .describe("An executable's name, or any word of its command line, such as `GradleDaemon`."),
    locks: z.array(lock).optional().describe('Files whose presence means in use.'),
  })
  .describe('A match refuses every candidate with `in-use`.')

const varFile = folder.regex(
  new RegExp(`(${VAR_FILE_EXTENSIONS.map((e) => e.replace('.', '\\.')).join('|')})$`),
  `must be a ${VAR_FILE_EXTENSIONS.join(', ')} file`,
)

/** Where a variable's value may come from (tier 2), tried in order. */
const varSource = z.union([
  z.strictObject({ env: z.string().regex(ENV_NAME).describe('An environment variable.') }),
  z.strictObject({
    file: varFile.describe('A TOML, JSON or YAML file, by its extension.'),
    key: z.string().min(1).describe('A dotted key in it, such as `cache.dir`.'),
  }),
  z.strictObject({
    command: argv.describe(
      'A command whose output, trimmed, is the value. It runs from the home folder, only when on PATH, with a short time limit.',
    ),
    env: z
      .record(z.string().regex(ENV_NAME), z.string())
      .optional()
      .describe("Environment entries for `command`, such as `{ GOTOOLCHAIN: 'local' }`."),
  }),
  z.strictObject({
    value: z
      .union([folder, perOs])
      .describe('A fixed folder, per OS or `all`, which may use other variables.'),
  }),
])

/** A plugin name: lowercase letters, digits and -, starting with a letter. */
export const PLUGIN_NAME = /^[a-z][a-z0-9-]*$/

export const DescriptorSchema = z
  .strictObject({
    $schema: z.string().optional(),
    descriptor: z.literal(DESCRIPTOR_VERSION, {
      error: (iss) => (iss.input === undefined ? 'required' : `must be ${DESCRIPTOR_VERSION}`),
    }),
    store: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be a corpus slug, such as huggingface-hub')
      .optional()
      .describe('The slug of the research corpus entry it was drafted from. Not used at run time.'),
    detect: detect.optional(),
    paths: z
      .record(z.string().regex(NAME), perOs)
      .refine((p) => Object.keys(p).length > 0, 'name at least one folder')
      .meta({ minProperties: 1 })
      .describe("Named folders, per OS or `all`. These are the plugin's roots."),
    candidates: z.array(DescriptorCandidateSchema).min(1),
    inUse: inUse.optional(),
    project: z.array(ProjectEntrySchema).min(1).optional(),
    supersededBy: z
      .string()
      .regex(PLUGIN_NAME, 'must be a plugin name')
      .optional()
      .describe("A code plugin's name. While that plugin runs, this descriptor doesn't."),
    system: z
      .boolean()
      .optional()
      .describe('True: data that needs root. Accepted, but the descriptor is skipped with a note.'),
    vars: z
      .record(z.string().regex(ENV_NAME), z.array(varSource).min(1))
      .optional()
      .describe(
        `Tier 2 variables, each a list of sources tried in order; the first value wins, and \`plugins.<name>.vars\` in the config wins over all. Built in: ${Object.keys(BUILT_IN_VARS).join(', ')}.`,
      ),
  })
  .superRefine((d, ctx) => {
    addIssues(ctx, pathNameIssues(d))
    addIssues(ctx, varIssues(d))
  })

/**
 * Each candidate `path` and detect `exists` that names no entry of `paths`;
 * any value, as {@link perOsIssues}. None while `paths` is not a map.
 */
function pathNameIssues(d: Record<string, unknown>): Issue[] {
  if (!isObject(d['paths'])) return []
  const named = new Set(Object.keys(d['paths']))
  const issues: Issue[] = []
  const known = (name: unknown, path: PropertyKey[]) => {
    if (typeof name === 'string' && !named.has(name))
      issues.push({ message: `no folder named "${name}" in paths`, path })
  }
  const each = (list: unknown, f: (item: Record<string, unknown>, i: number) => void) => {
    if (Array.isArray(list))
      list.forEach((item, i) => {
        if (isObject(item)) f(item, i)
      })
  }
  each(d['candidates'], (c, i) => known(c['path'], ['candidates', i, 'path']))
  const detect = d['detect']
  if (isObject(detect))
    for (const mode of ['any', 'all'])
      each(detect[mode], (c, i) => known(c['exists'], ['detect', mode, i, 'exists']))
  return issues
}

/**
 * The cross-field problems in the raw `value`: those of `paths` entries, of
 * candidates and of the names they use. The reader adds the ones zod skipped.
 */
function crossFieldIssues(value: unknown): Issue[] {
  if (!isObject(value)) return []
  const issues = pathNameIssues(value)
  const below = (prefix: PropertyKey[], found: Issue[]) =>
    issues.push(...found.map(({ path, message }) => ({ path: [...prefix, ...path], message })))
  if (isObject(value['paths']))
    for (const [name, v] of Object.entries(value['paths']))
      if (isObject(v)) below(['paths', name], perOsIssues(v))
  if (Array.isArray(value['candidates']))
    value['candidates'].forEach((c, i) => {
      if (isObject(c)) below(['candidates', i], candidateIssues(c))
    })
  return issues
}

/**
 * The fields a `${VAR}` is filled in, `*` for any key or index: a folder in
 * `paths`, a variable's `file` and `value`, and a lock. Every other string is
 * refused a `${` by {@link unfilledIssues}.
 */
const FILLED: readonly (readonly string[])[] = [
  ['paths', '*', '*'],
  ['vars', '*', '*', 'file'],
  ['vars', '*', '*', 'value'],
  ['vars', '*', '*', 'value', '*'],
  ['inUse', 'locks', '*'],
]

const isFilled = (path: readonly PropertyKey[]): boolean =>
  FILLED.some(
    (f) => f.length === path.length && f.every((k, i) => k === '*' || k === String(path[i])),
  )

/**
 * Each string in the raw `value` that holds a `${` outside the fields that
 * fill it. Read from the raw value, so they are reported beside the schema's
 * problems.
 */
function unfilledIssues(value: unknown): Issue[] {
  const issues: Issue[] = []
  const walk = (v: unknown, path: PropertyKey[]): void => {
    if (typeof v === 'string') {
      if (v.includes('${') && !isFilled(path)) issues.push({ path, message: `\${ ${UNFILLED}` })
    } else if (Array.isArray(v)) v.forEach((item, i) => walk(item, [...path, i]))
    else if (isObject(v)) for (const [key, item] of Object.entries(v)) walk(item, [...path, key])
  }
  walk(value, [])
  return issues
}

type VarsField = Record<string, z.output<typeof varSource>[]>
type FieldPath = (string | number)[]
type Template = { text: string; path: FieldPath; inVar?: string }
type VarIssue = { path: FieldPath; message: string }

/** Each folder that may use a variable, with its field path. */
function templatesOf(d: {
  paths: Record<string, Partial<Record<string, string>>>
  vars?: VarsField | undefined
  inUse?: { locks?: string[] | undefined } | undefined
}): Template[] {
  const out: Template[] = []
  for (const [name, folders] of Object.entries(d.paths))
    for (const [os, text] of Object.entries(folders))
      if (text !== undefined) out.push({ text, path: ['paths', name, os] })
  for (const [name, sources] of Object.entries(d.vars ?? {}))
    sources.forEach((s, i) => {
      for (const t of sourceTemplates(s))
        out.push({ text: t.text, path: ['vars', name, i, ...t.field], inVar: name })
    })
  d.inUse?.locks?.forEach((text, i) => out.push({ text, path: ['inUse', 'locks', i] }))
  return out
}

/**
 * What is wrong with the descriptor's variables: a `${` that is not a
 * `${NAME}`, a name neither declared nor built in, a declared name that is a
 * built-in's, or a variable whose sources refer back to it.
 */
function varIssues(d: Parameters<typeof templatesOf>[0]): VarIssue[] {
  const out: VarIssue[] = []
  const declared = new Set(Object.keys(d.vars ?? {}))
  for (const name of declared)
    if (Object.hasOwn(BUILT_IN_VARS, name))
      out.push({
        path: ['vars', name],
        message: `${name} is built in; use it without declaring it`,
      })
  const uses = new Map<string, Set<string>>()
  for (const t of templatesOf(d)) {
    if (badVarRef(t.text)) {
      out.push({ path: t.path, message: 'write a variable as ${NAME}' })
      continue
    }
    for (const ref of varRefs(t.text)) {
      if (!declared.has(ref) && !Object.hasOwn(BUILT_IN_VARS, ref))
        out.push({ path: t.path, message: `no variable \${${ref}}: declare it in vars` })
      else if (t.inVar !== undefined && declared.has(ref)) {
        if (!uses.has(t.inVar)) uses.set(t.inVar, new Set())
        uses.get(t.inVar)!.add(ref)
      }
    }
  }
  // A variable on a cycle is reported once, at the first of its names declared.
  const reported = new Set<string>()
  for (const start of declared) {
    const chain = cycleFrom(start, uses)
    if (chain === undefined || chain.some((n) => reported.has(n))) continue
    chain.forEach((n) => reported.add(n))
    out.push({
      path: ['vars', start],
      message: `${start} refers back to itself: ${[...chain, start].join(' -> ')}`,
    })
  }
  return out
}

/** The variables from `start` round to `start` again through `uses`, if there is such a path. */
function cycleFrom(
  start: string,
  uses: ReadonlyMap<string, ReadonlySet<string>>,
): string[] | undefined {
  const seen = new Set<string>()
  const walk = (name: string, chain: string[]): string[] | undefined => {
    for (const next of uses.get(name) ?? []) {
      if (next === start) return chain
      if (seen.has(next)) continue
      seen.add(next)
      const found = walk(next, [...chain, next])
      if (found !== undefined) return found
    }
    return undefined
  }
  return walk(start, [start])
}

export type Descriptor = z.output<typeof DescriptorSchema>
export type DescriptorCandidate = z.output<typeof DescriptorCandidateSchema>
export type ProjectEntry = z.output<typeof ProjectEntrySchema>

/** The descriptor schema as JSON Schema: what `schemas/descriptor-1.json` holds. */
export function descriptorJsonSchema(): Record<string, unknown> {
  const { $schema, ...schema } = z.toJSONSchema(DescriptorSchema, { io: 'input' }) as Record<
    string,
    unknown
  >
  return { $schema, $id: DESCRIPTOR_SCHEMA_URL, title: 'host-cleaner descriptor', ...schema }
}

/** A descriptor that can't be used: not YAML, or not the schema. */
export class DescriptorError extends Error {
  override name = 'DescriptorError'
  readonly source: string
  /**
   * One line per problem. A schema problem is `<field path>: <message>`, with
   * `line <n>: ` first when the YAML gives one; a YAML syntax error is
   * `line <n>: <message>`; a file that can't be read is `cannot read: <reason>`.
   */
  readonly issues: readonly string[]
  constructor(source: string, issues: readonly string[]) {
    super(`bad descriptor ${source}: ${issues.join('; ')}`)
    this.source = source
    this.issues = issues
  }
}

type Path = readonly PropertyKey[]

/** The schema's problems with `value`, one `<field path>: <message>` each; empty when it is a descriptor. */
export function descriptorIssues(value: unknown): string[] {
  return check(value).issues.map(({ path, message }) => `${fieldPath(path)}: ${message}`)
}

/** `value` checked once: its issues, and the descriptor when it has none. */
function check(value: unknown): { data?: Descriptor; issues: { path: Path; message: string }[] } {
  const parsed = DescriptorSchema.safeParse(value, {
    error: (iss) => (iss.input === undefined && iss.code !== 'custom' ? 'required' : undefined),
  })
  const issues: { path: Path; message: string }[] = []
  if (!parsed.success)
    for (const i of parsed.error.issues) {
      if (i.code === 'unrecognized_keys')
        for (const key of i.keys) issues.push({ path: [...i.path, key], message: 'unknown field' })
      else issues.push({ path: i.path, message: i.message })
    }
  // Zod skips a refinement when the object it checks has a type or required-field error.
  if (!parsed.success) {
    const key = ({ path, message }: { path: Path; message: string }) =>
      JSON.stringify([path.map(String), message])
    const seen = new Set(issues.map(key))
    issues.push(...crossFieldIssues(value).filter((i) => !seen.has(key(i))))
  }
  issues.push(...unfilledIssues(value))
  return parsed.success && issues.length === 0 ? { data: parsed.data, issues } : { issues }
}

const fieldPath = (path: Path): string => (path.length === 0 ? '(top)' : path.map(String).join('.'))

/**
 * The descriptor in `text`, YAML or JSON; `source` names it in errors.
 *
 * @throws DescriptorError for text that is not YAML, or a value that is not a
 *   descriptor; each issue names the field path and, when the YAML has it,
 *   the line
 */
export function parseDescriptor(text: string, source: string): Descriptor {
  const lines = new LineCounter()
  const doc = parseDocument(text, { lineCounter: lines, prettyErrors: false, uniqueKeys: true })
  // Later YAML errors mostly follow from the first.
  const [error] = doc.errors
  if (error !== undefined)
    throw new DescriptorError(source, [
      `${lineOf(lines, error.pos[0])}: ${error.message.split('\n')[0]}`,
    ])
  let value: unknown
  try {
    value = doc.toJS()
  } catch (err) {
    // Such as too many aliases expanded (the billion-laughs case).
    throw new DescriptorError(source, [`(top): ${(err as Error).message}`])
  }
  const { data, issues } = check(value)
  if (data === undefined)
    throw new DescriptorError(
      source,
      issues.map(({ path, message }) => {
        const at = offsetOf(doc, path)
        const where = at === undefined ? '' : `${lineOf(lines, at)}: `
        return `${where}${fieldPath(path)}: ${message}`
      }),
    )
  return data
}

/**
 * The descriptor in the file at `path`.
 *
 * @throws DescriptorError for a file that can't be read, or as {@link parseDescriptor}
 */
export function readDescriptor(path: string): Descriptor {
  let text: string
  try {
    text = readFileSync(path, 'utf-8')
  } catch (err) {
    throw new DescriptorError(path, [`cannot read: ${(err as Error).message}`])
  }
  return parseDescriptor(text, path)
}

const lineOf = (lines: LineCounter, offset: number): string => `line ${lines.linePos(offset).line}`

/**
 * Where in the text the field at `path` starts: its key in a map, its item in
 * a list, or else where its nearest parent does.
 */
function offsetOf(doc: Document, path: Path): number | undefined {
  for (let n = path.length; n > 0; n--) {
    const parent = n === 1 ? doc.contents : doc.getIn(path.slice(0, n - 1), true)
    const last = path[n - 1]
    const node = isMap(parent)
      ? parent.items.find((pair) => isScalar(pair.key) && String(pair.key.value) === String(last))
          ?.key
      : isSeq(parent) && typeof last === 'number'
        ? parent.items[last]
        : undefined
    const range = (node as { range?: [number, number, number] } | null | undefined)?.range
    if (range !== undefined) return range[0]
  }
  return doc.contents?.range?.[0]
}
