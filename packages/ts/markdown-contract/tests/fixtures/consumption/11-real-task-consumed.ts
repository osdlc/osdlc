import { z } from 'zod'
import {
  contract,
  docRule,
  list,
  oneOf,
  optional,
  section,
  sections,
  table,
} from '../../../src/index.js'
import type { ConsumptionFixture } from '../../harness.js'
import { loadSource } from '../../harness.js'

// The capstone: the TaskContract read end-to-end on a real open Task — dual-key access,
// TableView iteration, nested .sections, and absent-optional reads at once. Reuses validation v20's
// TaskContract + its open-task sample document. Frontmatter and the cross-plane docRule are inlined
// here so the fixture is self-contained.

// The frontmatter schema (the live TaskFrontmatter, abbreviated to the sample's keys).
const TaskFrontmatter = z
  .object({
    id: z.string().regex(/^T-[0-9A-Z]{4}$/),
    type: z.literal('task'),
    status: z.enum(['open/ready', 'in-progress/active', 'closed/done']),
    title: z.string().min(1),
    tags: z.array(z.string()).default([]),
    impact: z.enum(['low', 'medium', 'high']),
    complexity: z.enum(['small', 'medium', 'large']),
  })
  .strict()

// G3 — a worked task must carry a ## Post-mortem section. An open task is not worked, so this is dormant.
const isWorked = (status: string): boolean =>
  status.startsWith('in-progress/') || status.startsWith('closed/')

const c11: ConsumptionFixture = {
  id: 'c11',
  title: 'Real Task consumed end-to-end',
  component: 'consumption',
  path: 'docs/planning/tasks/T-AB12.md',
  source: loadSource(import.meta.url, './11-real-task-consumed.md'),
  build: () =>
    contract({
      frontmatter: TaskFrontmatter,
      body: sections({ order: 'recognized-relative', allowUnknown: true }, [
        oneOf(['Goal', 'Goal / Problem statement']),
        optional(section('Today')), // G2
        section('Files to touch', {
          optional: true,
          content: table({
            columns: ['Location', 'Kind', 'Change'],
            cells: { Kind: z.enum(['new', 'modify', 'delete']) }, // G1
          }),
        }),
        section('Acceptance criteria', {
          content: list({ everyItem: 'checkbox', minItems: 1 }),
        }),
        optional(
          section('Post-mortem', {
            // G3 — three H3s
            children: sections({ order: 'strict', allowUnknown: false }, [
              section('Acceptance criteria coverage'),
              section('What worked'),
              section('Friction and automation gaps'),
            ]),
          }),
        ),
      ]),
      rules: [
        docRule('task/post-mortem-when-worked', (doc, ctx) =>
          isWorked((doc.frontmatter as any).status) && !(doc.body as any).section('Post-mortem')
            ? [
                ctx.finding({
                  id: 'task/post-mortem-when-worked',
                  message: 'a worked task must include a ## Post-mortem section',
                }),
              ]
            : [],
        ),
      ],
    }),
  reads: [
    {
      label: "doc.frontmatter.id === 'T-AB12'",
      get: (doc) => (doc.frontmatter as any).id,
      equals: 'T-AB12',
    },
    {
      label: "doc.frontmatter.status === 'open/ready'",
      get: (doc) => (doc.frontmatter as any).status,
      equals: 'open/ready',
    },
    {
      label: "doc.body['Files to touch'] === doc.body.filesToTouch — same SectionView",
      get: (doc) => (doc.body as any)['Files to touch'] === (doc.body as any).filesToTouch,
      equals: true,
    },
    {
      label: 'doc.body.filesToTouch.rowCount === 2',
      get: (doc) => (doc.body as any).filesToTouch.rowCount,
      equals: 2,
    },
    {
      label:
        "files.find(r => r.Kind === 'delete')?.Location === undefined — typed lookup, none here",
      get: (doc) => (doc.body as any).filesToTouch.find((r: any) => r.Kind === 'delete')?.Location,
      equals: undefined,
    },
    {
      label: 'doc.body.acceptanceCriteria.lists[0].items.length === 2',
      get: (doc) => (doc.body as any).acceptanceCriteria.lists[0].items.length,
      equals: 2,
    },
    {
      label: 'doc.body.today === undefined — optional + absent on this doc',
      get: (doc) => (doc.body as any).today,
      equals: undefined,
    },
    {
      label: 'doc.body.postMortem === undefined — absent on an open task',
      get: (doc) => (doc.body as any).postMortem,
      equals: undefined,
    },
    {
      label:
        'pm?.sections.whatWorked.text() === undefined — pm absent, optional chaining short-circuits',
      get: (doc) => (doc.body as any).postMortem?.sections.whatWorked.text(),
      equals: undefined,
    },
    {
      label: "pm?.sections['Acceptance criteria coverage'] === undefined — pm absent",
      get: (doc) => (doc.body as any).postMortem?.sections['Acceptance criteria coverage'],
      equals: undefined,
    },
  ],
}

export default c11
