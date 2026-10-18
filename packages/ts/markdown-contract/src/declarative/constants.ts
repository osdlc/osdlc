/**
 * Shared defaults for the config inferer's value-type ladder. Data only — no
 * logic, so this module has no peer test; the behaviour these thresholds gate is pinned in
 * `infer.test.ts`. Both are overridable per run via `init` flags (`--max-const-len`,
 * `--min-const-examples`); these are the values used when the flag is omitted.
 */

/**
 * Strings longer than this are never pinned as a `const` nor admitted into an `enum`. Real
 * discriminants (`capability` / `milestone`, schema versions, `0.1.0`, ISO dates) are all well
 * under this; free-text notes are hundreds of chars — so the cap costs nothing on genuine
 * const fields while stopping a paragraph from being frozen as a literal.
 */
export const DEFAULT_MAX_CONST_STRING_LENGTH = 64

/**
 * A uniform scalar is only promoted to `const` once observed in at least this many documents —
 * so a field that happens to be uniform across one or two files on a small corpus is not frozen
 * on thin evidence. Below the floor the field falls through to a looser rung (still
 * accept-by-construction). Set the flag to `1` to restore pinning on a single example.
 */
export const DEFAULT_MIN_CONST_EXAMPLES = 3
