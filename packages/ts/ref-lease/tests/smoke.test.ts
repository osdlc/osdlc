import { expect, test } from 'vitest'

// Imports the package by name, the way a consumer does, so the `exports` map is exercised.
import * as pkg from '@osdlc/ref-lease'

test('the package entry exports the operations', () => {
  for (const name of [
    'casCreate',
    'casReplace',
    'casDelete',
    'fetchRef',
    'fetchNamespace',
    'buildLeaseCommit',
    'checkNamespaceConflict',
    'canonicalJson',
  ]) {
    expect(typeof (pkg as Record<string, unknown>)[name]).toBe('function')
  }
})
