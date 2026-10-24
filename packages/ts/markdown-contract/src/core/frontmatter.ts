import type { Root, Yaml } from 'mdast'
import remarkFrontmatter from 'remark-frontmatter'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

// Finds frontmatter with the same extension parse() uses, without the rest of parse().
const FRONTMATTER_PROCESSOR = unified().use(remarkParse).use(remarkFrontmatter, ['yaml'])

/** What {@link splitFrontmatter} returns: the frontmatter text and the body text. */
export interface FrontmatterSplit {
  /** The YAML between the `---` fences, without the fences; `null` when there is no frontmatter. */
  raw: string | null
  /** The source after the closing fence's line break; the whole source when there is no frontmatter. */
  body: string
}

/**
 * Returns the exact text after a leading frontmatter block, given its mdast `yaml` node (or
 * `undefined` when there is none). `splitFrontmatter` and `parse()` both use it, so they agree.
 * It skips one line break (CRLF or LF) after the closing fence and keeps everything else.
 */
export function bodyAfterFrontmatter(md: string, yamlNode: Yaml | undefined): string {
  const end = yamlNode?.position?.end?.offset
  if (end === undefined) return md
  let i = end
  if (md[i] === '\r' && md[i + 1] === '\n') i += 2
  else if (md[i] === '\n') i += 1
  return md.slice(i)
}

/**
 * Splits a document into its frontmatter text and its body, without parsing the YAML or the
 * markdown sections. It finds the frontmatter the same way `parse()` does, so the two agree.
 *
 * @param md The markdown source.
 * @returns The frontmatter text (or `null`) and the body, both exact slices of the source.
 * @example
 * ```ts
 * splitFrontmatter("---\ntitle: Hi\n---\n# Hi\n"); // { raw: "title: Hi", body: "# Hi\n" }
 * ```
 */
export function splitFrontmatter(md: string): FrontmatterSplit {
  const tree = FRONTMATTER_PROCESSOR.parse(md) as Root
  const yamlNode = tree.children.find((c): c is Yaml => c.type === 'yaml')
  return {
    raw: yamlNode ? yamlNode.value : null,
    body: bodyAfterFrontmatter(md, yamlNode),
  }
}
