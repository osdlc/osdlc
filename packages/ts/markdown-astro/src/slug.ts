/**
 * Slugify a wikilink target or title into the canonical filename stem used on
 * disk (and in Astro `entry.id`). Kept deliberately simple and stable so that
 * `[[Maple Street School]]`, `[[maple-street-school]]` and the file
 * `maple-street-school.md` all collapse to the same key.
 */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .replace(/['"`]/g, '')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-') // keep letters, marks, digits of any script
    .replace(/^-+|-+$/g, '')
}
