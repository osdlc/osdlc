// Runs the BUILT package under Node. The unit tests run the TypeScript source
// (vitest.config.ts aliases the package name to it), so a broken emit, or a
// dist/ without the wasm, could pass them and fail on the consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. check-packages.ts copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.

import { strict as assert } from 'node:assert'

import { EditError, editYaml } from '@osdlc/yaml-splice'

const encode = (text) => new TextEncoder().encode(text)
const decode = (bytes) => new TextDecoder().decode(bytes)

const out = editYaml(encode("title: 'Draft'  # note\r\nstatus: draft\r\n"), [
  { Set: { key: 'status', value: 'done' } },
])
assert.equal(out.changed, true)
assert.equal(decode(out.bytes), "title: 'Draft'  # note\r\nstatus: done\r\n")

const same = editYaml(out.bytes, [{ Set: { key: 'status', value: 'done' } }])
assert.equal(same.changed, false)

assert.throws(
  () => editYaml(encode('a: 1\nb: 2\n'), [{ Rename: { from: 'a', to: 'b' } }]),
  (err) => err instanceof EditError && err.code === 'KeyConflict' && err.span !== undefined,
)

console.log('yaml-splice smoke: OK')
