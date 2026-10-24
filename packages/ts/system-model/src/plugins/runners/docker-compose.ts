/**
 * Docker Compose (compose.yaml) — https://docs.docker.com/compose/
 *
 * `kind: "parse"`, and unlike just/go-task/gradle it is parse ONLY: this
 * runner never calls `ctx.runner()`. Compose's own listing —
 * `docker compose config --services` — is not a read. It resolves the file,
 * which means interpolating `${…}` from the environment and `.env`, following
 * `include:` and `extends:` into other files, and evaluating a Dockerfile
 * reference; and it hides any service behind a `profiles:` key, so it would
 * report FEWER services than the file declares. So the hand-written reader
 * below is the whole runner: every limitation it declares is permanent, not
 * lifted when the binary is present.
 *
 * FILENAME PRECEDENCE. Compose looks for four names and uses exactly one per
 * directory. The order was established EMPIRICALLY on this machine (Docker
 * 29.6.2, Compose plugin v5.3.1) by putting all four in one directory, running
 * `docker compose config --services`, and deleting the winner one at a time:
 *
 *     compose.yaml  >  compose.yml  >  docker-compose.yml  >  docker-compose.yaml
 *
 * Note the asymmetry — not a typo: for the `compose` prefix `.yaml` beats
 * `.yml`, and for the `docker-compose` prefix `.yml` beats `.yaml`. Compose's
 * own warning lists the candidates in that same order, and names its pick:
 *
 *     level=warning msg="Found multiple config files with supported names: …"
 *     level=warning msg="Using …/compose.yaml"
 *
 * This runner mirrors both: one file wins per directory, and a `warning`
 * diagnostic names the siblings it ignored. Files in DIFFERENT directories are
 * independent Compose projects and all count.
 *
 * THE READER'S CEILING. It reads:
 *   - the top-level `services:` key (block-style only) and the service names
 *     nested one level under it
 *   - each service's `image:`, `build:` scalar and `profiles:` key, one level
 *     under the service itself (deeper nesting — `ports:`, `environment:`, … —
 *     is not descended into)
 *   - `#` comments (outside quoted strings) and single/double-quoted keys and
 *     values
 *
 * It does NOT attempt, and emits a `warning` Diagnostic (source: the file)
 * when it detects one of these:
 *   - YAML anchors/aliases (`&`/`*`)
 *   - merge keys (`<<`)
 *   - multiple YAML documents — a `---` separator or a `...` end marker at
 *     column 0 that is not inside a block scalar; only the content before it
 *     is read
 *   - a flow-style `services:` mapping (`services: { ... }`) — nothing is read
 *   - `include:` and `extends:` pulling in other Compose files — services they
 *     contribute are never enumerated, only this file's own `services:`
 *
 * A `profiles:` key is a sixth diagnostic but NOT a limitation: see PROFILES.
 *
 * Two classes of file fall outside those diagnostics. First, a leading UTF-8
 * BOM: Compose accepts one, and left in place it would bind to the `services`
 * key and drop the whole file with no diagnostic, so it is stripped before
 * anything else reads the text. Second, files Compose itself REJECTS — a
 * `services:` given a block scalar, sibling keys at inconsistent indentation,
 * tab indentation. Those get no diagnostic and whatever the line scanner
 * happens to find, which may be nothing.
 *
 * The lexing layer lives in `yaml-lite.ts`, shared with `go-task.ts` and
 * `github-actions.ts`: BOM strip, comment strip, quoting, indent, block-scalar
 * masking, anchor/merge flagging, and truncation at the first document marker.
 * What stays here is the `services:` reader — the two-pass walk below — and
 * every diagnostic string, whose wording names Compose's own consequences.
 */

import type { ProviderContext } from '../../contract.ts'
import type { Diagnostic, ProviderResult, Task } from '../../model.ts'
import type { RunnerRole } from '../../tool.ts'
import { dirOf, taskId } from '../support/shared.ts'
import { leadingSpaces, matchKey, prepass, unquoteValue } from '../support/yaml-lite.ts'

const CHAIN = [
  {
    label: 'runner',
    hint: "Docker Compose runs the services declared in a Compose file's `services:` map.",
  },
  {
    label: 'directory',
    hint: 'The directory holding the Compose file. Each one is an independent Compose project; `.` is the root.',
  },
  { label: 'service', hint: 'The key under `services:` in that Compose file.' },
]

/**
 * The four config filenames, in Compose's own priority order (see the file
 * header). Order is load-bearing: `pickWinners` takes the first of these
 * present in a directory.
 */
export const CONFIG_NAMES = [
  'compose.yaml',
  'compose.yml',
  'docker-compose.yml',
  'docker-compose.yaml',
]

const MULTI_DOC =
  'multi-document YAML (`---`/`...`) is not supported — only the content before the first separator was read, so services declared in a later document are missing'
const ANCHOR_ALIAS =
  'YAML anchors and aliases (`&`/`*`) are not supported — services defined or completed via an anchor/alias may be missing or incomplete'
const MERGE_KEY = 'YAML merge keys (`<<`) are not supported — merged fields were not applied'
const FLOW_SERVICES =
  'flow-style `services:` mapping (`services: { ... }`) is not supported — no services were read from this file'
const INCLUDE =
  "`include:` pulling in other Compose files is not supported — services those files contribute are not enumerated, only this file's own `services:`"
const EXTENDS =
  "`extends:` pulling a service definition from another Compose file is not supported — the extended service is listed under this file's own name, and fields it inherits were not read"

/**
 * Not a limitation of the reader — a fact about the emitted command.
 *
 * A service behind `profiles:` is excluded from a bare `docker compose up`,
 * and Compose's own `config --services` does not even list it. But naming a
 * profiled service explicitly on `up` DOES start it: Compose auto-enables the
 * profile it belongs to. Verified on this machine (Docker 29.6.2) with a
 * two-service file where `debugger` sat behind `profiles: [debug]` —
 * `docker compose config --services` printed only `web`, while
 * `docker compose -f compose.yaml --dry-run up debugger` created the
 * container. So the task this runner emits is correct as written and the
 * service is listed like any other; the diagnostic exists so a reader of the
 * catalog is not surprised that `docker compose up` on its own skips it.
 */
const PROFILES = (names: string[]): string =>
  `${names.length === 1 ? 'service' : 'services'} behind a \`profiles:\` key (${names.join(', ')}) — a bare \`docker compose up\` does not start ${names.length === 1 ? 'it' : 'them'}; the task emitted here names the service explicitly, which starts it by auto-enabling its profile`

/** A directory holding more than one config filename — Compose ignores all but one. */
const multipleConfigs = (winner: string, ignored: string[]): string =>
  `found multiple Compose config files with supported names in this directory — \`${winner}\` wins by Compose's own filename precedence and ${ignored.length === 1 ? 'the other is' : 'the others are'} ignored entirely: ${ignored.join(', ')}. Compose warns about this itself ("Found multiple config files with supported names") and reads only the winner, so services declared solely in the ignored ${ignored.length === 1 ? 'file' : 'files'} are not enumerated.`

interface ServiceEntry {
  /** `image: nginx:alpine` or `build: .`, when either is a readable scalar. */
  detail?: string
  /** Whether the service declares `profiles:`. */
  profiled: boolean
}

interface ReadResult {
  services: Map<string, ServiceEntry>
  warnings: string[]
}

/**
 * Read a Compose file's `services:` mapping. See the file header for exactly
 * what this does and does not attempt.
 */
export function readCompose(text: string): ReadResult {
  const warnings = new Set<string>()
  const { lines, anchor, merge, multiDoc } = prepass(text)
  if (multiDoc) warnings.add(MULTI_DOC)
  if (anchor) warnings.add(ANCHOR_ALIAS)
  if (merge) warnings.add(MERGE_KEY)

  const services = new Map<string, ServiceEntry>()

  // Pass 1: top-level (indent 0) keys — locate `services:`, note `include:`.
  let servicesLineIdx = -1
  let flowStyleServices = false
  let hasInclude = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (line.trim() === '') continue
    if (leadingSpaces(line) !== 0) continue
    const m = matchKey(line, 0)
    if (m === null) continue
    if (m.key === 'include') hasInclude = true
    if (m.key === 'services' && servicesLineIdx === -1) {
      servicesLineIdx = i
      if (m.value.trim().startsWith('{')) flowStyleServices = true
    }
  }

  if (hasInclude) warnings.add(INCLUDE)
  if (servicesLineIdx === -1) return { services, warnings: [...warnings] }
  if (flowStyleServices) {
    warnings.add(FLOW_SERVICES)
    return { services, warnings: [...warnings] }
  }

  // Pass 2: everything indented under `services:`. The first indent level seen
  // is the service-name level; the first indent level seen under ONE service
  // is that service's field level. Anything deeper (ports:, environment:, …)
  // is skipped.
  let serviceNameIndent = -1
  let current: string | null = null
  let currentFieldIndent = -1
  const profiled: string[] = []
  let hasExtends = false

  for (let i = servicesLineIdx + 1; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (line.trim() === '') continue
    const indent = leadingSpaces(line)
    if (indent <= 0) break // back to top level: the `services:` mapping is over

    if (serviceNameIndent === -1) serviceNameIndent = indent

    if (indent === serviceNameIndent) {
      const m = matchKey(line, indent)
      if (m === null) continue
      current = m.key
      currentFieldIndent = -1
      if (!services.has(current)) services.set(current, { profiled: false })
      continue
    }

    if (indent < serviceNameIndent) break
    if (current === null) continue

    if (currentFieldIndent === -1) currentFieldIndent = indent
    if (indent !== currentFieldIndent) continue // deeper than the service's own fields

    const m = matchKey(line, indent)
    if (m === null) continue
    const entry = services.get(current)
    if (entry === undefined) continue

    if (m.key === 'image' || m.key === 'build') {
      // `image:` wins: a service declaring both builds an image and tags it,
      // and the tag is the more recognizable of the two. `build:` as a
      // mapping has an empty scalar here and is correctly skipped.
      const v = unquoteValue(m.value)
      if (v !== undefined && (m.key === 'image' || entry.detail === undefined)) {
        entry.detail = `${m.key}: ${v}`
      }
    } else if (m.key === 'profiles') {
      entry.profiled = true
      profiled.push(current)
    } else if (m.key === 'extends') {
      hasExtends = true
    }
  }

  if (profiled.length > 0) warnings.add(PROFILES(profiled))
  if (hasExtends) warnings.add(EXTENDS)

  return { services, warnings: [...warnings] }
}

/**
 * Group discovered files by directory and keep the one Compose would actually
 * read, reporting the siblings it shadows.
 */
export function pickWinners(files: string[]): Array<{ file: string; ignored: string[] }> {
  const byDir = new Map<string, string[]>()
  for (const f of files) {
    const dir = dirOf(f)
    const list = byDir.get(dir)
    if (list === undefined) byDir.set(dir, [f])
    else list.push(f)
  }

  const out: Array<{ file: string; ignored: string[] }> = []
  for (const [dir, group] of [...byDir].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const ordered = CONFIG_NAMES.map((name) => (dir === '.' ? name : `${dir}/${name}`)).filter(
      (p) => group.includes(p),
    )
    const winner = ordered[0]
    if (winner === undefined) continue
    out.push({ file: winner, ignored: ordered.slice(1) })
  }
  return out
}

function makeTask(file: string, service: string, detail: string | undefined): Task {
  const dir = dirOf(file)
  // `-f`/`--file` is Compose's own file flag — "-f, --file stringArray
  // Compose configuration files", quoted from `docker compose --help` on this
  // machine. It accepts a path, not just a name, and resolves it relative to
  // the invocation directory: verified from a parent directory that
  // `docker compose -f sub/compose.yaml config --services` reads the nested
  // file. So the directory is expressed in argv and `cwd` stays "." for every
  // task, per this package's argv/cwd policy.
  //
  // `up`, not `run`: `docker compose --help` describes `run` as "Run a
  // one-off command on a service" — an ad-hoc invocation that generally wants
  // a command to append — and `up` as "Create and start containers".
  //
  // The binary is `docker` and the subcommand is `compose`: Compose v2+ is a
  // Docker CLI plugin, not a program of its own. The standalone
  // `docker-compose` v1 binary is a different product this runner does not
  // target — only the filenames it bequeathed survive.
  const argv = ['docker', 'compose', '-f', file, 'up', service]
  return {
    id: taskId('docker-compose', file, service),
    runner: 'docker-compose',
    path: ['docker-compose', dir, service],
    argv,
    cwd: '.',
    display: argv.join(' '),
    parameters: [],
    source: file,
    origin: 'declared',
    ...(detail === undefined ? {} : { detail }),
    tags: ['docker-compose', dir],
    // `value: true` because a Compose service usually is a long-lived process
    // — that is what a container in a `services:` map normally holds — and
    // this is a better-grounded default than `looksPersistent`, which is
    // deliberately NOT used here: it would read `worker` and `db` as one-shot.
    //
    // `declared: false` because Compose states nothing about persistence
    // anywhere in the file, so this is THIS package inferring from the `up`
    // verb, not the runner telling us. The inference is wrong for a real and
    // common shape — migration, seed and lint services:
    //
    //     services:
    //       oneshot:
    //         image: alpine
    //         command: echo hello
    //
    // `docker compose up oneshot` prints `hello` and exits 0 immediately
    // (Docker 29.6.2). Per `Task.persistent` in model.ts, `declared` exists so
    // a consumer can choose to trust only what a runner actually said.
    persistent: { value: true, declared: false },
    // The command runs on this machine, but what it starts is a container,
    // and that is what a consumer deciding whether it can run this needs.
    executes: 'container',
  }
}

export const dockerComposeRunner: RunnerRole = {
  // `parse`, and parse only: `collect` below never touches `ctx.runner()`.
  kind: 'parse',
  chain: CHAIN,

  async collect(ctx: ProviderContext): Promise<ProviderResult> {
    const found = await Promise.all(CONFIG_NAMES.map((name) => ctx.files(name)))
    const files = [...new Set(found.flat())].sort()
    if (files.length === 0) return { status: 'absent', tasks: [], diagnostics: [] }

    const diagnostics: Diagnostic[] = []
    const tasks: Task[] = []
    const winners = pickWinners(files)

    for (const { file, ignored } of winners) {
      if (ignored.length > 0) {
        // Sourced to the winner: that is the file a reader of this catalog
        // will go and open, and the one whose contents the diagnostic
        // qualifies.
        diagnostics.push({
          severity: 'warning',
          message: multipleConfigs(file, ignored),
          source: file,
        })
      }

      const text = await ctx.readText(file)
      if (text === null) continue
      const { services, warnings } = readCompose(text)

      for (const message of warnings) {
        diagnostics.push({ severity: 'warning', message, source: file })
      }
      for (const [service, entry] of services) {
        tasks.push(makeTask(file, service, entry.detail))
      }
    }

    return {
      status: tasks.length > 0 ? 'ok' : 'absent',
      tasks,
      diagnostics,
    }
  },
}
