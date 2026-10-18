import { z } from 'zod'
import { contract, section, sections, table } from '../../../src/index.js'
import type { ValidationFixture } from '../../harness.js'
import { loadCorpusSource, loadExpected } from '../../harness.js'

// The object model as a consumer surface: read(), TableView iteration, byAnchor,
// dual-key access. The FAIL arm shows read()'s error door (a cell outside the enum).
const v18: ValidationFixture = {
  id: 'v18',
  title: 'Object-model consumption: typed rows, byAnchor, dual-key',
  component: 'consumption',
  path: 'docs/.../tasks/T-0042.md',
  build: () => {
    const TaskFrontmatter = z
      .object({
        id: z.string().regex(/^T-[0-9A-Z]{4}$/),
        status: z.enum(['open/ready', 'in-progress/active', 'closed/done']),
      })
      .strict()

    return contract({
      frontmatter: TaskFrontmatter,
      body: sections({ order: 'recognized-relative', allowUnknown: true }, [
        section('Files to touch', {
          content: table({
            columns: ['Location', 'Kind', 'Change'],
            cells: { Kind: z.enum(['new', 'modify', 'delete']) },
          }),
        }),
      ]),
    })
  },
  cases: [
    {
      label: 'pass — frontmatter matches; typed Files-to-touch table promotes to a field',
      source: loadCorpusSource('./18-oom-consumption-typed-views.pass.md'),
      findings: loadExpected('./18-oom-consumption-typed-views.pass.expected.json'),
    },
    {
      label: "fail — row 1 Kind 'rename' outside the enum; read() error door",
      source: loadCorpusSource('./18-oom-consumption-typed-views.fail.md'),
      // Reconciled (matches v11/v11a/v20b): the content plane's id scheme is
      // `content/<leaf>/<check>`, so a cell-enum violation is `content/table/cell`, not the
      // the original example's best-effort `table/cell`. Row-precise pos: the offending `rename` row is on
      // line 10 (frontmatter 1-4, blank 5, heading 6, blank 7, header 8, separator 9, data 10);
      // the original example's `line: 5` miscounted.
      findings: loadExpected('./18-oom-consumption-typed-views.fail.expected.json'),
    },
  ],
}

export default v18
