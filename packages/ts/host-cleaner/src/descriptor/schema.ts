/**
 * The descriptor format, `descriptor: 1`: a plugin written as a YAML (or JSON)
 * file. `DescriptorSchema` checks it; `schemas/descriptor-1.json` is the same
 * schema as JSON Schema, for editors (`scripts/write-descriptor-schema.ts`
 * writes it). The checks one field can't make on its own, such as a
 * candidate's `path` naming an entry of `paths`, are refinements that only the
 * reader runs.
 *
 * `vars` (tier 2) is in the schema, so a tier 2 file has its shape checked,
 * but `descriptorIssues`, `parseDescriptor` and `readDescriptor` refuse it, and
 * any string outside it with a `${` in it, until variables are built.
 */

import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { LineCounter, isMap, isScalar, isSeq, parseDocument, type Document } from 'yaml'

import { COST_DESCRIPTIONS } from '../cost.ts'

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
 * `/var/root`, `/home/<user>`, `/Users/<user>`, `C:\Users\<user>`, `${HOME}`
 * or `${USERPROFILE}`. Test it on {@link withoutDots}' result.
 */
const HOME_FOLDER =
  /^(\/root|\/(private[/\\])?var[/\\]root|\/(home|Users)([/\\][^/]*)?|[A-Za-z]:[/\\]Users([/\\][^/\\]*)?|\$\{(HOME|USERPROFILE)\})[/\\]*$/i

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
function braceExpansions(glob: string): string[] | undefined {
  const out: string[] = []
  const todo = [glob]
  for (let g = todo.pop(); g !== undefined; g = todo.pop()) {
    const bounds = outermostBraces(g)
    if (bounds === undefined) out.push(g)
    else {
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

const NOT_A_NAME = 'the program must be a name on PATH, not a path'

/** Whether `program` is a name PATH lookup can find: no folder and no `{path}` in it. */
const isProgramName = (program: string): boolean => !/[/\\]|\{path\}/.test(program)

/** A program and its arguments; the program is a name looked up on PATH. */
const argv = z
  .array(z.string().min(1))
  .min(1)
  .refine(([program]) => program === undefined || isProgramName(program), NOT_A_NAME)

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

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

const lock = folder.refine((p) => !/[/\\]$/.test(p), 'must be a file, not a folder')

/** Whether `name` can name a folder in `paths`. */
export const isPathsName = (name: string): boolean => NAME.test(name)

/** Whether `p` can be a folder in `paths`. */
export const isFolder = (p: string): boolean => folder.safeParse(p).success

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

/** Where a variable's value may come from (tier 2), tried in order. */
const varSource = z.union([
  z.strictObject({ env: z.string().regex(ENV_NAME) }),
  z.strictObject({ file: folder, key: z.string().min(1) }),
  z.strictObject({ command: argv }),
  z.strictObject({ value: z.union([z.string().min(1), perOs]) }),
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

const TIER_2 = 'variables (tier 2) are not supported yet'

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
  issues.push(...tier2Issues(value))
  return parsed.success && issues.length === 0 ? { data: parsed.data, issues } : { issues }
}

/**
 * Where `value` uses variables (tier 2): `vars` itself, and every string
 * outside it with a `${` in it. Read from the raw value, so they are reported
 * beside the schema's problems.
 */
function tier2Issues(value: unknown): { path: Path; message: string }[] {
  const issues: { path: Path; message: string }[] = []
  const walk = (v: unknown, path: PropertyKey[]): void => {
    if (typeof v === 'string') {
      if (v.includes('${')) issues.push({ path, message: TIER_2 })
    } else if (Array.isArray(v)) v.forEach((item, i) => walk(item, [...path, i]))
    else if (typeof v === 'object' && v !== null)
      for (const [key, item] of Object.entries(v)) {
        if (path.length === 0 && key === 'vars') issues.push({ path: ['vars'], message: TIER_2 })
        else walk(item, [...path, key])
      }
  }
  walk(value, [])
  return issues
}

const fieldPath = (path: Path): string => (path.length === 0 ? '(top)' : path.map(String).join('.'))

/**
 * The descriptor in `text`, YAML or JSON; `source` names it in errors.
 *
 * @throws DescriptorError for text that is not YAML, a value that is not a
 *   descriptor, or one that uses tier 2 variables (`vars`, or `${` in any
 *   other string); each issue names the field path and, when the YAML has it,
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
