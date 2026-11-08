/** A problem with the command line, the spec file or its inputs. Exit code 2. */
export class UsageError extends Error {
  override name = 'UsageError'
}

export const EXIT_OK = 0
export const EXIT_AGENT_ERROR = 1
export const EXIT_USAGE = 2
export const EXIT_STRICT = 3
