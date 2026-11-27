import { expect, test } from 'vitest'

import {
  BaseParseError,
  extractEmbeddedBases,
  parseBase,
  selectView,
  type BaseDef,
  type BaseViewDef,
  type FilterNode,
  type SortKey,
} from '@osdlc/markdown-vault-query'

const SOURCE = `
filters:
  and:
    - file.hasTag("work")
    - not:
        - status == "done"
formulas:
  overdue: due < today()
summaries:
  spread: values.max() - values.min()
views:
  - type: table
    name: By due date
    order: [file.name, due, formula.overdue]
    sort:
      - property: due
        direction: DESC
    groupBy:
      property: status
      direction: ASC
    limit: 20
    columnSize:
      file.name: 220
  - type: list
    name: Plain
`

test('parseBase reads filters, formulas, summaries and views', () => {
  const base: BaseDef = parseBase(SOURCE)
  const view: BaseViewDef = base.views[0]!
  const sort: SortKey = view.sort[0]!
  const filter: FilterNode = base.filters!

  expect(filter.type).toBe('and')
  expect(Object.keys(base.formulas)).toEqual(['overdue'])
  expect(view.order).toEqual(['file.name', 'due', 'formula.overdue'])
  expect(sort).toEqual({ property: 'due', direction: 'DESC' })
  expect(view.groupBy?.property).toBe('status')
  expect(view.limit).toBe(20)
})

test('parseBase keeps keys it does not model', () => {
  const base = parseBase(SOURCE)

  expect(base.views[0]!.extra).toEqual({ columnSize: { 'file.name': 220 } })
})

test('selectView picks a view by name, or the first one', () => {
  const base = parseBase(SOURCE)

  expect(selectView(base).name).toBe('By due date')
  expect(selectView(base, 'Plain').type).toBe('list')
  expect(() => selectView(base, 'Missing')).toThrow(/not found/)
})

test('parseBase throws BaseParseError with the location and the cause', () => {
  const error = (() => {
    try {
      parseBase('formulas:\n  total: price *\n')
    } catch (e) {
      return e
    }
  })()

  expect(error).toBeInstanceOf(BaseParseError)
  expect((error as BaseParseError).path).toBe('formulas.total')
  expect((error as BaseParseError).cause).toBeInstanceOf(Error)
})

test('extractEmbeddedBases parses the base blocks of a markdown note', () => {
  const note = [
    '# Tasks',
    '',
    '```base',
    'views:',
    '  - type: table',
    '    name: Embedded',
    '```',
    '',
    'Some prose.',
  ].join('\n')

  expect(extractEmbeddedBases(note).map((base) => base.views[0]!.name)).toEqual(['Embedded'])
})
