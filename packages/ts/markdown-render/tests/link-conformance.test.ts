/**
 * The renderer against `@osdlc/markdown-link`'s shared body cases. The wikilink
 * and embed plugins place the links the markdown-link scanner finds, so for a
 * body the plugins must tokenize the same links the case file lists: each
 * wikilink's target, heading, block and alias, and each embed's target.
 *
 * The cases are the suite's `body` section. The renderer reads
 * `[[#Heading]]` as a link to its own note, so it runs the cases under
 * `selfLinks`; the cases that only differ in an option the renderer does not
 * take (comments skipped, the skill-export code rules) are left out, and so are
 * the few where the renderer is stricter on purpose. `SKIPPED` says why.
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

/** Cases the renderer answers differently, and why. */
const SKIPPED: Record<string, string> = {
  html_comment_links_are_found_by_default: 'the parse makes a comment an html node, not text',
  html_comment_option_skips_links_inside: 'the renderer takes no skipHtmlComments option',
  html_comment_inside_code_does_not_open: 'the renderer takes no skipHtmlComments option',
  skill_export_code_rules_option: 'the renderer reads code by the CommonMark rules only',
  abandoned_a_skipped_comment_is_an_empty_target_not_code:
    'the renderer takes no skipHtmlComments option',
  abandoned_not_reported_in_code_or_a_skipped_comment:
    'the renderer takes no skipHtmlComments option',
  self_links_are_dropped_by_default: 'the renderer reads a self link as a link',
  code_inside_a_wikilink_is_blanked_in_raw:
    'code in a target is not plain text, so the link stays literal',
  a_pipe_in_code_in_the_target_is_not_the_alias_pipe:
    'code in a target is not plain text, so the link stays literal',
  a_pipe_only_in_code_gives_no_alias:
    'code in a target is not plain text, so the link stays literal',
  alias_keeps_code_inside_it: 'an alias that crosses nodes is read as plain text, code marks gone',
  self_links_option_reads_a_bare_fragment: 'the renderer links `[[|alias]]` to its own note',
  abandoned_only_code_in_the_target:
    'code in a target is not plain text, so the link stays literal',
  empty_targets_are_dropped: 'the renderer links `[[|alias]]` to its own note',
  escaped_bang_before_an_empty_link: 'the renderer links `[[|alias]]` to its own note',
  backtick_run_cut_by_a_cell_boundary:
    'without a delimiter row the line is a paragraph, and remark reads the code span',
  pipe_inside_backticks_still_ends_the_cell:
    'without a delimiter row the line is a paragraph, and remark reads the code span',
  table_row_in_a_list_item:
    'without a delimiter row the line is a paragraph, and remark reads the code span',
  table_row_in_a_block_quote:
    'without a delimiter row the line is a paragraph, and remark reads the code span',
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

for (const c of cases) {
  const skipped = SKIPPED[c.name]
  const run = skipped === undefined ? test : test.skip
  run(c.name, () => {
    const found = render(c.input.body)
    const wikilinks = c.expect.links
      .filter((l) => l.kind === 'wikilink')
      .map((l) => ({
        target: l.target,
        heading: l.heading ?? null,
        block: l.block ?? null,
        alias: l.alias,
      }))
    expect(found.wikilinks).toEqual(wikilinks)
    expect(found.embeds).toEqual(
      c.expect.links.filter((l) => l.kind === 'embed').map((l) => l.target),
    )
  })
}
