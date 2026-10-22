/**
 * `AsyncGit` and the backend seam.
 *
 * Two things are pinned here. First, the async client and the sync one
 * must build the same argv, which is the whole point of the shared verb table
 * — a recording runner under each client is compared directly. Second, a
 * backend that is not the CLI must be able to serve the client, which is what
 * `partialBackend` exists for.
 */

import { describe, expect, test } from 'vitest'

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  AsyncGit,
  CommandFailed,
  cliBackend,
  Git,
  partialBackend,
  UnsupportedRequest,
  type AsyncCommandRunner,
  type CommandResult,
  type CommandRunner,
  type GitRequest,
} from '../src/index.ts'
import { makeGitFixture } from '../src/testing.ts'

const CWD = '/tmp/repo'

/** A runner that records argv and replays canned results. */
function recorder(replies: Record<string, Partial<CommandResult>> = {}) {
  const calls: string[][] = []
  const reply = (argv: string[]): CommandResult => {
    const canned = replies[argv.join(' ')]
    return { exitCode: 0, stdout: '', stderr: '', ...canned }
  }
  const sync: CommandRunner = {
    run(argv) {
      calls.push(argv)
      return reply(argv)
    },
  }
  const async: AsyncCommandRunner = {
    run(argv) {
      calls.push(argv)
      return Promise.resolve(reply(argv))
    },
  }
  return { calls, sync, async }
}

describe('AsyncGit — parity with Git', () => {
  test('both clients build identical argv for the same calls', async () => {
    // `aheadBehind` and `mergeTree` are the verbs whose parsers reject
    // unreadable stdout, so the recorder has to answer them with something
    // readable rather than "".
    const counts = {
      'rev-list --left-right --count main...task/x': { stdout: '1\t2\n' },
      'merge-tree --write-tree --name-only -z --merge-base=abc x main': {
        stdout: 'deadbeef\x00',
      },
    }
    const s = recorder(counts)
    const a = recorder(counts)
    const sync = new Git(CWD, { runner: s.sync })
    const asyncGit = new AsyncGit(CWD, { backend: cliBackend({ runner: a.async }) })

    sync.currentBranch()
    sync.topLevel()
    sync.gitCommonDir()
    sync.worktrees()
    sync.branches('task/*')
    sync.mergeBase('main', 'HEAD')
    sync.configGet('user.name')
    sync.objectExists('HEAD')
    sync.lsRemote('origin', 'refs/heads/*')
    sync.showAtRev('HEAD', 'README.md')
    sync.add(['a.ts'])
    sync.commit({ message: 'm', allowEmpty: true })
    sync.push('origin', 'HEAD:main', { forceWithLease: true })
    sync.fetch('origin', 'main', { prune: true })
    sync.worktreeAdd('/wt', { branch: 'b', startPoint: 'main' })
    sync.worktreeRemove('/wt', { force: true })
    sync.deleteBranch('b', { force: true })
    sync.deleteRef('refs/heads/b', { expected: 'abc' })
    sync.configRemoveSection('branch.b')
    sync.resetHard('HEAD~1')
    sync.worktreePrune()
    sync.lsFiles({ cached: true, others: true, excludeStandard: true, paths: ['docs'] })
    sync.forEachRef(['refs/heads/', 'refs/tags/*'], {
      format: '%(refname)',
      sort: '-committerdate',
      count: 3,
    })
    sync.refs('refs/heads/')
    sync.diffNameOnly({
      cached: true,
      diffFilter: 'ACMR',
      rangeArgs: ['main', 'HEAD'],
      paths: ['docs'],
    })
    sync.diffStat({ rangeArgs: ['main', 'HEAD'], paths: ['docs'] })
    sync.diffNameStatus({ cached: true, noRenames: true, range: 'main..HEAD' })
    sync.log({
      format: '%H',
      maxCount: 5,
      noMerges: true,
      reverse: true,
      rev: 'task/x',
      notRefs: ['main'],
      paths: ['docs'],
    })
    sync.fetch('origin', ['main', 'refs/notes/*:refs/notes/*'], {
      quiet: true,
      noWriteFetchHead: true,
    })
    sync.lsTree('HEAD', { recursive: true, long: true, paths: ['docs'] })
    sync.diffTree('HEAD', { root: true, noRenames: true, paths: ['docs'] })
    sync.grep('TODO|FIXME', {
      lineNumber: true,
      extendedRegexp: true,
      noColor: true,
      paths: ['docs'],
    })
    sync.isAncestor('main', 'task/x')
    sync.aheadBehind('main', 'task/x')
    sync.statusPorcelain({ paths: ['docs'] })
    sync.statusEntries()
    sync.diffCheck({ paths: ['docs'] })
    sync.clean({ directories: true })
    sync.add(['a.ts'], { intentToAdd: true })
    sync.add(['.'], { all: true, update: true })
    sync.commit({ message: 's', body: 'b', amend: true, noVerify: true, signoff: true })
    sync.commit({ messageStdin: 'm\n', signoff: true })
    sync.configSet('core.editor', 'vim', { scope: 'global' })
    sync.init('/store', { bare: true, initialBranch: 'main', quiet: true })
    sync.clone('/store.git', 'kit', { depth: 1, branch: 'v2.1', quiet: true })
    sync.worktreeMove('/old', '/new', { force: true })
    sync.lsRemote('origin', undefined, { heads: true, tags: true })
    sync.resolveRef('refs/heads/main')
    sync.hasHistory()
    sync.headRef()
    sync.remote()
    sync.remoteGetUrl('origin')
    sync.remoteAdd('upstream', '/store.git')
    sync.logLines({ format: '%H', maxCount: 2 })
    sync.diffTreeNumstat('HEAD', { root: true, noRenames: true, paths: ['docs'] })
    sync.merge('origin/main', { noFf: true, message: 'm' })
    sync.mergeAbort()
    sync.rebase('origin/main', { autostash: true })
    sync.rebaseAbort()
    sync.rebaseContinue()
    sync.lsFilesUnmerged()
    sync.lsFilesTagged()
    sync.lsFiles({ others: true, directory: true })
    sync.checkoutSide('theirs', ['a.ts'])
    sync.checkout('origin/x', { branch: 'x', resetBranch: true, force: true })
    sync.mergeTree('x', 'main', { mergeBase: 'abc' })
    sync.push('origin', 'HEAD:x', { forceWithLease: { ref: 'refs/heads/x', expect: 'abc' } })

    await asyncGit.currentBranch()
    await asyncGit.topLevel()
    await asyncGit.gitCommonDir()
    await asyncGit.worktrees()
    await asyncGit.branches('task/*')
    await asyncGit.mergeBase('main', 'HEAD')
    await asyncGit.configGet('user.name')
    await asyncGit.objectExists('HEAD')
    await asyncGit.lsRemote('origin', 'refs/heads/*')
    await asyncGit.showAtRev('HEAD', 'README.md')
    await asyncGit.add(['a.ts'])
    await asyncGit.commit({ message: 'm', allowEmpty: true })
    await asyncGit.push('origin', 'HEAD:main', { forceWithLease: true })
    await asyncGit.fetch('origin', 'main', { prune: true })
    await asyncGit.worktreeAdd('/wt', { branch: 'b', startPoint: 'main' })
    await asyncGit.worktreeRemove('/wt', { force: true })
    await asyncGit.deleteBranch('b', { force: true })
    await asyncGit.deleteRef('refs/heads/b', { expected: 'abc' })
    await asyncGit.configRemoveSection('branch.b')
    await asyncGit.resetHard('HEAD~1')
    await asyncGit.worktreePrune()
    await asyncGit.lsFiles({ cached: true, others: true, excludeStandard: true, paths: ['docs'] })
    await asyncGit.forEachRef(['refs/heads/', 'refs/tags/*'], {
      format: '%(refname)',
      sort: '-committerdate',
      count: 3,
    })
    await asyncGit.refs('refs/heads/')
    await asyncGit.diffNameOnly({
      cached: true,
      diffFilter: 'ACMR',
      rangeArgs: ['main', 'HEAD'],
      paths: ['docs'],
    })
    await asyncGit.diffStat({ rangeArgs: ['main', 'HEAD'], paths: ['docs'] })
    await asyncGit.diffNameStatus({ cached: true, noRenames: true, range: 'main..HEAD' })
    await asyncGit.log({
      format: '%H',
      maxCount: 5,
      noMerges: true,
      reverse: true,
      rev: 'task/x',
      notRefs: ['main'],
      paths: ['docs'],
    })
    await asyncGit.fetch('origin', ['main', 'refs/notes/*:refs/notes/*'], {
      quiet: true,
      noWriteFetchHead: true,
    })
    await asyncGit.lsTree('HEAD', { recursive: true, long: true, paths: ['docs'] })
    await asyncGit.diffTree('HEAD', { root: true, noRenames: true, paths: ['docs'] })
    await asyncGit.grep('TODO|FIXME', {
      lineNumber: true,
      extendedRegexp: true,
      noColor: true,
      paths: ['docs'],
    })
    await asyncGit.isAncestor('main', 'task/x')
    await asyncGit.aheadBehind('main', 'task/x')
    await asyncGit.statusPorcelain({ paths: ['docs'] })
    await asyncGit.statusEntries()
    await asyncGit.diffCheck({ paths: ['docs'] })
    await asyncGit.clean({ directories: true })
    await asyncGit.add(['a.ts'], { intentToAdd: true })
    await asyncGit.add(['.'], { all: true, update: true })
    await asyncGit.commit({ message: 's', body: 'b', amend: true, noVerify: true, signoff: true })
    await asyncGit.commit({ messageStdin: 'm\n', signoff: true })
    await asyncGit.configSet('core.editor', 'vim', { scope: 'global' })
    await asyncGit.init('/store', { bare: true, initialBranch: 'main', quiet: true })
    await asyncGit.clone('/store.git', 'kit', { depth: 1, branch: 'v2.1', quiet: true })
    await asyncGit.worktreeMove('/old', '/new', { force: true })
    await asyncGit.lsRemote('origin', undefined, { heads: true, tags: true })
    await asyncGit.resolveRef('refs/heads/main')
    await asyncGit.hasHistory()
    await asyncGit.headRef()
    await asyncGit.remote()
    await asyncGit.remoteGetUrl('origin')
    await asyncGit.remoteAdd('upstream', '/store.git')
    await asyncGit.logLines({ format: '%H', maxCount: 2 })
    await asyncGit.diffTreeNumstat('HEAD', { root: true, noRenames: true, paths: ['docs'] })
    await asyncGit.merge('origin/main', { noFf: true, message: 'm' })
    await asyncGit.mergeAbort()
    await asyncGit.rebase('origin/main', { autostash: true })
    await asyncGit.rebaseAbort()
    await asyncGit.rebaseContinue()
    await asyncGit.lsFilesUnmerged()
    await asyncGit.lsFilesTagged()
    await asyncGit.lsFiles({ others: true, directory: true })
    await asyncGit.checkoutSide('theirs', ['a.ts'])
    await asyncGit.checkout('origin/x', { branch: 'x', resetBranch: true, force: true })
    await asyncGit.mergeTree('x', 'main', { mergeBase: 'abc' })
    await asyncGit.push('origin', 'HEAD:x', {
      forceWithLease: { ref: 'refs/heads/x', expect: 'abc' },
    })

    expect(a.calls).toEqual(s.calls)
  })

  test('queries parse identically across the two clients', async () => {
    const porcelain =
      'worktree /repo\nHEAD abc\nbranch refs/heads/main\n\nworktree /wt\nHEAD def\ndetached\n'
    const replies = {
      'worktree list --porcelain': { stdout: porcelain },
      'branch --show-current': { stdout: 'main\n' },
    }
    const sync = new Git(CWD, { runner: recorder(replies).sync })
    const asyncGit = new AsyncGit(CWD, {
      backend: cliBackend({ runner: recorder(replies).async }),
    })

    expect(await asyncGit.worktrees()).toEqual(sync.worktrees())
    expect(await asyncGit.currentBranch()).toEqual(sync.currentBranch())
    expect(sync.worktrees()).toEqual([
      {
        path: '/repo',
        head: 'abc',
        branch: 'main',
        detached: false,
        bare: false,
        locked: false,
        lockReason: null,
      },
      {
        path: '/wt',
        head: 'def',
        branch: null,
        detached: true,
        bare: false,
        locked: false,
        lockReason: null,
      },
    ])
  })

  test('the new ref, remote and numstat verbs parse identically', async () => {
    const replies = {
      'rev-parse --verify --quiet HEAD': { stdout: 'abc123\n' },
      'rev-parse --abbrev-ref HEAD': { stdout: 'main\n' },
      remote: { stdout: 'origin\nupstream\n' },
      'remote get-url origin': { stdout: 'git@github.com:o/r.git\n' },
      'log --format=%H': { stdout: 'abc\ndef\n' },
      'diff-tree -r --no-commit-id --numstat -z HEAD': {
        stdout: '3\t1\tdocs/a.md\x00-\t-\timg/x.png\x00',
      },
    }
    const sync = new Git(CWD, { runner: recorder(replies).sync })
    const asyncGit = new AsyncGit(CWD, {
      backend: cliBackend({ runner: recorder(replies).async }),
    })

    expect(await asyncGit.resolveRef('HEAD')).toEqual(sync.resolveRef('HEAD'))
    expect(await asyncGit.hasHistory()).toEqual(sync.hasHistory())
    expect(await asyncGit.headRef()).toEqual(sync.headRef())
    expect(await asyncGit.remote()).toEqual(sync.remote())
    expect(await asyncGit.remoteGetUrl('origin')).toEqual(sync.remoteGetUrl('origin'))
    expect(await asyncGit.logLines({ format: '%H' })).toEqual(sync.logLines({ format: '%H' }))
    expect(await asyncGit.diffTreeNumstat('HEAD')).toEqual(sync.diffTreeNumstat('HEAD'))

    expect(sync.remote()).toEqual(['origin', 'upstream'])
    expect(sync.logLines({ format: '%H' })).toEqual(['abc', 'def'])
    expect(sync.diffTreeNumstat('HEAD')).toEqual([
      { path: 'docs/a.md', linesAdded: 3, linesDeleted: 1 },
      { path: 'img/x.png', linesAdded: null, linesDeleted: null },
    ])
  })

  test('resolveRef and remoteGetUrl report their absence codes, not a rejection', async () => {
    const r = recorder({
      'rev-parse --verify --quiet refs/heads/gone': { exitCode: 1 },
      'remote get-url nope': { exitCode: 2, stderr: "error: No such remote 'nope'" },
      'rev-parse --abbrev-ref HEAD': { exitCode: 128, stderr: 'fatal: ambiguous argument' },
    })
    const git = new AsyncGit(CWD, { backend: cliBackend({ runner: r.async }) })
    expect(await git.resolveRef('refs/heads/gone')).toBeNull()
    expect(await git.remoteGetUrl('nope')).toBeNull()
    // An unborn HEAD is 128 here, which headRef does not declare absent.
    await expect(git.headRef()).rejects.toThrow(CommandFailed)
  })

  test('the Tier 1 verbs parse identically across the two clients', async () => {
    const nameStatus = ['R100', 'a.md', 'b.md', 'M', 'c.md'].join('\x00') + '\x00'
    const replies = {
      'ls-files -z': { stdout: 'a.ts\x00b c.ts\x00' },
      'for-each-ref --format=%(objectname)%09%(refname) refs/heads/': {
        stdout: 'abc\trefs/heads/main\n',
      },
      'diff --name-only -z': { stdout: 'a.ts\x00' },
      'diff --name-status -z': { stdout: nameStatus },
      'log --format=%H': { stdout: 'abc\ndef\n' },
    }
    const sync = new Git(CWD, { runner: recorder(replies).sync })
    const asyncGit = new AsyncGit(CWD, {
      backend: cliBackend({ runner: recorder(replies).async }),
    })

    expect(await asyncGit.lsFiles()).toEqual(sync.lsFiles())
    expect(await asyncGit.refs('refs/heads/')).toEqual(sync.refs('refs/heads/'))
    expect(await asyncGit.diffNameOnly()).toEqual(sync.diffNameOnly())
    expect(await asyncGit.diffNameStatus()).toEqual(sync.diffNameStatus())
    expect(await asyncGit.log({ format: '%H' })).toEqual(sync.log({ format: '%H' }))

    expect(sync.diffNameStatus()).toEqual([
      { status: 'R100', path: 'b.md', from: 'a.md' },
      { status: 'M', path: 'c.md' },
    ])
    expect(sync.log({ format: '%H' })).toBe('abc\ndef\n')
  })

  // Every Tier 1 verb declares `absent: []`, so there is no exit code they
  // read as an answer — the composed `refs()` included.
  test('the Tier 1 verbs reject on any non-zero exit', async () => {
    const fail = { exitCode: 128, stderr: 'fatal: not a repo' }
    const r = recorder({
      'ls-files -z': fail,
      'for-each-ref --format=%(objectname)%09%(refname) refs/heads/': fail,
      'diff --name-only -z': { exitCode: 129, stderr: 'usage: git diff' },
      'diff --name-status -z': { exitCode: 129, stderr: 'usage: git diff' },
      log: fail,
    })
    const git = new AsyncGit(CWD, { backend: cliBackend({ runner: r.async }) })
    await expect(git.lsFiles()).rejects.toThrow(CommandFailed)
    await expect(git.forEachRef('refs/heads/')).rejects.toThrow(CommandFailed)
    await expect(git.refs('refs/heads/')).rejects.toThrow(CommandFailed)
    await expect(git.diffNameOnly()).rejects.toThrow(CommandFailed)
    await expect(git.diffNameStatus()).rejects.toThrow(CommandFailed)
    await expect(git.log()).rejects.toThrow(CommandFailed)
    expect(await git.try.log()).toMatchObject({ ok: false })
  })

  test('the Tier 2 verbs parse identically across the two clients', async () => {
    const tree =
      ['100644 blob abcd1234       7\tdocs/a b.md', '040000 tree ef01       -\tdocs'].join('\x00') +
      '\x00'
    const nameStatus = ['R100', 'old.md', 'new.md', 'M', 'c.md'].join('\x00') + '\x00'
    const replies = {
      'ls-tree -z --long HEAD': { stdout: tree },
      'diff-tree -r --no-commit-id --name-status -z HEAD': { stdout: nameStatus },
      'grep TODO': { stdout: 'docs/a.md:TODO x\n' },
      'rev-list --left-right --count main...task/x': { stdout: '3\t5\n' },
      'merge-base --is-ancestor main task/x': { exitCode: 0 },
    }
    const sync = new Git(CWD, { runner: recorder(replies).sync })
    const asyncGit = new AsyncGit(CWD, {
      backend: cliBackend({ runner: recorder(replies).async }),
    })

    expect(await asyncGit.lsTree('HEAD', { long: true })).toEqual(
      sync.lsTree('HEAD', { long: true }),
    )
    expect(await asyncGit.diffTree('HEAD')).toEqual(sync.diffTree('HEAD'))
    expect(await asyncGit.grep('TODO')).toEqual(sync.grep('TODO'))
    expect(await asyncGit.aheadBehind('main', 'task/x')).toEqual(sync.aheadBehind('main', 'task/x'))
    expect(await asyncGit.isAncestor('main', 'task/x')).toBe(true)

    expect(sync.lsTree('HEAD', { long: true })[0]).toEqual({
      mode: '100644',
      type: 'blob',
      sha: 'abcd1234',
      sizeBytes: 7,
      path: 'docs/a b.md',
    })
    // The rename's SOURCE path survives, and only on the rename record.
    expect(sync.diffTree('HEAD')).toEqual([
      { status: 'R100', path: 'new.md', from: 'old.md' },
      { status: 'M', path: 'c.md' },
    ])
    // Left is `base`, so left is BEHIND.
    expect(sync.aheadBehind('main', 'task/x')).toEqual({ behind: 3, ahead: 5 })
  })

  // The two absence codes Tier 2 adds, and the verbs that declare none.
  test("grep's exit 1 and isAncestor's exit 1 are answers; 128 is not", async () => {
    const r = recorder({
      'grep TODO': { exitCode: 1 },
      'merge-base --is-ancestor a b': { exitCode: 1 },
      'ls-tree -z bad': { exitCode: 128, stderr: 'fatal: Not a valid object name' },
      'diff-tree -r --no-commit-id --name-status -z bad': { exitCode: 128 },
      'rev-list --left-right --count a...bad': { exitCode: 128 },
      'merge-base --is-ancestor bad b': { exitCode: 128 },
      'config x.y z': { exitCode: 128 },
      'worktree move /a /b': { exitCode: 128 },
    })
    const git = new AsyncGit(CWD, { backend: cliBackend({ runner: r.async }) })
    expect(await git.grep('TODO')).toEqual([])
    expect(await git.isAncestor('a', 'b')).toBe(false)
    await expect(git.isAncestor('bad', 'b')).rejects.toThrow(CommandFailed)
    await expect(git.lsTree('bad')).rejects.toThrow(CommandFailed)
    await expect(git.diffTree('bad')).rejects.toThrow(CommandFailed)
    await expect(git.aheadBehind('a', 'bad')).rejects.toThrow(CommandFailed)
    await expect(git.configSet('x.y', 'z')).rejects.toThrow(CommandFailed)
    await expect(git.worktreeMove('/a', '/b')).rejects.toThrow(CommandFailed)
    expect(await git.try.grep('TODO')).toEqual({ ok: true, value: [] })
  })

  // A request has to stay serializable data — loggable, queueable, replayable
  // — so the per-call concerns must not ride into it on the option spread.
  test('call options reach the runner without entering the request', async () => {
    const seen: GitRequest[] = []
    const backend = partialBackend('recording', {
      lsFiles: (_cwd, req) => {
        seen.push(req)
        return Promise.resolve([])
      },
    })
    const signal = new AbortController().signal
    await new AsyncGit(CWD, { backend }).lsFiles({ cached: true, timeoutMs: 50, signal })
    expect(seen[0]).toEqual({ kind: 'lsFiles', cached: true })

    // Same rule for the Tier 2 methods, which take a merged bag too.
    const seenTree: GitRequest[] = []
    const treeBackend = partialBackend('recording', {
      lsTree: (_cwd, req) => {
        seenTree.push(req)
        return Promise.resolve([])
      },
    })
    await new AsyncGit(CWD, { backend: treeBackend }).lsTree('HEAD', {
      recursive: true,
      timeoutMs: 50,
      signal,
    })
    expect(seenTree[0]).toEqual({ kind: 'lsTree', rev: 'HEAD', recursive: true })
  })

  // The integration methods take a merged bag too, so the same rule holds for
  // them: a request carrying an AbortSignal is no longer structured-cloneable,
  // which is what "serializable data" is for.
  test('integration call options stay out of the request', async () => {
    const seen: GitRequest[] = []
    const backend = partialBackend('recording', {
      merge: (_cwd, req) => {
        seen.push(req)
        return Promise.resolve({
          status: 'clean' as const,
          fastForward: false,
          alreadyUpToDate: false,
        })
      },
      rebase: (_cwd, req) => {
        seen.push(req)
        return Promise.resolve({ status: 'clean' as const, alreadyUpToDate: false })
      },
      checkout: (_cwd, req) => {
        seen.push(req)
        return Promise.resolve()
      },
    })
    const signal = new AbortController().signal
    const git = new AsyncGit(CWD, { backend })
    await git.merge('main', { noFf: true, timeoutMs: 50, signal })
    await git.rebase('main', { autostash: true, timeoutMs: 50, signal })
    await git.checkout('main', { force: true, timeoutMs: 50, signal })
    expect(seen[0]).toEqual({ kind: 'merge', ref: 'main', noFf: true })
    expect(seen[1]).toEqual({ kind: 'rebase', onto: 'main', autostash: true })
    expect(seen[2]).toEqual({ kind: 'checkout', ref: 'main', force: true })
    // The point of the rule: a recording backend has to be able to clone one.
    for (const req of seen) structuredClone(req)
  })

  test('a declared absence resolves to its value rather than rejecting', async () => {
    const r = recorder({ 'config --get no.such.key': { exitCode: 1 } })
    const git = new AsyncGit(CWD, { backend: cliBackend({ runner: r.async }) })
    expect(await git.configGet('no.such.key')).toBeNull()
  })

  test('an undeclared non-zero exit rejects, query or not', async () => {
    const r = recorder({
      'config --get user.name': { exitCode: 128, stderr: 'fatal: not a repo' },
      'status --porcelain': { exitCode: 128, stderr: 'fatal: not a repo' },
    })
    const git = new AsyncGit(CWD, { backend: cliBackend({ runner: r.async }) })
    await expect(git.configGet('user.name')).rejects.toThrow(CommandFailed)
    await expect(git.statusPorcelain()).rejects.toThrow(CommandFailed)
  })

  // `topLevel` is not `revParse --show-toplevel` any more: 128 is an answer
  // for the first and a failure for the second, so they are separate kinds.
  test('topLevel answers null outside a repo where revParse rejects', async () => {
    const r = recorder({
      'rev-parse --show-toplevel': { exitCode: 128, stderr: 'fatal: not a repo' },
      'rev-parse --git-common-dir': { exitCode: 128, stderr: 'fatal: not a repo' },
      'rev-parse HEAD': { exitCode: 128, stderr: 'fatal: not a repo' },
    })
    const git = new AsyncGit(CWD, { backend: cliBackend({ runner: r.async }) })
    expect(await git.topLevel()).toBeNull()
    expect(await git.gitCommonDir()).toBeNull()
    await expect(git.revParse('HEAD')).rejects.toThrow(CommandFailed)
  })

  test('a mutation rejects with CommandFailed carrying argv and stderr', async () => {
    const r = recorder({ 'add -- a.ts': { exitCode: 128, stderr: 'fatal: pathspec' } })
    const git = new AsyncGit(CWD, { backend: cliBackend({ runner: r.async }) })
    await expect(git.add(['a.ts'])).rejects.toThrow(CommandFailed)
    const err = await git.add(['a.ts']).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(CommandFailed)
    expect((err as CommandFailed).argv).toEqual(['add', '--', 'a.ts'])
    expect((err as CommandFailed).message).toContain('fatal: pathspec')
  })

  test('try returns the same union as the sync client, promised', async () => {
    const r = recorder({
      'status --porcelain': { exitCode: 128, stderr: 'fatal: not a repo' },
      'config --get no.such.key': { exitCode: 1 },
    })
    const git = new AsyncGit(CWD, { backend: cliBackend({ runner: r.async }) })

    const bad = await git.try.statusPorcelain()
    expect(bad.ok).toBe(false)
    if (bad.ok) throw new Error('unreachable')
    expect(bad.error.cause).toBeInstanceOf(CommandFailed)
    expect(bad.error.kind).toBe('exit')

    // The rule that matters most: a declared absence is a success.
    expect(await git.try.configGet('no.such.key')).toEqual({ ok: true, value: null })
  })

  test('soft resolves to the verb absence value on failure, as the sync client does', async () => {
    const r = recorder({ 'status --porcelain': { exitCode: 128, stderr: 'fatal: not a repo' } })
    const git = new AsyncGit(CWD, { backend: cliBackend({ runner: r.async }) })
    expect(await git.soft.statusPorcelain()).toEqual([])
    expect(await git.soft.isDirty()).toBe(false)
  })

  test('soft does not swallow a non-CommandFailed rejection', async () => {
    const git = new AsyncGit(CWD, { backend: partialBackend('in-memory', {}) })
    await expect(git.soft.worktrees()).rejects.toBeInstanceOf(UnsupportedRequest)
  })

  test('try does not swallow a non-CommandFailed rejection', async () => {
    const git = new AsyncGit(CWD, { backend: partialBackend('in-memory', {}) })
    await expect(git.try.worktrees()).rejects.toBeInstanceOf(UnsupportedRequest)
  })

  test('cliBackend prefixes gitDir/workTree and forwards env', async () => {
    const opts: Array<Record<string, unknown>> = []
    const runner: AsyncCommandRunner = {
      run(argv, o) {
        calls.push(argv)
        opts.push(o as unknown as Record<string, unknown>)
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' })
      },
    }
    const calls: string[][] = []
    const git = new AsyncGit(CWD, {
      backend: cliBackend({ runner, gitDir: '/store/.git', workTree: '/tree' }),
    })
    await git.statusPorcelain({ env: { GIT_AUTHOR_DATE: '2020-01-01T00:00:00+0000' } })
    expect(calls[0]).toEqual([
      '--git-dir=/store/.git',
      '--work-tree=/tree',
      'status',
      '--porcelain',
    ])
    expect(opts[0]!.env).toEqual({ GIT_AUTHOR_DATE: '2020-01-01T00:00:00+0000' })
  })

  test('at() rebinds the directory and keeps the backend', async () => {
    const r = recorder()
    const git = new AsyncGit(CWD, { backend: cliBackend({ runner: r.async }) })
    const other = git.at('/elsewhere')
    expect(other.cwd).toBe('/elsewhere')
    await other.currentBranch()
    expect(r.calls).toEqual([['branch', '--show-current']])
  })
})

describe('AsyncGit — diff-text parity', () => {
  test('both clients build identical argv for the diff-text verbs', async () => {
    const s = recorder()
    const a = recorder()
    const sync = new Git(CWD, { runner: s.sync })
    const asyncGit = new AsyncGit(CWD, { backend: cliBackend({ runner: a.async }) })

    sync.diffText('abc123', { paths: ['src/a.ts'] })
    sync.diffAddedFile('src/new.ts')

    await asyncGit.diffText('abc123', { paths: ['src/a.ts'] })
    await asyncGit.diffAddedFile('src/new.ts')

    // The verb table is the single source of argv; a divergence here means one
    // client grew its own opinion.
    expect(a.calls).toEqual(s.calls)
  })
})

describe('backend seam', () => {
  test('a non-CLI backend serves the client without any argv', async () => {
    const backend = partialBackend('in-memory', {
      currentBranch: () => Promise.resolve('main'),
      branches: (_cwd, req) =>
        Promise.resolve(
          ['main', 'topic'].filter((b) => req.pattern === undefined || b === req.pattern),
        ),
      statusPorcelain: () => Promise.resolve([]),
    })
    const git = new AsyncGit(CWD, { backend })

    expect(await git.currentBranch()).toBe('main')
    expect(await git.branches()).toEqual(['main', 'topic'])
    expect(await git.branchExists('topic')).toBe(true)
    expect(await git.branchExists('absent')).toBe(false)
    expect(await git.isDirty()).toBe(false)
  })

  test('an unimplemented operation says so instead of failing as undefined', async () => {
    const git = new AsyncGit(CWD, { backend: partialBackend('in-memory', {}) })
    const err = await git.worktrees().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(UnsupportedRequest)
    expect((err as UnsupportedRequest).kind).toBe('worktrees')
    expect((err as UnsupportedRequest).message).toContain('in-memory')
  })

  test('unchecked raw stays outside the gate; rawChecked goes through it', async () => {
    const r = recorder({ status: { exitCode: 128, stderr: 'fatal: not a repo' } })
    const git = new AsyncGit(CWD, { backend: cliBackend({ runner: r.async }) })
    expect((await git.raw(['status'])).exitCode).toBe(128)
    await expect(git.rawChecked(['status'])).rejects.toThrow(CommandFailed)
  })

  test('raw is argv, so a non-CLI backend rejects it', async () => {
    const git = new AsyncGit(CWD, { backend: partialBackend('in-memory', {}) })
    await expect(git.raw(['status'])).rejects.toBeInstanceOf(UnsupportedRequest)
  })

  test('checkIgnore short-circuits an empty input without touching the backend', async () => {
    const r = recorder()
    const git = new AsyncGit(CWD, { backend: cliBackend({ runner: r.async }) })
    expect(await git.checkIgnore([])).toEqual(new Set())
    expect(r.calls).toEqual([])
  })
})

describe('remoteOwnerRepo', () => {
  const url = { 'remote get-url origin': { stdout: 'git@forge.example.com:team/app.git\n' } }
  const missing = { 'remote get-url nope': { exitCode: 2 } }

  test('Git and AsyncGit read the same coordinate', async () => {
    const r = recorder({ ...url, ...missing })
    const sync = new Git(CWD, { runner: r.sync })
    const asyncGit = new AsyncGit(CWD, { backend: cliBackend({ runner: r.async }) })
    expect(sync.remoteOwnerRepo()).toEqual({
      host: 'forge.example.com',
      port: null,
      owner: 'team',
      repo: 'app',
    })
    expect(await asyncGit.remoteOwnerRepo()).toEqual({
      host: 'forge.example.com',
      port: null,
      owner: 'team',
      repo: 'app',
    })
    expect(sync.remoteOwnerRepo('nope')).toBeNull()
    expect(await asyncGit.remoteOwnerRepo('nope')).toBeNull()
  })

  test('an unparseable URL is null, and a git failure still throws', async () => {
    const r = recorder({ 'remote get-url origin': { stdout: '/srv/git/repo.git\n' } })
    expect(new Git(CWD, { runner: r.sync }).remoteOwnerRepo()).toBeNull()
    const bad = recorder({ 'remote get-url origin': { exitCode: 128 } })
    const git = new Git(CWD, { runner: bad.sync })
    expect(() => git.remoteOwnerRepo()).toThrow(CommandFailed)
    expect(git.try.remoteOwnerRepo().ok).toBe(false)
    const asyncGit = new AsyncGit(CWD, { backend: cliBackend({ runner: bad.async }) })
    expect((await asyncGit.try.remoteOwnerRepo()).ok).toBe(false)
  })
})

describe('AsyncGit — symbolicRef, mainCheckout, mergeBase, checkIgnoreVerbose', () => {
  test('symbolicRef reads HEAD, and answers null for a ref that is not symbolic', async () => {
    const fx = makeGitFixture()
    try {
      fx.commit('first', { 'a.md': 'x\n' })
      const git = new AsyncGit(fx.dir)
      expect(await git.symbolicRef('HEAD')).toBe('refs/heads/main')
      expect(await git.symbolicRef('refs/remotes/nope/HEAD')).toBeNull()
    } finally {
      fx.cleanup()
    }
  })

  test('mainCheckout names the primary checkout from the primary and from a worktree', async () => {
    const fx = makeGitFixture()
    try {
      fx.commit('first', { 'a.md': 'x\n' })
      const git = new AsyncGit(fx.dir)
      const wt = join(fx.dir, 'linked')
      await git.worktreeAdd(wt, { detach: true, startPoint: 'HEAD' })
      const primary = await git.topLevel()
      expect(await git.mainCheckout()).toBe(primary)
      expect(await git.at(wt).mainCheckout()).toBe(primary)
    } finally {
      fx.cleanup()
    }
  })

  test('mainCheckout is null outside a repository, not a rejection', async () => {
    const scratch = mkdtempSync(join(tmpdir(), 'typed-git-nomain-'))
    try {
      expect(await new AsyncGit(scratch).mainCheckout()).toBeNull()
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  test('mergeBase names the common ancestor; exit 1 is unrelated histories, not a rejection', async () => {
    const fx = makeGitFixture()
    try {
      const first = fx.commit('first', { 'a.md': 'x\n' })
      fx.commit('second', { 'b.md': 'y\n' })
      expect(await new AsyncGit(fx.dir).mergeBase('HEAD', 'HEAD~1')).toBe(first)
    } finally {
      fx.cleanup()
    }

    const r = recorder({
      'merge-base a b': { exitCode: 1 },
      'merge-base a bad': { exitCode: 128, stderr: 'fatal: Not a valid object name bad' },
    })
    const git = new AsyncGit(CWD, { backend: cliBackend({ runner: r.async }) })
    expect(await git.mergeBase('a', 'b')).toBeNull()
    await expect(git.mergeBase('a', 'bad')).rejects.toThrow(CommandFailed)
  })

  test('checkIgnoreVerbose reports the rule behind a path, and [] for an empty input', async () => {
    const fx = makeGitFixture()
    try {
      fx.commit('first', { '.gitignore': 'ignored-dir/\n', 'docs/a.md': 'x\n' })
      const git = new AsyncGit(fx.dir)
      expect(await git.checkIgnoreVerbose(['ignored-dir/f.md', 'docs/a.md'])).toEqual([
        { path: 'ignored-dir/f.md', source: '.gitignore', line: 1, pattern: 'ignored-dir/' },
      ])
    } finally {
      fx.cleanup()
    }

    // An empty input never reaches the backend.
    const r = recorder()
    const git = new AsyncGit(CWD, { backend: cliBackend({ runner: r.async }) })
    expect(await git.checkIgnoreVerbose([])).toEqual([])
    expect(r.calls).toEqual([])
  })
})

describe('AsyncGit — commit({ messageStdin })', () => {
  test('hands the exact message bytes to the backend as input', async () => {
    const inputs: Array<string | undefined> = []
    const runner: AsyncCommandRunner = {
      run(_argv, opts) {
        inputs.push(opts.input)
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' })
      },
    }
    await new AsyncGit(CWD, { backend: cliBackend({ runner }) }).commit({
      messageStdin: 'no newline',
    })
    expect(inputs).toEqual(['no newline'])
  })
})
