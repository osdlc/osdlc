import { describe, expect, test } from 'vitest'

import {
  CasFailed,
  GitFailed,
  NamespaceConflict,
  PayloadUnreadable,
  RefLeaseError,
  RefNotFound,
} from '@osdlc/ref-lease'

describe('every error extends RefLeaseError and carries its kind', () => {
  const cases: [RefLeaseError, string, string][] = [
    [new CasFailed({ ref: 'r', expectedSha: null }), 'cas-failed', 'CasFailed'],
    [new RefNotFound({ ref: 'r' }), 'ref-not-found', 'RefNotFound'],
    [new NamespaceConflict({ ref: 'refs/locks' }), 'namespace-conflict', 'NamespaceConflict'],
    [new GitFailed({ op: 'X', exitCode: 1, stderr: 'e', message: 'm' }), 'git-failed', 'GitFailed'],
    [
      new PayloadUnreadable({ ref: 'r', sha: 's', message: 'm' }),
      'payload-unreadable',
      'PayloadUnreadable',
    ],
    [new RefLeaseError('m'), 'other', 'RefLeaseError'],
  ]
  test.each(cases)('%s', (err, kind, name) => {
    expect(err).toBeInstanceOf(RefLeaseError)
    expect(err).toBeInstanceOf(Error)
    expect(err.kind).toBe(kind)
    expect(err.name).toBe(name)
  })

  test('a subclass of RefLeaseError keeps kind other', () => {
    class Mine extends RefLeaseError {}
    expect(new Mine('m').kind).toBe('other')
  })
})

describe('CasFailed', () => {
  test('carries ref and both shas, and names them in the default message', () => {
    const e = new CasFailed({ ref: 'refs/locks/x', expectedSha: 'abc', actualSha: 'def' })
    expect([e.ref, e.expectedSha, e.actualSha]).toEqual(['refs/locks/x', 'abc', 'def'])
    expect(e.message).toBe('CAS failed on ref "refs/locks/x": expected_sha="abc" actual_sha="def"')
  })

  test('actualSha defaults to null; message overrides the default', () => {
    const e = new CasFailed({ ref: 'r', expectedSha: null, message: 'custom' })
    expect(e.actualSha).toBeNull()
    expect(e.message).toBe('custom')
  })
})

describe('RefNotFound', () => {
  test('names the ref', () => {
    const e = new RefNotFound({ ref: 'refs/locks/x' })
    expect(e.ref).toBe('refs/locks/x')
    expect(e.message).toBe('ref not found: "refs/locks/x"')
  })
})

describe('NamespaceConflict', () => {
  test('derives the namespace and includes sha and remediation', () => {
    const e = new NamespaceConflict({ ref: 'refs/locks', sha: 'abc123', remediation: 'delete it' })
    expect(e.namespace).toBe('locks')
    expect(e.message).toBe(
      'namespace conflict: a literal ref at refs/locks blocks creation of refs/locks/... ' +
        '(sha=abc123); delete it',
    )
  })

  test('a ref outside refs/ is its own namespace', () => {
    expect(new NamespaceConflict({ ref: 'locks' }).namespace).toBe('locks')
  })
})

describe('PayloadUnreadable', () => {
  test('keeps its cause', () => {
    const cause = new SyntaxError('bad')
    expect(new PayloadUnreadable({ ref: 'r', sha: 's', message: 'm', cause }).cause).toBe(cause)
  })
})
