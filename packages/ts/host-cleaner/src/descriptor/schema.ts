/**
 * The descriptor format, `descriptor: 1`: a plugin written as a YAML (or JSON)
 * file. `DescriptorSchema` checks it; `schemas/descriptor-1.json` is the same
 * schema as JSON Schema, for editors (`scripts/write-descriptor-schema.ts`
 * writes it). The checks one field can't make on its own, such as a
 * candidate's `path` naming an entry of `paths`, are refinements that only the
 * reader runs.
 *
 * `vars` (tier 2) is in the schema, so a tier 2 file has its shape checked,
 * but `parseDescriptor` and `readDescriptor` refuse it, and any `${VAR}` in a
 * path, until variables are built.
 */

import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { LineCounter, isMap, isScalar, isSeq, parseDocument, type Document } from 'yaml'

import { COST_DESCRIPTIONS } from '../types.ts'

/** The format version this reader takes. */
export const DESCRIPTOR_VERSION = 1

/** Where the published JSON Schema lives; a descriptor's `$schema` may name it. */
export const DESCRIPTOR_SCHEMA_URL =
  'https://unpkg.com/@osdlc/host-cleaner@1/schemas/descriptor-1.json'

/** How many glob matches become candidates in one run; the rest wait for a later run. */
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
      .refine((g) => g.split(/[/\\]/).some((part) => part !== '' && part !== '.'), {
        message: 'must name entries under the path, such as models--*/',
      })
      .optional()
      .describe('Entries under the path, one candidate each, such as `models--*/`.'),
    maxEntries: z
      .int()
      .positive()
      .optional()
      .describe(
        `Glob matches past this many are not listed this run; a note on the last one listed counts them. Default: ${DEFAULT_MAX_ENTRIES}.`,
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

/** Where a variable's value may come from (tier 2), tried in order. */
const varSource = z.union([
  z.strictObject({ env: z.string().regex(ENV_NAME) }),
  z.strictObject({ file: folder, key: z.string().min(1) }),
  z.strictObject({ command: argv }),
  z.strictObject({ value: z.union([z.string().min(1), perOs]) }),
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
      .describe('Tier 2 variables. Not read yet: a descriptor that sets them is refused.'),
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
  })

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

/** A descriptor that can't be used: not YAML, not the schema, or a field this release doesn't read yet. */
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
  return issuesOf(value).issues.map(({ path, message }) => `${fieldPath(path)}: ${message}`)
}

/** `value` parsed, when the schema accepts it, and its problems; `data` is set even when tier 2 problems remain. */
function issuesOf(value: unknown): {
  data: Descriptor | undefined
  issues: { path: Path; message: string }[]
} {
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
    return { data: undefined, issues: out }
  }
  // Tier 2 is described but not read yet.
  const d = parsed.data
  if (d.vars !== undefined)
    out.push({ path: ['vars'], message: 'variables (tier 2) are not supported yet' })
  for (const [name, folders] of Object.entries(d.paths))
    for (const [os, p] of Object.entries(folders))
      if (p?.includes('${'))
        out.push({ path: ['paths', name, os], message: 'variables (tier 2) are not supported yet' })
  return { data: d, issues: out }
}

const fieldPath = (path: Path): string => (path.length === 0 ? '(top)' : path.map(String).join('.'))

/**
 * The descriptor in `text`, YAML or JSON; `source` names it in errors.
 *
 * @throws DescriptorError for text that is not YAML, a value that is not a
 *   descriptor, or one that uses `vars`; each issue names the field path and,
 *   when the YAML has it, the line
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
  const { data, issues } = issuesOf(value)
  if (data === undefined || issues.length > 0)
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
      ? parent.items.find((pair) => isScalar(pair.key) && pair.key.value === last)?.key
      : isSeq(parent) && typeof last === 'number'
        ? parent.items[last]
        : undefined
    const range = (node as { range?: [number, number, number] } | null | undefined)?.range
    if (range !== undefined) return range[0]
  }
  return doc.contents?.range?.[0]
}
