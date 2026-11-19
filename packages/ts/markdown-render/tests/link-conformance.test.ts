/**
 * The renderer against `@osdlc/markdown-link`'s shared body cases. The wikilink
 * and embed plugins place the links the markdown-link scanner finds, so for a
 * body the plugins must tokenize the same links the case file lists: each
 * wikilink's target, heading, block and alias, and each embed's target.
 *
 * The cases are the suite's `body` section. The renderer always links
 * `[[#Heading]]` to its own note. A case that sets an option the renderer does
 * not take is left out; a case in `SKIPPED` runs and must still differ.
 */
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { remarkEmbeds, remarkWikilinks, type MdNode } from '../src/index.ts'
import { remarkEscapes, remarkUnescape } from '../src/plugins/escapes.ts'

interface BodyCase {
  name: string
  input: {
    body: string
    options?: { self_links?: boolean; skip_html_comments?: boolean; code_rules?: string }
  }
  expect: {
    links: {
      kind: 'wikilink' | 'embed' | 'markdown'
      target: string
      heading?: string | null
      block?: string | null
      alias: string | null
    }[]
  }
}

// The shared suite of the markdown-link family, `packages/conformance/markdown-link/suite.json`.
// The renderer is a reader of it: it runs the body cases without implementing the family.
// A case that sets an option the renderer does not take is left out.
const cases = (
  JSON.parse(
    readFileSync(new URL('../../../conformance/markdown-link/suite.json', import.meta.url), 'utf8'),
  ) as { sections: { body: { cases: BodyCase[] } } }
).sections.body.cases.filter((c) => {
  const o = c.input.options
  return !o?.skip_html_comments && (o?.code_rules ?? 'commonmark') === 'commonmark'
})

/**
 * Cases the renderer answers differently on purpose, and why. The README's
 * "Where the rendered page and the link scanner differ" records each.
 */
const SKIPPED: Record<string, string> = {
  // The renderer links `[[#Heading]]` and `[[|alias]]` to the note itself; the scanner drops them.
  self_links_are_dropped_by_default: 'the renderer reads a self link as a link',
  self_links_option_reads_a_bare_fragment: 'the renderer links `[[|alias]]` to its own note',
  empty_targets_are_dropped:
    'the case holds `[[|alias]]`, which the renderer links to its own note; `[[]]` and `[[ ]]` stay text',
  // Code inside a target is blanked to spaces by the scanner; a link to `a     b` names no note.
  code_inside_a_wikilink_is_blanked_in_raw:
    'code in a target is not plain text, so the link stays literal',
  a_pipe_in_code_in_the_target_is_not_the_alias_pipe:
    'code in a target is not plain text, so the link stays literal',
  a_pipe_only_in_code_gives_no_alias:
    'code in a target is not plain text, so the link stays literal',
  abandoned_only_code_in_the_target:
    'code in a target is not plain text, so the link stays literal',
  alias_keeps_code_inside_it:
    'the alias is shown as its text, code marks gone; the code span stays in the anchor',
  // A table row with no delimiter row is a paragraph to GFM, so its code span is code.
  backtick_run_cut_by_a_cell_boundary:
    'without a delimiter row the line is a paragraph, and remark reads the code span',
  pipe_inside_backticks_still_ends_the_cell:
    'without a delimiter row the line is a paragraph, and remark reads the code span',
  table_row_in_a_list_item:
    'without a delimiter row the line is a paragraph, and remark reads the code span',
  table_row_in_a_block_quote:
    'without a delimiter row the line is a paragraph, and remark reads the code span',
  // A comment is hidden on the page, so a link in it is not shown.
  html_comment_links_are_found_by_default: 'the parse makes a comment an html node, not text',
  comment_backtick_does_not_hide_a_link_default:
    'the parse makes the whole line an html node, not text',
  // A link inside a link would nest anchors, which `rehype-raw` splits.
  markdown_link_text_holding_a_wikilink_is_not_a_markdown_link:
    'remark makes the wikilink part of a link node, and the plugin leaves a link node alone',
  a_code_span_in_parentheses_after_a_bracket_is_code:
    'remark reads `[[a]](...)` as a link node, and the plugin leaves a link node alone',
}

interface Found {
  wikilinks: {
    target: string
    heading: string | null
    block: string | null
    alias: string | null
  }[]
  embeds: string[]
}

function render(body: string): Found {
  const found: Found = { wikilinks: [], embeds: [] }
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkEscapes)
    .use(remarkWikilinks, {
      buildNode: (link) => {
        // The default builder leaves `[[]]` as text; a link with nothing in it is no link.
        if (!link.target && !link.heading && !link.blockId && !link.alias) return null
        found.wikilinks.push({
          target: link.target,
          heading: link.heading,
          block: link.blockId,
          alias: link.alias,
        })
        return { type: 'wikilink', children: [] }
      },
    })
    .use(remarkEmbeds)
    .use(remarkUnescape)
  const tree = processor.runSync(processor.parse(body), { value: body } as never) as MdNode
  visit(tree as never, 'wikiEmbed', (node: MdNode) => {
    found.embeds.push(String(node.data?.hProperties?.dataEmbedTarget))
  })
  return found
}

test('the case file has body cases', () => {
  expect(cases.length).toBeGreaterThan(20)
})

/** What the renderer finds in a case's body, and what the case lists. */
function outcome(c: BodyCase) {
  const found = render(c.input.body)
  const wikilinks = c.expect.links
    .filter((l) => l.kind === 'wikilink')
    .map((l) => ({
      target: l.target,
      heading: l.heading ?? null,
      block: l.block ?? null,
      alias: l.alias,
    }))
  const embeds = c.expect.links.filter((l) => l.kind === 'embed').map((l) => l.target)
  return { found, expected: { wikilinks, embeds } }
}

test('every skipped case is a case that runs', () => {
  const names = new Set(cases.map((c) => c.name))
  expect(Object.keys(SKIPPED).filter((name) => !names.has(name))).toEqual([])
})

for (const c of cases) {
  const skipped = SKIPPED[c.name]
  if (skipped === undefined) {
    test(c.name, () => {
      const { found, expected } = outcome(c)
      expect(found.wikilinks).toEqual(expected.wikilinks)
      expect(found.embeds).toEqual(expected.embeds)
    })
  } else {
    // A skip is a recorded divergence: it must still differ, so it is dropped when the renderer agrees.
    test(`differs on purpose: ${c.name} (${skipped})`, () => {
      const { found, expected } = outcome(c)
      expect(found).not.toEqual(expected)
    })
  }
}
