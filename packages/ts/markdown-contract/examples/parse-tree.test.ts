/**
 * The parse tree on its own: `parse()`, the frontmatter split, and the read helpers that find
 * sections, blocks and source lines. These need no contract, and they live in the `./core`
 * entry, which imports no Node module.
 */
import { describe, expect, test } from 'vitest'

import {
  blocksOfKind,
  codeBlockLines,
  findSection,
  parse,
  rawTableRow,
  rawTableRows,
  sectionForLine,
  sectionSpans,
  sectionsAt,
  splitFrontmatter,
  tableRowLines,
  type BlockNode,
  type DocTree,
  type FrontmatterSplit,
  type Mdast,
  type MicromarkExtension,
  type ParseOptions,
  type SectionNode,
  type SectionSpan,
  type SourcePos,
} from '@osdlc/markdown-contract/core'

const source = [
  '---',
  'title: Build notes',
  'tags: [build, ci]',
  '---',
  '# Build notes',
  '',
  '## Commands',
  '',
  '| Command | Does |',
  '| ------- | ---- |',
  '| `pnpm build` | compiles |',
  '',
  '```sh',
  'pnpm test',
  '```',
  '',
  '## Notes',
  '',
  'Run the tests first.',
  '',
].join('\n')

describe('parse', () => {
  test('one parse gives frontmatter, sections and blocks with positions', () => {
    const tree: DocTree = parse(source)
    const mdast: Mdast = tree.mdast

    expect(tree.frontmatter?.data).toEqual({ title: 'Build notes', tags: ['build', 'ci'] })
    expect(tree.frontmatter?.lineForPath(['tags', 1])).toBe(3)
    expect(tree.root.name).toBe('Build notes')
    expect(tree.root.sections.map((s) => s.name)).toEqual(['Commands', 'Notes'])
    expect(mdast.type).toBe('root')

    const commands: SectionNode = tree.root.sections[0]!
    const kinds = commands.blocks.map((b: BlockNode) => b.kind)
    expect(kinds).toEqual(['table', 'code'])
  })

  test('micromark extensions change how the text is tokenized', () => {
    const noIndentedCode: MicromarkExtension = { disable: { null: ['codeIndented'] } }
    const options: ParseOptions = { extensions: [noIndentedCode] }
    const indented = '## Notes\n\n    not code\n'

    expect(parse(indented).root.sections[0]!.blocks[0]!.kind).toBe('code')
    expect(parse(indented, options).root.sections[0]!.blocks[0]!.kind).toBe('paragraph')
  })

  test('splitFrontmatter splits the text without parsing it', () => {
    const split: FrontmatterSplit = splitFrontmatter(source)
    expect(split.raw).toBe('title: Build notes\ntags: [build, ci]')
    expect(split.body.startsWith('# Build notes')).toBe(true)
  })
})

describe('read helpers', () => {
  const tree = parse(source)
  const root = tree.root

  test('find sections by name, depth and line', () => {
    expect(findSection(root, 'notes', { ci: true })?.name).toBe('Notes')
    expect(sectionsAt(root, 2)).toHaveLength(2)
    expect(sectionForLine(root, 14)?.name).toBe('Commands')

    const spans: SectionSpan[] = sectionSpans(root, source.split('\n').length)
    expect(spans.map((s) => [s.section.name, s.start, s.end])).toEqual([
      ['Commands', 8, 16],
      ['Notes', 18, 20],
    ])
  })

  test('find blocks and the lines they cover', () => {
    const [table] = blocksOfKind(root.sections[0]!, 'table')
    const pos: SourcePos = table!.pos
    expect(pos.line).toBe(9)
    expect([...tableRowLines(root)]).toEqual([9, 11])
    expect([...codeBlockLines(tree)]).toEqual([13, 14, 15])
  })

  test('read a table row from the source, with its inline code kept', () => {
    const [table] = blocksOfKind(root.sections[0]!, 'table')
    expect(table!.rows[0]).toEqual(['pnpm build', 'compiles'])
    expect(rawTableRow(table!, source, 0)).toEqual(['`pnpm build`', 'compiles'])
    expect(rawTableRows(table!, source)).toEqual({
      header: ['Command', 'Does'],
      rows: [['`pnpm build`', 'compiles']],
    })
  })
})
