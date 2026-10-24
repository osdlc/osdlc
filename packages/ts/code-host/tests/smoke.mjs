// Runs the built package under Node. The unit tests run the TypeScript source
// (vitest.config.ts aliases the package name to it), so dist/ is compiled but
// never run anywhere else. A broken emit passes every other check and fails on
// the consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. check-packages.ts copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.

import { strict as assert } from 'node:assert'

import {
  CodeHostUnsupported,
  codeHostNameForRemote,
  parsePrInput,
  selectCodeHost,
} from '@osdlc/code-host'

// The adapter is chosen from the origin remote.
assert.equal(codeHostNameForRemote('git@github.com:acme/widgets.git', null), 'github')
assert.equal(codeHostNameForRemote('https://codeberg.org/acme/widgets.git', null), 'forgejo')
assert.equal(codeHostNameForRemote(null, null), 'github')
assert.equal(codeHostNameForRemote('https://github.com/a/b.git', 'forgejo'), 'forgejo')

// A PR argument is a number, #n, owner/repo#n or a URL.
assert.deepEqual(parsePrInput('42'), { kind: 'number', number: 42 })
assert.deepEqual(parsePrInput('#7'), { kind: 'number', number: 7 })
assert.deepEqual(parsePrInput('acme/widgets#9'), {
  kind: 'slug',
  owner: 'acme',
  repo: 'widgets',
  number: 9,
})
assert.deepEqual(parsePrInput('https://github.com/acme/widgets/pull/3'), {
  kind: 'url',
  ref: { codeHost: 'github', owner: 'acme', repo: 'widgets', number: 3 },
})
assert.equal(parsePrInput('not a pr'), null)

// A fake runner stands in for git and gh, so nothing is spawned.
const ok = (stdout) => ({ exitCode: 0, stdout, stderr: '' })
const git = {
  run: (argv) =>
    argv[0] === 'remote' && argv[1] === 'get-url'
      ? ok('https://github.com/acme/widgets.git\n')
      : ok(''),
}
const selected = selectCodeHost('/repo', { git, gh: { run: () => ok('') } })
assert.equal(selected.ok, true)
const host = selected.value
assert.equal(host.name, 'github')
assert.equal(typeof host.getPr, 'function')
assert.equal(typeof CodeHostUnsupported, 'function')

// A failed query is a classified failure, not null: a missing gh reads as `not-installed`.
const missingGh = selectCodeHost('/repo', {
  git,
  gh: {
    run: () => ({
      exitCode: 1,
      stdout: '',
      stderr: '',
      neverExited: true,
      reason: 'spawn',
      error: 'spawn gh ENOENT',
    }),
  },
})
const listed = missingGh.value.listPrs({})
assert.equal(listed.ok, false)
assert.equal(listed.error.kind, 'not-installed')
assert.equal(listed.error.host, 'github')

console.log('code-host smoke: OK')
