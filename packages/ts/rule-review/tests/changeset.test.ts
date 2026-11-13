import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Git } from '@osdlc/typed-git'

import { makeRepo, sh as shIn, writeFile as writeIn } from './fixture-repo.ts'
import {
  changedFiles,
  ChangesetError,
  defaultBase,
  fileDiffs,
  resolveBase,
  stagedFiles,
  trackedFiles,
} from '../src/changeset.ts'

let origin: string
let repo: string
let git: Git

function sh(g: Git, argv: string[]): void {
  const r = g.raw(argv)
  if (r.exitCode !== 0) throw new Error(`${argv.join(' ')}: ${r.stderr}`)
}

function write(rel: string, body: string): void {
  const abs = join(repo, rel)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, body, 'utf8')
}

beforeAll(() => {
  // A bare origin plus a clone, so `origin/HEAD` exists exactly as it does in
  // a real checkout — which is the condition the base-resolution bug needed.
  origin = mkdtempSync(join(tmpdir(), 'rule-review-origin-'))
  const seed = mkdtempSync(join(tmpdir(), 'rule-review-seed-'))
  const bare = new Git(origin)
  sh(bare, ['init', '--bare', '-b', 'main', '.'])

  const s = new Git(seed)
  sh(s, ['init', '-b', 'main', '.'])
  sh(s, ['config', 'user.email', 't@t'])
  sh(s, ['config', 'user.name', 't'])
  writeFileSync(join(seed, 'base.txt'), 'one\n')
  s.add(['.'])
  s.commit({ message: 'c1' })
  sh(s, ['remote', 'add', 'origin', origin])
  s.push('origin', 'main')

  repo = mkdtempSync(join(tmpdir(), 'rule-review-clone-'))
  rmSync(repo, { recursive: true, force: true })
  sh(new Git(tmpdir()), ['clone', '-q', origin, repo])
  git = new Git(repo)
  sh(git, ['config', 'user.email', 't@t'])
  sh(git, ['config', 'user.name', 't'])

  // One commit past main, then one uncommitted edit and one new file.
  sh(git, ['checkout', '-q', '-b', 'feature'])
  write('committed.txt', 'committed\n')
  git.add(['committed.txt'])
  git.commit({ message: 'c2' })

  write('base.txt', 'one\ntwo\n')
  write('untracked.txt', 'new\n')
})

afterAll(() => {
  for (const d of [origin, repo]) rmSync(d, { recursive: true, force: true })
})

describe('changedFiles', () => {
  test('--base HEAD sees only uncommitted work', () => {
    // See NOT_A_BRANCH in src/changeset.ts.
    const files = changedFiles(git, 'HEAD')

    expect(files).toEqual(['base.txt', 'untracked.txt'])
    expect(files).not.toContain('committed.txt')
  })

  test('a branch base sees committed work as well', () => {
    expect(changedFiles(git, 'main')).toEqual(['base.txt', 'committed.txt', 'untracked.txt'])
  })

  test('a sha base is used as written', () => {
    const head = git.revParse('HEAD')
    expect(head).not.toBeNull()

    expect(changedFiles(git, head!)).toEqual(['base.txt', 'untracked.txt'])
  })

  test('HEAD~1 reaches back past the branch commit', () => {
    expect(changedFiles(git, 'HEAD~1')).toContain('committed.txt')
  })

  test('untracked files are included — new code is what rules most want to see', () => {
    expect(changedFiles(git, 'HEAD')).toContain('untracked.txt')
  })
})

describe('stagedFiles and trackedFiles', () => {
  let root: string
  let g: Git

  beforeAll(() => {
    ;({ root, git: g } = makeRepo({ 'keep.txt': 'k\n', 'gone.txt': 'g\n', 'src/old.ts': 'o\n' }))
    writeIn(root, 'staged-new.txt', 'n\n')
    writeIn(root, 'src/old.ts', 'o2\n')
    shIn(g, ['mv', 'keep.txt', 'renamed.txt'])
    shIn(g, ['rm', '-q', 'gone.txt'])
    g.add(['staged-new.txt', 'src/old.ts'])
    // Unstaged edit and untracked file: neither is in the index.
    writeIn(root, 'src/unstaged.ts', 'u\n')
    writeIn(root, 'renamed.txt', 'k\nchanged\n')
  })

  afterAll(() => rmSync(root, { recursive: true, force: true }))

  test('stagedFiles lists added, modified and renamed paths, not deletions', () => {
    expect(stagedFiles(g)).toEqual(['renamed.txt', 'src/old.ts', 'staged-new.txt'])
  })

  test('trackedFiles lists every indexed file, sorted', () => {
    expect(trackedFiles(g)).toEqual(['renamed.txt', 'src/old.ts', 'staged-new.txt'])
  })
})

describe('defaultBase', () => {
  test('follows origin/HEAD, stripped of its remote prefix', () => {
    expect(defaultBase(git)).toBe('main')
  })

  test('falls back to main in a repository with no origin', () => {
    const { git: local } = makeRepo({ 'a.txt': 'a\n' })
    expect(defaultBase(local)).toBe('main')
  })

  test('falls back to master when only master exists', () => {
    const { git: local } = makeRepo({ 'a.txt': 'a\n' })
    sh(local, ['branch', '-m', 'main', 'master'])
    expect(defaultBase(local)).toBe('master')
  })
})

describe('fileDiffs', () => {
  test('renders a modified file as a diff', () => {
    const [diff] = fileDiffs(git, 'HEAD', ['base.txt'])

    expect(diff?.file).toBe('base.txt')
    expect(diff?.diff).toContain('+two')
  })

  test('renders an untracked file as all-added', () => {
    const [diff] = fileDiffs(git, 'HEAD', ['untracked.txt'])

    expect(diff?.diff).toContain('+new')
  })

  test('renders an unchanged file whole, as added', () => {
    const [diff] = fileDiffs(git, 'HEAD', ['committed.txt'])

    expect(diff?.diff).toContain('new file mode')
    expect(diff?.diff).toContain('+committed')
  })

  test('returns the deletion diff of a deleted file', () => {
    const { root, git: g } = makeRepo({ 'gone.txt': 'bye\n' })
    rmSync(join(root, 'gone.txt'))

    const [diff] = fileDiffs(g, 'HEAD', ['gone.txt'])

    expect(diff?.diff).toContain('deleted file mode')
    expect(diff?.diff).toContain('-bye')
    rmSync(root, { recursive: true, force: true })
  })

  test('skips a path with nothing to show', () => {
    expect(fileDiffs(git, 'HEAD', ['never-existed.txt'])).toEqual([])
  })

  test('a path with glob characters diffs only itself', () => {
    const { root, git: g } = makeRepo({
      'pages/[id].vue': 'id\n',
      'pages/d.vue': 'd\n',
    })
    writeIn(root, 'pages/[id].vue', 'id2\n')
    writeIn(root, 'pages/d.vue', 'SECRET\n')

    const [diff] = fileDiffs(g, 'HEAD', ['pages/[id].vue'])

    expect(diff?.diff).toContain('+id2')
    expect(diff?.diff).not.toContain('SECRET')
    rmSync(root, { recursive: true, force: true })
  })
})

describe('resolveBase — commit-naming revs pass through unchanged (AC-4)', () => {
  test('HEAD is returned as written', () => {
    expect(resolveBase(git, 'HEAD')).toBe('HEAD')
  })

  test('a sha is returned as written', () => {
    const head = git.revParse('HEAD')
    expect(head).not.toBeNull()
    expect(resolveBase(git, head!)).toBe(head!)
  })
})

describe('resolveBase — branch base ancestry', () => {
  // A second origin/clone pair, independent of the one above: this block
  // drives origin and local branch tips out of sync in ways the shared
  // `origin`/`repo` fixture above never needs to.
  let origin2: string
  let pusherDir: string
  let pusher: Git
  let local: string
  let git2: Git

  beforeAll(() => {
    origin2 = mkdtempSync(join(tmpdir(), 'rule-review-origin2-'))
    sh(new Git(origin2), ['init', '--bare', '-b', 'main', '.'])

    pusherDir = mkdtempSync(join(tmpdir(), 'rule-review-pusher-'))
    pusher = new Git(pusherDir)
    sh(pusher, ['init', '-b', 'main', '.'])
    sh(pusher, ['config', 'user.email', 't@t'])
    sh(pusher, ['config', 'user.name', 't'])
    writeFileSync(join(pusherDir, 'root.txt'), 'root\n')
    pusher.add(['.'])
    pusher.commit({ message: 'root' })
    sh(pusher, ['remote', 'add', 'origin', origin2])
    pusher.push('origin', 'main')

    // `behind`: pushed once now; the pusher advances it again further down,
    // AFTER the clone below has already fetched and branched from this tip.
    pusher.checkout('main')
    pusher.checkout('main', { branch: 'behind' })
    writeFileSync(join(pusherDir, 'behind-1.txt'), 'one\n')
    pusher.add(['.'])
    pusher.commit({ message: 'behind-1' })
    pusher.push('origin', 'behind')

    // `ahead`: pushed once; the LOCAL clone advances it further down, and
    // origin's copy never moves again.
    pusher.checkout('main')
    pusher.checkout('main', { branch: 'ahead' })
    writeFileSync(join(pusherDir, 'ahead-0.txt'), 'zero\n')
    pusher.add(['.'])
    pusher.commit({ message: 'ahead-0' })
    pusher.push('origin', 'ahead')

    // `diverged`: a common point pushed once; the pusher and the local clone
    // each add a DIFFERENT commit on top of it, and neither ever sees the
    // other's.
    pusher.checkout('main')
    pusher.checkout('main', { branch: 'diverged' })
    writeFileSync(join(pusherDir, 'diverged-0.txt'), 'zero\n')
    pusher.add(['.'])
    pusher.commit({ message: 'diverged-0' })
    pusher.push('origin', 'diverged')

    // `remote-only`: pushed, but the local clone below never checks out a
    // branch by this name — only `origin/remote-only` exists there.
    pusher.checkout('main')
    pusher.checkout('main', { branch: 'remote-only' })
    writeFileSync(join(pusherDir, 'remote-only-0.txt'), 'zero\n')
    pusher.add(['.'])
    pusher.commit({ message: 'remote-only-0' })
    pusher.push('origin', 'remote-only')

    local = mkdtempSync(join(tmpdir(), 'rule-review-local-'))
    rmSync(local, { recursive: true, force: true })
    sh(new Git(tmpdir()), ['clone', '-q', origin2, local])
    git2 = new Git(local)
    sh(git2, ['config', 'user.email', 't@t'])
    sh(git2, ['config', 'user.name', 't'])

    // Local tracking branches at the tips fetched so far (`behind`@B1,
    // `ahead`@A1, `diverged`@D0) — BEFORE either side moves them further.
    git2.checkout('origin/behind', { branch: 'behind' })
    git2.checkout('origin/ahead', { branch: 'ahead' })
    git2.checkout('origin/diverged', { branch: 'diverged' })
    // Purely local, never pushed: only the local ref will ever exist.
    git2.checkout('main', { branch: 'local-only' })
    writeFileSync(join(local, 'local-only-0.txt'), 'zero\n')
    git2.add(['.'])
    git2.commit({ message: 'local-only-0' })

    // Advance `ahead` locally, past what origin/ahead has.
    git2.checkout('ahead')
    writeFileSync(join(local, 'ahead-1.txt'), 'one\n')
    git2.add(['.'])
    git2.commit({ message: 'ahead-1' })

    // Advance `diverged` locally, DIFFERENTLY from what the pusher is about
    // to push.
    git2.checkout('diverged')
    writeFileSync(join(local, 'diverged-local.txt'), 'local\n')
    git2.add(['.'])
    git2.commit({ message: 'diverged-local' })

    // Now move the pusher's copies of `behind` and `diverged` further, so
    // the clone's next fetch sees them move without ever merging.
    pusher.checkout('behind')
    writeFileSync(join(pusherDir, 'behind-2.txt'), 'two\n')
    pusher.add(['.'])
    pusher.commit({ message: 'behind-2' })
    pusher.push('origin', 'behind')

    pusher.checkout('diverged')
    writeFileSync(join(pusherDir, 'diverged-remote.txt'), 'remote\n')
    pusher.add(['.'])
    pusher.commit({ message: 'diverged-remote' })
    pusher.push('origin', 'diverged')

    sh(git2, ['fetch', '-q', 'origin'])
  })

  afterAll(() => {
    for (const d of [origin2, pusherDir, local]) rmSync(d, { recursive: true, force: true })
  })

  test('AC-2: local behind (or equal to) origin resolves to the remote copy', () => {
    expect(resolveBase(git2, 'behind')).toBe('origin/behind')
  })

  test('local ahead of origin resolves to the local branch', () => {
    expect(resolveBase(git2, 'ahead')).toBe('ahead')
  })

  test('AC-3: local diverged from origin resolves to the local branch', () => {
    expect(resolveBase(git2, 'diverged')).toBe('diverged')
  })

  test('only a local ref exists: resolves to it', () => {
    expect(resolveBase(git2, 'local-only')).toBe('local-only')
  })

  test('only a remote ref exists: resolves to it', () => {
    expect(resolveBase(git2, 'remote-only')).toBe('origin/remote-only')
  })
})

describe('changedFiles — local branch ahead of origin is used as the fork point', () => {
  // A dedicated, self-contained origin/pusher/local trio (mutated by its one
  // test), kept apart from the read-only ancestry checks above so neither
  // suite's ordering can affect the other's fixture state.
  let origin3: string
  let pusherDir: string
  let pusher: Git
  let local: string
  let git3: Git

  beforeAll(() => {
    origin3 = mkdtempSync(join(tmpdir(), 'rule-review-origin3-'))
    sh(new Git(origin3), ['init', '--bare', '-b', 'main', '.'])

    pusherDir = mkdtempSync(join(tmpdir(), 'rule-review-pusher3-'))
    pusher = new Git(pusherDir)
    sh(pusher, ['init', '-b', 'main', '.'])
    sh(pusher, ['config', 'user.email', 't@t'])
    sh(pusher, ['config', 'user.name', 't'])
    writeFileSync(join(pusherDir, 'root.txt'), 'root\n')
    pusher.add(['.'])
    pusher.commit({ message: 'root' })
    sh(pusher, ['remote', 'add', 'origin', origin3])
    pusher.push('origin', 'main')

    // `feature`: pushed at F0, and never pushed again — everything past
    // this point happens only in the local clone below.
    pusher.checkout('main', { branch: 'feature' })
    writeFileSync(join(pusherDir, 'feature-0.txt'), 'zero\n')
    pusher.add(['.'])
    pusher.commit({ message: 'feature-0' })
    pusher.push('origin', 'feature')

    local = mkdtempSync(join(tmpdir(), 'rule-review-local3-'))
    rmSync(local, { recursive: true, force: true })
    sh(new Git(tmpdir()), ['clone', '-q', origin3, local])
    git3 = new Git(local)
    sh(git3, ['config', 'user.email', 't@t'])
    sh(git3, ['config', 'user.name', 't'])
    git3.checkout('origin/feature', { branch: 'feature' })

    // Two commits past `origin/feature`, unpushed.
    writeFileSync(join(local, 'feature-1.txt'), 'one\n')
    git3.add(['.'])
    git3.commit({ message: 'feature-1' })
    writeFileSync(join(local, 'feature-2.txt'), 'two\n')
    git3.add(['.'])
    git3.commit({ message: 'feature-2' })

    // `topic`, one commit past local `feature`.
    git3.checkout('feature', { branch: 'topic' })
    writeFileSync(join(local, 'topic.txt'), 'topic\n')
    git3.add(['.'])
    git3.commit({ message: 'topic' })

    // Plus uncommitted and untracked work, per the shared top-of-file
    // fixture's pattern.
    writeFileSync(join(local, 'topic.txt'), 'topic\nmore\n')
    writeFileSync(join(local, 'untracked-topic.txt'), 'new\n')
  })

  afterAll(() => {
    for (const d of [origin3, pusherDir, local]) rmSync(d, { recursive: true, force: true })
  })

  test('AC-1: changedFiles(git, "feature") returns only topic\'s file plus working-tree changes', () => {
    const files = changedFiles(git3, 'feature')

    expect(files).toEqual(['topic.txt', 'untracked-topic.txt'])
    expect(files).not.toContain('feature-1.txt')
    expect(files).not.toContain('feature-2.txt')
  })
})

describe('a repo with no commits yet', () => {
  let root: string
  let g: Git

  beforeAll(() => {
    // An unborn HEAD: a fresh `git init`, or the first commit's pre-commit hook.
    root = mkdtempSync(join(tmpdir(), 'rule-review-unborn-'))
    g = new Git(root)
    shIn(g, ['init', '-q', '-b', 'main', '.'])
    writeIn(root, 'staged.txt', 'staged\n')
    g.add(['staged.txt'])
    writeIn(root, 'loose.txt', 'loose\n')
  })

  afterAll(() => rmSync(root, { recursive: true, force: true }))

  test('changedFiles judges every file as uncommitted work', () => {
    expect(changedFiles(g, 'HEAD')).toEqual(['loose.txt', 'staged.txt'])
    expect(changedFiles(g, 'HEAD', { existingOnly: true })).toEqual(['loose.txt', 'staged.txt'])
  })

  test('fileDiffs renders each file as added', () => {
    const diffs = fileDiffs(g, 'HEAD', ['loose.txt', 'staged.txt'])

    expect(diffs.map((d) => d.file)).toEqual(['loose.txt', 'staged.txt'])
    expect(diffs[0]?.diff).toContain('+loose')
    expect(diffs[1]?.diff).toContain('+staged')
  })

  test('a base that does not resolve yet, such as the unborn main, also judges every file as new', () => {
    // A pre-commit hook running `rule-review checks --base main` must not block the
    // first commit: no branch exists yet, so there is nothing to compare to.
    for (const base of ['main', '@{u}']) {
      expect(changedFiles(g, base)).toEqual(['loose.txt', 'staged.txt'])
      expect(fileDiffs(g, base, ['staged.txt'])[0]?.diff).toContain('+staged')
    }
  })
})

describe('a renamed file', () => {
  let root: string
  let g: Git

  beforeAll(() => {
    ;({ root, git: g } = makeRepo({ 'api/CLAUDE.md': 'rules\n', 'api/foo.ts': 'foo\n' }))
    mkdirSync(join(root, 'web'))
    shIn(g, ['mv', 'api/foo.ts', 'web/foo.ts'])
    g.commit({ message: 'move' })
  })

  afterAll(() => rmSync(root, { recursive: true, force: true }))

  test('changedFiles lists the old path too, so the rules that governed it see the removal', () => {
    expect(changedFiles(g, 'HEAD~1')).toEqual(['api/foo.ts', 'web/foo.ts'])
  })

  test('existingOnly keeps only the new path', () => {
    expect(changedFiles(g, 'HEAD~1', { existingOnly: true })).toEqual(['web/foo.ts'])
  })

  test('fileDiffs gives the old path its deletion diff', () => {
    const [diff] = fileDiffs(g, 'HEAD~1', ['api/foo.ts'])

    expect(diff?.diff).toContain('deleted file mode')
    expect(diff?.diff).toContain('-foo')
  })
})

describe('trackedFiles during a merge conflict', () => {
  let root: string
  let g: Git

  beforeAll(() => {
    ;({ root, git: g } = makeRepo({ 'f.txt': 'base\n' }))
    shIn(g, ['checkout', '-q', '-b', 'other'])
    writeIn(root, 'f.txt', 'other\n')
    g.add(['f.txt'])
    g.commit({ message: 'other' })
    shIn(g, ['checkout', '-q', 'main'])
    writeIn(root, 'f.txt', 'main\n')
    g.add(['f.txt'])
    g.commit({ message: 'main' })
    // Exits 1 on the conflict, which is the state under test.
    g.raw(['merge', '-q', 'other'])
  })

  afterAll(() => rmSync(root, { recursive: true, force: true }))

  test('lists a conflicted path once, not once per stage', () => {
    expect(trackedFiles(g)).toEqual(['f.txt'])
  })
})

describe('a directory path', () => {
  test('reads the whole checkout from any subdirectory, paths from its top level', () => {
    const { root } = makeRepo({ 'sub/a.ts': 'a\n', 'b.ts': 'b\n' })
    writeIn(root, 'sub/a.ts', 'a2\n')
    writeIn(root, 'sub/new.ts', 'n\n')
    writeIn(root, 'top.ts', 't\n')
    try {
      const sub = join(root, 'sub')
      expect(changedFiles(sub, 'HEAD')).toEqual(['sub/a.ts', 'sub/new.ts', 'top.ts'])
      expect(trackedFiles(sub)).toEqual(['b.ts', 'sub/a.ts'])
      expect(fileDiffs(sub, 'HEAD', ['sub/a.ts', 'top.ts']).map((d) => d.file)).toEqual([
        'sub/a.ts',
        'top.ts',
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('outside git is a ChangesetError', () => {
    const outside = mkdtempSync(join(tmpdir(), 'rule-review-outside-'))
    try {
      expect(() => trackedFiles(outside)).toThrow(ChangesetError)
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })
})

test('a branch named like a sha is still a branch, and the remote copy wins when it is behind', () => {
  const { root, git } = makeRepo({ 'a.txt': 'a\n' })
  const remote = makeRepo({ 'a.txt': 'a\n' })
  try {
    git.raw(['branch', 'deadbeef'])
    git.raw(['remote', 'add', 'origin', remote.root])
    // origin/deadbeef is ahead of the local deadbeef branch.
    remote.git.raw(['switch', '-q', '-c', 'deadbeef'])
    writeIn(remote.root, 'b.txt', 'b\n')
    remote.git.add(['.'])
    remote.git.commit({ message: 'ahead' })
    git.raw(['fetch', '-q', 'origin', 'deadbeef:refs/remotes/origin/deadbeef'])

    expect(resolveBase(git, 'deadbeef')).toBe('origin/deadbeef')
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(remote.root, { recursive: true, force: true })
  }
})
