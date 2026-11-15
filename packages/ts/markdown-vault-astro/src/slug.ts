/**
 * One path segment as a lookup key and as a filename stem. Letters and digits
 * of any script are kept, so `日本` and `東京` stay apart, and typographic
 * quotes are dropped like ASCII ones: Astro's smartypants turns `[[Bob's Notes]]`
 * into `Bob’s Notes` before the wikilink plugin sees it. The resolver and
 * {@link slugify} share this, so `[[Oak Lane Guide]]`, `[[oak-lane-guide]]` and
 * the file `oak-lane-guide.md` all collapse to the same key.
 */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
    .replace(/['"`\u2018\u2019\u201c\u201d]/g, '')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}
