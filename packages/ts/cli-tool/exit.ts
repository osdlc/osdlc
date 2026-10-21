/**
 * What a CLI's exit code means.
 *
 * Three codes are universal: the run worked, it failed, or the command could
 * not be run as typed. The third is separate because a script can act on it —
 * `2` means fix the command line, `1` means look at the state — and it is the
 * same `2` in every tool, so a caller never learns one tool's number for "you
 * typed it wrong". `2` is the conventional choice: argparse and most GNU
 * tools already use it for a usage error.
 *
 * A tool that needs to distinguish outcomes of the work — "nothing to do" as
 * against "something failed" — numbers them in {@link DOMAIN_EXIT_MIN} to
 * {@link DOMAIN_EXIT_MAX} and documents them at its own `main`. Those are
 * outcomes, never restatements of the three universal codes. The band starts
 * at 10 to leave the remaining single digits unclaimed, and stops at 63
 * because everything above is spoken for: `sysexits.h` defines 64-78, and a
 * shell reports a signal as 128+N with 126 and 127 for "cannot execute" and
 * "not found". A tool returning 130 is indistinguishable from one killed by
 * Ctrl-C.
 */

export const EXIT = {
  /** The command did what it was asked. */
  ok: 0,
  /** A well-formed command that failed against the state it found. */
  error: 1,
  /**
   * The command cannot run as typed — an unknown flag or subcommand, a wrong
   * argument count, a value of the wrong type, a missing required argument.
   *
   * Decided from the argument list and the tool's own schema, with nothing
   * read, so re-running it can only fail the same way. That is what makes it
   * worth its own number: `2` says fix the command, `1` says look at the
   * state, and a script can branch on the difference without parsing stderr.
   */
  usage: 2,
} as const

/**
 * An exit code: one of the named `EXIT` codes, or a number a tool picks for an outcome of its own.
 */
export type ExitCode = (typeof EXIT)[keyof typeof EXIT] | number

/** First code a tool may use for an outcome of its own. */
export const DOMAIN_EXIT_MIN = 10

/** Last such code. Above this the shell and `sysexits.h` have prior claims. */
export const DOMAIN_EXIT_MAX = 63

/** Whether `code` is inside the band a tool may define meanings in. */
export function isDomainExit(code: number): boolean {
  return Number.isInteger(code) && code >= DOMAIN_EXIT_MIN && code <= DOMAIN_EXIT_MAX
}
