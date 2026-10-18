/**
 * Every failure this package raises. One class, so a consumer can tell a
 * directory-resolution problem from an unrelated `Error` without string
 * matching.
 *
 * Nothing here ever aborts the process. Base directories can fail to resolve —
 * headless CI and sandboxes do not always have a home — so resolution throws a
 * catchable error and never asserts.
 *
 * Stable in 0.x.
 */
export class TieredDirsError extends Error {
  override readonly name = 'TieredDirsError'

  constructor(message: string) {
    super(message)
  }
}
