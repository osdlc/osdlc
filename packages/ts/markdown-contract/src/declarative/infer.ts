/**
 * `inferConfig`: builds a config from existing markdown, as strict as it can be while still
 * accepting every file.
 *
 * `markdown-contract init <dir>…` uses it. In single-contract mode it infers one contract for a
 * folder and everything below it. In meta mode it infers one contract per folder at a chosen
 * `--depth`. This module reads files, builds the contracts and turns them into YAML text. It
 * writes nothing (the CLI does) and never changes the documents.
 *
 * The main promise: running the config over the files it was inferred from gives no error-level
 * findings. Inference makes the contract as strict as it can, but never so strict that a current
 * file fails. The `init` command checks this after it writes the files.
 *
 * The steps: find the `*.md` files, parse them, group them by folder and depth, infer each
 * group's contract and field types, and turn the result into YAML.
 *
 * The rules:
 *  - Two modes: one contract (the default, or depth 0), or one per folder (`--meta`, `--depth N`).
 *  - Grouping: by folder at exactly depth `N`, each contract covering everything below its
 *    folder, plus a root contract for files directly in the run folder. Contracts are all at
 *    one depth and never nested, so their globs never overlap. A file in a folder between the
 *    root and a cut at depth 2 or more gets a warning and no contract.
 *  - Sections: a section in every file is required. The others become `minContains: 0` and
 *    `maxContains: 1`. Every section seen is listed, so `additionalSections` is `false`. `order`
 *    is the strictest that fits every file: `strict` when every file has the same sections in the
 *    same order, `recognized-relative` when the files agree on relative order, else `none`.
 *  - Frontmatter: an object schema. `required` lists the keys in every file.
 *    `additionalProperties` is `false` unless `--relax` is set. Field types come from the steps
 *    in `inferFieldSchema`.
 *  - Field types, tried in order: `const` (one value everywhere), number, boolean, array,
 *    `format` (date, datetime, email, url, uuid, …), `enum` (at most 12 values and fewer than
 *    half the files), then string. Each step accepts every value seen.
 *  - `--relax`: `order: none`, `additionalSections: true`, an open frontmatter object, and no
 *    enums.
 *  - Names: a contract is named after its folder's path from the root as a slug (`api`,
 *    `api-v1`, `web-v1`). Paths are unique, so names are too.
 *
 * The output is ordinary `mcVersion: 2` YAML. Inference adds no format of its own.
 */
import { readFileSync } from 'node:fs'
import { basename, resolve, sep } from 'node:path'

import picomatch from 'picomatch'
import { stringify as stringifyYaml } from 'yaml'
import { toCamelKey } from '../core/camel.js'
import { type DocTree, parse } from '../core/index.js'
import { frontmatterYamlErrors } from '../core/projection.js'
import { DEFAULT_MAX_CONST_STRING_LENGTH, DEFAULT_MIN_CONST_EXAMPLES } from './constants.js'
import { DeclarativeError } from './errors.js'
import { walkSync } from '../runner/corpus.js'
import { compileSchemaV2 } from './schema-v2.js'

/**
 * Options for {@link inferConfig}. They match the `init` command's flags.
 *
 * @experimental
 */
export interface InferOptions {
  /** Emit a config with one contract per folder, instead of one contract. Default `false`. */
  meta?: boolean
  /** The folder depth for `meta` mode. Default `1`; `0` gives one contract. */
  depth?: number
  /** Loosen the result: no section order, extra sections and keys allowed, no enums. */
  relax?: boolean
  /** Put the contracts inline in one config file, instead of one file per contract. */
  inline?: boolean
  /** Strings longer than this never become a `const` or an `enum` value. Default `64`. */
  maxConstStringLength?: number
  /** A value seen in fewer files than this never becomes a `const`. Default `3`. */
  minConstExamples?: number
  /** Globs, relative to the root, for the files to read. Default all `*.md` files. */
  include?: string[]
  /** Globs, relative to the root, for files to leave out. */
  exclude?: string[]
}

/**
 * The options `inferFieldSchema` uses, with defaults applied. `inferConfig` builds them once from
 * `InferOptions` and passes them down through `generalize` and `inferFrontmatter`.
 */
interface FieldInferOptions {
  /** `--relax`: no `additionalProperties: false` and no enums. */
  relax: boolean
  /** A string longer than this never becomes a `const` or an `enum` value. */
  maxConstStringLength: number
  /** A scalar with one value everywhere needs at least this many documents to become a `const`. */
  minConstExamples: number
}

/**
 * Messages collected during inference. A `warning` does not stop it, and the files are still
 * written (for example, two headings that differ only in case merged into one section with an
 * alias). An `error` means no contract can accept the files (for example, two headings with the
 * same camelCase key side by side in one file). `inferConfig` then throws with every error,
 * instead of returning a contract that fails on its own files. One sink is passed down through
 * `inferMeta`, `generalize` and `inferBody`, so one run reports the messages of every group.
 */
interface InferSink {
  warnings: string[]
  errors: string[]
}

/**
 * One inferred contract for a folder, as a YAML-shaped object. `def` is an input for
 * `compileContractObject(def)`:
 *   { frontmatter?: { type: "object"; required?: string[]; additionalProperties?: boolean;
 *                     properties?: Record<string, unknown> },
 *     body?: { order?: "none"|"recognized-relative"|"strict"; additionalSections?: boolean;
 *              sections?: Array<{ section: string; minContains?: number; maxContains?: number }> } }
 *
 * @experimental
 */
export interface InferredContract {
  /** The contract's name: its folder's path relative to the root, as a slug, such as `api-v1`. */
  name: string
  /** The globs, relative to the root, for the files this contract checks. */
  include: string[]
  /** The contract as an object, ready for `compileContractObject`. */
  def: Record<string, unknown>
}

/**
 * A file `inferConfig` would write: a YAML config or contract.
 *
 * @experimental
 */
export interface InferredFile {
  /** The path, relative to the output folder. */
  path: string
  /** The YAML text. */
  content: string
}

/**
 * What {@link inferConfig} returns.
 *
 * @experimental
 */
export interface InferResult {
  /** `"single"` for one contract, `"meta"` for one contract per folder. */
  mode: 'single' | 'meta'
  /** The inferred contracts. */
  contracts: InferredContract[]
  /** The YAML files to write, with paths relative to the output folder. */
  files: InferredFile[]
  /** Notes about the input, such as files left above a `depth` of 2 or more. */
  warnings: string[]
}

// ── Finding and parsing files ────────────────────────────────────────────────────────────

/** One parsed file: its path and what inference reads from it. */
interface ParsedDoc {
  /** The path relative to the run folder, with `/` separators. */
  rel: string
  /** The top-level section names, in document order. */
  sections: string[]
  /** The parsed frontmatter object, or `{}` when the file has none. */
  frontmatter: Record<string, unknown>
}

/** Converts a path to `/` separators, so globs and names are the same on every platform. */
function toPosix(p: string): string {
  return sep === '/' ? p : p.split(sep).join('/')
}

/** picomatch options. `dot` makes dotfiles match like any other file, as in the runner. */
const PICOMATCH_OPTS = { dot: true } as const

/**
 * Every `*.md` under `root`, as paths relative to `root` with `/` separators, in sorted order.
 * It uses the runner's `walkSync`, so it sees the same files the `init` self-check runs on and
 * skips `.git` and `node_modules` folders.
 *
 * Optional `include` and `exclude` globs (relative to `root`) narrow the files. They work as
 * `validate`'s `--glob`, `--include` and `--exclude` do: a file is kept when it matches an
 * `include` glob (if any are given) and no `exclude` glob. The self-check uses the same globs.
 */
function discover(root: string, scope?: { include?: string[]; exclude?: string[] }): string[] {
  const include =
    scope?.include && scope.include.length > 0 ? picomatch(scope.include, PICOMATCH_OPTS) : null
  const exclude =
    scope?.exclude && scope.exclude.length > 0 ? picomatch(scope.exclude, PICOMATCH_OPTS) : null

  /** True when a path passes the `include` and `exclude` globs. */
  const keep = (rel: string): boolean => {
    if (exclude && exclude(rel)) return false
    if (include && !include(rel)) return false
    return true
  }

  return walkSync(root).filter((rel) => rel.endsWith('.md') && keep(rel))
}

/** The parsed frontmatter when it is an object, else `{}`. */
function asFrontmatterMap(data: unknown): Record<string, unknown> {
  return data !== null && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {}
}

/**
 * Parses one file into a `ParsedDoc`. Only the top-level sections shape the contract. Nested
 * sections are not used.
 *
 * @throws {DeclarativeError} Naming `rel`, when the file cannot be read or its frontmatter is not
 *   valid YAML. Inference cannot accept a file that validation would reject.
 */
function parseDoc(root: string, rel: string): ParsedDoc {
  let tree: DocTree
  try {
    tree = parse(readFileSync(resolve(root, rel), 'utf8'))
  } catch (err) {
    throw new DeclarativeError(`${rel}: ${(err as Error).message}`)
  }
  const yamlError = tree.frontmatter ? frontmatterYamlErrors(tree.frontmatter)[0] : undefined
  if (yamlError) {
    throw new DeclarativeError(`${rel}: frontmatter is not valid YAML: ${yamlError.message}`)
  }
  return {
    rel: toPosix(rel),
    sections: tree.root.sections.map((s) => s.name),
    frontmatter: asFrontmatterMap(tree.frontmatter?.data),
  }
}

// ── Section order ─────────────────────────────────────

type Order = 'none' | 'recognized-relative' | 'strict'

/**
 * Every section name seen, in the order each first appears across the docs. The docs are in
 * sorted walk order, so this is stable. It is the output order for `order: none`, and the
 * tie-break for the sort that sets the `recognized-relative` order.
 */
function sectionUnion(docs: ParsedDoc[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const doc of docs) {
    for (const name of doc.sections) {
      if (!seen.has(name)) {
        seen.add(name)
        out.push(name)
      }
    }
  }
  return out
}

/**
 * True when every doc has exactly the same list of sections in the same order, which allows
 * `strict`. A doc with other sections or another order breaks it.
 */
function allIdenticalSequences(docs: ParsedDoc[]): boolean {
  if (docs.length === 0) return false
  const first = docs[0]!.sections
  return docs.every(
    (d) => d.sections.length === first.length && d.sections.every((n, i) => n === first[i]),
  )
}

/**
 * Builds the "comes before" graph over section names: an edge `a → b` when some doc has `a`
 * anywhere before `b`. `recognized-relative` fits when no two sections have edges both ways
 * (no two docs disagree on the order of a pair). A pair with both edges means `order: none`.
 */
function precedence(docs: ParsedDoc[]): Map<string, Set<string>> {
  const edges = new Map<string, Set<string>>()
  const add = (a: string, b: string): void => {
    let set = edges.get(a)
    if (!set) edges.set(a, (set = new Set<string>()))
    set.add(b)
  }
  for (const doc of docs) {
    for (let i = 0; i < doc.sections.length; i++) {
      for (let j = i + 1; j < doc.sections.length; j++) {
        if (doc.sections[i]! !== doc.sections[j]!) add(doc.sections[i]!, doc.sections[j]!)
      }
    }
  }
  return edges
}

/** True when some pair of sections appears in both orders across the docs. */
function hasOrderConflict(edges: Map<string, Set<string>>): boolean {
  for (const [a, tos] of edges) {
    for (const b of tos) {
      if (edges.get(b)?.has(a)) return true
    }
  }
  return false
}

/**
 * The strictest `order` that fits every doc, and the section list in that order. For `strict`
 * it is the shared sequence. For `recognized-relative` it is a sort of the "comes before" graph
 * (ties broken by first appearance), which agrees with every doc, so the order check passes. For
 * `none` it is the first-appearance order.
 */
function detectOrder(docs: ParsedDoc[]): { order: Order; sections: string[] } {
  const union = sectionUnion(docs)

  if (allIdenticalSequences(docs)) {
    return { order: 'strict', sections: docs[0]!.sections }
  }

  const edges = precedence(docs)
  if (!hasOrderConflict(edges)) {
    return { order: 'recognized-relative', sections: topoSort(union, edges) }
  }

  return { order: 'none', sections: union }
}

/**
 * A topological sort: names in `union` order, but never before a name that must come first.
 * Each pass takes the earliest name in `union` whose predecessors are all placed. The caller
 * checks `hasOrderConflict` first, so every name gets placed. Ties follow `union`, so the result
 * is the same on every run.
 */
function topoSort(union: string[], edges: Map<string, Set<string>>): string[] {
  const out: string[] = []
  const emitted = new Set<string>()
  const predsSatisfied = (name: string): boolean => {
    for (const [from, tos] of edges) {
      if (tos.has(name) && !emitted.has(from)) return false
    }
    return true
  }
  while (out.length < union.length) {
    const next = union.find((n) => !emitted.has(n) && predsSatisfied(n))
    // `next` is always defined when the graph has no cycle. This guard ends the loop anyway.
    if (next === undefined) {
      for (const n of union) {
        if (emitted.has(n)) continue
        out.push(n)
        emitted.add(n)
      }
      break
    }
    out.push(next)
    emitted.add(next)
  }
  return out
}

// ── Frontmatter ────

/**
 * The `format` values inference tries, in order. Each has a shape that a plain word or phrase
 * cannot match by accident, so a match means something. Loose formats (`hostname`, `cuid2`,
 * `base64`, `emoji`, …) are left out on purpose: an ordinary word like `policy` is a valid
 * `hostname` or `cuid2`, so a field of words would be labelled a format. The most specific come
 * first, so `date` wins over `datetime` when both match. Values are checked with
 * `compileSchemaV2`, the same compiler the self-check uses, so a chosen format accepts them.
 */
const FORMAT_CANDIDATES = [
  'date',
  'datetime',
  'time',
  'duration',
  'email',
  'url',
  'uuid',
  'ulid',
  'ipv4',
  'ipv6',
  'e164',
] as const

/** True when every string passes the given `format`, checked with `compileSchemaV2`. */
function allMatchFormat(values: string[], format: string): boolean {
  const schema = compileSchemaV2({ type: 'string', format })
  return values.every((v) => schema.safeParse(v).success)
}

/** Deep equality for JSON-shaped values, for the `const` step. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]))
  }
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as object)
    const kb = Object.keys(b as object)
    return (
      ka.length === kb.length &&
      ka.every((k) =>
        deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
      )
    )
  }
  return false
}

/** True for a string, number or boolean, the values a `const` may hold. */
function isScalar(v: unknown): v is string | number | boolean {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
}

/**
 * Infers one frontmatter field's schema from the values seen. It picks the most specific schema
 * that still accepts every value, trying these steps in order:
 *
 *  1. All values the same scalar, seen in at least `opts.minConstExamples` docs, and for a
 *     string at most `opts.maxConstStringLength` long: `{ const: <value> }`.
 *  2. All numbers: `{ type: number }`, or `type: integer` when all are integers.
 *  3. All booleans: `{ type: boolean }`.
 *  4. All arrays: `{ type: array, items: <loose schema inferred from every element> }`.
 *  5. All strings that match one `format` (most specific first, `date` before `datetime`):
 *     `{ type: string, format: <name> }`.
 *  6. A small set of strings: at most 12 distinct values, fewer than half the files, and none
 *     over the length limit: `{ enum: [<values, in first-appearance order>] }`.
 *  7. Otherwise `{ type: string }`.
 *
 * `fileCount` is the number of files in the group, used in step 6. `opts.relax` skips step 6.
 * `maxConstStringLength` keeps long text out of steps 1 and 6. `minConstExamples` keeps a value
 * out of step 1 until enough docs have it. Each of these only makes the result looser, so it
 * still accepts every value. `min`, `max` and `pattern` are never inferred.
 */
function inferFieldSchema(
  values: unknown[],
  fileCount: number,
  opts: FieldInferOptions,
): Record<string, unknown> {
  if (values.length === 0) return { type: 'string' }

  // Null is handled first. No step accepts `null`, so a field with a `null` value would get a
  // schema that rejects its own files. Infer from the other values, then pair the type with
  // "null" (`[T, "null"]`). The YAML subset cannot make an enum or const nullable, so those steps
  // are turned off here. That only makes the result looser. A field that is always null becomes a
  // nullable string, which the author can tighten by hand.
  if (values.some((v) => v === null)) {
    const nonNull = values.filter((v) => v !== null)
    const typedOpts: FieldInferOptions = {
      ...opts,
      relax: true, // an enum (step 6) cannot be nullable
      minConstExamples: Number.MAX_SAFE_INTEGER, // nor can a const (step 1)
    }
    const baseSchema =
      nonNull.length > 0 ? inferFieldSchema(nonNull, fileCount, typedOpts) : { type: 'string' }
    const { type, ...rest } = baseSchema as { type: string } & Record<string, unknown>
    return { type: [type, 'null'], ...rest }
  }

  // Step 1: one value everywhere → const (with the length and count limits).
  const constSchema = constRung(values, opts)
  if (constSchema) return constSchema

  // Step 2: all numbers → number, or integer when every value is one.
  if (values.every((v) => typeof v === 'number')) {
    return (values as number[]).every((n) => Number.isInteger(n))
      ? { type: 'integer' }
      : { type: 'number' }
  }

  // Step 3: all booleans → boolean.
  if (values.every((v) => typeof v === 'boolean')) {
    return { type: 'boolean' }
  }

  // Step 4: all arrays → array. The item schema is inferred from every element of every array,
  // with no enum (as with `relax`), so it accepts each item in the files.
  if (values.every((v) => Array.isArray(v))) {
    const items = (values as unknown[][]).flat()
    return {
      type: 'array',
      items: inferFieldSchema(items, items.length, { ...opts, relax: true }),
    }
  }

  // Steps 5 (format) and 6 (enum): all strings.
  if (values.every((v) => typeof v === 'string')) {
    return stringRung(values as string[], fileCount, opts)
  }

  // Step 7: a plain string accepts every value.
  return { type: 'string' }
}

/**
 * Step 1: one scalar value everywhere gives `{ const }`. Returns `null` to move on. Two limits
 * stop a field that happens to have one value from becoming fixed: a string longer than the
 * length limit is never a const, and the value must be seen at least `minConstExamples` times.
 * Either one moves the field to a looser step.
 */
function constRung(values: unknown[], opts: FieldInferOptions): Record<string, unknown> | null {
  const first = values[0]
  if (!isScalar(first) || !values.every((v) => deepEqual(v, first))) return null
  const overLength = typeof first === 'string' && first.length > opts.maxConstStringLength
  const tooFewExamples = values.length < opts.minConstExamples
  return !overLength && !tooFewExamples ? { const: first } : null
}

/**
 * Steps 5 and 6 for a field of strings: the first matching `format`, else a small `enum`, else
 * `{ type: string }`.
 */
function stringRung(
  strings: string[],
  fileCount: number,
  opts: FieldInferOptions,
): Record<string, unknown> {
  for (const format of FORMAT_CANDIDATES) {
    if (allMatchFormat(strings, format)) return { type: 'string', format }
  }
  return enumRung(strings, fileCount, opts) ?? { type: 'string' }
}

/**
 * Step 6: a small set of strings gives `{ enum }`. Returns `null` to move on, always so under
 * `--relax`. The YAML `enum` holds only strings. Requiring fewer distinct values than half the
 * files stops a free-text field that happens to repeat from becoming an enum. An enum must accept
 * every value, so a long value cannot be left out. When any value is over the length limit, the
 * step is skipped.
 */
function enumRung(
  strings: string[],
  fileCount: number,
  opts: FieldInferOptions,
): Record<string, unknown> | null {
  if (opts.relax || strings.some((s) => s.length > opts.maxConstStringLength)) return null
  const distinct: string[] = []
  const seen = new Set<string>()
  for (const s of strings) {
    if (!seen.has(s)) {
      seen.add(s)
      distinct.push(s)
    }
  }
  return distinct.length <= 12 && distinct.length * 2 < fileCount ? { enum: distinct } : null
}

/**
 * Infers the frontmatter as an object schema. Keys are in first-appearance order. `required`
 * lists the keys present in every doc. The others are left off, which makes them optional.
 * Field types come from `inferFieldSchema`. `additionalProperties: false` is always safe, since
 * every key seen is listed. `--relax` leaves it out and also turns off enums.
 */
function inferFrontmatter(
  docs: ParsedDoc[],
  opts: FieldInferOptions,
): Record<string, unknown> | undefined {
  const keys: string[] = []
  const seen = new Set<string>()
  const values = new Map<string, unknown[]>()
  for (const doc of docs) {
    for (const [key, value] of Object.entries(doc.frontmatter)) {
      if (!seen.has(key)) {
        seen.add(key)
        keys.push(key)
        values.set(key, [])
      }
      values.get(key)!.push(value)
    }
  }
  if (keys.length === 0) return undefined

  // Step 6 compares against the group's file count, not the number of files with the field,
  // so a field present in only some files does not become an enum by chance.
  const fileCount = docs.length
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (const key of keys) {
    const present = docs.filter((d) => key in d.frontmatter).length
    if (present === docs.length) required.push(key)
    properties[key] = inferFieldSchema(values.get(key)!, fileCount, opts)
  }

  // Key order, as `migrate` writes it: type, required, additionalProperties, properties.
  const node: Record<string, unknown> = { type: 'object' }
  if (required.length > 0) node.required = required
  if (!opts.relax) node.additionalProperties = false
  node.properties = properties
  return node
}

// ── Body ────────────────────────────

/** The first few items of `list` for a message, with a count of the rest. */
function sampleList(list: string[], n = 5): string {
  return list.length <= n
    ? list.join(', ')
    : `${list.slice(0, n).join(', ')} (and ${list.length - n} more)`
}

/** Removes repeats from a list, keeping the first of each value, in order. */
function dedupePreservingOrder(names: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const name of names) {
    if (seen.has(name)) continue
    seen.add(name)
    out.push(name)
  }
  return out
}

/**
 * Infers the body. It lists every section seen in the group, in the detected order. A section
 * in every doc is a plain slot. The others get `minContains: 0` and `maxContains: 1`.
 * `additionalSections` is `false`, since every section seen is listed. `--relax` sets it to
 * `true` and the order to `none`.
 *
 * Two different headings with the same camelCase key (`core/camel.ts`) cannot be two sibling
 * sections. `contract()` rejects that (`contract/key-collision`). So headings are grouped by key
 * and each group becomes one section: the first spelling seen is the name, and the rest become
 * `aliases`. A warning records the merge. Two such headings side by side in one doc cannot be
 * merged, since the one slot would then match twice (`structure/duplicate-section`). That adds an
 * error to `sink.errors` naming the files. A heading with no letters or digits has no key, so it
 * cannot collide and is listed as it is.
 */
function inferBody(
  docs: ParsedDoc[],
  relax: boolean,
  sink: InferSink,
):
  | {
      order: Order
      additionalSections: boolean
      sections: Array<{
        section: string
        aliases?: string[]
        minContains?: number
        maxContains?: number
      }>
    }
  | undefined {
  const { order, sections: detected } = detectOrder(docs)
  // A heading repeated in one doc (a repeatable slot) appears once in the contract. The `none`
  // and `recognized-relative` results are already unique. The `strict` result is `docs[0]`'s
  // list as it is, so remove repeats here.
  const sections = dedupePreservingOrder(detected)
  if (sections.length === 0) return undefined

  // A heading that appears twice or more in one doc is a repeatable slot, so its repeats pass
  // instead of giving `structure/duplicate-section`. (`ParsedDoc.sections` keeps repeats.) Only
  // exact repeats count. Different spellings with the same key are handled below.
  const repeatedSpellings = new Set<string>()
  for (const doc of docs) {
    const counts = new Map<string, number>()
    for (const name of doc.sections) counts.set(name, (counts.get(name) ?? 0) + 1)
    for (const [name, n] of counts) if (n >= 2) repeatedSpellings.add(name)
  }

  const byKey = groupSpellingsByKey(sections)

  const entries: Array<{
    section: string
    aliases?: string[]
    minContains?: number
    maxContains?: number
  }> = []
  const emitted = new Set<string>() // section names already added
  for (const name of sections) {
    emitSectionEntry(name, byKey, emitted, repeatedSpellings, docs, sink, entries)
  }

  return relax
    ? { order: 'none', additionalSections: true, sections: entries }
    : { order, additionalSections: false, sections: entries }
}

/** Groups section names by camelCase key, in first-appearance order. */
function groupSpellingsByKey(sections: string[]): Map<string, string[]> {
  const byKey = new Map<string, string[]>()
  for (const name of sections) {
    const key = toCamelKey(name)
    if (key === '') continue // no letters or digits: no key, so no collision
    let spellings = byKey.get(key)
    if (!spellings) byKey.set(key, (spellings = []))
    spellings.push(name)
  }
  return byKey
}

/**
 * Adds the section entry for `name`, once per merged group, at its first spelling. Other
 * spellings, and a name already added, are skipped. The entry carries any `aliases` and its
 * counts, and the merge is recorded. The counts match what `markdown-contract migrate` writes:
 *   - required, not repeating   → a plain slot (no count keys)
 *   - optional, not repeating   → `minContains: 0` and `maxContains: 1`
 *   - required, repeating       → `minContains: 1` (no upper bound)
 *   - optional, repeating       → `minContains: 0` (no upper bound)
 */
function emitSectionEntry(
  name: string,
  byKey: Map<string, string[]>,
  emitted: Set<string>,
  repeatedSpellings: Set<string>,
  docs: ParsedDoc[],
  sink: InferSink,
  entries: Array<{
    section: string
    aliases?: string[]
    minContains?: number
    maxContains?: number
  }>,
): void {
  const key = toCamelKey(name)
  const spellings = key === '' ? [name] : byKey.get(key)!
  const primary = spellings[0]!
  if (name !== primary) return // an alias: its entry is added at the first spelling
  if (emitted.has(primary)) return
  emitted.add(primary)

  const aliases = spellings.slice(1)
  // Required when every doc has at least one of the spellings.
  const required = docs.every((d) => spellings.some((s) => d.sections.includes(s)))
  // Repeatable when any of the spellings repeats within one doc.
  const repeatable = spellings.some((s) => repeatedSpellings.has(s))
  const entry: {
    section: string
    aliases?: string[]
    minContains?: number
    maxContains?: number
  } = { section: primary }
  if (aliases.length > 0) entry.aliases = aliases
  if (repeatable) {
    entry.minContains = required ? 1 : 0 // repeatable, no upper bound
  } else if (!required) {
    entry.minContains = 0
    entry.maxContains = 1
  }
  entries.push(entry)

  if (aliases.length > 0) recordAliasMerge(spellings, key, primary, docs, sink)
}

/**
 * Records the message for merged spellings that share one `key`. When one doc has more than one
 * of them, the one slot would match twice, so it adds an error to `sink.errors`. Otherwise it
 * adds a warning that names the merge.
 */
function recordAliasMerge(
  spellings: string[],
  key: string,
  primary: string,
  docs: ParsedDoc[],
  sink: InferSink,
): void {
  const filesWith = (spelling: string): string[] =>
    docs.filter((d) => d.sections.includes(spelling)).map((d) => d.rel)
  const quoted = spellings.map((s) => `‘${s}’`).join(' / ')
  const coDocs = docs
    .filter((d) => spellings.filter((s) => d.sections.includes(s)).length > 1)
    .map((d) => d.rel)
  if (coDocs.length > 0) {
    sink.errors.push(
      `sibling headings ${quoted} collapse to the same key ‘${key}’ and appear together as peers ` +
        `in ${sampleList(coDocs)}; they cannot be one section. Rename the headings so they differ ` +
        `(or split the file), then re-run.`,
    )
  } else {
    const examples = spellings.map((s) => `‘${s}’ in ${filesWith(s)[0]}`).join(', ')
    sink.warnings.push(
      `merged variant headings ${quoted} into one section ‘${primary}’ (shared key ‘${key}’); seen as ${examples}`,
    )
  }
}

// ── Names and output ──────────────────────────────────────────────────────────────

/**
 * A slug for one path segment: lowercased, each run of characters outside `a-z0-9` replaced
 * by one `-`, and leading and trailing `-` removed. An empty result becomes `contract`.
 */
function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug === '' ? 'contract' : slug
}

/**
 * The name of a folder group from its path relative to the run folder: each segment slugged and
 * joined with `-` (`api/v1` → `api-v1`, `web/v1` → `web-v1`, `api` → `api`). Paths are unique,
 * so names are too. An empty path is the run folder, named after its basename (or `root` when
 * that slug is empty). The author can rename it.
 */
function nameForDir(relDir: string, absRoot: string): string {
  if (relDir === '') {
    const base = slugify(basename(absRoot))
    return base === 'contract' ? 'root' : base
  }
  return relDir.split('/').map(slugify).join('-')
}

/**
 * Infers the contract `def` for one group of docs: the strictest frontmatter and body that still
 * accept every doc in the group. Both modes use it: single-contract mode has one group, and meta
 * mode has one per folder at the cut. The `def` goes in `InferredContract` and can be passed to
 * `compileContractObject`.
 */
function generalize(
  docs: ParsedDoc[],
  opts: FieldInferOptions,
  sink: InferSink,
): Record<string, unknown> {
  const def: Record<string, unknown> = {}
  const frontmatter = inferFrontmatter(docs, opts)
  if (frontmatter) def.frontmatter = frontmatter
  const body = inferBody(docs, opts.relax, sink)
  if (body) def.body = body
  return def
}

/** The folder of a relative file path (`""` for a file directly in the run folder). */
function dirOf(rel: string): string {
  const slash = rel.lastIndexOf('/')
  return slash === -1 ? '' : rel.slice(0, slash)
}

/** The depth of a relative folder: `""` is 0, `api` is 1, `api/v1` is 2. */
function depthOf(relDir: string): number {
  return relDir === '' ? 0 : relDir.split('/').length
}

/** The parent folder of `relDir` at `depth` (`api/v1/x` at depth 2 → `api/v1`). */
function ancestorAt(relDir: string, depth: number): string {
  return relDir.split('/').slice(0, depth).join('/')
}

/** The doc list for a group key. A new key is added to `order`. */
function bucketFor(groups: Map<string, ParsedDoc[]>, order: string[], key: string): ParsedDoc[] {
  let bucket = groups.get(key)
  if (!bucket) {
    groups.set(key, (bucket = []))
    order.push(key)
  }
  return bucket
}

/**
 * Builds the meta-mode result, one contract per folder at `depth`.
 *
 * Each file goes by its parent folder at `depth`:
 *  - A file in a folder at depth `depth` or deeper belongs to its parent at `depth`. That folder
 *    gets one contract for everything below it (`<reldir>/**\/*.md`).
 *  - A file directly in the run folder always belongs to the root contract. Its glob is `*.md`,
 *    not `**\/*.md`, so it never overlaps a subfolder's glob, whatever the depth.
 *  - A file in a folder between the root and the cut (depth 1 or more, but less than `depth`)
 *    gets no contract, since contracts are never nested. A warning names it. It matches no rule,
 *    so the self-check skips it. This happens only when `depth` is 2 or more.
 *
 * All contracts are at one depth and none is inside another, so the globs never overlap and
 * rule order does not matter. Contracts are named after their folder's path. Output order is
 * the root contract first, if any, then the groups in walk order.
 */
function inferMeta(
  absRoot: string,
  docs: ParsedDoc[],
  depth: number,
  opts: FieldInferOptions,
  inline: boolean,
  sink: InferSink,
): InferResult {
  // Put each doc in the group of its parent folder at `depth`, or in `stranded`.
  const groups = new Map<string, ParsedDoc[]>() // group folder → its docs, in walk order
  const groupOrder: string[] = []
  const stranded: string[] = []
  let hasRoot = false

  for (const doc of docs) {
    const fileDir = dirOf(doc.rel)
    const fileDepth = depthOf(fileDir)
    if (fileDepth === 0) {
      hasRoot = true
      bucketFor(groups, groupOrder, '').push(doc)
    } else if (fileDepth >= depth) {
      bucketFor(groups, groupOrder, ancestorAt(fileDir, depth)).push(doc)
    } else {
      // Between the root and a cut at depth 2 or more: no contract.
      stranded.push(doc.rel)
    }
  }

  // The root group first, then the subfolder groups in walk order.
  const orderedKeys = [...(hasRoot ? [''] : []), ...groupOrder.filter((k) => k !== '')]

  const contracts: InferredContract[] = orderedKeys.map((key) => ({
    name: nameForDir(key, absRoot),
    include: [key === '' ? '*.md' : `${key}/**/*.md`],
    def: generalize(groups.get(key)!, opts, sink),
  }))

  for (const rel of stranded) {
    sink.warnings.push(
      `stranded: ${rel} sits above the --depth ${depth} cut and is covered by no contract; ` +
        `use a shallower --depth to include it`,
    )
  }

  return {
    mode: 'meta',
    contracts,
    files: emitMetaFiles(contracts, inline),
    warnings: sink.warnings,
  }
}

/**
 * The meta-mode files. With `--inline`, one `markdown-contract.yaml` holds each contract inline
 * on its rule. Otherwise `markdown-contract.yaml` has a `contracts` map from each name to
 * `./contracts/<name>.contract.yaml` and `rules` that use the names, and there is one
 * `contracts/<name>.contract.yaml` per group. Rules follow contract order. The globs do not
 * overlap, so the order only keeps diffs clean.
 */
function emitMetaFiles(contracts: InferredContract[], inline: boolean): InferredFile[] {
  if (inline) {
    const config = {
      mcVersion: 2,
      kind: 'config',
      rules: contracts.map((c) => ({ include: c.include, contract: c.def })),
    }
    return [{ path: 'markdown-contract.yaml', content: stringifyYaml(config) }]
  }

  const registry: Record<string, string> = {}
  for (const c of contracts) registry[c.name] = `./contracts/${c.name}.contract.yaml`
  const config = {
    mcVersion: 2,
    kind: 'config',
    contracts: registry,
    rules: contracts.map((c) => ({ include: c.include, contract: c.name })),
  }

  const files: InferredFile[] = [{ path: 'markdown-contract.yaml', content: stringifyYaml(config) }]
  for (const c of contracts) {
    files.push({
      path: `contracts/${c.name}.contract.yaml`,
      content: stringifyYaml({ mcVersion: 2, kind: 'contract', ...c.def }),
    })
  }
  return files
}

/**
 * Infers a config from the markdown files under `root`: the strictest contract that still
 * accepts every file. It reads files and writes nothing. Two modes:
 *  - Single contract (the default, `opts.meta` not set): one contract for every `*.md` under
 *    `root`.
 *  - Meta (`opts.meta` set): one contract per folder at depth `opts.depth ?? 1`, covering
 *    everything below it, plus a root contract for files directly in `root`. A file in a folder
 *    above a cut at depth 2 or more gets a warning and no contract.
 *
 * Both modes infer each group the same way (`generalize`). `opts.depth` 0, or single mode, gives
 * one contract over `**\/*.md`.
 *
 * @param root The folder to read.
 * @param opts How to infer; see {@link InferOptions}.
 * @returns The contracts, the YAML files to write, and warnings.
 * @throws {DeclarativeError} When the files cannot give a contract that accepts them all: two
 *   headings in one file that map to the same key, a file that cannot be read, or a file whose
 *   frontmatter is not valid YAML. The message names the file.
 * @throws {Error} When `root` cannot be read.
 * @experimental
 */
export function inferConfig(root: string, opts?: InferOptions): InferResult {
  const absRoot = resolve(root)
  // The field inference options, with defaults applied.
  const fieldOpts: FieldInferOptions = {
    relax: opts?.relax === true,
    maxConstStringLength: opts?.maxConstStringLength ?? DEFAULT_MAX_CONST_STRING_LENGTH,
    minConstExamples: opts?.minConstExamples ?? DEFAULT_MIN_CONST_EXAMPLES,
  }
  const scope = {
    ...(opts?.include !== undefined ? { include: opts.include } : {}),
    ...(opts?.exclude !== undefined ? { exclude: opts.exclude } : {}),
  }
  const docs = discover(absRoot, scope).map((rel) => parseDoc(absRoot, rel))

  // Messages from every group collect here. Errors throw only after all groups run, so one run
  // names every heading clash, not just the first.
  const sink: InferSink = { warnings: [], errors: [] }

  // Meta mode cuts at `depth` (default 1). Depth 0 means single-contract mode.
  const depth = opts?.depth ?? 1
  let result: InferResult
  if (opts?.meta === true && depth >= 1) {
    result = inferMeta(absRoot, docs, depth, fieldOpts, opts?.inline === true, sink)
  } else {
    // Single-contract mode: one group, named after the run folder's basename.
    const def = generalize(docs, fieldOpts, sink)
    const name = slugify(basename(absRoot))
    const contract: InferredContract = { name, include: ['**/*.md'], def }
    const content = stringifyYaml({ mcVersion: 2, kind: 'contract', ...def })
    result = {
      mode: 'single',
      contracts: [contract],
      files: [{ path: `${name}.contract.yaml`, content }],
      warnings: sink.warnings,
    }
  }

  // When no contract can accept the files, throw with every heading clash named, instead of
  // returning a contract that would fail on its own files.
  if (sink.errors.length > 0) {
    const lead =
      sink.errors.length === 1
        ? `cannot infer a contract — a heading key-collision needs fixing:`
        : `cannot infer a contract — ${sink.errors.length} heading key-collisions need fixing:`
    throw new DeclarativeError(`${lead}\n${sink.errors.map((e) => `  - ${e}`).join('\n')}`)
  }
  return result
}
