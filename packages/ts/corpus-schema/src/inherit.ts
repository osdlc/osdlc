/**
 * Finding the corpora a corpus names (the corpus-schema spec's Extends and References sections,
 * packages/conformance/corpus-schema/SPEC.md): resolving an `extends` or `references` source to a
 * folder, and listing the files of a `_references/` copy.
 */
import { type Dirent, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'

/** The folder at a corpus's root that holds the copies of the corpora it references. */
export const REFERENCES = '_references'
/** A prefix in `extends` or `references`: lowercase letters, digits and `-`. */
export const PREFIX = /^[a-z0-9-]+$/
/** What ends a root file's name: `<name>.corpus-schema.md`, `.yaml` or `.json`. */
export const ROOT_SUFFIXES = ['.corpus-schema.md', '.corpus-schema.yaml', '.corpus-schema.json']
/** A corpus's name, the `<name>` of its root file: lowercase letters, digits and `-`. */
export const CORPUS_NAME = /^[a-z0-9-]+$/

/** The `<name>` part of a root file's name, or undefined when `file` is not a root file's name. */
export function rootName(file: string): string | undefined {
  const suffix = ROOT_SUFFIXES.find((s) => file.endsWith(s) && file.length > s.length)
  return suffix === undefined ? undefined : file.slice(0, -suffix.length)
}

const PACKAGE_NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/

/** `s` on one line, so each problem stays one line. */
export const oneLine = (s: string): string => s.replace(/\s*\r?\n\s*/g, ' ').trim()
/** Why a file or folder could not be read or written: its error code, such as EACCES, or the message. */
export const whyFailed = (e: unknown): string =>
  (e as NodeJS.ErrnoException).code ?? oneLine((e as Error).message)

export const skipped = (name: string): boolean => name.startsWith('.') || name === 'node_modules'
export const entries = (abs: string): Dirent[] => readdirSync(abs, { withFileTypes: true })
// Exact names: existsSync ignores case on macOS and Windows.
export const hasRootFile = (names: Dirent[]): boolean =>
  names.some((d) => d.isFile() && rootName(d.name) !== undefined)

const isDir = (abs: string): boolean => {
  try {
    return statSync(abs).isDirectory()
  } catch {
    return false
  }
}

/** The folder a package named `name` is installed in, found as Node finds it from `root`. */
function findPackage(root: string, name: string): string | undefined {
  // createRequire takes only an absolute path.
  const paths = createRequire(join(resolve(root), 'package.json')).resolve.paths(name) ?? []
  return paths.map((p) => join(p, name)).find((dir) => isDir(dir))
}

/** A package's name and version, which identify a corpus. `version` is undefined when none is given. */
export interface PackageId {
  name: string
  version: string | undefined
}

/** The folder a source names. */
export interface Resolved {
  dir: string
}

/**
 * The corpus folder an `extends` or `references` source names, from the corpus at `root`, as a
 * real path. A source starting `./` or `../` is a path from `root`. Anything else is a package
 * name: the package's folder, or the folder its package.json's `corpus` field names. The folder
 * must hold a root file.
 */
export function resolveSource(root: string, source: string): Resolved | { problem: string } {
  let dir: string
  if (source.startsWith('./') || source.startsWith('../')) {
    dir = resolve(root, source)
    if (!isDir(dir)) return { problem: `${source}: no such folder` }
  } else {
    if (!PACKAGE_NAME.test(source))
      return { problem: `${source}: not a package name, nor a path starting ./ or ../` }
    const pkg = findPackage(root, source)
    if (pkg === undefined) return { problem: `package ${source} is not installed` }
    let corpus: unknown
    try {
      corpus = (JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')) as { corpus?: unknown })
        .corpus
    } catch (e) {
      // A package with no package.json has no corpus field.
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
        return { problem: `package ${source}: cannot read its package.json (${whyFailed(e)})` }
    }
    if (corpus !== undefined && (typeof corpus !== 'string' || corpus === ''))
      return { problem: `package ${source}: its "corpus" field must be a folder path` }
    dir = corpus === undefined ? pkg : resolve(pkg, corpus)
    if (!isDir(dir)) return { problem: `package ${source}: its "corpus" folder does not exist` }
  }
  dir = realpathSync(dir)
  let names: Dirent[]
  try {
    names = entries(dir)
  } catch {
    return { problem: `${source}: cannot read folder` }
  }
  if (!hasRootFile(names)) return { problem: `${source}: holds no corpus-schema root file` }
  return { dir }
}

/**
 * The package the corpus at `root` is, or null: the nearest package.json at or above `root`, when
 * it has a name and its `corpus` field, or its own folder when it has none, is `root`. It does not
 * matter how the corpus was reached, so an npm alias still gives the package's own name.
 */
export function rootPackage(root: string): PackageId | null {
  let real: string
  try {
    real = realpathSync(root)
  } catch {
    return null
  }
  for (let dir = real; ; dir = dirname(dir)) {
    let json: { name?: unknown; version?: unknown; corpus?: unknown }
    try {
      json = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as typeof json
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT' && dirname(dir) !== dir) continue
      return null
    }
    if (typeof json.name !== 'string') return null
    const corpus = typeof json.corpus === 'string' && json.corpus !== '' ? json.corpus : '.'
    let at: string
    try {
      at = realpathSync(resolve(dir, corpus))
    } catch {
      return null
    }
    if (at !== real) return null
    return { name: json.name, version: typeof json.version === 'string' ? json.version : undefined }
  }
}

/** Whether the files at `a` and `b` hold the same bytes. False when either cannot be read. */
export const sameBytes = (a: string, b: string): boolean => {
  try {
    return readFileSync(a).equals(readFileSync(b))
  } catch {
    return false
  }
}

/**
 * Every file at or below `abs`, relative and with `/`, sorted. Paths with a `.` component or
 * `node_modules`, and symbolic links, are left out, as from a corpus. A folder that cannot be read
 * is left out too.
 */
export function listFiles(abs: string): string[] {
  const out: string[] = []
  const visit = (rel: string): void => {
    let names: Dirent[]
    try {
      names = entries(join(abs, rel))
    } catch {
      return
    }
    for (const d of names) {
      if (skipped(d.name)) continue
      const path = rel === '' ? d.name : `${rel}/${d.name}`
      if (d.isFile()) out.push(path)
      else if (d.isDirectory()) visit(path)
    }
  }
  visit('')
  return out.sort()
}
