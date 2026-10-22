/**
 * `repoList`, `repoView` and `searchPrs`: their argv, how they reach a host
 * gh gives them no flag for, and how their rows parse.
 */

import { describe, expect, test } from 'vitest'

import {
  AsyncGh,
  Gh,
  REPO_FIELDS,
  SEARCH_PR_FIELDS,
  repoList,
  repoView,
  searchPrs,
  type CommandResult,
  type CommandRunOptions,
} from '../src/index.ts'
import { parsePrSearchHit, parseRepository } from '../src/parse.ts'

const out = (body: unknown): CommandResult => ({
  exitCode: 0,
  stdout: JSON.stringify(body),
  stderr: '',
})
const FAIL: CommandResult = { exitCode: 1, stdout: '', stderr: 'boom' }

describe('repoList', () => {
  test('lists the owner with the repository fields and limit + 1', () => {
    expect(repoList('acme').argv).toEqual([
      'repo',
      'list',
      'acme',
      '--json',
      REPO_FIELDS.join(','),
      '--limit',
      '101',
    ])
  })

  test('archived, visibility and a field subset', () => {
    const argv = repoList('acme', { archived: true, visibility: 'internal', fields: ['url'] }).argv
    expect(argv).toContain('--archived')
    expect(argv.slice(argv.indexOf('--visibility'), argv.indexOf('--visibility') + 2)).toEqual([
      '--visibility',
      'internal',
    ])
    expect(argv[argv.indexOf('--json') + 1]).toBe('nameWithOwner,url')
  })

  test('the host goes in GH_HOST, since gh repo list has no host flag', () => {
    expect(repoList('acme', {}, { hostname: 'ghe.acme.com' }).env).toEqual({
      GH_HOST: 'ghe.acme.com',
    })
    expect(repoList('acme').env).toBeUndefined()
  })

  test('parses rows, drops one without nameWithOwner, and reports truncation', () => {
    const verb = repoList('acme', { limit: 1 })
    const result = verb.parse(out([{ nameWithOwner: 'acme/a' }, { nameWithOwner: 'acme/b' }]))
    expect(result?.rows.map((r) => r.name)).toEqual(['a'])
    expect(result?.truncated).toBe(true)
    expect(repoList('acme').parse(out([{ name: 'x' }]))).toEqual({ rows: [], truncated: false })
    expect(verb.parse(FAIL)).toBeNull()
  })

  test('an owner that reads as a flag throws RangeError', () => {
    expect(() => repoList('--web')).toThrow(RangeError)
  })
})

describe('repoView', () => {
  test('names the repo, the target repo, or nothing for the clone', () => {
    expect(repoView('acme/widgets').argv.slice(0, 3)).toEqual(['repo', 'view', 'acme/widgets'])
    expect(repoView(undefined, REPO_FIELDS, { repo: 'acme/x', hostname: 'h.io' }).argv[2]).toBe(
      'h.io/acme/x',
    )
    expect(repoView().argv.slice(0, 3)).toEqual(['repo', 'view', '--json'])
  })

  test('parses one repository, null when gh failed', () => {
    const verb = repoView('acme/widgets')
    expect(verb.parse(out({ nameWithOwner: 'acme/widgets' }))?.owner).toBe('acme')
    expect(verb.parse(FAIL)).toBeNull()
    expect(verb.parse({ exitCode: 0, stdout: 'nope', stderr: '' })).toBeNull()
  })

  test('a repo that is not owner/name throws RangeError', () => {
    expect(() => repoView('widgets')).toThrow(RangeError)
  })
})

describe('searchPrs', () => {
  test('flags first, then the query after --', () => {
    expect(searchPrs('-label:bug', { owner: 'acme', state: 'open', limit: 10 }).argv).toEqual([
      'search',
      'prs',
      '--owner',
      'acme',
      '--state',
      'open',
      '--json',
      SEARCH_PR_FIELDS.join(','),
      '--limit',
      '11',
      '--',
      '-label:bug',
    ])
  })

  test('merged is --merged; repo narrows; an empty query is left off', () => {
    const argv = searchPrs('', { repo: 'acme/widgets', state: 'merged' }).argv
    expect(argv).toContain('--merged')
    expect(argv).not.toContain('--state')
    expect(argv).not.toContain('--')
    expect(argv[argv.indexOf('--repo') + 1]).toBe('acme/widgets')
  })

  test('the host goes in GH_HOST; the target repo is not used', () => {
    const verb = searchPrs('x', {}, { repo: 'acme/widgets', hostname: 'ghe.acme.com' })
    expect(verb.env).toEqual({ GH_HOST: 'ghe.acme.com' })
    expect(verb.argv).not.toContain('--repo')
  })

  test('bad owner, repo or limit throw RangeError', () => {
    expect(() => searchPrs('x', { owner: '-x' })).toThrow(RangeError)
    expect(() => searchPrs('x', { repo: 'nope' })).toThrow(RangeError)
    expect(() => searchPrs('x', { limit: 0 })).toThrow(RangeError)
  })
})

describe('parsers', () => {
  test('parseRepository fills every field it was not given', () => {
    expect(parseRepository({ nameWithOwner: 'acme/widgets' })).toEqual({
      nameWithOwner: 'acme/widgets',
      owner: 'acme',
      name: 'widgets',
      description: '',
      defaultBranch: null,
      visibility: null,
      isArchived: false,
      url: '',
    })
    for (const bad of [null, {}, { nameWithOwner: 'nope' }, { nameWithOwner: '/x' }]) {
      expect(parseRepository(bad)).toBeNull()
    }
  })

  test('parsePrSearchHit upper-cases state and reads the repository', () => {
    const hit = parsePrSearchHit({
      number: 7,
      state: 'open',
      author: { login: 'dependabot[bot]' },
      repository: { name: 'widgets', nameWithOwner: 'acme/widgets' },
    })
    expect(hit?.state).toBe('OPEN')
    expect(hit?.repository).toEqual({ owner: 'acme', repo: 'widgets' })
    expect(hit?.author).toEqual({ login: 'dependabot', isBot: true })
    expect(parsePrSearchHit({ number: 7 })?.repository).toBeNull()
    expect(parsePrSearchHit({ title: 'no number' })).toBeNull()
  })
})

describe('the clients pass the env through', () => {
  test('Gh and AsyncGh set GH_HOST on the child for a search', async () => {
    const seen: Pick<CommandRunOptions, 'env'>[] = []
    const gh = new Gh('/repo', {
      hostname: 'ghe.acme.com',
      runner: {
        run(_argv, opts) {
          seen.push(opts)
          return out([])
        },
      },
    })
    const agh = new AsyncGh('/repo', {
      hostname: 'ghe.acme.com',
      runner: {
        async run(_argv, opts) {
          seen.push(opts)
          return out([])
        },
      },
    })
    expect(gh.searchPrs('x')).toEqual({ rows: [], truncated: false })
    await agh.repoList('acme')
    await agh.soft.repoView('acme/widgets')
    expect(seen.map((o) => o.env)).toEqual([
      { GH_HOST: 'ghe.acme.com' },
      { GH_HOST: 'ghe.acme.com' },
      undefined,
    ])
  })
})
