/**
 * Add a rule source of your own beside CLAUDE.md and AGENTS.md: here, a style
 * guide that governs every Markdown file wherever it sits.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { instructionFiles, reviewChanges, type RuleSourceProvider } from '@osdlc/rule-review'

const styleGuide: RuleSourceProvider = {
  id: 'style-guide',
  async discover({ projectRoot }) {
    return [
      {
        id: 'style:docs/STYLE.md',
        kind: 'style',
        path: 'docs/STYLE.md',
        depth: 0,
        patterns: ['**/*.md'],
        text: readFileSync(join(projectRoot, 'docs/STYLE.md'), 'utf8'),
        label: 'Style guide (Markdown files)',
      },
    ]
  },
}

const run = await reviewChanges({ base: 'main', providers: [instructionFiles(), styleGuide] })
console.log(`${run.findings.length} findings from ${run.jobs.length} judgements`)
