---
id: R-06
type: research
state: current
created: 2026-10-08
---

# JetBrains: driving an IDE terminal for a dispatcher

Sources are published docs only (no other plugin's shipped code was read), plus one sandbox run of
the plugin (`./gradlew runIde`, IntelliJ IDEA 2025.3) on 2026-10-10; the observed results are under
"Verified live" below. WebStorm 2025.2/2026.1, RustRover 2025.2/2026.1 and PyCharm 2026.1 are
installed. The plugin targets 2025.3 (build 253), the first release with the Reworked Terminal API,
and is verified against 2026.1 (build 261) too.

## Does the bundled MCP Server cover it? No

Source: JetBrains help, "MCP Server" (introduced in 2025.2; transports named: SSE, Stdio, HTTP
Stream; enabled under Settings | Tools | MCP Server).

- **Published.** The only terminal tool is `execute_terminal_command` (params `command`,
  `executeInShell`, `reuseExistingTerminalWindow`, `timeout`, `maxLinesCount`, `truncateMode`,
  `projectPath`). Output is capped at 2000 lines. It needs per-command user confirmation unless
  "brave mode" is on.
- **Gap.** Of the four needs: (a) open a tab running a command is only approximated by running a
  command in a (possibly reused) terminal, (b) send text to an existing terminal, (c) list
  terminals with cwd and (d) focus have no tool. The tool is a run-and-capture call, not a
  session handle, so a long-lived `claude` session would block it until its timeout.
- **Not published.** The port and the auth mechanism for external clients are not on the page;
  the IDE's "Copy ... Config" buttons produce them. Not usable as a discoverable endpoint.

## Decision: companion plugin on the built-in web server

- **Built-in server.** Default port 63342, falling back to 63342+n (n < 20) when taken (JetBrains
  community answers; the SDK web-server article is no longer public, tracked as IJSDK-1649).
  Plugins add a handler through the `com.intellij.httpRequestHandler` extension point
  (`org.jetbrains.ide.HttpRequestHandler`). Worker count is small (1 or 2), so handlers must
  return quickly. The signature compiles and verifies on 253 and 261.
- **Transport and threat model.** The VS Code companion uses a 0600 unix socket (named pipe on
  win32), so the OS file mode is the whole gate. The IDE gives a plugin no private socket: the
  built-in server listens on loopback TCP, which any local process, and any web page via the
  browser, can reach. The plugin therefore requires a per-IDE-process bearer token (256 random
  bits, generated at startup, compared in constant time) that exists only in the registry file
  `<runtime dir>/hosts/jetbrains/<pid>.json` (dir 0700, file 0600 at creation, atomic
  rename), so a web page cannot learn it and DNS rebinding gains nothing without it. A process
  running as the same user can read the file and drive the terminals the plugin opened; it could
  equally read the VS Code registry and connect to its socket, so the two models give the same
  answer for that attacker. Another user cannot read the file (POSIX; on Windows the profile ACL
  is relied on). What the token buys is the ability to open a tab running a command and type
  into tabs the plugin opened, never into hand-opened ones, and to open a folder as a project (the
  IDE's trust prompt still applies; see Open project).
  Stale pid files are swept when the plugin publishes its entry and removed on clean exit.
- **Terminal API (SDK "Embedded Terminal" page).** Three implementations exist; the Reworked
  Terminal API, "available since 2025.3" and marked experimental, is the recommended one:
  `TerminalToolWindowTabsManager.getTabs()` lists tabs, `createTabBuilder()` creates one,
  `TerminalView.sendText()` / `createSendTextBuilder().shouldExecute()` sends text. The page does
  not document the tab builder's options (cwd, name, command) and says shell integration, which
  supplies a tab's cwd, works only for Bash, Zsh and PowerShell. Per JetBrains staff on the
  platform forum, public creation APIs such as `TerminalToolWindowManager.createShellWidget`
  still return the classic terminal on any engine setting; `TerminalWidget.sendCommandToExecute`
  works on it. The builder options the page omits (`workingDirectory`, `shellCommand`, `tabName`,
  `requestFocus`) are in the published intellij-community source, and the plugin uses the Reworked
  API; the classic `TerminalToolWindowManager` path is not used.
- **Ack.** `sendText` is asynchronous and returns no consumption signal, so `send` reports
  `ack: false`. `capture` is not offered: no published read-back API.

## What is built

- `src/hosts/jetbrains.ts`: the host, an HTTP client over `curl` on the command
  seam (token and body go over stdin config, not argv). It distinguishes HTTP status (401 token
  rejected, 404 plugin endpoint missing, 5xx plugin failure, any other non-2xx
  reported as a failed host call with its status) and skips an IDE whose registry entry
  or ping reply carries another `protocol` than `2`, or whose ping `pid` differs from the registry
  file's (a stale entry whose port another process now holds), naming the reason in the error.
- The companion plugin: a Kotlin plugin and Gradle build, kept with sdlc beside the VS Code
  companion, with its own build and check tasks and a path-filtered CI workflow. Toolchain pins are
  in the plugin's own `mise.toml` (Java 21; the committed Gradle 9.7.0 wrapper, with
  `distributionSha256Sum`, is authoritative).
  `./gradlew buildPlugin verifyPluginStructure test verifyPlugin`.
- Wire contract: `protocol-fixtures/*.json` are golden request/response pairs read by the plugin's
  JUnit tests (`Protocol.kt` is free of IDE classes) and by `jetbrains.test.ts`.
- Terminals use the Reworked Terminal API (signatures from the published intellij-community source,
  identical at the 253 and 261 tags). `open` carries the command as `argv` (no shell string, so no
  quoting to match) and starts the tab with it as the shell process (`shellCommand`: a POSIX login
  shell (`$SHELL`, else `/bin/sh`) running `exec "$@"`, Windows argv directly), so there is no text
  typed before a shell is ready and no bare shell left behind: when the harness exits the session
  ends and the tab is untracked (the view's coroutine scope completes; `sessionState` is checked
  too). Tracked tabs live on the project's user data, so a closed project drops them. Paths on both
  sides use the real path.
- Handlers answer every outcome with JSON (500 on an unexpected exception; a cancellation is still
  rethrown after the reply). EDT work is bounded (`Claim.kt`, `runClaimed`): it is queued with
  `invokeLater(…, ModalityState.nonModal())` so it never runs behind a modal dialog, the request
  waits 3 s, and on timeout the caller abandons the work if the UI thread has not started it (503,
  nothing was done) or waits 2 s more for work already begun (504, outcome unknown: a 504 on
  `terminal/open` may still produce a tab, which is recorded inside the UI-thread block so a late
  completion still registers it, but callers must not retry blindly), so a stuck UI thread cannot
  pin one of the built-in server's one or two workers. The registry is written after
  `waitForStart()` and only when the port is above 0. It is published from an application listener,
  `AppLifecycleListener.welcomeScreenDisplayed()` (so an IDE showing only the welcome screen is
  discoverable, which is when `project/open` matters), with the per-project `ProjectActivity` kept
  as an idempotent fallback for an IDE that starts with a project. `welcomeScreenDisplayed` is
  public API; `appStarted` is `@ApiStatus.Internal` and its Javadoc points plugins at
  `ProjectActivity`, so it is not used. Source at both tags
  ([253.28294.334](https://github.com/JetBrains/intellij-community/blob/idea/253.28294.334/platform/ide-core/src/com/intellij/ide/AppLifecycleListener.java),
  [261.27258.48](https://github.com/JetBrains/intellij-community/blob/idea/261.27258.48/platform/ide-core/src/com/intellij/ide/AppLifecycleListener.java)):
  `welcomeScreenDisplayed` is "called when the welcome screen is displayed (not called if the
  application opens a project)", identical in both.

## Earlier plugin folded in

An earlier plugin (`ide/jetbrains`, protocol-less, classic `createShellWidget` API) was merged into
this one; protocol 2 keeps what was a real gain and drops the rest.

- **Ported**: the bounded UI-thread wait with 503/504 replies (above); `pid` in the ping reply,
  checked by the host against the registry file.
- **Not ported**: the `consumed` ack on `send` and `lastOutputAt` in `list` (both were always
  `false` and `null`: the terminal API reports neither, so the fields carried no information, and
  the host's `ack` and `lastOutputAt` already say the same); "send needs a running command" (the
  tab's process is the harness, so a tab whose command ended is untracked and `send` declines it,
  where the earlier plugin had to probe a bare shell); `splitStatus` (the host's last-line status
  split already treats a missing or non-numeric status as no reply) and its `Reply` type.

## Open project

`POST /api/sdlc/project/open {path}` (same token, protocol `2`) replies `{ok: true,
project: <basePath>}` or `{ok: false, error}`. A project that already contains `path` is
reported ok without reopening. The path must be absolute, exist and be a directory (else HTTP
400 with the reason) and is resolved to its real path before every check. Otherwise the plugin calls
`ProjectUtil.openOrImport(Path, OpenProjectTask)` (`OpenProjectTask.build()`) on a pooled thread
and waits up to 60 seconds. Both are published, non-internal API with the same signatures at the
253 and 261 tags
([ProjectUtil.kt](https://github.com/JetBrains/intellij-community/blob/idea/261.27258.48/platform/platform-impl/src/com/intellij/ide/impl/ProjectUtil.kt),
[OpenProjectTask.kt](https://github.com/JetBrains/intellij-community/blob/idea/261.27258.48/platform/ide-core-impl/src/com/intellij/ide/impl/OpenProjectTask.kt));
the `OpenProjectTask { }` builder and constructor are `@Internal`, so `build()` is used.

The IDE's "Trust project?" prompt is not bypassed. If the person has not answered within the wait,
the reply is `{ok: false, error: "waiting for the user to trust <path>"}` and the open stays pending
in the IDE, tracked by real path: a repeat or concurrent call for the same folder joins the pending
open (and gets the same timeout reply while it is still waiting) instead of calling `openOrImport`
again, and a failure on the abandoned thread is logged. To skip the prompt for a folder, add it
under Settings > Build, Execution, Deployment > Trusted Locations.

The host (`jetbrains.ts`) exposes it as the optional contract part `openWorkspace`, which the
launch policy (`ensureWorkspace`) calls before `session`/`terminal` when its `enabled` argument
is true. With no reachable IDE holding cwd it picks the only reachable IDE, else the
one whose product name (`product` in the ping reply) equals `JetbrainsSettings.ide` ignoring case
(an empty product never matches), else an error listing the IDEs; prints one line to stderr
("opening <root> in <product>…", with the trust-prompt note); and opens the git top-level of cwd.
cwd itself is opened outside a repository, when git fails, or when the top-level is the home
directory or filesystem root. `terminal`, `session`, `send`, `find` and `focus` never open a
project; `focus`/`attach` failures point at `sdlc session launch --host jetbrains`. Each worktree
opens as its own project (the registry's deepest-match rule then keeps its sessions apart); a
monorepo subfolder opens the whole repository.

## Verification status

- `./gradlew buildPlugin verifyPluginStructure test` pass; JUnit tests over the fixtures, paths,
  registry and `ProjectOpener` (validation, join-while-pending, timeout, failure);
  this package's tests pass.
- `verifyPlugin` (Plugin Verifier) is Compatible with IntelliJ IDEA 253.28294.334 (2025.3) and
  261.22158.277 (2026.1), with 33 experimental-API usages reported (the Reworked Terminal API).
  `sinceBuild` is 253 and `untilBuild` 261.*; widen after verifying the next branch.
- **Verified live** (sandbox `runIde`, 2026-10-10): the plugin loads and writes its registry
  entry, and removes it on a clean exit; `terminal` opens a tab whose
  `$SHELL -l -c 'exec "$@"' sdlc <argv>` start finds `claude` on the login-shell PATH; `find`
  lists the tab; `sendText` reaches the harness's input; `focus` returns true. `project/open` on
  an untrusted plain folder shows the trust prompt, and after 60 seconds the host reports
  "waiting for the user to trust it" rather than hanging.
- The host lists `darwin` only (a platform that was not run is left out); the sandbox run above was
  on macOS. It pings with a 1.5 s limit and reuses the list of answering IDEs for 5 s (dropped when
  `project/open` succeeds), and breaks a tie between IDEs holding the same project by the newest
  `startedAt` in the registry file.
- **Not verified live**: that the tab's session reaches `Terminated` when the harness exits; that
  the project opens and a later `terminal` finds it once the trust prompt is approved; that the
  registry is published from the welcome screen with no project open.

## Non-goals for now

Release and distribution: no Marketplace publishing, signing, or CI artifact upload. The zip from
`buildPlugin` is for sideloading; the version in `build.gradle.kts` is independent of sdlc's.
