/**
 * Every failure this package raises. One class, so a consumer can tell a
 * directory-resolution problem from an unrelated `Error`. {@link code} says
 * which failure it is, so a caller need not match on the message.
 *
 * Nothing here aborts the process. Base directories can fail to resolve,
 * because headless CI and sandboxes do not always have a home. So resolution
 * throws a catchable error and never asserts.
 *
 * Stable in 0.x.
 */
export class TieredDirsError extends Error {
    name = 'TieredDirsError';
    /** Which failure this is. */
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
