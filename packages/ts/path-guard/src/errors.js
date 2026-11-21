// The error and warning types. No filesystem and no `node:*` import: the
// `./lexical` entry loads this module.
/**
 * The error every refused path throws. Read `kind` to tell the reasons apart.
 *
 * @example
 * ```ts
 * try {
 *   lexical.validateRelative('../x')
 * } catch (error) {
 *   if (error instanceof PathError) console.log(error.kind) // 'parent_segment'
 * }
 * ```
 */
export class PathError extends Error {
    name = 'PathError';
    kind;
    constructor(kind, message) {
        super(message);
        this.kind = kind;
    }
}
