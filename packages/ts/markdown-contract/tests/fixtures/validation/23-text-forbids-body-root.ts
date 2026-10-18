import { contract, section, sections, textRule } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// body-root `forbids`: a phrase must be ABSENT from the WHOLE document.
// `textRule({ forbids: [...] })` attaches to the contract's `rules` slot and compiles to a
// cross-plane docRule over the whole-document text. `normalize: false` matches exact bytes —
// a retired path class that must appear nowhere ('s worked `}scripts/` example).
//
// Greened by (the matcher + builders are live). The expected finding id is the
// synthesized per-entry id `text/forbids/doc/<patternHash>`. The forbid pins at the exact
// offending line: the `DocRule` now also receives the projected tree, so the
// whole-document scope text is reconstructed from `tree.root` at real source lines. The
// forbidden `}scripts/` sits on source line 3 (line 1 `## Summary`, line 2 blank, line 3 the
// prose), so the finding anchors at line 3 — not the coarsened post-heading line 2 the typed
// model alone could see. See the builder.
const v23: ValidationFixture = {
  id: 'v23',
  title: 'Body-root forbids — phrase must appear nowhere in the document',
  component: 'text-api',
  path: 'docs/skill.md',
  build: () =>
    contract({
      body: sections({ order: 'recognized-relative', allowUnknown: true }, [section('Summary')]),
      rules: [
        textRule({
          forbids: [
            {
              pattern: '}scripts/',
              normalize: false,
              note: 'route through the op substrate (sdlc <noun> <verb>)',
            },
          ],
        }),
      ],
    }),
  cases: [
    {
      label: 'pass — the forbidden path class appears nowhere',
      source: loadCorpusSource('./23-text-forbids-body-root.pass.md'),
      findings: loadExpected('./23-text-forbids-body-root.pass.expected.json'),
    },
    {
      label: 'fail — the document still reaches into }scripts/; the forbid fires at the line',
      source: loadCorpusSource('./23-text-forbids-body-root.fail.md'),
      findings: loadExpected('./23-text-forbids-body-root.fail.expected.json'),
    },
  ],
  note: 'Synthesized id `text/forbids/doc/<hash>`; the whole-document scope uses the projected tree, so the forbid pins at the exact offending source line (3).',
}

export default v23
