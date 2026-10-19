/**
 * Content leaves and the typed model: tables, lists, code blocks and paragraphs, checked by
 * Zod and read back typed.
 */
import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'

import {
  LENIENT,
  code,
  contract,
  list,
  maxWords,
  section,
  sections,
  table,
  type BlockKind,
  type BlockView,
  type CodeView,
  type Doc,
  type InlineSpan,
  type LeafSpec,
  type ListItem,
  type ListView,
  type ParagraphView,
  type RowOf,
  type SectionGroup,
  type SectionView,
  type TableView,
} from '@osdlc/markdown-contract'

const ctx = { path: 'tasks/build.md' }

describe('content leaves', () => {
  const change = z.enum(['add', 'edit', 'delete'])
  type FileRow = RowOf<'Path' | 'Change', { Change: typeof change }>

  const task = contract({
    body: sections(LENIENT, [
      section('Summary', { content: maxWords(12) }),
      section('Files', {
        content: table({
          columns: ['Path', 'Change'],
          minRows: 1,
          cells: { Change: change },
        }),
      }),
      section('Checks', { content: list({ everyItem: 'checkbox', minItems: 1 }) }),
      section('Steps', {
        content: list({
          everyItem: z.string().transform((text) => {
            const [ref = '', ...rest] = text.split(': ')
            return { ref, text: rest.join(': ') }
          }),
        }),
      }),
      section('Command', { content: code({ lang: 'sh' }) }),
    ]),
  })

  const source = [
    '## Summary',
    '',
    'Add the `build` script.',
    '',
    '## Files',
    '',
    '| Path | Change |',
    '| ---- | ------ |',
    '| `package.json` | edit |',
    '',
    '## Checks',
    '',
    '- [x] tests pass',
    '- [ ] lint passes',
    '',
    '## Steps',
    '',
    '- S1: write the script',
    '- S2: run it',
    '',
    '## Command',
    '',
    '```sh',
    'pnpm build',
    '```',
    '',
  ].join('\n')

  test('a document that fills every leaf reads back typed', () => {
    const doc = task.read(source, ctx)

    const files: TableView<FileRow> = doc.body.Files
    expect(files.rows).toEqual([{ Path: 'package.json', Change: 'edit' }])
    expect(files.rowPos(0)).toEqual({ line: 9, col: 1 })
    expect(doc.inlineSpans(files.rows[0]!, 'Path').map((s: InlineSpan) => s.raw)).toEqual([
      '`package.json`',
    ])

    const checks: ListView = doc.body.Checks.lists[0]!
    const items: ListItem[] = checks.items
    expect(items.map((i) => i.checked)).toEqual([true, false])

    const steps = doc.body.Steps.lists[0]!
    expect(steps.items).toEqual([
      { ref: 'S1', text: 'write the script' },
      { ref: 'S2', text: 'run it' },
    ])
    expectTypeOf(steps.items).toEqualTypeOf<{ ref: string; text: string }[]>()

    const summary: SectionView = doc.body.Summary
    expect(summary.text()).toBe('Add the build script.')
  })

  test('each leaf reports its own findings', () => {
    const broken = source
      .replace(
        'Add the `build` script.',
        'This summary is far too long to fit in the twelve words it is allowed.',
      )
      .replace('| edit |', '| move |')
      .replace('```sh', '```bash')
    const findings = task.validate(broken, ctx).findings
    expect(findings.map((f) => [f.id, f.pos?.line])).toEqual([
      ['content/max-words', 3],
      ['content/table/cell', 9],
      ['content/code/lang', 23],
    ])
  })

  test('a leaf names the block kind it needs', () => {
    const leaf: LeafSpec = maxWords(12)
    const kinds: BlockKind[] = [
      leaf.kind,
      table({ columns: [] }).kind,
      list({}).kind,
      code({}).kind,
    ]
    expect(kinds).toEqual(['paragraph', 'table', 'list', 'code'])
  })
})

describe('anchors and views', () => {
  const decision = contract({
    body: sections(LENIENT, [
      section('Decision', {
        content: {
          options: table({ columns: ['Option'] }),
          risks: table({ columns: ['Risk'] }),
        },
      }),
    ]),
  })

  const source = [
    '## Decision',
    '',
    'We pick option A.',
    '',
    '| Option |',
    '| ------ |',
    '| A      |',
    '',
    '^options',
    '',
    '| Risk |',
    '| ---- |',
    '| cost |',
    '',
    '^risks',
    '',
    '```text',
    'notes',
    '```',
    '',
  ].join('\n')

  test('a content record finds tables by ^anchor', () => {
    const doc: Doc = decision.read(source, ctx)
    const body = doc.body as SectionGroup
    const section = body.section('Decision')!
    const risks = section.byAnchor('risks') as TableView
    expect(risks.column('Risk')).toEqual(['cost'])
    expect(doc.byAnchor('options')?.kind).toBe('table')
  })

  test('every block has a view', () => {
    const tree = decision.validate(source, ctx).tree
    const views: BlockView['kind'][] = tree.root.sections[0]!.blocks.map((b) => b.kind)
    expect(views).toEqual(['paragraph', 'table', 'table', 'code'])

    const paragraph: ParagraphView = {
      kind: 'paragraph',
      text: 'We pick option A.',
      pos: { line: 3, col: 1 },
    }
    const block: CodeView = {
      kind: 'code',
      lang: 'text',
      value: 'notes',
      pos: { line: 17, col: 1 },
    }
    expect([paragraph.kind, block.kind]).toEqual(['paragraph', 'code'])
  })
})
