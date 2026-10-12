#!/usr/bin/env node
/**
 * review-state.mjs — the per-PR review state that review-pr and check-pr share.
 *
 * One ref per PR on the remote, `refs/review-pr/<pr>`. Each commit on it holds
 * a single `state.json`; its parent is the previous state commit, so the ref's
 * history is the audit log and the commit message names the event. The PR is
 * the record; this ref is an index over it that a skill rebuilds from the PR
 * when it is missing or stale (`rebuild`).
 *
 * Every write is compare-and-swap: fetch the ref, compute the new state, push
 * with `--force-with-lease=<ref>:<old>`. A lost race refetches and recomputes
 * once, then exits 3.
 *
 * Needs only node 22+ (or bun) and git. It never calls `gh`; \`from-pr\` parses JSON that
 * the caller fetched with it, so the parsing stays deterministic and testable.
 *
 * Exit codes: 0 ok, 1 failure, 2 usage, 3 lost a race, 4 claimed by someone else.
 * Every subcommand prints one JSON value to stdout.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const USAGE = `usage:
  review-state.mjs read <pr> [--remote origin]
  review-state.mjs claim <pr> --owner <session> [--stale-min 60]
  review-state.mjs record <pr> --owner <session> --head <sha> --base <sha> --findings <file.json> [--stale-min 60]
  review-state.mjs answer <pr> --id <finding-id> --status fixed|declined [--reason <text>] [--fixed-in <sha>]
  review-state.mjs release <pr> --owner <session>
  review-state.mjs archive <pr>
  review-state.mjs rebuild <pr> --from <file.json>
  review-state.mjs from-pr <pr> --reviews <file.json> --comments <file.json> --me <login> --author <login> [--out <file>]
every subcommand takes --remote <name-or-url> (default origin) and prints JSON.
flags take a value: \`--flag value\` or \`--flag=value\`.
exit: 0 ok, 1 failure, 2 usage, 3 lost a race, 4 claimed by someone else`

class Exit extends Error {
  constructor(code, message, extra = {}) {
    super(message)
    this.code = code
    this.extra = extra
  }
}

const IDENT = { name: 'review-pr', email: 'review-pr@local' }

/** Run git with an argv array; returns { ok, out, err }. Never throws on non-zero. LC_ALL=C keeps the error text matchable. */
function git(args, { input, env } = {}) {
  try {
    const out = execFileSync('git', args, {
      input,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, LC_ALL: 'C', ...env },
    })
    return { ok: true, out: out.trim(), err: '' }
  } catch (e) {
    return { ok: false, out: '', err: String(e.stderr ?? e.message).trim() }
  }
}

function gitOrDie(args, opts) {
  const r = git(args, opts)
  if (!r.ok) throw new Exit(1, `git ${args[0]} failed: ${r.err}`)
  return r.out
}

/**
 * Outside a git repository every git call would fail, even with --remote <url>. Point git at a
 * cached bare repository under the temp dir instead; it only holds the state refs and objects.
 */
function ensureWorkRepo() {
  if (git(['rev-parse', '--git-dir']).ok) return
  const dir = join(tmpdir(), 'review-state-git')
  if (!existsSync(join(dir, 'HEAD'))) gitOrDie(['init', '--bare', '--quiet', dir])
  process.env.GIT_DIR = dir
}

const liveRef = (pr) => `refs/review-pr/${pr}`
const archiveRef = (pr) => `refs/review-pr/archive/${pr}`

/** Fetch the live ref into the local one. Returns the commit sha, or null when the remote has none. */
function fetchState(remote, pr) {
  const ref = liveRef(pr)
  const r = git(['fetch', '--quiet', remote, `+${ref}:${ref}`])
  if (r.ok) return gitOrDie(['rev-parse', ref])
  if (/couldn't find remote ref/i.test(r.err)) {
    git(['update-ref', '-d', ref])
    return null
  }
  throw new Exit(1, `fetch failed: ${r.err}`)
}

/** Read state.json at a commit. Corrupt state is an error, unless `tolerant` (rebuild), which gets null. */
function readState(sha, tolerant = false) {
  if (!sha) return null
  try {
    const state = JSON.parse(gitOrDie(['show', `${sha}:state.json`]))
    if (!state || typeof state !== 'object' || !Array.isArray(state.findings))
      throw new Error('shape')
    return state
  } catch {
    if (tolerant) return null
    throw new Exit(1, 'corrupt state; run rebuild')
  }
}

function emptyState(pr) {
  return { schema: 1, pr, head: null, base: null, round: 0, claim: null, findings: [] }
}

/** Write state as a commit on top of `parents` (none = root commit). Returns the new sha. */
function commitState(state, parents, message) {
  const blob = gitOrDie(['hash-object', '-w', '--stdin'], {
    input: JSON.stringify(state, null, 2) + '\n',
  })
  const tree = gitOrDie(['mktree'], { input: `100644 blob ${blob}\tstate.json\n` })
  const env = {
    GIT_AUTHOR_NAME: IDENT.name,
    GIT_AUTHOR_EMAIL: IDENT.email,
    GIT_COMMITTER_NAME: IDENT.name,
    GIT_COMMITTER_EMAIL: IDENT.email,
  }
  const parentArgs = [parents]
    .flat()
    .filter(Boolean)
    .flatMap((p) => ['-p', p])
  return gitOrDie(['commit-tree', tree, ...parentArgs, '-m', message], { env })
}

// Only compare-and-swap rejections are a lost race: the client-side lease check
// ("stale info", "fetch first", "already exists") and the server-side one when
// another writer moved the ref between the advertisement and the update
// ("cannot lock ref", "failed to update ref"). A hook rejection or a permission
// error is none of these and stays a failure.
const isLostRace = (err) =>
  /stale info|fetch first|already exists|cannot lock ref|failed to update ref/i.test(err)

/**
 * Compare-and-swap push of `sha` onto `ref`, expecting the remote to hold `old`
 * (null = absent). Returns true on success, false on a lost race.
 */
function casPush(remote, ref, old, sha) {
  const r = git([
    'push',
    '--quiet',
    `--force-with-lease=${ref}:${old ?? ''}`,
    remote,
    `${sha}:${ref}`,
  ])
  if (r.ok) return true
  if (isLostRace(r.err)) return false
  throw new Exit(1, `push failed: ${r.err}`)
}

/**
 * Fetch, apply `fn(state|null)`, push. `fn` returns { state, out } to write or
 * { out } alone to skip the write. A lost race refetches and recomputes once.
 */
function mutate(remote, pr, event, fn, { tolerant = false } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const old = fetchState(remote, pr)
    const result = fn(readState(old, tolerant))
    if (!result.state) return result.out
    const sha = commitState(result.state, old, `${event} #${pr}`)
    if (casPush(remote, liveRef(pr), old, sha)) {
      // The push landed; a local failure here must not make a caller retry and write twice.
      git(['update-ref', liveRef(pr), sha])
      return result.out
    }
  }
  throw new Exit(3, `lost the race for ${liveRef(pr)} twice`)
}

function readJsonFile(path, what) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    throw new Exit(1, `cannot read ${what} ${path}: ${e.message}`)
  }
}

function parseArgs(argv) {
  const positional = []
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      if (eq > 0) flags[a.slice(2, eq)] = a.slice(eq + 1)
      else {
        const v = argv[i + 1]
        if (v === undefined) throw new Exit(2, `${a} needs a value`)
        flags[a.slice(2)] = v
        i++
      }
    } else positional.push(a)
  }
  return { positional, flags }
}

function need(flags, ...names) {
  for (const n of names) if (!flags[n]) throw new Exit(2, `missing --${n}`)
}

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)
const optStr = (x) => x === undefined || x === null || typeof x === 'string'

function staleMsOf(flags) {
  const ms = Number(flags['stale-min'] ?? 60) * 60_000
  if (!Number.isFinite(ms) || ms < 0) throw new Exit(2, '--stale-min must be a non-negative number')
  return ms
}

/** Exit 4 when a different owner holds a claim younger than staleMs. */
function refuseForeignClaim(state, owner, staleMs) {
  const c = state?.claim
  if (c && c.owner !== owner && Date.now() - Date.parse(c.at) < staleMs) {
    throw new Exit(4, `claimed by ${c.owner}`, { claim: c })
  }
}

// ---------------------------------------------------------------------------
// from-pr: rebuild input from what GitHub returned for a PR. Pure; no git, no network.
// ---------------------------------------------------------------------------

/**
 * Parse text holding one JSON value, several concatenated ones (what `gh api --paginate`
 * prints for arrays: `[..][..]`), or a `--slurp`ped array of arrays; return one flat array
 * of the elements.
 */
export function parseJsonArrays(text) {
  const out = []
  let i = 0
  const n = text.length
  while (i < n) {
    while (i < n && /\s/.test(text[i])) i++
    if (i >= n) break
    if (text[i] !== '[' && text[i] !== '{') throw new Error(`unexpected character at offset ${i}`)
    // Find the end of this top-level value, skipping over strings.
    let depth = 0
    let inStr = false
    let j = i
    for (; j < n; j++) {
      const c = text[j]
      if (inStr) {
        if (c === '\\') j++
        else if (c === '"') inStr = false
      } else if (c === '"') inStr = true
      else if (c === '[' || c === '{') depth++
      else if (c === ']' || c === '}') {
        depth--
        if (depth === 0) break
      }
    }
    if (depth !== 0) throw new Error('truncated JSON')
    const v = JSON.parse(text.slice(i, j + 1))
    i = j + 1
    out.push(v)
  }
  const flat = []
  const walk = (v) => (Array.isArray(v) ? v.forEach(walk) : flat.push(v))
  out.forEach(walk)
  return flat
}

const REVIEW_MARKER = /<!--\s*review-pr:\s*head=(\S+)\s+base=(\S+)[^>]*-->/g
const FINDING_MARKER = /<!--\s*review-pr:\s*finding=(r\d+-\d+)\s*-->/g
const idRound = (id) => Number(/^r(\d+)-/.exec(id)[1])
const timeOf = (x) => Date.parse(x.submitted_at ?? x.created_at ?? '') || 0

/** Drop the comment signature (`<sub>..</sub>`) and every HTML comment from a body. */
function stripSignature(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<sub>[\s\S]*?<\/sub>/g, '')
    .trim()
}

/**
 * A finding's title: its first non-empty line with list bullets, emphasis, code ticks and links
 * removed, a leading `Category:` label dropped, cut to 120 characters.
 */
function firstLine(text) {
  const line = text.split('\n').find((l) => l.trim()) ?? ''
  const plain = line
    .trim()
    .replace(/^(?:[-*]|\d+\.)\s+/, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]+/g, '')
    .trim()
    .replace(/^[A-Za-z][A-Za-z /-]{0,29}:\s+/, '')
  return plain.length > 120 ? `${plain.slice(0, 119).trimEnd()}\u2026` : plain
}

/**
 * Build the `rebuild --from` object from a PR's reviews and inline comments.
 * `me` is our login (reviews and findings are ours); replies from `me` or `author` answer findings.
 */
export function parseReviewState({ reviews, comments, me, author }) {
  const eq = (a, b) => (a ?? '').toLowerCase() === (b ?? '').toLowerCase()
  const ours = reviews.filter((r) => eq(r.user?.login, me))
  const marked = ours
    .map((r) => ({ r, m: [...(r.body ?? '').matchAll(REVIEW_MARKER)].at(-1) }))
    .filter((x) => x.m)
    .sort((a, b) => timeOf(a.r) - timeOf(b.r))
  const newest = marked.at(-1)

  const found = new Map() // id -> finding; an inline comment wins over a review body

  // Inline findings: top-level comments of ours carrying a finding marker.
  const threadRoot = new Map() // comment id -> finding id
  for (const c of comments) {
    if (!eq(c.user?.login, me) || c.in_reply_to_id != null) continue
    const m = [...(c.body ?? '').matchAll(FINDING_MARKER)].at(-1)
    if (!m || found.has(m[1])) continue
    threadRoot.set(c.id, m[1])
    found.set(m[1], {
      id: m[1],
      path: c.path ?? null,
      line: c.original_line ?? c.line ?? null,
      title: firstLine(stripSignature((c.body ?? '').slice(0, m.index))),
      comment: c.html_url ?? null,
      status: 'open',
      reason: null,
      fixedIn: null,
    })
  }

  // Findings in a review body: the paragraph in front of each marker.
  for (const r of ours) {
    const body = r.body ?? ''
    for (const m of body.matchAll(FINDING_MARKER)) {
      if (found.has(m[1])) continue
      const before = stripSignature(body.slice(0, m.index))
      const para = before.split(/\n\s*\n/).at(-1) ?? ''
      const loc = /`?([^\s`:]+\.[A-Za-z0-9]+):(\d+)`?/.exec(para)
      const title = firstLine(para)
        .replace(/^`?[^\s`:]+\.[A-Za-z0-9]+:\d+`?\s*[:—–-]*\s*/, '')
        .trim()
      found.set(m[1], {
        id: m[1],
        path: loc ? loc[1] : null,
        line: loc ? Number(loc[2]) : null,
        title,
        comment: r.html_url ?? null,
        status: 'open',
        reason: null,
        fixedIn: null,
      })
    }
  }

  // Replies decide status. The latest answering reply from us or the author wins.
  const replies = comments
    .filter(
      (c) =>
        c.in_reply_to_id != null &&
        threadRoot.has(c.in_reply_to_id) &&
        (eq(c.user?.login, me) || eq(c.user?.login, author)),
    )
    .sort((a, b) => timeOf(a) - timeOf(b) || a.id - b.id)
  for (const c of replies) {
    const f = found.get(threadRoot.get(c.in_reply_to_id))
    const text = stripSignature(c.body ?? '')
    const declined = /^declined:\s*([\s\S]*)$/i.exec(text)
    const fixed = /^fixed in\s+`?([0-9a-f]{7,40})\b/i.exec(text)
    if (declined) {
      f.status = 'declined'
      f.reason = declined[1].split(/\n\s*\n/)[0].trim() || null
      f.fixedIn = null
    } else if (fixed) {
      f.status = 'fixed'
      f.fixedIn = fixed[1]
      f.reason = null
    }
  }

  const findings = [...found.values()].sort((a, b) => {
    const [ra, ia] = a.id.slice(1).split('-').map(Number)
    const [rb, ib] = b.id.slice(1).split('-').map(Number)
    return ra - rb || ia - ib
  })
  const round = Math.max(marked.length, ...findings.map((f) => idRound(f.id)))
  return {
    head: newest?.m[1] ?? null,
    base: newest?.m[2] ?? null,
    round,
    findings,
  }
}

function readJsonArrays(path, what) {
  try {
    return parseJsonArrays(readFileSync(path, 'utf8'))
  } catch (e) {
    throw new Exit(1, `cannot read ${what} ${path}: ${e.message}`)
  }
}

const commands = {
  read(pr, flags) {
    const sha = fetchState(flags.remote, pr)
    const state = readState(sha)
    return state ? { exists: true, commit: sha, state } : { exists: false }
  },

  claim(pr, flags) {
    need(flags, 'owner')
    const staleMs = staleMsOf(flags)
    return mutate(flags.remote, pr, 'claim', (cur) => {
      const state = cur ?? emptyState(Number(pr))
      const c = state.claim
      refuseForeignClaim(state, flags.owner, staleMs)
      const tookOver = c && c.owner !== flags.owner ? c : null
      state.claim = { owner: flags.owner, at: new Date().toISOString() }
      return { state, out: { claimed: true, tookOver, claim: state.claim } }
    })
  },

  // record keeps the claim: the caller still holds the PR until the review is posted, then releases.
  record(pr, flags) {
    need(flags, 'owner', 'head', 'base', 'findings')
    const staleMs = staleMsOf(flags)
    const input = readJsonFile(flags.findings, 'findings')
    if (!Array.isArray(input)) throw new Exit(1, 'findings file must be a JSON array')
    input.forEach((f, i) => {
      const lineOk = f?.line === undefined || f?.line === null || Number.isInteger(f?.line)
      if (!isObj(f) || !optStr(f.path) || !optStr(f.title) || !optStr(f.comment) || !lineOk) {
        throw new Exit(
          1,
          `findings[${i}] must be an object with string path/title/comment and integer line`,
        )
      }
    })
    return mutate(flags.remote, pr, 'record', (cur) => {
      refuseForeignClaim(cur, flags.owner, staleMs)
      const state = cur ?? emptyState(Number(pr))
      state.round += 1
      state.head = flags.head
      state.base = flags.base
      const ids = input.map((f, i) => {
        const id = `r${state.round}-${i + 1}`
        state.findings.push({
          id,
          round: state.round,
          path: f.path ?? null,
          line: f.line ?? null,
          title: f.title ?? '',
          comment: f.comment ?? null,
          status: 'open',
          reason: null,
          fixedIn: null,
        })
        return { index: i, id }
      })
      return { state, out: { round: state.round, ids } }
    })
  },

  answer(pr, flags) {
    need(flags, 'id', 'status')
    if (!['fixed', 'declined'].includes(flags.status))
      throw new Exit(2, '--status must be fixed or declined')
    return mutate(flags.remote, pr, `answer ${flags.id}`, (cur) => {
      const f = cur?.findings.find((x) => x.id === flags.id)
      if (!f) throw new Exit(1, `unknown finding ${flags.id}`)
      f.status = flags.status
      f.reason = flags.reason ?? null
      f.fixedIn = flags['fixed-in'] ?? null
      return { state: cur, out: { id: f.id, status: f.status } }
    })
  },

  release(pr, flags) {
    need(flags, 'owner')
    return mutate(flags.remote, pr, 'release', (cur) => {
      if (!cur?.claim || cur.claim.owner !== flags.owner) return { out: { released: false } }
      cur.claim = null
      return { state: cur, out: { released: true } }
    })
  },

  rebuild(pr, flags) {
    need(flags, 'from')
    const src = readJsonFile(flags.from, 'rebuild file')
    if (!isObj(src) || (src.findings !== undefined && !Array.isArray(src.findings))) {
      throw new Exit(1, 'rebuild file must be an object with a findings array')
    }
    const input = src.findings ?? []
    input.forEach((f, i) => {
      if (!isObj(f) || typeof f.id !== 'string' || !/^r\d+-\d+$/.test(f.id)) {
        throw new Exit(1, `findings[${i}] needs an id like r2-1`)
      }
      if (f.status !== undefined && !['open', 'fixed', 'declined'].includes(f.status)) {
        throw new Exit(1, `findings[${i}].status must be open, fixed or declined`)
      }
    })
    return mutate(
      flags.remote,
      pr,
      'rebuild',
      (cur) => {
        // A finding the state already has keeps its recorded title (from-pr's is a body excerpt)
        // and its full fix sha when the rebuilt one is a prefix of it (a reply may say 7 chars).
        const prior = new Map((cur?.findings ?? []).map((x) => [x.id, x]))
        const findings = input.map((f) => {
          const p = prior.get(f.id)
          const keepSha =
            p?.fixedIn && f.fixedIn && p.fixedIn.toLowerCase().startsWith(f.fixedIn.toLowerCase())
          return {
            id: f.id,
            round: Number(/^r(\d+)-/.exec(f.id)[1]),
            path: f.path ?? null,
            line: f.line ?? null,
            title: p?.title || (f.title ?? ''),
            comment: f.comment ?? null,
            status: f.status ?? 'open',
            reason: f.reason ?? null,
            fixedIn: keepSha ? p.fixedIn : (f.fixedIn ?? null),
          }
        })
        const state = {
          ...emptyState(Number(pr)),
          head: src.head ?? null,
          base: src.base ?? null,
          // Never below the highest round in an id, or a later record would reuse ids.
          round: Math.max(Number(src.round) || 0, ...findings.map((f) => f.round)),
          claim: cur?.claim ?? null,
          findings,
        }
        return { state, out: { rebuilt: true, round: state.round, findings: findings.length } }
      },
      { tolerant: true },
    )
  },

  'from-pr'(pr, flags) {
    need(flags, 'reviews', 'comments', 'me', 'author')
    const result = parseReviewState({
      reviews: readJsonArrays(flags.reviews, 'reviews'),
      comments: readJsonArrays(flags.comments, 'comments'),
      me: flags.me,
      author: flags.author,
    })
    if (!flags.out) return result
    writeFileSync(flags.out, JSON.stringify(result, null, 2) + '\n')
    return { written: flags.out, round: result.round, findings: result.findings.length }
  },

  archive(pr, flags) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const old = fetchState(flags.remote, pr)
      if (!old) return { archived: false, reason: 'no live state' }
      const dest = archiveRef(pr)
      const lr = git(['ls-remote', flags.remote, dest])
      if (!lr.ok) throw new Exit(1, `ls-remote failed: ${lr.err}`)
      const prior = lr.out.split(/\s+/)[0] || null
      // An earlier archive keeps its history as the second parent.
      if (prior) gitOrDie(['fetch', '--quiet', flags.remote, `+${dest}:${dest}`])
      const sha = commitState(readState(old), [old, prior], `archive #${pr}`)
      if (!casPush(flags.remote, dest, prior, sha)) continue
      // The live ref is deleted only if nobody wrote to it since we read it.
      const del = git([
        'push',
        '--quiet',
        `--force-with-lease=${liveRef(pr)}:${old}`,
        flags.remote,
        `:${liveRef(pr)}`,
      ])
      if (!del.ok) {
        if (isLostRace(del.err)) continue
        throw new Exit(1, `delete failed: ${del.err}`)
      }
      git(['update-ref', dest, sha])
      git(['update-ref', '-d', liveRef(pr)])
      return { archived: true, ref: dest, commit: sha }
    }
    throw new Exit(3, `lost the race archiving #${pr} twice`)
  },
}

export function main(argv) {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    console.log(USAGE)
    return argv.length === 0 ? 2 : 0
  }
  try {
    const [cmd, ...rest] = argv
    if (!commands[cmd]) throw new Exit(2, `unknown subcommand ${cmd}`)
    const { positional, flags } = parseArgs(rest)
    const pr = positional[0]
    if (!/^[1-9]\d*$/.test(pr ?? ''))
      throw new Exit(2, 'the first argument must be a PR number without leading zeros')
    flags.remote ??= 'origin'
    if (['read', 'claim', 'record', 'answer', 'release', 'archive', 'rebuild'].includes(cmd))
      ensureWorkRepo()
    console.log(JSON.stringify(commands[cmd](pr, flags)))
    return 0
  } catch (err) {
    const e = err instanceof Exit ? err : new Exit(1, `unexpected error: ${err?.message ?? err}`)
    console.log(JSON.stringify({ error: e.message, ...e.extra }))
    console.error(e.message)
    if (e.code === 2) console.error(USAGE)
    return e.code
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2))
}
