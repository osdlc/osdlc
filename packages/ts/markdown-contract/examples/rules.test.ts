/**
 * Checks a grammar cannot express: section rules, document rules and text checks, plus the
 * helpers that sort, filter and print findings.
 */
import { describe, expect, test } from 'vitest'
import { z } from 'zod'

import {
  LENIENT,
  contract,
  countByLevel,
  docRule,
  filterFindings,
  findingLocation,
  forbids,
  formatFinding,
  hasErrors,
  requires,
  rule,
  section,
  sections,
  textRule,
  type Ctx,
  type DocRule,
  type Finding,
  type FindingLevel,
  type Rule,
  type TextEdit,
  type TextMatchSpec,
  type TextRuleSpec,
  type ValidateCtx,
  type ValidationResult,
} from '@osdlc/markdown-contract'

const ctx: ValidateCtx = { path: 'tasks/build.md' }

describe('rules', () => {
  const mentionsOwner: Rule = rule('summary/mentions-owner', (node, c: Ctx) =>
    node.blocks.some((b) => b.kind === 'paragraph' && b.text.includes('@'))
      ? []
      : [c.finding({ id: 'summary/mentions-owner', message: 'name an owner', pos: node.pos })],
  )

  const doneNeedsNotes: DocRule = docRule<{ status: string }>(
    'task/done-needs-notes',
    (doc, c, tree) =>
      doc.frontmatter.status === 'done' && !tree.root.sections.some((s) => s.name === 'Notes')
        ? [
            c.finding({
              id: 'task/done-needs-notes',
              message: 'a done task needs notes',
              level: 'warn',
            }),
          ]
        : [],
  )

  const task = contract({
    frontmatter: z.object({ status: z.string() }),
    body: sections(LENIENT, [section('Summary', { rules: [mentionsOwner] })]),
    rules: [doneNeedsNotes],
  })

  test('a section rule and a document rule report their own findings', () => {
    const result: ValidationResult = task.validate(
      '---\nstatus: done\n---\n\n## Summary\n\nShip it.\n',
      ctx,
    )
    expect(result.findings.map((f) => [f.id, f.level, f.pos?.line])).toEqual([
      ['task/done-needs-notes', 'warn', undefined],
      ['summary/mentions-owner', 'error', 5],
    ])
  })
})

describe('text checks', () => {
  const noTodo: TextMatchSpec = { pattern: 'TODO', note: 'finish the draft first' }
  const docText: TextRuleSpec = { requires: [{ regex: 'v\\d+\\.\\d+', id: 'mentions-version' }] }

  const release = contract({
    body: sections(LENIENT, [
      section('Summary', { rules: [requires([{ pattern: 'release', ignoreCase: true }])] }),
      section('Notes', { rules: [forbids([noTodo])] }),
    ]),
    rules: [textRule(docText)],
  })

  test('requires, forbids and textRule check phrases', () => {
    const findings = release.validate('## Summary\n\nShip it.\n\n## Notes\n\nTODO\n', ctx).findings
    expect(findings.map((f) => [f.id, f.pos?.line])).toEqual([
      ['mentions-version', undefined],
      [expect.stringMatching(/^text\/requires\/summary\//), 1],
      [expect.stringMatching(/^text\/forbids\/notes\//), 7],
    ])
    expect(findings[2]!.message).toContain('finish the draft first')
  })

  test('a requires entry that expresses absence is rejected when it is built', () => {
    expect(() => requires([{ pattern: 'TODO', max: 0 }])).toThrow(/use forbids/)
  })
})

describe('finding helpers', () => {
  const edit: TextEdit = { range: { start: { line: 3 }, end: { line: 3 } }, newText: '' }
  const findings: Finding[] = [
    { id: 'structure/section-missing', level: 'error', path: 'a.md', message: 'missing ‘Summary’' },
    {
      id: 'text/forbids/doc/x',
      level: 'warn',
      path: 'a.md',
      pos: { line: 3 },
      message: 'found TODO',
      fix: { description: 'delete the line', edit },
    },
  ]

  test('count, filter and print findings', () => {
    const levels: Record<FindingLevel, number> = countByLevel(findings)
    expect(levels).toEqual({ error: 1, warn: 1, report: 0 })
    expect(hasErrors(findings)).toBe(true)
    expect(filterFindings(findings, { area: 'text' }).map((f) => f.id)).toEqual([
      'text/forbids/doc/x',
    ])
    expect(findingLocation(findings[1]!, { withPath: true })).toBe('a.md:3')
    expect(formatFinding(findings[1]!)).toBe('[text/forbids/doc/x] (line 3): found TODO')
    expect(formatFinding(findings[0]!, { style: 'line' })).toBe(
      '[structure/section-missing]: missing ‘Summary’',
    )
  })
})
