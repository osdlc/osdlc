/**
 * The corpus-schema validator, for version 0 of the corpus-schema spec
 * (packages/conformance/corpus-schema/SPEC.md). Nothing here knows a particular corpus: every rule
 * comes from the spec, the root file or a type's schema.
 */
import { type Dirent, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { basename, extname, join, posix, resolve as resolvePath } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js'
import addFormatsModule, { type FormatsPlugin } from 'ajv-formats'
import { split } from '@osdlc/frontmatter-lossless'
import { parse as parseYaml, YAMLParseError } from 'yaml'
import {
  extractLinks,
  fold,
  FORMATS,
  type Link,
  markdownLink,
  matchWikilink,
  RECORD_EXTENSIONS,
  wikilinkIndex,
  type WikilinkIndex,
} from './links.ts'
import {
  CORPUS_NAME,
  entries,
  hasRootFile,
  REFERENCES,
  listFiles,
  oneLine,
  type PackageId,
  PREFIX,
  resolveSource,
  rootName,
  ROOT_SUFFIXES,
  rootPackage,
  sameBytes,
  skipped,
  whyFailed,
} from './inherit.ts'
import { npmPackageUrl } from './identity.ts'

// ajv-formats is CommonJS: under Node's ESM loader the plugin is the `default` property.
const addFormats = (addFormatsModule as unknown as { default: FormatsPlugin }).default

const ROOT_KEYS = new Set([
  'corpus-schema',
  'id',
  'formats',
  'level',
  'extends',
  'references',
  'uses',
])
/** Root keys a later version defines. v0 accepts them and checks nothing in them. */
const RESERVED_KEYS = new Set(['dialect', 'profiles'])

/**
 * A record's data: the YAML frontmatter of a `.md` record, or the whole of a `.yaml` or `.json`
 * record, as parsed. Empty data is `{}`.
 */
export type Data = Record<string, unknown>

/** How an `x-ref` value names its record: a relative link, a bare id, or `[[id]]`. */
type RefForm = 'link' | 'id' | 'wikilink'
const REF_FORMS: readonly string[] = ['link', 'id', 'wikilink']

interface Ref {
  field: string
  /** The corpus whose schema holds the `x-ref`. */
  corpus: Corpus
  /** The types as the schema names them: `<type>` or `<prefix>/<type>`. */
  types: string[]
  /** The types they name. Undefined until resolved, or when a name names no type. */
  targets: Type[] | undefined
  /** The `x-ref` sits on the property's `items`, so each item is a reference. */
  items: boolean
  form: RefForm
}

interface Type {
  name: string
  /** The corpus that holds the type. */
  corpus: Corpus
  dir: string
  schemaFile: string
  /** The schema as written, or undefined when it does not parse. */
  schema: Data | undefined
  validate: ValidateFunction | undefined
  idPattern: RegExp | undefined
  /** The schema's `x-extends`, as written, and the type it names. */
  extendsName: string | undefined
  base: Type | undefined
  refs: Ref[]
  /** Valid records by id. */
  records: Map<string, { file: string; data: Data }>
  /**
   * Every record file by folded id, for references by id. The first file wins when ids collide. A
   * record whose id or data has errors is here too, so a reference to it adds no second error.
   */
  ids: Map<string, string>
  /** Every record file by its folded file stem, or folder name, where that is not its id. */
  stems: Map<string, string>
  /** The schema's `x-record-file`, as written, when it is a valid file name. */
  recordFile: string | undefined
}

export interface Corpus {
  root: string
  /** The corpus folder's real path, which identifies it among the corpora one validation loads. */
  real: string
  /** The package the corpus is (rootPackage), or null for a corpus with a local identity only. */
  package: PackageId | null
  /**
   * The corpus's identity, its unversioned package URL, or undefined for a local corpus. A
   * type's identity adds `#<type>`, and a record's `#<type>/<id>`.
   */
  identity: string | undefined
  name: string
  id: string | undefined
  level: 1 | 2 | undefined
  files: Set<string>
  /** Files and folders by their NFC form, for relative links. */
  filesByNfc: Map<string, string>
  dirsByNfc: Set<string>
  nested: string[]
  /**
   * The corpus's files and those of the corpora it references, as paths under `_references/`,
   * and the files of the corpora nested in it, for looking up bare-name wikilinks.
   */
  wikilinks: WikilinkIndex
  nestedWikilinks: WikilinkIndex
  types: Map<string, Type>
  /** The type of each record file. */
  recordType: Map<string, Type>
  /** Every schema file, a rejected type's included. Only their prose keywords hold links. */
  schemaFiles: Set<string>
  /** Files whose links are checked: the root file, schema files and records, with their data. */
  checked: Map<string, { text: string; data: Data | undefined }>
  /** The prefixes `extends` and `references` declare. */
  declared: Set<string>
  /** The corpora that loaded, by prefix: `extends` gives types, `references` records too. */
  parents: Map<string, Corpus>
  references: Map<string, Corpus>
  /** The files under `_references/`, relative to it. */
  referenceFiles: string[]
  /** The prefixes a checked file links into, through `_references/<prefix>/`. */
  linked: Set<string>
  /**
   * Errors that stop `sync`: in the root file, or a corpus it names that does not resolve or has
   * errors.
   */
  fatal: string[]
  errors: string[]
  warnings: string[]
}

/** The corpora loaded while validating one corpus, by real path, and the chain being loaded. */
export interface Loader {
  done: Map<string, Corpus>
  stack: Corpus[]
}

/** What `validateCorpus` found in one corpus. */
export interface CorpusReport {
  /** The corpus folder, as passed to `validateCorpus`. */
  root: string
  /** The corpus's name: the `<name>` of its root file, or its folder name when it has none. */
  name: string
  /**
   * The corpus's identity: the unversioned package URL of the package whose package.json names
   * the corpus folder, such as `pkg:npm/%40osdlc/corpus-profile-claims`. Undefined for a corpus
   * in no package. A record's identity is `<identity>#<type>/<id>` (npmPackageUrl builds it).
   */
  identity: string | undefined
  /** The package's version, or undefined when it states none or the corpus is in no package. */
  version: string | undefined
  /** The root file's `id`, or undefined when it has none or it is not a non-empty string. */
  id: string | undefined
  /** The root file's `level`, or undefined when it states none or it is not 1 or 2. */
  level: 1 | 2 | undefined
  /** Valid records by type, then id. A type with no valid records maps to an empty map. */
  records: Map<string, Map<string, Data>>
  /** The corpus-relative path of each valid record, by type, then id. */
  files: Map<string, Map<string, string>>
  /**
   * One line per error, as `<file>: <field>: <message>`, the file relative to the corpus root.
   * The corpus is valid when this is empty.
   */
  errors: string[]
  /** One line per warning, in the same form as `errors`. Warnings do not make a corpus invalid. */
  warnings: string[]
  /** The corpus-relative paths of the files `fix` rewrote. Empty without `fix`. */
  fixed: string[]
}

/**
 * Every corpus root at or below `dir`, nested ones included: each folder that holds a root file.
 * Each path is `dir` joined with the folder's path below it. Dot folders, `node_modules`,
 * symlinks and a corpus's `_references/` copies are not searched.
 *
 * A folder that cannot be read inside a corpus already found is skipped, since `validateCorpus`
 * reports it as an error of that corpus.
 *
 * @throws Error when `dir`, or a folder below it that is in no corpus found, cannot be read. The
 *   message is one line: `<folder>: cannot read folder (<code>)`.
 */
export function findCorpora(dir: string): string[] {
  const found: string[] = []
  const visit = (path: string, inCorpus: boolean): void => {
    let names: Dirent[]
    try {
      names = entries(path)
    } catch (e) {
      if (inCorpus) return
      throw new Error(`${path}: cannot read folder (${whyFailed(e)})`, { cause: e })
    }
    const isRoot = hasRootFile(names)
    if (isRoot) found.push(path)
    for (const d of names)
      if (d.isDirectory() && !skipped(d.name) && !(isRoot && d.name === REFERENCES))
        visit(join(path, d.name), inCorpus || isRoot)
  }
  visit(dir, false)
  return found
}

/**
 * The corpus's files and folders, relative and with `/`, stopping at nested corpora, and the files
 * of those nested corpora. Symlinks are not followed: the corpus's own are listed in `symlinks`.
 * `_references/` at the root is left out. A folder that cannot be read is an error in `problems`.
 */
function walk(root: string): {
  files: string[]
  dirs: string[]
  nested: string[]
  nestedFiles: string[]
  symlinks: string[]
  problems: string[]
} {
  const files: string[] = []
  const dirs: string[] = []
  const nested: string[] = []
  const nestedFiles: string[] = []
  const symlinks: string[] = []
  const problems: string[] = []
  // A folder inside a nested corpus is that corpus's problem, not this one's.
  const read = (rel: string, inNested = false): Dirent[] => {
    try {
      return entries(join(root, rel))
    } catch (e) {
      if (!inNested)
        problems.push(`${rel === '' ? '.' : rel}: (folder): cannot read (${whyFailed(e)})`)
      return []
    }
  }
  const visit = (rel: string, names: Dirent[], inNested: boolean): void => {
    for (const d of names) {
      if (skipped(d.name) || (rel === '' && d.name === REFERENCES)) continue
      const path = rel === '' ? d.name : `${rel}/${d.name}`
      if (d.isSymbolicLink() && !inNested) symlinks.push(path)
      if (d.isFile()) (inNested ? nestedFiles : files).push(path)
      if (!d.isDirectory()) continue
      const sub = read(path, inNested)
      const startsNested = !inNested && hasRootFile(sub)
      if (startsNested) nested.push(path)
      else if (!inNested) dirs.push(path)
      visit(path, sub, inNested || startsNested)
    }
  }
  visit('', read(''), false)
  return {
    files: files.sort(),
    dirs: dirs.sort(),
    nested,
    nestedFiles: nestedFiles.sort(),
    symlinks: symlinks.sort(),
    problems,
  }
}

/** YAML parsed with any error on one line, its position counted in `whole` from `offset`. */
function parseYamlAt(yaml: string, whole: string, offset: number): unknown {
  try {
    return parseYaml(yaml, { prettyErrors: false })
  } catch (e) {
    if (!(e instanceof YAMLParseError)) throw e
    const at = offset + e.pos[0]
    const before = whole.slice(0, at)
    const line = before.split('\n').length
    const column = at - before.lastIndexOf('\n')
    throw new Error(`${oneLine(e.message)} at line ${line}, column ${column}`, { cause: e })
  }
}

/**
 * A file's data: the frontmatter of a `.md` file, else the whole file. Empty data is `{}`. Throws
 * on a parse error, with the line and column in the file, or when the data is not a mapping.
 */
export function readData(text: string, ext: string): Data {
  let data: unknown
  if (ext === '.md') {
    const { yaml, yamlRange } = split(text)
    data = yaml === null ? {} : parseYamlAt(yaml, text, yamlRange.start)
  } else if (ext === '.json') data = text.trim() === '' ? {} : JSON.parse(text)
  else data = parseYamlAt(text, text, 0)
  data ??= {}
  if (typeof data !== 'object' || Array.isArray(data))
    throw new Error('must be a mapping, not a scalar or list')
  return data as Data
}

const BAD_ID_CHAR = /[/\\:*?"<>|[\]#^\p{Cc}]/u

/**
 * Why `id` breaks the spec's id rules, or undefined when it follows them. The reason reads after
 * the id, as in `"a/b" holds "/"`. A type's `x-id-pattern` is not checked here.
 */
export function idProblem(id: string): string | undefined {
  if (id === '') return 'is empty'
  const bad = BAD_ID_CHAR.exec(id)?.[0]
  if (bad !== undefined) return `holds ${JSON.stringify(bad)}`
  if (/^[ .]|[ .]$/.test(id)) return 'starts or ends with a space or a dot'
  return undefined
}

/** Render one ajv error as `field: message`. */
function describe(e: ErrorObject): string {
  const path = e.instancePath.split('/').slice(1).join('.')
  const dotted = path === '' ? '' : `${path}.`
  if (e.keyword === 'additionalProperties')
    return `${dotted}${String(e.params.additionalProperty)}: unknown field`
  if (e.keyword === 'required') return `${dotted}${String(e.params.missingProperty)}: required`
  if (e.schemaPath.endsWith('/false schema'))
    return `${path}: not allowed here (see the if/then rule in the schema)`
  return `${path === '' ? '(data)' : path}: ${e.message ?? 'invalid'}`
}

/** Paths to every object in a schema that holds `keyword`. */
function places(keyword: string, node: unknown, path: string[] = []): string[][] {
  if (node === null || typeof node !== 'object') return []
  const here = !Array.isArray(node) && keyword in node ? [path] : []
  return [...here, ...Object.entries(node).flatMap(([k, v]) => places(keyword, v, [...path, k]))]
}

const stem = (file: string): string => basename(file, extname(file))

/** A file name with no path, such as README.md. */
const RECORD_FILE = /^[^/\\]+\.[a-z]+$/

/** The `x-record-file` of `type`, or of the nearest type up its chain that has one. */
const recordFileOf = (type: Type): string | undefined =>
  chain(type).find((t) => t.recordFile !== undefined)?.recordFile

/** Whether `path`, in the type folder `dir`, sits in a narrative folder: one whose name starts `_`. */
const inNarrative = (dir: string, path: string): boolean =>
  path
    .slice(dir.length + 1)
    .split('/')
    .slice(0, -1)
    .some((part) => part.startsWith('_'))

/**
 * A record's id, from `name`, its file stem or record-folder name. With no `x-id-pattern` up the
 * chain it is `name`. Otherwise it is the longest of `name` and the parts of `name` that end just
 * before a `-` that every pattern matches, so `P-0002-be-kind` with `^P-[0-9]{4}$` has the id
 * `P-0002`. Undefined when none matches.
 */
function idOf(types: Type[], name: string): string | undefined {
  const patterns = types.flatMap((t) => (t.idPattern === undefined ? [] : [t.idPattern]))
  if (patterns.length === 0) return name
  const ends = [name.length, ...[...name.matchAll(/-/g)].map((m) => m.index).reverse()]
  for (const end of ends) {
    const id = name.slice(0, end)
    if (id !== '' && patterns.every((p) => p.test(id))) return id
  }
  return undefined
}

const realOrSame = (path: string): string => {
  try {
    return realpathSync(path)
  } catch {
    return resolvePath(path)
  }
}

/**
 * Whether `a` and `b` are one corpus: the same folder, or two folders of one package, which hold
 * the same files, since a graph holds one version of each corpus.
 */
const sameCorpus = (a: Corpus, b: Corpus): boolean =>
  a === b || (a.identity !== undefined && a.identity === b.identity)

/** Whether `a` and `b` are one type: one name in one corpus, by identity. */
const sameType = (a: Type, b: Type): boolean => a.name === b.name && sameCorpus(a.corpus, b.corpus)

/** `type`, then each type it extends, nearest first. */
function chain(type: Type): Type[] {
  const out: Type[] = []
  for (let t: Type | undefined = type; t !== undefined && !out.includes(t); t = t.base) out.push(t)
  return out
}

/**
 * Read the root file, the corpora it names, the types and their records, checking everything but
 * links. Each corpus named in `extends` or `references` is loaded and checked in full, once per
 * `loader`.
 */
export function load(root: string, loader: Loader = { done: new Map(), stack: [] }): Corpus {
  const pkg = rootPackage(root)
  const { files, dirs, nested, nestedFiles, symlinks, problems } = walk(root)
  const c: Corpus = {
    root,
    real: realOrSame(root),
    package: pkg,
    identity: pkg === null ? undefined : npmPackageUrl(pkg.name),
    name: basename(resolvePath(root)),
    id: undefined,
    level: undefined,
    files: new Set(files),
    filesByNfc: new Map(files.map((f) => [f.normalize('NFC'), f])),
    dirsByNfc: new Set(dirs.map((d) => d.normalize('NFC'))),
    nested,
    wikilinks: wikilinkIndex(files),
    nestedWikilinks: wikilinkIndex(nestedFiles),
    types: new Map(),
    recordType: new Map(),
    checked: new Map(),
    schemaFiles: new Set(),
    declared: new Set(),
    parents: new Map(),
    references: new Map(),
    referenceFiles: listFiles(join(root, REFERENCES)),
    linked: new Set(),
    fatal: [],
    errors: problems,
    warnings: [],
  }
  const walked = c.errors.length
  const top = readRoot(c)
  if (top === undefined) {
    c.fatal.push(...c.errors.slice(walked))
    return c
  }
  loader.stack.push(c)
  readSources(c, top.file, top.data, 'extends', loader)
  readSources(c, top.file, top.data, 'references', loader)
  loader.stack.pop()
  checkVersions(c, top.file)
  const refFiles = [...c.references].flatMap(([prefix, r]) =>
    [...r.files].map((f) => `${REFERENCES}/${prefix}/${f}`),
  )
  if (refFiles.length > 0) c.wikilinks = wikilinkIndex([...files, ...refFiles])
  const used = readUses(c, top.file, top.data)
  // Every root-file error stops sync, as does a named corpus that does not resolve or has errors.
  c.fatal.push(...c.errors.slice(walked))
  const schemaFiles = readTypes(c, dirs, used)
  c.schemaFiles = schemaFiles
  for (const link of symlinks)
    if ([...c.types.values()].some((t) => link.startsWith(`${t.dir}/`)))
      c.warnings.push(`${link}: (symlink): not followed, so not checked`)
  readRecords(c, files, dirs, top.extensions, schemaFiles)
  return c
}

/**
 * Read `file`'s data and keep its text for the link checks. Reports a file it cannot read or
 * parse, and returns undefined.
 */
function readChecked(c: Corpus, file: string): Data | undefined {
  let text: string
  try {
    text = readFileSync(join(c.root, file), 'utf8')
  } catch (e) {
    c.errors.push(`${file}: (file): cannot read (${whyFailed(e)})`)
    return undefined
  }
  let data: Data | undefined
  try {
    data = readData(text, extname(file))
  } catch (e) {
    c.errors.push(`${file}: (data): ${oneLine((e as Error).message)}`)
  }
  c.checked.set(file, { text, data })
  return data
}

/**
 * Check the root file. Returns it, its data and the record extensions it allows, or undefined to
 * stop.
 */
function readRoot(c: Corpus): { file: string; data: Data; extensions: string[] } | undefined {
  // `files` is sorted, so the first root file is the same on every run.
  const rootFiles = [...c.files].filter((f) => !f.includes('/') && rootName(f) !== undefined)
  const rootFile = rootFiles[0]
  if (rootFile === undefined) {
    c.errors.push(`.: (folder): no root file, <name>${ROOT_SUFFIXES.join(', ')}`)
    return undefined
  }
  for (const f of rootFiles.slice(1))
    c.errors.push(`${f}: (file): a folder holds one root file, and ${rootFile} is one`)
  c.name = rootName(rootFile) as string
  if (!CORPUS_NAME.test(c.name))
    c.errors.push(
      `${rootFile}: (file): the corpus name "${c.name}" holds only lowercase letters, digits and -`,
    )
  const data = readChecked(c, rootFile)
  if (data === undefined) return undefined
  if (data['corpus-schema'] !== 0) {
    c.errors.push(`${rootFile}: corpus-schema: must be 0, the only version this validator supports`)
    return undefined
  }
  const id = data['id']
  if (id !== undefined && (typeof id !== 'string' || id.trim() === ''))
    c.errors.push(`${rootFile}: id: must be a non-empty string`)
  else c.id = id
  const level = data['level']
  if (level === 1 || level === 2) c.level = level
  else if (level !== undefined) c.errors.push(`${rootFile}: level: must be 1 or 2`)
  for (const key of Object.keys(data))
    if (RESERVED_KEYS.has(key))
      c.warnings.push(`${rootFile}: ${key}: reserved for a later version; not checked yet`)
    else if (!ROOT_KEYS.has(key)) c.warnings.push(`${rootFile}: ${key}: not a corpus-schema v0 key`)

  const formats = data['formats'] ?? ['md']
  const list: unknown[] = Array.isArray(formats) ? formats : []
  if (
    list.length === 0 ||
    list.some((f) => !Object.hasOwn(FORMATS, String(f))) ||
    new Set(list).size < list.length
  ) {
    c.errors.push(`${rootFile}: formats: must list one or more of md, yaml, json, once each`)
    return { file: rootFile, data, extensions: ['.md'] }
  }
  return { file: rootFile, data, extensions: list.map((f) => FORMATS[String(f)] as string) }
}

/**
 * Resolve and load each corpus the root file names under `key`: the parents `extends` gives types
 * from, or the corpora `references` reads. One that does not resolve, closes a cycle or has errors
 * of its own is an error here.
 */
function readSources(
  c: Corpus,
  rootFile: string,
  data: Data,
  key: 'extends' | 'references',
  loader: Loader,
): void {
  const map = data[key]
  if (map === undefined) return
  if (map === null || typeof map !== 'object' || Array.isArray(map)) {
    c.errors.push(`${rootFile}: ${key}: must map each prefix to a package name or a ./ or ../ path`)
    return
  }
  if (key === 'extends' && c.level !== 2) {
    c.errors.push(`${rootFile}: extends: needs level: 2 in the root file`)
    // Declared, so a type that names one of them adds no second error.
    for (const prefix of Object.keys(map)) c.declared.add(prefix)
    return
  }
  const into = key === 'extends' ? c.parents : c.references
  for (const [prefix, source] of Object.entries(map)) {
    const at = `${rootFile}: ${key}.${prefix}`
    if (!PREFIX.test(prefix)) {
      c.errors.push(`${at}: a prefix holds only lowercase letters, digits and -`)
      continue
    }
    if (c.declared.has(prefix)) {
      c.errors.push(`${at}: ${prefix} is in extends too; a prefix sits in one key`)
      continue
    }
    c.declared.add(prefix)
    if (typeof source !== 'string') {
      c.errors.push(`${at}: must be a package name or a ./ or ../ path`)
      continue
    }
    const r = resolveSource(c.root, source)
    if ('problem' in r) {
      c.errors.push(`${at}: ${r.problem}`)
      continue
    }
    const onStack = loader.stack.findIndex((s) => s.real === r.dir)
    if (onStack >= 0) {
      const names = [...loader.stack.slice(onStack).map((s) => s.name), loader.stack[onStack]?.name]
      c.errors.push(`${at}: ${source} closes a cycle: ${names.join(' → ')}`)
      continue
    }
    let named = loader.done.get(r.dir)
    if (named === undefined) {
      named = load(r.dir, loader)
      check(named)
      loader.done.set(r.dir, named)
    }
    into.set(prefix, named)
    // `sync` does not copy a corpus with errors. In a cycle, each copy would hold the last one.
    const first = named.errors[0]
    if (first !== undefined)
      c.errors.push(`${at}: ${source} has ${named.errors.length} error(s); the first: ${first}`)
  }
}

/** A type `uses` names, under the local name it gives the type's folder. */
interface Used {
  type: Type
  /** The entry that names it, as written: `<prefix>/<type>` or `<prefix>/*`. */
  entry: string
}

/**
 * The parent types the root file's `uses` names, by the folder name each one gives: `<type>` for
 * `<prefix>/<type>`, and every type of the parent for `<prefix>/*`. Two types under one name is an
 * error, and the name is left out.
 */
function readUses(c: Corpus, rootFile: string, data: Data): Map<string, Used> {
  const used = new Map<string, Used>()
  const value = data['uses']
  if (value === undefined) return used
  if (c.level !== 2) {
    c.errors.push(`${rootFile}: uses: needs level: 2 in the root file`)
    return used
  }
  const entries = typeof value === 'string' ? [value] : value
  if (!Array.isArray(entries) || entries.some((e) => typeof e !== 'string')) {
    c.errors.push(`${rootFile}: uses: must be <prefix>/<type>, <prefix>/*, or a list of them`)
    return used
  }
  const clashes = new Set<string>()
  for (const entry of entries as string[]) {
    const at = `${rootFile}: uses`
    const slash = entry.indexOf('/')
    if (slash < 0) {
      c.errors.push(`${at}: "${entry}" names no parent; write <prefix>/<type> or <prefix>/*`)
      continue
    }
    const prefix = entry.slice(0, slash)
    const rest = entry.slice(slash + 1)
    const found: Type[] = []
    if (rest === '*') {
      const parent = parentFor(c, prefix)
      if (typeof parent === 'string') c.errors.push(`${at}: "${entry}" ${parent}`)
      else if (parent !== undefined) found.push(...parent.types.values())
    } else {
      const type = lookupType(c, entry, true)
      if (type !== undefined && 'problem' in type)
        c.errors.push(`${at}: "${entry}" ${type.problem}`)
      else if (type !== undefined) found.push(type)
    }
    for (const type of found) {
      const other = used.get(type.name)
      if (other === undefined) used.set(type.name, { type, entry })
      else if (!sameType(other.type, type) && !clashes.has(type.name)) {
        clashes.add(type.name)
        c.errors.push(
          `${at}: "${type.name}" is both ${other.entry} and ${entry}; build the folder's type with x-extends`,
        )
      }
    }
  }
  for (const name of clashes) used.delete(name)
  return used
}

/** The parent `extends` names under `prefix`, a problem, or undefined for one that did not load. */
function parentFor(c: Corpus, prefix: string): Corpus | string | undefined {
  const parent = c.parents.get(prefix)
  if (parent !== undefined) return parent
  if (c.references.has(prefix))
    return `names "${prefix}", which is in references; references give no types to build on or use, so name the corpus in extends`
  // A declared parent that did not load is already an error at its extends entry.
  return c.declared.has(prefix)
    ? undefined
    : `names unknown prefix "${prefix}"; neither extends nor references declares it`
}

/**
 * The type `name` names from corpus `c`. A name without `/` is a local type. `<prefix>/<type>`
 * names a type of a corpus in `extends` or, unless `build`, in `references`. A longer path, such
 * as `b/c/principles`, follows `references` from corpus to corpus, for reading only. `build` is
 * for `x-extends` and `uses`, which take types only from `extends`.
 */
function lookupType(
  c: Corpus,
  name: string,
  build = false,
): Type | { problem: string } | undefined {
  const parts = name.split('/')
  const typeName = parts.pop() as string
  if (parts.length === 0) return c.types.get(name) ?? { problem: `names unknown type "${name}"` }
  const [first, ...rest] = parts as [string, ...string[]]
  if (build && rest.length > 0)
    return {
      problem: `names "${name}", a type through references; x-extends and uses take a type of a corpus in extends`,
    }
  let from: Corpus | string | undefined = build
    ? parentFor(c, first)
    : (c.references.get(first) ?? parentFor(c, first))
  for (const [i, prefix] of rest.entries()) {
    if (typeof from !== 'object') break
    const next: Corpus | undefined = from.references.get(prefix)
    const path = parts.slice(0, i + 1).join('/')
    // A corpus that did not load is already an error of its own.
    if (next === undefined)
      return from.declared.has(prefix) && !from.parents.has(prefix)
        ? undefined
        : { problem: `names "${name}", but ${path} references no corpus as ${prefix}` }
    from = next
  }
  if (from === undefined) return undefined
  if (typeof from === 'string') return { problem: from }
  const type = from.types.get(typeName)
  return type ?? { problem: `names "${name}", but ${parts.join('/')} has no such type` }
}

/**
 * Find the types: folders at the corpus root holding `<their name>.schema.{md,yaml,json}`, and
 * folders at the corpus root with no schema file named after a type `uses` names. Returns every
 * schema file, those below the root included.
 */
function readTypes(c: Corpus, dirs: string[], used: Map<string, Used>): Set<string> {
  // strictSchema only: a misspelled keyword is an error. The other strict options reject valid
  // JSON Schema 2020-12, such as `properties` without `type: object`. addUsedSchema off keeps each
  // type's schema apart: two may share a `$id`, and one cannot `$ref` another.
  const ajv = new Ajv2020({
    allErrors: true,
    addUsedSchema: false,
    strictSchema: true,
    strictTypes: false,
    strictTuples: false,
    strictRequired: false,
  })
  addFormats(ajv)
  for (const keyword of ['x-id-pattern', 'x-extends', 'x-identity', 'x-record-file'])
    ajv.addKeyword({ keyword, schemaType: 'string' })
  // readTypes checks these values itself, for clearer messages.
  for (const keyword of ['x-ref', 'x-ref-form']) ajv.addKeyword({ keyword })
  const schemaFiles = new Set<string>()
  const typeDirs = new Map<string, string>()
  const holdsRecords = new Set(
    [...c.files].filter((f) => RECORD_EXTENSIONS.includes(extname(f))).map((f) => posix.dirname(f)),
  )
  for (const dir of dirs) {
    const name = basename(dir)
    const found = RECORD_EXTENSIONS.map((ext) => `${dir}/${name}.schema${ext}`).filter((f) =>
      c.files.has(f),
    )
    const schemaFile = found[0]
    // Type folders, and the folders `uses` gives a type, sit at the corpus root only.
    const atRoot = !dir.includes('/')
    const use = atRoot ? used.get(name) : undefined
    if (schemaFile === undefined) {
      if (use !== undefined) useType(c, dir, use, typeDirs)
      else if (atRoot && holdsRecords.has(dir)) warnLikeParentType(c, dir)
      continue
    }
    if (use !== undefined)
      c.errors.push(
        `${schemaFile}: (schema): uses names ${use.entry}, so the folder holds no schema; to add fields, take ${name} out of uses and write x-extends here`,
      )
    for (const f of found) schemaFiles.add(f)
    for (const f of found.slice(1))
      c.errors.push(`${f}: (file): a type holds one schema file, and ${schemaFile} is one`)
    // A rejected type's schema is still read, so its links are checked.
    if (!atRoot) {
      c.errors.push(`${dir}: (folder): a type folder sits at the corpus root only`)
      readChecked(c, schemaFile)
      continue
    }
    const clash = typeDirs.get(fold(name))
    if (clash !== undefined) {
      c.errors.push(`${dir}: (folder): type name is also used by ${clash}`)
      readChecked(c, schemaFile)
      continue
    }
    typeDirs.set(fold(name), dir)
    const nameProblem = idProblem(name)
    if (nameProblem !== undefined) c.errors.push(`${dir}: (folder): type name ${nameProblem}`)

    const type: Type = {
      name,
      corpus: c,
      dir,
      schemaFile,
      schema: undefined,
      validate: undefined,
      idPattern: undefined,
      extendsName: undefined,
      base: undefined,
      refs: [],
      records: new Map(),
      ids: new Map(),
      stems: new Map(),
      recordFile: undefined,
    }
    c.types.set(name, type)
    const schema = readChecked(c, schemaFile)
    if (schema === undefined) continue
    type.schema = schema
    if (c.level === 2 && Object.keys(schema).length === 0)
      c.errors.push(`${schemaFile}: (schema): empty, but a level 2 corpus gives each type a schema`)
    const pattern = schema['x-id-pattern']
    if (typeof pattern === 'string')
      try {
        type.idPattern = new RegExp(pattern, 'u')
      } catch (e) {
        c.errors.push(`${schemaFile}: x-id-pattern: ${oneLine((e as Error).message)}`)
      }
    for (const place of places('x-extends', schema))
      if (place.length > 0)
        c.errors.push(`${schemaFile}: ${place.join('.')}: x-extends sits only at the schema root`)
    if (typeof schema['x-extends'] === 'string') type.extendsName = schema['x-extends']
    for (const place of places('x-identity', schema))
      if (place.length > 0)
        c.errors.push(`${schemaFile}: ${place.join('.')}: x-identity sits only at the schema root`)
    checkIdentity(c, schemaFile, name, schema['x-identity'])
    for (const place of places('x-record-file', schema))
      if (place.length > 0)
        c.errors.push(
          `${schemaFile}: ${place.join('.')}: x-record-file sits only at the schema root`,
        )
    const recordFile = schema['x-record-file']
    if (typeof recordFile === 'string')
      if (RECORD_FILE.test(recordFile) && RECORD_EXTENSIONS.includes(extname(recordFile)))
        type.recordFile = recordFile
      else
        c.errors.push(
          `${schemaFile}: x-record-file: must be a file name with a .md, .yaml or .json extension, such as README.md`,
        )
    for (const place of places('x-ref', schema)) {
      const [first, field, third] = place
      const items = third === 'items'
      if (first !== 'properties' || field === undefined || place.length !== (items ? 3 : 2)) {
        c.errors.push(
          `${schemaFile}: ${place.join('.')}: v0 defines x-ref only on top-level properties and their items`,
        )
        continue
      }
      const prop = (schema['properties'] as Record<string, Data>)[field] as Data
      const holder = (items ? prop['items'] : prop) as Data
      const named = holder['x-ref']
      const types = typeof named === 'string' ? [named] : named
      if (!Array.isArray(types) || types.length === 0 || types.some((t) => typeof t !== 'string')) {
        c.errors.push(`${schemaFile}: ${field}: x-ref must name a type or list one or more types`)
        continue
      }
      const form = holder['x-ref-form'] ?? 'link'
      if (typeof form !== 'string' || !REF_FORMS.includes(form)) {
        c.errors.push(`${schemaFile}: ${field}: x-ref-form must be link, id or wikilink`)
        continue
      }
      type.refs.push({ field, corpus: c, types, targets: undefined, items, form: form as RefForm })
    }
    for (const place of places('x-ref-form', schema)) {
      const holder = place.reduce<unknown>((n, k) => (n as Data)[k], schema) as Data
      if (!('x-ref' in holder))
        c.errors.push(
          `${schemaFile}: ${place.join('.') || '(schema)'}: x-ref-form sits only beside x-ref`,
        )
    }
  }
  linkTypes(c)
  for (const type of c.types.values()) {
    // A type `uses` gives has no schema of its own: the parent's checks its records.
    if (type.schema === undefined) continue
    closedAbove(type)
    try {
      type.validate = ajv.compile(flattened(type))
    } catch (e) {
      c.errors.push(`${type.schemaFile}: (schema): ${oneLine((e as Error).message)}`)
    }
  }
  for (const n of c.nested) {
    const inType = [...c.types.values()].find((t) => n.startsWith(`${t.dir}/`))
    if (inType !== undefined)
      c.errors.push(`${n}: (folder): a corpus must not sit inside type folder ${inType.dir}`)
  }
  return schemaFiles
}

/**
 * Check a schema's `x-identity`, which must be the type's identity: the corpus's unversioned
 * package URL and `#<type>`. A local corpus has no identity to match, so its `x-identity` is not
 * checked.
 */
function checkIdentity(c: Corpus, schemaFile: string, name: string, value: unknown): void {
  if (typeof value !== 'string') return
  if (c.package === null) {
    c.warnings.push(`${schemaFile}: x-identity: not checked, since the corpus is in no package`)
    return
  }
  const want = npmPackageUrl(c.package.name, undefined, [name])
  if (value !== want)
    c.errors.push(`${schemaFile}: x-identity: must be ${want}, the type's identity`)
}

/** Make `dir` a type that uses a parent's type as it is, as `uses` names it. */
function useType(c: Corpus, dir: string, use: Used, typeDirs: Map<string, string>): void {
  const name = basename(dir)
  const clash = typeDirs.get(fold(name))
  if (clash !== undefined) {
    c.errors.push(`${dir}: (folder): type name is also used by ${clash}`)
    return
  }
  typeDirs.set(fold(name), dir)
  c.types.set(name, {
    name,
    corpus: c,
    dir,
    schemaFile: dir,
    schema: undefined,
    validate: undefined,
    idPattern: undefined,
    extendsName: undefined,
    base: use.type,
    refs: [],
    records: new Map(),
    ids: new Map(),
    stems: new Map(),
    recordFile: undefined,
  })
}

/** The edit distance between `a` and `b`, after folding. */
function distance(a: string, b: string): number {
  const [x, y] = [fold(a), fold(b)]
  let row = Array.from({ length: y.length + 1 }, (_, j) => j)
  for (let i = 1; i <= x.length; i++) {
    const next = [i]
    for (let j = 1; j <= y.length; j++)
      next[j] = Math.min(
        (row[j] as number) + 1,
        (next[j - 1] as number) + 1,
        (row[j - 1] as number) + (x[i - 1] === y[j - 1] ? 0 : 1),
      )
    row = next
  }
  return row[y.length] as number
}

/**
 * Warn when a folder at the corpus root, holding record files and no schema file, is named like a
 * parent's type that `uses` does not give it: the same name, or one or two letters off. Its files
 * are narrative.
 */
function warnLikeParentType(c: Corpus, dir: string): void {
  const name = basename(dir)
  const near = (other: string): boolean => {
    const d = distance(name, other)
    return d === 0 || (d === 1 && name.length >= 4) || (d === 2 && name.length >= 8)
  }
  for (const [prefix, parent] of c.parents)
    for (const type of parent.types.values())
      if (near(type.name)) {
        c.warnings.push(
          `${dir}: (folder): named like ${prefix}/${type.name}, but has no schema file and is not in uses, so its files are not records`,
        )
        return
      }
}

/** Resolve each type's `x-extends` and `x-ref` names, and break `x-extends` cycles. */
function linkTypes(c: Corpus): void {
  for (const type of c.types.values()) {
    if (type.extendsName !== undefined) {
      const base = lookupType(c, type.extendsName, true)
      if (base !== undefined && 'problem' in base)
        c.errors.push(`${type.schemaFile}: x-extends: ${base.problem}`)
      else type.base = base
    }
    for (const ref of type.refs) {
      const targets: Type[] = []
      for (const name of ref.types) {
        const target = lookupType(c, name)
        if (target !== undefined && 'problem' in target)
          c.errors.push(`${type.schemaFile}: ${ref.field}: x-ref ${target.problem}`)
        else if (target !== undefined) targets.push(target)
      }
      // A name that names no type is an error above, so the field's values are not checked.
      if (targets.length === ref.types.length) ref.targets = targets
    }
  }
  // Only local types can form a cycle: a parent never extends its child.
  const cyclic = [...c.types.values()].filter(
    (t) => t.base !== undefined && chain(t.base).includes(t),
  )
  for (const type of cyclic) {
    const names = [...chain(type), type].map((t) => t.name)
    c.errors.push(`${type.schemaFile}: x-extends: cycle: ${names.join(' → ')}`)
  }
  for (const type of cyclic) type.base = undefined
}

const asMap = (v: unknown): Data =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Data) : {}

/** The top-level field names and field patterns `type` and every type up its chain declare. */
function mergedFields(type: Type): { names: Set<string>; patterns: Set<string> } {
  const names = new Set<string>()
  const patterns = new Set<string>()
  for (const t of chain(type)) {
    for (const k of Object.keys(asMap(t.schema?.['properties']))) names.add(k)
    for (const k of Object.keys(asMap(t.schema?.['patternProperties']))) patterns.add(k)
  }
  return { names, patterns }
}

/**
 * `type`'s schema, flattened: its top-level `properties` and `patternProperties` also hold each
 * one a type up its chain declares, as `true`, unless it declares that one itself. So a closing
 * `additionalProperties` or `unevaluatedProperties` at its root admits the inherited fields. Their
 * rules come from the schemas of the types that declare them, which a record also passes.
 */
function flattened(type: Type): Data {
  const schema = type.schema ?? {}
  if (type.base === undefined) return schema
  const flat: Data = { ...schema }
  for (const key of ['properties', 'patternProperties']) {
    const own = schema[key]
    // A value that is not a mapping is left for Ajv to reject.
    if (own !== undefined && own !== asMap(own)) continue
    const merged: Data = {}
    for (const t of chain(type).slice(1).reverse())
      for (const k of Object.keys(asMap(t.schema?.[key]))) merged[k] = true
    if (Object.keys(merged).length > 0) flat[key] = { ...merged, ...asMap(own) }
  }
  return flat
}

/**
 * Whether a schema closes its root to the fields its root `properties` and `patternProperties`
 * declare. `unevaluatedProperties: false` also admits fields evaluated in `allOf` or a `$ref`,
 * so it is not counted.
 */
const closes = (schema: Data | undefined): boolean => schema?.['additionalProperties'] === false

/**
 * How corpus `from` names `type`: its name, `<prefix>/<name>` for a type of a corpus it extends or
 * references, or the chain of prefixes through references, such as `b/c/<name>`.
 */
function typeLabel(type: Type, from: Corpus): string {
  if (sameCorpus(type.corpus, from)) return type.name
  const prefix = [...from.parents].find(([, p]) => sameCorpus(p, type.corpus))?.[0]
  if (prefix !== undefined) return `${prefix}/${type.name}`
  // Through references, by the shortest chain.
  const seen = new Set<Corpus>([from])
  const queue: [Corpus, string[]][] = [[from, []]]
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    const [k, path] = next
    for (const [p, ref] of k.references) {
      if (sameCorpus(ref, type.corpus)) return [...path, p, type.name].join('/')
      if (!seen.has(ref)) {
        seen.add(ref)
        queue.push([ref, [...path, p]])
      }
    }
  }
  return `${type.corpus.name}/${type.name}`
}

/**
 * Report each field `type` declares that a type up its chain closes with
 * `additionalProperties: false`: no record could hold it, since the record must also pass that
 * type's schema.
 */
function closedAbove(type: Type): void {
  // The furthest closed type admits the fewest fields.
  const closed = chain(type)
    .slice(1)
    .reverse()
    .find((t) => closes(t.schema))
  if (closed === undefined) return
  const { names, patterns } = mergedFields(closed)
  const matches = (field: string): boolean =>
    [...patterns].some((p) => {
      try {
        return new RegExp(p, 'u').test(field)
      } catch {
        return false
      }
    })
  for (const field of Object.keys(asMap(type.schema?.['properties'])))
    if (!names.has(field) && !matches(field))
      type.corpus.errors.push(
        `${type.schemaFile}: properties.${field}: ${typeLabel(closed, type.corpus)} closes its fields, so no record can hold this one`,
      )
}

/**
 * The record folders under a type folder: each folder below it that holds a record file named
 * after the folder, such as `methods/Survey/Survey.md`. A record folder inside another one is an
 * error, and its files belong to the outer record.
 */
function recordFolders(c: Corpus, type: Type, dirs: string[]): Map<string, string> {
  const found = new Map<string, string>()
  const declared = recordFileOf(type)
  for (const dir of dirs) {
    if (!dir.startsWith(`${type.dir}/`) || inNarrative(type.dir, `${dir}/x`)) continue
    const name = basename(dir)
    const files = RECORD_EXTENSIONS.map((ext) => `${dir}/${name}${ext}`)
    if (declared !== undefined && !files.includes(`${dir}/${declared}`))
      files.push(`${dir}/${declared}`)
    const held = files.filter((f) => c.files.has(f))
    const file = held[0]
    if (file === undefined) continue
    // `dirs` is sorted, so an outer folder comes before the folders inside it.
    const outer = [...found.keys()].find((f) => dir.startsWith(`${f}/`))
    if (outer !== undefined) {
      // A folder holding only the x-record-file, such as a README, is the outer record's.
      if (held.some((f) => f !== `${dir}/${declared}`))
        c.errors.push(
          `${dir}: (folder): a record folder must not sit inside record folder ${outer}`,
        )
      continue
    }
    found.set(dir, file)
    for (const f of held.slice(1))
      c.errors.push(`${f}: (file): a record folder holds one record file, and ${file} is one`)
  }
  return found
}

/**
 * Check each type's records: the .md, .yaml and .json files under its folder, at any depth. In a
 * record folder only the file named after the folder is a record. Its other files belong to it.
 * A record passes its type's schema and the schema of every type up its `x-extends` chain.
 */
function readRecords(
  c: Corpus,
  files: string[],
  dirs: string[],
  extensions: string[],
  schemaFiles: Set<string>,
): void {
  for (const type of c.types.values()) {
    const ids = type.ids
    const folders = recordFolders(c, type, dirs)
    const types = chain(type)
    const declared = recordFileOf(type)
    for (const file of files) {
      if (!file.startsWith(`${type.dir}/`) || schemaFiles.has(file)) continue
      if (inNarrative(type.dir, file)) continue
      // The type folder's own record-file name documents the type.
      if (declared !== undefined && file === `${type.dir}/${declared}`) continue
      const folder = [...folders.keys()].find((f) => file.startsWith(`${f}/`))
      if (folder !== undefined && folders.get(folder) !== file) continue
      const ext = extname(file)
      const lower = ext.toLowerCase()
      if (lower === '.yml') {
        c.errors.push(`${file}: (file): use the .yaml extension`)
        continue
      }
      if (!RECORD_EXTENSIONS.includes(lower)) continue
      if (ext !== lower) {
        c.errors.push(`${file}: (file): use the lower-case ${lower} extension`)
        continue
      }
      if (!extensions.includes(ext)) {
        c.errors.push(`${file}: format: ${ext.slice(1)} is not in the corpus's formats`)
        continue
      }
      c.recordType.set(file, type)
      const name = folder === undefined ? stem(file) : basename(folder)
      const derived = idOf(types, name)
      const id = derived ?? name
      let problem = idProblem(id)
      if (problem !== undefined) c.errors.push(`${file}: id: "${id}" ${problem}`)
      else if (derived === undefined) {
        problem = 'matches no x-id-pattern'
        for (const t of types)
          if (t.idPattern !== undefined && !t.idPattern.test(id))
            c.errors.push(`${file}: id: "${id}" does not match x-id-pattern ${t.idPattern.source}`)
      }
      const other = ids.get(fold(id))
      if (other !== undefined) c.errors.push(`${file}: id: "${id}" is also ${other}`)
      else ids.set(fold(id), file)
      if (fold(name) !== fold(id) && !type.stems.has(fold(name))) type.stems.set(fold(name), file)

      const data = readChecked(c, file)
      if (data === undefined) continue
      const stated = data['id']
      let wrongId = false
      if (
        stated !== undefined &&
        problem === undefined &&
        (typeof stated !== 'string' || fold(stated) !== fold(id))
      ) {
        wrongId = true
        c.errors.push(`${file}: id: must be the record's id, "${id}"`)
      }
      const failures = new Set<string>()
      for (const t of types)
        if (t.validate !== undefined && !t.validate(data))
          // The if/then wrapper repeats the `then` failure at the root.
          for (const e of t.validate.errors ?? [])
            if (e.keyword !== 'if') failures.add(`${file}: ${describe(e)}`)
      c.errors.push(...failures)
      if (failures.size === 0 && problem === undefined && other === undefined && !wrongId)
        type.records.set(id, { file, data })
    }
  }
}

/**
 * A file in the corpus, a problem, or undefined for a link not checked (a URL, or within the file).
 * A file under `_references/<prefix>/` sits in the referenced corpus `owner`, at `at` in it.
 * `bare` marks a wikilink that holds no path to its file, found by name: a warning, which
 * `validate --fix` rewrites. `unloaded` names a referenced corpus that did not load: its
 * `references` entry is already an error, so the link is not checked.
 */
type Resolution =
  | { file: string; owner?: Corpus; at?: string; bare?: true }
  | { problem: string; warn?: true }
  | { unloaded: string }
  | undefined

const BETWEEN_CORPORA =
  'leaves the corpus; to link to another corpus, name it in references and link into its copy'

/** Where `link`, held by `from`, points in the corpus. */
function resolve(c: Corpus, from: string, link: Link): Resolution {
  if (link.kind === 'wiki') {
    const wiki = `[[${link.target}]]`
    if (link.target.startsWith('/'))
      return { problem: `${wiki}: links in a corpus must be relative` }
    const byPath = wikiPath(c, from, link.target, wiki)
    if (byPath !== undefined) return byPath
    const r = bareName(c, link.target, wiki)
    return r !== undefined && 'file' in r ? { ...r, bare: true } : r
  }
  const dest = link.target
  if (dest === '' || /^[a-z][a-z0-9+.-]*:/i.test(dest)) return undefined
  if (dest.startsWith('/')) return { problem: `${dest}: links in a corpus must be relative` }
  let path: string
  try {
    path = decodeURIComponent(dest)
  } catch {
    return { problem: `${dest}: bad percent-encoding` }
  }
  const joined = posix.normalize(posix.join(posix.dirname(from), path)).replace(/\/$/, '')
  const outside = joined === '..' || joined.startsWith('../')
  if (outside || c.nested.some((n) => joined === n || joined.startsWith(`${n}/`)))
    return { problem: `${dest}: ${BETWEEN_CORPORA}`, warn: true }
  if (joined === REFERENCES || joined.startsWith(`${REFERENCES}/`)) return intoCopy(c, joined, dest)
  const key = joined.normalize('NFC')
  const file = c.filesByNfc.get(key)
  if (file !== undefined) return { file }
  if (key === '.' || c.dirsByNfc.has(key)) return { file: joined }
  if (joined.split('/').some(skipped))
    return {
      problem: `${dest}: leaves the corpus, which excludes dot paths and node_modules`,
      warn: true,
    }
  return { problem: `${dest}: no such file` }
}

/**
 * Where a wikilink whose target is a path relative to `from` points, as a Markdown link resolves,
 * with the same case. A record's extension may be left out. Undefined when the target is no such
 * path, so it is a bare name.
 */
function wikiPath(c: Corpus, from: string, target: string, wiki: string): Resolution {
  if (target.trim() === '') return undefined
  const joined = posix.normalize(posix.join(posix.dirname(from), target)).replace(/\/$/, '')
  const outside = joined === '..' || joined.startsWith('../')
  if (outside || c.nested.some((n) => joined === n || joined.startsWith(`${n}/`)))
    return { problem: `${wiki}: ${BETWEEN_CORPORA}`, warn: true }
  const tries = [joined, ...RECORD_EXTENSIONS.map((ext) => `${joined}${ext}`)]
  if (joined === REFERENCES || joined.startsWith(`${REFERENCES}/`)) {
    const [, prefix, ...rest] = joined.split('/')
    const ref = prefix === undefined ? undefined : c.references.get(prefix)
    // A parent's prefix, or one no key declares, is the Markdown link's problem.
    if (ref === undefined) return intoCopy(c, joined, wiki)
    if (rest[0] === REFERENCES)
      return {
        problem: `${wiki}: reaches into ${prefix}'s own references; a wikilink reaches only this corpus and the corpora it references directly, and the id form reaches any depth`,
      }
    const inner = tries.find((t) =>
      ref.filesByNfc.has(t.split('/').slice(2).join('/').normalize('NFC')),
    )
    return inner === undefined
      ? { problem: `${wiki}: no such file in ${prefix}` }
      : intoCopy(c, inner, wiki)
  }
  for (const t of tries) {
    const file = c.filesByNfc.get(t.normalize('NFC'))
    if (file !== undefined) return { file }
  }
  if (joined.split('/').some(skipped))
    return {
      problem: `${wiki}: leaves the corpus, which excludes dot paths and node_modules`,
      warn: true,
    }
  return undefined
}

/**
 * The file a bare-name wikilink names: by path suffix among the files a wikilink reaches, then, for
 * a target with no `/`, by the id or file name of a record it reaches. Names match ignoring case
 * and Unicode composition.
 */
function bareName(c: Corpus, target: string, wiki: string): Resolution {
  const found = matchWikilink(target, c.wikilinks)
  const one = found[0]
  if (found.length === 1 && one !== undefined)
    return one.startsWith(`${REFERENCES}/`) ? intoCopy(c, one, wiki) : { file: one }
  if (found.length > 1) return { problem: `${wiki}: ambiguous, matches ${found.join(', ')}` }
  if (matchWikilink(target, c.nestedWikilinks).length > 0)
    return { problem: `${wiki}: ${BETWEEN_CORPORA}`, warn: true }
  const name = target.trim()
  if (name === '' || name.includes('/')) return { problem: `${wiki}: no file matches` }
  const byId = recordsById(c, undefined, name, true)
  const record = byId[0]
  if (byId.length > 1)
    return { problem: `${wiki}: ambiguous, the id of ${byId.map((r) => r.label).join(', ')}` }
  if (record !== undefined)
    return record.via === undefined
      ? { file: record.file }
      : intoCopy(c, `${REFERENCES}/${record.via}/${record.file}`, wiki)
  const far = tooFar(c, undefined, name)
  return { problem: `${wiki}: ${far ?? 'no file matches'}` }
}

/** A link to `path`, under `_references/` in `c`: it needs the copy it points into. */
function intoCopy(c: Corpus, path: string, dest: string): Resolution {
  const prefix = path.split('/')[1]
  if (prefix !== undefined && c.references.has(prefix)) c.linked.add(prefix)
  return intoReference(c, path, path, dest)
}

/**
 * Where `path`, under `_references/` in `c`, points in the corpus it names. The copy is not read:
 * the link resolves in the installed corpus, and `checkCopy` checks the copy.
 */
function intoReference(c: Corpus, path: string, file: string, dest: string): Resolution {
  const [, prefix, ...rest] = path.split('/')
  if (prefix === undefined) return { file }
  const ref = c.references.get(prefix)
  if (ref === undefined) {
    if (c.parents.has(prefix))
      return {
        problem: `${dest}: ${prefix} is in extends, which gives types only; name the corpus in references to link to its files`,
      }
    return c.declared.has(prefix)
      ? { unloaded: prefix }
      : {
          problem: `${dest}: ${REFERENCES}/${prefix} is not a reference; references declares no ${prefix}`,
        }
  }
  const inner = rest.join('/')
  if (inner === REFERENCES || inner.startsWith(`${REFERENCES}/`)) {
    // The link must also be live in the corpus's own copy, which this corpus's copy repeats.
    const below = inner.slice(REFERENCES.length + 1)
    const copied = (f: string): boolean => f === below || f.startsWith(`${below}/`)
    if (below !== '' && !ref.referenceFiles.some(copied))
      return {
        problem: `${dest}: ${prefix} holds no copy of it; run corpus-schema sync in ${prefix}`,
      }
    return intoReference(ref, inner, file, dest)
  }
  const key = inner.normalize('NFC')
  const at = inner === '' ? '.' : ref.filesByNfc.get(key)
  if (at !== undefined) return { file, owner: ref, at }
  if (ref.dirsByNfc.has(key)) return { file, owner: ref, at: inner }
  return { problem: `${dest}: no such file in ${prefix}` }
}

/** Calls `visit` with each string in `value` and the dotted field it sits in. */
function eachString(
  value: unknown,
  field: string,
  visit: (field: string, s: string) => void,
): void {
  if (typeof value === 'string') visit(field, value)
  else if (Array.isArray(value)) value.forEach((v) => eachString(v, field, visit))
  else if (value !== null && typeof value === 'object')
    for (const [k, v] of Object.entries(value))
      eachString(v, field === '' ? k : `${field}.${k}`, visit)
}

/** The keywords whose strings are prose in a schema, and may hold links. */
const PROSE = new Set(['title', 'description', '$comment'])

/** Calls `visit` with each string under a prose keyword in `node`, and its dotted path. */
function eachProse(node: unknown, field: string, visit: (field: string, s: string) => void): void {
  if (node === null || typeof node !== 'object') return
  for (const [k, v] of Object.entries(node)) {
    const at = field === '' ? k : `${field}.${k}`
    if (PROSE.has(k) && typeof v === 'string') visit(at, v)
    else eachProse(v, at, visit)
  }
}

/** The top-level fields of `file`'s type chain that hold references by id, not links. */
function idFields(c: Corpus, file: string): Set<string> {
  const type = c.recordType.get(file)
  if (type === undefined) return new Set()
  const refs = chain(type).flatMap((t) => t.refs)
  return new Set(refs.filter((r) => r.form !== 'link').map((r) => r.field))
}

/** Check every link in the checked files, and every `x-ref` field. */
function checkLinks(c: Corpus): void {
  const report = (file: string, field: string, r: Resolution, link: Link): void => {
    if (r !== undefined && 'problem' in r)
      (r.warn ? c.warnings : c.errors).push(`${file}: ${field}: ${r.problem}`)
    else if (r !== undefined && 'bare' in r)
      c.warnings.push(
        `${file}: ${field}: [[${link.target}]] is a bare name, not a path from this file; validate --fix rewrites it`,
      )
  }
  for (const [file, { text, data }] of c.checked) {
    if (extname(file) === '.md')
      for (const link of extractLinks(split(text).body))
        report(file, 'body', resolve(c, file, link), link)
    const visit = (field: string, s: string): void => {
      for (const link of extractLinks(s)) report(file, field, resolve(c, file, link), link)
    }
    // A schema's links sit only in its prose: a pattern or an enum value is not text.
    if (c.schemaFiles.has(file)) {
      eachProse(data ?? {}, '', visit)
      continue
    }
    // A field that refers by id holds no link: checkRef checks its values.
    const byId = idFields(c, file)
    for (const [key, value] of Object.entries(data ?? {}))
      if (!byId.has(key)) eachString(value, key, visit)
  }

  for (const type of c.types.values())
    for (const { file, data } of type.records.values())
      for (const ref of chain(type).flatMap((t) => t.refs)) {
        const value = data[ref.field]
        // null refers to nothing; the schema says whether it is allowed.
        if (value === undefined || value === null || ref.targets === undefined) continue
        const values = ref.items && Array.isArray(value) ? value : [value]
        for (const v of values) {
          if (v === null) continue
          const problem = checkRef(c, file, ref, ref.targets, v)
          if (problem !== undefined) c.errors.push(`${file}: ${ref.field}: ${problem}`)
        }
      }
}

/** `names` as a phrase: `a`, `a or b`, `a, b or c`. */
const anyOf = (names: string[]): string =>
  names.length === 1 ? (names[0] as string) : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`

/** `[[<id>]]` or `[[<id>|<text>]]`, with no path, heading or block. */
const WIKI_ID = /^\[\[([^[\]|#^/\\]+)(?:\|[^[\]]*)?\]\]$/

/** Why one value of an `x-ref` field is wrong, or undefined when it names a record it may. */
function checkRef(
  c: Corpus,
  file: string,
  ref: Ref,
  targets: Type[],
  v: unknown,
): string | undefined {
  // Named as this corpus names them: a parent type's own x-ref names a type in its own corpus.
  const of = `of type ${anyOf(ref.corpus === c ? ref.types : targets.map((t) => typeLabel(t, c)))}`
  if (ref.form !== 'link') {
    const id =
      typeof v !== 'string' ? undefined : ref.form === 'id' ? v : WIKI_ID.exec(v.trim())?.[1]
    if (id === undefined)
      return ref.form === 'id'
        ? 'must be the id of a record, such as "T-0012"'
        : 'must be a wikilink to a record id, such as "[[T-0012]]", quoted in YAML'
    const found = recordsById(c, targets, id, ref.form === 'wikilink')
    const far = found.length === 0 && ref.form === 'wikilink' ? tooFar(c, targets, id) : undefined
    if (far !== undefined) return `"${id}" ${far}`
    if (found.length === 0) return `"${id}" is not the id of a record ${of}`
    if (found.length > 1)
      return `"${id}" matches more than one record: ${found.map((f) => f.label).join(', ')}`
    // Obsidian resolves a wikilink to a referenced record in the copy, so it needs the copy.
    const via = found[0]?.via
    if (ref.form === 'wikilink' && via !== undefined) c.linked.add(via)
    return undefined
  }
  const links = typeof v === 'string' ? extractLinks(v.trim()) : []
  const link = links[0]
  if (links.length !== 1 || link === undefined || link.end - link.start !== String(v).trim().length)
    return 'must be one link, such as "[Name](Name.md)"'
  const r = resolve(c, file, link)
  if (r !== undefined && 'unloaded' in r) return undefined
  // A URL or a link to a heading in this file.
  if (r === undefined) return `must link to the file of a record ${of}`
  if ('problem' in r)
    return r.warn ? `must link to a record ${of} in this corpus or one it references` : undefined
  const at = (r.owner ?? c).recordType.get(r.at ?? r.file)
  return targets.some((t) => isA(at, t)) ? undefined : `${r.file} is not a record ${of}`
}

/**
 * The records whose id folds to `id`'s, among the records of `targets` and of the types that
 * extend them, in `c` and every corpus it references, at any depth, or only those it references
 * directly when `direct`, as a wikilink reaches. A record is one record however many copies reach
 * it: its identity is its corpus's identity, its type and its id. Each one is kept as found
 * through the shortest chain of references, so a direct reference wins. `via` is the first prefix
 * of that chain, or undefined for a record of `c`. A referenced record is labelled with the chain,
 * such as `org/principles/Be Kind.md`.
 */
function recordsById(c: Corpus, targets: Type[] | undefined, id: string, direct = false): ById[] {
  const key = fold(id)
  const found = new Map<string, ById>()
  const seen = new Set<Corpus>([c])
  // Breadth first, so the first copy of a record found has the shortest chain.
  const queue: [Corpus, string[]][] = [[c, []]]
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    const [k, path] = next
    for (const type of k.types.values()) {
      const file = type.ids.get(key) ?? type.stems.get(key)
      if (file === undefined) continue
      // One file of one corpus is one record, so its path stands for its type and id.
      const identity = `${k.identity ?? k.real}\0${file}`
      if ((targets === undefined || targets.some((t) => isA(type, t))) && !found.has(identity))
        found.set(identity, { label: [...path, file].join('/'), via: path[0], file })
    }
    if (direct && path.length > 0) continue
    for (const [prefix, ref] of k.references)
      if (!seen.has(ref)) {
        seen.add(ref)
        queue.push([ref, [...path, prefix]])
      }
  }
  return [...found.values()]
}

/** A record found by id: its label, the first prefix of the chain to it, and its file. */
interface ById {
  label: string
  via: string | undefined
  file: string
}

/**
 * Why a wikilink to `id` that names no record within reach fails, when it names a record of a
 * corpus further away than a direct reference. Undefined otherwise.
 */
function tooFar(c: Corpus, targets: Type[] | undefined, id: string): string | undefined {
  const far = recordsById(c, targets, id)
  if (far.length === 0) return undefined
  return `names ${far.map((r) => r.label).join(', ')}, beyond a direct reference; a wikilink reaches only this corpus and the corpora it references directly, and the id form reaches any depth`
}

/**
 * Whether a record of `type` counts as a record of `target`: `target` is in its chain, by
 * identity, so two installed copies of one package give one type.
 */
const isA = (type: Type | undefined, target: Type | undefined): boolean =>
  type !== undefined && target !== undefined && chain(type).some((t) => sameType(t, target))

const COPY_LINES = 10

/**
 * Check `_references/`: each `<prefix>/` folder in it, and each one a checked file links into,
 * holds exactly the files of the installed corpus, byte for byte. Reports up to COPY_LINES files
 * per parent.
 */
function checkCopy(c: Corpus): void {
  const sync = 'run corpus-schema sync'
  const present = new Map<string, string[]>()
  for (const f of c.referenceFiles) {
    const slash = f.indexOf('/')
    const prefix = slash < 0 ? f : f.slice(0, slash)
    const list = present.get(prefix) ?? []
    list.push(slash < 0 ? '' : f.slice(slash + 1))
    present.set(prefix, list)
  }
  for (const prefix of [...new Set([...present.keys(), ...c.linked])].sort()) {
    const here = `${REFERENCES}/${prefix}`
    const ref = c.references.get(prefix)
    if (ref === undefined) {
      // A reference that did not load is already an error at its references entry.
      if (!c.declared.has(prefix) || c.parents.has(prefix))
        c.errors.push(`${here}: (copy): ${prefix} is not in references; ${sync}`)
      continue
    }
    const copy = new Set(present.get(prefix) ?? [])
    if (copy.size === 0) {
      c.errors.push(`${here}: (copy): missing, and a file links into it; ${sync}`)
      continue
    }
    const expected = copyFiles(ref)
    const lines: string[] = []
    for (const f of expected)
      if (!copy.has(f)) lines.push(`${here}/${f}: (copy): missing; ${sync}`)
      else if (!sameBytes(join(ref.root, f), join(c.root, here, f)))
        lines.push(`${here}/${f}: (copy): differs from the installed corpus; ${sync}`)
    const wanted = new Set(expected)
    for (const f of copy)
      if (!wanted.has(f)) lines.push(`${here}/${f}: (copy): not in the installed corpus; ${sync}`)
    c.errors.push(...lines.slice(0, COPY_LINES))
    if (lines.length > COPY_LINES)
      c.errors.push(`${here}: (copy): ${lines.length - COPY_LINES} more files differ; ${sync}`)
  }
}

/**
 * The files `sync` copies from a referenced corpus, relative to its root: the corpus's own files
 * and the files of its `_references/`, so a chain of references carries through.
 */
export const copyFiles = (c: Corpus): string[] =>
  [...c.files, ...c.referenceFiles.map((f) => `${REFERENCES}/${f}`)].sort()

/**
 * Report each corpus identity that the graph of `c`, everything it extends and references at
 * any depth, holds at two versions, naming the chain of prefixes that brings in each.
 */
function checkVersions(c: Corpus, rootFile: string): void {
  const first = new Map<string, { version: string | undefined; chain: string }>()
  const seen = new Set<Corpus>([c])
  const queue: [Corpus, string[]][] = [[c, []]]
  const reported = new Set<string>()
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    const [k, path] = next
    for (const [prefix, named] of [...k.parents, ...k.references]) {
      if (seen.has(named)) continue
      seen.add(named)
      const chain = [...path, prefix]
      queue.push([named, chain])
      // A local corpus is one folder, so one version.
      if (named.identity === undefined) continue
      const version = named.package?.version
      const before = first.get(named.identity)
      if (before === undefined) first.set(named.identity, { version, chain: chain.join('/') })
      else if (before.version !== version && !reported.has(named.identity)) {
        reported.add(named.identity)
        const v = (x: string | undefined): string => x ?? 'no version'
        c.errors.push(
          `${rootFile}: (corpora): ${named.identity} is at ${v(before.version)} as ${before.chain} and at ${v(version)} as ${chain.join('/')}; a corpus's graph holds one version of each corpus`,
        )
      }
    }
  }
}

/** The checks that need every corpus loaded: links, `x-ref` fields and the `_references/` copy. */
function check(c: Corpus): void {
  checkLinks(c)
  checkCopy(c)
}

/** `value` with each link in its strings replaced by one marker, to compare data across a fix. */
function withoutLinks(value: unknown): unknown {
  if (typeof value === 'string') {
    let out = value
    for (const l of extractLinks(value).reverse())
      out = `${out.slice(0, l.start)}\0${out.slice(l.end)}`
    return out
  }
  if (Array.isArray(value)) return value.map(withoutLinks)
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withoutLinks(v)]))
  return value
}

/** Rewrite each bare-name wikilink that names one file as a relative Markdown link. */
function fixWikilinks(c: Corpus): { fixed: string[]; warnings: string[]; errors: string[] } {
  const fixed: string[] = []
  const warnings: string[] = []
  const errors: string[] = []
  for (const [file, { text, data }] of c.checked) {
    if (data === undefined) continue
    const ext = extname(file)
    // Each region's offset in the file, and its links.
    const regions: [number, Link[]][] = []
    if (ext === '.md') {
      const { yaml, yamlRange, body, bodyStart } = split(text)
      if (yaml !== null) regions.push([yamlRange.start, extractLinks(yaml)])
      regions.push([bodyStart, extractLinks(body)])
    } else regions.push([0, extractLinks(text)])

    // A wikilink in a field that refers by id is the field's form, so it stays.
    const byId = idFields(c, file)
    const keepsIdFields = (start: number, end: number, replacement: string): boolean => {
      if (byId.size === 0) return true
      try {
        const after = readData(`${text.slice(0, start)}${replacement}${text.slice(end)}`, ext)
        return [...byId].every((k) => isDeepStrictEqual(after[k], data[k]))
      } catch {
        // The check on the whole file below reports it.
        return true
      }
    }
    const edits: { start: number; end: number; with: string }[] = []
    for (const [offset, links] of regions)
      for (const link of links) {
        if (link.kind !== 'wiki') continue
        const r = resolve(c, file, link)
        // A wikilink that holds a path conforms, so it stays.
        if (r === undefined || !('bare' in r)) continue
        const path = posix.relative(posix.dirname(file), r.file)
        const label = link.text === '' ? stem(r.file) : link.text
        const replacement = markdownLink(label, path, link.fragment, link.embed)
        const [start, end] = [offset + link.start, offset + link.end]
        if (keepsIdFields(start, end, replacement)) edits.push({ start, end, with: replacement })
      }
    if (edits.length === 0) continue
    let out = text
    for (const e of edits.sort((a, b) => b.start - a.start))
      out = `${out.slice(0, e.start)}${e.with}${out.slice(e.end)}`

    // A wikilink in data must stay a string: `successor: [[X]]` is a YAML list, not a link.
    let same = false
    try {
      same = isDeepStrictEqual(withoutLinks(readData(out, ext)), withoutLinks(data))
    } catch {
      same = false
    }
    if (!same) {
      warnings.push(`${file}: wikilinks not rewritten; write each one in data as a quoted string`)
      continue
    }
    try {
      writeFileSync(join(c.root, file), out)
      fixed.push(file)
    } catch (e) {
      errors.push(`${file}: (file): cannot write (${whyFailed(e)})`)
    }
  }
  return { fixed, warnings, errors }
}

/**
 * Validate the corpus at `root` against the corpus-schema spec, version 0. Every problem is a line
 * in the report, including a file or folder that cannot be read or, with `fix`, written. Nothing
 * is thrown for them.
 *
 * With `fix`, first rewrite each bare-name wikilink that names one file as a relative Markdown link,
 * in place, in the root file, schema files and records. A file whose data would change is left
 * as it is, with a warning. The report then describes the corpus after the rewrite.
 */
export function validateCorpus(root: string, { fix = false } = {}): CorpusReport {
  let c = load(root)
  const fixes = fix ? fixWikilinks(c) : { fixed: [], warnings: [], errors: [] }
  if (fixes.fixed.length > 0) c = load(root)
  check(c)
  return {
    root,
    name: c.name,
    identity: c.identity,
    version: c.package?.version,
    id: c.id,
    level: c.level,
    records: new Map(
      [...c.types].map(([name, t]) => [
        name,
        new Map([...t.records].map(([id, r]) => [id, r.data])),
      ]),
    ),
    files: new Map(
      [...c.types].map(([name, t]) => [
        name,
        new Map([...t.records].map(([id, r]) => [id, r.file])),
      ]),
    ),
    errors: [...fixes.errors, ...c.errors],
    warnings: [...fixes.warnings, ...c.warnings],
    fixed: fixes.fixed,
  }
}
