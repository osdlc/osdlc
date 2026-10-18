// Runs the BUILT package under Node. The unit tests resolve the package name to
// the TypeScript source, so a broken emit could pass them and fail on the
// consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. check-packages.mjs copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.

import { strict as assert } from 'node:assert'

import { adapterFor, BUILTIN_AGENTS, callAgent, customAdapter, planCall } from '@osdlc/agent-call'
import { EFFORT_LEVELS } from '@osdlc/agent-call/models'

assert.deepEqual([...BUILTIN_AGENTS], ['claude', 'codex', 'antigravity', 'opencode'])
assert.deepEqual([...EFFORT_LEVELS], ['low', 'medium', 'high', 'xhigh', 'max'])

const planned = planCall(adapterFor('codex'), {
  prompt: 'hi',
  permissions: { mode: 'read-only' },
})
assert.deepEqual(planned.argv.slice(0, 2), ['codex', 'exec'])

const shout = customAdapter({
  name: 'shout',
  binary: process.execPath,
  args: (_spec, prompt) => ['-e', 'console.log(process.argv[1].toUpperCase())', prompt],
})
const result = await callAgent(shout, { prompt: 'hello' })
assert.equal(result.ok, true)
assert.equal(result.text, 'HELLO')

const missing = await callAgent(
  customAdapter({ name: 'missing', binary: 'agent-call-no-such-binary', args: () => [] }),
  {
    prompt: 'x',
  },
)
assert.equal(missing.ok, false)
assert.equal(missing.error?.reason, 'spawn-failed')

console.log('agent-call smoke: OK')
