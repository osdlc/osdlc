import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'

import { defaultAnalyzers } from './analysis/complexity.ts'
import { typeScriptAt } from './analysis/typescript.ts'
import {
  buildPackageMap,
  manifestTest,
  type PackageMap,
  type PackageMapOptions,
} from './describe/packages.ts'
import {
  PACKAGES_SECTION,
  renderDescription,
  renderPackageMap,
  renderRisk,
  RISK_SECTION,
} from './describe/render.ts'
import { parseDiff, type FileDiff } from './diff/parse.ts'
import { CodeStatsError, guardCommand } from './error.ts'
import { readAt, streamObjects } from './git/blobs.ts'
import { readDiff, resolveChange, resolveCommit } from './git/change.ts'
import { openRepo, type Repo, type Runners } from './git/repo.ts'
import { linguistAttributes, listTree, type TreeFile } from './git/tree.ts'
import { readFiles } from './files/read.ts'
import { posix, relativeWithin } from './paths.ts'
import { buildCountReport, type CountFile, type CountOptions } from './report/count.ts'
import { reportOfFiles, type DiffContent, type DiffOptions } from './report/diff.ts'
import { emptyPathsNote } from './report/notes.ts'
import type { CompareReport, CountReport, DiffReport } from './report/schema.ts'
import { renderDiff } from './report/render.ts'
import { spliceSection, STATS_SECTION } from './report/splice.ts'
import type { Change, ChangeSpec, FileContent, LinguistAttributes } from './types.ts'

/** What every call that reads a repository takes. */
export interface RepoOptions {
  /** A directory inside the repository; paths given are relative to it. */
  cwd: string
  /** Replacements for the `git` and `gh` runners, for a caller that wraps or fakes them. */
  runners?: Runners
  /** Files larger than this are not read. Default 2 MB. */
  maxBytes?: number
  /** Honour linguist attributes in `.gitattributes`. Default true. */
  linguist?: boolean
}

/** Options for {@link countTree}: the repository, the revision and the paths, and the report's {@link CountOptions}. */
export interface CountTreeOptions extends RepoOptions, CountOptions {
  /** The revision to count. Default `HEAD`. */
  rev?: string
  /** Files or directories, relative to `cwd`; absent or empty is the whole tree. */
  paths?: readonly string[]
}

/** `paths` relative to `cwd`, made relative to the repository root, which git and reports use. */
function fromRoot(root: string, cwd: string, paths: readonly string[]): string[] {
  if (paths.length === 0) return []
  // `.native` expands what the JS walk leaves: on Windows an 8.3 short name such as `RUNNER~1`
  // and the drive-letter case, which git's root has in its long, canonical form.
  const from = realpathSync.native(cwd)
  const top = realpathSync.native(root)
  return paths.map((p) => {
    const rel = relativeWithin(top, p, from)
    if (rel === null) {
      throw new CodeStatsError(`${p} is outside the repository`, { kind: 'bad-input' })
    }
    return rel
  })
}

function attributesOf(
  repo: Repo,
  options: RepoOptions,
  paths: readonly string[],
  rev: string | null,
): Map<string, LinguistAttributes> {
  return options.linguist === false ? new Map() : linguistAttributes(repo, paths, rev)
}

/** The tree's files as {@link buildCountReport} asks for them, read one `cat-file` batch at a time. */
function* treeFiles(
  repo: Repo,
  tree: readonly TreeFile[],
  attributes: ReadonlyMap<string, LinguistAttributes>,
  maxBytes: number | undefined,
): Generator<CountFile> {
  let k = 0
  for (const [, content] of streamObjects(
    repo,
    tree.map((f) => f.sha),
    maxBytes,
  )) {
    const { path } = tree[k++]!
    yield { path, content, attributes: attributes.get(path) }
  }
}

/**
 * Lines by kind, language and group for every file of a commit, read from
 * git. To count the files on disk, with or without git, use
 * {@link countDirectory}.
 */
export function countTree(options: CountTreeOptions): CountReport {
  const repo = openRepo(options.cwd, options.runners)
  const paths = fromRoot(repo.root, options.cwd, options.paths ?? [])
  const rev = options.rev ?? 'HEAD'
  const commit = resolveCommit(repo, rev)
  const tree = listTree(repo, commit, paths)
  const files = tree.map((f) => f.path)
  const attributes = attributesOf(repo, options, files, commit)
  const report = buildCountReport(
    { label: rev, commit },
    paths,
    treeFiles(repo, tree, attributes, options.maxBytes),
    options,
  )
  const note = emptyPathsNote(paths, files)
  if (note !== null) report.notes.push(note)
  return report
}

/** Options for {@link diffChange} and {@link compareChanges}: the repository and the report's {@link DiffOptions}. */
export type DiffChangeOptions = RepoOptions & DiffOptions

function changeContent(repo: Repo, change: Change, options: RepoOptions): DiffContent | null {
  const base = change.base
  if (base === null) return null
  const { maxBytes } = options
  const head = change.head
  return {
    base: (paths) => readAt(repo, base, paths, maxBytes),
    head: (paths) =>
      head === null ? readFiles(repo.root, paths, maxBytes) : readAt(repo, head, paths, maxBytes),
    attributes: (paths) => attributesOf(repo, options, paths, head),
  }
}

/** A change's report with what it was built from: the repository, the resolved change and its diff. */
export interface MeasuredChange {
  repo: Repo
  change: Change
  /** The diff the report counts, read once. */
  files: FileDiff[]
  report: DiffReport
  /**
   * The file texts the report read: `base` keyed by each file's path at the
   * base (its old path when renamed), `head` by its new path. Empty when the
   * change's commits are not in the checkout.
   */
  texts: { base: ReadonlyMap<string, FileContent>; head: ReadonlyMap<string, FileContent> }
}

/** Options for {@link measureChange}: {@link DiffChangeOptions} and whether a change with no commits here is refused. */
export type MeasureChangeOptions = DiffChangeOptions & {
  /** Fail before reading the diff when the change's commits are not in the checkout. */
  requireCommits?: boolean
}

/** `content` with every text it hands out kept, so a caller can read the same texts again. */
function remembering(content: DiffContent | null): {
  content: DiffContent | null
  texts: MeasuredChange['texts']
} {
  const base = new Map<string, FileContent>()
  const head = new Map<string, FileContent>()
  if (content === null) return { content, texts: { base, head } }
  const keep = (into: Map<string, FileContent>, read: Map<string, FileContent>) => {
    for (const [path, c] of read) into.set(path, c)
    return read
  }
  return {
    content: {
      base: (paths) => keep(base, content.base(paths)),
      head: (paths) => keep(head, content.head(paths)),
      attributes: (paths) => content.attributes(paths),
    },
    texts: { base, head },
  }
}

function measured(
  repo: Repo,
  spec: ChangeSpec | null,
  options: MeasureChangeOptions,
): MeasuredChange {
  const change = resolveChange(repo, spec)
  if (options.requireCommits === true && change.base === null) {
    const fetch =
      change.pr === null ? 'fetch them' : `run \`gh pr checkout ${change.pr}\` or fetch them`
    throw new CodeStatsError(
      `the commits of ${change.label} are not in this checkout; ${fetch} first`,
      {
        kind: 'failed',
      },
    )
  }
  const typescript = options.typescript === undefined ? typeScriptAt(repo.root) : options.typescript
  const analyzers = options.analyzers ?? defaultAnalyzers(typescript)
  const files = parseDiff(readDiff(repo, change))
  const { content, texts } = remembering(changeContent(repo, change, options))
  const report = reportOfFiles(change, files, content, { ...options, typescript, analyzers })
  return { repo, change, files, report, texts }
}

function measure(repo: Repo, spec: ChangeSpec | null, options: DiffChangeOptions): DiffReport {
  return measured(repo, spec, options).report
}

/**
 * {@link diffChange} for a caller that reads more of the same change: the
 * report with the repository it opened and the diff it read, so the caller's
 * own reads describe the diff the report counts.
 */
export function measureChange(
  spec: ChangeSpec | null,
  options: MeasureChangeOptions,
): MeasuredChange {
  return measured(openRepo(options.cwd, options.runners), spec, options)
}

/**
 * Statistics for one change; with no spec, the current branch against the
 * remote's default branch (`origin/HEAD`, else `origin/main`). Unless
 * `typescript` is given (`null` for none), the measured project's own
 * `typescript` is loaded for the API and complexity passes, the first time a
 * TypeScript or JavaScript file needs it. Unless `analyzers` is given,
 * complexity is scored by {@link defaultAnalyzers}.
 */
export function diffChange(spec: ChangeSpec | null, options: DiffChangeOptions): DiffReport {
  return measureChange(spec, options).report
}

/** Two changes measured the same way, side by side. */
export function compareChanges(
  a: ChangeSpec,
  b: ChangeSpec,
  options: DiffChangeOptions,
): CompareReport {
  const repo = openRepo(options.cwd, options.runners)
  return { schema: 1, a: measure(repo, a, options), b: measure(repo, b, options) }
}

/** Rewrites PR `pr`'s body with `edit`; false when that left it as it was. */
function editPrBody(
  pr: number,
  edit: (body: string) => string,
  options: Pick<RepoOptions, 'cwd' | 'runners'>,
): boolean {
  const repo = openRepo(options.cwd, options.runners)
  // Read here, just before the write, not in resolveChange's `gh pr view`: a body read
  // that early would undo an edit made while the change was measured.
  const view = guardCommand(
    `could not read PR #${pr}`,
    () => repo.gh.prView(pr, { fields: ['number', 'body'] }),
    'gh',
  )
  if (view === null) throw new CodeStatsError(`no PR #${pr}`, { kind: 'bad-input' })
  const body = edit(view.body)
  if (body === view.body) return false
  guardCommand(`could not write PR #${pr}`, () => repo.gh.editPr(pr, { body }), 'gh')
  return true
}

/**
 * Splices the statistics `block` into PR `pr`'s body (see
 * {@link spliceSection}); false when the body already held it.
 */
export function writePrBody(
  pr: number,
  block: string,
  options: Pick<RepoOptions, 'cwd' | 'runners'>,
): boolean {
  return editPrBody(pr, (body) => spliceSection(body, block, STATS_SECTION), options)
}

/** A PR description: the data it was built from and the Markdown rendered from it. */
export interface Description {
  /** The change's statistics, as {@link diffChange} reports them. */
  report: DiffReport
  /** The packages the change touches and their direct dependents. */
  packages: PackageMap
  /** The whole description, for a PR that has none yet. */
  markdown: string
}

/** Options for {@link describeChange}: {@link DiffChangeOptions} and {@link PackageMapOptions}. */
export type DescribeOptions = DiffChangeOptions & PackageMapOptions

type ManifestGraph = typeof import('@osdlc/system-model/build')
type ManifestInfo = Awaited<ReturnType<ManifestGraph['walkManifests']>>[number]

/** The working tree's manifests that git lists, or would list: git-ignored ones are left out. */
async function worktreeManifests(
  lib: ManifestGraph,
  repo: Repo,
  isManifest: (path: string) => boolean,
): Promise<ManifestInfo[]> {
  const listed = guardCommand('could not list the working tree', () =>
    repo.git.lsFiles({ cached: true, others: true, excludeStandard: true }),
  )
  const manifests = new Set(listed.filter(isManifest))
  return (await lib.walkManifests(repo.root)).filter((m) =>
    manifests.has(posix(relative(repo.root, m.path))),
  )
}

/**
 * The manifests of commit `rev`. The library reads a folder, so they are
 * written to a scratch folder at their paths and read there.
 */
async function manifestsAt(
  lib: ManifestGraph,
  repo: Repo,
  rev: string,
  isManifest: (path: string) => boolean,
): Promise<ManifestInfo[]> {
  const paths = listTree(repo, rev, [])
    .map((f) => f.path)
    .filter(isManifest)
  const contents = readAt(repo, rev, paths, undefined)
  const dir = mkdtempSync(join(tmpdir(), 'code-stats-manifests-'))
  try {
    for (const path of paths) {
      const content = contents.get(path)
      if (content?.kind !== 'text') continue
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      writeFileSync(join(dir, path), content.text)
    }
    return await lib.walkManifests(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * A PR description for a change: {@link diffChange}'s report, the map of
 * packages it touches, and the risk signals, rendered by
 * {@link renderDescription}. Packages and their dependencies come from the
 * manifests at the change's head commit, read by `@osdlc/system-model`,
 * so the map is the PR's own wherever it is run. A working-tree change, or a
 * PR whose commits are not here, reads the working tree's instead, leaving
 * out git-ignored ones. Packages the base commit had and the head does not
 * are added from the base, so a deleted package keeps its name.
 */
export async function describeChange(
  spec: ChangeSpec | null,
  options: DescribeOptions,
): Promise<Description> {
  const repo = openRepo(options.cwd, options.runners)
  const report = measure(repo, spec, options)
  const lib = await import('@osdlc/system-model/build')
  const isManifest = manifestTest(lib.MANIFEST_FILES)
  const { base, head } = report.change
  const manifests =
    head === null
      ? await worktreeManifests(lib, repo, isManifest)
      : await manifestsAt(lib, repo, head, isManifest)
  const graph = lib.buildDependencyGraph(manifests, { includeExternal: false })
  const dirOf = new Map(graph.nodes.map((n) => [n.id, n.dir]))
  const dependencies = graph.edges.flatMap((e) => {
    const from = dirOf.get(e.from)
    const to = dirOf.get(e.to)
    return from == null || to == null ? [] : [{ from, to }]
  })
  // Only a manifest the change deletes or renames away can leave the base a package the head lacks.
  const lost = report.fileList.some((f) =>
    f.status === 'deleted' ? isManifest(f.path) : f.oldPath !== null && isManifest(f.oldPath),
  )
  const present = new Set(manifests.map((m) => m.dir))
  const deleted =
    base === null || !lost
      ? []
      : (await manifestsAt(lib, repo, base, isManifest)).filter((m) => !present.has(m.dir))
  const packages = buildPackageMap(report, [...manifests, ...deleted], dependencies, options)
  return { report, packages, markdown: renderDescription(report, packages) }
}

/**
 * The description written into `body`: the whole of it into an empty body,
 * else only the generated blocks (statistics, packages, risk), each replaced
 * in place or added under its heading, so the author's text stays as it is.
 */
export function spliceDescription(body: string, description: Description): string {
  if (body.trim() === '') return description.markdown
  let next = spliceSection(body, renderDiff(description.report), STATS_SECTION)
  next = spliceSection(next, renderPackageMap(description.packages), PACKAGES_SECTION)
  return spliceSection(next, renderRisk(description.report), RISK_SECTION)
}

/** Writes `description` into PR `pr`'s body (see {@link spliceDescription}). */
export function writeDescription(
  pr: number,
  description: Description,
  options: Pick<RepoOptions, 'cwd' | 'runners'>,
): boolean {
  return editPrBody(pr, (body) => spliceDescription(body, description), options)
}
