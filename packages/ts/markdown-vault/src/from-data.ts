/**
 * Build a `VaultIndex` from externally-supplied note data instead of a
 * filesystem scan. For callers (a web client backed by an API, say) that
 * already hold per-note data (path, frontmatter, tags, links) and have no
 * directory for `scanVault` to walk.
 *
 * Reuses `frontmatterTags` and `resolveVaultLinks` from `./scan.ts` so tag
 * normalisation and link resolution match `scanVault`.
 */

import {
  frontmatterTags,
  resolveVaultLinks,
  type FileMeta,
  type LinkRef,
  type VaultIndex,
  type VaultNote,
} from './scan.ts'

/** One note's data as the caller holds it, the input of `createVaultIndex`. Only `path` is required. */
export interface ExternalNote {
  /**
   * Vault-relative path including extension, '/'-separated (e.g. 'folder/note.md').
   * Give each note its own path: when two share one, both stay in `notes` and
   * `byPath` holds the later one.
   */
  path: string
  /** Falls back into `properties.title` when frontmatter has no `title` key. */
  title?: string
  /**
   * Parsed frontmatter object, or a JSON string to parse. Invalid JSON (or a
   * JSON value that isn't a plain object) is treated as empty frontmatter —
   * mirroring `scanVault`'s malformed-YAML handling.
   */
  frontmatter?: Record<string, unknown> | string | null
  /** Unioned with any tags found in frontmatter (`tags`/`tag` keys), deduped. */
  tags?: string[]
  /** Falls back into `properties.aliases` when frontmatter has no `aliases` key. */
  aliases?: string[]
  /** Size in bytes. Default 0. */
  size?: number
  /** Modification time in milliseconds since the epoch. Default epoch. */
  mtimeMs?: number | null
  /** Creation time in milliseconds since the epoch. Default `mtimeMs`, then epoch. */
  ctimeMs?: number | null
  /** Outgoing wikilink targets as written (resolved against the supplied set when `resolveLinks` is set). */
  links?: string[]
  /** Outgoing `![[embed]]` targets as written, resolved like `links`. */
  embeds?: string[]
  /** Vault-relative paths of notes that link to this note. Default []. */
  backlinks?: string[]
}

/** Options for `createVaultIndex`. */
export interface CreateVaultIndexOptions {
  /**
   * Resolve `links`/`embeds` targets against the supplied note set (the rules
   * `scanVault` uses: exact path, then extension rules, then shortest path)
   * and invert them into `backlinks`.
   *
   * Default false: links/embeds stay unresolved (`path: null`, exactly as
   * written) and each note's `backlinks` is what was supplied, with repeats
   * dropped (default []) — no vault-wide inversion pass runs.
   */
  resolveLinks?: boolean
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function resolveFrontmatter(raw: ExternalNote['frontmatter']): Record<string, unknown> {
  if (raw == null) return {}
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw)
      return isPlainRecord(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return isPlainRecord(raw) ? raw : {}
}

/** Derive FileMeta from `path` exactly as `scanVault` derives it from a scanned file. */
function deriveFileMeta(note: ExternalNote): FileMeta {
  const vaultPath = note.path
  const lastSlash = vaultPath.lastIndexOf('/')
  const fileName = lastSlash === -1 ? vaultPath : vaultPath.slice(lastSlash + 1)
  const lastDot = fileName.lastIndexOf('.')
  const ext = lastDot === -1 ? '' : fileName.slice(lastDot + 1)
  const mtimeMs = note.mtimeMs ?? null
  const ctimeMs = note.ctimeMs ?? mtimeMs
  return {
    name: fileName,
    basename: lastDot === -1 ? fileName : fileName.slice(0, lastDot),
    path: vaultPath,
    folder: lastSlash === -1 ? '' : vaultPath.slice(0, lastSlash),
    ext,
    size: note.size ?? 0,
    // FileMeta.ctime/mtime are non-nullable Dates; a missing timestamp falls
    // back to ctimeMs->mtimeMs->epoch rather than widening the shared type.
    ctime: new Date(ctimeMs ?? 0),
    mtime: new Date(mtimeMs ?? 0),
  }
}

/**
 * Frontmatter plus `title`/`aliases` folded in when frontmatter doesn't
 * already carry those keys — so generic property access (`title`,
 * `aliases`, `note["aliases"]`) sees them exactly as it would if they'd
 * been written into the note's YAML frontmatter. Frontmatter always wins on
 * conflict.
 */
function deriveProperties(
  frontmatter: Record<string, unknown>,
  note: ExternalNote,
): Record<string, unknown> {
  const properties = { ...frontmatter }
  if (note.title !== undefined && !('title' in properties)) properties.title = note.title
  if (note.aliases && note.aliases.length > 0 && !('aliases' in properties))
    properties.aliases = note.aliases
  return properties
}

/** Union of frontmatter-derived tags and supplied tags, deduped, '#' stripped — same shape as scanVault's frontmatter+inline union. */
function deriveTags(properties: Record<string, unknown>, note: ExternalNote): string[] {
  const fromFrontmatterKeys = frontmatterTags(properties)
  const supplied = (note.tags ?? []).map((t) => t.replace(/^#/, ''))
  return [...new Set([...fromFrontmatterKeys, ...supplied])]
}

function toLinkRefs(targets: string[] | undefined): LinkRef[] {
  return (targets ?? []).map((target) => ({ target, path: null, display: null }))
}

/**
 * Build a `VaultIndex` from note data you already hold, with no file access:
 * the same shape of index `scanVault` produces, so code written against one
 * works on the other. `root` is `''`. Frontmatter given as a string is parsed
 * as JSON; invalid JSON, or a value that is not an object, gives `{}`. Links
 * stay unresolved unless `opts.resolveLinks` is set.
 */
export function createVaultIndex(
  notes: ExternalNote[],
  opts: CreateVaultIndexOptions = {},
): VaultIndex {
  const vaultNotes: VaultNote[] = notes.map((note) => {
    const frontmatter = resolveFrontmatter(note.frontmatter)
    const properties = deriveProperties(frontmatter, note)
    return {
      file: deriveFileMeta(note),
      properties,
      tags: deriveTags(properties, note),
      links: toLinkRefs(note.links),
      embeds: toLinkRefs(note.embeds),
      backlinks: [...new Set(note.backlinks ?? [])],
    }
  })

  const index: VaultIndex = {
    root: '',
    notes: vaultNotes,
    byPath: new Map(vaultNotes.map((n) => [n.file.path, n])),
  }
  if (opts.resolveLinks) resolveVaultLinks(index)
  return index
}
