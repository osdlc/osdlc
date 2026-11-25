// Drafts a tier 1 descriptor from one store of the system-cleanup research
// corpus (packages/corpora/system-cleanup-reference), for a person to review.
// Runs on this package's source, but src/ imports the workspace's other
// packages through their dist/, so build those first (`pnpm run build`).
// Flags: see USAGE below.
//
// A draft never sets idleHours or removes.
// What it can't put in a valid tier 1 file (the clean commands, the location
// overrides, folders that need a variable) goes into comments for the reviewer.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { Document, isMap, isNode, isSeq, parse } from 'yaml'

import { CARGO_PLUGIN } from '../src/cargo.ts'
import {
  DESCRIPTOR_SCHEMA_URL,
  DESCRIPTOR_VERSION,
  DescriptorSchema,
  OSES,
  ProjectEntrySchema,
  parseDescriptor,
  type Os,
} from '../src/descriptor/schema.ts'
import { NODE_PLUGIN } from '../src/node.ts'
import { COST_DESCRIPTIONS, type CostDescription } from '../src/types.ts'

/** Whether `name` can be a `paths` name, which a data folder's `holds` becomes. */
const pathsName = (name: string): boolean =>
  DescriptorSchema.shape.paths.keyType.safeParse(name).success

/** Whether `name` is one file or folder name, as a `project` entry's dir and marker must be. */
const oneName = (name: string): boolean => ProjectEntrySchema.shape.dir.safeParse(name).success

/** Whether the schema takes `p` as a `paths` folder. */
const schemaFolder = (p: string): boolean =>
  DescriptorSchema.shape.paths.valueType.shape.all.safeParse(p).success

/** Whether the schema takes `p` as an `inUse` lock. */
const schemaLock = (p: string): boolean =>
  DescriptorSchema.shape.inUse.unwrap().shape.locks.unwrap().element.safeParse(p).success

/** The reviewed first set the package ships, by corpus slug. */
export const FIRST_SET = [
  'pnpm',
  'uv',
  'go',
  'huggingface-hub',
  'gradle',
  'npm',
  'pip',
  'yarn',
  'maven',
] as const

/** The corpus in this repository. */
export const CORPUS_DIR = fileURLToPath(
  new URL('../../../corpora/system-cleanup-reference/corpus', import.meta.url),
)

/** Project folders a code plugin already covers, by folder name and marker (any marker when unset). */
const COVERED: readonly { dir: string; marker?: string; by: string }[] = [
  { dir: 'node_modules', by: NODE_PLUGIN },
  { dir: 'target', marker: 'Cargo.toml', by: CARGO_PLUGIN },
]

/** A corpus or store the script can't draft from, or a draft file it won't overwrite. */
export class DraftError extends Error {
  override name = 'DraftError'
}

interface DataDir {
  platform: 'all' | Os
  path: string
  holds: string
  rebuild: CostDescription
}

interface BuildDir {
  path: string
  marker?: string
  holds: string
  rebuild: CostDescription
}

interface Statement {
  object: Record<string, unknown>
  open: string[]
  /** The statement's `scope`, as `narrowing` returns it. */
  scope?: Record<string, unknown> | undefined
}

/** `scope` when it sets a platform, since or until; undefined when it applies everywhere. */
function narrowing(scope: unknown): Record<string, unknown> | undefined {
  if (!isRecord(scope)) return undefined
  const set = Object.entries(scope).filter(
    ([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0),
  )
  return set.length > 0 ? Object.fromEntries(set) : undefined
}

/** One store as the corpus records it: its front matter and its current statement per subject. */
interface CorpusStore {
  slug: string
  /** The store file's name without `.md`, which is also its statements folder. */
  title: string
  cli?: string | undefined
  system?: boolean | undefined
  checked?: string | undefined
  statements: ReadonlyMap<string, Statement>
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const frontMatter = (file: string): Record<string, unknown> => {
  const m = /^﻿?---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/.exec(
    readFileSync(file, 'utf8'),
  )
  if (m === null) throw new DraftError(`${file}: no front matter`)
  let fm: unknown
  try {
    fm = parse(m[1] ?? '') ?? {}
  } catch (err) {
    throw new DraftError(
      `${file}: front matter is not YAML: ${(err as Error).message.split('\n')[0]}`,
    )
  }
  if (!isRecord(fm)) throw new DraftError(`${file}: front matter is not a map`)
  return fm
}

/** The corpus's store files by slug, read once; files that can't be read are kept as errors. */
export interface StoreIndex {
  /** The corpus it indexes, whose statements a draft reads. */
  corpus: string
  stores: string
  bySlug: ReadonlyMap<string, readonly { file: string; fm: Record<string, unknown> }[]>
  unreadable: readonly string[]
}

/**
 * Reads the front matter of every store file in `corpus` once.
 *
 * @throws DraftError when `corpus` has no stores folder
 */
export function indexStores(corpus: string): StoreIndex {
  const stores = join(corpus, 'stores')
  if (!existsSync(stores))
    throw new DraftError(`${corpus} is not a corpus: it has no stores folder`)
  const bySlug = new Map<string, { file: string; fm: Record<string, unknown> }[]>()
  const unreadable: string[] = []
  for (const file of readdirSync(stores).filter((f) => f.endsWith('.md')).sort()) {
    let fm: Record<string, unknown>
    try {
      fm = frontMatter(join(stores, file))
    } catch (err) {
      unreadable.push((err as Error).message)
      continue
    }
    if (typeof fm['slug'] !== 'string') continue
    bySlug.set(fm['slug'], [...(bySlug.get(fm['slug']) ?? []), { file, fm }])
  }
  return { corpus, stores, bySlug, unreadable }
}

/**
 * `key` of the front matter in `file`, or undefined when unset.
 *
 * @throws DraftError when it is set but not a `type`
 */
function field<T>(
  file: string,
  fm: Record<string, unknown>,
  key: string,
  type: 'string' | 'boolean',
): T | undefined {
  const v = fm[key]
  if (v === undefined || v === null) return undefined
  if (typeof v !== type) throw new DraftError(`${file}: ${key} is not a ${type}`)
  return v as T
}

/**
 * The store whose `slug` is `slug`, with its current statements.
 *
 * @throws DraftError when the corpus has no such store or more than one, or a
 *   current statement is malformed or shares its subject with another
 */
function readStore(slug: string, index: StoreIndex): CorpusStore {
  const found = index.bySlug.get(slug) ?? []
  if (found.length > 1)
    throw new DraftError(
      `more than one store has slug ${slug}: ${found.map((s) => s.file).join(', ')}`,
    )
  const [hit] = found
  if (hit === undefined)
    throw new DraftError(
      `no store with slug ${slug} in ${index.stores}` +
        (index.unreadable.length > 0 ? ` (unreadable: ${index.unreadable.join('; ')})` : ''),
    )
  const { file, fm } = hit
  const storeFile = join(index.stores, file)
  const title = basename(file, '.md')
  const statements = new Map<string, Statement & { file: string }>()
  const dir = join(index.corpus, 'statements', title)
  const names = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')) : []
  for (const name of names.sort()) {
    const f = join(dir, name)
    const s = frontMatter(f)
    if (s['status'] !== 'current') continue
    const prop = s['proposition']
    if (!isRecord(prop) || typeof prop['predicate'] !== 'string' || !isRecord(prop['object']))
      throw new DraftError(
        `${f}: a current statement needs a proposition with a predicate and an object`,
      )
    const open = s['open'] ?? []
    if (!Array.isArray(open) || !open.every((o) => typeof o === 'string'))
      throw new DraftError(`${f}: open is not a list of strings`)
    const before = statements.get(prop['predicate'])
    if (before !== undefined)
      throw new DraftError(
        `${f}: ${before.file} is also the current statement of ${prop['predicate']}`,
      )
    statements.set(prop['predicate'], {
      object: prop['object'],
      open,
      scope: narrowing(s['scope']),
      file: f,
    })
  }
  return {
    slug,
    title,
    cli: field<string>(storeFile, fm, 'cli', 'string'),
    system: field<boolean>(storeFile, fm, 'system', 'boolean'),
    checked: field<string>(storeFile, fm, 'checked', 'string'),
    statements,
  }
}

/**
 * A folder a tier 1 file can name: one the schema takes, with no variable or
 * placeholder in it, and never the home folder or a root alone.
 */
const fixedFolder = (p: string): boolean =>
  schemaFolder(p) && /^(~[/\\]|\/|[A-Za-z]:[/\\])[/\\]*[^/\\]/.test(p) && !/[$%<>{}*?]/.test(p)

/** A name that ends in a file extension, such as `.pnp.cjs` or `Docker.raw`: a file, not a folder. */
const looksLikeFile = (p: string): boolean =>
  /[^/\\.]\.(c?js|mjs|json|gz|zip|tar|raw|img|qcow2|vhdx|db|sqlite3?|lock|log)$/i.test(p)

/** The segments of `p`, with `\` read as `/`. */
const segments = (p: string): string[] => p.replaceAll('\\', '/').split('/').filter(Boolean)

/** How many trailing segments `a` and `b` share. */
function sharedTail(a: string, b: string): number {
  const x = segments(a)
  const y = segments(b)
  let n = 0
  while (n < x.length && n < y.length && x[x.length - 1 - n] === y[y.length - 1 - n]) n++
  return n
}

/** Whether `inner` is `outer` or a folder inside it. */
function within(inner: string, outer: string): boolean {
  const i = segments(inner)
  const o = segments(outer)
  return i.length >= o.length && o.every((s, n) => s === i[n])
}

interface Group {
  holds: string
  cost: CostDescription
  folders: Partial<Record<'all' | Os, string>>
}

const folderPaths = (g: Group): string[] => Object.values(g.folders) as string[]

/**
 * The corpus lists one folder per platform and doesn't say which entries are
 * the same folder on different platforms. Entries with the same path, `holds`
 * and cost are one folder; then folders with the same `holds` and cost on
 * different platforms are joined, the pair whose folders end in the most of
 * the same segments first, then in the corpus's order.
 */
function groupDirs(dirs: readonly DataDir[]): Group[] {
  const same: Group[] = []
  for (const d of dirs) {
    const g = same.find(
      (g) =>
        g.holds === d.holds &&
        g.cost === d.rebuild &&
        Object.values(g.folders)[0] === d.path &&
        g.folders.all === undefined &&
        d.platform !== 'all' &&
        g.folders[d.platform] === undefined,
    )
    if (g !== undefined) g.folders[d.platform] = d.path
    else same.push({ holds: d.holds, cost: d.rebuild, folders: { [d.platform]: d.path } })
  }
  const joinable = (a: Group, b: Group) =>
    a.holds === b.holds &&
    a.cost === b.cost &&
    a.folders.all === undefined &&
    b.folders.all === undefined &&
    Object.keys(b.folders).every((os) => a.folders[os as Os] === undefined)
  const tail = (a: Group, b: Group) =>
    Math.max(...folderPaths(a).flatMap((f) => folderPaths(b).map((o) => sharedTail(f, o))))
  // Join the best pair left until none can be joined, so a folder that
  // matches better is never shut out by one met earlier.
  const groups = same
  for (;;) {
    let best: { tail: number; i: number; j: number } | undefined
    for (let i = 0; i < groups.length; i++)
      for (let j = i + 1; j < groups.length; j++) {
        const a = groups[i] as Group
        const b = groups[j] as Group
        if (!joinable(a, b)) continue
        const t = tail(a, b)
        if (best === undefined || t > best.tail) best = { tail: t, i, j }
      }
    if (best === undefined) return groups
    Object.assign((groups[best.i] as Group).folders, (groups[best.j] as Group).folders)
    groups.splice(best.j, 1)
  }
}

/** A `paths` name per group: its `holds`, and the folder's own name when two groups hold the same. */
function nameGroups(groups: readonly Group[]): string[] {
  const used = new Set<string>()
  return groups.map((g) => {
    let name = g.holds
    if (groups.filter((o) => o.holds === g.holds).length > 1) {
      const first = Object.values(g.folders)[0] ?? ''
      const own = basename(first.replaceAll('\\', '/'))
        .replace(/[^A-Za-z0-9_-]+/g, '-')
        .replace(/^[^A-Za-z]+|-+$/g, '')
        .toLowerCase()
      if (own !== '' && own !== g.holds) name = `${g.holds}-${own}`
    }
    let unique = name
    for (let n = 2; used.has(unique); n++) unique = `${name}-${n}`
    used.add(unique)
    return unique
  })
}

const orderedFolders = (folders: Group['folders']): Record<string, string> =>
  Object.fromEntries(
    (['all', ...OSES] as const).flatMap((os) =>
      folders[os] === undefined ? [] : [[os, folders[os]]],
    ),
  )

/** `text` as comment lines of at most 78 characters, each starting with a space. */
function wrap(text: string, indent = ''): string[] {
  const width = 78
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line !== '' && indent.length + line.length + word.length + 2 > width) {
      lines.push(line)
      line = ''
    }
    line = line === '' ? word : `${line} ${word}`
  }
  if (line !== '') lines.push(line)
  return lines.map((l, i) => ` ${i === 0 ? '' : indent}${l}`)
}

const bullet = (text: string): string[] => wrap(`- ${text}`, '  ')

/** A draft: the store's slug and the commented YAML. */
export interface Draft {
  slug: string
  text: string
}

/**
 * The draft descriptor for `store`: `paths` and one candidate per data folder
 * the corpus gives as a fixed path, `inUse`, `project` entries no code plugin
 * covers, and comments for the rest.
 *
 * @throws DraftError when the store has no fixed data folder, or a subject's
 *   list is malformed
 */
function draftDescriptor(store: CorpusStore): Draft {
  const st = (subject: string) => store.statements.get(subject)
  const left: string[] = []

  /** `key` of `subject`'s object as a list of `T`; empty when unset. */
  const listIn = <T>(subject: string, key: string, ok: (item: unknown) => item is T): T[] => {
    const v = st(subject)?.object[key]
    if (v === undefined || v === null) return []
    if (!Array.isArray(v)) throw new DraftError(`${store.slug}: ${subject}: ${key} is not a list`)
    const i = v.findIndex((item) => !ok(item))
    if (i >= 0)
      throw new DraftError(`${store.slug}: ${subject}: ${key}.${i} is not what the corpus records`)
    return v
  }
  /** The items `fits` accepts; each other one goes to `left` as `why` says. */
  const keep = <T>(items: T[], fits: (item: T) => boolean, why: (item: T) => string): T[] =>
    items.filter((item) => {
      if (fits(item)) return true
      left.push(why(item))
      return false
    })
  const text = (v: unknown): v is string => typeof v === 'string' && v !== ''
  const cost = (v: unknown): v is CostDescription =>
    (COST_DESCRIPTIONS as readonly unknown[]).includes(v)
  const dirEntry = (d: unknown): d is DataDir =>
    isRecord(d) &&
    text(d['path']) &&
    typeof d['holds'] === 'string' &&
    pathsName(d['holds']) &&
    cost(d['rebuild']) &&
    (d['platform'] === 'all' || (OSES as readonly unknown[]).includes(d['platform']))

  const dirs = keep(
    keep(
      listIn('location/data-dirs', 'dirs', dirEntry),
      (d) => fixedFolder(d.path),
      (d) => `${d.platform} ${d.path} (${d.holds}): not a fixed folder`,
    ),
    (d) => !looksLikeFile(d.path),
    (d) => `${d.platform} ${d.path} (${d.holds}): looks like a file, not a folder`,
  )
  const groups = groupDirs(dirs)
  if (groups.length === 0)
    throw new DraftError(`${store.slug}: the corpus gives no data folder as a fixed path`)
  const names = nameGroups(groups)

  // A folder inside another one, or the same one twice: cleaning one empties
  // the other too, and their sizes count twice.
  const nested: string[] = []
  const entries = (g: Group) => Object.entries(g.folders) as [string, string][]
  const overlap = (g: Group, o: Group, how: (f: string, of: string) => boolean) =>
    entries(g).some(([os, f]) =>
      entries(o).some(([oos, of]) => (os === oos || os === 'all' || oos === 'all') && how(f, of)),
    )
  const same = (f: string, of: string) => within(f, of) && within(of, f)
  groups.forEach((g, i) =>
    groups.forEach((o, j) => {
      if (i === j) return
      if (overlap(g, o, same)) {
        if (i < j) nested.push(`paths.${names[i]} and paths.${names[j]} name one folder: keep one`)
      } else if (overlap(g, o, within))
        nested.push(`paths.${names[i]} is inside paths.${names[j]}: keep one`)
    }),
  )

  const program = store.cli?.split(/\s+/)[0]
  const detect = {
    any: [
      ...(program !== undefined && /^[A-Za-z0-9._+-]+$/.test(program) ? [{ onPath: program }] : []),
      ...names.map((n) => ({ exists: n })),
    ],
  }

  const processes = listIn('liveness/in-use', 'processes', text)
  const locks = keep(
    listIn('liveness/in-use', 'locks', text),
    (l) => schemaLock(l) && fixedFolder(l),
    (l) => `lock ${l}: not a fixed file path`,
  )
  const inUse = {
    ...(processes.length > 0 ? { processes } : {}),
    ...(locks.length > 0 ? { locks } : {}),
  }

  const project: Record<string, unknown>[] = []
  const buildDirs = listIn(
    'project/build-dirs',
    'dirs',
    (b): b is BuildDir =>
      isRecord(b) &&
      text(b['path']) &&
      text(b['holds']) &&
      cost(b['rebuild']) &&
      (b['marker'] === undefined || text(b['marker'])),
  )
  for (const b of buildDirs) {
    const covered = COVERED.find(
      (c) => c.dir === b.path && (c.marker === undefined || c.marker === b.marker),
    )
    if (covered !== undefined) left.push(`project ${b.path}: the ${covered.by} plugin covers it`)
    else if (!oneName(b.path))
      left.push(`project ${b.path}: a project entry names one folder, not a path`)
    else if (looksLikeFile(b.path)) left.push(`project ${b.path}: looks like a file, not a folder`)
    else if (b.marker === undefined) left.push(`project ${b.path}: the corpus names no marker file`)
    else if (!oneName(b.marker))
      left.push(`project ${b.path}: its marker ${b.marker} is a path, not a file name`)
    else project.push({ dir: b.path, marker: b.marker, costDescription: b.rebuild })
  }

  const descriptor: Record<string, unknown> = {
    descriptor: DESCRIPTOR_VERSION,
    store: store.slug,
    ...(store.system === true ? { system: true } : {}),
    detect,
    paths: Object.fromEntries(groups.map((g, i) => [names[i], orderedFolders(g.folders)])),
    candidates: groups.map((g, i) => ({ path: names[i], costDescription: g.cost })),
    ...(Object.keys(inUse).length > 0 ? { inUse } : {}),
    ...(project.length > 0 ? { project } : {}),
  }

  const doc = new Document(descriptor)
  // Small maps on one line, as the system description writes them.
  const paths = doc.get('paths', true)
  const any = doc.getIn(['detect', 'any'], true)
  const proj = doc.get('project', true)
  for (const node of [
    ...(isMap(paths) ? paths.items.map((pair) => pair.value) : []),
    ...(isSeq(any) ? any.items : []),
    ...(isSeq(proj) ? proj.items : []),
  ])
    if (isMap(node)) node.flow = true
  const cands = doc.get('candidates', true)
  if (isSeq(cands))
    cands.items.forEach((item, i) => {
      if (isNode(item)) item.commentBefore = ` holds ${groups[i]?.holds}`
    })

  // What the reviewer needs: what to decide, and what the corpus says that
  // the draft couldn't carry.
  const header: string[] = [
    ` yaml-language-server: $schema=${DESCRIPTOR_SCHEMA_URL}`,
    ...wrap(
      `Drafted from the system-cleanup corpus, stores/${store.title}.md` +
        `${store.checked === undefined ? '' : ` (checked ${store.checked})`}. Review it before it ships:` +
        ' set idleHours where it should differ from the config, choose glob or held per candidate,' +
        ' and add a command with removes where the tool has one that can be pointed at the folder.',
    ),
  ]
  const clean = st('clean/command')?.object
  if (clean !== undefined) {
    // Read only when supported: the entries of an unsupported one are not used.
    const commands =
      clean['supported'] === true
        ? listIn(
            'clean/command',
            'commands',
            (c): c is { command: string; removes: string } =>
              isRecord(c) && text(c['command']) && text(c['removes']),
          )
        : []
    header.push(
      '',
      ' Clean commands in the corpus. A command must name the folder with a',
      ' {path} argument or an env entry, and set removes (unused or all):',
    )
    if (commands.length === 0) header.push(...bullet('none'))
    else for (const c of commands) header.push(...bullet(`${c.command}: ${c.removes}`))
  }
  const movedBy = [
    ...listIn('location/override', 'vars', text).map((v) => `$${v}`),
    ...listIn('location/override', 'settings', text).map((s) => `setting ${s}`),
  ]
  if (movedBy.length > 0)
    header.push(
      '',
      ...wrap(
        `Moved by (a tier 2 variable could follow it; this file looks only at the default folders): ${movedBy.join(', ')}`,
      ),
    )
  if (nested.length > 0)
    header.push('', ' Overlapping folders (their sizes count twice):', ...nested.flatMap(bullet))
  const scoped = [...store.statements.entries()].flatMap(([subject, s]) =>
    s.scope === undefined ? [] : [`${subject}: ${JSON.stringify(s.scope)}`],
  )
  if (scoped.length > 0)
    header.push(
      '',
      ' Scoped in the corpus (the draft applies them everywhere):',
      ...scoped.flatMap(bullet),
    )
  if (left.length > 0) header.push('', ' Left out:', ...left.flatMap(bullet))
  const open = [...store.statements.entries()].flatMap(([subject, s]) =>
    subject === 'inventory/command' ? [] : s.open.map((o) => `${subject}: ${o}`),
  )
  if (open.length > 0) header.push('', ' Open in the corpus:', ...open.flatMap(bullet))
  doc.commentBefore = header.join('\n')

  return { slug: store.slug, text: doc.toString({ lineWidth: 0 }) }
}

/**
 * Drafts `slug` from `corpus` and checks the text reads back as a descriptor.
 *
 * @throws DraftError when the store can't be read from the corpus or has no
 *   fixed data folder, or `index` is of another corpus
 * @throws DescriptorError when the draft is not a valid descriptor
 */
export function draftStore(
  corpus: string,
  slug: string,
  index: StoreIndex = indexStores(corpus),
): Draft {
  if (index.corpus !== corpus)
    throw new DraftError(`the index is of ${index.corpus}, not of ${corpus}`)
  const draft = draftDescriptor(readStore(slug, index))
  parseDescriptor(draft.text, `${slug}.yaml (draft)`)
  return draft
}

/**
 * Writes `draft` to `<dir>/<slug>.yaml` and returns the file. A file there is
 * kept, since it may hold a review, unless `force`.
 *
 * @throws DraftError when the file exists and `force` is not set
 */
export function writeDraft(dir: string, draft: Draft, force = false): string {
  const file = join(dir, `${draft.slug}.yaml`)
  if (existsSync(file) && !force) throw new DraftError(`${file} exists; pass --force to replace it`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(file, draft.text)
  return file
}

const USAGE =
  'usage: draft-descriptor [--corpus <dir>] [--out <dir>] [--force] (<slug>... | --first-set)\n' +
  'Without --out, give one slug and the draft is printed.\n'

function main(argv: readonly string[]): number {
  let args
  try {
    args = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        corpus: { type: 'string', default: CORPUS_DIR },
        out: { type: 'string' },
        force: { type: 'boolean', default: false },
        'first-set': { type: 'boolean', default: false },
      },
    })
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n${USAGE}`)
    return 2
  }
  const { values, positionals } = args
  const slugs = [...new Set([...(values['first-set'] ? FIRST_SET : []), ...positionals])]
  if (slugs.length === 0 || (values.out === undefined && slugs.length > 1)) {
    process.stderr.write(USAGE)
    return 2
  }
  let index: StoreIndex
  try {
    index = indexStores(values.corpus)
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`)
    return 1
  }
  let failed = 0
  for (const slug of slugs) {
    try {
      const draft = draftStore(values.corpus, slug, index)
      if (values.out === undefined) process.stdout.write(draft.text)
      else process.stdout.write(`wrote ${writeDraft(values.out, draft, values.force)}\n`)
    } catch (err) {
      failed++
      process.stderr.write(`${(err as Error).message}\n`)
    }
  }
  return failed === 0 ? 0 : 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
