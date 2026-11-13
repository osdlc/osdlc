/**
 * The `sync` verb of the corpus-schema spec (packages/conformance/corpus-schema/SPEC.md): write
 * a copy of each corpus a corpus references into `_references/<prefix>/`.
 */
import {
  copyFileSync,
  type Dirent,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
} from 'node:fs'
import { dirname, extname, join } from 'node:path'

import {
  entries,
  REFERENCES,
  listFiles,
  resolveSource,
  rootName,
  sameBytes,
  whyFailed,
} from './inherit.ts'
import { copyFiles, type Data, load, readData } from './validate.ts'

/** What `syncCorpus` did to one corpus. */
export interface SyncReport {
  /** The corpus folder, as passed to `syncCorpus`. */
  root: string
  /** The corpus's name: the `<name>` of its root file, or its folder name when it has none. */
  name: string
  /** The corpus-relative paths of the files written under `_references/`. */
  written: string[]
  /** The corpus-relative paths of the files removed from `_references/`. */
  removed: string[]
  /**
   * One line per error, in the form `validateCorpus` uses. With an error in the root file, a corpus
   * it names that does not resolve or has errors, or `_references/` itself a symbolic link, nothing
   * is written.
   */
  errors: string[]
}

const isLink = (abs: string): boolean => {
  try {
    return lstatSync(abs).isSymbolicLink()
  } catch {
    return false
  }
}

const isDir = (abs: string): boolean => {
  try {
    return lstatSync(abs).isDirectory()
  } catch {
    return false
  }
}

/** The first part of `rel`'s path under `base` that is a symbolic link, as `_references/...`. */
function linkOnPath(base: string, rel: string): string | undefined {
  const parts = rel.split('/')
  for (let i = 1; i <= parts.length; i++) {
    const sub = parts.slice(0, i).join('/')
    if (isLink(join(base, sub))) return `${REFERENCES}/${sub}`
  }
  return undefined
}

/** Remove each empty folder at or below `abs`, deepest first. Symbolic links are not followed. */
function pruneEmpty(abs: string): void {
  let names: Dirent[]
  try {
    names = entries(abs)
  } catch {
    return
  }
  for (const d of names) if (d.isDirectory()) pruneEmpty(join(abs, d.name))
  try {
    if (readdirSync(abs).length === 0) rmdirSync(abs)
  } catch {
    // A file, or a folder that cannot be read: left as it is.
  }
}

/**
 * Make the corpus at `root` hold a copy of each corpus its root file's `references` names, in
 * `_references/<prefix>/`: that corpus's files and its own `_references/`, byte for byte. Files
 * under `_references/` that no reference holds are removed. A second run changes nothing. Only
 * `_references/` is written: a symbolic link in it is an error, and is not followed. `extends`
 * gives types only, so its parents are not copied.
 *
 * Every problem is a line in the report's `errors`, never a throw. When the root file has an error,
 * or a corpus it names does not resolve or has errors of its own, nothing is written.
 */
export function syncCorpus(root: string): SyncReport {
  const c = load(root)
  const report: SyncReport = { root, name: c.name, written: [], removed: [], errors: [...c.fatal] }
  if (c.fatal.length > 0) return report

  const base = join(root, REFERENCES)
  const linked = `: (symlink): sync does not write through a symbolic link; remove it`
  if (isLink(base)) {
    report.errors.push(`${REFERENCES}${linked}`)
    return report
  }
  const wanted = new Map<string, string>()
  for (const [prefix, ref] of c.references)
    for (const f of copyFiles(ref)) wanted.set(`${prefix}/${f}`, join(ref.root, f))

  for (const f of listFiles(base)) {
    if (wanted.has(f)) continue
    try {
      rmSync(join(base, f))
      report.removed.push(`${REFERENCES}/${f}`)
    } catch (e) {
      report.errors.push(`${REFERENCES}/${f}: (file): cannot remove (${whyFailed(e)})`)
    }
  }
  // A parent that turned a folder into a file leaves that folder empty here, or holding only
  // files a corpus skips, such as `.DS_Store`.
  pruneEmpty(base)
  const links = new Set<string>()
  for (const [f, from] of [...wanted].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const to = join(base, f)
    const link = linkOnPath(base, f)
    if (link !== undefined) {
      if (!links.has(link)) report.errors.push(`${link}${linked}`)
      links.add(link)
      continue
    }
    if (sameBytes(from, to)) continue
    try {
      if (isDir(to)) rmSync(to, { recursive: true })
      mkdirSync(dirname(to), { recursive: true })
      copyFileSync(from, to)
      report.written.push(`${REFERENCES}/${f}`)
    } catch (e) {
      report.errors.push(`${REFERENCES}/${f}: (file): cannot write (${whyFailed(e)})`)
    }
  }
  pruneEmpty(base)
  return report
}

/**
 * The real paths of the corpora the corpus at `root` names in `extends` or `references` that
 * resolve. Reads only the root file, to order a `sync` of several corpora: a parent is checked as
 * the corpus loads, so its copy must be fresh too.
 */
export function namedRoots(root: string): string[] {
  let data: Data
  try {
    const file = readdirSync(root)
      .sort()
      .find((f) => rootName(f) !== undefined)
    if (file === undefined) return []
    data = readData(readFileSync(join(root, file), 'utf8'), extname(file))
  } catch {
    return []
  }
  return (['extends', 'references'] as const).flatMap((key) => {
    const map = data[key]
    if (map === null || typeof map !== 'object') return []
    return Object.values(map).flatMap((source) => {
      const r = typeof source === 'string' ? resolveSource(root, source) : undefined
      return r !== undefined && 'dir' in r ? [r.dir] : []
    })
  })
}
