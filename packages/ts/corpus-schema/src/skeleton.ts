/**
 * The `new` verb (the corpus-schema guide's "The new command"): a record skeleton built from a
 * type's schema, and a record file written from it.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { stringify } from 'yaml'

import { fold } from './links.ts'
import {
  asMap,
  chain,
  type Corpus,
  type Data,
  describe,
  idOf,
  idProblem,
  load,
  recordFileOf,
  type Type,
} from './validate.ts'

/** How deep a schema is built out, so a recursive `$ref` ends. */
const MAX_DEPTH = 8

/** The text that stands in for an `enum`: its values, one of which the writer picks. */
const placeholder = (values: unknown[]): string =>
  `<${values.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(' | ')}>`

/** The schema a local `$ref` (`#/$defs/x`) points at, or undefined. */
function pointer(root: Data, ref: string): unknown {
  if (!ref.startsWith('#/')) return undefined
  let node: unknown = root
  for (const part of ref.slice(2).split('/'))
    node = asMap(node)[part.replace(/~1/g, '/').replace(/~0/g, '~')]
  return node
}

/** `node` and every schema it adds rules from: `allOf`, the first `oneOf` or `anyOf` branch, a `$ref`. */
function parts(node: unknown, root: Data, depth: number): Data[] {
  const own = asMap(node)
  if (depth > MAX_DEPTH || Object.keys(own).length === 0) return []
  const ref = typeof own['$ref'] === 'string' ? pointer(root, own['$ref']) : undefined
  const more = [
    ref,
    ...(Array.isArray(own['allOf']) ? own['allOf'] : []),
    ...['oneOf', 'anyOf'].map((k) => (Array.isArray(own[k]) ? own[k][0] : undefined)),
  ]
  return [own, ...more.flatMap((m) => parts(m, root, depth + 1))]
}

/** The value a schema asks for: a `const`, a `default`, an `enum` placeholder, or an empty value of its type. */
function build(node: unknown, root: Data, depth = 0): unknown {
  const all = parts(node, root, depth)
  const first = (key: string): unknown => all.find((p) => key in p)?.[key]
  if (all.some((p) => 'const' in p)) return first('const')
  if (all.some((p) => 'default' in p)) return structuredClone(first('default'))
  if (all.some((p) => Array.isArray(p['enum']))) return placeholder(first('enum') as unknown[])
  const declared = all.flatMap((p) => (Array.isArray(p['type']) ? p['type'] : [p['type']]))
  const type = declared.find((t) => t !== undefined && t !== 'null') ?? declared[0]
  if (type === 'object' || all.some((p) => 'properties' in p || 'required' in p)) {
    if (depth >= MAX_DEPTH) return {}
    const out: Data = {}
    for (const key of new Set(
      all.flatMap((p) => (Array.isArray(p['required']) ? p['required'] : [])),
    ))
      out[String(key)] = build(
        { allOf: all.flatMap((p) => asMap(p['properties'])[String(key)] ?? []) },
        root,
        depth + 1,
      )
    return out
  }
  if (type === 'array') {
    const min = Number(first('minItems') ?? 0)
    return min > 0 && depth < MAX_DEPTH
      ? Array.from({ length: min }, () => build(first('items'), root, depth + 1))
      : []
  }
  if (type === 'integer' || type === 'number') return Math.max(Number(first('minimum') ?? 0), 0)
  if (type === 'boolean') return false
  if (type === 'null') return null
  return ''
}

/** The loaded corpus at `root` and the type `name` in it. Throws when the corpus cannot be used. */
function find(root: string, name: string): { c: Corpus; type: Type } {
  const c = load(root)
  if (c.fatal.length > 0) throw new Error(c.fatal.join('\n'))
  const type = c.types.get(name)
  if (type === undefined)
    throw new Error(
      `${name}: no such type in ${c.name}; its types: ${[...c.types.keys()].join(', ') || 'none'}`,
    )
  return { c, type }
}

/** The frontmatter of a new record of `type`: each required field, built out from the chain, furthest type first. */
function skeleton(type: Type): Data {
  const out: Data = {}
  for (const t of chain(type).reverse())
    if (t.schema !== undefined) merge(out, build(t.schema, t.schema) as Data)
  return out
}

/**
 * The frontmatter of a new record of the type `type` in the corpus at `root`: every required
 * field of the type and of each type it extends or uses, in schema order, furthest type first. A
 * field is its `const` or `default`, a `<a | b>` placeholder for an `enum`, or an empty string,
 * number, boolean or list, and a required object is built out the same way. It is a template, not
 * a valid record. Throws when the corpus has an error in its root file or the type is unknown.
 *
 * @experimental
 */
export function recordSkeleton(root: string, type: string): Data {
  return skeleton(find(root, type).type)
}

/**
 * What `newRecord` takes besides the corpus, type and id.
 *
 * @experimental
 */
export interface NewRecordOptions {
  /** Write a record folder, `<type>/<id>/<id>.md` or the type's `x-record-file`, not `<type>/<id>.md`. */
  folder?: boolean
  /**
   * Fields to fill in, over the skeleton: objects merge, anything else replaces. The record must
   * then pass the type's schemas, or nothing is written.
   */
  values?: Data
}

const plain = (x: unknown): x is Data => x !== null && typeof x === 'object' && !Array.isArray(x)

/** `from` merged into `into`: objects merge, anything else replaces. */
const merge = (into: Data, from: Data): Data => {
  for (const [k, v] of Object.entries(from)) {
    const here = Object.hasOwn(into, k) ? into[k] : undefined
    // defineProperty, so a `__proto__` key is data and never the prototype.
    Object.defineProperty(into, k, {
      value: plain(here) && plain(v) ? merge(here, v) : v,
      enumerable: true,
      writable: true,
      configurable: true,
    })
  }
  return into
}

/**
 * Write a new record `id` of the type `type` in the corpus at `root`, from `recordSkeleton`, and
 * return its path relative to the corpus. The file is `<type>/<id>.<ext>`, in the first of the
 * corpus's formats that is `md`, or else its first. With `options.folder` it is a record folder.
 * Throws, one problem a line and writing nothing, when the id breaks the id rules or a type's
 * `x-id-pattern`, when the type has a record of that id or a file is in the way, or, given
 * `options.values`, when the filled record fails its schemas.
 *
 * @experimental
 */
export function newRecord(
  root: string,
  type: string,
  id: string,
  options: NewRecordOptions = {},
): string {
  const { c, type: t } = find(root, type)
  const types = chain(t)
  const problems: string[] = []
  const bad = idProblem(id)
  // As the validator reads a file name: an `x-id-pattern` id may be the front of it, `P-0002-be-kind`.
  const derived = idOf(types, id)
  if (bad !== undefined) problems.push(`id: "${id}" ${bad}`)
  else if (derived === undefined)
    for (const u of types)
      if (u.idPattern !== undefined && !u.idPattern.test(id))
        problems.push(`id: "${id}" does not match x-id-pattern ${u.idPattern.source}`)
  const recordId = derived ?? id
  const taken = t.ids.get(fold(recordId))
  if (taken !== undefined) problems.push(`id: "${recordId}" is also ${taken}`)
  if (problems.length > 0) throw new Error(problems.join('\n'))

  const ext = c.extensions.includes('.md') ? '.md' : (c.extensions[0] ?? '.md')
  const file =
    options.folder === true
      ? `${t.dir}/${id}/${recordFileOf(t) ?? `${id}${ext}`}`
      : `${t.dir}/${id}${ext}`
  if (!c.extensions.includes(extname(file)))
    throw new Error(`${file}: format: ${extname(file).slice(1)} is not in the corpus's formats`)
  if (existsSync(join(root, file))) throw new Error(`${file}: (file): already exists`)

  // A type that declares `id` gets the record's own, first.
  const declaresId = types.some((u) => 'id' in asMap(u.schema?.['properties']))
  const data: Data = declaresId ? { id: recordId, ...skeleton(t) } : skeleton(t)
  if (declaresId) data['id'] = recordId
  if (options.values !== undefined) {
    if (declaresId && options.values['id'] !== undefined && options.values['id'] !== recordId)
      throw new Error(`id: "${String(options.values['id'])}" is not the record's id "${recordId}"`)
    merge(data, options.values)
    for (const u of types)
      if (u.validate !== undefined && !u.validate(data))
        for (const e of u.validate.errors ?? [])
          if (e.keyword !== 'if') problems.push(`${file}: ${describe(e)}`)
    if (problems.length > 0) throw new Error([...new Set(problems)].join('\n'))
  }

  // The file's own extension decides its syntax, as an x-record-file may differ from the corpus's.
  const text =
    extname(file) === '.json'
      ? `${JSON.stringify(data, null, 2)}\n`
      : extname(file) === '.yaml'
        ? stringify(data)
        : `---\n${Object.keys(data).length === 0 ? '' : stringify(data)}---\n`
  mkdirSync(dirname(join(root, file)), { recursive: true })
  writeFileSync(join(root, file), text, { flag: 'wx' })
  return file
}
