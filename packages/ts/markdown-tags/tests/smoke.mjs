// Runs the built package under Node. The unit tests resolve the package name to
// the TypeScript source, so a broken emit could pass them and fail on the
// consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. check-packages.ts copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.

import { strict as assert } from 'node:assert'

import {
  DEFAULT_TAG_DIALECT,
  TAG_DIALECTS,
  extractBoth,
  inlineTags,
  isTagDialect,
  tagAt,
} from '@osdlc/markdown-tags'

assert.equal(DEFAULT_TAG_DIALECT, 'obsidian')
assert.deepEqual(TAG_DIALECTS, ['obsidian', 'unicode', 'ascii'])
assert.deepEqual(inlineTags('see #health\n```\n#code\n```'), ['health'])
assert.deepEqual(inlineTags('```\n#code\n```', 'unicode'), ['code'])
assert.deepEqual(extractBoth('#a (#b)'), [['a'], ['a', 'b']])
assert.equal(tagAt('x #nested/tag y', 2), 'nested/tag')
assert.equal(isTagDialect('ascii'), true)
assert.equal(isTagDialect('Ascii'), false)

console.log('markdown-tags smoke: OK')
