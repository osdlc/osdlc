/**
 * Named directories, and the `{name}` substitution over them.
 *
 * Both config files can carry a `paths:` map from name to directory. The
 * machine file's entry wins per name, since a directory is a fact about a
 * machine. Any other path-valued setting refers to an entry as `{name}`, so
 * `~/Developer` is written once however many settings need it.
 *
 * {@link resolveConfigPath} is here too. Every config path value goes through
 * it for `~` and relative-path expansion. This module imports nothing else
 * from the package, so a schema can use it without an import cycle.
 */

import { homedir } from 'node:os'
import { isAbsolute, resolve } from 'node:path'

import { z } from 'zod'

/**
 * What a `paths:` name may look like.
 *
 * @experimental
 */
export const PATH_NAME = /^[A-Za-z][A-Za-z0-9_]*$/

/**
 * Options for {@link resolveConfigPath}.
 * @experimental
 */
export interface ResolveConfigPathOptions {
  /** What a leading `~` expands to. Defaults to `$HOME`, or `os.homedir()` when `HOME` is unset or empty. An empty home leaves `~` unexpanded. */
  home?: string | undefined
}

/**
 * Expand a single config path value relative to `baseDir`.
 *
 * URLs (`scheme://…`) and bare words that do not look like paths are
 * returned unchanged, because a value may be a name rather than a place. A
 * leading `~` expands to `opts.home` (default `$HOME`, else `os.homedir()`).
 * If that is empty, `~` is left as written. Only `~` and `~/…` expand. A
 * `~user/…` form is not expanded and resolves as a relative path. A relative
 * path resolves against `baseDir`. For a project file that is the project
 * root. For a machine file it is whatever directory the reading tool uses as
 * its base.
 * @experimental
 */
export function resolveConfigPath(
  value: string,
  baseDir: string,
  opts: ResolveConfigPathOptions = {},
): string {
  if (value.includes('://')) return value
  const looksLikePath = value.includes('/') || value.startsWith('.') || value.startsWith('~')
  if (!looksLikePath) return value
  let p = value
  if (p === '~' || p.startsWith('~/')) {
    // An empty home leaves `~` as it is: expanding it would give the filesystem root.
    const home = opts.home ?? (process.env['HOME'] || homedir())
    if (home !== '') p = `${home}${p.slice(1)}`
  }
  if (!isAbsolute(p)) p = resolve(baseDir, p)
  return p
}

/**
 * Name → absolute directory.
 *
 * @experimental
 */
export type PathNames = Record<string, string>

/**
 * The effective `paths:` map: the project's entries under the machine's,
 * each expanded and made absolute against `baseDir`. `opts.home` is what `~`
 * expands to, as for {@link resolveConfigPath}.
 * @experimental
 */
export function pathNames(
  baseDir: string,
  machine: Record<string, string>,
  project: Record<string, string>,
  opts: ResolveConfigPathOptions = {},
): PathNames {
  const out: PathNames = {}
  for (const [name, raw] of [...Object.entries(project), ...Object.entries(machine)]) {
    out[name] = resolve(baseDir, resolveConfigPath(raw, baseDir, opts))
  }
  return out
}

/**
 * Thrown by {@link substitutePathNames} for a `{name}` that nothing defines.
 *
 * @experimental
 */
export class PathNameError extends Error {}

/**
 * Options for substituting `{name}` path names in a path.
 * @experimental
 */
export interface SubstituteOptions {
  /**
   * How the message tells a person to define a missing name. Defaults to
   * "define it under paths:". A tool that has two files names them.
   */
  defineHint?: string | undefined
}

/**
 * `value` with every `{name}` replaced from `names`, the {@link PathNames} map.
 *
 * A name nothing defines is a {@link PathNameError}, not an empty string. A
 * setting that silently expands to `/repo` instead of `/Users/me/dev/repo`
 * fails somewhere far from the typo. The message says where the name was
 * found (`where`, e.g. `repos:`), how to define it, and what is available.
 * @experimental
 */
export function substitutePathNames(
  value: string,
  names: Record<string, string>,
  where: string,
  opts: SubstituteOptions = {},
): string {
  const defineHint = opts.defineHint ?? 'define it under paths:'
  return value.replace(/\{([^{}]*)\}/g, (_, name: string) => {
    const hit = names[name]
    if (hit === undefined) {
      const known = Object.keys(names).map((n) => `{${n}}`)
      throw new PathNameError(
        `unknown path name '{${name}}' in ${where} '${value}'; ${defineHint}` +
          (known.length > 0 ? ` (available: ${known.join(', ')})` : ''),
      )
    }
    return hit
  })
}

/**
 * Options for the schema of the `paths:` section.
 * @experimental
 */
export interface PathsSchemaOptions {
  /**
   * Names that a consuming setting defines itself, which `paths:` may not
   * reuse. For example `host`, `owner` and `repo` for a checkout layout.
   */
  reserved?: readonly string[] | undefined
}

/**
 * The `paths:` map as a schema: a name (see {@link PATH_NAME}, never one of
 * `reserved`) → a directory.
 * @experimental
 */
export function pathsSchema(opts: PathsSchemaOptions = {}): z.ZodRecord<z.ZodString, z.ZodString> {
  const reserved = opts.reserved ?? []
  return z.record(
    z
      .string()
      .regex(PATH_NAME, 'a path name is letters, digits and _, starting with a letter')
      .refine((n) => !reserved.includes(n), {
        message:
          reserved.length > 0
            ? `a path may not be named after a reserved name (${reserved.join(', ')})`
            : 'reserved name',
      }),
    z
      .string()
      .trim()
      .min(1)
      .describe('A directory. `~` expands; relative resolves against the project root.'),
  )
}
