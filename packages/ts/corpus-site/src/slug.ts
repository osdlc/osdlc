/** A path segment for an id: lower-case letters and digits, with `-` for every other run, and `record` when none is left. */
export function slugify(id: string): string {
  const slug = id
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return slug === '' ? 'record' : slug
}
