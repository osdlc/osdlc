/**
 * `@osdlc/typed-gh/testing`: rows of `gh --json` output, for faking `gh` in
 * tests.
 *
 * A separate subpath, not part of the package entry, so production code does
 * not carry fixture data. Nothing in `src/` but this file knows about it.
 *
 * Each builder returns gh's raw JSON shape, what `gh … --json` prints
 * (`nameWithOwner`, `headRefName`, `defaultBranchRef: { name }`), not the
 * parsed model. Feed the rows to a fake runner through {@link ghResult} and
 * the real parsers read them, so a test exercises the same parsing a real
 * `gh` call does.
 *
 * The defaults fill every field the parsers require, which is where hand-made
 * rows go wrong: a row the parser rejects is dropped without an error.
 *
 *   - A pull request needs an integer `number` (`parsePullRequest`), and
 *     `prList({ head })` also keeps only rows whose `headRefName` equals
 *     `head`.
 *   - An issue and a search hit need a numeric `number`.
 *   - A repository needs `nameWithOwner` as `owner/name`, both parts
 *     non-empty (`parseRepository`).
 *   - A label needs a non-empty `name` (`parseLabels`).
 *   - A check needs a `name`, or a `context` for a legacy status context
 *     (`parseCheckRun`).
 *
 * Overrides merge shallowly: a field you pass replaces the default whole, and
 * a field you pass as `undefined` is left out of the row, to test a payload
 * that lacks it. A default that names another field (a pull request's `url`
 * names its `number`) follows your override of that field. The default
 * values may change in a minor release, as long as every parser still
 * accepts them, so assert on what you set, not on a default.
 */

import type { CommandResult } from '@osdlc/command-seam'

import type {
  CheckConclusion,
  MergeableState,
  MergeStateStatus,
  PullRequestState,
  RepositoryVisibility,
  ReviewState,
} from './types.ts'

/**
 * What a builder takes: any field of the row, or `undefined` to leave that
 * field out.
 */
export type RowOverrides<T> = { [K in keyof T]?: T[K] | undefined }

/** `defaults` with `overrides` merged over them. An `undefined` override drops the field. */
function build<T extends object>(defaults: T, overrides: RowOverrides<T>): T {
  const row = { ...defaults } as Record<string, unknown>
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete row[key]
    else row[key] = value
  }
  return row as T
}

const HOST = 'https://github.com'
const REPO = 'octo-org/hello-world'
const CREATED_AT = '2024-01-15T09:30:00Z'
const UPDATED_AT = '2024-01-16T14:05:00Z'
const HEAD_OID = '6dcb09b5b57875f334f61aebed695e2e4193db5e'

// ── the result ──────────────────────────────────────────────────────────────

/**
 * A successful `gh` call that printed `payload` as JSON: exit code 0, the
 * payload on stdout with gh's trailing newline, and nothing on stderr. Pass an
 * array of rows for a list verb and one row for a view verb.
 */
export function ghResult(payload: unknown): CommandResult {
  return { exitCode: 0, stdout: `${JSON.stringify(payload)}\n`, stderr: '' }
}

// ── actors, labels ──────────────────────────────────────────────────────────

/**
 * A pull request's or search hit's `author` as `gh --json` prints it. A bot
 * is `{ is_bot: true, login: 'app/<name>' }`.
 */
export interface GhActorJson {
  login: string
  is_bot?: boolean
  name?: string
  id?: string
}

/**
 * A comment's or review's `author` as `gh --json` prints it: only `login`.
 * gh leaves out `id`, `name` and `is_bot` there, so a bot comment does not
 * read as a bot unless its login ends in `[bot]`.
 */
export interface GhCommentAuthorJson {
  login: string
}

/** A new object each call, so a test that edits one row's author edits only that row. */
function octocat(): GhActorJson {
  return { id: 'MDQ6VXNlcjU4MzIzMQ==', is_bot: false, login: 'octocat', name: 'The Octocat' }
}

/** One entry of a `labels` field, or one row of `gh label list --json name,color,description`. */
export interface GhLabelJson {
  name: string
  /** Six hex digits, no `#`. */
  color: string
  description: string
}

/** A label row. The default is GitHub's own `bug` label. */
export function labelRow(overrides: RowOverrides<GhLabelJson> = {}): GhLabelJson {
  return build({ name: 'bug', color: 'd73a4a', description: "Something isn't working" }, overrides)
}

// ── checks, comments, reviews ───────────────────────────────────────────────

/** A modern `CheckRun` node of `statusCheckRollup`. */
export interface GhCheckRunJson {
  __typename: 'CheckRun'
  name: string
  workflowName: string
  /** `QUEUED`, `IN_PROGRESS` or `COMPLETED`. */
  status: string
  /** gh prints `""` while the check runs. */
  conclusion: Exclude<CheckConclusion, null> | ''
  detailsUrl: string
  startedAt: string
  completedAt: string
}

/** A check run. The default completed with `SUCCESS`, so it reads as a green check. */
export function checkRunRow(overrides: RowOverrides<GhCheckRunJson> = {}): GhCheckRunJson {
  return build<GhCheckRunJson>(
    {
      __typename: 'CheckRun',
      name: 'test',
      workflowName: 'CI',
      status: 'COMPLETED',
      conclusion: 'SUCCESS',
      detailsUrl: `${HOST}/${REPO}/actions/runs/1/job/1`,
      startedAt: CREATED_AT,
      completedAt: UPDATED_AT,
    },
    overrides,
  )
}

/** A legacy `StatusContext` node of `statusCheckRollup`. */
export interface GhStatusContextJson {
  __typename: 'StatusContext'
  context: string
  /** `SUCCESS`, `PENDING`, `FAILURE` or `ERROR`. */
  state: string
  targetUrl: string
  startedAt: string
}

/** A legacy status context. The default is a `SUCCESS`. */
export function statusContextRow(
  overrides: RowOverrides<GhStatusContextJson> = {},
): GhStatusContextJson {
  return build<GhStatusContextJson>(
    {
      __typename: 'StatusContext',
      context: 'ci/build',
      state: 'SUCCESS',
      targetUrl: 'https://ci.example.com/builds/1',
      startedAt: CREATED_AT,
    },
    overrides,
  )
}

/** One entry of a pull request's `comments`. */
export interface GhCommentJson {
  /** The GraphQL node id. */
  id: string
  author: GhCommentAuthorJson | null
  authorAssociation: string
  body: string
  createdAt: string
  url: string
}

/** A comment by `octocat`. */
export function commentRow(overrides: RowOverrides<GhCommentJson> = {}): GhCommentJson {
  return build<GhCommentJson>(
    {
      id: 'IC_kwDOAbCdEf5xYz12',
      author: { login: 'octocat' },
      authorAssociation: 'MEMBER',
      body: 'Looks good to me.',
      createdAt: UPDATED_AT,
      url: `${HOST}/${REPO}/pull/1#issuecomment-1`,
    },
    overrides,
  )
}

/** One entry of a pull request's `reviews`. */
export interface GhReviewJson {
  /** The GraphQL node id. */
  id: string
  author: GhCommentAuthorJson | null
  authorAssociation: string
  body: string
  state: ReviewState
  submittedAt: string
  commit: { oid: string }
}

/** An approving review by `octocat`. */
export function reviewRow(overrides: RowOverrides<GhReviewJson> = {}): GhReviewJson {
  return build<GhReviewJson>(
    {
      id: 'PRR_kwDOAbCdEf5xYz34',
      author: { login: 'octocat' },
      authorAssociation: 'MEMBER',
      body: '',
      state: 'APPROVED',
      submittedAt: UPDATED_AT,
      commit: { oid: HEAD_OID },
    },
    overrides,
  )
}

// ── pull requests ───────────────────────────────────────────────────────────

/** A pull request as `gh pr list`/`view --json` prints it, with every field the parser reads. */
export interface GhPrJson {
  /** Required: a row without an integer `number` is dropped. */
  number: number
  state: PullRequestState
  title: string
  body: string
  url: string
  isDraft: boolean
  baseRefName: string
  /** Required by `prList({ head })`, which keeps only rows whose head is exactly `head`. */
  headRefName: string
  headRefOid: string
  isCrossRepository: boolean
  mergeable: MergeableState
  mergeStateStatus: MergeStateStatus
  /** gh prints `""` when there is no decision. */
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | ''
  author: GhActorJson | null
  labels: GhLabelJson[]
  comments: GhCommentJson[]
  reviews: GhReviewJson[]
  statusCheckRollup: (GhCheckRunJson | GhStatusContextJson)[]
  mergedAt: string | null
  createdAt: string
  updatedAt: string
}

/**
 * An open, mergeable pull request #1 from `feature/add-retries` into `main`
 * of `octo-org/hello-world`, by `octocat`, with no labels, comments, reviews
 * or checks. Its `url` follows `number`.
 */
export function prRow(overrides: RowOverrides<GhPrJson> = {}): GhPrJson {
  const number = overrides.number ?? 1
  return build<GhPrJson>(
    {
      number,
      state: 'OPEN',
      title: 'Add retries to the fetch loop',
      body: 'Retries a failed fetch three times before giving up.',
      url: `${HOST}/${REPO}/pull/${number}`,
      isDraft: false,
      baseRefName: 'main',
      headRefName: 'feature/add-retries',
      headRefOid: HEAD_OID,
      isCrossRepository: false,
      mergeable: 'MERGEABLE',
      mergeStateStatus: 'CLEAN',
      reviewDecision: '',
      author: octocat(),
      labels: [],
      comments: [],
      reviews: [],
      statusCheckRollup: [],
      mergedAt: null,
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    },
    overrides,
  )
}

// ── issues ──────────────────────────────────────────────────────────────────

/** An issue as `gh issue list`/`view --json number,title,body,labels,state` prints it. */
export interface GhIssueJson {
  /** Required: a row without a numeric `number` is dropped. */
  number: number
  title: string
  body: string
  labels: GhLabelJson[]
  /** `OPEN` or `CLOSED`. */
  state: string
}

/** An open issue #1 with no labels. */
export function issueRow(overrides: RowOverrides<GhIssueJson> = {}): GhIssueJson {
  return build<GhIssueJson>(
    {
      number: 1,
      title: 'Fetch gives up after one failure',
      body: 'A single network error ends the whole sync.',
      labels: [],
      state: 'OPEN',
    },
    overrides,
  )
}

// ── repositories ────────────────────────────────────────────────────────────

/** A repository as `gh repo list`/`view --json` prints it, with every field the parser reads. */
export interface GhRepoJson {
  /** Required: `owner/name`, both parts non-empty, or the row is dropped. */
  nameWithOwner: string
  description: string
  /** `{ name: '' }` for an empty repository, as gh prints it. `null` parses the same. */
  defaultBranchRef: { name: string } | null
  visibility: RepositoryVisibility
  isArchived: boolean
  url: string
}

/** The public, unarchived `octo-org/hello-world` on `main`. Its `url` follows `nameWithOwner`. */
export function repoRow(overrides: RowOverrides<GhRepoJson> = {}): GhRepoJson {
  const nameWithOwner = overrides.nameWithOwner ?? REPO
  return build<GhRepoJson>(
    {
      nameWithOwner,
      description: 'My first repository on GitHub.',
      defaultBranchRef: { name: 'main' },
      visibility: 'PUBLIC',
      isArchived: false,
      url: `${HOST}/${nameWithOwner}`,
    },
    overrides,
  )
}

// ── search ──────────────────────────────────────────────────────────────────

/** A row of `gh search prs --json`, with every field the parser reads. */
export interface GhSearchPrJson {
  /** Required: a row without a numeric `number` is dropped. */
  number: number
  title: string
  /** Search answers in lower case: `open`, `closed` or `merged`. */
  state: string
  url: string
  isDraft: boolean
  repository: { name: string; nameWithOwner: string }
  author: GhActorJson | null
  labels: GhLabelJson[]
  createdAt: string
  updatedAt: string
  /**
   * gh prints `0001-01-01T00:00:00Z`, Go's zero time, for a hit that is not
   * closed. The parser reads that as `null`.
   */
  closedAt: string | null
}

/**
 * An open pull request #1 in `octo-org/hello-world`, as search returns it. Its
 * `url` follows `number` and `repository`.
 */
export function searchPrRow(overrides: RowOverrides<GhSearchPrJson> = {}): GhSearchPrJson {
  const number = overrides.number ?? 1
  const repository = overrides.repository ?? { name: 'hello-world', nameWithOwner: REPO }
  return build<GhSearchPrJson>(
    {
      number,
      title: 'Add retries to the fetch loop',
      state: 'open',
      url: `${HOST}/${repository.nameWithOwner}/pull/${number}`,
      isDraft: false,
      repository,
      author: { id: 'MDQ6VXNlcjU4MzIzMQ==', is_bot: false, login: 'octocat' },
      labels: [],
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
      closedAt: '0001-01-01T00:00:00Z',
    },
    overrides,
  )
}
