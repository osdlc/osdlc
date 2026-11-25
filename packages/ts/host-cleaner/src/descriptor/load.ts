/**
 * Where descriptors come from, and which one of a name a run uses. There are
 * three sources, and each file's name, less its extension, is its plugin name:
 *
 *   shipped  `descriptors/` in the package: the reviewed set
 *   user     `descriptors/` in the config folder ({@link descriptorsDir})
 *   flag     each `--descriptor <file>`, for this run only
 *
 * A user file replaces a shipped one of the same name, and a `--descriptor`
 * replaces either. Any other clash is a problem: two files of one name in one
 * source, or a descriptor named as a built-in plugin, since every plugin has
 * one name in one namespace. Only the file a name ends up with is read, so a
 * user file can stand in for a shipped one that no longer parses, or for two
 * of one name.
 */

import { readdirSync, statSync, type Dirent } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { realOr } from '../helpers.ts'
import { DescriptorError, PLUGIN_NAME, readDescriptor, type Descriptor } from './schema.ts'

/** The package's own descriptors: `descriptors/` beside `src/` and `dist/`. */
export const SHIPPED_DESCRIPTORS = fileURLToPath(new URL('../../descriptors/', import.meta.url))

/** The extensions read in a descriptor folder; the reader takes YAML and JSON. */
const DESCRIPTOR_EXTENSIONS = ['.yaml', '.yml', '.json'] as const

export type DescriptorSource = 'shipped' | 'user' | 'flag'

export interface DescriptorSources {
  /** The shipped folder. Default: {@link SHIPPED_DESCRIPTORS}. */
  shipped?: string | undefined
  /** The user's folder; none when undefined. */
  user?: string | undefined
  /** `--descriptor` files, as absolute paths. */
  flag?: readonly string[] | undefined
}

/** The descriptor a run uses for one name. */
export interface LoadedDescriptor {
  name: string
  source: DescriptorSource
  path: string
  /** The file this one replaced: a shipped one, or for `--descriptor` the one the name had. */
  replaces?: { source: DescriptorSource; path: string }
  descriptor: Descriptor
}

/** Descriptors that can't be used together: a clash of names, or a file name that is no plugin name. */
export class DescriptorLoadError extends Error {
  override name = 'DescriptorLoadError'
}

/** A name whose descriptor can't be used, and why. */
export interface DescriptorProblem {
  /** The file's name less its extension: the plugin name it would have. */
  name: string
  path: string
  error: DescriptorError | DescriptorLoadError
}

/** The descriptors a run can use, and the names whose file can't be used. */
export interface FoundDescriptors {
  descriptors: LoadedDescriptor[]
  problems: DescriptorProblem[]
}

type Found = Pick<LoadedDescriptor, 'name' | 'source' | 'path'>

const nameOf = (path: string): string => basename(path, extname(path))

const hasDescriptorExtension = (path: string): boolean =>
  (DESCRIPTOR_EXTENSIONS as readonly string[]).includes(extname(path).toLowerCase())

const problem = (path: string, message: string): DescriptorProblem => ({
  name: nameOf(path),
  path,
  error: new DescriptorLoadError(message),
})

/** Whether `a` and `b` are one descriptor: the same file by real path, under the same name. */
export const sameDescriptor = (a: string, b: string): boolean =>
  nameOf(a) === nameOf(b) && realOr(a) === realOr(b)

/**
 * The `--descriptor` files, each descriptor once (see {@link sameDescriptor});
 * one without one of {@link DESCRIPTOR_EXTENSIONS} is a problem.
 */
function flagFiles(paths: readonly string[]): { files: string[]; problems: DescriptorProblem[] } {
  const unique = paths.filter((p, i) => paths.findIndex((q) => sameDescriptor(p, q)) === i)
  return {
    files: unique.filter(hasDescriptorExtension),
    problems: unique
      .filter((p) => !hasDescriptorExtension(p))
      .map((p) =>
        problem(
          p,
          `descriptor ${p}: not a descriptor file; use ${DESCRIPTOR_EXTENSIONS.join(', ')}`,
        ),
      ),
  }
}

/** Whether `e` is a file, or a link to one; a dangling link is none. */
function isFile(path: string, e: Dirent): boolean {
  if (!e.isSymbolicLink()) return e.isFile()
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/**
 * The descriptor files in `dir`: files, or links to files, with one of
 * {@link DESCRIPTOR_EXTENSIONS} in any case, not hidden. A missing folder has none.
 *
 * @throws DescriptorLoadError for a folder that can't be read
 */
function filesIn(dir: string): string[] {
  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw new DescriptorLoadError(
      `cannot read the descriptor folder ${dir}: ${(err as Error).message}`,
    )
  }
  return entries
    .filter(
      (e) =>
        !e.name.startsWith('.') && hasDescriptorExtension(e.name) && isFile(join(dir, e.name), e),
    )
    .map((e) => join(dir, e.name))
    .sort()
}

/** `paths` as descriptors of `source`, in order; a name that is no plugin name, or that two paths share, is a problem. */
function foundIn(
  paths: readonly string[],
  source: DescriptorSource,
): Array<Found | DescriptorProblem> {
  const byName = new Map<string, Found | DescriptorProblem>()
  for (const path of paths) {
    const name = nameOf(path)
    const twin = byName.get(name)
    if (!PLUGIN_NAME.test(name)) {
      byName.set(
        name,
        problem(
          path,
          `descriptor ${path}: "${name}" is not a plugin name: lowercase letters, digits and -, starting with a letter`,
        ),
      )
    } else if (twin !== undefined) {
      byName.set(
        name,
        problem(path, `${twin.path} and ${path} are both the descriptor ${name}; keep one`),
      )
    } else {
      byName.set(name, { name, source, path })
    }
  }
  return [...byName.values()]
}

const isProblem = (f: Found | DescriptorProblem): f is DescriptorProblem => 'error' in f

/**
 * The descriptors a run uses, sorted by name: the shipped ones, each replaced
 * by a user file of the same name, then each replaced by a `--descriptor` file
 * of the same name. A name whose file can't be used is a problem, not an
 * error, so a run that leaves that name out can go on.
 *
 * Problems: a descriptor named as a built-in plugin, two files of one name in
 * one source, a file name that is no plugin name, a `--descriptor` file that is
 * not YAML or JSON by its extension, a file that can't be read or is not a descriptor.
 *
 * @throws DescriptorLoadError for a descriptor folder that can't be read
 */
export function findDescriptors(
  sources: DescriptorSources,
  builtIns: readonly string[],
): FoundDescriptors {
  const flag = flagFiles(sources.flag ?? [])
  const layers = [
    foundIn(filesIn(sources.shipped ?? SHIPPED_DESCRIPTORS), 'shipped'),
    sources.user === undefined ? [] : foundIn(filesIn(sources.user), 'user'),
    [...foundIn(flag.files, 'flag'), ...flag.problems],
  ]
  const chosen = new Map<string, Omit<LoadedDescriptor, 'descriptor'> | DescriptorProblem>()
  for (const layer of layers) {
    for (const f of layer) {
      const before = chosen.get(f.name)
      if (isProblem(f)) {
        chosen.set(f.name, f)
      } else if (builtIns.includes(f.name)) {
        chosen.set(
          f.name,
          problem(
            f.path,
            `descriptor ${f.path} is named ${f.name}, as the built-in plugin; every plugin has its own name, so rename the file`,
          ),
        )
      } else {
        chosen.set(
          f.name,
          before === undefined || isProblem(before)
            ? f
            : { ...f, replaces: { source: before.source, path: before.path } },
        )
      }
    }
  }
  const descriptors: LoadedDescriptor[] = []
  const problems: DescriptorProblem[] = []
  for (const f of [...chosen.values()].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  )) {
    if (isProblem(f)) {
      problems.push(f)
      continue
    }
    try {
      descriptors.push({ ...f, descriptor: readDescriptor(f.path) })
    } catch (err) {
      if (!(err instanceof DescriptorError)) throw err
      problems.push({ name: f.name, path: f.path, error: err })
    }
  }
  return { descriptors, problems }
}

/**
 * {@link findDescriptors}, with no problem allowed.
 *
 * @throws DescriptorLoadError for a descriptor named as a built-in plugin, two
 *   files of one name in one source, a file name that is no plugin name, or a
 *   `--descriptor` file that is not YAML or JSON by its extension
 * @throws DescriptorError for a file the run uses that can't be read or is not a descriptor
 */
export function loadDescriptors(
  sources: DescriptorSources,
  builtIns: readonly string[],
): LoadedDescriptor[] {
  const { descriptors, problems } = findDescriptors(sources, builtIns)
  if (problems[0] !== undefined) throw problems[0].error
  return descriptors
}
