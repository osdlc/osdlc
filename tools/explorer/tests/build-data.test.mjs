// The checks in scripts/build-data.mjs. Each case copies docs/planning and the profile it extends,
// breaks one rule, and expects the problem that names it.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { buildData } from '../scripts/build-data.mjs'

const repo = resolve(import.meta.dirname, '../../..')
const planning = join(repo, 'docs/planning')
const profile = join(repo, 'profiles/planning')
const temp = mkdtempSync(join(tmpdir(), 'build-data-'))
afterAll(() => rmSync(temp, { recursive: true, force: true }))

let n = 0
/** The data built after `change` edits a fresh copy of the corpus and the profile. */
function buildAfter(change) {
  const root = join(temp, String(n++))
  const corpus = join(root, 'docs/planning')
  cpSync(planning, corpus, { recursive: true })
  cpSync(profile, join(root, 'profiles/planning'), { recursive: true })
  const edit = (file, from, to) => {
    const path = join(corpus, file)
    const text = readFileSync(path, 'utf8')
    if (!text.includes(from)) throw new Error(`${file} does not hold ${JSON.stringify(from)}`)
    writeFileSync(path, text.replace(from, to))
  }
  const add = (file, text) => writeFileSync(join(corpus, file), text)
  change({ edit, add, root })
  return buildData(corpus, root)
}

/** Problems found after `change` edits a fresh copy of the corpus. */
const problemsAfter = (change) => buildAfter(change).problems

const component = (id, language, states, twin) => `---
name: ${id}
kind: ${language === 'rust' ? 'crate' : 'package'}
language: ${language}
layer: "[files](../layers/files.md)"
states: [${states.join(', ')}]
status: planned
twin: "[${twin}](${twin}.md)"
---

A test component.
`

describe('build-data', () => {
  it('builds the real records with no problems, and matches the committed JSON', () => {
    const data = buildData(planning, repo)
    expect(data.problems).toEqual([])
    for (const [name, value] of [['ecosystem.json', data.ecosystem], ['plan.json', data.plan]])
      expect(`${JSON.stringify(value, null, 2)}\n`, `${name} is out of date; run pnpm build-data`).toBe(
        readFileSync(join(repo, 'tools/explorer/data', name), 'utf8'),
      )
  })

  it('matches the committed checklist in BEELINE.md', () => {
    const { beeline } = buildData(planning, repo)
    expect(beeline, 'BEELINE.md is out of date; run pnpm build-data').toBe(readFileSync(join(planning, 'BEELINE.md'), 'utf8'))
  })

  it('reads a task pull requests as links', () => {
    const { plan } = buildData(planning, repo)
    expect(plan.tasks.find((t) => t.id === 47).prs).toEqual([
      { label: 'sksizer/dev#4069', url: 'https://github.com/sksizer/dev/pull/4069' },
      { label: 'sksizer/dev#4070', url: 'https://github.com/sksizer/dev/pull/4070' },
    ])
  })

  it('needs both markers in BEELINE.md', () => {
    const problems = problemsAfter(({ edit }) => edit('BEELINE.md', '<!-- beeline:end -->', ''))
    expect(problems).toEqual([
      'docs/planning/BEELINE.md: (body): needs a <!-- beeline:start --> line and a <!-- beeline:end --> line after it',
    ])
  })

  it('builds no checklist for a corpus with no BEELINE.md', () => {
    const data = buildAfter(({ root }) => rmSync(join(root, 'docs/planning/BEELINE.md')))
    expect(data.problems).toEqual([])
    expect(data.beeline).toBeNull()
  })

  it('derives milestone status and keeps the beeline flag', () => {
    const { plan } = buildData(planning, repo)
    const release = plan.milestones.find((m) => m.id === 'm-release')
    expect(release.beeline).toBe(true)
    expect(release.status).toBe('doing')
    expect(plan.milestones.find((m) => m.id === 'm-query').beeline).toBe(false)
  })

  it('keeps each milestone phase and reads the phase labels from the local schema', () => {
    const { plan } = buildData(planning, repo)
    expect(plan.phases).toEqual([
      { id: 'store', label: 'Store' },
      { id: 'model', label: 'Model' },
      { id: 'harness', label: 'Harness' },
    ])
    expect(plan.milestones.find((m) => m.id === 'm-release').phase).toBe('store')
    expect(plan.milestones.every((m) => plan.phases.some((p) => p.id === m.phase))).toBe(true)
  })

  it('passes on a missing phase from the validator', () => {
    const problems = problemsAfter(({ edit }) => edit('milestones/m-query.md', 'phase: store\n', ''))
    expect(problems).toContainEqual(expect.stringMatching(/milestones\/m-query\.md: phase: required/))
  })

  it('reads the status labels from a profile schema in YAML', () => {
    const { plan } = buildData(planning, repo)
    const data = buildAfter(({ root }) => {
      const dir = join(root, 'profiles/planning/tasks')
      const text = readFileSync(join(dir, 'tasks.schema.md'), 'utf8')
      writeFileSync(join(dir, 'tasks.schema.yaml'), text.split('---\n')[1])
      rmSync(join(dir, 'tasks.schema.md'))
    })
    expect(data.problems).toEqual([])
    expect(data.plan.statuses).toEqual(plan.statuses)
  })

  it('reads a parent by path only', () => {
    const problems = problemsAfter(({ edit, root }) => {
      cpSync(join(root, 'profiles/planning'), join(root, 'node_modules/@osdlc/corpus-profile-planning'), { recursive: true })
      edit('corpus-schema.md', 'plan: ../../profiles/planning', 'plan: "@osdlc/corpus-profile-planning"')
    })
    expect(problems).toEqual([
      'docs/planning/tasks/tasks.schema.md: x-extends: build-data reads a parent by path only, not @osdlc/corpus-profile-planning',
    ])
  })

  it('names the schema file it was reading when x-extends fails', () => {
    const problems = problemsAfter(({ edit, root }) => {
      cpSync(join(root, 'profiles/planning'), join(root, 'node_modules/@osdlc/corpus-profile-planning'), { recursive: true })
      edit('corpus-schema.md', 'plan: ../../profiles/planning', 'plan: "@osdlc/corpus-profile-planning"')
      const dir = join(root, 'docs/planning/tasks')
      writeFileSync(join(dir, 'tasks.schema.yaml'), readFileSync(join(dir, 'tasks.schema.md'), 'utf8').split('---\n')[1])
      rmSync(join(dir, 'tasks.schema.md'))
    })
    expect(problems).toEqual([
      'docs/planning/tasks/tasks.schema.yaml: x-extends: build-data reads a parent by path only, not @osdlc/corpus-profile-planning',
    ])
  })

  it('passes on the validator problems', () => {
    const problems = problemsAfter(({ edit }) =>
      edit('tasks/4 Claims example.md', '3%20Publish%200.2.0.md', '3%20Publish%200.3.0.md'),
    )
    expect(problems.join('\n')).toMatch(/tasks\/4 Claims example\.md: after: .*no such file/)
  })

  it('checks that a task file name starts with its number', () => {
    const problems = problemsAfter(({ edit }) => edit('tasks/6 x-warn.md', 'number: 6\n', 'number: 60\n'))
    expect(problems).toContainEqual(expect.stringMatching(/6 x-warn\.md: number: the file name must start with the number, 60/))
  })

  it('checks that task numbers are unique', () => {
    const problems = problemsAfter(({ edit }) => edit('tasks/7 Obsidian.md', 'number: 7\n', 'number: 6\n'))
    expect(problems).toContainEqual(expect.stringMatching(/tasks: number: 6 is used by more than one task/))
  })

  it('checks that a task is listed in its milestone', () => {
    const problems = problemsAfter(({ edit }) =>
      edit('milestones/m-release.md', 'tasks:\n  - "[21 Release here](../tasks/21%20Release%20here.md)"\n', 'tasks: []\n'),
    )
    expect(problems).toContainEqual(expect.stringMatching(/21 Release here\.md: milestone: m-release must list this task once/))
  })

  it('checks for an after cycle', () => {
    const problems = problemsAfter(({ edit }) =>
      edit('tasks/3 Publish 0.2.0.md', 'after:\n', 'after:\n  - "[4 Claims example](4%20Claims%20example.md)"\n'),
    )
    expect(problems).toContainEqual(expect.stringMatching(/after: cycle .*3 -> 4 -> 3/))
  })

  it('checks that twins name each other', () => {
    const problems = problemsAfter(({ edit }) =>
      edit('components/markdown-link.md', 'twin: "[markdown-link-rs](markdown-link-rs.md)"\n', ''),
    )
    expect(problems).toContainEqual(expect.stringMatching(/markdown-link-rs\.md: twin: markdown-link must name markdown-link-rs/))
  })

  it('checks that twins differ in language', () => {
    const problems = problemsAfter(({ edit }) => edit('components/markdown-link-rs.md', 'language: rust', 'language: ts'))
    expect(problems).toContainEqual(expect.stringMatching(/twin: twins must differ in language/))
  })

  it('checks that twins share a state', () => {
    const problems = problemsAfter(({ add }) => {
      add('components/zz-a-rs.md', component('zz-a-rs', 'rust', ['present'], 'zz-a'))
      add('components/zz-a.md', component('zz-a', 'ts', ['target'], 'zz-a-rs'))
    })
    expect(problems).toContainEqual(expect.stringMatching(/zz-a-rs\.md: twin: zz-a-rs and zz-a share no state/))
  })

  it("checks that an edge's states are in both components' states", () => {
    const problems = problemsAfter(({ edit }) => edit('components/markdown-vault.md', 'depends_going:', 'depends:'))
    expect(problems).toContainEqual(
      expect.stringMatching(/markdown-vault\.md: depends: the edge to frontmatter-lossless is in present and target/),
    )
  })

  it('checks for a duplicate edge', () => {
    const line = '  - "[frontmatter-lossless](frontmatter-lossless.md)"\n'
    const problems = problemsAfter(({ edit }) => edit('components/markdown-vault.md', line, line + line))
    expect(problems).toContainEqual(expect.stringMatching(/markdown-vault\.md: depends_going: frontmatter-lossless is listed twice/))
  })

  it('checks that an edge note matches an edge', () => {
    const problems = problemsAfter(({ edit }) => edit('components/corpus-schema-ts.md', 'edge: validates', 'edge: reads'))
    expect(problems).toContainEqual(expect.stringMatching(/corpus-schema-ts\.md: edge_notes: no reads edge to harness-beta-corpus/))
  })

  it('checks that a repo is set only for a state the component is in', () => {
    const problems = problemsAfter(({ edit }) =>
      edit('components/markdown-corpus.md', 'repo_target:', 'repo_present: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"\nrepo_target:'),
    )
    expect(problems).toContainEqual(expect.stringMatching(/markdown-corpus\.md: repo_present: set, but present is not in states/))
  })

  it('reads only a Notes section in a component body', () => {
    const problems = problemsAfter(({ edit }) => edit('components/markdown-vault.md', '## Notes', '## Extra\n\nMore.\n\n## Notes'))
    expect(problems).toContainEqual(expect.stringMatching(/markdown-vault\.md: body: unknown section "## Extra"/))
  })

  describe('overlaps', () => {
    const dev = 'overlaps/markdown-link-dev-copy overlaps markdown-link.md'

    it('checks that the id names from and to', () => {
      const problems = problemsAfter(({ edit }) => edit(dev, '../components/markdown-link.md', '../components/markdown-tags.md'))
      expect(problems).toContainEqual(expect.stringMatching(/\(id\): name it "markdown-link-dev-copy overlaps markdown-tags"/))
    })

    it('checks that an overlap never joins twins', () => {
      const problems = problemsAfter(({ add }) =>
        add(
          'overlaps/markdown-link-rs overlaps markdown-link.md',
          readFileSync(join(planning, dev), 'utf8').replace('markdown-link-dev-copy.md', 'markdown-link-rs.md'),
        ),
      )
      expect(problems).toContainEqual(expect.stringMatching(/\(data\): an overlap never joins twins/))
    })

    it('checks for one overlap per pair', () => {
      const problems = problemsAfter(({ add }) =>
        add(
          'overlaps/markdown-link overlaps markdown-link-dev-copy.md',
          readFileSync(join(planning, dev), 'utf8')
            .replace('../components/markdown-link-dev-copy.md', '@@')
            .replace('../components/markdown-link.md', '../components/markdown-link-dev-copy.md')
            .replace('@@', '../components/markdown-link.md'),
        ),
      )
      expect(problems).toContainEqual(expect.stringMatching(/already have an overlap/))
    })
  })
})
