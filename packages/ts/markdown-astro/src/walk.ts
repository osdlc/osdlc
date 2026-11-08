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
 * links is listed under the first path that reached it.
 */
export function walkFiles(root: string): WalkedFile[] {
  const out: WalkedFile[] = []
  const visited = new Set<string>()
  const walk = (dir: string, prefix: string): void => {
    let real: string
    let entries: Dirent[]
    try {
      real = realpathSync(dir)
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return // unreadable, or gone since it was listed
    }
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
        } catch {
          continue // dangling
        }
      }
      if (isDir) walk(full, rel)
      else if (isFile) out.push({ rel, full })
    }
  }
  walk(root, '')
  return out
}
