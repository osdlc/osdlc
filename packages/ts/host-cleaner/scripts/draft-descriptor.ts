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
import { Document, isMap, isSeq, parse, type Node, type YAMLMap } from 'yaml'

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

const frontMatter = (file: string): Record<string, unknown> => {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(readFileSync(file, 'utf8'))
  if (m === null) throw new DraftError(`${file}: no front matter`)
  return (parse(m[1] ?? '') ?? {}) as Record<string, unknown>
}

/**
 * The store whose `slug` is `slug`, with its current statements.
 *
 * @throws DraftError when the corpus has no such store
 */
export function readStore(corpus: string, slug: string): CorpusStore {
  const stores = join(corpus, 'stores')
  for (const file of readdirSync(stores).filter((f) => f.endsWith('.md'))) {
    const fm = frontMatter(join(stores, file))
    if (fm['slug'] !== slug) continue
    const title = basename(file, '.md')
    const statements = new Map<string, Statement>()
    const dir = join(corpus, 'statements', title)
    for (const f of existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')) : []) {
      const s = frontMatter(join(dir, f))
      if (s['status'] !== 'current') continue
      const prop = s['proposition'] as { predicate: string; object: Record<string, unknown> }
      statements.set(prop.predicate, {
        object: prop.object,
        open: (s['open'] as string[] | undefined) ?? [],
      })
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

  const dirs = ((st('location/data-dirs')?.object['dirs'] as DataDir[] | undefined) ?? []).filter(
    (d) => {
      if (fixedFolder(d.path)) return true
      left.push(`${d.platform} ${d.path} (${d.holds}): not a fixed folder`)
      return false
    },
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

  const inUseObject = st('liveness/in-use')?.object as
    { processes?: string[]; locks?: string[] } | undefined
  const locks = (inUseObject?.locks ?? []).filter((l) => {
    if (fixedFolder(l) && !/[/\\]$/.test(l)) return true
    left.push(`lock ${l}: not a fixed file path`)
    return false
  })
  const inUse = Object.fromEntries(
    Object.entries({ processes: inUseObject?.processes ?? [], locks }).filter(
      ([, v]) => v.length > 0,
    ),
  )

  const project: Record<string, unknown>[] = []
  for (const b of (st('project/build-dirs')?.object['dirs'] as BuildDir[] | undefined) ?? []) {
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
  const top = doc.contents
  if (!isMap(top)) throw new Error('a descriptor is a map')
  const at = (key: string) => top.get(key, true) as Node | undefined
  // Small maps on one line, as the system description writes them.
  const flow = (node: unknown) => {
    if (isMap(node)) node.flow = true
  }
  const paths = at('paths')
  if (isMap(paths)) for (const pair of paths.items) flow(pair.value)
  const any = (at('detect') as YAMLMap | undefined)?.get('any', true)
  if (isSeq(any)) for (const item of any.items) flow(item)
  const proj = at('project')
  if (isSeq(proj)) for (const item of proj.items) flow(item)
  const cands = at('candidates')
  if (isSeq(cands))
    cands.items.forEach((item, i) => {
      const g = groups[i]
      if (g !== undefined) (item as Node).commentBefore = ` holds ${g.holds}`
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
  const clean = st('clean/command')?.object as
    { supported: boolean; commands?: { command: string; removes: string }[] } | undefined
  if (clean !== undefined) {
    header.push('', ' Clean commands in the corpus. A command must name the folder with a')
    header.push(' {path} argument or an env entry, and set removes (unused or all):')
    if (!clean.supported || (clean.commands ?? []).length === 0) header.push(...bullet('none'))
    for (const c of clean.commands ?? []) header.push(...bullet(`${c.command}: ${c.removes}`))
  }
  const override = st('location/override')?.object as
    { vars?: string[]; settings?: string[] } | undefined
  const movedBy = [
    ...(override?.vars ?? []).map((v) => `$${v}`),
    ...(override?.settings ?? []).map((s) => `setting ${s}`),
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

function main(argv: readonly string[]): number {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      corpus: { type: 'string', default: CORPUS_DIR },
      out: { type: 'string' },
      force: { type: 'boolean', default: false },
      'first-set': { type: 'boolean', default: false },
    },
  })
  const slugs = [...(values['first-set'] ? FIRST_SET : []), ...positionals]
  if (slugs.length === 0 || (values.out === undefined && slugs.length > 1)) {
    process.stderr.write(
      'usage: draft-descriptor [--corpus <dir>] [--out <dir>] [--force] (<slug>... | --first-set)\n' +
        'Without --out, give one slug and the draft is printed.\n',
    )
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
