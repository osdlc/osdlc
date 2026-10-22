/**
 * Remove and rename fields in one batch. The batch applies in order, and a
 * later edit sees the earlier ones.
 */

import { expect, test } from 'vitest'

import { editYaml, type FieldEdit } from '@osdlc/yaml-splice'

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)
const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)

test('remove, rename, then set the renamed field; CRLF stays CRLF', () => {
  const source = encode('title: Notes\r\ndraft: true # remove me\r\nauthor: ana\r\n')

  const edits: FieldEdit[] = [
    { Remove: { key: 'draft' } },
    { Rename: { from: 'author', to: 'owner' } },
    { Set: { key: 'owner', value: 'bo' } },
  ]

  const out = editYaml(source, edits)

  expect(out.changed).toBe(true)
  expect(decode(out.bytes)).toBe('title: Notes\r\nowner: bo\r\n')
})

test('removing a key that is not there is a no-op, not an error', () => {
  const same = editYaml(encode('title: Notes\n'), [{ Remove: { key: 'draft' } }])
  expect(same.changed).toBe(false)
})
