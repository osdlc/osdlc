/**
 * List an owner's repositories, read one, and search pull requests across
 * repositories. Each list says when its limit cut it short.
 */

import { expect, test } from 'vitest'

import {
  Gh,
  REPO_FIELDS,
  SEARCH_PR_FIELDS,
  repoList,
  repoView,
  searchPrs,
  type CommandRunner,
  type PrSearchHit,
  type RepoListOptions,
  type Repository,
  type RepositoryVisibility,
  type SearchPrsOptions,
} from '@osdlc/typed-gh'

const answering = (stdout: string): CommandRunner => ({
  run: () => ({ exitCode: 0, stdout, stderr: '' }),
})

test("list an owner's repositories, and see when the list was cut short", () => {
  const rows = [
    { nameWithOwner: 'acme/widgets', defaultBranchRef: { name: 'main' }, visibility: 'PUBLIC' },
    { nameWithOwner: 'acme/gadgets', defaultBranchRef: { name: 'trunk' }, visibility: 'PRIVATE' },
  ]
  const gh = new Gh('/repo', { runner: answering(JSON.stringify(rows)) })
  const opts: RepoListOptions = { limit: 1, archived: false }

  const result = gh.repoList('acme', opts)
  const first: Repository | undefined = result?.rows[0]
  const visibility: RepositoryVisibility | null = first?.visibility ?? null

  expect(first?.defaultBranch).toBe('main')
  expect(visibility).toBe('PUBLIC')
  expect(result?.truncated).toBe(true)
  expect(repoList('acme', opts).argv).toContain('--no-archived')
})

test('read one repository by name, on an Enterprise host', () => {
  const runner = answering(JSON.stringify({ nameWithOwner: 'acme/widgets', isArchived: false }))
  const gh = new Gh('/repo', { runner, hostname: 'github.acme.com' })

  expect(gh.repoView('acme/widgets')?.name).toBe('widgets')
  expect(repoView('acme/widgets', REPO_FIELDS, { hostname: 'github.acme.com' }).argv[2]).toBe(
    'github.acme.com/acme/widgets',
  )
})

test('search pull requests across an organization', () => {
  const hits = [{ number: 7, state: 'merged', repository: { nameWithOwner: 'acme/widgets' } }]
  const gh = new Gh('/repo', { runner: answering(JSON.stringify(hits)) })
  const opts: SearchPrsOptions = { owner: 'acme', state: 'merged', limit: 50 }

  const found: PrSearchHit[] = gh.searchPrs('TICKET-123', opts)?.rows ?? []

  expect(found[0]?.state).toBe('MERGED')
  expect(found[0]?.repository).toEqual({ owner: 'acme', repo: 'widgets' })
  expect(searchPrs('TICKET-123', opts).argv).toContain(SEARCH_PR_FIELDS.join(','))
})
