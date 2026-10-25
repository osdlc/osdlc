/**
 * The saved view: the last catalog a repository showed, in one file, so the
 * terminal UI and the web view can draw it before reading anything else.
 *
 * Reading the stored probes (`readCachedCatalog`) detects the project and
 * hashes every runner's files, which takes seconds on a large repository.
 * This file needs neither. It is not checked against the files: a surface
 * draws it, then probes. It is used only when it was saved under the same
 * {@link viewKey}, so a change of trust or settings never shows rows another
 * state produced.
 *
 * Layout: `<cache>/views/v<VIEW_FORMAT_VERSION>/<basename>-<hash>.json`.
 */

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

import { atomicWriteAsync } from '@osdlc/etag-write'
import type { Catalog } from '@osdlc/system-model/detect'

import type { CacheState } from './session.ts'
import type { SkillRow } from './skills.ts'

const VIEW_FORMAT_VERSION = 1

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

/** The file for `root` under `store`. */
export function viewPath(store: string, root: string): string {
  const digest = createHash('sha256').update(root).digest('hex').slice(0, 16)
  const name = (basename(root) || 'root').replace(/[^A-Za-z0-9._-]/g, '-')
  return join(store, 'views', `v${VIEW_FORMAT_VERSION}`, `${name}-${digest}.json`)
}

/** Everything that changes which rows a probe returns, as one string. */
export function viewKey(parts: Record<string, unknown>): string {
  return JSON.stringify(parts)
}

/** The view saved for `root` under `key`, or null. Never throws. */
export async function readView(
  store: string,
  root: string,
  key: string,
): Promise<SavedView | null> {
  try {
    const view = JSON.parse(await readFile(viewPath(store, root), 'utf8')) as SavedView
    if (view.version !== VIEW_FORMAT_VERSION || view.key !== key) return null
    if (typeof view.savedAt !== 'number' || view.catalog?.root !== root) return null
    return view
  } catch {
    return null
  }
}

/** Save the view. A failed write only makes the next first paint slower. */
export async function writeView(store: string, view: Omit<SavedView, 'version'>): Promise<void> {
  try {
    const data = JSON.stringify({ version: VIEW_FORMAT_VERSION, ...view })
    await atomicWriteAsync(viewPath(store, view.catalog.root), data, { mode: 0o600 })
  } catch {
    // Nothing to do: the stored probes are still there.
  }
}
