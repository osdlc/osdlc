/**
 * Where descriptors come from, and which one of a name a run uses. There are
 * three sources, and each file's name, less its extension, is its plugin name:
 *
 *   shipped  `descriptors/` in the package: the reviewed set
 *   user     `descriptors/` in the config folder ({@link descriptorsDir})
 *   flag     each `--descriptor <file>`, for this run only
 *
 * Which file wins, and which clashes are errors: {@link loadDescriptors}. Only
 * the file a name ends up with is read, so a user file can stand in for a
 * shipped one that no longer parses.
 */

import { readdirSync, type Dirent } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { readDescriptor, type Descriptor } from './schema.ts'

/** The package's own descriptors: `descriptors/` beside `src/` and `dist/`. */
export const SHIPPED_DESCRIPTORS = fileURLToPath(new URL('../../descriptors/', import.meta.url))

/** The extensions read in a descriptor folder; the reader takes YAML and JSON. */
const DESCRIPTOR_EXTENSIONS = ['.yaml', '.yml', '.json'] as const

/** What a descriptor's name, its file name less the extension, must look like: the plugin-name pattern of `supersededBy` in ./schema.ts. */
const NAME = /^[a-z][a-z0-9-]*$/

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

interface Found {
  name: string
  source: DescriptorSource
  path: string
}

const nameOf = (path: string): string => basename(path, extname(path))

/**
 * The descriptor files in `dir`, by name: entries with one of
 * {@link DESCRIPTOR_EXTENSIONS}, not hidden, not folders. A missing folder has none.
 *
 * @throws DescriptorLoadError for a folder that can't be read, two files of one name, or a name that is no plugin name
 */
function filesIn(dir: string, source: DescriptorSource): Found[] {
  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw new DescriptorLoadError(
      `cannot read the descriptor folder ${dir}: ${(err as Error).message}`,
    )
  }
  const files = entries
    .filter(
      (e) =>
        !e.isDirectory() &&
        !e.name.startsWith('.') &&
        (DESCRIPTOR_EXTENSIONS as readonly string[]).includes(extname(e.name)),
    )
    .map((e) => join(dir, e.name))
    .sort()
  return files.map((path) => found(path, source, files))
}

function found(path: string, source: DescriptorSource, all: readonly string[]): Found {
  const name = nameOf(path)
  if (!NAME.test(name)) {
    throw new DescriptorLoadError(
      `descriptor ${path}: "${name}" is not a plugin name: lowercase letters, digits and -, starting with a letter`,
    )
  }
  const twins = all.filter((p) => nameOf(p) === name)
  if (twins.length > 1) {
    throw new DescriptorLoadError(
      `${twins.join(' and ')} are both the descriptor ${name}; keep one`,
    )
  }
  return { name, source, path }
}

/**
 * The descriptors a run uses, sorted by name: the shipped ones, each replaced
 * by a user file of the same name, then each replaced by a `--descriptor` file
 * of the same name. `reserved` are the built-in plugins' names.
 *
 * @throws DescriptorLoadError for a descriptor named as a built-in plugin, two
 *   files of one name in one source, a file name that is no plugin name, or a
 *   folder that can't be read
 * @throws DescriptorError for a file the run uses that can't be read or is not a descriptor
 */
export function loadDescriptors(
  sources: DescriptorSources,
  reserved: readonly string[],
): LoadedDescriptor[] {
  const flag = sources.flag ?? []
  const layers = [
    filesIn(sources.shipped ?? SHIPPED_DESCRIPTORS, 'shipped'),
    sources.user === undefined ? [] : filesIn(sources.user, 'user'),
    flag.map((path) => found(path, 'flag', flag)),
  ]
  const chosen = new Map<string, Found & { replaces?: Found }>()
  for (const layer of layers) {
    for (const f of layer) {
      if (reserved.includes(f.name)) {
        throw new DescriptorLoadError(
          `descriptor ${f.path} is named ${f.name}, as the built-in plugin; every plugin has its own name, so rename the file`,
        )
      }
      const before = chosen.get(f.name)
      chosen.set(f.name, before === undefined ? f : { ...f, replaces: before })
    }
  }
  return [...chosen.values()]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((f) => ({
      name: f.name,
      source: f.source,
      path: f.path,
      ...(f.replaces === undefined
        ? {}
        : { replaces: { source: f.replaces.source, path: f.replaces.path } }),
      descriptor: readDescriptor(f.path),
    }))
}
