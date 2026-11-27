/**
 * Vault scanner: walk a directory of markdown files and build the in-memory
 * index: file metadata, frontmatter properties, tags (frontmatter and inline),
 * outgoing links and embeds, and backlinks.
 *
 * `node:fs` is imported inside `scanVault`, never at the top. This module also
 * holds the shared, environment-free half of the index (the types,
 * `parseFrontmatter`, `frontmatterTags`, `extractLinks`, `createLinkResolver`,
 * `resolveVaultLinks`), which `./from-data.ts` reuses so a caller building an
 * index from its own data gets the same normalisation. A browser importing the
 * package for `createVaultIndex` therefore reaches this file, and a top-level
 * `import ... from 'node:fs/promises'` would make that a build error: a bundler
 * stubs the module out and then cannot find `readdir` on the stub.
 */

import { splitLenient } from '@osdlc/frontmatter-lossless'
import { DEFAULT_TAG_DIALECT, type TagDialect, inlineTags } from '@osdlc/markdown-tags'
import { bodyLinksSpanned } from '@osdlc/markdown-link'
import YAML from 'yaml'

/** What the index knows about one file: its name, place in the vault, size and times. */
export interface FileMeta {
  /** File name including extension, e.g. `Plan.md`. */
  name: string
  /** File name without its last extension, e.g. `Plan`. */
  basename: string
  /** Vault-relative path including extension, always '/'-separated. */
  path: string
  /** Vault-relative folder, '' for vault root. */
  folder: string
  /** Extension without the leading dot, e.g. 'md'. */
  ext: string
  /** Size in bytes. `0` for a note from `createVaultIndex` that supplies none. */
  size: number
  /** Creation time (the file's birth time on disk). Epoch for a supplied note with no time. */
  ctime: Date
  /** Last modification time. Epoch for a supplied note with no time. */
  mtime: Date
}

/** One outgoing wikilink or embed of a note, with the file it resolved to if any. */
export interface LinkRef {
  /** Raw link target as written, without alias/heading/block suffix. */
  target: string
  /** Resolved vault-relative path, or `null` when no file matches (or links are not resolved). */
  path: string | null
  /** Display alias if one was written. */
  display: string | null
}

/** One file of the vault: its metadata and, for a Markdown note, what it holds and what links to it. */
export interface VaultNote {
  /** The file's name, path and stat data. */
  file: FileMeta
  /** Raw YAML frontmatter (empty object when absent). */
  properties: Record<string, unknown>
  /** Normalized tags without '#': frontmatter + inline, deduped, original case. */
  tags: string[]
  /** Outgoing [[wikilinks]] (excluding embeds). */
  links: LinkRef[]
  /** Outgoing ![[embeds]]. */
  embeds: LinkRef[]
  /** Vault-relative paths of notes that link to this note. */
  backlinks: string[]
}

/** Every file of a vault, with a lookup by path. `scanVault` and `createVaultIndex` both return one. */
export interface VaultIndex {
  /** The folder that was scanned, as passed to `scanVault`. `''` from `createVaultIndex`. */
  root: string
  /** Every indexed file, in path order from `scanVault` and in input order from `createVaultIndex`. */
  notes: VaultNote[]
  /** Lookup by vault-relative path. */
  byPath: Map<string, VaultNote>
}

/** Entry names the walk skips besides every name that starts with a dot. */
const SKIPPED_DIRS = new Set(['node_modules'])

/**
 * The YAML frontmatter of a note as an object. Returns `{}` when the note has
 * none, when the YAML is malformed, or when it is not a mapping (a list or a
 * scalar). A leading byte-order mark, padded fences and blank lines before the
 * first fence are accepted. The input is not modified and nothing is thrown.
 */
export function parseFrontmatter(content: string): Record<string, unknown> {
  // Lenient framing: hand-authored vault notes drift into BOMs, padded
  // fences, and leading blank lines, and a read-only scan should still see
  // their properties.
  const yaml = splitLenient(content)?.yaml
  if (yaml === undefined) return {}
  try {
    const parsed = YAML.parse(yaml)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/**
 * The tags a note's frontmatter declares under `tags` or `tag`, with any leading
 * `#` removed. Shared with `createVaultIndex`; not part of the public API.
 */
export function frontmatterTags(properties: Record<string, unknown>): string[] {
  const raw = properties.tags ?? properties.tag
  if (typeof raw === 'string') {
    // Comma- or space-separated string form.
    return raw
      .split(/[,\s]+/)
      .filter(Boolean)
      .map((t) => t.replace(/^#/, ''))
  }
  if (Array.isArray(raw)) {
    return raw
      .filter((t): t is string | number => typeof t === 'string' || typeof t === 'number')
      .map((t) => String(t).replace(/^#/, ''))
  }
  return []
}

/**
 * The inline `#tags` of a Markdown body, without the `#`, in order of
 * appearance, by `@osdlc/markdown-tags`. Code is skipped. Pass the body only,
 * not the frontmatter. Duplicates are kept; `scanVault` dedupes.
 *
 * `options.tagDialect` picks the rule: `obsidian` (the default), `unicode` or
 * `ascii`, as `@osdlc/markdown-tags` defines them.
 */
export function extractInlineTags(
  body: string,
  options: { tagDialect?: TagDialect } = {},
): string[] {
  return inlineTags(body, options.tagDialect ?? DEFAULT_TAG_DIALECT)
}

/**
 * The outgoing `[[wikilinks]]` and `![[embeds]]` of a Markdown body, by
 * `@osdlc/markdown-link`, which skips code. Targets are as written, so every
 * `path` is `null`: resolving them needs an index. Markdown links such as
 * `[text](./note.md)` are left out.
 */
export function extractLinks(body: string): { links: LinkRef[]; embeds: LinkRef[] } {
  const links: LinkRef[] = []
  const embeds: LinkRef[] = []
  for (const link of bodyLinksSpanned(body)) {
    if (link.kind === 'markdown') continue
    ;(link.kind === 'embed' ? embeds : links).push({
      target: link.target,
      path: null,
      display: link.alias,
    })
  }
  return { links, embeds }
}

/** Node's filesystem and path modules, as `scanVault` uses them. */
interface NodeIo {
  fs: typeof import('node:fs/promises')
  path: typeof import('node:path')
}

let nodeIoOnce: Promise<NodeIo> | null = null

/** Load Node's IO modules, once per process. See the module note above. */
function nodeIo(): Promise<NodeIo> {
  nodeIoOnce ??= (async () => ({
    fs: await import('node:fs/promises'),
    path: await import('node:path'),
  }))()
  return nodeIoOnce
}

async function walk(
  dir: string,
  realDir: string,
  filesOut: string[],
  io: NodeIo,
  ancestorRealDirs: Set<string>,
): Promise<void> {
  ancestorRealDirs.add(realDir)
  const entries = await io.fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIPPED_DIRS.has(entry.name)) continue
    const full = io.path.join(dir, entry.name)
    // `readdir` types a symlink as neither file nor directory, so its target
    // decides which arm it takes; `stat` throws on a broken link, so it is skipped.
    const kind = entry.isSymbolicLink() ? await io.fs.stat(full).catch(() => null) : entry
    if (kind === null) continue
    if (kind.isDirectory()) {
      // A real subdirectory of a real path is itself real, so only a symlink
      // needs the `realpath` call — and only a symlink can point at a directory
      // this branch of the walk is already inside.
      const childRealDir = entry.isSymbolicLink()
        ? await io.fs.realpath(full)
        : io.path.join(realDir, entry.name)
      if (ancestorRealDirs.has(childRealDir)) continue
      await walk(full, childRealDir, filesOut, io, ancestorRealDirs)
    } else if (kind.isFile()) {
      filesOut.push(full)
    }
  }
  ancestorRealDirs.delete(realDir)
}

function toVaultPath(root: string, absolute: string, path: NodeIo['path']): string {
  return path.relative(root, absolute).split(path.sep).join('/')
}

/** Options for `scanVault`. */
export interface ScanOptions {
  /** Also index files that are not `.md` (file metadata only, no links or tags). Default true. */
  includeNonMarkdown?: boolean
  /**
   * Which inline `#tag` rule to read: `obsidian` (the default), `unicode` or
   * `ascii`, as `@osdlc/markdown-tags` defines them.
   */
  tagDialect?: TagDialect
}

/**
 * Walk `root` and index every file in it: each Markdown note's frontmatter,
 * tags, links and embeds, and the backlinks computed across the whole vault.
 * Paths are vault-relative and `/`-separated, and notes come back sorted by
 * path.
 *
 * The walk skips every entry whose name starts with `.` (so `.obsidian`,
 * `.git` and `.trash`) and every entry named `node_modules`. It follows
 * symbolic links wherever they point, including out of `root`, so scan only
 * vaults you trust. A broken link is skipped and a link back up the tree is
 * not walked twice.
 *
 * Rejects with the error Node throws when `root` does not exist, or when
 * `root`, a folder under it or a Markdown note in it cannot be read. One
 * unreadable note rejects the whole scan; no partial index comes back.
 */
export async function scanVault(root: string, options: ScanOptions = {}): Promise<VaultIndex> {
  const io = await nodeIo()
  const includeNonMarkdown = options.includeNonMarkdown ?? true
  const files: string[] = []
  await walk(root, await io.fs.realpath(root), files, io, new Set())
  files.sort()

  const notes: VaultNote[] = []
  for (const absolute of files) {
    const vaultPath = toVaultPath(root, absolute, io.path)
    const lastSlash = vaultPath.lastIndexOf('/')
    const fileName = lastSlash === -1 ? vaultPath : vaultPath.slice(lastSlash + 1)
    const lastDot = fileName.lastIndexOf('.')
    const ext = lastDot === -1 ? '' : fileName.slice(lastDot + 1)
    if (ext !== 'md' && !includeNonMarkdown) continue

    const stats = await io.fs.stat(absolute)
    const meta: FileMeta = {
      name: fileName,
      basename: lastDot === -1 ? fileName : fileName.slice(0, lastDot),
      path: vaultPath,
      folder: lastSlash === -1 ? '' : vaultPath.slice(0, lastSlash),
      ext,
      size: stats.size,
      ctime: stats.birthtime,
      mtime: stats.mtime,
    }

    if (ext !== 'md') {
      notes.push({ file: meta, properties: {}, tags: [], links: [], embeds: [], backlinks: [] })
      continue
    }

    const content = await io.fs.readFile(absolute, 'utf8')
    const properties = parseFrontmatter(content)
    const body = splitLenient(content)?.body ?? content
    const { links, embeds } = extractLinks(body)
    const tags = [
      ...new Set([...frontmatterTags(properties), ...inlineTags(body, options.tagDialect)]),
    ]
    notes.push({ file: meta, properties, tags, links, embeds, backlinks: [] })
  }

  const index: VaultIndex = { root, notes, byPath: new Map(notes.map((n) => [n.file.path, n])) }
  resolveVaultLinks(index)
  return index
}

/**
 * `target` ('./x', '../y/z') joined onto the vault folder `folder`, as a
 * vault-relative path, or null when it climbs out of the vault.
 */
function relativeToFolder(folder: string, target: string): string | null {
  const parts = folder === '' ? [] : folder.split('/')
  for (const segment of target.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (parts.length === 0) return null
      parts.pop()
    } else {
      parts.push(segment)
    }
  }
  return parts.join('/')
}

/**
 * The scanner's link-target resolver over `index`: a target as written (no
 * alias or heading suffix) to the note it names, or `null`. `scanVault`
 * resolves every body link with it, and a consumer resolving a link it found
 * elsewhere, such as a frontmatter value, uses it too, so the same target
 * lands on the same note wherever it was written. A relative target
 * (`./sib`, `../b/note`) is read from `from`'s folder, or from the vault root
 * when no `from` is given.
 *
 * Order: an exact path first (a target without an extension tries `.md`
 * before the bare name), then the extension rules (a target with an extension
 * matches that file name, never a same-name note), then the shortest path
 * among files of the same name. Matching ignores case. A folder-qualified
 * target must match whole path segments and never falls back to a same-name
 * file in another folder.
 *
 * The basename table is built on the first target that is not an exact path
 * and reused after that, so build a resolver per pass over an index rather than
 * holding one across changes to it.
 */
export function createLinkResolver(
  index: VaultIndex,
): (target: string, from?: VaultNote) => VaultNote | null {
  // Obsidian resolves shortest-path-first by basename; exact paths win.
  let byNameOnce: Map<string, VaultNote[]> | null = null
  const byName = (): Map<string, VaultNote[]> => {
    if (byNameOnce) return byNameOnce
    byNameOnce = new Map()
    for (const note of index.notes) {
      const key = note.file.basename.toLowerCase()
      const list = byNameOnce.get(key) ?? []
      list.push(note)
      byNameOnce.set(key, list)
    }
    return byNameOnce
  }

  return (target: string, from?: VaultNote): VaultNote | null => {
    let clean = target.replace(/\\/g, '/').replace(/^\//, '')
    const anchored = /^\.\.?\//.test(clean)
    if (anchored) {
      // A relative target ('./sib', '../b/note', Obsidian's relative link
      // format) names a path from the linking note's folder. It resolves to one
      // vault path, and only a file at that path matches it.
      const relative = relativeToFolder(from?.file.folder ?? '', clean)
      if (relative === null) return null
      clean = relative
    }
    const lastSlash = clean.lastIndexOf('/')
    const name = (lastSlash === -1 ? clean : clean.slice(lastSlash + 1)).toLowerCase()
    const withoutExt = name.replace(/\.[^.]+$/, '')
    const hasExtension = withoutExt !== name

    // An extensionless target means the '.md' note before a bare file of that name.
    const direct = hasExtension
      ? (index.byPath.get(clean) ?? index.byPath.get(`${clean}.md`))
      : (index.byPath.get(`${clean}.md`) ?? index.byPath.get(clean))
    if (direct) return direct

    // `byName` is keyed on basename — the file name with its extension removed —
    // so a target that names a file with its extension ('note.png') only reaches
    // that file once the extension comes off. Those exact-file-name matches are
    // tried first, so an image embed can't land on a same-basename note. The
    // fallback bucket is the name with a trailing '.md' removed, which is what an
    // extensionless target ('note') and a dotted basename ('v1.2') both key on;
    // it holds '.md' notes, then files with no extension ('Makefile'), since a
    // target that names no extension cannot mean 'note.png'.
    const exact = hasExtension
      ? (byName().get(withoutExt) ?? []).filter((c) => c.file.name.toLowerCase() === name)
      : []
    const looseBucket = byName().get(name.replace(/\.md$/, '')) ?? []
    const loose = looseBucket.filter((c) => c.file.ext.toLowerCase() === 'md')
    const bare = looseBucket.filter((c) => c.file.ext === '')

    const pick = (candidates: VaultNote[]): VaultNote | null => {
      if (candidates.length === 0) return null
      if (anchored || lastSlash !== -1) {
        // A folder-qualified target names a run of whole path segments, so a
        // match has to start on a segment boundary: 'aab/note.md' ends with the
        // string 'b/note.md' but sits in no folder named 'b'. An extensionless
        // target means the '.md' file first; one written with an extension means
        // that file first. A folder that matches no candidate leaves the target
        // unresolved rather than falling back to any same-basename file.
        const lower = clean.toLowerCase()
        const suffixes = hasExtension ? [lower, `${lower}.md`] : [`${lower}.md`, lower]
        for (const suffix of suffixes) {
          const hit = candidates.find((c) => {
            const path = c.file.path.toLowerCase()
            return path === suffix || (!anchored && path.endsWith(`/${suffix}`))
          })
          if (hit) return hit
        }
        return null
      }
      // Shortest path wins on ambiguity, matching Obsidian's default.
      return [...candidates].sort((a, b) => a.file.path.length - b.file.path.length)[0] ?? null
    }

    return pick(exact) ?? pick(loose) ?? pick(bare)
  }
}

/**
 * Resolve link targets to vault paths and populate backlinks, in place, over
 * an already-built index. Shared by `scanVault` and `createVaultIndex`.
 */
export function resolveVaultLinks(index: VaultIndex): void {
  const resolve = createLinkResolver(index)
  for (const note of index.notes) {
    for (const ref of [...note.links, ...note.embeds]) {
      const resolved = resolve(ref.target, note)
      if (resolved) {
        ref.path = resolved.file.path
        if (resolved !== note && !resolved.backlinks.includes(note.file.path)) {
          resolved.backlinks.push(note.file.path)
        }
      }
    }
  }
}
