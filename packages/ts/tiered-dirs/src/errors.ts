/**
 * What went wrong, one value per variant of the Rust twin's `Error`:
 *
 * - `MISSING_BASE_DIR`: a base directory needs a home directory and none can
 *   be found.
 * - `RELATIVE_OVERRIDE`: an override variable holds a relative path.
 * - `OVERRIDE_REQUIRED`: `EnvVars.requireOverride` is set and a base
 *   directory would fall back to the per-OS table.
 * - `INVALID_CONVENTION`: `EnvVars.convention`, or the value given to
 *   `parseConvention`, is not `native` or `xdg`.
 * - `INVALID_KEY`: a caller-supplied segment is not one safe path segment, or
 *   is `state`, `logs` or `run`.
 *
 * A minor release may add a code, as the Rust `Error` is `#[non_exhaustive]`.
 * A `switch` over it needs a `default` arm.
 *
 * Stable in 0.x.
 */
export type TieredDirsErrorCode =
  | 'MISSING_BASE_DIR'
  | 'RELATIVE_OVERRIDE'
  | 'OVERRIDE_REQUIRED'
  | 'INVALID_CONVENTION'
  | 'INVALID_KEY'

/**
 * Every failure this package raises. One class, so a consumer can tell a
 * directory-resolution problem from an unrelated `Error`. {@link code} says
 * which failure it is, so a caller need not match on the message.
 *
 * Nothing here ever aborts the process. Base directories can fail to resolve —
 * headless CI and sandboxes do not always have a home — so resolution throws a
 * catchable error and never asserts.
 *
 * Stable in 0.x.
 */
export class TieredDirsError extends Error {
  override readonly name = 'TieredDirsError'

  /** Which failure this is. */
  readonly code: TieredDirsErrorCode

  constructor(code: TieredDirsErrorCode, message: string) {
    super(message)
    this.code = code
  }
}
