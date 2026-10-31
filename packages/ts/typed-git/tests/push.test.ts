/**
 * `push`: one result per ref, with a typed rejection.
 *
 * The real-git cases were written against git 2.54.0 (Apple Git-157) and
 * checked against Homebrew git 2.53.0. They assert the `rejection`, which
 * should hold on any git, and not the reason text, which varies. The wording
 * only another git version prints is in the canned cases at the end.
 */

import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  AsyncGit,
  Git,
  type CommandResult,
  type CommandRunner,
  type CommandRunOptions,
  type PushRefResult,
  type PushRejection,
  type PushReport,
} from '../src/index.ts'
import { makeBareAndWorker, type BareAndWorker } from '../src/testing.ts'

/** Records argv and env, and replays one canned result. */
function recorder(result: CommandResult) {
  const calls: Array<{ argv: string[]; env: CommandRunOptions['env'] }> = []
  const runner: CommandRunner = {
    run(argv, opts) {
      calls.push({ argv: [...argv], env: opts.env })
      return result
    },
  }
  return { calls, runner }
}

/** The one ref a single-refspec push reports. */
function only(refs: PushRefResult[]): PushRefResult {
  expect(refs).toHaveLength(1)
  return refs[0]!
}

// ── argv ────────────────────────────────────────────────────────────────────

describe('push — argv', () => {
  test('flags go before the remote, then every refspec', () => {
    const { runner, calls } = recorder({ exitCode: 0, stdout: '', stderr: '' })
    new Git('/repo', { runner }).push('origin', ['a:refs/heads/a', ':refs/heads/b'], {
      atomic: true,
      forceWithLease: [
        { ref: 'refs/heads/a', expect: 'abc' },
        { ref: 'refs/heads/b', expect: null },
      ],
    })
    expect(calls[0]!.argv).toEqual([
      'push',
      '--porcelain',
      '--atomic',
      '--force-with-lease=refs/heads/a:abc',
      '--force-with-lease=refs/heads/b:',
      'origin',
      'a:refs/heads/a',
      ':refs/heads/b',
    ])
  })

  test('one lease, or the bare form', () => {
    const { runner, calls } = recorder({ exitCode: 0, stdout: '', stderr: '' })
    const git = new Git('/repo', { runner })
    git.push('origin', 'HEAD:x', {
      forceWithLease: { ref: 'refs/heads/x', expect: 'abc' },
    })
    git.push('origin', 'HEAD:x', { forceWithLease: true })
    expect(calls.map((c) => c.argv)).toEqual([
      ['push', '--porcelain', '--force-with-lease=refs/heads/x:abc', 'origin', 'HEAD:x'],
      ['push', '--porcelain', '--force-with-lease', 'origin', 'HEAD:x'],
    ])
  })

  test('runs in the C locale', () => {
    const { runner, calls } = recorder({ exitCode: 0, stdout: '', stderr: '' })
    new Git('/repo', { runner, env: { LC_ALL: 'de_DE.UTF-8' } }).push('origin', 'HEAD:x')
    expect(calls[0]!.env?.['LC_ALL']).toBe('C')
  })

  test('an empty refspec list is refused before git runs', () => {
    const { runner, calls } = recorder({ exitCode: 0, stdout: '', stderr: '' })
    expect(() => new Git('/repo', { runner }).push('origin', [])).toThrow(TypeError)
    expect(calls).toEqual([])
  })

  test('an empty lease list is refused before git runs, not pushed without a lease', () => {
    const { runner, calls } = recorder({ exitCode: 0, stdout: '', stderr: '' })
    const git = new Git('/repo', { runner })
    expect(() => git.push('origin', '+HEAD:x', { forceWithLease: [] })).toThrow(
      /push: forceWithLease list is empty/,
    )
    expect(calls).toEqual([])
  })
})

// ── real git ────────────────────────────────────────────────────────────────

describe('push — real git', () => {
  let pair: BareAndWorker
  let git: Git
  let store: Git
  let a: string
  let b: string

  beforeEach(() => {
    pair = makeBareAndWorker()
    git = pair.worker.git
    store = pair.bare.git
    a = pair.worker.commit('one', { 'f.txt': '1\n' })
    b = pair.worker.commit('two', { 'f.txt': '2\n' })
  })
  afterEach(() => pair.cleanup())

  /** Install a hook in the store, through its own `core.hooksPath` so a global one cannot hide it. */
  function storeHook(name: string, body: string): void {
    const dir = join(pair.parent, 'store-hooks')
    mkdirSync(dir, { recursive: true })
    const hook = join(dir, name)
    writeFileSync(hook, `#!/bin/sh\n${body}\n`)
    chmodSync(hook, 0o755)
    store.configSet('core.hooksPath', dir)
  }

  /**
   * When git's own stderr has a lock line for `dst`, the rejected ref must
   * carry it as `detail`. Returns whether git printed one.
   */
  function expectDetailWhenPrinted(report: PushReport, dst: string): boolean {
    const ref = report.refs.find((r) => r.dst === dst)!
    expect(ref.flag).toBe('!')
    const printed = report.stderr.includes(`cannot lock ref '${dst}'`)
    if (printed) expect(ref.detail).toMatch(new RegExp(`^cannot lock ref '${dst}': \\S`))
    else expect(ref.detail).toBeNull()
    return printed
  }

  /**
   * A pre-receive hook that changes the ref itself. The lease check has
   * already passed, so this is another writer winning the race at the remote.
   * It leaves the quarantine first: git refuses ref updates inside it.
   */
  function raceAtRemote(command: string): void {
    storeHook(
      'pre-receive',
      `unset GIT_QUARANTINE_PATH GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES\n${command}`,
    )
  }

  test('accepted refs: new, up to date, fast-forward, forced, deleted', () => {
    expect(only(git.push('origin', `${a}:refs/heads/x`).refs)).toEqual({
      src: a,
      dst: 'refs/heads/x',
      flag: '*',
      summary: '[new branch]',
      rawReason: null,
    })
    expect(only(git.push('origin', `${a}:refs/heads/x`).refs).flag).toBe('=')
    const ff = only(git.push('origin', `${b}:refs/heads/x`).refs)
    expect(ff.flag).toBe(' ')
    expect(ff.summary).toMatch(/^[0-9a-f]+\.\.[0-9a-f]+$/)
    const forced = only(git.push('origin', `+${a}:refs/heads/x`).refs)
    expect(forced).toMatchObject({ flag: '+', rawReason: 'forced update' })
    expect(forced.rejection).toBeUndefined()
    expect(only(git.push('origin', ':refs/heads/x').refs)).toMatchObject({
      src: '',
      dst: 'refs/heads/x',
      flag: '-',
      summary: '[deleted]',
    })
    expect(store.resolveRef('refs/heads/x')).toBeNull()
  })

  test('several refs come back in one report', () => {
    const report = git.push('origin', [`${a}:refs/heads/m1`, `${b}:refs/heads/m2`])
    expect(report.refs.map((r) => [r.dst, r.flag])).toEqual([
      ['refs/heads/m1', '*'],
      ['refs/heads/m2', '*'],
    ])
  })

  test('a non-fast-forward is a value, not a throw', () => {
    git.push('origin', `${b}:refs/heads/x`)
    const ref = only(git.push('origin', `${a}:refs/heads/x`).refs)
    expect(ref).toMatchObject({
      flag: '!',
      summary: '[rejected]',
      rejection: 'non-fast-forward',
      rawReason: 'non-fast-forward',
    })
  })

  test('fetch first (the remote holds a commit the client lacks) is non-fast-forward', () => {
    git.push('origin', `${a}:refs/heads/x`)
    const theirs = store.raw(['commit-tree', `${a}^{tree}`, '-p', a, '-m', 'theirs']).stdout.trim()
    store.raw(['update-ref', 'refs/heads/x', theirs])
    const ref = only(git.push('origin', `${b}:refs/heads/x`).refs)
    expect(ref).toMatchObject({ rejection: 'non-fast-forward', rawReason: 'fetch first' })
  })

  test('a lease on a sha the remote no longer holds is stale', () => {
    git.push('origin', `${a}:refs/heads/x`)
    const ref = only(
      git.push('origin', `${b}:refs/heads/x`, {
        forceWithLease: { ref: 'refs/heads/x', expect: b },
      }).refs,
    )
    expect(ref).toMatchObject({ rejection: 'stale', rawReason: 'stale info' })
    expect(store.resolveRef('refs/heads/x')).toBe(a)
  })

  test('a create-only lease on a ref that exists is stale, caught before sending', () => {
    git.push('origin', `${a}:refs/heads/x`)
    const ref = only(
      git.push('origin', `${b}:refs/heads/x`, {
        forceWithLease: { ref: 'refs/heads/x', expect: null },
      }).refs,
    )
    expect(ref).toMatchObject({ rejection: 'stale', rawReason: 'stale info' })
  })

  test('a create-only lease on a ref already at that sha reports up to date, not a rejection', () => {
    git.push('origin', `${a}:refs/heads/x`)
    const ref = only(
      git.push('origin', `${a}:refs/heads/x`, {
        forceWithLease: { ref: 'refs/heads/x', expect: null },
      }).refs,
    )
    expect(ref.flag).toBe('=')
  })

  test('moving an existing tag is tag-exists', () => {
    git.push('origin', `${a}:refs/tags/t`)
    const ref = only(git.push('origin', `${b}:refs/tags/t`).refs)
    expect(ref).toMatchObject({ rejection: 'tag-exists', rawReason: 'already exists' })
  })

  test('a value that is not a commit needs force, read as non-fast-forward', () => {
    git.push('origin', `${a}:refs/heads/x`)
    const tree = git.revParse(`${b}^{tree}`)!
    const ref = only(git.push('origin', `${tree}:refs/heads/x`).refs)
    expect(ref).toMatchObject({ rejection: 'non-fast-forward', rawReason: 'needs force' })
  })

  test('<ref> beside an existing <ref>/child is ref-conflict', () => {
    git.push('origin', `${a}:refs/heads/d/child`)
    const report = git.push('origin', `${a}:refs/heads/d`, {
      forceWithLease: { ref: 'refs/heads/d', expect: null },
    })
    const ref = only(report.refs)
    // git 2.53 and 2.54 say `refname conflict`; older git says `failed to update ref`.
    expect(ref).toMatchObject({ summary: '[remote rejected]', rejection: 'ref-conflict' })
    expectDetailWhenPrinted(report, 'refs/heads/d')
  })

  test('a pre-receive decline is hook-declined, and stderr keeps the reason', () => {
    storeHook('pre-receive', 'echo "policy says no" >&2\nexit 1')
    const report = git.push('origin', `${a}:refs/heads/x`)
    expect(only(report.refs)).toMatchObject({
      rejection: 'hook-declined',
      rawReason: 'pre-receive hook declined',
    })
    expect(report.stderr).toContain('policy says no')
  })

  test('an update hook declines one ref and lets the other through', () => {
    storeHook('update', '[ "$1" = refs/heads/no ] && exit 1\nexit 0')
    const report = git.push('origin', [`${a}:refs/heads/no`, `${a}:refs/heads/yes`])
    const byRef = Object.fromEntries(report.refs.map((r) => [r.dst, r]))
    expect(byRef['refs/heads/no']).toMatchObject({ flag: '!', rejection: 'hook-declined' })
    expect(byRef['refs/heads/yes']).toMatchObject({ flag: '*' })
  })

  test('another writer moving the ref after the lease check is lock-failed', () => {
    git.push('origin', `${a}:refs/heads/x`)
    const theirs = pair.worker.commit('theirs')
    git.push('origin', `${theirs}:refs/scratch/theirs`)
    raceAtRemote(`git update-ref refs/heads/x ${theirs}`)
    const ref = only(
      git.push('origin', `${b}:refs/heads/x`, {
        forceWithLease: { ref: 'refs/heads/x', expect: a },
      }).refs,
    )
    expect(ref).toMatchObject({ flag: '!', rejection: 'lock-failed' })
    expect(store.resolveRef('refs/heads/x')).toBe(theirs)
  })

  test('another writer deleting the ref after the lease check is lock-failed', () => {
    git.push('origin', `${a}:refs/heads/x`)
    raceAtRemote('git update-ref -d refs/heads/x')
    const ref = only(
      git.push('origin', `${b}:refs/heads/x`, {
        forceWithLease: { ref: 'refs/heads/x', expect: a },
      }).refs,
    )
    expect(ref).toMatchObject({ flag: '!', rejection: 'lock-failed' })
  })

  test('another writer creating the ref after a create-only lease check is already-exists', () => {
    git.push('origin', `${a}:refs/scratch/a`)
    raceAtRemote(`git update-ref refs/heads/new ${a}`)
    const ref = only(
      git.push('origin', `${b}:refs/heads/new`, {
        forceWithLease: { ref: 'refs/heads/new', expect: null },
      }).refs,
    )
    expect(ref).toMatchObject({ flag: '!', rejection: 'already-exists' })
  })

  test('a stale .lock at the remote is not read as a race when the remote says so', () => {
    git.push('origin', `${a}:refs/heads/x`)
    writeFileSync(join(pair.bare.dir, 'refs', 'heads', 'x.lock'), '')
    const report = git.push('origin', `${b}:refs/heads/x`)
    const ref = only(report.refs)
    // git 2.54 prints `Unable to create '….lock'`; 2.53 prints no detail, and
    // its reason is the same as a lost create.
    if (expectDetailWhenPrinted(report, 'refs/heads/x')) expect(ref.rejection).toBe('other')
    else expect(ref.rejection).toBe('already-exists')
  })

  test('--atomic: the ref that failed keeps its reason, the rest say why they did not land', () => {
    git.push('origin', `${a}:refs/heads/x`)
    const report = git.push('origin', [`${b}:refs/heads/x`, `${b}:refs/heads/y`], {
      atomic: true,
      forceWithLease: { ref: 'refs/heads/x', expect: b },
    })
    expect(report.refs.map((r) => [r.dst, r.rejection, r.rawReason])).toEqual([
      ['refs/heads/x', 'stale', 'stale info'],
      ['refs/heads/y', 'atomic-failed', 'atomic push failed'],
    ])
    expect(store.resolveRef('refs/heads/y')).toBeNull()
  })

  test('a failure that reaches no ref still throws the classified failure', () => {
    const missing = git.try.push(join(pair.parent, 'nope.git'), `${a}:refs/heads/x`)
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error.kind).toBe('no-remote')

    const nothing = git.try.push('origin', 'no-such-ref:refs/heads/x')
    expect(nothing.ok).toBe(false)
    if (!nothing.ok) expect(nothing.error.kind).toBe('exit')
  })

  test('a local pre-push hook decline throws: no ref line is printed', () => {
    const dir = join(pair.parent, 'worker-hooks')
    mkdirSync(dir)
    writeFileSync(join(dir, 'pre-push'), '#!/bin/sh\necho blocked >&2\nexit 1\n')
    chmodSync(join(dir, 'pre-push'), 0o755)
    git.configSet('core.hooksPath', dir)
    const r = git.try.push('origin', `${a}:refs/heads/x`)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.detail).toContain('blocked')
  })

  test('AsyncGit returns the same report', async () => {
    git.push('origin', `${b}:refs/heads/x`)
    const report = await new AsyncGit(pair.worker.dir).push('origin', `${a}:refs/heads/x`)
    expect(only(report.refs)).toMatchObject({ rejection: 'non-fast-forward' })
  })
})

// ── canned output from other git versions ───────────────────────────────────

/**
 * What a remote prints, by git version. A new wording is a row here plus, if
 * needed, a line in `pushRejection`.
 */
const CANNED: Array<{
  name: string
  line: string
  stderr?: string
  rejection: PushRejection
}> = [
  {
    name: 'older git: <ref>/child clash, failed to update ref + exists detail',
    line: '!\tabc:refs/heads/d\t[remote rejected] (failed to update ref)',
    stderr:
      "remote: error: cannot lock ref 'refs/heads/d': 'refs/heads/d/child' exists; cannot create 'refs/heads/d'        \n",
    rejection: 'ref-conflict',
  },
  {
    name: 'git 2.53: <ref>/child clash, refname conflict with no detail',
    line: '!\tabc:refs/heads/d\t[remote rejected] (refname conflict)',
    rejection: 'ref-conflict',
  },
  {
    name: 'git 2.54: <ref>/child clash, refname conflict with the detail',
    line: '!\tabc:refs/heads/d\t[remote rejected] (refname conflict)',
    stderr:
      "remote: error: cannot lock ref 'refs/heads/d': 'refs/heads/d/child' exists; cannot create 'refs/heads/d'        \n",
    rejection: 'ref-conflict',
  },
  {
    name: 'older git: ref moved, failed to update ref + but expected',
    line: '!\tabc:refs/heads/x\t[remote rejected] (failed to update ref)',
    stderr: "remote: error: cannot lock ref 'refs/heads/x': is at 1111111 but expected 2222222\n",
    rejection: 'lock-failed',
  },
  {
    name: 'older git: ref deleted, failed to update ref + unable to resolve',
    line: '!\tabc:refs/heads/x\t[remote rejected] (failed to update ref)',
    stderr:
      "remote: error: cannot lock ref 'refs/heads/x': unable to resolve reference 'refs/heads/x'\n",
    rejection: 'lock-failed',
  },
  {
    name: 'older git: ref created, failed to update ref + reference already exists',
    line: '!\tabc:refs/heads/x\t[remote rejected] (failed to update ref)',
    stderr: "remote: error: cannot lock ref 'refs/heads/x': reference already exists\n",
    rejection: 'already-exists',
  },
  {
    name: 'failed to update ref with no detail is not a race',
    line: '!\tabc:refs/heads/x\t[remote rejected] (failed to update ref)',
    rejection: 'other',
  },
  {
    name: 'older git: stale .lock, failed to update ref + Unable to create lock',
    line: '!\tabc:refs/heads/x\t[remote rejected] (failed to update ref)',
    stderr:
      "remote: error: cannot lock ref 'refs/heads/x': Unable to create '/s.git/refs/heads/x.lock': File exists.\n",
    rejection: 'other',
  },
  {
    name: 'git 2.53: ref moved, incorrect old value provided with no detail',
    line: '!\tabc:refs/heads/x\t[remote rejected] (incorrect old value provided)',
    rejection: 'lock-failed',
  },
  {
    name: 'git 2.53: ref deleted, reference does not exist with no detail',
    line: '!\tabc:refs/heads/x\t[remote rejected] (reference does not exist)',
    rejection: 'lock-failed',
  },
  {
    name: 'git 2.53: stale .lock reads exactly like a lost create',
    line: '!\tabc:refs/heads/x\t[remote rejected] (reference already exists)',
    rejection: 'already-exists',
  },
  {
    name: 'git 2.54: stale .lock, told apart by the detail',
    line: '!\tabc:refs/heads/x\t[remote rejected] (reference already exists)',
    stderr:
      "remote: error: cannot lock ref 'refs/heads/x': Unable to create '/s.git/./refs/heads/x.lock': File exists.        \nremote: \nremote: Another git process seems to be running in this repository        \n",
    rejection: 'other',
  },
  {
    name: 'git 2.53/2.54: unwritable refs directory',
    line: '!\tabc:refs/heads/ro/y\t[remote rejected] (failed to update refs)',
    stderr:
      "remote: error: cannot lock ref 'refs/heads/ro/y': Unable to create '/s.git/./refs/heads/ro/y.lock': Permission denied        \n",
    rejection: 'other',
  },
  {
    name: 'a host that puts the lock error in the reason',
    line: "!\trefs/heads/x:refs/heads/x\t[remote rejected] (cannot lock ref 'refs/heads/x': is at 1111111 but expected 2222222)",
    rejection: 'lock-failed',
  },
  {
    name: 'a host hook with its own name',
    line: '!\trefs/heads/x:refs/heads/x\t[remote rejected] (protected branch hook declined)',
    rejection: 'hook-declined',
  },
  {
    name: 'an existing tag',
    line: '!\trefs/tags/t:refs/tags/t\t[rejected] (already exists)',
    rejection: 'tag-exists',
  },
  {
    name: 'a value that is not a commit',
    line: '!\tabc:refs/heads/x\t[rejected] (needs force)',
    rejection: 'non-fast-forward',
  },
  {
    name: 'the collateral ref of a failed --atomic push at the remote',
    line: '!\tabc:refs/heads/m1\t[remote rejected] (atomic transaction failed)',
    rejection: 'atomic-failed',
  },
  {
    name: '--force-if-includes',
    line: '!\trefs/heads/x:refs/heads/x\t[rejected] (remote ref updated since checkout)',
    rejection: 'stale',
  },
  {
    name: 'a detail for another ref does not apply',
    line: '!\tabc:refs/heads/x\t[remote rejected] (failed to update ref)',
    stderr: "remote: error: cannot lock ref 'refs/heads/y': is at 1111111 but expected 2222222\n",
    rejection: 'other',
  },
]

describe('push — canned wordings', () => {
  test.each(CANNED)('$name → $rejection', ({ line, stderr, rejection }) => {
    const stdout = `To /s.git\n${line}\nDone\n`
    const { runner } = recorder({ exitCode: 1, stdout, stderr: stderr ?? '' })
    const ref = only(new Git('/repo', { runner }).push('origin', 'HEAD:x').refs)
    expect(ref.rejection).toBe(rejection)
  })

  test('the detail is the lock message without the remote prefix or padding', () => {
    const { runner } = recorder({
      exitCode: 1,
      stdout: '!\tabc:refs/heads/x\t[remote rejected] (failed to update ref)\n',
      stderr: "remote: error: cannot lock ref 'refs/heads/x': is at 1 but expected 2        \n",
    })
    const ref = only(new Git('/repo', { runner }).push('origin', 'HEAD:x').refs)
    expect(ref.detail).toBe("cannot lock ref 'refs/heads/x': is at 1 but expected 2")
  })

  test('with several push URLs, each rejected copy of a ref gets its own lock line', () => {
    const { runner } = recorder({
      exitCode: 1,
      stdout:
        'To /one.git\n!\tabc:refs/heads/x\t[remote rejected] (failed to update ref)\nDone\n' +
        'To /two.git\n*\tabc:refs/heads/x\t[new branch]\nDone\n' +
        'To /three.git\n!\tabc:refs/heads/x\t[remote rejected] (failed to update ref)\nDone\n',
      stderr:
        "remote: error: cannot lock ref 'refs/heads/x': is at 1 but expected 2\n" +
        "remote: error: cannot lock ref 'refs/heads/x': Unable to create '/three.git/refs/heads/x.lock': File exists.\n",
    })
    const refs = new Git('/repo', { runner }).push('origin', 'HEAD:x').refs
    expect(refs.map((r) => [r.flag, r.rejection, r.detail])).toEqual([
      ['!', 'lock-failed', "cannot lock ref 'refs/heads/x': is at 1 but expected 2"],
      ['*', undefined, undefined],
      [
        '!',
        'other',
        "cannot lock ref 'refs/heads/x': Unable to create '/three.git/refs/heads/x.lock': File exists.",
      ],
    ])
  })

  test('exit 1 without a rejected ref line throws', () => {
    const { runner } = recorder({
      exitCode: 1,
      stdout: '',
      stderr: "error: failed to push some refs to '/s.git'\n",
    })
    expect(() => new Git('/repo', { runner }).push('origin', 'HEAD:x')).toThrow(/git push/)
  })
})
