import { expect, test } from 'vitest'
import type { SectionView } from '../src/index.js'
import { ContractError, contract, parse, section, sections } from '../src/index.js'

test('the engine doors run end to end: parse, validate, and read', () => {
  // `parse` returns a DocTree; it does not throw.
  const tree = parse('## A\n\nx\n')
  expect(tree.root.sections[0]?.name).toBe('A')

  // `validate` runs every plane in one pass and does not throw. It returns a
  // ValidationResult: the findings, the tree, and the model when the doc is valid.
  const c = contract({})
  const result = c.validate('x', { path: 'f.md' })
  expect(Array.isArray(result.findings)).toBe(true)
  expect(result.tree.root).toBeDefined()

  // `read` returns the typed model on a valid document: an empty contract over a
  // trivial document has no error-level finding, so `read()` hands back a `Doc`.
  const doc = c.read('## A\n\nsome prose\n', { path: 'f.md' })
  const body = doc.body as { section(n: string): SectionView | undefined }
  const a = body.section('A')
  expect(a?.name).toBe('A')
  expect(a?.text()).toContain('some prose')

  // `read` throws `ContractError` on an error-level finding: a contract that
  // requires a missing section fails the document, so `read()` throws — carrying that finding.
  const strict = contract({ body: sections({}, [section('Required')]) })
  let thrown: unknown
  try {
    strict.read('## Present\n', { path: 'f.md' })
  } catch (e) {
    thrown = e
  }
  expect(thrown).toBeInstanceOf(ContractError)
  expect((thrown as ContractError).findings.some((f) => f.level === 'error')).toBe(true)
})
