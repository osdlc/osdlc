// Runs the BUILT package under Node. The unit tests run the TypeScript source
// (vitest.config.ts aliases the package name to it), so dist/ is compiled but
// never run anywhere else. A broken emit passes every other check and fails on
// the consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. `package-checks ts` copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.

import { strict as assert } from 'node:assert'

import { decode, diff, encode, merge } from '@osdlc/spec-query'

const defaults = { q: '', page: 1, open: false, tags: ['a'] }
const value = { q: 'x y', page: 2, open: false, tags: ['a'] }

assert.deepEqual(diff(value, defaults), { q: 'x y', page: 2 })
assert.deepEqual(merge({ page: 3 }, defaults), { ...defaults, page: 3 })

const query = encode(value, defaults)
assert.equal(typeof query, 'string')
assert.deepEqual(decode(query, defaults), value)
assert.equal(encode(defaults, defaults), '')

process.stdout.write('spec-query smoke: OK\n')
