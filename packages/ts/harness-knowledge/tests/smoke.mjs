// Runs the BUILT package under Node. It imports the package by name, so Node
// resolves it through `exports` as a consumer would. check-packages.ts copies
// it into a clean project that installed the tarball, so it must not import
// other repo files.
import { strict as assert } from 'node:assert'

import { fact, loadKnowledge, lookup } from '@osdlc/harness-knowledge'
import knowledge from '@osdlc/harness-knowledge/data/harness-knowledge.json' with { type: 'json' }
import schema from '@osdlc/harness-knowledge/data/harness-knowledge.schema.json' with { type: 'json' }

const k = loadKnowledge()
assert.equal(k.schema, 1)
assert.equal(knowledge.corpus.commit, k.corpus.commit)
assert.equal(typeof schema.$schema, 'string')
assert.ok(lookup(k, 'codex', 'skills/user-dirs')?.basis.startsWith('https://'))
assert.deepEqual(fact('codex', 'skills/user-dirs')?.dirs, ['~/.agents/skills'])
