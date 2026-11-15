/** Fence language, read off a `<code>` element's `language-…` class. */

interface HastNode {
  type: string
  properties?: Record<string, unknown>
  [key: string]: unknown
}

/** `language-ts` → `ts`. */
export function fenceLang(node: HastNode): string | undefined {
  const raw = node.properties?.className
  const list = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? [raw] : []
  const found = list.find((name) => name.startsWith('language-'))
  return found?.slice('language-'.length).toLowerCase() || undefined
}
