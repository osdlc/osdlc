/**
 * The `trust` subcommand over `@osdlc/trust-repo`'s marker store
 * (`$XDG_STATE_HOME/wayfinder/trusted/`, plus grants still held in the old
 * `waypost` store; see `trust-store.ts`) and the user file's
 * `trust.paths`/`trust.owners` policy. A root the policy covers reports
 * trusted with no marker, and `--show`/`--untrust` say which layer decided
 * (`by`/`rule`).
 *
 * `stdout`, `stderr`, `env` and `home` are injected, so a test never grants
 * trust on the developer's machine. The caller strips `-C` with
 * `takeConfigDir` and hands in a resolved root.
 */

import { homedir } from 'node:os'

import { EXIT, type CliIo } from '@osdlc/cli-tool'
import { policyExecGate, type TrustBy, type TrustPolicy } from '@osdlc/trust-repo'

import { APP, BIN } from './app.ts'
import {
  ConfigError,
  PROJECT_CONFIG_FILENAME,
  loadConfig,
  trustPolicyFromConfig,
  trustPolicyOptions,
} from './config.ts'
import { appTrustStore } from './trust-store.ts'

/**
 * A VIEW of `CliIo`: the same output seam, plus the environment this command
 * needs injected — not a third pattern alongside `CliIo` and `ConfigCommandIO`.
 */
export interface TrustCommandIO extends CliIo {
  /** Defaults to `process.env`. Supplies `XDG_STATE_HOME`. */
  env?: Record<string, string | undefined>
  /** Defaults to `os.homedir()`. The base for the non-XDG state path. */
  home?: string
}

/** Which question the invocation is asking. Absent means "trust this root". */
type Mode = 'untrust' | 'show' | 'list'

function usage(): string {
  return `${BIN} trust — remember that this repository may run subprocesses to be read

usage: ${BIN} trust [options]

  (no options)        trust the repository at the resolved root
  --untrust           remove this repository's trust
  --show              report this root's trust status
  --list              every trusted path, one per line
  --json              the same answer as one JSON object, for a script or agent
  -C, --dir PATH      the directory to inspect (default: cwd)
  -h, --help          this text

Some runners can only be read by running them — reading moon's task graph
evaluates the repository's toolchain configuration. Trust is that consent,
remembered per repository and keyed on the resolved path, so you are asked
once.

Trust is one of two conditions, not the whole gate: execution must also be
enabled. ${APP} enables it by default, so trust alone is enough unless a
config file sets allowExec: false. A repository cannot trust itself: allowExec
in ${PROJECT_CONFIG_FILENAME} cannot raise the gate. Pass --exec instead to
allow a single run without recording anything. Trust, with execution
allowed, also loads the tools a project file names.

A root can also be trusted with no marker at all, by the user file's
trust.paths/trust.owners policy ("${BIN} config path" names it; a
project-layer trust block is ignored the same way allowExec is). --show and
--json report which layer decided (by=marker|path|owner, and the matching
rule for a policy hit); the plain form still writes a marker on a
policy-trusted root, and --untrust says when the policy still covers it after
the marker is gone.
`
}

/**
 * Split the mode flag off the argument list.
 *
 * The three modes contradict each other and two of them WRITE, so a
 * last-one-wins reading would act on a store the user named the other of. A
 * pair is a usage error instead, as `--user` and `--project` are for `config`.
 */
function takeMode(
  argv: string[],
): { mode?: Mode; help: boolean; json: boolean } | { error: string } {
  let mode: Mode | undefined
  let help = false
  let json = false
  for (const arg of argv) {
    if (arg === '-h' || arg === '--help') {
      help = true
    } else if (arg === '--json') {
      // Not a mode: it asks the SAME question in the machine form, so it
      // combines with each of the three rather than contradicting them.
      json = true
    } else if (arg === '--untrust' || arg === '--show' || arg === '--list') {
      const named = arg.slice(2) as Mode
      if (mode !== undefined && mode !== named) {
        return { error: `${arg} and --${mode} ask different things; give at most one` }
      }
      mode = named
    } else if (arg.startsWith('-')) {
      return { error: `unknown option: ${arg}` }
    } else {
      return { error: `trust takes no arguments, got ${arg}` }
    }
  }
  return { ...(mode !== undefined ? { mode } : {}), help, json }
}

/**
 * The USER-layer trust.paths/trust.owners policy for `root`, or the rendered
 * message when the project's config file will not parse. Lazy — computed only
 * by the modes that need a per-root decision (`show`, `untrust`, the plain
 * grant), so `--list` and `--help` ask nothing about a particular root and a
 * broken project config cannot break them, matching how `main()` only loads
 * config for the collection path.
 */
async function loadPolicy(
  root: string,
  toolName: string,
  env: Record<string, string | undefined>,
  home: string,
): Promise<TrustPolicy | { error: string }> {
  try {
    const cfg = await loadConfig(root, env, home)
    return trustPolicyFromConfig(cfg.effective)
  } catch (err) {
    if (err instanceof ConfigError) return { error: err.message }
    throw err
  }
}

/**
 * `<tool> trust [--untrust|--show|--list]`. `root` is the resolved project
 * root. Returns the exit code.
 *
 * Exit codes follow `runConfigCommand`: 2 for a command that cannot run as
 * typed, decided from the argument list alone; 1 for a well-formed command that
 * failed against the state it found — here, `--untrust` on a root that was
 * never trusted, or a project config file that will not parse.
 */
export async function runTrustCommand(
  toolName: string,
  root: string,
  argv: string[],
  io: TrustCommandIO,
): Promise<number> {
  const env = io.env ?? process.env
  const home = io.home ?? homedir()
  // Keyed on the app name, not `toolName`, so a grant lands in one store
  // whichever name the caller printed.
  const store = appTrustStore({ env, home })
  const policyOptions = trustPolicyOptions(home)

  const taken = takeMode(argv)
  if ('error' in taken) {
    io.stderr(`${toolName}: ${taken.error}\n\n${usage()}`)
    return EXIT.usage
  }
  if (taken.help) {
    io.stdout(usage())
    return EXIT.ok
  }

  /**
   * The machine form of every root-scoped answer, in ONE shape across `trust`,
   * `--untrust` and `--show`: which root was decided on, whether it is trusted
   * now, whether THIS invocation changed the store, and which layer decided
   * (`by`/`rule`, mirroring `sdlc repo trust --show`). Three questions with
   * three JSON shapes would make a caller branch on the flag it just passed.
   */
  const rootAnswer = (
    path: string,
    trusted: boolean,
    changed: boolean,
    by: TrustBy | null,
    rule?: string,
  ): string => `${JSON.stringify({ root: path, trusted, changed, by, rule })}\n`

  switch (taken.mode) {
    case 'list': {
      const paths = await store.list()
      if (taken.json) io.stdout(`${JSON.stringify({ trusted: paths })}\n`)
      else for (const path of paths) io.stdout(`${path}\n`)
      return EXIT.ok
    }
    case 'show': {
      // Both answers are exit 0: "not trusted" is a fact this command was asked
      // for, not a failure to report it.
      const policy = await loadPolicy(root, toolName, env, home)
      if ('error' in policy) {
        io.stderr(`${toolName}: ${policy.error}\n`)
        return EXIT.error
      }
      // Decided through the SAME function that gates a real run
      // (`policyExecGate`), so this answer cannot drift from what actually
      // governs execution. `configured: true` asks "if execution were on,
      // would this root's marker or policy allow it" — the only question
      // `--show` has, so `allowExec`/`reason` are unused here.
      const gate = await policyExecGate(store, policy, { root, configured: true }, policyOptions)
      io.stdout(
        taken.json
          ? rootAnswer(gate.root, gate.trusted, false, gate.by, gate.rule)
          : `${gate.trusted ? 'trusted' : 'not trusted'} ${gate.root}\n`,
      )
      return EXIT.ok
    }
    case 'untrust': {
      const policy = await loadPolicy(root, toolName, env, home)
      if ('error' in policy) {
        io.stderr(`${toolName}: ${policy.error}\n`)
        return EXIT.error
      }
      // Resolved first so the message names the path the store is keyed on,
      // which is the path a later --list will show.
      const resolved = await store.resolveRoot(root)
      const removed = await store.untrust(resolved)
      // Independent of the marker either way, so it answers the same question
      // whether or not this call removed one — the root may still be trusted
      // by policy after its marker is gone.
      const after = await policyExecGate(store, policy, { root, configured: true }, policyOptions)
      // The answer goes to stdout either way. A --json caller that gets exit 1
      // still gets a document saying what the store held; the failure itself is
      // the exit code and the line on stderr, which is where every other aside
      // in this package already goes.
      if (taken.json) io.stdout(rootAnswer(resolved, after.trusted, removed, after.by, after.rule))
      if (!removed) {
        io.stderr(`${toolName}: not trusted: ${resolved}\n`)
        return EXIT.error
      }
      if (!taken.json) {
        io.stdout(`untrusted ${resolved}\n`)
        // Mirrors `sdlc repo untrust`'s note: removing the marker did not
        // change the answer when a policy rule covers this root regardless.
        if (after.trusted) {
          io.stderr(
            `note: ${resolved} is still trusted by ${toolName}'s trust.${after.by}s ` +
              `('${after.rule ?? ''}'); removing the marker changes nothing\n`,
          )
        }
      }
      return EXIT.ok
    }
    default: {
      const policy = await loadPolicy(root, toolName, env, home)
      if ('error' in policy) {
        io.stderr(`${toolName}: ${policy.error}\n`)
        return EXIT.error
      }
      const result = await store.trust(root)
      // After granting (or confirming) the marker, the marker itself is
      // always why this root is trusted — `trustDecision` checks it first.
      const decision = await policyExecGate(
        store,
        policy,
        { root, configured: true },
        policyOptions,
      )
      io.stdout(
        taken.json
          ? rootAnswer(result.root, true, !result.alreadyTrusted, decision.by, decision.rule)
          : `${result.alreadyTrusted ? 'already trusted' : 'trusted'} ${result.root}\n`,
      )
      return EXIT.ok
    }
  }
}
