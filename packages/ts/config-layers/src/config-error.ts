/**
 * The error every reader of a project config file throws when the file is
 * unusable, and the exit code that means it.
 *
 * The library sets exit 14, so every tool built on it gives a script the same
 * number for "the config file is wrong". It is in the range 10-63, which is
 * left for a tool's own outcomes.
 */

/**
 * The exit code of a config file that exists but is unreadable, not YAML, not a mapping, or fails its schema.
 *
 * @experimental
 */
export const CONFIG_INVALID_EXIT = 14

/**
 * One schema (or parse) problem: the dotted key path and what is wrong with it.
 *
 * @experimental
 */
export interface ConfigIssue {
  /** Dotted key path; `(root)` for a problem with the file as a whole. */
  path: string
  message: string
}

/**
 * A config file exists but is unusable: unreadable, not YAML, not a mapping, or
 * failing its schema. Also thrown when the environment variable that relocates
 * the file names a file that is not there. A reader refuses to run on it rather
 * than use defaults. A tool maps it to {@link CONFIG_INVALID_EXIT}.
 * @experimental
 */
export class ConfigInvalidError extends Error {
  /** The layer file(s) involved, the project file first. */
  readonly files: string[]
  readonly issues: ConfigIssue[]
  /** {@link CONFIG_INVALID_EXIT}, so a tool needs no table to map it. */
  readonly exitCode = CONFIG_INVALID_EXIT
  constructor(files: string[], issues: ConfigIssue[], label = 'config') {
    super(
      `${files.join(' + ')} ${files.length > 1 ? 'are' : 'is'} not valid ${label}:\n` +
        issues.map((i) => `  ${i.path}: ${i.message}`).join('\n'),
    )
    this.name = 'ConfigInvalidError'
    this.files = files
    this.issues = issues
  }
}
