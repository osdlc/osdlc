/**
 * Defaults for how config inference picks a value type. `tests/declarative/infer.test.ts`
 * covers the behaviour. The `init` flags `--max-const-len` and `--min-const-examples` override
 * them for one run. These values apply when a flag is omitted.
 */

/**
 * A string longer than this never becomes a `const` or an `enum` member. Real fixed values
 * (`capability`, `milestone`, schema versions, `0.1.0`, ISO dates) are well under it. Free-text
 * notes run to hundreds of characters. So the cap stops a paragraph from becoming a literal
 * without affecting real `const` fields.
 */
export const DEFAULT_MAX_CONST_STRING_LENGTH = 64

/**
 * A scalar with the same value everywhere becomes a `const` only when it appears in at least
 * this many documents. A field that happens to match in one or two files of a small folder is
 * not fixed. Below this count the field gets a looser type, which still accepts every value
 * seen. Set the flag to `1` to make a `const` from a single example.
 */
export const DEFAULT_MIN_CONST_EXAMPLES = 3
