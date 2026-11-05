/**
 * markdown-db validator (docs/standards/S-GFFY-markdown-db.md, version 0). Nothing here knows a
 * particular corpus: every rule comes from the standard, the root file or a type's schema.
 */
import { type Dirent, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, join, posix } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js'
import addFormatsModule, { type FormatsPlugin } from 'ajv-formats'
import { split } from '@osdlc/frontmatter-lossless'
import { parse as parseYaml } from 'yaml'
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

// ajv-formats is CommonJS: under Node's ESM loader the plugin is the `default` property.
const addFormats = (addFormatsModule as unknown as { default: FormatsPlugin }).default

export const ROOT_FILES = ['markdown-db.md', 'markdown-db.yaml', 'markdown-db.json']
const ROOT_KEYS = new Set(['markdown-db', 'id', 'formats'])

type Data = Record<string, unknown>

interface Ref {
  field: string
  type: string
  /** The `x-ref` sits on the property's `items`, so each item is a link. */
  items: boolean
}

interface Type {
  name: string
  dir: string
  schemaFile: string
  validate: ValidateFunction | undefined
  idPattern: RegExp | undefined
  refs: Ref[]
  /** Valid records by id. */
  records: Map<string, { file: string; data: Data }>
}

interface Corpus {
  root: string
  name: string
  id: string | undefined
  files: Set<string>
  /** Files and folders by their NFC form, for relative links. */
  filesByNfc: Map<string, string>
  dirsByNfc: Set<string>
  nested: string[]
  /** The corpus's files, and the files of the corpora nested in it, for wikilinks. */
  wikilinks: WikilinkIndex
  nestedWikilinks: WikilinkIndex
  types: Map<string, Type>
  /** The type of each record file. */
  recordType: Map<string, Type>
  /** Files whose links are checked: the root file, schema files and records, with their data. */
  checked: Map<string, { text: string; data: Data | undefined }>
  errors: string[]
  warnings: string[]
}

export interface CorpusReport {
  root: string
  name: string
  id: string | undefined
  /** Valid records by type, then id. */
  records: Map<string, Map<string, Data>>
  errors: string[]
  warnings: string[]
  /** Files `fix` rewrote. */
  fixed: string[]
}

const skipped = (name: string): boolean => name.startsWith('.') || name === 'node_modules'
const entries = (abs: string): Dirent[] => readdirSync(abs, { withFileTypes: true })
// Exact names: existsSync ignores case on macOS and Windows.
const hasRootFile = (names: Dirent[]): boolean =>
  names.some((d) => d.isFile() && ROOT_FILES.includes(d.name))

/** Every corpus root at or below `dir`, nested ones included. */
export function findCorpora(dir: string): string[] {
  const found: string[] = []
  const visit = (abs: string): void => {
    const names = entries(abs)
    if (hasRootFile(names)) found.push(abs)
    for (const d of names) if (d.isDirectory() && !skipped(d.name)) visit(join(abs, d.name))
  }
  visit(dir)
  return found
}

/**
 * The corpus's files and folders, relative and with `/`, stopping at nested corpora, and the files
 * of those nested corpora.
 */
function walk(root: string): {
  files: string[]
  dirs: string[]
  nested: string[]
  nestedFiles: string[]
} {
  const files: string[] = []
  const dirs: string[] = []
  const nested: string[] = []
  const nestedFiles: string[] = []
  const visit = (rel: string, names: Dirent[], inNested: boolean): void => {
    for (const d of names) {
      if (skipped(d.name)) continue
      const path = rel === '' ? d.name : `${rel}/${d.name}`
      if (d.isFile()) (inNested ? nestedFiles : files).push(path)
      if (!d.isDirectory()) continue
      const sub = entries(join(root, path))
      const startsNested = !inNested && hasRootFile(sub)
      if (startsNested) nested.push(path)
      else if (!inNested) dirs.push(path)
      visit(path, sub, inNested || startsNested)
    }
  }
  visit('', entries(root), false)
  return { files: files.sort(), dirs: dirs.sort(), nested, nestedFiles: nestedFiles.sort() }
}

/** A file's data: the frontmatter of a `.md` file, else the whole file. Empty data is `{}`. */
export function readData(text: string, ext: string): Data {
  let data: unknown
  if (ext === '.md') {
    const { yaml } = split(text)
    data = yaml === null ? {} : parseYaml(yaml)
  } else if (ext === '.json') data = text.trim() === '' ? {} : JSON.parse(text)
  else data = parseYaml(text)
  data ??= {}
  if (typeof data !== 'object' || Array.isArray(data))
    throw new Error('data must be a mapping, not a scalar or list')
  return data as Data
}

const BAD_ID_CHAR = /[/\\:*?"<>|[\]#^\p{Cc}]/u

/** Why `id` breaks the id rules, or undefined when it follows them. */
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

/** Paths to every object in a schema that holds `x-ref`. */
function xrefPlaces(node: unknown, path: string[] = []): string[][] {
  if (node === null || typeof node !== 'object') return []
  const here = !Array.isArray(node) && 'x-ref' in node ? [path] : []
  return [...here, ...Object.entries(node).flatMap(([k, v]) => xrefPlaces(v, [...path, k]))]
}

const stem = (file: string): string => basename(file, extname(file))

/** Read the root file, the types and their records, checking everything but links. */
function load(root: string): Corpus {
  const { files, dirs, nested, nestedFiles } = walk(root)
  const c: Corpus = {
    root,
    name: basename(root),
    id: undefined,
    files: new Set(files),
    filesByNfc: new Map(files.map((f) => [f.normalize('NFC'), f])),
    dirsByNfc: new Set(dirs.map((d) => d.normalize('NFC'))),
    nested,
    wikilinks: wikilinkIndex(files),
    nestedWikilinks: wikilinkIndex(nestedFiles),
    types: new Map(),
    recordType: new Map(),
    checked: new Map(),
    errors: [],
    warnings: [],
  }
  const extensions = readRoot(c)
  if (extensions === undefined) return c
  const schemaFiles = readTypes(c, dirs)
  readRecords(c, files, extensions, schemaFiles)
  return c
}

/**
 * Read `file`'s data and keep its text for the link checks. Reports a parse error and returns
 * undefined.
 */
function readChecked(c: Corpus, file: string): Data | undefined {
  const text = readFileSync(join(c.root, file), 'utf8')
  let data: Data | undefined
  try {
    data = readData(text, extname(file))
  } catch (e) {
    c.errors.push(`${file}: ${(e as Error).message}`)
  }
  c.checked.set(file, { text, data })
  return data
}

/** Check the root file. Returns the record extensions it allows, or undefined to stop. */
function readRoot(c: Corpus): string[] | undefined {
  const rootFiles = ROOT_FILES.filter((f) => c.files.has(f))
  const rootFile = rootFiles[0]
  if (rootFile === undefined) {
    c.errors.push(`${c.root}: no ${ROOT_FILES.join(', ')}`)
    return undefined
  }
  if (rootFiles.length > 1) c.errors.push(`${rootFiles.join(', ')}: a folder holds one root file`)
  const data = readChecked(c, rootFile)
  if (data === undefined) return undefined
  if (data['markdown-db'] !== 0) {
    c.errors.push(`${rootFile}: markdown-db: must be 0, the only version this validator supports`)
    return undefined
  }
  const id = data['id']
  if (id !== undefined && (typeof id !== 'string' || id.trim() === ''))
    c.errors.push(`${rootFile}: id: must be a non-empty string`)
  else c.id = id
  for (const key of Object.keys(data))
    if (!ROOT_KEYS.has(key)) c.warnings.push(`${rootFile}: ${key}: not a markdown-db v0 key`)

  const formats = data['formats'] ?? ['md']
  const list: unknown[] = Array.isArray(formats) ? formats : []
  if (
    list.length === 0 ||
    list.some((f) => !Object.hasOwn(FORMATS, String(f))) ||
    new Set(list).size < list.length
  ) {
    c.errors.push(`${rootFile}: formats: must list one or more of md, yaml, json, once each`)
    return ['.md']
  }
  return list.map((f) => FORMATS[String(f)] as string)
}

/** Find the types: folders holding `<their name>.schema.{md,yaml,json}`. Returns every schema file. */
function readTypes(c: Corpus, dirs: string[]): Set<string> {
  // strictSchema only: a misspelled keyword is an error. The other strict options reject valid
  // JSON Schema 2020-12, such as `properties` without `type: object`.
  const ajv = new Ajv2020({
    allErrors: true,
    strictSchema: true,
    strictTypes: false,
    strictTuples: false,
    strictRequired: false,
  })
  addFormats(ajv)
  ajv.addKeyword({ keyword: 'x-ref', schemaType: 'string' })
  ajv.addKeyword({ keyword: 'x-id-pattern', schemaType: 'string' })
  const schemaFiles = new Set<string>()
  const typeDirs = new Map<string, string>()
  for (const dir of dirs) {
    const name = basename(dir)
    const found = RECORD_EXTENSIONS.map((ext) => `${dir}/${name}.schema${ext}`).filter((f) =>
      c.files.has(f),
    )
    const schemaFile = found[0]
    if (schemaFile === undefined) continue
    for (const f of found) schemaFiles.add(f)
    if (found.length > 1) c.errors.push(`${found.join(', ')}: a type holds one schema file`)
    const outer = [...c.types.values()].find((t) => dir.startsWith(`${t.dir}/`))
    if (outer !== undefined) {
      c.errors.push(`${dir}: a type folder must not sit inside type ${outer.name}`)
      continue
    }
    const clash = typeDirs.get(fold(name))
    if (clash !== undefined) {
      c.errors.push(`${dir}: type name is also used by ${clash}`)
      continue
    }
    typeDirs.set(fold(name), dir)
    const nameProblem = idProblem(name)
    if (nameProblem !== undefined) c.errors.push(`${dir}: type name ${nameProblem}`)

    const type: Type = {
      name,
      dir,
      schemaFile,
      validate: undefined,
      idPattern: undefined,
      refs: [],
      records: new Map(),
    }
    c.types.set(name, type)
    const schema = readChecked(c, schemaFile)
    if (schema === undefined) continue
    try {
      type.validate = ajv.compile(schema)
    } catch (e) {
      c.errors.push(`${schemaFile}: ${(e as Error).message}`)
    }
    const pattern = schema['x-id-pattern']
    if (typeof pattern === 'string')
      try {
        type.idPattern = new RegExp(pattern, 'u')
      } catch (e) {
        c.errors.push(`${schemaFile}: x-id-pattern: ${(e as Error).message}`)
      }
    for (const place of xrefPlaces(schema)) {
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
      type.refs.push({ field, type: String(holder['x-ref']), items })
    }
  }
  for (const type of c.types.values())
    for (const ref of type.refs)
      if (!c.types.has(ref.type))
        c.errors.push(`${type.schemaFile}: ${ref.field}: x-ref names unknown type "${ref.type}"`)
  for (const n of c.nested) {
    const inType = [...c.types.values()].find((t) => n.startsWith(`${t.dir}/`))
    if (inType !== undefined)
      c.errors.push(`${n}: a corpus must not sit inside type folder ${inType.dir}`)
  }
  return schemaFiles
}

/** Check each type's records: the .md, .yaml and .json files under its folder, at any depth. */
function readRecords(
  c: Corpus,
  files: string[],
  extensions: string[],
  schemaFiles: Set<string>,
): void {
  for (const type of c.types.values()) {
    const ids = new Map<string, string>()
    for (const file of files) {
      if (!file.startsWith(`${type.dir}/`) || schemaFiles.has(file)) continue
      const ext = extname(file)
      const lower = ext.toLowerCase()
      if (lower === '.yml') {
        c.errors.push(`${file}: use the .yaml extension`)
        continue
      }
      if (!RECORD_EXTENSIONS.includes(lower)) continue
      if (ext !== lower) {
        c.errors.push(`${file}: use the lower-case ${lower} extension`)
        continue
      }
      if (!extensions.includes(ext)) {
        c.errors.push(`${file}: format ${ext.slice(1)} is not in the corpus's formats`)
        continue
      }
      c.recordType.set(file, type)
      const id = stem(file)
      const problem = idProblem(id)
      if (problem !== undefined) c.errors.push(`${file}: id: "${id}" ${problem}`)
      else if (type.idPattern !== undefined && !type.idPattern.test(id))
        c.errors.push(`${file}: id: "${id}" does not match x-id-pattern ${type.idPattern.source}`)
      const other = ids.get(fold(id))
      if (other !== undefined) c.errors.push(`${file}: id: "${id}" is also ${other}`)
      else ids.set(fold(id), file)

      const data = readChecked(c, file)
      if (data === undefined) continue
      if (type.validate !== undefined && !type.validate(data)) {
        // The if/then wrapper repeats the `then` failure at the root.
        for (const e of type.validate.errors ?? [])
          if (e.keyword !== 'if') c.errors.push(`${file}: ${describe(e)}`)
        continue
      }
      if (problem === undefined && other === undefined) type.records.set(id, { file, data })
    }
  }
}

/** A file in the corpus, a problem, or undefined for a link not checked (a URL, or within the file). */
type Resolution = { file: string } | { problem: string; warn?: true } | undefined

const BETWEEN_CORPORA = 'leaves the corpus; v0 does not define links between corpora'

/** Where `link`, held by `from`, points in the corpus. */
function resolve(c: Corpus, from: string, link: Link): Resolution {
  if (link.kind === 'wiki') {
    const wiki = `[[${link.target}]]`
    if (link.target.startsWith('/'))
      return { problem: `${wiki}: links in a corpus must be relative` }
    const found = matchWikilink(link.target, c.wikilinks)
    if (found.length === 1) return { file: found[0] as string }
    if (found.length > 1) return { problem: `${wiki}: ambiguous, matches ${found.join(', ')}` }
    if (matchWikilink(link.target, c.nestedWikilinks).length > 0)
      return { problem: `${wiki}: ${BETWEEN_CORPORA}`, warn: true }
    return { problem: `${wiki}: no file matches` }
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

/** Check every link in the checked files, and every `x-ref` field. */
function checkLinks(c: Corpus): void {
  const report = (file: string, field: string, r: Resolution, link: Link): void => {
    if (r !== undefined && 'problem' in r)
      (r.warn ? c.warnings : c.errors).push(`${file}: ${field}: ${r.problem}`)
    else if (r !== undefined && link.kind === 'wiki')
      c.warnings.push(
        `${file}: ${field}: [[${link.target}]] is a wikilink; validate --fix rewrites it`,
      )
  }
  for (const [file, { text, data }] of c.checked) {
    if (extname(file) === '.md')
      for (const link of extractLinks(split(text).body))
        report(file, 'body', resolve(c, file, link), link)
    eachString(data, '', (field, s) => {
      for (const link of extractLinks(s)) report(file, field, resolve(c, file, link), link)
    })
  }

  for (const type of c.types.values())
    for (const { file, data } of type.records.values()) {
      for (const ref of type.refs) {
        const value = data[ref.field]
        if (value === undefined) continue
        const values = ref.items && Array.isArray(value) ? value : [value]
        for (const v of values) {
          const links = typeof v === 'string' ? extractLinks(v.trim()) : []
          const link = links[0]
          if (
            links.length !== 1 ||
            link === undefined ||
            link.end - link.start !== String(v).trim().length
          ) {
            c.errors.push(`${file}: ${ref.field}: must be one link, such as "[Name](Name.md)"`)
            continue
          }
          const r = resolve(c, file, link)
          if (r === undefined)
            c.errors.push(`${file}: ${ref.field}: must link to a file, not a URL`)
          else if ('problem' in r && r.warn)
            c.errors.push(`${file}: ${ref.field}: must link to a ${ref.type} record in this corpus`)
          else if ('file' in r && c.recordType.get(r.file)?.name !== ref.type)
            c.errors.push(`${file}: ${ref.field}: ${r.file} is not a ${ref.type} record`)
        }
      }
    }
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

/** Rewrite each wikilink that resolves to one file as a relative Markdown link. */
function fixWikilinks(c: Corpus): { fixed: string[]; warnings: string[] } {
  const fixed: string[] = []
  const warnings: string[] = []
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

    const edits: { start: number; end: number; with: string }[] = []
    for (const [offset, links] of regions)
      for (const link of links) {
        if (link.kind !== 'wiki') continue
        const r = resolve(c, file, link)
        if (r === undefined || !('file' in r)) continue
        const path = posix.relative(posix.dirname(file), r.file)
        const label = link.text === '' ? stem(r.file) : link.text
        const replacement = markdownLink(label, path, link.fragment, link.embed)
        edits.push({ start: offset + link.start, end: offset + link.end, with: replacement })
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
    writeFileSync(join(c.root, file), out)
    fixed.push(file)
  }
  return { fixed, warnings }
}

/** Validate the corpus at `root`. With `fix`, rewrite its wikilinks first. */
export function validateCorpus(root: string, { fix = false } = {}): CorpusReport {
  let c = load(root)
  const fixes = fix ? fixWikilinks(c) : { fixed: [], warnings: [] }
  if (fixes.fixed.length > 0) c = load(root)
  checkLinks(c)
  return {
    root,
    name: c.name,
    id: c.id,
    records: new Map(
      [...c.types].map(([name, t]) => [
        name,
        new Map([...t.records].map(([id, r]) => [id, r.data])),
      ]),
    ),
    errors: c.errors,
    warnings: [...fixes.warnings, ...c.warnings],
    fixed: fixes.fixed,
  }
}
