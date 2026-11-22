/**
 * The `diffText` and `diffAddedFile` failure contract, `diffText`,
 * `diffAddedFile` and `diffNameStatus` under the user's diff configuration
 * and with a rev that is also a path, call options on `revParse`,
 * `diffText` and `diffAddedFile`, `checkoutSide` with no paths,
 * the `remotes()` name, and `soft` without `configRemoveSection`.
 */

import { describe, expect, test } from 'vitest'

import { FailureError } from '@osdlc/result'

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  AsyncGit,
  cliBackend,
  Git,
  type AsyncCommandRunner,
  type CommandResult,
  type CommandRunner,
  type CommandRunOptions,
} from '../src/index.ts'
import { makeGitFixture } from '../src/testing.ts'

function recorder(result: CommandResult = { exitCode: 0, stdout: '', stderr: '' }) {
  const calls: Array<{ argv: string[]; opts: CommandRunOptions }> = []
  const sync: CommandRunner = {
    run(argv, opts) {
      calls.push({ argv, opts })
      return result
    },
  }
  const async: AsyncCommandRunner = {
    run(argv, opts) {
      calls.push({ argv, opts })
      return Promise.resolve(result)
    },
  }
  return { calls, sync, async }
}

/** The flags `diffText` and `diffAddedFile` always pass, after `diff`. */
const PLAIN_PATCH = [
  '--no-color',
  '--no-ext-diff',
  '--no-textconv',
  '--src-prefix=a/',
  '--dst-prefix=b/',
  '--no-relative',
  '--submodule=short',
  '--unified=3',
]

describe('diffText and diffAddedFile follow the failure contract', () => {
  test('a bad rev and a non-repository throw, also through try', async () => {
    const fx = makeGitFixture()
    const outside = mkdtempSync(join(tmpdir(), 'typed-git-not-a-repo-'))
    try {
      fx.commit('first', { 'a.md': 'one\n' })
      const git = fx.git
      expect(git.diffText()).toBe('')
      writeFileSync(join(fx.dir, 'a.md'), 'two\n')
      expect(git.diffText('HEAD')).toContain('+two')

      expect(() => git.diffText('does-not-exist')).toThrow(FailureError)
      const tried = git.try.diffText('does-not-exist')
      expect(tried.ok).toBe(false)

      const out = new Git(outside)
      expect(() => out.diffText()).toThrow(FailureError)
      expect(out.try.diffText().ok).toBe(false)

      const asyncGit = new AsyncGit(fx.dir)
      await expect(asyncGit.diffText('does-not-exist')).rejects.toBeInstanceOf(FailureError)
      expect((await asyncGit.try.diffText('does-not-exist')).ok).toBe(false)
    } finally {
      fx.cleanup()
      rmSync(outside, { recursive: true, force: true })
    }
  })

  test('diffAddedFile renders a file, and throws for a path git cannot read', async () => {
    const fx = makeGitFixture()
    try {
      writeFileSync(join(fx.dir, 'new.md'), 'hello\n')
      writeFileSync(join(fx.dir, 'empty.md'), '')
      const git = fx.git
      expect(git.diffAddedFile('new.md')).toContain('+hello')
      // An empty file is still a real diff, not a failure.
      expect(git.diffAddedFile('empty.md')).toContain('new file mode')

      expect(() => git.diffAddedFile('missing.md')).toThrow(FailureError)
      expect(git.try.diffAddedFile('missing.md').ok).toBe(false)
      const asyncGit = new AsyncGit(fx.dir)
      await expect(asyncGit.diffAddedFile('missing.md')).rejects.toBeInstanceOf(FailureError)
    } finally {
      fx.cleanup()
    }
  })
})

describe("diffText, diffAddedFile and diffNameStatus under the user's diff configuration", () => {
  /** A repository with `a.md` modified and `new.md` untracked, under `config`. */
  function changedUnder(config: Record<string, string>) {
    const fx = makeGitFixture()
    fx.commit('first', { 'a.md': 'one\n', '.gitattributes': '*.md diff=upper\n' })
    for (const [key, value] of Object.entries(config)) fx.git.configSet(key, value)
    writeFileSync(join(fx.dir, 'a.md'), 'two\n')
    writeFileSync(join(fx.dir, 'new.md'), 'fresh\n')
    return fx
  }

  test('no escape codes under color.ui=always', async () => {
    const fx = changedUnder({ 'color.ui': 'always', 'color.diff': 'always' })
    try {
      const text = fx.git.diffText()
      expect(text).toContain('+two')
      expect(text).not.toContain('\u001b')
      const added = fx.git.diffAddedFile('new.md')
      expect(added).toContain('+fresh')
      expect(added).not.toContain('\u001b')

      const asyncGit = new AsyncGit(fx.dir)
      expect(await asyncGit.diffText()).toBe(text)
      expect(await asyncGit.diffAddedFile('new.md')).toBe(added)
    } finally {
      fx.cleanup()
    }
  })

  test.each([
    ['diff.noprefix', { 'diff.noprefix': 'true' }],
    ['diff.mnemonicPrefix', { 'diff.mnemonicPrefix': 'true' }],
    ['diff.srcPrefix and diff.dstPrefix', { 'diff.srcPrefix': 'x/', 'diff.dstPrefix': 'y/' }],
  ])('the a/ and b/ prefixes stay under %s', (_name, config) => {
    const fx = changedUnder(config)
    try {
      expect(fx.git.diffText()).toMatch(/^diff --git a\/a\.md b\/a\.md\n/)
      expect(fx.git.diffAddedFile('new.md')).toMatch(/^diff --git a\/new\.md b\/new\.md\n/)
    } finally {
      fx.cleanup()
    }
  })

  // Both settings are shell command lines, which git runs through `sh`; the
  // textconv one needs `tr`.
  test.skipIf(process.platform === 'win32')(
    'an external diff tool and a textconv driver are not run',
    () => {
      for (const config of [
        { 'diff.external': 'echo EXTERNAL' },
        { 'diff.upper.command': 'echo EXTERNAL' },
        { 'diff.upper.textconv': 'tr a-z A-Z <' },
      ]) {
        const fx = changedUnder(config)
        try {
          const text = fx.git.diffText()
          expect(text).toMatch(/^diff --git a\/a\.md b\/a\.md\n/)
          expect(text).toContain('-one\n+two\n')
          const added = fx.git.diffAddedFile('new.md')
          expect(added).toMatch(/^diff --git a\/new\.md b\/new\.md\n/)
          expect(added).toContain('+fresh\n')
        } finally {
          fx.cleanup()
        }
      }
    },
  )

  test('diff.relative does not cut the result to a cwd below the root', () => {
    const fx = makeGitFixture()
    try {
      fx.commit('first', { 'sub/in.md': 'in\n', 'top.md': 'top\n' })
      fx.git.configSet('diff.relative', 'true')
      writeFileSync(join(fx.dir, 'sub', 'in.md'), 'in2\n')
      writeFileSync(join(fx.dir, 'top.md'), 'top2\n')

      const below = fx.git.at(join(fx.dir, 'sub'))
      expect(below.diffNameStatus()).toEqual([
        { status: 'M', path: 'sub/in.md' },
        { status: 'M', path: 'top.md' },
      ])
      const text = below.diffText()
      expect(text).toContain('diff --git a/sub/in.md b/sub/in.md\n')
      expect(text).toContain('diff --git a/top.md b/top.md\n')
    } finally {
      fx.cleanup()
    }
  })

  test('three lines of context stay under diff.context=0', () => {
    const fx = makeGitFixture()
    try {
      const before = Array.from({ length: 12 }, (_, i) => `${i + 1}\n`).join('')
      fx.commit('first', { 'a.md': before })
      fx.git.configSet('diff.context', '0')
      writeFileSync(join(fx.dir, 'a.md'), before.replace('6\n', ''))

      const text = fx.git.diffText()
      expect(text).toContain('\n@@ -3,7 +3,6 @@\n')

      // `git apply` refuses a hunk with no context lines.
      writeFileSync(join(fx.dir, 'a.md'), before)
      fx.git.rawChecked(['apply', '--check'], { input: text })
    } finally {
      fx.cleanup()
    }
  })

  test('a submodule change is a Subproject commit patch under diff.submodule=log', () => {
    const fx = makeGitFixture()
    try {
      fx.commit('first', { 'a.md': 'one\n' })
      // A repository inside the work tree is added as a submodule commit.
      const sub = makeGitFixture({ dir: join(fx.dir, 'sub') })
      const before = sub.commit('in sub', { 'f.md': 'f\n' })
      fx.commit('add sub')
      const after = sub.commit('more in sub', { 'f.md': 'f2\n' })
      fx.git.add(['sub'])
      fx.git.configSet('diff.submodule', 'log')

      const text = fx.git.diffText(undefined, { staged: true })
      expect(text).toMatch(/^diff --git a\/sub b\/sub\n/)
      expect(text).toContain(`\n-Subproject commit ${before}\n+Subproject commit ${after}\n`)

      // The `log` form is a list of commits, which `git apply` cannot read.
      fx.git.rawChecked(['reset', '--quiet', 'HEAD', '--', 'sub'])
      fx.git.rawChecked(['apply', '--cached', '--check'], { input: text })
    } finally {
      fx.cleanup()
    }
  })

  test('context sets the lines of context, for both verbs, and rejects a bad value', async () => {
    const fx = makeGitFixture()
    try {
      const before = Array.from({ length: 12 }, (_, i) => `${i + 1}\n`).join('')
      fx.commit('first', { 'a.md': before })
      fx.git.configSet('diff.context', '8')
      writeFileSync(join(fx.dir, 'a.md'), before.replace('6\n', ''))
      writeFileSync(join(fx.dir, 'new.md'), 'x\ny\n')

      expect(fx.git.diffText(undefined, { context: 0 })).toContain('\n@@ -6 +5,0 @@\n')
      expect(fx.git.diffText(undefined, { context: 1 })).toContain('\n@@ -5,3 +5,2 @@\n')
      expect(fx.git.diffText()).toContain('\n@@ -3,7 +3,6 @@\n')
      expect(fx.git.diffAddedFile('new.md', { context: 0 })).toContain('+y')
      const asyncGit = new AsyncGit(fx.dir)
      expect(await asyncGit.diffText(undefined, { context: 0 })).toBe(
        fx.git.diffText(undefined, { context: 0 }),
      )

      for (const bad of [-1, 1.5, Number.NaN]) {
        expect(() => fx.git.diffText(undefined, { context: bad })).toThrow(TypeError)
        expect(() => fx.git.diffAddedFile('new.md', { context: bad })).toThrow(TypeError)
      }
    } finally {
      fx.cleanup()
    }
  })

  test('findRenames reads a moved file as a rename under diff.renames=false', () => {
    const fx = makeGitFixture()
    try {
      fx.commit('first', { 'old.md': Array.from({ length: 10 }, (_, i) => `line ${i}\n`).join('') })
      fx.git.configSet('diff.renames', 'false')
      fx.git.rawChecked(['mv', 'old.md', 'moved.md'])

      const plain = fx.git.diffText(undefined, { staged: true })
      expect(plain).toContain('deleted file mode')
      expect(plain).not.toContain('rename from')

      const renamed = fx.git.diffText(undefined, { staged: true, findRenames: true })
      expect(renamed).toContain('rename from old.md\nrename to moved.md')
      expect(renamed).not.toContain('deleted file mode')
    } finally {
      fx.cleanup()
    }
  })
})

describe('diffText and diffNameStatus never read the rev as a path', () => {
  test('a file name is not a rev, and a branch named like a folder is one', async () => {
    const fx = makeGitFixture()
    try {
      fx.commit('first', { 'a.md': 'one\n' })
      const git = fx.git
      git.rawChecked(['branch', 'docs'])
      fx.commit('second', { 'a.md': 'two\n' })
      writeFileSync(join(fx.dir, 'a.md'), 'three\n')

      // `a.md` is a modified file and no revision. Read as a path it would
      // give that file's diff.
      expect(() => git.diffText('a.md')).toThrow(FailureError)
      expect(() => git.diffNameStatus({ range: 'a.md' })).toThrow(FailureError)

      // A branch and a folder share the name `docs`. The branch is meant.
      mkdirSync(join(fx.dir, 'docs'))
      writeFileSync(join(fx.dir, 'docs', 'd.md'), 'd\n')
      const text = git.diffText('docs')
      expect(text).toContain('-one')
      expect(text).toContain('+three')
      expect(git.diffNameStatus({ range: 'docs' })).toEqual([{ status: 'M', path: 'a.md' }])

      const asyncGit = new AsyncGit(fx.dir)
      await expect(asyncGit.diffText('a.md')).rejects.toBeInstanceOf(FailureError)
      expect(await asyncGit.diffNameStatus({ range: 'docs' })).toEqual([
        { status: 'M', path: 'a.md' },
      ])
    } finally {
      fx.cleanup()
    }
  })
})

describe('call options on revParse, diffText and diffAddedFile', () => {
  const call = { timeoutMs: 5000, env: { PROBE: '1' } }

  test('Git passes timeoutMs and env through', () => {
    const r = recorder()
    const git = new Git('/repo', { runner: r.sync })
    git.revParse('--show-toplevel', call)
    git.revParse('HEAD')
    git.diffText('HEAD', { ...call, staged: true, paths: ['a.md'] })
    git.diffAddedFile('a.md', call)
    expect(r.calls.map((c) => c.argv)).toEqual([
      ['rev-parse', '--show-toplevel'],
      ['rev-parse', 'HEAD'],
      ['diff', ...PLAIN_PATCH, '--cached', 'HEAD', '--', 'a.md'],
      ['diff', ...PLAIN_PATCH, '--no-index', '--', '/dev/null', 'a.md'],
    ])
    for (const i of [0, 2, 3]) {
      expect(r.calls[i]!.opts.timeoutMs).toBe(5000)
      expect(r.calls[i]!.opts.env).toEqual({ PROBE: '1' })
    }
    expect(r.calls[1]!.opts.timeoutMs).toBeUndefined()
  })

  test('AsyncGit passes timeoutMs and env through', async () => {
    const r = recorder()
    const git = new AsyncGit('/repo', { backend: cliBackend({ runner: r.async }) })
    await git.revParse('--show-toplevel', call)
    await git.diffText('HEAD', { ...call, staged: true, paths: ['a.md'] })
    await git.diffAddedFile('a.md', call)
    expect(r.calls.map((c) => c.argv)).toEqual([
      ['rev-parse', '--show-toplevel'],
      ['diff', ...PLAIN_PATCH, '--cached', 'HEAD', '--', 'a.md'],
      ['diff', ...PLAIN_PATCH, '--no-index', '--', '/dev/null', 'a.md'],
    ])
    for (const c of r.calls) {
      expect(c.opts.timeoutMs).toBe(5000)
      expect(c.opts.env).toEqual({ PROBE: '1' })
    }
  })
})

describe('checkoutSide with no paths', () => {
  test('does nothing and returns, in both clients', async () => {
    const r = recorder({ exitCode: 128, stdout: '', stderr: 'fatal' })
    new Git('/repo', { runner: r.sync }).checkoutSide('ours', [])
    await new AsyncGit('/repo', { backend: cliBackend({ runner: r.async }) }).checkoutSide(
      'theirs',
      [],
    )
    expect(r.calls).toEqual([])
  })
})

describe('remotes() and the deprecated remote()', () => {
  test('both return the remote names', async () => {
    const fx = makeGitFixture()
    try {
      fx.git.remoteAdd('origin', '/store.git')
      fx.git.remoteAdd('upstream', '/other.git')
      expect(fx.git.remotes()).toEqual(['origin', 'upstream'])
      expect(fx.git.remote()).toEqual(fx.git.remotes())
      expect(fx.git.soft.remotes()).toEqual(['origin', 'upstream'])
      const asyncGit = new AsyncGit(fx.dir)
      expect(await asyncGit.remotes()).toEqual(['origin', 'upstream'])
      expect(await asyncGit.remote()).toEqual(['origin', 'upstream'])
    } finally {
      fx.cleanup()
    }
  })
})

describe('soft door', () => {
  test('configRemoveSection has no soft form', () => {
    const fail = recorder({ exitCode: 1, stdout: '', stderr: 'fatal' })
    const git = new Git('/repo', { runner: fail.sync })
    // Not in the type; at runtime a failure meets no table entry.
    const soft = git.soft as unknown as Record<string, (name: string) => unknown>
    expect(() => soft['configRemoveSection']!('branch.x')).toThrow(TypeError)
  })
})
