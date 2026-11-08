import type { Dirent } from 'node:fs'
import { readdirSync, realpathSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** A regular file found by {@link walkFiles}. */
export interface WalkedFile {
  /** `/`-separated path relative to the walked root. */
  rel: string
  /** Path to read it through, following any links on the way. */
  full: string
}

/**
 * List the regular files under `root`, skipping dot entries. Every symlink is
 * stat'ed: one that resolves to a directory is followed, one that resolves to
 * a regular file is listed, and a dangling or other link is skipped. Each real
 * directory is walked once, so a loop ends and a folder reachable through two
 * links is listed under the first path that reached it (entries are visited
 * in name order, so that is the same on every machine). A file reachable
 * through two paths is listed once. A folder that cannot be read for want of
 * permission is skipped; any other I/O error is thrown, so a caller never
 * acts on a partial listing.
 */
const SKIPPABLE = new Set(['ENOENT', 'EACCES', 'EPERM'])
const DANGLING = new Set(['ENOENT', 'ENOTDIR', 'ELOOP', 'EACCES', 'EPERM'])

function skippable(err: unknown, codes: ReadonlySet<string>): boolean {
  return codes.has((err as NodeJS.ErrnoException).code ?? '')
}

export function walkFiles(root: string): WalkedFile[] {
  const out: WalkedFile[] = []
  const visited = new Set<string>()
  const seenFiles = new Set<string>()
  const walk = (dir: string, prefix: string): void => {
    let real: string
    let entries: Dirent[]
    try {
      real = realpathSync(dir)
      entries = readdirSync(dir, { withFileTypes: true })
    } catch (err) {
      if (skippable(err, SKIPPABLE)) return // unreadable, or gone since it was listed
      throw err
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    if (visited.has(real)) return
    visited.add(real)
    for (const ent of entries) {
      if (ent.name.startsWith('.')) continue // .obsidian, .git, .trash
      const full = join(dir, ent.name)
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name
      let isDir = ent.isDirectory()
      let isFile = ent.isFile()
      if (ent.isSymbolicLink()) {
        try {
          const st = statSync(full)
          isDir = st.isDirectory()
          isFile = st.isFile()
        } catch (err) {
          if (skippable(err, DANGLING)) continue // dangling, looping or unreadable link
          throw err
        }
      }
      if (isDir) walk(full, rel)
      else if (isFile) {
        const realFile = ent.isSymbolicLink() ? realpathSync(full) : join(real, ent.name)
        if (seenFiles.has(realFile)) continue
        seenFiles.add(realFile)
        out.push({ rel, full })
      }
    }
  }
  walk(root, '')
  return out
}
