// Drafts a tier 1 descriptor from one store of the system-cleanup research
// corpus (packages/corpora/system-cleanup-reference), for a person to review.
// Runs on the source, so it needs no build.
//
//   node scripts/draft-descriptor.ts [--corpus <dir>] [--out <dir>] [--force] <slug>...
//   node scripts/draft-descriptor.ts --out <dir> --first-set
//
// Without --out it prints one draft. A draft never sets idleHours or removes.
// What it can't put in a valid tier 1 file (the clean commands, the location
// overrides, folders that need a variable) goes into comments for the reviewer.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { Document, isMap, isNode, isSeq, parse } from 'yaml'

import {
  DESCRIPTOR_SCHEMA_URL,
  DESCRIPTOR_VERSION,
  OSES,
  parseDescriptor,
  type Os,
} from '../src/descriptor/schema.ts'
import type { CostDescription } from '../src/types.ts'

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
  { dir: 'node_modules', by: 'node' },
  { dir: 'target', marker: 'Cargo.toml', by: 'cargo' },
]

/** A store that can't be drafted: not in the corpus, or nothing in it fits a tier 1 file. */
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
}

/** One store as the corpus records it: its front matter and its current statement per subject. */
export interface CorpusStore {
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
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(readFileSync(file, 'utf8'))
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

/**
 * The store whose `slug` is `slug`, with its current statements.
 *
 * @throws DraftError when the corpus has no such store
 */
export function readStore(corpus: string, slug: string): CorpusStore {
  const stores = join(corpus, 'stores')
  if (!existsSync(stores))
    throw new DraftError(`${corpus} is not a corpus: it has no stores folder`)
  for (const file of readdirSync(stores).filter((f) => f.endsWith('.md'))) {
    const fm = frontMatter(join(stores, file))
    if (fm['slug'] !== slug) continue
    const title = basename(file, '.md')
    const statements = new Map<string, Statement>()
    const dir = join(corpus, 'statements', title)
    for (const name of existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')) : []) {
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
      statements.set(prop['predicate'], { object: prop['object'], open })
    }
    return {
      slug,
      title,
      cli: fm['cli'] as string | undefined,
      system: fm['system'] as boolean | undefined,
      checked: fm['checked'] as string | undefined,
      statements,
    }
  }
  throw new DraftError(`no store with slug ${slug} in ${stores}`)
}

/** A folder a tier 1 file can name: under home or absolute, with no variable or placeholder in it. */
const fixedFolder = (p: string): boolean =>
  /^(~[/\\]|\/|[A-Za-z]:[/\\])/.test(p) &&
  !/[$%<>{}*?]/.test(p) &&
  !/(^|[/\\])\.\.([/\\]|$)/.test(p)

interface Group {
  holds: string
  cost: CostDescription
  folders: Partial<Record<'all' | Os, string>>
}

/**
 * The corpus lists one folder per platform and doesn't say which entries are
 * the same folder on different platforms. Entries with the same path, `holds`
 * and cost are one folder; then folders with the same `holds` and cost on
 * different platforms are joined, in the corpus's order.
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
  const groups: Group[] = []
  for (const s of same) {
    const oses = Object.keys(s.folders) as ('all' | Os)[]
    const g = groups.find(
      (g) =>
        g.holds === s.holds &&
        g.cost === s.cost &&
        g.folders.all === undefined &&
        oses.every((os) => os !== 'all' && g.folders[os] === undefined),
    )
    if (g !== undefined) Object.assign(g.folders, s.folders)
    else groups.push(s)
  }
  return groups
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

/** `text` as comment lines of at most `width` characters, each starting with a space. */
function wrap(text: string, indent = '', width = 78): string[] {
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
 * @throws DraftError when the store has no fixed data folder
 */
export function draftDescriptor(store: CorpusStore): Draft {
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
  const dirEntry = (d: unknown): d is DataDir =>
    isRecord(d) &&
    text(d['path']) &&
    text(d['holds']) &&
    (d['platform'] === 'all' || (OSES as readonly unknown[]).includes(d['platform']))

  const dirs = keep(
    listIn('location/data-dirs', 'dirs', dirEntry),
    (d) => fixedFolder(d.path),
    (d) => `${d.platform} ${d.path} (${d.holds}): not a fixed folder`,
  )
  const groups = groupDirs(dirs)
  if (groups.length === 0)
    throw new DraftError(`${store.slug}: the corpus gives no data folder as a fixed path`)
  const names = nameGroups(groups)

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
    (l) => fixedFolder(l) && !/[/\\]$/.test(l),
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
      isRecord(b) && text(b['path']) && (b['marker'] === undefined || text(b['marker'])),
  )
  for (const b of buildDirs) {
    const covered = COVERED.find(
      (c) => c.dir === b.path && (c.marker === undefined || c.marker === b.marker),
    )
    if (covered !== undefined) left.push(`project ${b.path}: the ${covered.by} plugin covers it`)
    else if (/[/\\]/.test(b.path))
      left.push(`project ${b.path}: a project entry names one folder, not a path`)
    else if (b.marker === undefined) left.push(`project ${b.path}: the corpus names no marker file`)
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
    const commands = listIn(
      'clean/command',
      'commands',
      (c): c is { command: string; removes: string } =>
        isRecord(c) && text(c['command']) && text(c['removes']),
    )
    header.push(
      '',
      ' Clean commands in the corpus. A command must name the folder with a',
      ' {path} argument or an env entry, and set removes (unused or all):',
    )
    if (clean['supported'] !== true || commands.length === 0) header.push(...bullet('none'))
    for (const c of commands) header.push(...bullet(`${c.command}: ${c.removes}`))
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
 * @throws DraftError for a store the corpus lacks or that has no fixed folder
 * @throws DescriptorError when the draft is not a valid descriptor
 */
export function draftStore(corpus: string, slug: string): Draft {
  const draft = draftDescriptor(readStore(corpus, slug))
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
  const slugs = [...(values['first-set'] ? FIRST_SET : []), ...positionals]
  if (slugs.length === 0 || (values.out === undefined && slugs.length > 1)) {
    process.stderr.write(USAGE)
    return 2
  }
  let failed = 0
  for (const slug of slugs) {
    try {
      const draft = draftStore(values.corpus, slug)
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
