/**
 * The family file `repositories.yaml`: where it is, and reading and writing
 * it.
 *
 * It sits directly in the osdlc config home (`~/.config/osdlc/` on Linux and
 * macOS with no variable set), because more than one tool reads it. Every
 * tool reads and writes it through this module, over config-layers'
 * `machineConfigFile`, so every tool parses it the same way and a write is a
 * compare-and-swap, made under a lock so two processes cannot both pass it.
 */

import { existsSync, mkdirSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'

import {
  machineConfigFile,
  setPath,
  type MachineConfigIssue,
  type TieredDirs,
} from '@osdlc/config-layers'
import { WriteConflictError } from '@osdlc/etag-write'
import { holderGone, withLock } from '@osdlc/file-lock'
import { expandTilde } from '@osdlc/tiered-dirs'
import { z } from 'zod'

import { OSDLC_VENDOR_DIRS, osdlcDirs, type OsdlcDirsOptions } from '../index.ts'

/**
 * Thrown by {@link RepositoriesFile.writeRoots} when the file changed since
 * the caller read it. Re-exported from `@osdlc/etag-write`, so a caller needs
 * no import of its own to catch it.
 */
export { WriteConflictError }

/** The variable that moves `repositories.yaml`. Its value must be an absolute path. */
export const REPOSITORIES_ENV = 'OSDLC_REPOSITORIES'

/** The file's name in the osdlc config home. */
export const REPOSITORIES_FILE = 'repositories.yaml'

/**
 * The file's schema. Strict, so a misspelt key is reported, not silently
 * ignored. Every key is optional: a file without `roots` means "use the
 * default roots", which is not the same as `roots: []`.
 */
const RepositoriesSchema = z.strictObject({ roots: z.array(z.string()).optional() })

/** `repositories.yaml` as read: every key optional, unknown keys dropped. */
export interface Repositories {
  /** Directories to scan for checkouts, as written: absolute, or starting `~`. */
  roots?: string[] | undefined
}

/**
 * Options for {@link repositoriesFile}.
 *
 * `env`, `home` and `dirs` place the osdlc directories and expand `~`.
 * `OSDLC_REPOSITORIES` is read from `process.env` whatever is given, since
 * config-layers' `machineConfigFile` reads it there, so a test clears it.
 */
export interface RepositoriesFileOptions extends OsdlcDirsOptions {
  /** The osdlc directories. Defaults to {@link osdlcDirs} over `env` and `home`. Tests pass a rooted one. */
  dirs?: (() => TieredDirs) | undefined
}

/** `repositories.yaml` as {@link RepositoriesFile.load} gives it. */
export interface RepositoriesLoad {
  /** Where the file is (it may not exist). */
  path: string
  /** Whether the file exists. */
  exists: boolean
  /** The file's value. A part that does not parse is dropped, and named in {@link issues}. */
  value: Repositories
  /** One entry for each thing the loader dropped. */
  issues: MachineConfigIssue[]
}

/** Options for {@link RepositoriesFile.writeRoots}. */
export interface WriteRootsOptions {
  /**
   * The etag {@link RepositoriesFile.read} gave, or `null` when it found no
   * file. The write throws {@link WriteConflictError}, and writes nothing,
   * when the file changed since.
   */
  etag: string | null
}

/** A handle on `repositories.yaml`. */
export interface RepositoriesFile {
  /** The variable that moves the file, {@link REPOSITORIES_ENV}. */
  readonly env: string
  /**
   * The file's path: `OSDLC_REPOSITORIES` when set, else `repositories.yaml`
   * in the osdlc config home. Throws when the variable holds a relative path,
   * since processes started in different directories would read different
   * files. Every other method calls it first.
   */
  path(): string
  /** The file's value and what was dropped from it. A missing file is `{}`. */
  load(): RepositoriesLoad
  /** The file's text and etag, to hand back to {@link writeRoots}. `null` when there is no file. */
  read(): { text: string; etag: string } | null
  /**
   * Set `roots` to `roots` and return the new etag. A compare-and-swap
   * against `etag`, made while holding `<file>.lock` (`@osdlc/file-lock`), so
   * of two processes writing over the same read, one writes and the other
   * gets {@link WriteConflictError}. Every line outside the `roots` entry stays as written,
   * comments included. Inside it the comments go: those inside the old list,
   * and the one on the `roots:` line, which the old value's trailing comment
   * (on its last item, or after a flow list) replaces. Throws when an entry is
   * not absolute, `~` or `~/…`, since the reader would drop it.
   */
  writeRoots(roots: readonly string[], opts: WriteRootsOptions): string
}

/**
 * A handle on `repositories.yaml`, through config-layers' `machineConfigFile`:
 * tool `osdlc`, the Xdg-pinned osdlc directories and `OSDLC_REPOSITORIES`.
 */
export function repositoriesFile(opts: RepositoriesFileOptions = {}): RepositoriesFile {
  const dirs = opts.dirs ?? (() => osdlcDirs(opts))
  const file = machineConfigFile({
    tool: 'osdlc',
    fileName: REPOSITORIES_FILE,
    // Passed explicitly: the default would be OSDLC_MACHINE_CONFIG, a name for every tool's file.
    env: REPOSITORIES_ENV,
    vendorDirs: OSDLC_VENDOR_DIRS,
    dirs,
    schema: RepositoriesSchema,
  })

  // machineConfigFile uses the variable as given, so a relative value is refused here.
  const path = (): string => {
    const value = process.env[REPOSITORIES_ENV]
    if (value !== undefined && value.trim() !== '' && !isAbsolute(value)) {
      throw new Error(`${REPOSITORIES_ENV} must be an absolute path to the file; it is '${value}'`)
    }
    return file.path()
  }

  const read = (): { text: string; etag: string } | null => {
    path()
    return file.read()
  }

  return {
    env: REPOSITORIES_ENV,
    path,
    load() {
      const at = path()
      // The cache is per path; a person may edit the file between two loads in one run.
      file.clearCache()
      const { value, issues } = file.loadWithIssues()
      return { path: at, exists: existsSync(at), value, issues }
    },
    read,
    writeRoots(roots, o) {
      const at = path()
      for (const root of roots) {
        if (!isRootSpelling(root)) {
          throw new Error(
            `${at}: a root must be absolute, '~' or start with '~/'; '${root}' is none of them`,
          )
        }
      }
      // The etag check and the rename are two steps, so two writers can both pass the check.
      // The lock makes the read, the check and the write one step for every writer. It is taken
      // over only once its holder has exited, never for its age: a slow writer keeps it.
      mkdirSync(dirname(at), { recursive: true })
      return withLock(
        `${at}.lock`,
        () => {
          // setPath edits only the `roots` entry, so every other line stays as written.
          const text = setPath(read()?.text ?? '', ['roots'], [...roots])
          return file.write(text, { etag: o.etag })
        },
        { isStale: holderGone((h) => [h.pid]) },
      )
    },
  }
}

/**
 * A root as written, made absolute: `~` and `~/…` expanded against `home`.
 * `null` for anything else that is not absolute, `~user/…` included, which
 * the reader drops with a warning.
 */
export function expandRoot(root: string, home: string): string | null {
  const expanded = expandTilde(root, home)
  return isAbsolute(expanded) ? resolve(expanded) : null
}

/** Whether `root` is a root {@link expandRoot} accepts, whatever the home directory. */
function isRootSpelling(root: string): boolean {
  // Any absolute home will do: only whether the result is absolute matters.
  return expandRoot(root, resolve('/')) !== null
}
