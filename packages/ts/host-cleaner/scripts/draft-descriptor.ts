// Drafts a tier 1 descriptor from one store of the system-cleanup research
// corpus (packages/corpora/system-cleanup-reference), for a person to review.
// Runs on this package's source, but imports the workspace's other packages
// through their dist/, so build those first (`pnpm run build`).
// Flags: see USAGE below.
//
// A draft never sets idleHours or removes.
// What it can't put in a valid tier 1 file (the clean commands, the location
// overrides, folders that need a variable) goes into comments for the reviewer.
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { type CorpusRecord, loadCorpus, recordsOf } from '@osdlc/corpus-schema'
import { Document, isMap, isNode, isSeq } from 'yaml'

import { CARGO_PLUGIN, CARGO_PROJECT } from '../src/cargo.ts'
import {
  DESCRIPTOR_SCHEMA_URL,
  DESCRIPTOR_VERSION,
  OSES,
  ProjectEntrySchema,
  isEntryName,
  isFolder,
  isLock,
  isPathsName,
  parseDescriptor,
  type Os,
} from '../src/descriptor/schema.ts'
import { NODE_PLUGIN, NODE_PROJECT } from '../src/node.ts'
import { COST_DESCRIPTIONS, type CostDescription } from '../src/types.ts'

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

/** A corpus or store the script can't draft from, or a draft file it won't overwrite. */
export class DraftError extends Error {
  override name = 'DraftError'
}

const CORPUS_PACKAGE = '@osdlc/corpus-system-cleanup-reference'

/**
 * The folder the `corpus` field of `pkg`'s package.json names.
 *
 * @throws DraftError when the field is not a folder path
 */
function corpusOf(pkg: string): string {
  const file = createRequire(import.meta.url).resolve(`${pkg}/package.json`)
  const corpus = (JSON.parse(readFileSync(file, 'utf8')) as { corpus?: unknown }).corpus
  if (typeof corpus !== 'string' || corpus === '')
    throw new DraftError(`${file}: its "corpus" field must be a folder path`)
  return resolve(dirname(file), corpus)
}

/** The corpus of this package's dev dependency on the research corpus. */
export const CORPUS_DIR = corpusOf(CORPUS_PACKAGE)

/** Project folders a code plugin already covers, by folder name and marker. */
const COVERED: readonly { dir: string; marker: string; by: string }[] = [
  { ...NODE_PROJECT, by: NODE_PLUGIN },
  { ...CARGO_PROJECT, by: CARGO_PLUGIN },
]

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
  /** The store file's name without `.md`. */
  title: string
  cli?: string | undefined
  system?: boolean | undefined
  checked?: string | undefined
  statements: ReadonlyMap<string, Statement>
  /** Why each statement that may be any store's is not read. */
  strays: readonly string[]
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** A corpus's stores by slug, and its statements by the store they link to. */
export interface StoreIndex {
  /** The corpus it indexes, whose statements a draft reads. */
  corpus: string
  bySlug: ReadonlyMap<string, readonly CorpusRecord[]>
  /** Why each store file with no slug has none. */
  noSlug: readonly string[]
  /** Statements by the path of the store their `store` link names. */
  statements: ReadonlyMap<string, readonly CorpusRecord[]>
  /** The statements folder named for each store, such as `statements/pnpm`. */
  folders: ReadonlySet<string>
  /**
   * Statements that may be any store's: they don't read, or they are current
   * and their `store` link names no store.
   */
  strays: readonly { path: string; why: string }[]
}

/**
 * Loads `corpus` once and indexes its stores and statements.
 *
 * @throws DraftError when `corpus` is not a corpus of stores
 */
export function indexStores(corpus: string): StoreIndex {
  const model = loadCorpus(corpus, { bodies: false })
  if (!model.types.some((t) => t.name === 'stores'))
    throw new DraftError(
      `${corpus} is not a corpus of stores: ${model.errors[0] ?? 'it has no stores folder'}`,
    )
  // The first error of each record, by every `<path>: ` an error starts with.
  const errors = new Map<string, string>()
  for (const e of model.errors)
    for (let i = e.indexOf(': '); i !== -1; i = e.indexOf(': ', i + 1))
      if (!errors.has(e.slice(0, i))) errors.set(e.slice(0, i), e)
  const errorOf = (r: CorpusRecord) => errors.get(r.path)
  const add = <T>(map: Map<string, T[]>, key: string, item: T) => {
    const list = map.get(key)
    if (list === undefined) map.set(key, [item])
    else list.push(item)
  }

  const bySlug = new Map<string, CorpusRecord[]>()
  const noSlug: string[] = []
  const folders = new Set<string>()
  for (const r of recordsOf(model, 'stores')) {
    folders.add(`statements/${r.name}`)
    const slug = r.data['slug']
    if (typeof slug === 'string') add(bySlug, slug, r)
    else noSlug.push(errorOf(r) ?? `${r.path}: no slug`)
  }

  const statements = new Map<string, CorpusRecord[]>()
  const strays: { path: string; why: string }[] = []
  for (const r of recordsOf(model, 'statements')) {
    const link = r.references.find((ref) => ref.pointer === '/store')
    const to = link?.target
    if (to?.corpus === '' && to.type === 'stores') add(statements, to.path, r)
    // A record whose data does not read has none.
    else if (Object.keys(r.data).length === 0 || r.data['status'] === 'current')
      strays.push({
        path: r.path,
        why: errorOf(r) ?? `${r.path}: ${link?.unresolved ?? 'store: is not a link to a store'}`,
      })
  }
  return { corpus, bySlug, noSlug, statements, folders, strays }
}

/**
 * `key` of `record`'s data, or undefined when unset.
 *
 * @throws DraftError when it is set but not a `type`
 */
function field<T>(record: CorpusRecord, key: string, type: 'string' | 'boolean'): T | undefined {
  const v = record.data[key]
  if (v === undefined || v === null) return undefined
  if (typeof v !== type) throw new DraftError(`${record.path}: ${key} is not a ${type}`)
  return v as T
}

/**
 * The store whose `slug` is `slug`, with its current statements.
 *
 * @throws DraftError when the corpus has no such store or more than one, no
 *   statement links to it, a statement in its folder is a stray, or a current
 *   statement is malformed or shares its subject with another
 */
function readStore(slug: string, index: StoreIndex): CorpusStore {
  const found = index.bySlug.get(slug) ?? []
  if (found.length > 1)
    throw new DraftError(
      `more than one store has slug ${slug}: ${found.map((s) => s.path).join(', ')}`,
    )
  const [record] = found
  if (record === undefined)
    throw new DraftError(
      `no store with slug ${slug} in ${join(index.corpus, 'stores')}` +
        (index.noSlug.length > 0 ? ` (with no slug: ${index.noSlug.join('; ')})` : ''),
    )
  const title = record.name
  // A stray in the folder named for a store is most likely that store's.
  const own = index.strays.find((s) => dirname(s.path) === `statements/${title}`)
  if (own !== undefined) throw new DraftError(own.why)
  const strays = index.strays.filter((s) => !index.folders.has(dirname(s.path))).map((s) => s.why)
  const linked = index.statements.get(record.path) ?? []
  if (linked.length === 0)
    throw new DraftError(
      `${slug}: no statement's store: links to ${record.path}` +
        (strays.length > 0 ? ` (linked to no store: ${strays.join('; ')})` : ''),
    )
  const statements = new Map<string, Statement & { path: string }>()
  for (const { path, data } of linked) {
    if (data['status'] !== 'current') continue
    const prop = data['proposition']
    if (!isRecord(prop) || typeof prop['predicate'] !== 'string' || !isRecord(prop['object']))
      throw new DraftError(
        `${path}: a current statement needs a proposition with a predicate and an object`,
      )
    const open = data['open'] ?? []
    if (!Array.isArray(open) || !open.every((o) => typeof o === 'string'))
      throw new DraftError(`${path}: open is not a list of strings`)
    const before = statements.get(prop['predicate'])
    if (before !== undefined)
      throw new DraftError(
        `${path}: ${before.path} is also the current statement of ${prop['predicate']}`,
      )
    statements.set(prop['predicate'], {
      object: prop['object'],
      open,
      scope: narrowing(data['scope']),
      path,
    })
  }
  return {
    slug,
    title,
    cli: field<string>(record, 'cli', 'string'),
    system: field<boolean>(record, 'system', 'boolean'),
    checked: field<string>(record, 'checked', 'string'),
    statements,
    strays,
  }
}

/** Whether `p` has no variable, placeholder or glob in it. */
const fixed = (p: string): boolean => !/[$%<>{}*?]/.test(p)

/**
 * A folder a tier 1 file can name: one the schema takes, with no variable or
 * placeholder in it, and never the home folder or a root alone.
 */
const fixedFolder = (p: string): boolean => isFolder(p) && fixed(p)

/** A name that ends in a file extension, such as `.pnp.cjs` or `Docker.raw`: a file, not a folder. */
const looksLikeFile = (p: string): boolean =>
  /[^/\\.]\.(c?js|mjs|json|gz|zip|tar|raw|img|qcow2|vhdx|db|sqlite3?|lock|log)$/i.test(p)

/**
 * A name a folder of locks has, such as Maven's `.locks` or asdf's
 * `install-locks`: it can stay after the run that made it, so as an `inUse`
 * lock it would hold every candidate for good.
 */
const locksFolder = (p: string): boolean => /(^|[/\\._-])locks[/\\]*$/i.test(p)

/** The segments of `p`, with `\` read as `/`, in lower case unless `cased`. */
const segments = (p: string, cased = false): string[] =>
  (cased ? p : p.toLowerCase()).replaceAll('\\', '/').split('/').filter(Boolean)

/** How many trailing segments `a` and `b` share, in any case: they are on different platforms. */
function sharedTail(a: string, b: string): number {
  const x = segments(a)
  const y = segments(b)
  let n = 0
  while (n < x.length && n < y.length && x[x.length - 1 - n] === y[y.length - 1 - n]) n++
  return n
}

/** Whether `inner` is `outer` or a folder inside it, on `os`: only linux tells case apart. */
function within(inner: string, outer: string, os: 'all' | Os): boolean {
  const i = segments(inner, os === 'linux')
  const o = segments(outer, os === 'linux')
  return i.length >= o.length && o.every((s, n) => s === i[n])
}

interface Group {
  holds: string
  cost: CostDescription
  folders: Partial<Record<'all' | Os, string>>
  /** Joined with a folder whose path ends in none of the same segments. */
  guessed?: boolean
}

const folderPaths = (g: Group): string[] => Object.values(g.folders) as string[]

/**
 * The corpus lists one folder per platform and doesn't say which entries are
 * the same folder on different platforms. Entries with the same path, `holds`
 * and cost are one folder; then folders with the same `holds` and cost on
 * different platforms are joined, the pair whose folders end in the most of
 * the same segments first, then in the corpus's order. A pair that ends in
 * none of the same segments is marked `guessed`. An entry the corpus lists
 * twice counts once.
 */
function groupDirs(dirs: readonly DataDir[]): Group[] {
  const same: Group[] = []
  const seen = new Set<string>()
  for (const d of dirs) {
    const key = JSON.stringify([d.platform, d.path, d.holds, d.rebuild])
    if (seen.has(key)) continue
    seen.add(key)
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
    const [a, b] = [groups[best.i] as Group, groups[best.j] as Group]
    Object.assign(a.folders, b.folders)
    if (best.tail === 0 || b.guessed === true) a.guessed = true
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

  /**
   * `key` of `subject`'s object as a list of `T`; empty when unset. A malformed
   * item or a value that is not a list throws, or with `leave` goes to `left`,
   * for a subject the draft can do without.
   */
  const listIn = <T>(
    subject: string,
    key: string,
    ok: (item: unknown) => item is T,
    leave = false,
  ): T[] => {
    const v = st(subject)?.object[key]
    if (v === undefined || v === null) return []
    const bad = (what: string) => {
      if (!leave) throw new DraftError(`${store.slug}: ${what}`)
      left.push(what)
      return false
    }
    if (!Array.isArray(v)) {
      bad(`${subject}: ${key} is not a list`)
      return []
    }
    return v.filter(
      (item, i): item is T =>
        ok(item) || bad(`${subject}: ${key}.${i} is not what the corpus records`),
    )
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
    isPathsName(d['holds']) &&
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
  const overlap = (g: Group, o: Group, how: (f: string, of: string, os: 'all' | Os) => boolean) =>
    entries(g).some(([os, f]) =>
      entries(o).some(
        ([oos, of]) =>
          (os === oos || os === 'all' || oos === 'all') &&
          how(f, of, (os === 'all' ? oos : os) as 'all' | Os),
      ),
    )
  const same = (f: string, of: string, os: 'all' | Os) => within(f, of, os) && within(of, f, os)
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
    keep(
      listIn('liveness/in-use', 'locks', text),
      (l) => isLock(l) && fixed(l),
      (l) => `lock ${l}: not a fixed file path`,
    ),
    (l) => !locksFolder(l),
    (l) => `lock ${l}: a folder of locks, which can stay after the tool exits`,
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
    true,
  )
  for (const b of buildDirs) {
    const covered = COVERED.find(
      (c) => c.dir === b.path && (c.marker === undefined || c.marker === b.marker),
    )
    if (covered !== undefined) left.push(`project ${b.path}: the ${covered.by} plugin covers it`)
    else if (!isEntryName(b.path))
      left.push(`project ${b.path}: a project entry names one folder, not a path`)
    else if (looksLikeFile(b.path)) left.push(`project ${b.path}: looks like a file, not a folder`)
    else if (b.marker === undefined) left.push(`project ${b.path}: the corpus names no marker file`)
    else {
      const entry = { dir: b.path, marker: b.marker, costDescription: b.rebuild }
      const parsed = ProjectEntrySchema.safeParse(entry)
      if (parsed.success) project.push(entry)
      else
        for (const issue of parsed.error.issues)
          left.push(
            `project ${b.path} (marker ${b.marker}): ${issue.path.join('.')} ${issue.message}`,
          )
    }
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
            true,
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
    ...listIn('location/override', 'vars', text, true).map((v) => `$${v}`),
    ...listIn('location/override', 'settings', text, true).map((s) => `setting ${s}`),
  ]
  if (movedBy.length > 0)
    header.push(
      '',
      ...wrap(
        `Moved by (a tier 2 variable could follow it; this file looks only at the default folders): ${movedBy.join(', ')}`,
      ),
    )
  if (locks.length > 0)
    header.push(
      '',
      ...wrap(
        `Locks: check that each is gone once the tool exits. One that stays holds every candidate for good: ${locks.join(', ')}`,
      ),
    )
  if (Object.keys(inUse).length === 0)
    header.push(
      '',
      ...wrap(
        'No inUse: nothing here tells that the tool is running. Add a process or a lock file that does.',
      ),
    )
  if (nested.length > 0)
    header.push('', ' Overlapping folders (their sizes count twice):', ...nested.flatMap(bullet))
  const guessed = groups.flatMap((g, i) =>
    g.guessed === true
      ? [
          `paths.${names[i]}: ${Object.entries(orderedFolders(g.folders))
            .map(([os, f]) => `${os} ${f}`)
            .join(', ')}`,
        ]
      : [],
  )
  if (guessed.length > 0)
    header.push(
      '',
      ' Joined across platforms though their names differ (check each is one folder):',
      ...guessed.flatMap(bullet),
    )
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
  if (store.strays.length > 0)
    header.push(
      '',
      " Statements not read, which may be this store's:",
      ...store.strays.flatMap(bullet),
    )
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
  mkdirSync(dir, { recursive: true })
  try {
    writeFileSync(file, draft.text, { flag: force ? 'w' : 'wx' })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST')
      throw new DraftError(`${file} exists; pass --force to replace it`)
    throw err
  }
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

// Node gives the main module's URL as its real path, but argv[1] as typed.
const script = process.argv[1]
if (script !== undefined && realpathSync(script) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
