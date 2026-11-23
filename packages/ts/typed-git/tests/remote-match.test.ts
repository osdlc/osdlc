/**
 * readRemote, sshAliasResolver, isSshRemote and sameRepo. Every resolver
 * here is a fake, so the real ssh never runs.
 */

import { describe, expect, test } from 'vitest'

import { homedir } from 'node:os'

import type { CommandRunOptions, CommandRunner } from '@osdlc/command-seam'

import { isSshRemote, readRemote, sameRepo, sshAliasResolver } from '../src/index.ts'

describe('readRemote', () => {
  const aliases = (alias: string) =>
    ({ 'github-work': 'GitHub.com', forge: 'git.example.com' })[alias] ?? null

  test('replaces an SSH alias host with the host it stands for', () => {
    expect(readRemote('git@github-work:acme/widgets.git', aliases)).toEqual({
      host: 'github.com',
      owner: 'acme',
      repo: 'widgets',
    })
    expect(readRemote('git@forge:acme/widgets.git', aliases)?.host).toBe('git.example.com')
  })

  test('resolves an alias with a dot in it', () => {
    const dotted = (alias: string) => (alias === 'github.com-work' ? 'github.com' : null)
    expect(readRemote('git@github.com-work:acme/widgets.git', dotted)?.host).toBe('github.com')
    expect(readRemote('ssh://git@github.com-work/acme/widgets.git', dotted)?.host).toBe(
      'github.com',
    )
    expect(readRemote('git+ssh://git@github.com-work/acme/widgets.git', dotted)?.host).toBe(
      'github.com',
    )
  })

  test('an alias for ssh.github.com reads as github.com', () => {
    const ssh443 = (alias: string) => (alias === 'github-work' ? 'ssh.github.com' : null)
    expect(readRemote('git@github-work:acme/widgets.git', ssh443)?.host).toBe('github.com')
  })

  test('asks ssh only about an SSH remote that is not on github.com', () => {
    const never = () => {
      throw new Error('resolver called')
    }
    expect(readRemote('git@github.com:acme/widgets.git', never)?.host).toBe('github.com')
    expect(readRemote('http://gitea/acme/widgets.git', never)?.host).toBe('gitea')
    expect(readRemote('https://localhost:8080/acme/widgets.git', never)?.host).toBe('localhost')
    expect(readRemote('/srv/git/widgets.git', never)).toBeNull()
    expect(readRemote('git@nowhere:acme/widgets.git', aliases)?.host).toBe('nowhere')
  })
})

describe('sshAliasResolver', () => {
  /** A fake ssh that prints `stdout` for `-G`, and records each run. */
  function fakeSsh(exitCode: number, stdout: string) {
    const calls: Array<{ argv: string[]; opts: CommandRunOptions }> = []
    const runner: CommandRunner = {
      run(argv, opts) {
        calls.push({ argv, opts })
        return { exitCode, stdout, stderr: '' }
      },
    }
    return { calls, runner }
  }

  test('reads the hostname line, and caches it per alias', () => {
    const ssh = fakeSsh(0, 'user git\nhostname ssh.github.com\nport 443\n')
    const resolve = sshAliasResolver(ssh.runner)
    expect(resolve('github-work')).toBe('ssh.github.com')
    expect(resolve('github-work')).toBe('ssh.github.com')
    expect(ssh.calls.map((c) => c.argv)).toEqual([['-G', '--', 'github-work']])
  })

  test('passes the alias after `--`, so a leading dash is not an option', () => {
    const ssh = fakeSsh(0, 'hostname forge.example\n')
    sshAliasResolver(ssh.runner)('-oProxyCommand=x')
    expect(ssh.calls[0]?.argv).toEqual(['-G', '--', '-oProxyCommand=x'])
  })

  test('runs from the home directory with a 5 s limit', () => {
    const ssh = fakeSsh(0, 'hostname forge.example\n')
    sshAliasResolver(ssh.runner)('forge')
    const opts = ssh.calls[0]?.opts
    expect(opts?.cwd).toBe(homedir())
    expect(opts?.timeoutMs).toBe(5_000)
  })

  test('each resolver has its own cache', () => {
    const ssh = fakeSsh(0, 'hostname forge.example\n')
    sshAliasResolver(ssh.runner)('forge')
    sshAliasResolver(ssh.runner)('forge')
    expect(ssh.calls).toHaveLength(2)
  })

  test('a null answer is cached too', () => {
    const ssh = fakeSsh(255, '')
    const resolve = sshAliasResolver(ssh.runner)
    expect(resolve('forge')).toBeNull()
    expect(resolve('forge')).toBeNull()
    expect(ssh.calls).toHaveLength(1)
  })

  test('an alias ssh maps to itself, a failing ssh, and no hostname line are null', () => {
    expect(sshAliasResolver(fakeSsh(0, 'hostname forge\n').runner)('forge')).toBeNull()
    expect(sshAliasResolver(fakeSsh(0, 'hostname FORGE\n').runner)('forge')).toBeNull()
    expect(sshAliasResolver(fakeSsh(255, '').runner)('forge')).toBeNull()
    expect(sshAliasResolver(fakeSsh(0, 'user git\n').runner)('forge')).toBeNull()
  })
})

describe('isSshRemote', () => {
  test('ssh URLs in each spelling, and the scp-like form, are SSH', () => {
    for (const url of [
      'ssh://git@host/o/r.git',
      'SSH://git@host/o/r.git',
      'git+ssh://git@host/o/r.git',
      'ssh+git://git@host/o/r.git',
      'git@host:o/r.git',
      'host:o/r.git',
    ]) {
      expect(isSshRemote(url), url).toBe(true)
    }
  })

  test('other schemes and local paths are not', () => {
    for (const url of [
      'https://host/o/r.git',
      'http://host/o/r.git',
      'git://host/o/r.git',
      'file:///srv/o/r.git',
      '/srv/git/o/r.git',
      './a:b/r.git',
    ]) {
      expect(isSshRemote(url), url).toBe(false)
    }
  })
})

describe('sameRepo', () => {
  const widgets = { owner: 'acme', repo: 'widgets' }

  test('owner and repo match in any letter case', () => {
    expect(sameRepo(widgets, { owner: 'ACME', repo: 'Widgets' })).toBe(true)
    expect(sameRepo(widgets, { owner: 'acme', repo: 'gadgets' })).toBe(false)
    expect(sameRepo(widgets, { owner: 'other', repo: 'widgets' })).toBe(false)
  })

  test('hosts must match, in any case, when both name one', () => {
    const github = { ...widgets, host: 'github.com' }
    expect(sameRepo(github, { ...widgets, host: 'GitHub.com' })).toBe(true)
    expect(sameRepo(github, { ...widgets, host: 'forge.example' })).toBe(false)
  })

  test('a coordinate without a host matches one on any host', () => {
    expect(sameRepo(widgets, { ...widgets, host: 'forge.example' })).toBe(true)
    expect(sameRepo({ ...widgets, host: 'github.com' }, widgets)).toBe(true)
    expect(sameRepo({ ...widgets, host: undefined }, { ...widgets, host: 'github.com' })).toBe(true)
  })

  test('a RemoteRepo from readRemote is a coordinate', () => {
    const remote = readRemote('https://github.com/Acme/Widgets.git', () => null)
    expect(remote).not.toBeNull()
    expect(sameRepo(remote!, { ...widgets, host: 'github.com' })).toBe(true)
  })
})
