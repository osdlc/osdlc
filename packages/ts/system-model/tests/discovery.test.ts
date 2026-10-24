/**
 * The exclusion set and the file lister: what a path has to look like to be
 * left out, and how a pattern selects what is left.
 *
 * The `walk` cases run against a real temporary tree, not a mocked lister. The
 * walk prunes directories and a final filter rejects files. Running both for
 * real keeps them from disagreeing about which files exist. The `git` cases
 * mostly use a canned runner, so they can assert the argv sent and test the
 * failure exits. One case uses a real repository to cover a gitignored file.
 */

import { afterAll, describe, expect, test } from 'vitest'

import { CommandFailed, runChecked, spawnRunner, spawnRunnerAsync } from '@osdlc/command-seam'

import {
  createLister,
  gitAvailable,
  matchesExclude,
  normalizeExcludes,
  DEFAULT_EXCLUDES,
} from '../src/discovery.ts'
import { createProject } from '../src/project.ts'
import type { ToolDef } from '../src/tool.ts'
import { builtins } from '../src/builtins.ts'
import { fakeRunners, fixtureRoot, removeRoot } from './support.ts'

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

async function root(files: Record<string, string>): Promise<string> {
  const dir = await fixtureRoot(files)
  roots.push(dir)
  return dir
}

/** A lister over a real tree, in walk mode so no git repository is needed. */
function lister(root: string, excludes: string[] = []) {
  return createLister(root, 'walk', fakeRunners([]).make('git'), excludes)
}

describe('normalizeExcludes', () => {
  test('sorts entries by whether they have to be matched as a path', () => {
    const set = normalizeExcludes(['node_modules', 'crates/mg/tests/mini-repo'])
    expect([...set.names]).toEqual(['node_modules'])
    expect(set.paths).toEqual([['crates', 'mg', 'tests', 'mini-repo']])
  })

  test('accepts the spellings a hand-written config actually contains', () => {
    // Whichever of these someone reaches for, they mean the same directory. A
    // setting whose effect depends on the spelling is one people get wrong once
    // and then stop trusting.
    for (const spelling of ['src/app', 'src/app/', '/src/app', './src/app', '  src/app  ']) {
      expect(normalizeExcludes([spelling]).paths).toEqual([['src', 'app']])
    }
  })

  test('drops empty entries rather than excluding everything', () => {
    // A trailing comma in a JSON array, or an empty string from a shell that
    // expanded nothing. Read as a zero-segment prefix, this would match every
    // path in the repository.
    const set = normalizeExcludes(['', '   ', '/', './'])
    expect(set.names.size).toBe(0)
    expect(set.paths).toEqual([])
  })
})

describe('matchesExclude', () => {
  test('a bare name matches at any depth', () => {
    const set = normalizeExcludes(['node_modules'])
    expect(matchesExclude('node_modules/x.json', set)).toBe(true)
    expect(matchesExclude('a/b/node_modules/x.json', set)).toBe(true)
    expect(matchesExclude('a/node_modules_kept/x.json', set)).toBe(false)
  })

  test('a path matches from the root and takes the tree beneath it', () => {
    const set = normalizeExcludes(['crates/mg/tests/mini-repo'])
    expect(matchesExclude('crates/mg/tests/mini-repo/Cargo.toml', set)).toBe(true)
    expect(matchesExclude('crates/mg/tests/mini-repo/a/b/package.json', set)).toBe(true)
    // The same trailing segments somewhere else are a different tree.
    expect(matchesExclude('vendor/crates/mg/tests/mini-repo/Cargo.toml', set)).toBe(false)
    // A sibling that merely shares the parent stays.
    expect(matchesExclude('crates/mg/tests/real.rs', set)).toBe(false)
  })

  test('a path prefix is compared per segment, not per character', () => {
    // A plain string-prefix test would also exclude `src/application`. That only
    // shows up in a repository that has both directories.
    const set = normalizeExcludes(['src/app'])
    expect(matchesExclude('src/app/main.ts', set)).toBe(true)
    expect(matchesExclude('src/application/main.ts', set)).toBe(false)
  })

  test('a path may name a single file', () => {
    const set = normalizeExcludes(['tools/example/package.json'])
    expect(matchesExclude('tools/example/package.json', set)).toBe(true)
    expect(matchesExclude('tools/example/other.json', set)).toBe(false)
  })
})

describe('createLister exclusions', () => {
  test('excludes a named tree while keeping the rest of the repository', async () => {
    const root = await fixtureRoot({
      'package.json': '{}',
      'src/package.json': '{}',
      'crates/mg/tests/mini-repo/package.json': '{}',
      'crates/mg/tests/mini-repo/deep/package.json': '{}',
      'crates/mg/tests/real/package.json': '{}',
    })
    try {
      const files = await lister(root, ['crates/mg/tests/mini-repo'])('package.json')
      expect(files.sort()).toEqual([
        'crates/mg/tests/real/package.json',
        'package.json',
        'src/package.json',
      ])
    } finally {
      await removeRoot(root)
    }
  })

  test('honours a path exclusion shipped in the built-in list', async () => {
    // `.moon/cache` has two segments. A check that compares one segment at a
    // time never matches it, so it must be read as a path.
    expect(DEFAULT_EXCLUDES).toContain('.moon/cache')
    const root = await fixtureRoot({
      '.moon/cache/package.json': '{}',
      '.moon/package.json': '{}',
    })
    try {
      expect(await lister(root)('package.json')).toEqual(['.moon/package.json'])
    } finally {
      await removeRoot(root)
    }
  })

  test('keeps a dependency tree out of the answer', async () => {
    // This asserts the result only. Pruning a directory and descending then
    // discarding return the same list, so no assertion here can tell them
    // apart. `walkFiles` documents why the walk prunes.
    const root = await fixtureRoot({
      'package.json': '{}',
      'node_modules/a/package.json': '{}',
    })
    try {
      expect(await lister(root)('package.json')).toEqual(['package.json'])
    } finally {
      await removeRoot(root)
    }
  })
})

describe('gitAvailable', () => {
  const probe = ['rev-parse', '--is-inside-work-tree']

  test('true inside a working tree, and asks git in the right directory', async () => {
    const runners = fakeRunners([{ binary: 'git', argv: probe, stdout: 'true\n' }])
    expect(await gitAvailable('/repo', runners.make('git'))).toBe(true)
    expect(runners.calls).toHaveLength(1)
    expect(runners.calls[0]?.argv).toEqual(probe)
    expect(runners.calls[0]?.opts.cwd).toBe('/repo')
  })

  test('false outside a repository rather than throwing', async () => {
    // git exits 128 here, which `revParse` does not treat as "absent", so the
    // throwing method would reject. The probe expects "no" as a normal answer,
    // so it goes through `try`.
    const runners = fakeRunners([
      { binary: 'git', argv: probe, exitCode: 128, stderr: 'not a git repository' },
    ])
    expect(await gitAvailable('/tmp/plain', runners.make('git'))).toBe(false)
  })

  test('false when git is not on PATH', async () => {
    // The command seam turns a missing binary into a non-zero exit, so this reaches
    // the client as a failed call, not as a spawn throw.
    expect(await gitAvailable('/repo', fakeRunners([]).make('git'))).toBe(false)
  })

  test('false in a bare repository, where git answers `false`', async () => {
    const runners = fakeRunners([{ binary: 'git', argv: probe, stdout: 'false\n' }])
    expect(await gitAvailable('/repo.git', runners.make('git'))).toBe(false)
  })
})

describe('createLister in git mode', () => {
  const lsFiles = ['ls-files', '-z', '--cached', '--others', '--exclude-standard']

  test('lists what git reports, still applying the exclusions', async () => {
    // Tracked AND untracked-but-not-ignored: a justfile written a minute ago
    // and not yet added is still a justfile.
    const runners = fakeRunners([
      {
        binary: 'git',
        argv: lsFiles,
        stdout: ['package.json', 'src/package.json', 'vendor/package.json'].join('\0') + '\0',
      },
    ])
    const files = createLister('/repo', 'git', runners.make('git'))
    expect((await files('package.json')).sort()).toEqual(['package.json', 'src/package.json'])
    expect(runners.calls[0]?.argv).toEqual(lsFiles)
    // Memoized: a second pattern reuses the one listing.
    await files('justfile')
    expect(runners.calls).toHaveLength(1)
  })

  test('throws when git fails rather than reporting an empty repository', async () => {
    // `gitAvailable` already said this is a repository, so a failing `ls-files`
    // means a broken one. Returning "no files" would report every runner as
    // absent from a project that has them.
    const runners = fakeRunners([
      { binary: 'git', argv: lsFiles, exitCode: 128, stderr: 'index file corrupt' },
    ])
    const files = createLister('/repo', 'git', runners.make('git'))
    await expect(files('package.json')).rejects.toThrow(CommandFailed)
  })
})

describe('createLister patterns', () => {
  const TREE = {
    justfile: '',
    'sub/justfile': '',
    'docs/guide.md': '',
    'docs/api/ref.md': '',
    'a/b/Cargo.toml': '',
    '.github/workflows/ci.yml': '',
    '.github/workflows/nested/release.yml': '',
    '.github/other.yml': '',
    'pkg/mise-tasks/deploy': '',
    'mise-tasks/lint': '',
  }

  test('a pattern with no slash matches a basename at any depth', async () => {
    const dir = await root(TREE)
    expect((await lister(dir)('justfile')).sort()).toEqual(['justfile', 'sub/justfile'])
    expect(await lister(dir)('Cargo.toml')).toEqual(['a/b/Cargo.toml'])
  })

  test('a leading slash anchors the pattern at the root', async () => {
    const dir = await root(TREE)
    expect(await lister(dir)('/justfile')).toEqual(['justfile'])
    expect(await lister(dir)('/Cargo.toml')).toEqual([])
    expect(await lister(dir)('/a/b/Cargo.toml')).toEqual(['a/b/Cargo.toml'])
  })

  test('a slash in the middle anchors the pattern too', async () => {
    const dir = await root(TREE)
    // No leading slash, but `docs/guide.md` is a path from the root.
    expect(await lister(dir)('docs/guide.md')).toEqual(['docs/guide.md'])
    expect(await lister(dir)('b/Cargo.toml')).toEqual([])
  })

  test('`*` stays within one path segment', async () => {
    const dir = await root(TREE)
    expect(await lister(dir)('/docs/*.md')).toEqual(['docs/guide.md'])
    expect(await lister(dir)('*.yml')).toHaveLength(3)
    expect(await lister(dir)('/.github/*.yml')).toEqual(['.github/other.yml'])
  })

  test('a trailing slash matches every file under an anchored directory', async () => {
    const dir = await root(TREE)
    expect((await lister(dir)('/.github/workflows/')).sort()).toEqual([
      '.github/workflows/ci.yml',
      '.github/workflows/nested/release.yml',
    ])
    expect(await lister(dir)('/workflows/')).toEqual([])
  })

  test('a trailing slash without an anchor matches a directory of that name at any depth', async () => {
    const dir = await root(TREE)
    expect((await lister(dir)('mise-tasks/')).sort()).toEqual([
      'mise-tasks/lint',
      'pkg/mise-tasks/deploy',
    ])
    expect(await lister(dir)('/mise-tasks/')).toEqual(['mise-tasks/lint'])
  })

  test('a directory pattern does not match a file of the same name', async () => {
    const dir = await root({ 'tasks/run': '', tasks2: '' })
    expect(await lister(dir)('tasks/')).toEqual(['tasks/run'])
    expect(await lister(dir)('tasks2/')).toEqual([])
  })
})

describe('detect and anchored literal markers', () => {
  const localConfig = (files: string): ToolDef => ({
    id: 'local',
    markers: [{ files, tier: 'files' }],
    roles: {},
  })

  async function gitRepo(files: Record<string, string>): Promise<string> {
    const dir = await root(files)
    runChecked(spawnRunner('git'), ['init', '--quiet'], { cwd: dir })
    return dir
  }

  test('a gitignored file named by an anchored literal still counts under git discovery', async () => {
    const dir = await gitRepo({ '.gitignore': 'mise.local.toml\n', 'mise.local.toml': '[tools]\n' })
    const project = createProject({ tools: builtins })

    const profile = await project.detect(dir, { discovery: 'git' })

    expect(profile.discovery).toBe('git')
    expect(profile.tools).toContain('mise')
    const evidence = profile.packages[0]?.tools.find((t) => t.tool === 'mise')?.evidence
    expect(evidence?.map((e) => e.source)).toEqual(['mise.local.toml'])
  })

  test('the lister itself does not list the ignored file', async () => {
    const dir = await gitRepo({ '.gitignore': 'mise.local.toml\n', 'mise.local.toml': '' })
    const files = createLister(dir, 'git', spawnRunnerAsync('git'))
    expect(await files('/mise.local.toml')).toEqual([])
  })

  test('an ignored file named only by a basename pattern is not found', async () => {
    const dir = await gitRepo({ '.gitignore': 'local.cfg\n', 'local.cfg': '' })
    const project = createProject({ tools: [localConfig('local.cfg')] })
    expect((await project.detect(dir, { discovery: 'git' })).tools).toEqual([])
  })

  test('an ignored file named only by a glob is not found', async () => {
    const dir = await gitRepo({ '.gitignore': 'local.cfg\n', 'local.cfg': '' })
    const project = createProject({ tools: [localConfig('/local.*')] })
    expect((await project.detect(dir, { discovery: 'git' })).tools).toEqual([])
  })

  test('an anchored literal that is absent from disk is not found', async () => {
    const dir = await gitRepo({ 'README.md': '' })
    const project = createProject({ tools: [localConfig('/local.cfg')] })
    expect((await project.detect(dir, { discovery: 'git' })).tools).toEqual([])
  })

  test('walk discovery sees an ignored file without the disk check', async () => {
    const dir = await root({ '.gitignore': 'local.cfg\n', 'local.cfg': '' })
    const project = createProject({ tools: [localConfig('local.cfg')] })
    expect((await project.detect(dir, { discovery: 'walk' })).tools).toEqual(['local'])
  })
})
