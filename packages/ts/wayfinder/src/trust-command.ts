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

import { EXIT, type CliIo } from '@osdlc/cli-tool'
import { homeDir, policyExecGate, type TrustBy, type TrustPolicy } from '@osdlc/trust-repo'

import { APP, BIN } from './app.ts'
import {
  ConfigError,
  PROJECT_CONFIG_FILENAME,
  loadConfig,
  trustPolicyFromConfig,
  trustPolicyOptions,
} from './config.ts'
import { jsonText, terminalSafe } from './terminal-text.ts'
import { appTrustStore } from './trust-store.ts'

/**
 * `CliIo` plus the environment this command needs injected.
 */
export interface TrustCommandIO extends CliIo {
  /** Defaults to `process.env`. Supplies `XDG_STATE_HOME`. */
  env?: Record<string, string | undefined>
  /** Defaults to `homeDir()` from `@osdlc/trust-repo`. The base for the non-XDG state path. */
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
 * The three mode flags ask different things, and `--untrust` writes. If the
 * last flag won, a run meant only to read could change the store. Two
 * different modes are a usage error instead, as `--user` and `--project` are
 * for `config`.
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
      // Not a mode: it asks the same question in JSON form, so it combines
      // with each of the modes.
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
 * The user-layer trust.paths/trust.owners policy for `root`, or the error
 * message when a config file will not parse. Only the modes that decide about
 * one root call it (`show`, `untrust`, the plain grant). So a broken config
 * file cannot break `--list` or `--help`, just as `main()` loads config only
 * when it collects tasks.
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
 * Exit codes follow `runConfigCommand`. 2 is a command that cannot run as
 * typed, decided from the arguments alone. 1 is a valid command that failed
 * against the state it found: here, `--untrust` on a root with no marker, or a
 * config file that will not parse.
 */
export async function runTrustCommand(
  toolName: string,
  root: string,
  argv: string[],
  io: TrustCommandIO,
): Promise<number> {
  const env = io.env ?? process.env
  const home = io.home ?? homeDir()
  // Keyed on the app name, not `toolName`, so every grant lands in one store
  // whatever name the caller prints.
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
   * The JSON answer for `trust`, `--untrust` and `--show`, in one shape: the
   * root decided on, whether it is trusted now, whether this run changed the
   * store, and which layer decided (`by`/`rule`, as `sdlc repo trust --show`
   * reports). One shape means a caller does not branch on the flag it passed.
   */
  const rootAnswer = (
    path: string,
    trusted: boolean,
    changed: boolean,
    by: TrustBy | null,
    rule?: string,
  ): string => `${jsonText({ root: path, trusted, changed, by, rule })}\n`

  switch (taken.mode) {
    case 'list': {
      const paths = await store.list()
      if (taken.json) io.stdout(`${jsonText({ trusted: paths })}\n`)
      else for (const path of paths) io.stdout(`${terminalSafe(path)}\n`)
      return EXIT.ok
    }
    case 'show': {
      // Both answers exit 0. "Not trusted" is the answer that was asked for,
      // not a failure.
      const policy = await loadPolicy(root, toolName, env, home)
      if ('error' in policy) {
        io.stderr(`${toolName}: ${policy.error}\n`)
        return EXIT.error
      }
      // Decided by the same function that checks a real run
      // (`policyExecGate`), so this answer always matches what controls
      // execution. `configured: true` asks "if execution were on, would this
      // root's marker or policy allow it". That is the only question `--show`
      // asks, so `allowExec` and `reason` are unused here.
      const gate = await policyExecGate(store, policy, { root, configured: true }, policyOptions)
      io.stdout(
        taken.json
          ? rootAnswer(gate.root, gate.trusted, false, gate.by, gate.rule)
          : `${gate.trusted ? 'trusted' : 'not trusted'} ${terminalSafe(gate.root)}\n`,
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
      // which is the path a later --list shows.
      const resolved = await store.resolveRoot(root)
      const removed = await store.untrust(resolved)
      // Checked whether or not a marker was removed: the root may still be
      // trusted by policy after its marker is gone.
      const after = await policyExecGate(store, policy, { root, configured: true }, policyOptions)
      // The JSON answer goes to stdout either way, so a --json caller that gets
      // exit 1 still gets a document. The failure is reported by the exit code
      // and a line on stderr, where every other side message in this package
      // goes.
      if (taken.json) io.stdout(rootAnswer(resolved, after.trusted, removed, after.by, after.rule))
      if (!removed) {
        io.stderr(`${toolName}: not trusted: ${resolved}\n`)
        return EXIT.error
      }
      if (!taken.json) {
        io.stdout(`untrusted ${terminalSafe(resolved)}\n`)
        // Matches `sdlc repo untrust`'s note: when a policy rule covers this
        // root, removing the marker did not change the answer.
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
      // After the marker is written (or found), the marker is always the
      // reason this root is trusted, because the marker is checked first.
      const decision = await policyExecGate(
        store,
        policy,
        { root, configured: true },
        policyOptions,
      )
      io.stdout(
        taken.json
          ? rootAnswer(result.root, true, !result.alreadyTrusted, decision.by, decision.rule)
          : `${result.alreadyTrusted ? 'already trusted' : 'trusted'} ${terminalSafe(result.root)}\n`,
      )
      return EXIT.ok
    }
  }
}
