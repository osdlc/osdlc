// Runs the BUILT package under Node. The unit tests resolve the package name to
// the TypeScript source, so a broken emit could pass them and fail on the
// consumer's machine.
//
// Imports the package by name and no other repo file: `pnpm run check:packages`
// runs it from an installed tarball. See packages/README.md, "smoke check".

import { strict as assert } from 'node:assert'

import {
  BUILTIN_QUERY,
  chooseFromProfile,
  parseProfile,
  parseRef,
  resolveRef,
} from '@osdlc/agent-router'
import { profilesSection, routerSection, routingSection } from '@osdlc/agent-router/config'

// The snapshot is a JSON import inside dist/: a query over it answers.
assert.ok(BUILTIN_QUERY.knownTools().includes('claude'))

const ref = parseRef('claude/max@high')
assert.ok(ref.ok)
const resolved = resolveRef(ref.value, { catalogue: BUILTIN_QUERY })
assert.ok(resolved.ok)
assert.equal(resolved.value.tool, 'claude')

const profile = parseProfile(['codex/max', 'claude/opus@high'])
assert.ok(profile.ok)
const choice = chooseFromProfile(profile.value, {
  catalogue: BUILTIN_QUERY,
  isAvailable: (r) => (r.tool === 'codex' ? { ok: false, reason: 'not-signed-in' } : { ok: true }),
})
assert.equal(choice.summary, 'chosen: claude/opus@high')

// Typed errors, never a throw.
const bad = parseRef('claude/max@hgih')
assert.ok(!bad.ok)
assert.equal(bad.error.kind, 'unknown-effort')

// The ./config subpath loads, with its peers: zod, and the optional @osdlc/config-layers.
for (const section of [profilesSection, routerSection, routingSection]) {
  assert.equal(typeof section, 'function')
}
