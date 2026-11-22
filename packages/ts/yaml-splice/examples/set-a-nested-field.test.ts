/**
 * Set, remove and rename fields below the top level by path.
 */

import { expect, test } from 'vitest'

import { editYaml, EditError, type EditPath, type FieldEdit } from '@osdlc/yaml-splice'

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)
const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)

const source = encode(
  ['server:', '  host: example.org   # the public name', '  port: 80', 'name: site', ''].join('\n'),
)

test('a path addresses a nested key and keeps the rest byte for byte', () => {
  // A path is a list of keys. A number is a position in a sequence.
  const host: EditPath = ['server', 'host']
  const edits: FieldEdit[] = [
    { SetPath: { path: ['server', 'port'], value: 8080 } },
    { RenamePath: { path: host, to: 'address' } },
    { SetPath: { path: ['server', 'tls'], value: true } },
  ]

  const out = editYaml(source, edits)

  expect(decode(out.bytes)).toBe(
    [
      'server:',
      '  address: example.org   # the public name',
      '  port: 8080',
      '  tls: true',
      'name: site',
      '',
    ].join('\n'),
  )
})

test('a path that does not fit the document is refused with a typed error', () => {
  // `name` holds a scalar, so nothing can be set below it.
  try {
    editYaml(source, [{ SetPath: { path: ['name', 'first'], value: 'x' } }])
    expect.unreachable()
  } catch (err) {
    expect(err).toBeInstanceOf(EditError)
    expect((err as EditError).code).toBe('PathTypeMismatch')
  }
})
