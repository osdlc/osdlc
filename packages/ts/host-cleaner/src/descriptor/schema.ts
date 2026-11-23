/**
 * The descriptor format, `descriptor: 1`: a plugin written as a YAML (or JSON)
 * file. `DescriptorSchema` checks it; `schemas/descriptor-1.json` is the same
 * schema as JSON Schema, for editors (`scripts/write-descriptor-schema.ts`
 * writes it). The checks one field can't make on its own, such as a
 * candidate's `path` naming an entry of `paths`, are refinements that only the
 * reader runs. So are the checks on `vars` (tier 2): every `${VAR}` names a
 * declared or built-in variable, none is declared twice over a built-in, and
 * no variable refers back to itself.
 */

import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { LineCounter, isMap, isScalar, isSeq, parseDocument, type Document } from 'yaml'

import { COST_DESCRIPTIONS } from '../types.ts'
import { BUILT_IN_VARS, VAR_FILE_EXTENSIONS, badVarRef, varRefs } from './vars.ts'

/** The format version this reader takes. */
export const DESCRIPTOR_VERSION = 1

/** Where the published JSON Schema lives; a descriptor's `$schema` may name it. */
export const DESCRIPTOR_SCHEMA_URL =
  'https://unpkg.com/@osdlc/host-cleaner@1/schemas/descriptor-1.json'

/** How many glob matches become candidates of their own before the rest are combined into one. */
export const DEFAULT_MAX_ENTRIES = 200

/** The operating systems a path may differ on. */
export const OSES = ['macos', 'linux', 'windows'] as const

export type Os = (typeof OSES)[number]

/** A `..` segment, which would climb out of where a path or glob is anchored. */
const CLIMBS = /(^|[/\\])\.\.([/\\]|$)/

const NAME = /^[A-Za-z][A-Za-z0-9_-]*$/

/**
 * A folder: under the home folder (`~/…`), absolute, or starting with a
 * variable (`${VAR}…`, tier 2). Never relative, never the home folder alone,
 * and never with a `..` segment.
 */
const folder = z
  .string()
  .regex(
    /^(~[/\\]|\/|[A-Za-z]:[/\\]|\$\{)/,
    'must start with ~/, be absolute, or start with a ${VAR}',
  )
  .refine((p) => !CLIMBS.test(p), 'must not have a .. segment')

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
  .superRefine((v, ctx) => {
    const oses = OSES.filter((os) => v[os] !== undefined)
    if (v.all !== undefined && oses.length > 0)
      ctx.addIssue({ code: 'custom', message: 'set all or per-OS folders, not both', path: [] })
    if (v.all === undefined && oses.length === 0)
      ctx.addIssue({ code: 'custom', message: `set all, or one of ${OSES.join(', ')}`, path: [] })
  })

const idleHours = z
  .number()
  .nonnegative()
  .optional()
  .describe(
    "Hours it must sit unchanged before it's selected by default; fractions count. Unset: the plugin's idleHours setting.",
  )

const costDescription = z
  .enum(COST_DESCRIPTIONS)
  .describe(
    'What deleting it costs. `lost` is always held, with a `discard-user-data` protest that only --allow grants.',
  )

/** A program and its arguments; the program is a name looked up on PATH. */
const argv = z
  .array(z.string().min(1))
  .min(1)
  .refine(
    ([program]) => program === undefined || !/[/\\]|\{path\}/.test(program),
    'the program must be a name on PATH, not a path',
  )

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

const condition = z
  .strictObject({
    onPath: z.string().min(1).optional().describe('A program on PATH.'),
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

export const DescriptorCandidateSchema = z
  .strictObject({
    path: z.string().min(1).describe('A name from `paths`.'),
    glob: z
      .string()
      .min(1)
      .refine((g) => !CLIMBS.test(g) && !/^([/\\]|~|[A-Za-z]:)/.test(g), {
        message: 'must stay inside the path: no .. segment, not absolute',
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
  .superRefine((c, ctx) => {
    const at = (field: string, message: string) =>
      ctx.addIssue({ code: 'custom', message, path: [field] })
    if (c.command !== undefined) {
      if (c.glob !== undefined) at('glob', "can't be combined with command")
      if (c.removes === undefined) at('removes', 'required with command: unused or all')
      const named =
        c.command.some((a) => a.includes('{path}')) ||
        Object.values(c.env ?? {}).some((v) => v.includes('{path}'))
      if (!named)
        at('command', 'must name the checked folder, as a {path} argument or in env (D13)')
    } else {
      if (c.removes !== undefined) at('removes', 'only with command')
      if (c.env !== undefined) at('env', 'only with command')
    }
    if (c.maxEntries !== undefined && c.glob === undefined) at('maxEntries', 'only with glob')
  })

/** A file or glob name, with no folder in it. */
const entryName = (what: string) =>
  z
    .string()
    .min(1)
    .refine((n) => !/[/\\]/.test(n) && n !== '.' && n !== '..', `must be a ${what}, not a path`)

export const ProjectEntrySchema = z.strictObject({
  dir: entryName('folder name').describe("The build folder's name, such as `obj`."),
  marker: entryName('file name or glob').describe(
    'A file name or glob beside it that marks the project, such as `*.csproj`.',
  ),
  costDescription,
  idleHours,
})

const lock = folder.refine((p) => !/[/\\]$/.test(p), 'must be a file, not a folder')

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
  }),
  z.strictObject({
    value: z
      .union([folder, perOs])
      .describe('A fixed folder, per OS or `all`, which may use other variables.'),
  }),
])

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
      .regex(/^[a-z][a-z0-9-]*$/, 'must be a plugin name')
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
    const named = new Set(Object.keys(d.paths))
    const known = (name: string, path: (string | number)[]) => {
      if (!named.has(name))
        ctx.addIssue({ code: 'custom', message: `no folder named "${name}" in paths`, path })
    }
    d.candidates.forEach((c, i) => known(c.path, ['candidates', i, 'path']))
    for (const mode of ['any', 'all'] as const)
      d.detect?.[mode]?.forEach((c, i) => {
        if (c.exists !== undefined) known(c.exists, ['detect', mode, i, 'exists'])
      })
    for (const { path, message } of varIssues(d)) ctx.addIssue({ code: 'custom', message, path })
  })

type VarsField = Record<string, z.output<typeof varSource>[]>

/** Each folder that may use a variable, with its field path. */
function templatesOf(d: {
  paths: Record<string, Partial<Record<string, string>>>
  vars?: VarsField | undefined
  inUse?: { locks?: string[] | undefined } | undefined
}): Array<{ text: string; path: (string | number)[]; of?: string }> {
  const out: Array<{ text: string; path: (string | number)[]; of?: string }> = []
  for (const [name, folders] of Object.entries(d.paths))
    for (const [os, text] of Object.entries(folders))
      if (text !== undefined) out.push({ text, path: ['paths', name, os] })
  for (const [name, sources] of Object.entries(d.vars ?? {}))
    sources.forEach((s, i) => {
      const at = ['vars', name, i]
      if ('file' in s) out.push({ text: s.file, path: [...at, 'file'], of: name })
      if ('value' in s) {
        if (typeof s.value === 'string')
          out.push({ text: s.value, path: [...at, 'value'], of: name })
        else
          for (const [os, text] of Object.entries(s.value))
            if (text !== undefined) out.push({ text, path: [...at, 'value', os], of: name })
      }
    })
  d.inUse?.locks?.forEach((text, i) => out.push({ text, path: ['inUse', 'locks', i] }))
  return out
}

/**
 * What is wrong with the descriptor's variables: a `${` that is not a
 * `${NAME}`, a name neither declared nor built in, a declared name that is a
 * built-in's, or a variable whose sources refer back to it.
 */
function varIssues(
  d: Parameters<typeof templatesOf>[0],
): { path: (string | number)[]; message: string }[] {
  const out: { path: (string | number)[]; message: string }[] = []
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
      else if (t.of !== undefined && declared.has(ref)) {
        if (!uses.has(t.of)) uses.set(t.of, new Set())
        uses.get(t.of)!.add(ref)
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
  /** One line per problem, each `<field path>: <message>`, with `line <n>: ` first when the YAML gives one. */
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
  return issuesOf(value).map(({ path, message }) => `${fieldPath(path)}: ${message}`)
}

function issuesOf(value: unknown): { path: Path; message: string }[] {
  const parsed = DescriptorSchema.safeParse(value, {
    error: (iss) => (iss.input === undefined && iss.code !== 'custom' ? 'required' : undefined),
  })
  const out: { path: Path; message: string }[] = []
  if (!parsed.success) {
    for (const i of parsed.error.issues) {
      if (i.code === 'unrecognized_keys')
        for (const key of i.keys) out.push({ path: [...i.path, key], message: 'unknown field' })
      else out.push({ path: i.path, message: i.message })
    }
  }
  return out
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
  const value: unknown = doc.toJS()
  const issues = issuesOf(value)
  if (issues.length > 0)
    throw new DescriptorError(
      source,
      issues.map(({ path, message }) => {
        const at = offsetOf(doc, path)
        const where = at === undefined ? '' : `${lineOf(lines, at)}: `
        return `${where}${fieldPath(path)}: ${message}`
      }),
    )
  return DescriptorSchema.parse(value)
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
      ? parent.items.find((pair) => isScalar(pair.key) && pair.key.value === last)?.key
      : isSeq(parent) && typeof last === 'number'
        ? parent.items[last]
        : undefined
    const range = (node as { range?: [number, number, number] } | null | undefined)?.range
    if (range !== undefined) return range[0]
  }
  return doc.contents?.range?.[0]
}
