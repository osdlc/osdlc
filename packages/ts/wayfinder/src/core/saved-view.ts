/**
 * The saved view: the last catalog a repository showed, in one file, so the
 * terminal UI and the web view can draw it before reading anything else.
 *
 * Reading the stored probes (`readCachedCatalog`) detects the project and
 * hashes every runner's files, which takes seconds on a large repository.
 * This file needs neither. It is not checked against the files: a surface
 * draws it, then probes, and a task from it is probed again before it runs
 * (`Session.confirmRun`). It is used only when it was saved under the same
 * {@link viewKey}, so a change of trust or settings never shows rows another
 * state produced. Each key has its own file, so a `--no-exec` script does not
 * replace the view a UI draws.
 *
 * Layout: `<cache>/views/v<VIEW_FORMAT_VERSION>/<basename>-<root hash>-<key hash>.json`.
 */

import { createHash } from 'node:crypto'
import { lstat, readFile, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'

import { atomicWriteAsync } from '@osdlc/etag-write'
import type { Catalog } from '@osdlc/system-model/detect'
import { z } from 'zod'

import { CacheStateZ, CatalogZ, SkillZ } from '../documents.ts'
import type { CacheState } from './session.ts'
import type { SkillRow } from './skills.ts'

const VIEW_FORMAT_VERSION = 1

/**
 * A view file larger than this is not read. The largest catalog measured, of
 * a repository with 30,000 files and 2,000 tasks, is about 1.3 MB.
 */
export const MAX_VIEW_BYTES = 32 * 1024 * 1024

/** What the file holds. */
export interface SavedView {
  version: number
  /** The {@link viewKey} it was saved under. */
  key: string
  /** When it was saved, in ms since the epoch. */
  savedAt: number
  catalog: Catalog
  cache: CacheState[]
  skills: SkillRow[]
  /** Each runner's trust scopes, as the last probe saw them. */
  scopes: Record<string, string[]>
}

const SavedViewZ = z.object({
  version: z.literal(VIEW_FORMAT_VERSION),
  key: z.string(),
  savedAt: z.number().finite(),
  catalog: CatalogZ,
  cache: z.array(CacheStateZ),
  skills: z.array(SkillZ),
  scopes: z.record(z.string(), z.array(z.string())),
})

const hash = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 16)

/** The file for `root` under `store`, for the view saved under `key`. */
export function viewPath(store: string, root: string, key: string): string {
  const name = (basename(root) || 'root').replace(/[^A-Za-z0-9._-]/g, '-')
  return join(store, 'views', `v${VIEW_FORMAT_VERSION}`, `${name}-${hash(root)}-${hash(key)}.json`)
}

/** Everything that changes which rows a probe returns, as one string. */
export function viewKey(parts: Record<string, unknown>): string {
  return JSON.stringify(parts)
}

/**
 * The view saved for `root` under `key`, or null. A file that is too large,
 * not valid JSON, not a view, or not a plain file (a symlink is not
 * followed) is deleted, so the next read goes to the store at once. Never
 * throws.
 */
export async function readView(
  store: string,
  root: string,
  key: string,
): Promise<SavedView | null> {
  const file = viewPath(store, root, key)
  // A write this process started is finished first, so a read after a
  // catalog() call sees what that call showed.
  await writing.get(file)
  const discard = async (): Promise<null> => {
    await rm(file, { force: true }).catch(() => {})
    return null
  }
  try {
    const info = await lstat(file).catch(() => null)
    if (info === null) return null
    if (!info.isFile() || info.size > MAX_VIEW_BYTES) return discard()
    let raw: unknown
    try {
      raw = JSON.parse(await readFile(file, 'utf8'))
    } catch {
      return discard()
    }
    const parsed = SavedViewZ.safeParse(raw)
    if (!parsed.success) return discard()
    const view = parsed.data as SavedView
    if (view.key !== key || view.catalog.root !== root) return null
    return view
  } catch {
    return null
  }
}

/** The writes this process has in flight, by file. */
const writing = new Map<string, Promise<void>>()

/**
 * Settles when every view write this process started has ended. Call it
 * before `process.exit`, which would drop a write in flight, and before a
 * test removes the cache directory.
 */
export async function flushViews(): Promise<void> {
  while (writing.size > 0) await Promise.all(writing.values())
}

/**
 * Save the view, without waiting: the caller answers first. A failed write
 * only makes the next first paint slower. The returned promise settles when
 * the file is written, for a caller that must wait.
 */
export function writeView(store: string, view: Omit<SavedView, 'version'>): Promise<void> {
  const file = viewPath(store, view.catalog.root, view.key)
  const previous = writing.get(file) ?? Promise.resolve()
  const done = previous
    .then(() =>
      atomicWriteAsync(file, JSON.stringify({ version: VIEW_FORMAT_VERSION, ...view }), {
        mode: 0o600,
      }),
    )
    .catch(() => {
      // Nothing to do: the stored probes are still there.
    })
    .finally(() => {
      if (writing.get(file) === done) writing.delete(file)
    })
  writing.set(file, done)
  return done
}
