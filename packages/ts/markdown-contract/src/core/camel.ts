/**
 * Unicode-aware camelCase key derivation.
 *
 * A section's exact heading text gets a generated `lowerCamelCase` key alongside it
 * (`doc.body.filesToTouch`). The rule must be locale-independent and Unicode-aware so
 * most scripts work: split on runs of non-alphanumeric characters (`/[^\p{L}\p{N}]+/u`),
 * drop empties, and lowerCamel-join — lowercasing the first word, capitalizing the first
 * letter of each subsequent word and lowercasing its remainder.
 *
 * Used for collision detection (`structure/key-collision`, `contract/key-collision`) and for the
 * dual-key access of the typed model.
 *
 * A heading that yields no alphanumeric run (e.g. `"---"`, or a caseless script with no
 * `\p{L}`/`\p{N}` content) produces an empty key (`""`); callers treat an empty key as
 * "no generated alias" (exact-bracket + `.section()` still reach it).
 */

const NON_ALNUM = /[^\p{L}\p{N}]+/u

/** Lower the first character of `word` (and leave the rest as-is). */
function lowerFirst(word: string): string {
  if (word.length === 0) return word
  return word[0]!.toLowerCase() + word.slice(1)
}

/** Capitalize the first character of `word` and lowercase the remainder. */
function capitalize(word: string): string {
  if (word.length === 0) return word
  return word[0]!.toUpperCase() + word.slice(1).toLowerCase()
}

/**
 * Derive the lowerCamelCase key for a heading. Returns `""` when the heading carries no
 * alphanumeric content (no generated alias).
 *
 * Examples:
 *   "Files to touch"        → "filesToTouch"
 *   "Goal / Problem statement" → "goalProblemStatement"
 *   "Files To Touch"        → "filesToTouch"  (collides with "Files to touch")
 */
export function toCamelKey(name: string): string {
  const words = name.split(NON_ALNUM).filter((w) => w.length > 0)
  if (words.length === 0) return ''
  const [first, ...rest] = words
  return lowerFirst(first!.toLowerCase()) + rest.map(capitalize).join('')
}
