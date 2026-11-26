/**
 * The parts of descriptor variables (tier 2) that the schema needs. This
 * module imports nothing, so `schema.ts`, and the script that writes the JSON
 * Schema from it, run without any workspace package built.
 */

/**
 * The variables every descriptor has: each `XDG_*` folder with its default
 * under the home folder, used when the environment does not set it to an
 * absolute path, as the tools that read them do.
 */
export const BUILT_IN_VARS = {
  HOME: undefined,
  XDG_CACHE_HOME: '.cache',
  XDG_DATA_HOME: '.local/share',
  XDG_CONFIG_HOME: '.config',
  XDG_STATE_HOME: '.local/state',
} as const satisfies Record<string, string | undefined>

/** The extensions a `file` source may have, by the format read. */
export const VAR_FILE_EXTENSIONS = ['.toml', '.json', '.yaml', '.yml'] as const

export type VarFileExtension = (typeof VAR_FILE_EXTENSIONS)[number]

/** A `${VAR}` reference; the name is an environment variable's name. */
export const VAR_REF = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g

/** The names `text` refers to as `${NAME}`, in order, repeats kept. */
export const varRefs = (text: string): string[] => [...text.matchAll(VAR_REF)].map((m) => m[1]!)

/** Whether `text` has a `${` that is not a well-formed `${NAME}`. */
export const badVarRef = (text: string): boolean => text.replace(VAR_REF, '').includes('${')
