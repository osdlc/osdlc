/**
 * The synchronous `Git` client — two layers:
 *
 *   - Fake runner: exact argv construction per verb, result parsing, and the
 *     contract itself — a declared absence returns a value, every other
 *     non-zero exit throws, `try` reports rather than throws.
 *   - Real git: a temp repo (and a non-repo directory) exercising the round
 *     trips and the exit codes a fake cannot prove.
 *
 * Every verb's declared absence has a case here.
 *
 * `AsyncGit` and the backend seam live in async.test.ts, which also asserts
 * the two clients build identical argv.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  CommandFailed,
  Git,
  forceWithLeaseArg,
  type CommandResult,
  type CommandRunner,
} from '../index.ts'

// ── fake-runner layer ───────────────────────────────────────────────────────

/** Records every run() call and replays a canned result. */
function recorder(result: CommandResult): {
  runner: CommandRunner
  calls: Array<{ argv: string[]; cwd: string; input?: string }>
} {
  const calls: Array<{ argv: string[]; cwd: string; input?: string }> = []
  return {
    calls,
    runner: {
      run: (argv, opts) => {
        const call: { argv: string[]; cwd: string; input?: string } = {
          argv: [...argv],
          cwd: opts.cwd,
        }
        if (opts.input !== undefined) call.input = opts.input
        calls.push(call)
        return result
      },
    },
  }
}

const OK = (stdout: string): CommandResult => ({ exitCode: 0, stdout, stderr: '' })
const FAIL: CommandResult = { exitCode: 128, stdout: '', stderr: 'fatal: nope' }
const EXIT = (exitCode: number): CommandResult => ({ exitCode, stdout: '', stderr: '' })

describe('Git — argv construction (fake runner)', () => {
  test('showAtRev builds show <rev>:<path> and returns stdout', () => {
    const { runner, calls } = recorder(OK('content\n'))
    const git = new Git('/repo', { runner })
    expect(git.showAtRev('origin/main', 'docs/x.md')).toBe('content\n')
    expect(calls[0]!.argv).toEqual(['show', 'origin/main:docs/x.md'])
    expect(calls[0]!.cwd).toBe('/repo')
  })

  test('push with forceWithLease orders flags before remote/refspec', () => {
    const { runner, calls } = recorder(OK(''))
    new Git('/repo', { runner }).push('origin', 'HEAD:refs/heads/x', {
      forceWithLease: true,
    })
    expect(calls[0]!.argv).toEqual(['push', '--force-with-lease', 'origin', 'HEAD:refs/heads/x'])
  })

  test('push with a structured lease pins ref:oid; null expects absent', () => {
    const { runner, calls } = recorder(OK(''))
    const git = new Git('/repo', { runner })
    git.push('origin', 'HEAD:refs/heads/x', {
      forceWithLease: { ref: 'refs/heads/x', expect: 'abc123' },
    })
    git.push('origin', 'HEAD:refs/heads/y', {
      forceWithLease: { ref: 'refs/heads/y', expect: null },
    })
    expect(calls[0]!.argv).toEqual([
      'push',
      '--force-with-lease=refs/heads/x:abc123',
      'origin',
      'HEAD:refs/heads/x',
    ])
    expect(calls[1]!.argv[1]).toBe('--force-with-lease=refs/heads/y:')
  })

  test('push refuses a legacy string lease instead of weakening it', () => {
    const { runner, calls } = recorder(OK(''))
    const git = new Git('/repo', { runner })
    expect(() =>
      git.push('origin', 'HEAD', { forceWithLease: 'refs/heads/x:abc' as never }),
    ).toThrow(/unsupported value/)
    expect(() =>
      git.push('origin', 'HEAD', { forceWithLease: { ref: 'refs/heads/x', expect: '' } }),
    ).toThrow(/empty expected oid/)
    expect(calls).toHaveLength(0)
  })

  test('forceWithLeaseArg refuses an empty ref or oid', () => {
    expect(forceWithLeaseArg({ ref: 'refs/heads/a', expect: 'f00' })).toBe(
      '--force-with-lease=refs/heads/a:f00',
    )
    expect(() => forceWithLeaseArg({ ref: 'refs/heads/a', expect: '' })).toThrow(
      /empty expected oid/,
    )
    expect(() => forceWithLeaseArg({ ref: '', expect: 'f00' })).toThrow(/ref is empty/)
  })

  test('fetch with prune; worktreeAdd with detach + branch + startPoint', () => {
    const { runner, calls } = recorder(OK(''))
    const git = new Git('/repo', { runner })
    git.fetch('origin', 'main', { prune: true })
    git.worktreeAdd('/wt', { detach: true, startPoint: 'origin/main' })
    git.worktreeAdd('/wt2', { branch: 'task/x', startPoint: 'origin/main' })
    expect(calls[0]!.argv).toEqual(['fetch', '--prune', 'origin', 'main'])
    expect(calls[1]!.argv).toEqual(['worktree', 'add', '--detach', '/wt', 'origin/main'])
    expect(calls[2]!.argv).toEqual(['worktree', 'add', '-b', 'task/x', '/wt2', 'origin/main'])
  })

  test('lsFiles always passes -z, and pathspecs go after --', () => {
    const { runner, calls } = recorder(OK('a.ts\x00b/c d.ts\x00'))
    const git = new Git('/repo', { runner })
    expect(git.lsFiles()).toEqual(['a.ts', 'b/c d.ts'])
    git.lsFiles({ cached: true, others: true, excludeStandard: true, paths: ['docs', 'x'] })
    git.lsFiles({ others: true, directory: true })
    expect(calls[0]!.argv).toEqual(['ls-files', '-z'])
    expect(calls[2]!.argv).toEqual(['ls-files', '-z', '--others', '--directory'])
    expect(calls[1]!.argv).toEqual([
      'ls-files',
      '-z',
      '--cached',
      '--others',
      '--exclude-standard',
      '--',
      'docs',
      'x',
    ])
  })

  test('forEachRef defaults its format and takes one or many patterns', () => {
    const { runner, calls } = recorder(OK(''))
    const git = new Git('/repo', { runner })
    git.forEachRef('refs/heads/')
    git.forEachRef(['refs/heads/', 'refs/tags/*'], {
      format: '%(refname:short)%09%(upstream:track)',
      sort: '-committerdate',
      count: 5,
    })
    expect(calls[0]!.argv).toEqual([
      'for-each-ref',
      '--format=%(objectname)%09%(refname)',
      'refs/heads/',
    ])
    expect(calls[1]!.argv).toEqual([
      'for-each-ref',
      '--format=%(refname:short)%09%(upstream:track)',
      '--sort=-committerdate',
      '--count=5',
      'refs/heads/',
      'refs/tags/*',
    ])
  })

  test('statusEntries reads NUL records, expands untracked files and drops a rename source', () => {
    const { runner, calls } = recorder(
      OK(' M a.ts\0?? dir/new file.ts\0R  new.ts\0old.ts\0A  b.ts\0'),
    )
    const git = new Git('/repo', { runner })
    expect(git.statusEntries()).toEqual([
      { x: ' ', y: 'M', path: 'a.ts' },
      { x: '?', y: '?', path: 'dir/new file.ts' },
      { x: 'R', y: ' ', path: 'new.ts' },
      { x: 'A', y: ' ', path: 'b.ts' },
    ])
    expect(calls[0]!.argv).toEqual(['status', '--porcelain', '-z', '--untracked-files=all'])
  })

  test('statusEntries is empty on a clean tree and throws outside a repository', () => {
    expect(new Git('/repo', { runner: recorder(OK('')).runner }).statusEntries()).toEqual([])
    expect(() => new Git('/repo', { runner: recorder(EXIT(128)).runner }).statusEntries()).toThrow(
      CommandFailed,
    )
  })

  test('add({intentToAdd}) builds --intent-to-add before the paths', () => {
    const { runner, calls } = recorder(OK(''))
    new Git('/repo', { runner }).add(['a.ts', 'b.ts'], { intentToAdd: true })
    expect(calls[0]!.argv).toEqual(['add', '--intent-to-add', '--', 'a.ts', 'b.ts'])
  })

  test('clean is -f, or -fd with directories', () => {
    const { runner, calls } = recorder(OK(''))
    const git = new Git('/repo', { runner })
    git.clean()
    git.clean({ directories: true })
    expect(calls[0]!.argv).toEqual(['clean', '-f'])
    expect(calls[1]!.argv).toEqual(['clean', '-fd'])
  })

  test('diffCheck reports findings as a result, not a throw', () => {
    const found = recorder({ exitCode: 2, stdout: 'a.ts:1: trailing whitespace.\n', stderr: '' })
    expect(new Git('/repo', { runner: found.runner }).diffCheck({ paths: ['a.ts'] })).toEqual({
      ok: false,
      output: 'a.ts:1: trailing whitespace.\n',
    })
    expect(found.calls[0]!.argv).toEqual(['diff', '--check', '--', 'a.ts'])
    expect(new Git('/repo', { runner: recorder(OK('')).runner }).diffCheck()).toEqual({
      ok: true,
      output: '',
    })
    expect(() => new Git('/repo', { runner: recorder(EXIT(128)).runner }).diffCheck()).toThrow(
      CommandFailed,
    )
  })

  test('diffStat takes its range as tokens and returns stdout verbatim', () => {
    const stat = ' a.ts | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)\n'
    const { runner, calls } = recorder(OK(stat))
    const git = new Git('/repo', { runner })
    expect(git.diffStat({ rangeArgs: ['origin/x', 'HEAD'] })).toBe(stat)
    expect(calls[0]!.argv).toEqual(['diff', '--stat', 'origin/x', 'HEAD'])
  })

  test('diffNameOnly takes its range as tokens, so both dot forms are sayable', () => {
    const { runner, calls } = recorder(OK(''))
    const git = new Git('/repo', { runner })
    git.diffNameOnly({ rangeArgs: ['origin/main', 'HEAD'] })
    git.diffNameOnly({ rangeArgs: ['origin/main...HEAD'] })
    git.diffNameOnly({ cached: true, diffFilter: 'ACMR', paths: ['docs'] })
    expect(calls[0]!.argv).toEqual(['diff', '--name-only', '-z', 'origin/main', 'HEAD'])
    expect(calls[1]!.argv).toEqual(['diff', '--name-only', '-z', 'origin/main...HEAD'])
    expect(calls[2]!.argv).toEqual([
      'diff',
      '--name-only',
      '-z',
      '--cached',
      '--diff-filter=ACMR',
      '--',
      'docs',
    ])
  })

  test('diffNameStatus always passes -z', () => {
    const { runner, calls } = recorder(OK(''))
    new Git('/repo', { runner }).diffNameStatus({
      cached: true,
      noRenames: true,
      range: 'origin/main..HEAD',
      paths: ['docs'],
    })
    expect(calls[0]!.argv).toEqual([
      'diff',
      '--name-status',
      '-z',
      '--cached',
      '--no-renames',
      'origin/main..HEAD',
      '--',
      'docs',
    ])
  })

  // `--not` negates every rev after it, so a positive rev emitted afterwards
  // would be excluded too — the ordering is the whole correctness of the flag.
  test('log emits flags, then revs, then --not, then pathspecs', () => {
    const { runner, calls } = recorder(OK(''))
    const git = new Git('/repo', { runner })
    git.log({
      format: '%H',
      maxCount: 32,
      noMerges: true,
      reverse: true,
      rev: 'task/x',
      notRefs: ['main', 'origin/main'],
    })
    git.log({
      format: 'format:%x1e%H%x1f%s',
      noRenames: true,
      nameStatus: true,
      numstat: true,
      relative: true,
      range: 'origin/main..HEAD',
      paths: ['.'],
    })
    expect(calls[0]!.argv).toEqual([
      'log',
      '--format=%H',
      '--max-count=32',
      '--no-merges',
      '--reverse',
      'task/x',
      '--not',
      'main',
      'origin/main',
    ])
    expect(calls[1]!.argv).toEqual([
      'log',
      '--format=format:%x1e%H%x1f%s',
      '--no-renames',
      '--name-status',
      '--numstat',
      '--relative',
      'origin/main..HEAD',
      '--',
      '.',
    ])
  })

  test('fetch takes many refspecs and the quiet/no-write-fetch-head flags', () => {
    const { runner, calls } = recorder(OK(''))
    const git = new Git('/repo', { runner })
    git.fetch('origin', ['refs/notes/*:refs/notes/*', 'main'], {
      quiet: true,
      noWriteFetchHead: true,
    })
    expect(calls[0]!.argv).toEqual([
      'fetch',
      '--quiet',
      '--no-write-fetch-head',
      'origin',
      'refs/notes/*:refs/notes/*',
      'main',
    ])
  })

  test('lsTree passes -z, orders -r/--long before the rev, pathspecs after --', () => {
    const { runner, calls } = recorder(OK(''))
    const git = new Git('/repo', { runner })
    git.lsTree('HEAD')
    git.lsTree('origin/main', { recursive: true, long: true, paths: ['docs'] })
    expect(calls[0]!.argv).toEqual(['ls-tree', '-z', 'HEAD'])
    expect(calls[1]!.argv).toEqual(['ls-tree', '-z', '-r', '--long', 'origin/main', '--', 'docs'])
  })

  test('lsTree parses mode/type/sha/size and keeps a path with spaces', () => {
    const out =
      [
        '100644 blob 5626abf0f72e58d7a153368ba57db4c673c0e171       4\tdocs/a b.md',
        '040000 tree aaaa000000000000000000000000000000000000       -\tdocs',
        '160000 commit bbbb000000000000000000000000000000000000       -\tvendor/sub',
      ].join('\x00') + '\x00'
    const { runner } = recorder(OK(out))
    expect(new Git('/repo', { runner }).lsTree('HEAD', { long: true })).toEqual([
      {
        mode: '100644',
        type: 'blob',
        sha: '5626abf0f72e58d7a153368ba57db4c673c0e171',
        sizeBytes: 4,
        path: 'docs/a b.md',
      },
      {
        mode: '040000',
        type: 'tree',
        sha: 'aaaa000000000000000000000000000000000000',
        sizeBytes: null,
        path: 'docs',
      },
      {
        mode: '160000',
        type: 'commit',
        sha: 'bbbb000000000000000000000000000000000000',
        sizeBytes: null,
        path: 'vendor/sub',
      },
    ])
    // Without --long there is no size field at all, so sizeBytes is null.
    const plain = recorder(OK('100644 blob abcd\tx.md\x00'))
    expect(new Git('/repo', { runner: plain.runner }).lsTree('HEAD')[0]!.sizeBytes).toBeNull()
  })

  test("diffTree shares diffNameStatus's parser, `from` included", () => {
    const out = ['R100', 'old.md', 'new.md', 'A', 'added.md'].join('\x00') + '\x00'
    const { runner, calls } = recorder(OK(out))
    const git = new Git('/repo', { runner })
    expect(git.diffTree('HEAD')).toEqual([
      { status: 'R100', path: 'new.md', from: 'old.md' },
      { status: 'A', path: 'added.md' },
    ])
    expect(calls[0]!.argv).toEqual([
      'diff-tree',
      '-r',
      '--no-commit-id',
      '--name-status',
      '-z',
      'HEAD',
    ])
    git.diffTree('HEAD', { root: true, noRenames: true, paths: ['docs'] })
    expect(calls[1]!.argv).toEqual([
      'diff-tree',
      '-r',
      '--no-commit-id',
      '--root',
      '--no-renames',
      '--name-status',
      '-z',
      'HEAD',
      '--',
      'docs',
    ])
  })

  test('grep orders its flags before the pattern and pathspecs after --', () => {
    const { runner, calls } = recorder(OK('docs/b.md:1:TODO here\n'))
    const git = new Git('/repo', { runner })
    expect(git.grep('TODO')).toEqual(['docs/b.md:1:TODO here'])
    git.grep('TODO|FIXME', {
      lineNumber: true,
      extendedRegexp: true,
      noColor: true,
      paths: ['docs'],
    })
    expect(calls[0]!.argv).toEqual(['grep', 'TODO'])
    expect(calls[1]!.argv).toEqual(['grep', '-n', '-E', '--no-color', 'TODO|FIXME', '--', 'docs'])
  })

  test('isAncestor and aheadBehind build their argv and read the answer', () => {
    const { runner, calls } = recorder(OK(''))
    expect(new Git('/repo', { runner }).isAncestor('main', 'task/x')).toBe(true)
    expect(calls[0]!.argv).toEqual(['merge-base', '--is-ancestor', 'main', 'task/x'])

    // git prints the LEFT count first, and left is `base` — so that number is
    // BEHIND.
    const ab = recorder(OK('1\t2\n'))
    expect(new Git('/repo', { runner: ab.runner }).aheadBehind('main', 'task/x')).toEqual({
      behind: 1,
      ahead: 2,
    })
    expect(ab.calls[0]!.argv).toEqual(['rev-list', '--left-right', '--count', 'main...task/x'])
  })

  test('statusPorcelain gains pathspecs without changing its bare argv', () => {
    const { runner, calls } = recorder(OK(''))
    const git = new Git('/repo', { runner })
    git.statusPorcelain()
    git.statusPorcelain({ paths: ['docs', 'a b.md'] })
    git.statusPorcelain({ paths: [] })
    expect(calls[0]!.argv).toEqual(['status', '--porcelain'])
    expect(calls[1]!.argv).toEqual(['status', '--porcelain', '--', 'docs', 'a b.md'])
    expect(calls[2]!.argv).toEqual(['status', '--porcelain'])
  })

  test('add/commit/lsRemote keep their argv without the new options', () => {
    const { runner, calls } = recorder(OK(''))
    const git = new Git('/repo', { runner })
    git.add(['a.ts'])
    git.commit({ message: 'm' })
    git.commit({ messageFile: '/tmp/msg', allowEmpty: true })
    git.lsRemote('origin', 'refs/heads/*')
    expect(calls[0]!.argv).toEqual(['add', '--', 'a.ts'])
    expect(calls[1]!.argv).toEqual(['commit', '-m', 'm'])
    expect(calls[2]!.argv).toEqual(['commit', '--allow-empty', '-F', '/tmp/msg'])
    expect(calls[3]!.argv).toEqual(['ls-remote', 'origin', 'refs/heads/*'])
  })

  test('the new add/commit/lsRemote options build the flags they promise', () => {
    const { runner, calls } = recorder(OK(''))
    const git = new Git('/repo', { runner })
    git.add(['.'], { all: true, update: true })
    // `body` is a SECOND -m, which git renders after a blank line.
    git.commit({
      message: 'subject',
      body: 'body text',
      signoff: true,
      noVerify: true,
      amend: true,
    })
    git.commit({ messageFile: '/tmp/m' })
    // Type-only checks, never invoked, so they add no recorded calls.
    const _exclusive = (): void => {
      // @ts-expect-error a message file and a body are exclusive: git rejects -F with -m.
      git.commit({ messageFile: '/tmp/m', body: 'ignored' })
      // @ts-expect-error a stdin message and a file are exclusive.
      git.commit({ messageStdin: 'x', messageFile: '/tmp/m' })
    }
    void _exclusive
    git.lsRemote('origin', undefined, { heads: true, tags: true })
    expect(calls[0]!.argv).toEqual(['add', '--all', '--update', '--', '.'])
    expect(calls[1]!.argv).toEqual([
      'commit',
      '--amend',
      '--no-verify',
      '--signoff',
      '-m',
      'subject',
      '-m',
      'body text',
    ])
    expect(calls[2]!.argv).toEqual(['commit', '-F', '/tmp/m'])
    expect(calls[3]!.argv).toEqual(['ls-remote', '--heads', '--tags', 'origin'])
  })

  test('commit({ messageStdin }) feeds the exact bytes on stdin via -F -', () => {
    const { runner, calls } = recorder(OK(''))
    const git = new Git('/repo', { runner })
    git.commit({ messageStdin: 'subject\n\nbody', signoff: true })
    git.commit({ messageStdin: 'with newline\n' })
    expect(calls[0]!.argv).toEqual(['commit', '--signoff', '-F', '-'])
    expect(calls[0]!.input).toBe('subject\n\nbody')
    expect(calls[1]!.input).toBe('with newline\n')
  })

  test('configSet, init and worktreeMove build their argv', () => {
    const { runner, calls } = recorder(OK(''))
    const git = new Git('/repo', { runner })
    git.configSet('user.name', 't')
    git.configSet('core.editor', 'vim', { scope: 'global' })
    git.init()
    git.init('/store', { bare: true, initialBranch: 'main', quiet: true })
    git.worktreeMove('/old', '/new', { force: true })
    expect(calls[0]!.argv).toEqual(['config', 'user.name', 't'])
    expect(calls[1]!.argv).toEqual(['config', '--global', 'core.editor', 'vim'])
    expect(calls[2]!.argv).toEqual(['init'])
    expect(calls[3]!.argv).toEqual(['init', '--quiet', '--bare', '-b', 'main', '/store'])
    expect(calls[4]!.argv).toEqual(['worktree', 'move', '--force', '/old', '/new'])
  })

  test('clone puts every flag before the url, and the destination last', () => {
    const { runner, calls } = recorder(OK(''))
    const git = new Git('/work', { runner })
    git.clone('https://example.invalid/r.git')
    git.clone('https://example.invalid/r.git', 'kit', { depth: 1, branch: 'v2.1', quiet: true })
    expect(calls[0]!.argv).toEqual(['clone', 'https://example.invalid/r.git'])
    expect(calls[1]!.argv).toEqual([
      'clone',
      '--quiet',
      '--depth',
      '1',
      '--branch',
      'v2.1',
      'https://example.invalid/r.git',
      'kit',
    ])
    // cwd is where a relative dest resolves — see `Git.clone` in sync.ts.
    expect(calls[1]!.cwd).toBe('/work')
  })

  // `grep` is the one Tier 2 verb whose absence code is invisible in its argv,
  // and the one most likely to be got wrong: exit 1 is "no matches".
  test('grep reads exit 1 as no matches and anything else as a failure', () => {
    expect(new Git('/repo', { runner: recorder(EXIT(1)).runner }).grep('x')).toEqual([])
    expect(() => new Git('/repo', { runner: recorder(EXIT(128)).runner }).grep('x')).toThrow(
      CommandFailed,
    )
    expect(() => new Git('/repo', { runner: recorder(EXIT(129)).runner }).grep('x')).toThrow(
      CommandFailed,
    )
    expect(new Git('/repo', { runner: recorder(EXIT(1)).runner }).try.grep('x')).toEqual({
      ok: true,
      value: [],
    })
  })

  // A typo'd rev exits 128, and reading that as "not an ancestor" is how a
  // caller deletes a branch it should have kept.
  test('isAncestor reads exit 1 as false and exit 128 as a failure', () => {
    expect(new Git('/repo', { runner: recorder(EXIT(1)).runner }).isAncestor('a', 'b')).toBe(false)
    expect(() =>
      new Git('/repo', { runner: recorder(EXIT(128)).runner }).isAncestor('a', 'b'),
    ).toThrow(CommandFailed)
  })

  test('the other Tier 2 verbs declare no absence, so any non-zero exit throws', () => {
    const { runner } = recorder(FAIL)
    const git = new Git('/repo', { runner })
    expect(() => git.lsTree('HEAD')).toThrow(CommandFailed)
    expect(() => git.diffTree('HEAD')).toThrow(CommandFailed)
    expect(() => git.aheadBehind('main', 'HEAD')).toThrow(CommandFailed)
    expect(() => git.configSet('a.b', 'c')).toThrow(CommandFailed)
    expect(() => git.init()).toThrow(CommandFailed)
    expect(() => git.worktreeMove('/a', '/b')).toThrow(CommandFailed)
    // Exit 0 with output we cannot read is not an answer either: 0/0 would be
    // indistinguishable from "in sync".
    expect(() =>
      new Git('/repo', { runner: recorder(OK('garbage\n')).runner }).aheadBehind('main', 'HEAD'),
    ).toThrow(CommandFailed)
  })

  test('an undeclared non-zero exit throws, for every query', () => {
    const { runner } = recorder(FAIL)
    const git = new Git('/repo', { runner })
    expect(() => git.revParse('HEAD')).toThrow(CommandFailed)
    expect(() => git.currentBranch()).toThrow(CommandFailed)
    expect(() => git.statusPorcelain()).toThrow(CommandFailed)
    expect(() => git.isDirty()).toThrow(CommandFailed)
    expect(() => git.branches()).toThrow(CommandFailed)
    expect(() => git.worktrees()).toThrow(CommandFailed)
    expect(() => git.mergeBase('a', 'b')).toThrow(CommandFailed)
    expect(() => git.lsRemote('origin')).toThrow(CommandFailed)
    expect(() => git.checkIgnore(['a'])).toThrow(CommandFailed)
    expect(() => git.lsFiles()).toThrow(CommandFailed)
    expect(() => git.forEachRef('refs/heads/')).toThrow(CommandFailed)
    expect(() => git.refs('refs/heads/')).toThrow(CommandFailed)
    expect(() => git.diffNameOnly()).toThrow(CommandFailed)
    expect(() => git.diffNameStatus()).toThrow(CommandFailed)
    expect(() => git.log()).toThrow(CommandFailed)
  })

  test('resolveRef / hasHistory / headRef build their flags', () => {
    const { runner, calls } = recorder(OK('abc123\n'))
    const git = new Git('/repo', { runner })
    expect(git.resolveRef('refs/heads/main')).toBe('abc123')
    expect(git.hasHistory()).toBe(true)
    expect(git.headRef()).toBe('abc123')
    expect(calls[0]!.argv).toEqual(['rev-parse', '--verify', '--quiet', 'refs/heads/main'])
    expect(calls[1]!.argv).toEqual(['rev-parse', '--verify', '--quiet', 'HEAD'])
    expect(calls[2]!.argv).toEqual(['rev-parse', '--abbrev-ref', 'HEAD'])
  })

  test('remote / remoteGetUrl / remoteAdd build their argv and parse rows', () => {
    const { runner, calls } = recorder(OK('origin\nupstream\n'))
    const git = new Git('/repo', { runner })
    expect(git.remote()).toEqual(['origin', 'upstream'])
    git.remoteGetUrl('origin')
    git.remoteAdd('upstream', '/store.git')
    expect(calls[0]!.argv).toEqual(['remote'])
    expect(calls[1]!.argv).toEqual(['remote', 'get-url', 'origin'])
    expect(calls[2]!.argv).toEqual(['remote', 'add', 'upstream', '/store.git'])
  })

  test("logLines splits log's stdout and runs the same argv", () => {
    const { runner, calls } = recorder(OK('abc\n\ndef\n'))
    const git = new Git('/repo', { runner })
    expect(git.logLines({ format: '%H', maxCount: 2 })).toEqual(['abc', 'def'])
    expect(calls[0]!.argv).toEqual(['log', '--format=%H', '--max-count=2'])
  })

  test('diffTreeNumstat asks for --numstat and reads `-` as null', () => {
    const { runner, calls } = recorder(OK('3\t1\tdocs/a b.md\x00-\t-\timg/x.png\x00'))
    const git = new Git('/repo', { runner })
    expect(git.diffTreeNumstat('HEAD', { root: true, noRenames: true })).toEqual([
      { path: 'docs/a b.md', linesAdded: 3, linesDeleted: 1 },
      { path: 'img/x.png', linesAdded: null, linesDeleted: null },
    ])
    expect(calls[0]!.argv).toEqual([
      'diff-tree',
      '-r',
      '--no-commit-id',
      '--root',
      '--no-renames',
      '--numstat',
      '-z',
      'HEAD',
    ])
  })

  test('diffTreeNumstat keeps a TAB inside a path — `-z` leaves the bytes raw', () => {
    // The record is `<added>\t<deleted>\t<path>`, and only the first two tabs
    // are separators: a path may contain one, since `-z` turns off git's
    // quoting.
    const { runner } = recorder(OK('1\t0\ta\tb.txt\x00'))
    expect(new Git('/repo', { runner }).diffTreeNumstat('HEAD')).toEqual([
      { path: 'a\tb.txt', linesAdded: 1, linesDeleted: 0 },
    ])
  })

  // The seam fabricates exit 1 when the child never reported a status — a
  // `git` missing from PATH, a timeout kill, an abort — and that stand-in
  // collides with the absence code half the table below declares. A result
  // carrying `neverExited` is a failure for every verb, declared or not.
  test('a process that never ran is a failure, not a declared absence', () => {
    const at = () =>
      new Git('/repo', {
        runner: recorder({
          exitCode: 1,
          stdout: '',
          stderr: '',
          neverExited: true,
          reason: 'timeout',
          error: 'spawnSync git ETIMEDOUT',
        }).runner,
      })
    expect(() => at().configGet('user.name')).toThrow(CommandFailed)
    expect(() => at().resolveRef('refs/heads/main')).toThrow(CommandFailed)
    expect(() => at().hasHistory()).toThrow(CommandFailed)
    expect(() => at().isAncestor('a', 'b')).toThrow(CommandFailed)
    expect(() => at().checkIgnore(['secret.key'])).toThrow(CommandFailed)
    expect(() => at().mergeBase('a', 'b')).toThrow(CommandFailed)
    expect(() => at().grep('needle')).toThrow(CommandFailed)
    expect(() => at().revParse('--verify', '--quiet', 'HEAD')).toThrow(CommandFailed)
  })

  // One case per verb that declares an absence code: the declaration is the
  // deliverable of this contract, and an undeclared code beside it must throw.
  test("each verb's declared absence returns its value; its neighbours throw", () => {
    const at = (r: CommandResult) => new Git('/repo', { runner: recorder(r).runner })

    // showAtRev / logSubject: 128 (overloaded with "not a repository").
    expect(at(EXIT(128)).showAtRev('v', 'p')).toBeNull()
    expect(at(EXIT(128)).logSubject('HEAD')).toBeNull()
    expect(() => at(EXIT(1)).showAtRev('v', 'p')).toThrow(CommandFailed)

    // revParse: 1, the code `--verify --quiet` returns for a missing ref.
    expect(at(EXIT(1)).revParse('--verify', '--quiet', 'nope')).toBeNull()
    expect(() => at(EXIT(128)).revParse('nope')).toThrow(CommandFailed)

    // topLevel / gitCommonDir: 128, because "not a repository" IS the answer.
    expect(at(EXIT(128)).topLevel()).toBeNull()
    expect(at(EXIT(128)).gitCommonDir()).toBeNull()

    // mergeBase: 1 is "unrelated histories"; 128 is a rev that does not exist.
    expect(at(EXIT(1)).mergeBase('a', 'b')).toBeNull()

    // configGet: 1 is an unset key.
    expect(at(EXIT(1)).configGet('no.such.key')).toBeNull()
    expect(() => at(EXIT(128)).configGet('no.such.key')).toThrow(CommandFailed)

    // objectExists: a predicate, so both of git's "no" codes are false.
    expect(at(EXIT(1)).objectExists('deadbeef')).toBe(false)
    expect(at(EXIT(128)).objectExists('nonsense')).toBe(false)

    // checkIgnore: 1 is "none of these paths are ignored".
    expect(at(EXIT(1)).checkIgnore(['a.md'])).toEqual(new Set())

    // resolveRef: 1 is a ref that does not resolve; 128 is an unreadable store.
    expect(at(EXIT(1)).resolveRef('refs/heads/gone')).toBeNull()
    expect(at(EXIT(1)).hasHistory()).toBe(false)
    expect(() => at(EXIT(128)).resolveRef('HEAD')).toThrow(CommandFailed)

    // remoteGetUrl: 2 — git's code for an unknown remote, not 1 and not 128.
    expect(at(EXIT(2)).remoteGetUrl('nope')).toBeNull()
    expect(() => at(EXIT(1)).remoteGetUrl('nope')).toThrow(CommandFailed)
  })

  test('mutations declare no absence, so any non-zero exit throws', () => {
    const { runner } = recorder(FAIL)
    const git = new Git('/repo', { runner })
    expect(() => git.add(['x'])).toThrow(CommandFailed)
    expect(() => git.commit({ message: 'm' })).toThrow(CommandFailed)
    expect(() => git.push('origin', 'HEAD')).toThrow(CommandFailed)
    expect(() => git.worktreeRemove('/wt')).toThrow(CommandFailed)
    expect(() => git.deleteBranch('b', { force: true })).toThrow(CommandFailed)
    expect(() => new Git('/repo', { runner: recorder(EXIT(1)).runner }).add(['x'])).toThrow(
      CommandFailed,
    )
  })

  test('raw stays outside the gate; rawChecked is the throwing door', () => {
    const { runner } = recorder(FAIL)
    const git = new Git('/repo', { runner })
    expect(git.raw(['status']).exitCode).toBe(128)
    expect(() => git.rawChecked(['status'])).toThrow(CommandFailed)
  })

  test('worktrees() parses porcelain incl. detached and branch rows', () => {
    const porcelain = [
      'worktree /repo',
      'HEAD aaaa',
      'branch refs/heads/main',
      '',
      'worktree /repo-wt/x',
      'HEAD bbbb',
      'detached',
      '',
      // A bare entry: git prints a literal `bare` line and NO `HEAD` line.
      'worktree /store.git',
      'bare',
      '',
    ].join('\n')
    const { runner } = recorder(OK(porcelain))
    const rows = new Git('/repo', { runner }).worktrees()
    expect(rows).toEqual([
      {
        path: '/repo',
        head: 'aaaa',
        branch: 'main',
        detached: false,
        bare: false,
        locked: false,
        lockReason: null,
      },
      {
        path: '/repo-wt/x',
        head: 'bbbb',
        branch: null,
        detached: true,
        bare: false,
        locked: false,
        lockReason: null,
      },
      {
        path: '/store.git',
        head: null,
        branch: null,
        detached: false,
        bare: true,
        locked: false,
        lockReason: null,
      },
    ])
  })

  test('worktrees() reads `locked` and its optional reason', () => {
    const porcelain = [
      'worktree /a',
      'HEAD aaaa',
      'branch refs/heads/a',
      'locked',
      '',
      'worktree /b',
      'HEAD bbbb',
      'branch refs/heads/b',
      'locked on a usb drive',
      '',
    ].join('\n')
    const rows = new Git('/repo', { runner: recorder(OK(porcelain)).runner }).worktrees()
    expect(rows.map((r) => [r.locked, r.lockReason])).toEqual([
      [true, null],
      [true, 'on a usb drive'],
    ])
  })

  // `bare` is read from the porcelain, not inferred from a missing HEAD: an
  // unborn-HEAD checkout reports an all-zero HEAD, and a prunable entry keeps
  // the HEAD it had, so neither is bare despite looking unusual.
  test('worktrees() reads `bare` from the line, not from a missing HEAD', () => {
    const porcelain = [
      'worktree /unborn',
      'HEAD 0000000000000000000000000000000000000000',
      'branch refs/heads/main',
      '',
      'worktree /gone',
      'HEAD cccc',
      'detached',
      'prunable gitdir file points to non-existent location',
      '',
    ].join('\n')
    const { runner } = recorder(OK(porcelain))
    const rows = new Git('/repo', { runner }).worktrees()
    expect(rows.map((r) => r.bare)).toEqual([false, false])
    expect(rows[0]!.head).toBe('0000000000000000000000000000000000000000')
  })

  test('checkIgnore sends NUL-delimited stdin and parses NUL output', () => {
    const { runner, calls } = recorder(OK('a/b.md\x00c d.md\x00'))
    const ignored = new Git('/repo', { runner }).checkIgnore(['a/b.md', 'c d.md', 'kept.md'])
    expect(calls[0]!.argv).toEqual(['check-ignore', '--stdin', '-z'])
    expect(calls[0]!.input).toBe('a/b.md\x00c d.md\x00kept.md\x00')
    expect(ignored).toEqual(new Set(['a/b.md', 'c d.md']))
  })

  test('checkIgnoreVerbose parses four NUL fields per match and sends NUL stdin', () => {
    const { runner, calls } = recorder(OK('.gitignore\x003\x00build/log/\x00build/log/x\x00'))
    const got = new Git('/repo', { runner }).checkIgnoreVerbose(['build/log/x', 'kept.md'])
    expect(calls[0]!.argv).toEqual(['check-ignore', '-v', '--stdin', '-z'])
    expect(calls[0]!.input).toBe('build/log/x\x00kept.md\x00')
    expect(got).toEqual([
      { source: '.gitignore', line: 3, pattern: 'build/log/', path: 'build/log/x' },
    ])
    expect(
      new Git('/repo', { runner: recorder(EXIT(1)).runner }).checkIgnoreVerbose(['a']),
    ).toEqual([])
    expect(new Git('/repo', { runner }).checkIgnoreVerbose([])).toEqual([])
  })

  // The correctness hot spot: a rename record is three NUL fields, not two, so
  // a parser that pairs fields desynchronizes on the first rename and
  // mislabels everything after it. The third field is the source path, which
  // `from` reports — and only for R/C, so a plain record stays two-keyed.
  test('diffNameStatus keeps the R100/C075 token, the destination, and `from`', () => {
    const out =
      [
        'M',
        'docs/kept.md',
        'R100',
        'docs/a.md',
        'docs/renamed.md',
        'A',
        'new.txt',
        'C075',
        'src/orig.ts',
        'src/copy.ts',
        'D',
        'gone.md',
      ].join('\x00') + '\x00'
    const { runner } = recorder(OK(out))
    expect(new Git('/repo', { runner }).diffNameStatus()).toEqual([
      { status: 'M', path: 'docs/kept.md' },
      { status: 'R100', path: 'docs/renamed.md', from: 'docs/a.md' },
      { status: 'A', path: 'new.txt' },
      { status: 'C075', path: 'src/copy.ts', from: 'src/orig.ts' },
      { status: 'D', path: 'gone.md' },
    ])
  })

  test('a truncated trailing record is dropped rather than reported pathless', () => {
    const { runner } = recorder(OK('M\x00a.md\x00D\x00'))
    expect(new Git('/repo', { runner }).diffNameStatus()).toEqual([{ status: 'M', path: 'a.md' }])
  })

  test('refs() splits each row at the FIRST tab and skips malformed rows', () => {
    const { runner } = recorder(OK('abc\trefs/heads/main\n\ndef\trefs/heads/a\tb\nnotarow\n'))
    expect(new Git('/repo', { runner }).refs('refs/heads/')).toEqual([
      { sha: 'abc', ref: 'refs/heads/main' },
      { sha: 'def', ref: 'refs/heads/a\tb' },
    ])
  })

  // The caller's format decides where a record ends, so the bytes come back
  // whole: splitting on newlines would cut a `%x1e`-framed record in half.
  test('log returns stdout verbatim — unsplit, untrimmed', () => {
    const raw = '\x1eabc\x1f2020-01-01\x1fsubject\x1fbody\nline two\n\n'
    const { runner } = recorder(OK(raw))
    expect(new Git('/repo', { runner }).log({ format: 'format:%x1e%H' })).toBe(raw)
  })

  test('lsFilesTagged splits the tag from the path', () => {
    const { runner, calls } = recorder(OK('H a.ts\x00S b/c d.ts\x00h e.ts\x00'))
    expect(new Git('/repo', { runner }).lsFilesTagged()).toEqual([
      { tag: 'H', path: 'a.ts' },
      { tag: 'S', path: 'b/c d.ts' },
      { tag: 'h', path: 'e.ts' },
    ])
    expect(calls[0]!.argv).toEqual(['ls-files', '-v', '-z'])
  })

  test('lsFiles drops empty NUL segments, including the trailing one', () => {
    const { runner } = recorder(OK('a.ts\x00'))
    expect(new Git('/repo', { runner }).lsFiles()).toEqual(['a.ts'])
    expect(new Git('/repo', { runner: recorder(OK('')).runner }).lsFiles()).toEqual([])
  })

  test("diffAddedFile renders against /dev/null, keeping --no-index's non-zero exit", () => {
    // `--no-index` exits 1 whenever the inputs differ, which for a real file
    // is always — treating that as failure would discard every added file.
    const { runner, calls } = recorder({
      exitCode: 1,
      stdout: '+++ b/src/new.ts\n',
      stderr: '',
    })
    const out = new Git('/repo', { runner }).diffAddedFile('src/new.ts')

    expect(calls[0]!.argv).toEqual(['diff', '--no-index', '--', '/dev/null', 'src/new.ts'])
    expect(out).toContain('+++ b/src/new.ts')
  })

  test('diffText returns the diff, and empty string on failure', () => {
    const { runner: ok } = recorder(OK('@@ -1 +1 @@\n'))
    expect(new Git('/repo', { runner: ok }).diffText('HEAD')).toContain('@@')

    const { runner: bad } = recorder({ exitCode: 128, stdout: '', stderr: 'boom' })
    expect(new Git('/repo', { runner: bad }).diffText('HEAD')).toBe('')
  })

  test('at() re-roots the cwd, keeping the runner', () => {
    const { runner, calls } = recorder(OK(''))
    new Git('/repo', { runner }).at('/elsewhere').statusPorcelain()
    expect(calls[0]!.cwd).toBe('/elsewhere')
  })

  test('gitDir/workTree prefix every invocation and survive at()', () => {
    const { runner, calls } = recorder(OK(''))
    const git = new Git('/anywhere', { runner, gitDir: '/store/.git', workTree: '/tree' })
    git.statusPorcelain()
    git.raw(['status'])
    git.at('/elsewhere').currentBranch()
    expect(calls[0]!.argv).toEqual([
      '--git-dir=/store/.git',
      '--work-tree=/tree',
      'status',
      '--porcelain',
    ])
    expect(calls[1]!.argv).toEqual(['--git-dir=/store/.git', '--work-tree=/tree', 'status'])
    expect(calls[2]!.argv).toEqual([
      '--git-dir=/store/.git',
      '--work-tree=/tree',
      'branch',
      '--show-current',
    ])
  })

  // A failure names the invocation that actually ran, wherever it is raised.
  // The two verbs that throw from inside `parse` rather than from the exit
  // code — merge's refusal-vs-conflict read and aheadBehind's unreadable
  // stdout — have to report the prefixed argv like every other failure.
  test('a parse-time failure reports the prefixed argv too', () => {
    const bound = (result: CommandResult): Git =>
      new Git('/anywhere', {
        runner: recorder(result).runner,
        gitDir: '/store/.git',
        workTree: '/tree',
      })
    const prefix = ['--git-dir=/store/.git', '--work-tree=/tree']

    // Exit 1 with empty stdout is git declining to merge at all, not a conflict.
    expect(() => bound(EXIT(1)).merge('nope')).toThrow(CommandFailed)
    try {
      bound(EXIT(1)).merge('nope')
    } catch (e) {
      expect((e as CommandFailed).argv).toEqual([...prefix, 'merge', '--no-edit', 'nope'])
    }

    try {
      bound(OK('not two counts\n')).aheadBehind('a', 'b')
    } catch (e) {
      expect((e as CommandFailed).argv).toEqual([
        ...prefix,
        'rev-list',
        '--left-right',
        '--count',
        'a...b',
      ])
    }
  })

  test('env and timeoutMs reach the runner from any method', () => {
    const opts: Array<Record<string, unknown>> = []
    const runner: CommandRunner = {
      run: (_argv, o) => {
        opts.push(o as unknown as Record<string, unknown>)
        return OK('')
      },
    }
    const git = new Git('/repo', { runner })
    git.statusPorcelain({ env: { GIT_AUTHOR_DATE: '2020-01-01T00:00:00+0000' } })
    git.worktrees({ timeoutMs: 500 })
    git.raw(['log'], { env: { GIT_PAGER: 'cat' } })
    expect(opts[0]!.env).toEqual({ GIT_AUTHOR_DATE: '2020-01-01T00:00:00+0000' })
    expect(opts[1]!.timeoutMs).toBe(500)
    expect(opts[2]!.env).toEqual({ GIT_PAGER: 'cat' })
  })

  // A client-level `env` reaches every call, including the internal ones a
  // caller never names — `commit()`'s own `rev-parse` in `testing.ts`.
  test('client-level env reaches every call and survives at()', () => {
    const opts: Array<Record<string, unknown>> = []
    const runner: CommandRunner = {
      run: (_argv, o) => {
        opts.push(o as unknown as Record<string, unknown>)
        return OK('')
      },
    }
    const git = new Git('/repo', { runner, env: { GIT_AUTHOR_NAME: 'Fixture' } })
    git.statusPorcelain()
    git.raw(['log'])
    git.at('/elsewhere').currentBranch()
    for (const o of opts) expect(o.env).toEqual({ GIT_AUTHOR_NAME: 'Fixture' })
  })

  test("a per-call env entry wins over the client's, and the rest merge", () => {
    const opts: Array<Record<string, unknown>> = []
    const runner: CommandRunner = {
      run: (_argv, o) => {
        opts.push(o as unknown as Record<string, unknown>)
        return OK('')
      },
    }
    const git = new Git('/repo', {
      runner,
      env: { GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_DATE: '2020-01-01T00:00:00+0000' },
    })
    git.statusPorcelain({ env: { GIT_AUTHOR_DATE: '2021-06-06T00:00:00+0000' } })
    expect(opts[0]!.env).toEqual({
      GIT_AUTHOR_NAME: 'Fixture',
      GIT_AUTHOR_DATE: '2021-06-06T00:00:00+0000',
    })
  })

  // Without the prefix the error says `add --all -- .` and names no repository.
  test('CommandFailed carries the gitDir/workTree prefix, not the bare verb argv', () => {
    const { runner } = recorder(FAIL)
    const git = new Git('/anywhere', { runner, gitDir: '/store.git', workTree: '/tree' })
    const err = (() => {
      try {
        git.add(['.'], { all: true })
      } catch (e) {
        return e
      }
      return null
    })()
    expect(err).toBeInstanceOf(CommandFailed)
    expect((err as CommandFailed).argv).toEqual([
      '--git-dir=/store.git',
      '--work-tree=/tree',
      'add',
      '--all',
      '--',
      '.',
    ])
  })

  test("an unbound client's CommandFailed still reports the plain verb argv", () => {
    const { runner } = recorder(FAIL)
    const err = (() => {
      try {
        new Git('/repo', { runner }).add(['a.ts'])
      } catch (e) {
        return e
      }
      return null
    })()
    expect((err as CommandFailed).argv).toEqual(['add', '--', 'a.ts'])
  })

  // Bare `--git-common-dir` answers the literal `.git` from a primary
  // checkout; the verb passes `--path-format=absolute`.
  test('gitCommonDir asks git for an absolute path itself', () => {
    const { runner, calls } = recorder(OK('/repo/.git\n'))
    expect(new Git('/repo', { runner }).gitCommonDir()).toBe('/repo/.git')
    expect(calls[0]!.argv).toEqual(['rev-parse', '--path-format=absolute', '--git-common-dir'])
  })
})

// `try` is the door for callers that genuinely tolerate failure.
describe('Git — git.try.*', () => {
  test('a failure is reported, not thrown, and carries the CommandFailed', () => {
    const git = new Git('/repo', { runner: recorder(FAIL).runner })
    const r = git.try.statusPorcelain()
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('unreachable')
    expect(r.error).toBeInstanceOf(CommandFailed)
    expect(r.error.result.stderr).toBe('fatal: nope')
  })

  test('a declared absence is ok:true — absence is an answer, not a failure', () => {
    const git = new Git('/repo', { runner: recorder(EXIT(1)).runner })
    const r = git.try.configGet('no.such.key')
    expect(r).toEqual({ ok: true, value: null })
  })

  test('success carries the parsed value, composed methods included', () => {
    const git = new Git('/repo', { runner: recorder(OK(' M a.ts\n')).runner })
    expect(git.try.statusPorcelain()).toEqual({ ok: true, value: [' M a.ts'] })
    expect(git.try.isDirty()).toEqual({ ok: true, value: true })
  })

  test('it catches CommandFailed only — a programmer error still propagates', () => {
    const runner: CommandRunner = {
      run: () => {
        throw new TypeError('boom')
      },
    }
    expect(() => new Git('/repo', { runner }).try.statusPorcelain()).toThrow(TypeError)
  })
})

// `soft` is the door for callers whose fallback is the verb's own absence value.
describe('Git — git.soft.*', () => {
  const broken = () => new Git('/repo', { runner: recorder(FAIL).runner })

  test('a failure falls back to the verb absence value: null, [] or false', () => {
    expect(broken().soft.resolveRef('x')).toBeNull()
    expect(broken().soft.statusPorcelain()).toEqual([])
    expect(broken().soft.branchExists('x')).toBe(false)
  })

  test('each failure returns a fresh array, not a shared one', () => {
    const git = broken()
    const a = git.soft.worktrees()
    a.push({} as never)
    expect(git.soft.worktrees()).toEqual([])
  })

  test('success passes the parsed value through', () => {
    const git = new Git('/repo', { runner: recorder(OK(' M a.ts\n')).runner })
    expect(git.soft.statusPorcelain()).toEqual([' M a.ts'])
    expect(git.soft.isDirty()).toBe(true)
  })

  test('it catches CommandFailed only — a programmer error still propagates', () => {
    const runner: CommandRunner = {
      run: () => {
        throw new TypeError('boom')
      },
    }
    expect(() => new Git('/repo', { runner }).soft.resolveRef('x')).toThrow(TypeError)
  })

  test('verbs without an absence value are not on the soft door', () => {
    // @ts-expect-error aheadBehind returns a record, so it has no soft form
    expect(() => broken().soft.aheadBehind('a', 'b')).toThrow(TypeError)
  })

  test('statusPorcelain strips a trailing CR from each line', () => {
    const git = new Git('/repo', { runner: recorder(OK(' M a.ts\r\n?? b.ts\r\n')).runner })
    expect(git.statusPorcelain()).toEqual([' M a.ts', '?? b.ts'])
  })
})

// ── real-git layer ──────────────────────────────────────────────────────────

let repo: string
let nonRepo: string

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'typedgit-'))
  nonRepo = mkdtempSync(join(tmpdir(), 'typedgit-bare-dir-'))
  const git = new Git(repo)
  git.rawChecked(['init', '-b', 'main'])
  git.rawChecked(['config', 'user.email', 't@t'])
  git.rawChecked(['config', 'user.name', 't'])
  mkdirSync(join(repo, 'docs'))
  writeFileSync(join(repo, 'docs', 'a.md'), 'one\n')
  writeFileSync(join(repo, '.gitignore'), 'ignored-dir/\n')
  git.add(['.'])
  git.commit({ message: 'c1' })
})

afterAll(() => {
  rmSync(repo, { recursive: true, force: true })
  rmSync(nonRepo, { recursive: true, force: true })
})

describe('Git — real repo round trips', () => {
  test('currentBranch / topLevel / isDirty / showAtRev', () => {
    const git = new Git(repo)
    expect(git.currentBranch()).toBe('main')
    expect(git.topLevel()).not.toBeNull()
    expect(git.isDirty()).toBe(false)
    expect(git.showAtRev('HEAD', 'docs/a.md')).toBe('one\n')
    expect(git.showAtRev('HEAD', 'docs/missing.md')).toBeNull()

    writeFileSync(join(repo, 'docs', 'a.md'), 'two\n')
    expect(git.isDirty()).toBe(true)
    git.add(['docs/a.md'])
    git.commit({ message: 'c2' })
    expect(git.isDirty()).toBe(false)
  })

  test('worktreeAdd / worktrees / worktreeRemove / deleteBranch', () => {
    const git = new Git(repo)
    const wt = join(repo, 'wt-x')
    git.worktreeAdd(wt, { branch: 'task/x', startPoint: 'main' })
    const rows = git.worktrees()
    expect(rows.some((w) => w.branch === 'task/x')).toBe(true)
    expect(git.branchExists('task/x')).toBe(true)
    git.worktreeRemove(wt, { force: true })
    git.worktreePrune()
    git.deleteBranch('task/x', { force: true })
    expect(git.branchExists('task/x')).toBe(false)
  })

  test('configRemoveSection reports whether the section existed', () => {
    const git = new Git(repo)
    git.configSet('branch.gone.remote', 'origin')
    expect(git.configRemoveSection('branch.gone')).toBe(true)
    expect(git.configGet('branch.gone.remote')).toBeNull()
    expect(git.configRemoveSection('branch.gone')).toBe(false)
  })

  test('deleteRef refuses a stale expected sha and leaves the ref', () => {
    const git = new Git(repo)
    const stale = git.resolveRef('HEAD')!
    git.worktreeAdd(join(repo, 'wt-cas'), { branch: 'cas', startPoint: 'main' })
    const wt = new Git(join(repo, 'wt-cas'))
    wt.commit({ message: 'moved', allowEmpty: true })
    const moved = git.resolveRef('refs/heads/cas')!
    git.worktreeRemove(join(repo, 'wt-cas'), { force: true })

    expect(() => git.deleteRef('refs/heads/cas', { expected: stale })).toThrow(CommandFailed)
    expect(git.try.deleteRef('refs/heads/cas', { expected: stale }).ok).toBe(false)
    expect(git.resolveRef('refs/heads/cas')).toBe(moved)

    git.deleteRef('refs/heads/cas', { expected: moved })
    expect(git.branchExists('cas')).toBe(false)
  })

  test('remote / remoteGetUrl / remoteAdd against real git', () => {
    const git = new Git(repo)
    expect(git.remote()).toEqual([])
    // Exit 2 — "no such remote" — is an answer.
    expect(git.remoteGetUrl('origin')).toBeNull()
    git.remoteAdd('origin', '/store.git')
    expect(git.remote()).toEqual(['origin'])
    expect(git.remoteGetUrl('origin')).toBe('/store.git')
    git.rawChecked(['remote', 'remove', 'origin'])
  })

  test('headRef reports the literal HEAD when detached; currentBranch is null', () => {
    const git = new Git(repo)
    const head = git.resolveRef('HEAD')!
    git.rawChecked(['checkout', '--detach', '--quiet', head])
    try {
      expect(git.headRef()).toBe('HEAD')
      expect(git.currentBranch()).toBeNull()
    } finally {
      git.rawChecked(['checkout', '--quiet', 'main'])
    }
  })

  test("diffTreeNumstat counts one commit's lines", () => {
    const git = new Git(repo)
    const rows = git.diffTreeNumstat('HEAD', { root: true })
    expect(rows.some((r) => r.path === 'docs/a.md' && r.linesAdded === 1)).toBe(true)
  })

  test('logLines splits what log returns whole', () => {
    const git = new Git(repo)
    expect(git.logLines({ format: '%H' })).toEqual(
      git
        .log({ format: '%H' })
        .split('\n')
        .filter((l) => l !== ''),
    )
  })

  test('mergeBase / logSubject / configGet / checkIgnore', () => {
    const git = new Git(repo)
    const head = git.revParse('HEAD')
    expect(git.mergeBase('HEAD', 'HEAD')).toBe(head)
    expect(() => git.mergeBase('HEAD', 'no-such-rev')).toThrow(CommandFailed)
    expect(git.logSubject('HEAD')).toBe('c2')
    expect(git.configGet('user.name')).toBe('t')
    expect(git.configGet('no.such.key')).toBeNull()
    expect(git.checkIgnore(['ignored-dir/f.md', 'docs/a.md'])).toEqual(
      new Set(['ignored-dir/f.md']),
    )
    const rules = git.checkIgnoreVerbose(['ignored-dir/f.md', 'docs/a.md'])
    expect(rules).toHaveLength(1)
    expect(rules[0]).toEqual({
      path: 'ignored-dir/f.md',
      source: '.gitignore',
      line: 1,
      pattern: 'ignored-dir/',
    })
    // Exit 1 — "none of these are ignored" — is an answer, not a failure.
    expect(git.checkIgnore(['docs/a.md'])).toEqual(new Set())
  })
})

// Only real git proves which exit code each verb actually gets.
describe('Git — real git outside a repository', () => {
  test("topLevel/gitCommonDir answer null: 'not a repo' is the question", () => {
    const git = new Git(nonRepo)
    expect(git.topLevel()).toBeNull()
    expect(git.gitCommonDir()).toBeNull()
  })

  test('a query that cannot be answered throws instead of reading as empty', () => {
    const git = new Git(nonRepo)
    expect(() => git.statusPorcelain()).toThrow(CommandFailed)
    expect(() => git.worktrees()).toThrow(CommandFailed)
    expect(() => git.branches()).toThrow(CommandFailed)
    expect(() => git.currentBranch()).toThrow(CommandFailed)
    expect(() => git.checkIgnore(['a.md'])).toThrow(CommandFailed)
  })

  test('git.try turns that throw into an outcome the caller can inspect', () => {
    const r = new Git(nonRepo).try.statusPorcelain()
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('unreachable')
    expect(r.error.result.exitCode).toBe(128)
  })

  test("real exit codes match each verb's declaration", () => {
    const git = new Git(repo)
    expect(git.revParse('--verify', '--quiet', 'refs/heads/no-such')).toBeNull()
    expect(() => git.revParse('no-such-rev')).toThrow(CommandFailed)
    expect(git.objectExists('deadbeefdeadbeefdeadbeefdeadbeefdeadbeef')).toBe(false)
    expect(git.objectExists('no-such-name')).toBe(false)
    expect(git.objectExists('HEAD')).toBe(true)
    expect(git.showAtRev('HEAD', 'docs/missing.md')).toBeNull()
    expect(() => git.lsRemote(join(nonRepo, 'no-such-remote'))).toThrow(CommandFailed)
  })

  test('gitDir/workTree drive a repo from outside its tree', () => {
    const git = new Git(nonRepo, { gitDir: join(repo, '.git'), workTree: repo })
    expect(git.currentBranch()).toBe('main')
    expect(git.isDirty()).toBe(false)
  })
})

// The measurement behind `log`'s and `objectExists`'s doc comments:
// `objectExists("HEAD")` cannot tell an empty repo from a broken one, and
// `resolveRef("HEAD")` can.
describe("Git — probing 'does this repo have history?'", () => {
  let scratch: string
  const at = (name: string) => new Git(join(scratch, name))

  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'typedgit-head-probe-'))
    for (const name of ['empty', 'dangling', 'noobjects']) {
      const dir = join(scratch, name)
      mkdirSync(dir)
      const g = new Git(dir)
      g.init(undefined, { quiet: true, initialBranch: 'main' })
      g.configSet('user.email', 't@t')
      g.configSet('user.name', 't')
      if (name !== 'empty') g.commit({ message: 'c1', allowEmpty: true })
    }
    // A HEAD ref pointing at an object that is not there.
    writeFileSync(
      join(scratch, 'dangling', '.git', 'refs', 'heads', 'main'),
      '0000000000000000000000000000000000000001\n',
    )
    // A HEAD ref that is fine and an object store that is gone.
    rmSync(join(scratch, 'noobjects', '.git', 'objects'), { recursive: true, force: true })
  })

  afterAll(() => rmSync(scratch, { recursive: true, force: true }))

  test("objectExists('HEAD') answers false for all three — empty AND corrupt", () => {
    expect(at('empty').objectExists('HEAD')).toBe(false)
    expect(at('dangling').objectExists('HEAD')).toBe(false)
    expect(at('noobjects').objectExists('HEAD')).toBe(false)
  })

  test('revParse --verify --quiet HEAD separates them: null, sha, throw', () => {
    // Unborn HEAD: exit 1, a declared absence.
    expect(at('empty').revParse('--verify', '--quiet', 'HEAD')).toBeNull()
    // Dangling ref: exit 0 — there IS a HEAD, its object is just missing.
    expect(at('dangling').revParse('--verify', '--quiet', 'HEAD')).toBe(
      '0000000000000000000000000000000000000001',
    )
    // No object store: exit 128, undeclared, so it throws rather than reading
    // as "nothing here yet".
    expect(() => at('noobjects').revParse('--verify', '--quiet', 'HEAD')).toThrow(CommandFailed)
  })

  test('log throws on an empty repo, so the probe must precede it', () => {
    expect(() => at('empty').log({ maxCount: 1 })).toThrow(CommandFailed)
    expect(at('empty').try.log({ maxCount: 1 }).ok).toBe(false)
  })

  test('hasHistory is that probe: false unborn, true dangling, throw corrupt', () => {
    expect(at('empty').hasHistory()).toBe(false)
    expect(at('dangling').hasHistory()).toBe(true)
    expect(() => at('noobjects').hasHistory()).toThrow(CommandFailed)
  })

  test('headRef throws on an unborn HEAD — real git exits 128 there', () => {
    expect(() => at('empty').headRef()).toThrow(CommandFailed)
    expect(at('dangling').headRef()).toBe('main')
  })
})

describe('Git — worktrees against real git', () => {
  test('a bare store reports bare:true; a checkout and a worktree do not', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'typedgit-bare-'))
    try {
      const store = join(scratch, 'store.git')
      mkdirSync(store)
      new Git(store).init(undefined, { quiet: true, bare: true, initialBranch: 'main' })
      const rows = new Git(store).worktrees()
      expect(rows).toHaveLength(1)
      expect(rows[0]!.bare).toBe(true)
      expect(rows[0]!.head).toBeNull()

      // An unborn-HEAD checkout is NOT bare, though it is equally unusual —
      // the shape that makes `head === null` the wrong inference.
      const unborn = join(scratch, 'unborn')
      mkdirSync(unborn)
      new Git(unborn).init(undefined, { quiet: true, initialBranch: 'main' })
      const unbornRows = new Git(unborn).worktrees()
      expect(unbornRows[0]!.bare).toBe(false)
      expect(unbornRows[0]!.head).not.toBeNull()
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  test('gitCommonDir is absolute from a linked worktree AND from the primary', () => {
    const git = new Git(repo)
    const wt = join(repo, 'wt-common')
    git.worktreeAdd(wt, { detach: true, startPoint: 'HEAD' })
    try {
      const fromPrimary = git.gitCommonDir()
      const fromLinked = git.at(wt).gitCommonDir()
      // Bare `--git-common-dir` answers the literal `.git` here.
      expect(fromPrimary).toBe(join(git.topLevel()!, '.git'))
      expect(fromLinked).toBe(fromPrimary)
    } finally {
      git.worktreeRemove(wt, { force: true })
      git.worktreePrune()
    }
  })
})

describe('Git — mainCheckout and symbolicRef against real git', () => {
  test('mainCheckout answers the primary checkout from the primary AND a worktree', () => {
    const git = new Git(repo)
    const wt = join(repo, 'wt-main-checkout')
    git.worktreeAdd(wt, { detach: true, startPoint: 'HEAD' })
    try {
      const primary = git.topLevel()!
      expect(git.mainCheckout()).toBe(primary)
      // The point of the method: from inside a linked worktree it still names
      // the repository that owns it, not the worktree.
      expect(git.at(wt).mainCheckout()).toBe(primary)
    } finally {
      git.worktreeRemove(wt, { force: true })
      git.worktreePrune()
    }
  })

  test('mainCheckout is null outside a repository, not a throw', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'typedgit-nomain-'))
    try {
      expect(new Git(scratch).mainCheckout()).toBeNull()
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  test('symbolicRef reads HEAD, and answers null for a ref that is not symbolic', () => {
    const git = new Git(repo)
    expect(git.symbolicRef('HEAD')).toMatch(/^refs\/heads\//)
    // An unset remote HEAD is the case every default-branch probe hits, and
    // it must be an answer rather than an exception.
    expect(git.symbolicRef('refs/remotes/nope/HEAD')).toBeNull()
  })
})

// Only real git proves which exit code each Tier 1 verb actually gets.
describe('Git — Tier 1 verbs against real git', () => {
  test('lsFiles lists tracked and untracked files, and throws outside a repo', () => {
    const git = new Git(repo)
    expect(git.lsFiles({ cached: true })).toContain('docs/a.md')
    writeFileSync(join(repo, 'untracked.tmp'), 'x\n')
    expect(git.lsFiles({ cached: true })).not.toContain('untracked.tmp')
    expect(git.lsFiles({ others: true, excludeStandard: true })).toContain('untracked.tmp')
    // No match is exit 0 with empty stdout — absence, not failure.
    expect(git.lsFiles({ cached: true, paths: ['no-such-dir'] })).toEqual([])
    expect(() => new Git(nonRepo).lsFiles()).toThrow(CommandFailed)
    rmSync(join(repo, 'untracked.tmp'))
  })

  test('forEachRef / refs answer [] for no match and throw outside a repo', () => {
    const git = new Git(repo)
    expect(git.refs('refs/heads/').map((r) => r.ref)).toEqual(['refs/heads/main'])
    expect(git.forEachRef('refs/heads/', { format: '%(refname:short)' })).toEqual(['main'])
    expect(git.forEachRef('refs/no-such/')).toEqual([])
    // An unknown format field is a failure, not an empty answer.
    expect(() => git.forEachRef('refs/heads/', { sort: 'nosuchfield' })).toThrow(CommandFailed)
    expect(() => new Git(nonRepo).forEachRef('refs/heads/')).toThrow(CommandFailed)
  })

  test('diffNameOnly / diffNameStatus over a real staged rename', () => {
    const git = new Git(repo)
    expect(git.diffNameOnly({ cached: true })).toEqual([])

    writeFileSync(join(repo, 'docs', 'b.md'), 'one\n')
    git.add(['docs/b.md'])
    git.commit({ message: 'add b' })
    git.rawChecked(['mv', 'docs/b.md', 'docs/b-renamed.md'])
    writeFileSync(join(repo, 'fresh.md'), 'n\n')
    git.add(['fresh.md'])

    expect(git.diffNameStatus({ cached: true })).toEqual([
      { status: 'R100', path: 'docs/b-renamed.md', from: 'docs/b.md' },
      { status: 'A', path: 'fresh.md' },
    ])
    // --no-renames makes the same change read as a delete plus an add (git
    // emits the records sorted by path, so the add precedes the delete).
    expect(git.diffNameStatus({ cached: true, noRenames: true })).toEqual([
      { status: 'A', path: 'docs/b-renamed.md' },
      { status: 'D', path: 'docs/b.md' },
      { status: 'A', path: 'fresh.md' },
    ])
    expect(git.diffNameOnly({ cached: true })).toEqual(['docs/b-renamed.md', 'fresh.md'])
    git.commit({ message: 'rename b' })

    // Outside a repository `git diff` exits 129 (a usage error), not the 128
    // most git commands give. Undeclared either way, so it throws.
    const outside = new Git(nonRepo).try.diffNameOnly()
    expect(outside.ok).toBe(false)
    if (outside.ok) throw new Error('unreachable')
    expect(outside.error.result.exitCode).toBe(129)
  })

  test("log returns the caller's format verbatim; a bad rev throws", () => {
    const git = new Git(repo)
    const raw = git.log({ format: '%s', reverse: true })
    expect(raw.split('\n').filter(Boolean)).toEqual(['c1', 'c2', 'add b', 'rename b'])
    // An empty range is exit 0 with empty stdout — absence, not failure.
    expect(git.log({ range: 'HEAD..HEAD', format: '%H' })).toBe('')
    expect(() => git.log({ rev: 'no-such-rev' })).toThrow(CommandFailed)
    expect(() => new Git(nonRepo).log()).toThrow(CommandFailed)
  })

  // `absent: []` on `log` is deliberate: an empty repository and a corrupt one
  // both exit 128, so declaring it would hand back "" for a broken store.
  test('log throws on an empty repository; rev-parse --verify is the probe', () => {
    const empty = mkdtempSync(join(tmpdir(), 'typedgit-empty-'))
    try {
      const git = new Git(empty)
      git.rawChecked(['init', '-b', 'main'])
      expect(git.revParse('--verify', '--quiet', 'HEAD')).toBeNull()
      expect(() => git.log({ format: '%H' })).toThrow(CommandFailed)
      const r = git.try.log({ format: '%H' })
      expect(r.ok).toBe(false)
      if (r.ok) throw new Error('unreachable')
      expect(r.error.result.exitCode).toBe(128)
      // for-each-ref and diff --cached, by contrast, answer emptily.
      expect(git.forEachRef('refs/heads/')).toEqual([])
      expect(git.diffNameStatus({ cached: true })).toEqual([])
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })
})

// Only real git proves which exit code each Tier 2 verb actually gets.
describe('Git — Tier 2 verbs against real git', () => {
  test('lsTree lists a tree, sizes blobs under --long, and throws on a bad rev', () => {
    const git = new Git(repo)
    const entries = git.lsTree('HEAD', { recursive: true, long: true })
    const a = entries.find((e) => e.path === 'docs/a.md')
    expect(a).toBeDefined()
    expect(a!.type).toBe('blob')
    expect(a!.mode).toBe('100644')
    expect(a!.sha).toMatch(/^[0-9a-f]{40}$/)
    expect(a!.sizeBytes).toBe(4) // "two\n"
    // A pathspec matching nothing is exit 0 with empty stdout — absence.
    expect(git.lsTree('HEAD', { paths: ['no-such-dir'] })).toEqual([])
    // A rev that does not resolve is 128, and folding that to [] would read
    // as "the tree is empty".
    expect(() => git.lsTree('no-such-rev')).toThrow(CommandFailed)
    expect(() => new Git(nonRepo).lsTree('HEAD')).toThrow(CommandFailed)
  })

  test("diffTree reports one commit's changes, and needs --root for the first", () => {
    const git = new Git(repo)
    writeFileSync(join(repo, 'docs', 'a.md'), 'three\n')
    git.add(['docs/a.md'])
    git.commit({ message: 'touch a' })
    expect(git.diffTree('HEAD')).toEqual([{ status: 'M', path: 'docs/a.md' }])

    // `rev-list --max-parents=0` is the root; note that `log --reverse
    // --max-count=1` is NOT — git caps before it reverses.
    const root = git.rawChecked(['rev-list', '--max-parents=0', 'HEAD']).stdout.trim()
    // Without --root a root commit diffs against no parent: exit 0, no rows.
    expect(git.diffTree(root)).toEqual([])
    expect(
      git
        .diffTree(root, { root: true })
        .map((e) => e.path)
        .sort(),
    ).toEqual(['.gitignore', 'docs/a.md'])
    expect(() => git.diffTree('no-such-rev')).toThrow(CommandFailed)
  })

  test('grep answers [] for no matches (exit 1) and throws on a real failure', () => {
    const git = new Git(repo)
    expect(git.grep('three', { lineNumber: true })).toEqual(['docs/a.md:1:three'])
    // Exit 1 is an answer: no matches.
    expect(git.grep('ZZZ-NOT-PRESENT')).toEqual([])
    // An unbalanced bracket is a fatal (128), not "no matches".
    expect(() => git.grep('[', { extendedRegexp: true })).toThrow(CommandFailed)
    expect(() => new Git(nonRepo).grep('x')).toThrow(CommandFailed)
  })

  test('isAncestor: 0 yes, 1 no (diverged OR unrelated), 128 throws', () => {
    const git = new Git(repo)
    const root = git.rawChecked(['rev-list', '--max-parents=0', 'HEAD']).stdout.trim()
    expect(git.isAncestor(root, 'HEAD')).toBe(true)
    expect(git.isAncestor('HEAD', root)).toBe(false)
    // A rev that does not resolve must NOT read as "not an ancestor".
    expect(() => git.isAncestor('no-such-rev', 'HEAD')).toThrow(CommandFailed)
    const r = git.try.isAncestor('no-such-rev', 'HEAD')
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('unreachable')
    expect(r.error.result.exitCode).toBe(128)
  })

  test('aheadBehind counts each side, and gets the field order right', () => {
    const git = new Git(repo)
    expect(git.aheadBehind('HEAD', 'HEAD')).toEqual({ ahead: 0, behind: 0 })
    git.rawChecked(['branch', 'ab-tip', 'HEAD'])
    git.rawChecked(['branch', 'ab-base', 'HEAD~1'])
    // `ab-tip` has one commit `ab-base` does not; nothing the other way.
    expect(git.aheadBehind('ab-base', 'ab-tip')).toEqual({ ahead: 1, behind: 0 })
    expect(git.aheadBehind('ab-tip', 'ab-base')).toEqual({ ahead: 0, behind: 1 })
    expect(() => git.aheadBehind('main', 'no-such-rev')).toThrow(CommandFailed)
    git.deleteBranch('ab-tip', { force: true })
    git.deleteBranch('ab-base', { force: true })
  })

  test('statusPorcelain({paths}) narrows the report without losing the columns', () => {
    const git = new Git(repo)
    writeFileSync(join(repo, 'docs', 'dirty.md'), 'x\n')
    writeFileSync(join(repo, 'root-dirty.md'), 'x\n')
    expect(git.statusPorcelain({ paths: ['docs'] })).toEqual(['?? docs/dirty.md'])
    expect(git.statusPorcelain().length).toBe(2)
    expect(git.isDirty({ paths: ['no-such-dir'] })).toBe(false)
    rmSync(join(repo, 'docs', 'dirty.md'))
    rmSync(join(repo, 'root-dirty.md'))
  })

  test('configSet round-trips through configGet; init and worktreeMove work', () => {
    const fresh = mkdtempSync(join(tmpdir(), 'typedgit-init-'))
    try {
      const git = new Git(fresh)
      git.init(undefined, { initialBranch: 'main', quiet: true })
      git.configSet('user.email', 't@t')
      git.configSet('user.name', 't')
      expect(git.configGet('user.email')).toBe('t@t')
      expect(git.currentBranch()).toBe('main')

      writeFileSync(join(fresh, 'f.md'), 'x\n')
      git.add(['.'], { all: true })
      git.commit({ message: 'subject', body: 'body text' })
      expect(git.log({ format: '%B', maxCount: 1 })).toBe('subject\n\nbody text\n\n')

      const from = join(fresh, 'wt-from')
      const to = join(fresh, 'wt-to')
      git.worktreeAdd(from, { branch: 'moved', startPoint: 'main' })
      git.worktreeMove(from, to)
      // Compared by basename: macOS resolves the temp dir through /private, so
      // git reports a path that is not string-equal to the one we passed.
      expect(git.worktrees().some((w) => w.path.endsWith('wt-to'))).toBe(true)
      expect(() => git.worktreeMove(join(fresh, 'no-such-wt'), to)).toThrow(CommandFailed)
    } finally {
      rmSync(fresh, { recursive: true, force: true })
    }
  })

  test("lsRemote --heads/--tags filter the rows a local 'remote' answers", () => {
    const git = new Git(repo)
    git.rawChecked(['tag', 'v-test'])
    expect(
      git.lsRemote(repo, undefined, { heads: true }).every((r) => r.ref.startsWith('refs/heads/')),
    ).toBe(true)
    expect(
      git.lsRemote(repo, undefined, { tags: true }).some((r) => r.ref === 'refs/tags/v-test'),
    ).toBe(true)
    git.rawChecked(['tag', '-d', 'v-test'])
  })
})

// The porcelain's first two columns ARE the status: ` M f.ts` is an unstaged
// modification and `M  f.ts` a staged one. A line-trimming parser silently
// turns one into the other, which a caller reading column 0 cannot detect.
describe('Git — statusPorcelain preserves the status columns', () => {
  test('leading and trailing status columns survive verbatim', () => {
    const { runner } = recorder(OK(' M changed.ts\nM  staged.ts\n?? new.ts\n'))
    const git = new Git('/repo', { runner })
    expect(git.statusPorcelain()).toEqual([' M changed.ts', 'M  staged.ts', '?? new.ts'])
  })
})
