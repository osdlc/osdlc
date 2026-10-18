/**
 * The quick start: one contract for a decision record, checked and then read back as a
 * typed model.
 */
import { expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'

import {
  ContractError,
  contract,
  section,
  sections,
  table,
  type Infer,
} from '@osdlc/markdown-contract'

const decision = contract({
  frontmatter: z.object({
    title: z.string(),
    status: z.enum(['proposed', 'accepted', 'rejected']),
  }),
  body: sections({ order: 'strict', allowUnknown: false }, [
    section('Context'),
    section('Decision'),
    section('Options', {
      content: table({ columns: ['Option', 'Cost'], cells: { Cost: z.coerce.number() } }),
    }),
  ]),
})

const source = `---
title: Use zod for config
status: accepted
---

## Context

Config is checked by hand.

## Decision

Use zod.

## Options

| Option | Cost |
| ------ | ---- |
| zod    | 1    |
| ajv    | 2    |
`

test('a document that meets the contract has no findings and reads back typed', () => {
  const result = decision.validate(source, { path: 'decisions/zod.md' })
  // result.findings is []

  const doc = decision.read(source, { path: 'decisions/zod.md' })
  const status = doc.frontmatter.status
  const costs = doc.body.Options.column('Cost')
  // status is 'accepted'; costs is [1, 2], as numbers

  expect(result.findings).toEqual([])
  expect(status).toBe('accepted')
  expect(costs).toEqual([1, 2])
  expectTypeOf(costs).toEqualTypeOf<number[]>()
})

test('a document that breaks the contract gets findings with lines', () => {
  const broken = source.replace('status: accepted', 'status: done').replace('| 2    |', '| lots |')
  const { findings, doc } = decision.validate(broken, { path: 'decisions/zod.md' })

  expect(doc).toBeUndefined()
  expect(findings.map((f) => [f.id, f.level, f.pos?.line])).toEqual([
    ['frontmatter/enum', 'error', 3],
    ['content/table/cell', 'error', 19],
  ])
  expect(() => decision.read(broken, { path: 'decisions/zod.md' })).toThrow(ContractError)
})

test('Infer gives the type of the model, for annotating a variable', () => {
  type DecisionDoc = Infer<typeof decision>
  const doc: DecisionDoc = decision.read(source, { path: 'decisions/zod.md' })
  expectTypeOf(doc.frontmatter.status).toEqualTypeOf<'proposed' | 'accepted' | 'rejected'>()
})
