/**
 * A corpus as data: `loadCorpus` runs the validator's own pass and returns what it read and
 * resolved, the corpus's types, records and references, as plain data that serialises to JSON.
 */
import { extname } from 'node:path'
import { split } from '@osdlc/frontmatter-lossless'
import { npmPackageUrl } from './identity.ts'
import { rootName } from './inherit.ts'
import { fold } from './links.ts'
import {
  asMap,
  chain,
  check,
  type Corpus,
  type Data,
  flattened,
  type Found,
  load,
  recordFileOf,
  type RefForm,
  type Type,
  typeLabel,
} from './validate.ts'

/**
 * Options for `loadCorpus`.
 *
 * @experimental
 */
export interface LoadOptions {
  /** Keep each `.md` record's Markdown body. Default true. With false, every `body` is null. */
  bodies?: boolean
}

/**
 * A type, named from the corpus that holds the `TypeRef`.
 *
 * @experimental
 */
export interface TypeRef {
  /** The key of the type's corpus in the loaded graph: `''` for the corpus that was loaded. */
  corpus: string
  /** The type's name in its own corpus: its folder name. */
  type: string
  /**
   * The type as the holding corpus names it: `<type>` for one of its own, `<prefix>/<type>` for a
   * type of a corpus it extends or references, or a longer chain of prefixes through references.
   */
  name: string
}

/**
 * The `x-ref` of a field: the types whose records its values may name, and how they name them.
 *
 * @experimental
 */
export interface FieldRef {
  /** The type names as the schema that declares the `x-ref` writes them. */
  types: string[]
  /** The types they name, or null when a name names no type, so the field's values are not resolved. */
  targets: TypeRef[] | null
  /** How a value names its record: `link`, `id` or `wikilink`. */
  form: RefForm
  /** Whether the `x-ref` sits on the field's `items`, so each item of a list is a reference. */
  items: boolean
}

/**
 * A top-level field of a type: a property its schema, or the schema of a type up its chain, declares.
 *
 * @experimental
 */
export interface CorpusField {
  /** The property name. */
  name: string
  /** The property's JSON Schema, from the nearest type in the chain that declares it. */
  schema: unknown
  /** That type. A record's value also passes the field's schema in every type further up the chain. */
  declaredBy: TypeRef
  /** Whether the root `required` of a schema in the chain names the field. */
  required: boolean
  /** The field's `x-ref`, from the nearest type in the chain that gives it one, or null. */
  ref: FieldRef | null
}

/**
 * A type of a corpus: a folder at the corpus root whose files are records.
 *
 * @experimental
 */
export interface CorpusType {
  /** The type's name: its folder name. */
  name: string
  /** The type folder, relative to the corpus root. */
  dir: string
  /**
   * Where the type's rules come from: `local` for its own schema alone, `extends` for a schema
   * whose `x-extends` names a type to build on, `uses` for a parent's type that the root file's
   * `uses` gives the folder as it is.
   */
  origin: 'local' | 'extends' | 'uses'
  /** The schema file, relative to the corpus root, or null for a `uses` type, which has none. */
  schemaFile: string | null
  /** The `title` of the nearest schema in the chain that has one, or null. */
  title: string | null
  /** The `description` of the nearest schema in the chain that has one, or null. */
  description: string | null
  /** The type's own schema, as written. Null for a `uses` type, or when the file does not parse. */
  schema: Data | null
  /**
   * The flattened schema the spec defines: the type's own schema, whose top-level `properties`
   * and `patternProperties` also hold, as `true`, each one a type up the chain declares. A `uses`
   * type has the flattened schema of the type it uses. Null when the schema file does not parse.
   */
  flattened: Data | null
  /** The type, then each type it builds on, nearest first. A record passes the schema of each. */
  chain: TypeRef[]
  /** The type's identity, `<corpus identity>#<type>`, or null when the corpus is in no package. */
  identity: string | null
  /** The `x-record-file` in force: the type's, or that of the nearest type up the chain. Null for none. */
  recordFile: string | null
  /**
   * The top-level fields of the whole chain, in schema order: the furthest type's fields first,
   * the type's own last. A field declared again keeps its first place.
   */
  fields: CorpusField[]
}

/**
 * A record, named by where it is in the loaded graph.
 *
 * @experimental
 */
export interface RecordTarget {
  /** The key of the record's corpus in the loaded graph: `''` for the corpus that was loaded. */
  corpus: string
  /** The record's type, by its name in that corpus. */
  type: string
  /** The record's id. */
  id: string
  /** The record's file, relative to its corpus's root. With `corpus`, it names one record. */
  path: string
}

/**
 * One value of an `x-ref` field of a record.
 *
 * @experimental
 */
export interface RecordReference {
  /** The top-level field that holds the value. */
  field: string
  /** The value's place in the record's data, as a JSON Pointer: `/owner`, or `/sources/2` in a list. */
  pointer: string
  /** The value as the record holds it. */
  value: unknown
  /** The form the field's `x-ref-form` asks for: `link`, `id` or `wikilink`. */
  form: RefForm
  /** The record the value names, or null when it names none. */
  target: RecordTarget | null
  /** Why the value names no record, or null when it names one. */
  unresolved: string | null
}

/**
 * A link in a record's Markdown body that points at a record's file.
 *
 * @experimental
 */
export interface RecordLink {
  /** A Markdown link, `[text](path)`, or a wikilink, `[[path]]`. */
  kind: 'markdown' | 'wiki'
  /** Whether the link is an embed: `![text](path)` or `![[path]]`. */
  embed: boolean
  /** The link text, or a wikilink's alias. `''` for none. */
  text: string
  /** The path as written, without its fragment: percent-encoded in a Markdown link, plain in a wikilink. */
  href: string
  /** The part after `#`, or `''`. */
  fragment: string
  /** The offsets of the whole link in the record's `body`, in UTF-16 code units. */
  start: number
  /** The offset just past the link. */
  end: number
  /** The record the link points at. */
  target: RecordTarget
}

/**
 * A reference or a body link that points at a record, seen from that record.
 *
 * @experimental
 */
export interface Backlink {
  /** The record that holds the reference or the link. */
  from: RecordTarget
  /** `reference` for a value of an `x-ref` field, `link` for a link in the Markdown body. */
  via: 'reference' | 'link'
  /** The JSON Pointer of the value in the holding record's data, or null for a body link. */
  pointer: string | null
}

/**
 * A record: one `.md`, `.yaml` or `.json` file in a type folder.
 *
 * @experimental
 */
export interface CorpusRecord {
  /** The record's id, cut from its file name, or from its folder's name for a record folder. */
  id: string
  /** The record's type, by name. */
  type: string
  /** The record's file, relative to the corpus root, with `/`. */
  path: string
  /** The file's name without its extension, or the record folder's name. */
  name: string
  /** The record's `title` field when it is a non-empty string, else `name`. */
  title: string
  /** The file's format. */
  format: 'md' | 'yaml' | 'json'
  /**
   * Whether the record is valid by itself: its id follows the rules and is the only one in its
   * type, and its data passes the schemas of its chain. A broken link or reference does not make
   * it false.
   */
  valid: boolean
  /** The record's identity, `<corpus identity>#<type>/<id>`, or null when the corpus is in no package. */
  identity: string | null
  /** The frontmatter of a `.md` record, or the whole of a `.yaml` or `.json` one. `{}` when it does not parse. */
  data: Data
  /** The Markdown after the frontmatter of a `.md` record. Null for `.yaml` and `.json`. */
  body: string | null
  /** The record folder the file is the record of, relative to the corpus root, or null. */
  folder: string | null
  /** The other files in the record folder, at any depth, relative to the corpus root. Empty with no folder. */
  files: string[]
  /** Each value of each `x-ref` field, by `pointer`. */
  references: RecordReference[]
  /** Each link in `body` that points at a record, in the order they appear. */
  links: RecordLink[]
  /** Each reference and body link of a record in the loaded graph that points at this record. */
  incoming: Backlink[]
}

/**
 * One corpus of a loaded graph.
 *
 * @experimental
 */
export interface CorpusModel {
  /**
   * The corpus's key in the loaded graph: `''` for the corpus that was loaded, else the shortest
   * chain of `extends` and `references` prefixes that reaches it, such as `org` or `org/base`.
   */
  key: string
  /** The corpus's name: the `<name>` of its root file, or its folder name when it has none. */
  name: string
  /**
   * The corpus folder: as passed to `loadCorpus` for the corpus that was loaded, else its real
   * path. The only value in the model that depends on where the corpus is on disk.
   */
  root: string
  /** The root file, relative to the corpus root, or null when the folder holds none. */
  rootFile: string | null
  /** The root file's `id`, or null. */
  id: string | null
  /** The root file's `level`, or null when it states none or it is not 1 or 2. */
  level: 1 | 2 | null
  /** The corpus's identity, its unversioned package URL, or null for a corpus in no package. */
  identity: string | null
  /** The package's version, or null. */
  version: string | null
  /** The corpora `extends` names that loaded: each prefix and the key of its corpus. */
  extends: Record<string, string>
  /** The corpora `references` names that loaded: each prefix and the key of its corpus. */
  references: Record<string, string>
  /** The corpus's types, by name. */
  types: CorpusType[]
  /** The corpus's records, by type, then id, then path. Records with errors are here too. */
  records: CorpusRecord[]
  /** The errors `validateCorpus` reports for the corpus, in its order. */
  errors: string[]
  /** The warnings `validateCorpus` reports for the corpus, in its order. */
  warnings: string[]
}

/**
 * What `loadCorpus` returns: the corpus, and every other corpus of its graph once, by key.
 *
 * @experimental
 */
export interface LoadedCorpus extends CorpusModel {
  /**
   * Every corpus the loaded one extends or references, at any depth, by `key`, in key order. Two
   * folders of one package are one corpus. The loaded corpus itself is not in it.
   */
  corpora: Record<string, CorpusModel>
}

const less = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
const sorted = <V>(entries: Iterable<[string, V]>): [string, V][] =>
  [...entries].sort(([a], [b]) => less(a, b))

/** What makes two loaded corpora one: the package, or the folder of a corpus in none. */
const sameAs = (c: Corpus): string => c.identity ?? c.real

/** Every corpus of `root`'s graph by key, breadth first, so each key is the shortest chain. */
function graph(root: Corpus): { byKey: Map<string, Corpus>; keyOf: (c: Corpus) => string } {
  const byKey = new Map<string, Corpus>([['', root]])
  const keys = new Map<string, string>([[sameAs(root), '']])
  const queue: Corpus[] = [root]
  for (let c = queue.shift(); c !== undefined; c = queue.shift()) {
    const from = keys.get(sameAs(c)) as string
    for (const [prefix, named] of sorted([...c.parents, ...c.references])) {
      if (keys.has(sameAs(named))) continue
      const key = from === '' ? prefix : `${from}/${prefix}`
      keys.set(sameAs(named), key)
      byKey.set(key, named)
      queue.push(named)
    }
  }
  return { byKey, keyOf: (c) => keys.get(sameAs(c)) as string }
}

const pointer = (field: string, index: number | undefined): string =>
  `/${field.replace(/~/g, '~0').replace(/\//g, '~1')}${index === undefined ? '' : `/${index}`}`

const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const stringOr = <T>(v: unknown, otherwise: T): string | T =>
  typeof v === 'string' && v !== '' ? v : otherwise

function byFile<T extends { file: string }>(found: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const f of found) {
    const list = out.get(f.file)
    if (list === undefined) out.set(f.file, [f])
    else list.push(f)
  }
  return out
}

/** The files of sorted `files` under `dir`, but for `file`. */
function under(files: string[], dir: string, file: string): string[] {
  const start = `${dir}/`
  let lo = 0
  let hi = files.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((files[mid] as string) < start) lo = mid + 1
    else hi = mid
  }
  const out: string[] = []
  for (let i = lo; files[i]?.startsWith(start); i++)
    if (files[i] !== file) out.push(files[i] as string)
  return out
}

/** One corpus of the graph as data. Its records' `incoming` are filled by `loadCorpus`. */
function model(
  c: Corpus,
  key: string,
  root: string,
  keyOf: (c: Corpus) => string,
  bodies: boolean,
): CorpusModel {
  const typeRef = (t: Type): TypeRef => ({
    corpus: keyOf(t.corpus),
    type: t.name,
    name: typeLabel(t, c),
  })
  const target = (to: Found): RecordTarget => {
    const record = to.corpus.recordFiles.get(to.file)
    return {
      corpus: keyOf(to.corpus),
      type: record?.type.name ?? '',
      id: record?.id ?? '',
      path: to.file,
    }
  }
  const identity = (...subpath: string[]): string | null =>
    c.package === null ? null : npmPackageUrl(c.package.name, undefined, subpath)

  const types = sorted(c.types).map(([name, type]): CorpusType => {
    const types = chain(type)
    const nearest = (keyword: string): string | null =>
      types.map((t) => stringOr(t.schema?.[keyword], null)).find((v) => v !== null) ?? null
    const required = new Set(types.flatMap((t) => asList(t.schema?.['required'])))
    const fields = new Map<string, CorpusField>()
    for (const t of [...types].reverse())
      for (const [field, schema] of Object.entries(asMap(t.schema?.['properties']))) {
        const ref = t.refs.find((r) => r.field === field)
        fields.set(field, {
          name: field,
          schema,
          declaredBy: typeRef(t),
          required: required.has(field),
          ref:
            ref === undefined
              ? (fields.get(field)?.ref ?? null)
              : {
                  types: ref.types,
                  targets: ref.targets?.map(typeRef) ?? null,
                  form: ref.form,
                  items: ref.items,
                },
        })
      }
    // A `uses` type has no schema file: its folder stands in for one.
    const uses = type.schemaFile === type.dir
    const schemed = uses ? type.base : type
    return {
      name,
      dir: type.dir,
      origin: uses ? 'uses' : type.base === undefined ? 'local' : 'extends',
      schemaFile: uses ? null : type.schemaFile,
      title: nearest('title'),
      description: nearest('description'),
      schema: type.schema ?? null,
      flattened: schemed?.schema === undefined ? null : flattened(schemed),
      chain: types.map(typeRef),
      identity: identity(name),
      recordFile: recordFileOf(type) ?? null,
      fields: [...fields.values()],
    }
  })

  const files = [...c.files]
  const refs = byFile(c.refs)
  const links = byFile(c.links)
  const records = [...c.recordFiles].map(([path, record]): CorpusRecord => {
    const ext = extname(path)
    const checked = c.checked.get(path)
    return {
      id: record.id,
      type: record.type.name,
      path,
      name: record.name,
      title: stringOr(checked?.data?.['title'], record.name),
      format: ext.slice(1) as CorpusRecord['format'],
      valid: record.valid,
      identity: identity(record.type.name, record.id),
      data: checked?.data ?? {},
      body: ext === '.md' && bodies ? split(checked?.text ?? '').body : null,
      folder: record.folder ?? null,
      files: record.folder === undefined ? [] : under(files, record.folder, path),
      references: (refs.get(path) ?? [])
        .map((r) => ({
          field: r.ref.field,
          pointer: pointer(r.ref.field, r.index),
          value: r.value,
          form: r.ref.form,
          target: r.to === undefined ? null : target(r.to),
          unresolved: r.to === undefined ? (r.why ?? null) : null,
        }))
        .sort((a, b) => less(a.field, b.field)),
      links: (links.get(path) ?? []).map(({ link, to }) => ({
        kind: link.kind,
        embed: link.embed,
        text: link.text,
        href: link.target,
        fragment: link.fragment,
        start: link.start,
        end: link.end,
        target: target(to),
      })),
      incoming: [],
    }
  })
  records.sort((a, b) => less(a.type, b.type) || less(a.id, b.id) || less(a.path, b.path))

  return {
    key,
    name: c.name,
    root,
    rootFile: files.find((f) => !f.includes('/') && rootName(f) !== undefined) ?? null,
    id: c.id ?? null,
    level: c.level ?? null,
    identity: c.identity ?? null,
    version: c.package?.version ?? null,
    extends: Object.fromEntries(sorted(c.parents).map(([p, k]) => [p, keyOf(k)])),
    references: Object.fromEntries(sorted(c.references).map(([p, k]) => [p, keyOf(k)])),
    types,
    records,
    errors: [...c.errors],
    warnings: [...c.warnings],
  }
}

/**
 * Load the corpus at `root` as plain data: its types, its records, and every reference and body
 * link between records, resolved, with the corpora it extends and references beside it. It runs
 * the pass `validateCorpus` runs, so `errors` and `warnings` are the ones `validateCorpus(root)`
 * reports, and a value resolves here exactly when the validator accepts it. It writes nothing,
 * and reads the corpora that `references` names where they are installed, not their
 * `_references/` copies, so a copy that is missing or stale is an error line and nothing else.
 *
 * The result holds only JSON values: no `undefined`, no Map, no cycle. `JSON.stringify` then
 * `JSON.parse` gives an equal model, unless a record's data holds a value JSON lacks, such as a
 * YAML `.nan`. Records point at each other by `RecordTarget`, which `resolveTarget` follows. Order
 * is the same on every run and platform: types by name, records by type, id and path, references
 * by field, links by place in the body, backlinks by the record they come from. Strings compare
 * by UTF-16 code unit.
 *
 * Nothing is thrown for a problem in the corpus. A corpus with errors loads as far as it was
 * read: a folder with no root file, or one that is not version 0, has no types and no records; a
 * type whose schema does not parse has its records, unchecked; a record with errors is in
 * `records` with `valid: false`, and with `data: {}` when its data does not parse; a named corpus
 * that does not resolve is absent from `extends`, `references` and `corpora`. A reference of a
 * record with `valid: false` is resolved the same way, though the validator reports no error
 * for it. When `errors` is empty, every record is valid and every reference has a target.
 *
 * @experimental
 */
export function loadCorpus(root: string, { bodies = true }: LoadOptions = {}): LoadedCorpus {
  const c = load(root)
  check(c)
  const { byKey, keyOf } = graph(c)
  const models = sorted(byKey).map(([key, k]) =>
    model(k, key, k === c ? root : k.root, keyOf, bodies),
  )
  const loaded = models[0] as CorpusModel
  const out: LoadedCorpus = {
    ...loaded,
    corpora: Object.fromEntries(models.slice(1).map((m) => [m.key, m])),
  }
  for (const m of models)
    for (const from of m.records) {
      const self = { corpus: m.key, type: from.type, id: from.id, path: from.path }
      for (const r of from.references)
        if (r.target !== null)
          resolveTarget(out, r.target)?.incoming.push({
            from: self,
            via: 'reference',
            pointer: r.pointer,
          })
      for (const l of from.links)
        resolveTarget(out, l.target)?.incoming.push({ from: self, via: 'link', pointer: null })
    }
  return out
}

interface Index {
  types: Map<string, CorpusType>
  byType: Map<string, CorpusRecord[]>
  byId: Map<string, CorpusRecord>
  byPath: Map<string, CorpusRecord>
}

// Built on first use, per model object: a model read back from JSON gets its own.
const INDEXES = new WeakMap<LoadedCorpus, Index>()

function indexOf(model: LoadedCorpus): Index {
  let index = INDEXES.get(model)
  if (index !== undefined) return index
  index = { types: new Map(), byType: new Map(), byId: new Map(), byPath: new Map() }
  for (const m of [model, ...Object.values(model.corpora)]) {
    for (const t of m.types) {
      index.types.set(`${m.key}\0${t.name}`, t)
      index.byType.set(`${m.key}\0${t.name}`, [])
    }
    for (const r of m.records) {
      index.byType.get(`${m.key}\0${r.type}`)?.push(r)
      index.byPath.set(`${m.key}\0${r.path}`, r)
      // The record the validator finds by this id: the first file by path.
      const id = `${m.key}\0${r.type}\0${fold(r.id)}`
      const other = index.byId.get(id)
      if (other === undefined || r.path < other.path) index.byId.set(id, r)
    }
  }
  INDEXES.set(model, index)
  return index
}

/**
 * The corpus with `key` in a loaded graph: `model` itself for `''`, else one of `model.corpora`.
 * Undefined when the graph holds no such corpus.
 *
 * @experimental
 */
export const getCorpus = (model: LoadedCorpus, key = ''): CorpusModel | undefined =>
  key === '' ? model : Object.hasOwn(model.corpora, key) ? model.corpora[key] : undefined

/**
 * The type named `name` in the corpus with key `corpus`, by default the loaded one, or undefined.
 *
 * `getType`, `recordsOf`, `getRecord` and `resolveTarget` index a model the first time one of
 * them reads it, so do not change a model after that.
 *
 * @experimental
 */
export const getType = (model: LoadedCorpus, name: string, corpus = ''): CorpusType | undefined =>
  indexOf(model).types.get(`${corpus}\0${name}`)

/**
 * The records of type `type` in the corpus with key `corpus`, by default the loaded one, by id.
 * Empty when the corpus has no such type.
 *
 * @experimental
 */
export const recordsOf = (model: LoadedCorpus, type: string, corpus = ''): CorpusRecord[] =>
  indexOf(model).byType.get(`${corpus}\0${type}`) ?? []

/**
 * The record of type `type` with id `id` in the corpus with key `corpus`, by default the loaded
 * one, or undefined. Ids compare as the validator compares them, by `fold`. When two files claim
 * one id, which is an error, the first by path is the record, as for the validator.
 *
 * @experimental
 */
export const getRecord = (
  model: LoadedCorpus,
  type: string,
  id: string,
  corpus = '',
): CorpusRecord | undefined => indexOf(model).byId.get(`${corpus}\0${type}\0${fold(id)}`)

/**
 * The record a `RecordTarget` names, such as a reference's `target` or a backlink's `from`, in
 * any corpus of the graph. Undefined when `model` holds no such record.
 *
 * @experimental
 */
export const resolveTarget = (
  model: LoadedCorpus,
  target: RecordTarget,
): CorpusRecord | undefined => indexOf(model).byPath.get(`${target.corpus}\0${target.path}`)
