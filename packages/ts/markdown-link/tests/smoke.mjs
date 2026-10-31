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
  ATTACHMENT_EXTENSIONS,
  bodyLinks,
  bodyLinksSpanned,
  displayText,
  isVaultLinkUrl,
  mdLinkTarget,
  parseInner,
  parseTypedRef,
  stripCode,
  stripCodeWith,
  targetRange,
} from '@osdlc/markdown-link'

assert.deepEqual(bodyLinksSpanned('See [[Note#h|alias]] and `[[not a link]]`'), [
  { kind: 'wikilink', raw: 'Note#h|alias', target: 'Note', alias: 'alias', start: 4, end: 20 },
])
assert.deepEqual(bodyLinks('[[A]] ![[b.png]]'), [
  { target: 'A', kind: 'wikilink' },
  { target: 'b.png', kind: 'embed' },
])
assert.equal(stripCode('a `[[x]]` b'), 'a         b')
assert.equal(stripCodeWith('a `x` b', 'skill-export'), 'a     b')
assert.equal(parseInner('Note#Heading|Alias', false)?.target, 'Note')
assert.deepEqual(targetRange('Note'), { start: 0, end: 4 })
assert.equal(isVaultLinkUrl('Notes/A.md'), true)
assert.equal(mdLinkTarget('Notes/My%20Note.md'), 'Notes/My Note')
assert.ok(ATTACHMENT_EXTENSIONS.includes('png'))
assert.equal(displayText('[[Note|the note]]'), 'the note')
assert.deepEqual(parseTypedRef('[[task/fix-it]]'), { kind: 'task', slug: 'fix-it', alias: null })

console.log('markdown-link smoke: OK')
