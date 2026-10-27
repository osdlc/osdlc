import { describe, expect, test } from 'vitest'

import {
  gitSshUrl,
  parseGitUrl,
  parseRemoteRepo,
  parseRemoteUrl,
  parseRepoRef,
} from '../src/index.ts'

describe('parseGitUrl', () => {
  test('https URL', () => {
    expect(parseGitUrl('https://github.com/acme/widgets')).toEqual({
      type: 'github',
      domain: 'github.com',
      user: 'acme',
      project: 'widgets',
      committish: null,
    })
  })

  test('scp-style ssh URL with .git suffix', () => {
    expect(parseGitUrl('git@github.com:acme/widgets.git')).toMatchObject({
      type: 'github',
      user: 'acme',
      project: 'widgets',
    })
  })

  test('bare owner/repo shorthand', () => {
    expect(parseGitUrl('acme/widgets')).toMatchObject({
      type: 'github',
      user: 'acme',
      project: 'widgets',
    })
  })

  test('committish suffix is captured', () => {
    expect(parseGitUrl('https://github.com/acme/widgets#main')?.committish).toBe('main')
  })

  test('unrecognized input returns null', () => {
    expect(parseGitUrl('not a git url')).toBeNull()
  })
})

describe('gitSshUrl', () => {
  test('normalizes an https URL to a scp-style SSH clone URL', () => {
    expect(gitSshUrl('https://github.com/acme/widgets')).toBe('git@github.com:acme/widgets.git')
  })

  test('returns null for unrecognized input', () => {
    expect(gitSshUrl('not a git url')).toBeNull()
  })
})

describe('parseRepoRef', () => {
  const HTTPS = 'https://github.com/acme/widgets.git'
  const SSH = 'git@github.com:acme/widgets.git'

  test('clone URLs keep their protocol; shorthand takes the given one', () => {
    expect(parseRepoRef('https://github.com/acme/widgets')?.cloneUrl).toBe(HTTPS)
    expect(parseRepoRef(HTTPS)?.cloneUrl).toBe(HTTPS)
    expect(parseRepoRef(SSH)?.cloneUrl).toBe(SSH)
    expect(parseRepoRef('ssh://git@github.com/acme/widgets.git')?.cloneUrl).toBe(SSH)
    expect(parseRepoRef('acme/widgets')?.cloneUrl).toBe(HTTPS)
    expect(parseRepoRef('acme/widgets', 'ssh')?.cloneUrl).toBe(SSH)
    expect(parseRepoRef('github:acme/widgets', 'ssh')?.cloneUrl).toBe(SSH)
  })

  test('web pages copied from a browser name the repository', () => {
    for (const page of [
      'https://github.com/acme/widgets/pull/12',
      'https://github.com/acme/widgets/pull/12/files?diff=split#r1',
      'https://github.com/acme/widgets/issues/3',
      'https://github.com/acme/widgets/blob/main/README.md',
      'https://github.com/acme/widgets/',
    ]) {
      expect(parseRepoRef(page)).toMatchObject({
        host: 'github.com',
        owner: 'acme',
        repo: 'widgets',
        cloneUrl: HTTPS,
      })
    }
  })

  test('a branch the URL names is carried as committish', () => {
    expect(parseRepoRef('https://github.com/acme/widgets/tree/main/docs')?.committish).toBe('main')
    expect(parseRepoRef('https://github.com/acme/widgets#v1.0')).toMatchObject({
      committish: 'v1.0',
      cloneUrl: HTTPS,
    })
    expect(parseRepoRef(HTTPS)?.committish).toBeNull()
  })

  test('a GitLab page in a nested group names the whole project path', () => {
    for (const page of [
      'https://gitlab.com/acme/platform/api/-/merge_requests/12',
      'https://gitlab.com/acme/platform/api/-/tree/main',
    ]) {
      expect(parseRepoRef(page)).toMatchObject({
        host: 'gitlab.com',
        owner: 'acme/platform',
        repo: 'api',
        cloneUrl: 'https://gitlab.com/acme/platform/api.git',
      })
    }
    expect(parseRepoRef('https://gitlab.com/group/proj/-/issues/3')).toMatchObject({
      owner: 'group',
      repo: 'proj',
    })
  })

  test('a GitHub page with a `-` path segment still names its repo', () => {
    expect(parseRepoRef('https://github.com/acme/widgets/blob/main/-/notes.md')).toMatchObject({
      host: 'github.com',
      owner: 'acme',
      repo: 'widgets',
      cloneUrl: 'https://github.com/acme/widgets.git',
    })
  })

  test('other hosts parse; a local path, an unknown host and empty input do not', () => {
    expect(parseRepoRef('https://gitlab.com/group/proj')).toMatchObject({
      host: 'gitlab.com',
      owner: 'group',
      repo: 'proj',
      cloneUrl: 'https://gitlab.com/group/proj.git',
    })
    expect(parseRepoRef('/Users/x/repo')).toBeNull()
    expect(parseRepoRef('https://ghe.example.com/o/r/-/x')).toBeNull()
    expect(parseRepoRef('https://ghe.example.com/o/r')).toBeNull()
    expect(parseRepoRef('  ')).toBeNull()
  })
})

describe('parseRemoteUrl', () => {
  test('scp-style, https and ssh:// on any host', () => {
    expect(parseRemoteUrl('git@github.com:acme/widgets.git')).toEqual({
      host: 'github.com',
      port: null,
      owner: 'acme',
      repo: 'widgets',
    })
    expect(parseRemoteUrl('https://forge.example.com:3000/team/app.git')).toEqual({
      host: 'forge.example.com',
      port: 3000,
      owner: 'team',
      repo: 'app',
    })
    expect(parseRemoteUrl('ssh://git@forge.example.com:2222/team/app')).toMatchObject({
      host: 'forge.example.com',
      port: null,
      owner: 'team',
      repo: 'app',
    })
    expect(parseRemoteUrl('https://user:pw@host/a/b/')).toMatchObject({ owner: 'a', repo: 'b' })
  })

  test('ssh:// drops its port: it is the SSH port, not a web port', () => {
    expect(parseRemoteUrl('ssh://git@git.example.com:2222/owner/repo.git')?.port).toBeNull()
  })

  test('a nested group answers its last two segments', () => {
    expect(parseRemoteUrl('https://gitlab.com/g/sub/repo.git')).toMatchObject({
      owner: 'sub',
      repo: 'repo',
    })
  })

  test('a trailing slash after .git still drops the suffix', () => {
    expect(parseRemoteUrl('https://github.com/acme/widgets.git/')).toMatchObject({
      owner: 'acme',
      repo: 'widgets',
    })
    expect(parseRemoteUrl('git@github.com:acme/widgets.git/')?.repo).toBe('widgets')
  })

  test('local paths, file:// URLs and single-segment URLs are null', () => {
    expect(parseRemoteUrl('/srv/git/repo.git')).toBeNull()
    expect(parseRemoteUrl('file://localhost/srv/git/a/b.git')).toBeNull()
    expect(parseRemoteUrl('file:///srv/git/a/b.git')).toBeNull()
    expect(parseRemoteUrl('https://host/only')).toBeNull()
    expect(parseRemoteUrl('')).toBeNull()
  })
})

describe('parseRemoteRepo', () => {
  test('a GitHub remote, https, scp-style, ssh:// or shorthand', () => {
    const widgets = { host: 'github.com', owner: 'acme', repo: 'widgets' }
    for (const url of [
      'https://github.com/acme/widgets',
      'https://github.com/acme/widgets.git',
      'git@github.com:acme/widgets.git',
      'ssh://git@github.com/acme/widgets.git',
      'acme/widgets',
    ]) {
      expect(parseRemoteRepo(url)).toEqual(widgets)
    }
  })

  test('a GitHub Enterprise remote falls back to the host-agnostic reading', () => {
    const ghe = { host: 'github.acme.com', owner: 'acme', repo: 'widgets' }
    expect(parseRemoteRepo('git@github.acme.com:acme/widgets.git')).toEqual(ghe)
    expect(parseRemoteRepo('https://github.acme.com/acme/widgets.git')).toEqual(ghe)
    expect(parseRemoteRepo('https://GitHub.Acme.com/acme/widgets')).toEqual(ghe)
  })

  test('a self-hosted Forgejo remote, scp-style, https with a port, or ssh://', () => {
    const app = { host: 'forge.example.com', owner: 'team', repo: 'app' }
    expect(parseRemoteRepo('git@forge.example.com:team/app.git')).toEqual(app)
    expect(parseRemoteRepo('https://forge.example.com:3000/team/app.git')).toEqual(app)
    expect(parseRemoteRepo('ssh://git@forge.example.com:2222/team/app')).toEqual(app)
  })

  test('a lookalike host is read as itself, not as GitHub', () => {
    expect(parseRemoteRepo('https://notgithub.com/acme/widgets.git')).toEqual({
      host: 'notgithub.com',
      owner: 'acme',
      repo: 'widgets',
    })
    expect(parseRemoteRepo('git@notgithub.com:acme/widgets.git')?.host).toBe('notgithub.com')
  })

  test('a GitLab nested group stays whole in owner; an unknown host gives the last two', () => {
    expect(parseRemoteRepo('https://gitlab.com/acme/platform/api')).toEqual({
      host: 'gitlab.com',
      owner: 'acme/platform',
      repo: 'api',
    })
    expect(parseRemoteRepo('https://git.example.com/acme/platform/api.git')).toEqual({
      host: 'git.example.com',
      owner: 'platform',
      repo: 'api',
    })
  })

  test('a local path, a file:// URL and text that names no project are null', () => {
    expect(parseRemoteRepo('/srv/git/repo.git')).toBeNull()
    expect(parseRemoteRepo('file:///srv/git/a/b.git')).toBeNull()
    expect(parseRemoteRepo('https://host/only')).toBeNull()
    expect(parseRemoteRepo('not a url')).toBeNull()
  })
})
