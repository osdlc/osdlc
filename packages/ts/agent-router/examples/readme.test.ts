import { expect, test } from 'vitest'
import {
  authorRule,
  chooseFromProfile,
  layerCatalogue,
  parseProfile,
  queryCatalogue,
  SNAPSHOT_LAYER,
} from '@osdlc/agent-router'

// The README example, run through the package name.
test('the README example chooses an entry from a profile', () => {
  const catalogue = queryCatalogue(layerCatalogue([SNAPSHOT_LAYER]), {
    pins: { 'codex/max': 'gpt-6.1-sol' },
  })

  const profile = parseProfile(['codex/max', 'claude/opus-5.5@high'])
  if (!profile.ok) throw new Error(profile.error.message)

  const choice = chooseFromProfile(profile.value, {
    catalogue,
    isAvailable: () => ({ ok: true }),
    authorRule: authorRule({ not_the_author: true, if_only_author_left: 'different-model' }),
    author: { tool: 'claude', model: 'opus' },
  })

  expect(['chosen', 'wait', 'person', 'none', 'invalid']).toContain(choice.kind)
  expect(typeof choice.summary).toBe('string')
})
