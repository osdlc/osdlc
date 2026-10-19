import { contract, section, sections } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// A contract-BUILD-time guard: two section names that collapse to the same camelCase
// key must be rejected when contract(...) is evaluated, before any document is seen.
const v18a: ValidationFixture = {
  id: 'v18a',
  title: 'camelCase key collision (contract-build error)',
  component: 'validate',
  note:
    "The FAIL is a build-time throw (ContractBuildError on colliding camelCase keys 'Files to touch' / " +
    "'Files To Touch'), invented by the example — the original design names no such mechanism. Only the PASS " +
    'arm (GoodContract: distinct keys) is encoded as a validate() case; the build-error arm cannot be ' +
    'expressed as a Finding and is elided.',
  build: () =>
    // GoodContract: the two names reduce to distinct camelCase keys, so the build succeeds.
    contract({
      body: sections({ order: 'none', allowUnknown: true }, [
        section('Files to touch'), // → doc.body.filesToTouch
        section('Files changed'), // → doc.body.filesChanged
      ]),
    }),
  cases: [
    {
      label: 'pass — distinct camelCase keys; a conforming doc validates clean',
      source: loadCorpusSource('./18a-camelcase-key-collision.md'),
      findings: loadExpected('./18a-camelcase-key-collision.expected.json'),
    },
  ],
}

export default v18a
