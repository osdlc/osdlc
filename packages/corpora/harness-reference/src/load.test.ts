import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'

import { cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  BUNDLE,
  PROBES,
  ROOT,
  load,
  parseConcept,
  pathSpellingIssues,
  repoRoot,
  semverOrder,
} from './load.ts'
import { type Change, changes, current, currentSet, renderSite } from './render.ts'
import type { Fact, Observation } from './schema.ts'
import { checkSchemas } from './validate.ts'

const REPO = repoRoot(ROOT)
let copy = ''
let probes = ''

before(() => {
  copy = mkdtempSync(join(tmpdir(), 'harness-reference-'))
  cpSync(BUNDLE, copy, { recursive: true })
  probes = mkdtempSync(join(tmpdir(), 'harness-reference-probes-'))
  cpSync(PROBES, probes, { recursive: true })
})
after(() => {
  rmSync(copy, { recursive: true, force: true })
  rmSync(probes, { recursive: true, force: true })
})

/**
 * Load the shared copies with one file rewritten, then put the file back.
 * `rel` is inside the bundle, or inside probes/ when it starts with `probes/`.
 */
function loadWith(rel: string, edit: (text: string) => string): string[] {
  const path = rel.startsWith('probes/')
    ? join(probes, rel.slice('probes/'.length))
    : join(copy, rel)
  const original = readFileSync(path, 'utf8')
  const edited = edit(original)
  if (edited === original) throw new Error(`edit to ${rel} changed nothing`)
  writeFileSync(path, edited)
  try {
    return load(copy, REPO, probes).errors
  } finally {
    writeFileSync(path, original)
  }
}

const has = (errors: string[], part: string): boolean => errors.some((e) => e.includes(part))

describe('the bundle', () => {
  test('validates', () => {
    const { dataset, errors } = load()
    assert.deepEqual(errors, [])
    assert.ok((dataset?.facts.length ?? 0) > 0)
  })

  test('schema/*.json matches src/schema.ts', () => {
    assert.deepEqual(checkSchemas(join(ROOT, 'schema'), false), [])
  })
})

describe('path spelling in values', () => {
  test('canonical paths pass', () => {
    for (const s of [
      '.agents/skills',
      '~/.agents/skills',
      '$CODEX_HOME/skills',
      '$CWD/../.agents/skills',
      '<repo_root>/.grok/skills',
      '<cwd>/.pi/skills',
      '.grok/plugins (project, needs trust)',
      'optional scripts/, references/, assets/',
    ])
      assert.deepEqual(pathSpellingIssues(s), [], s)
  })

  test('non-canonical paths are flagged', () => {
    for (const s of [
      '.agents/skills/',
      '~/.grok/plugins/ (user)',
      'moved from ~/.codex/skills/.',
      '~/.codex/skills/: deprecated',
      'reads .claude/skills/?',
      './.grok/skills',
      '<proj>/.dsh/skills',
      '<project>/.agents/skills',
      '<home>/.gemini/extensions',
      '$HOME/.agents/skills',
      '${HOME}/.agents/skills',
    ])
      assert.equal(pathSpellingIssues(s).length, 1, s)
  })

  test('a trailing slash in a fact value is refused', () => {
    const errors = loadWith('facts/claude-code/skills/project-dirs.md', (t) =>
      t.replace('dirs: [".claude/skills"]', 'dirs: [".claude/skills/"]'),
    )
    assert.ok(has(errors, 'drop the trailing slash in ".claude/skills/"'))
  })

  test('shell commands keep their own spelling', () => {
    const errors = loadWith('facts/pi/plugins/install.md', (t) =>
      t.replace('[pi install ./dir,', '[pi install ./other/,'),
    )
    assert.deepEqual(errors, [])
  })
})

describe('validation', () => {
  const fact = 'facts/claude-code/skills/prequalified-name.md'

  test('a concept without type fails OKF conformance', () => {
    const errors = loadWith(fact, (t) => t.replace('type: Harness Fact\n', ''))
    assert.ok(has(errors, 'non-empty `type`'))
  })

  test('until before since is refused', () => {
    const errors = loadWith(fact, (t) =>
      t.replace('since: null\n    until: "2.1.246"', 'since: "2.1.300"\n    until: "2.1.246"'),
    )
    assert.ok(has(errors, 'since must come before until'))
  })

  test('pre-release versions compare numerically', () => {
    const errors = loadWith(fact, (t) =>
      t.replace(
        'since: null\n    until: "2.1.246"',
        'since: "1.0.0-alpha.2"\n    until: "1.0.0-alpha.10"',
      ),
    )
    assert.ok(!has(errors, 'since must come before until'))
  })

  test('observations out of date order are refused', () => {
    const errors = loadWith(fact, (t) =>
      t.replace('observed: "2026-10-01"', 'observed: "2026-12-01"'),
    )
    assert.ok(has(errors, 'observations must be oldest first'))
  })

  test('a cited source id must be in sources', () => {
    const errors = loadWith(fact, (t) => t.replace('source: claude-changelog', 'source: nowhere'))
    assert.ok(has(errors, 'source "nowhere" is not in sources'))
  })

  test('a source no observation cites is refused', () => {
    const errors = loadWith(fact, (t) =>
      t.replace(
        'sources:\n',
        'sources:\n  - id: unused\n    resource: "https://example.com/"\n    title: Unused\n',
      ),
    )
    assert.ok(has(errors, 'sources entry "unused" is never cited'))
  })

  test('a footnote naming no source is refused', () => {
    const errors = loadWith(fact, (t) => `${t}\nSee this.[^missing]\n`)
    assert.ok(has(errors, 'footnote [^missing] names no sources entry'))
  })

  test('a repository link must resolve', () => {
    const errors = loadWith(fact, (t) =>
      t.replace('sources/skill-naming-across-harnesses.md', 'sources/no-such-note.md'),
    )
    assert.ok(has(errors, 'no-such-note.md does not exist in the repository'))
  })

  test('a subject must match the path', () => {
    const errors = loadWith(fact, (t) =>
      t.replace('subject: skills/prequalified-name', 'subject: skills/name-source'),
    )
    assert.ok(has(errors, 'must match the path'))
  })

  test('a harness must match the path', () => {
    const errors = loadWith(fact, (t) => t.replace('harness: claude-code', 'harness: codex'))
    assert.ok(has(errors, 'harness "codex" must match the path'))
  })

  test('two facts for one harness and subject are refused', () => {
    const errors = loadWith('facts/codex/skills/name-source.md', (t) =>
      t.replace('subject: skills/name-source', 'subject: skills/user-dirs'),
    )
    assert.ok(has(errors, 'duplicate fact for codex skills/user-dirs'))
  })

  test('a version on a harness with no known versioning is refused', () => {
    const errors = loadWith('facts/antigravity/skills/agents-dir.md', (t) =>
      t.replace('since: null', 'since: 1.0.0'),
    )
    assert.ok(has(errors, 'no known versioning'))
  })
})

describe('probes and models', () => {
  const run = 'facts/claude-code/cli/session-env.md'

  test('a run observation must name its probe', () => {
    const errors = loadWith(run, (t) => t.replace('    probe: claude-session-env\n', ''))
    assert.ok(has(errors, 'evidence run needs a probe'))
  })

  test('a run observation must carry checked_version', () => {
    const errors = loadWith(run, (t) => t.replace('    checked_version: "2.1.294"\n', ''))
    assert.ok(has(errors, 'evidence run needs a checked_version'))
  })

  test('a probe must exist', () => {
    const errors = loadWith(run, (t) => t.replace('probe: claude-session-env', 'probe: no-such'))
    assert.ok(has(errors, 'probe "no-such" has no probes/no-such/probe.md'))
  })

  test('a probe needs evidence run', () => {
    const errors = loadWith(run, (t) => t.replace('evidence: run', 'evidence: docs'))
    assert.ok(has(errors, 'probe is set, but evidence is not run'))
  })

  test("a probe must list the fact's subject", () => {
    const errors = loadWith('probes/claude-session-env/probe.md', (t) =>
      t.replace('subjects: [cli/session-env]', 'subjects: [cli/headless]'),
    )
    assert.ok(has(errors, 'does not list subject cli/session-env'))
  })

  test('a probe needs commands for each harness it lists', () => {
    const errors = loadWith('probes/claude-session-env/probe.md', (t) =>
      t.replace('harnesses: [claude-code]', 'harnesses: [claude-code, codex]'),
    )
    assert.ok(has(errors, 'no commands for harness "codex"'))
  })

  test('a probe command may not name a home directory', () => {
    for (const command of [
      'ls /home/someone/.claude',
      'ls ~/.claude',
      'cat $HOME/.cursor/x',
      'cat ${HOME}/.cursor/x',
      'PATH=a:/Users/someone/bin claude',
      'echo $(ls /Users/someone)',
    ]) {
      const errors = loadWith('probes/claude-session-env/probe.md', (t) =>
        t.replace('"claude --version"', JSON.stringify(command)),
      )
      assert.ok(has(errors, 'names a home directory'), command)
    }
  })

  test('two same-date observations may not answer the same key', () => {
    const errors = loadWith('facts/agent-skills/skills/bundled-files.md', (t) =>
      t.replace('{"activation_tool_listing":', '{"detail":'),
    )
    assert.ok(has(errors, 'key "detail" is already answered by observation 1 from the same date'))
  })

  test('model is refused on a subject not marked model_dependent', () => {
    const errors = loadWith(run, (t) =>
      t.replace('    evidence: run\n', '    evidence: run\n    model: some-model\n'),
    )
    assert.ok(has(errors, 'is not model_dependent'))
  })

  test('model is accepted on a model_dependent subject', () => {
    const errors = loadWith('subjects/cli/session-env.md', (t) =>
      t.replace('tags: [cli]\n', 'tags: [cli]\nmodel_dependent: true\n'),
    )
    assert.deepEqual(errors, [])
  })
})

describe('schema files', () => {
  test('--write-schema writes files the check accepts; a changed or missing file is stale', () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-reference-schema-'))
    try {
      assert.ok(checkSchemas(dir, false).length > 0)
      assert.deepEqual(checkSchemas(dir, true), [])
      assert.deepEqual(checkSchemas(dir, false), [])
      writeFileSync(join(dir, 'fact.schema.json'), '{}')
      assert.deepEqual(checkSchemas(dir, false), [
        'schema/fact.schema.json is stale: run `node src/validate.ts --write-schema`',
      ])
      unlinkSync(join(dir, 'harness.schema.json'))
      assert.equal(checkSchemas(dir, false).length, 2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

function obs(value: Record<string, unknown>, observed: string, until: string | null = null) {
  const o: Observation = { value, since: null, until, observed, source: 's' }
  return o
}

function factOf(observations: Observation[]): Fact {
  return {
    type: 'Harness Fact',
    title: 't',
    description: 'd',
    tags: ['skills'],
    harness: 'codex',
    subject: 'skills/user-dirs',
    observations,
    sources: [{ id: 's', resource: 'https://example.com/', title: 'S' }],
    conceptId: 'facts/codex/skills/user-dirs',
  }
}

describe('render', () => {
  test('current is the latest observation still in force', () => {
    const a = obs({ x: 1 }, '2026-01-01')
    const b = obs({ x: 2 }, '2026-02-01', '1.0.0')
    assert.equal(current(factOf([a, b])), a)
    assert.equal(current(factOf([b])), undefined)
  })

  test('changes marks first observed, changed and re-observed, newest first', () => {
    const fact = factOf([
      obs({ x: 1 }, '2026-01-01'),
      obs({ x: 1 }, '2026-02-01'),
      obs({ x: 2 }, '2026-03-01'),
    ])
    assert.deepEqual(
      changes([fact]).map((c: Change) => [c.date, c.kind]),
      [
        ['2026-03-01', 'changed'],
        ['2026-02-01', 're-observed'],
        ['2026-01-01', 'first observed'],
      ],
    )
  })

  test('currentSet is every observation still in force, of any date', () => {
    const a = obs({ x: 1 }, '2026-01-01')
    const b = obs({ x: 0 }, '2026-01-01', '1.0.0')
    const c = obs({ y: 2 }, '2026-02-01')
    assert.deepEqual(currentSet(factOf([a, b, c])), [a, c])
  })

  test('changes compares a part with the earlier observations that answer its keys', () => {
    const fact = factOf([
      obs({ x: 1 }, '2026-01-01'),
      obs({ y: 1 }, '2026-01-01'),
      obs({ x: 2 }, '2026-02-01'),
      obs({ z: 1 }, '2026-02-01'),
      obs({ y: 1 }, '2026-03-01'),
      obs({ x: 2, w: 1 }, '2026-03-01'),
    ])
    assert.deepEqual(
      changes([fact]).map((c: Change) => [c.date, Object.keys(c.obs.value).join(','), c.kind]),
      [
        ['2026-03-01', 'y', 're-observed'],
        ['2026-03-01', 'x,w', 'changed'],
        ['2026-02-01', 'x', 'changed'],
        ['2026-02-01', 'z', 'first observed'],
        ['2026-01-01', 'x', 'first observed'],
        ['2026-01-01', 'y', 'first observed'],
      ],
    )
  })

  test('a comparison cell shows every observation in force and counts the superseded', () => {
    const { dataset } = load()
    if (!dataset) throw new Error('bundle did not load')
    const observations = [
      obs({ marker: 'gamma-old' }, '2026-01-01', '1.0.0'),
      obs({ marker: 'alpha-one' }, '2026-01-01'),
      obs({ other: 'beta-two' }, '2026-02-01'),
    ]
    const facts = dataset.facts.map((f) =>
      f.conceptId === 'facts/codex/skills/user-dirs' ? { ...f, observations } : f,
    )
    const index = renderSite({ ...dataset, facts }).get('index.html') ?? ''
    const cell = index.split('<td').find((c) => c.includes('alpha-one'))
    assert.ok(cell?.includes('alpha-one'))
    assert.ok(cell?.includes('beta-two'))
    assert.ok(cell?.includes('· 1 superseded'))
    assert.ok(!cell?.includes('gamma-old'))
  })

  test('renderSite writes every page, with links relative to each page', () => {
    const { dataset } = load()
    if (!dataset) throw new Error('bundle did not load')
    const files = renderSite(dataset)
    for (const p of ['index.html', 'changes.html', 'gaps.html', 'data.json'])
      assert.ok(files.has(p))
    for (const h of dataset.harnesses) assert.ok(files.has(`harnesses/${h.id}.html`))
    for (const s of dataset.subjects) assert.ok(files.has(`subjects/${s.id}.html`))
    assert.ok(files.has('probes/index.html'))
    for (const p of dataset.probes) assert.ok(files.has(`probes/${p.id}.html`))
    assert.ok(
      files
        .get('probes/plugin-layout.html')
        ?.includes('href="../subjects/skills/relative-paths.html"'),
    )
    assert.ok(
      files.get('harnesses/claude-code.html')?.includes('href="../probes/claude-session-env.html"'),
    )
    assert.ok(
      files
        .get('harnesses/claude-code.html')
        ?.includes('href="../subjects/skills/prequalified-name.html"'),
    )
    assert.ok(files.get('changes.html')?.includes('href="harnesses/claude-code.html"'))
  })

  test('a fact with no observation in force counts as a gap', () => {
    const { dataset } = load()
    if (!dataset) throw new Error('bundle did not load')
    const coverage = (html: string | undefined): number =>
      Number(/(\d+) of \d+ harness/.exec(html ?? '')?.[1])
    const before = coverage(renderSite(dataset).get('gaps.html'))
    const facts = dataset.facts.map((f) =>
      f.conceptId === 'facts/codex/skills/user-dirs'
        ? { ...f, observations: f.observations.map((o) => ({ ...o, until: '9.9.9' })) }
        : f,
    )
    assert.equal(coverage(renderSite({ ...dataset, facts }).get('gaps.html')), before - 1)
  })
})

test('parseConcept splits frontmatter and body', () => {
  assert.deepEqual(parseConcept('---\ntype: X\n---\n\nbody\n'), {
    frontmatter: { type: 'X' },
    body: '\nbody\n',
  })
})

test('semverOrder follows semver precedence', () => {
  assert.equal(semverOrder('1.2.3', '1.2.3'), 0)
  assert.equal(semverOrder('1.2.3', '1.10.0'), -1)
  assert.equal(semverOrder('1.0.0-alpha.2', '1.0.0-alpha.10'), -1)
  assert.equal(semverOrder('1.0.0-alpha', '1.0.0'), -1)
  assert.equal(semverOrder('1.0.0-beta', '1.0.0-alpha.1'), 1)
  assert.equal(semverOrder('1.0.0-alpha', '1.0.0-alpha.1'), -1)
  assert.equal(semverOrder('1.0.0-1', '1.0.0-alpha'), -1)
})
