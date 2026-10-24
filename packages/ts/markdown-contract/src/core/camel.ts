/**
 * camelCase keys for section headings.
 *
 * Each section can be read by its exact heading text or by a generated `lowerCamelCase` key
 * (`doc.body.filesToTouch`). The rule does not depend on locale and handles Unicode, so most
 * scripts work. It splits on runs of characters that are not letters or digits
 * (`/[^\p{L}\p{N}]+/u`), drops empty parts, lowercases the first word, and capitalizes the
 * first letter of each later word with the rest lowercased.
 *
 * The keys are used to detect collisions (`structure/key-collision`, `contract/key-collision`)
 * and to give the typed model its second key.
 *
 * A heading with no letters or digits (such as `"---"`) gives an empty key (`""`). Callers
 * treat an empty key as "no generated key". The section is still reachable by its exact
 * heading text and by `.section()`.
 */

const NON_ALNUM = /[^\p{L}\p{N}]+/u

/** Lowercases the first character of `word` and leaves the rest. */
function lowerFirst(word: string): string {
  if (word.length === 0) return word
  return word[0]!.toLowerCase() + word.slice(1)
}

/** Uppercases the first character of `word` and lowercases the rest. */
function capitalize(word: string): string {
  if (word.length === 0) return word
  return word[0]!.toUpperCase() + word.slice(1).toLowerCase()
}

/**
 * Returns the lowerCamelCase key for a heading, or `""` when the heading has no letters or
 * digits.
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
