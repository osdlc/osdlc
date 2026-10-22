/**
 * Set fields in a YAML document and keep everything else byte for byte.
 */

import { expect, test } from 'vitest'

import { editYaml, type EditOutcome, type EditValue, type FieldEdit } from '@osdlc/yaml-splice'

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)
const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)

const source = encode(
  [
    '# Release notes for the next version',
    "title: 'Draft'   # shown in the header",
    'status: draft',
    'tags: [notes]',
    '',
  ].join('\n'),
)

test('a set changes the value and keeps the rest byte for byte', () => {
  // A value can be any JSON-shaped value. Nested maps and lists are written as
  // block YAML under their key.
  const owners: EditValue = { lead: 'ana', reviewers: ['bo', 'cy'] }

  const edits: FieldEdit[] = [
    { Set: { key: 'status', value: 'done' } },
    { Set: { key: 'owners', value: owners } },
  ]

  const out: EditOutcome = editYaml(source, edits)

  expect(out.changed).toBe(true)
  expect(decode(out.bytes)).toBe(
    [
      '# Release notes for the next version',
      "title: 'Draft'   # shown in the header",
      'status: done',
      'tags: [notes]',
      'owners:',
      '  lead: ana',
      '  reviewers:',
      '    - bo',
      '    - cy',
      '',
    ].join('\n'),
  )
})

test('setting a field to the value it has changes nothing', () => {
  // The bytes are the input's and `changed` is false, so a caller can skip the
  // write.
  const again = editYaml(source, [{ Set: { key: 'status', value: 'draft' } }])
  expect(again.changed).toBe(false)
  expect(again.bytes).toEqual(source)
})
