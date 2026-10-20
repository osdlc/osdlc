# Verbs: the standard task names

Status: draft.

## Summary

- A project answers to a fixed set of task names ("verbs"): `setup`, `fmt`,
  `lint`, `test`, `build`, `deploy` and so on. The names are the same in every
  language. Only the command behind each one changes.
- A bare verb does not change tracked files. A `-fix` suffix marks the form
  that may. `fmt`, `generate`, `setup` and `clean` are named exceptions.
- `check` is an aggregate. It lists other verbs and holds no command of its
  own.
- A project defines only the verbs that apply to it. A library has no `dev`
  and no `deploy`.
- Every verb runs from a fresh clone after `setup`, without prompting.
- When `sdlc.yaml` does not define a verb, a tool may use the default for the
  project's ecosystem (see [Defaults by ecosystem](#defaults-by-ecosystem)).

## The vocabulary

### Prepare

| Verb | Writes? | Meaning |
|---|---|---|
| `setup` | yes, untracked only | Install dependencies and toolchains so every other verb can run. Safe to run again. |
| `clean` | yes, untracked only | Remove what `build` and the test verbs wrote. Never removes dependencies, lockfiles or tracked files. |

### Code quality

| Verb | Writes? | Meaning |
|---|---|---|
| `fmt` | yes | Format the source in place. |
| `fmt-check` | no | Fail if any file is not formatted. |
| `lint` | no | Report lint findings. Fail on any finding the project treats as an error. |
| `lint-fix` | yes | Apply the linter's automatic fixes. |
| `typecheck` | no | Run the type checker. Omit it where `lint` or `build` already compiles the code. |

### Test

| Verb | Writes? | Needs | Meaning |
|---|---|---|---|
| `test` | no | nothing beyond `setup` | The default test run: the fast tests that need no outside service. Usually the same as `test-unit`. |
| `test-unit` | no | nothing beyond `setup` | Tests of one unit in isolation. No network, no database, no other process. |
| `test-integration` | no | local services | Tests of the code together with real dependencies: a database, a filesystem, a queue, another service. |
| `test-e2e` | no | a running system | Tests of the whole system as a user or client sees it, through its real interface (UI, HTTP API, CLI). |
| `bench` | no | nothing beyond `setup` | Run the benchmarks. |

A verb that needs a service starts and stops it itself, or fails with a
message that says what is missing. It does not assume a service is already
running.

### Run and build

| Verb | Writes? | Meaning |
|---|---|---|
| `dev` | untracked only; runs until stopped | Run the project locally with reload. Applications, services and tools only. |
| `build` | untracked only | Compile or bundle the project into its output directory. |
| `generate` | yes, tracked | Regenerate committed files: generated code, bundles, docs, golden files. Run before `check` when inputs changed. |
| `package` | untracked only | Turn the build into something that can be shipped: an archive, a container image, an installer. |
| `docs` | untracked only | Build the documentation site or API docs. |

### Ship

| Verb | Writes? | Meaning |
|---|---|---|
| `release` | yes, and publishes | Cut a version: bump it, tag it and publish the artifacts to their registry. |
| `deploy` | external | Put a built version into an environment. Takes the environment name as its argument. |

### Aggregates

| Verb | Meaning |
|---|---|
| `check` | Everything CI gates on that needs no outside service. Default: `fmt-check`, `lint`, `typecheck`, `test`. |
| `fix` | Every writing form, in order. Default: `fmt`, `lint-fix`. |

## Rules

### 1. The names are fixed; the commands are the project's

A tool or agent can run `lint` in any project and know what it asked for. It
does not need to know whether the project uses ESLint, Clippy or Ruff. A
project may add verbs of its own. It should not give a standard name a
different meaning.

### 2. A bare name is a gate; `-fix` writes

A verb without a suffix reads the tree, reports, and exits non-zero on
failure. It does not modify a tracked file. Run it, then `git status`: a clean
tree is the test.

The exceptions are deliberate:

- `fmt` writes because a formatter has exactly one correct output. `fmt-check`
  is the gate. This matches `cargo fmt` and `prettier --write`.
- `generate` writes tracked files because that is its job. Its output is
  committed and reviewed.
- `setup`, `clean`, `build` and `dev` write only untracked output
  (`node_modules/`, `target/`, `dist/`).

A `lint` script that runs `eslint --fix` breaks this rule. Rename it
`lint-fix` and add a `lint` that only reports.

### 3. Aggregates name verbs and nothing else

`check` and `fix` list other verbs. They hold no command of their own. Adding
a gate means adding a verb to the list, and each command lives in one place.

### 4. A project defines only the verbs that apply

| Verb | Applies when |
|---|---|
| `setup`, `fmt`, `fmt-check`, `lint`, `check` | every project with source |
| `typecheck` | the language has a type checker separate from the compiler |
| `test`, `test-*` | the project has tests of that kind |
| `build`, `clean` | the project produces output; `clean` goes with `build` |
| `dev` | the project is an application, service or tool that runs |
| `package`, `deploy` | the project ships an artifact or runs in an environment |
| `release` | the project publishes versions |

A tool treats an undefined verb as "does not apply", not as an error, unless
the caller asked for that verb by name.

### 5. Every verb runs from a fresh clone

After `setup`, every verb runs in a new clone or a new worktree with no other
preparation. A verb never assumes someone ran an install, a build or a
codegen step first. If it needs one, it depends on it. Make the dependency
cheap (cache the install on its lockfile) rather than leaving it out.

### 6. Verbs do not prompt

Every verb except `dev` runs without a terminal. Exit code 0 means success
and anything else means failure. A verb that needs a secret or a choice reads
it from the environment or an argument, and fails with a clear message when
it is missing.

### 7. Names map mechanically to the native runner

Where an ecosystem has its own task names, the verb maps to them by rule,
not by a list kept by hand. For `package.json` scripts, a `-` in a verb is a
`:` in the script name, and `fmt` is `format`:

| Verb | `package.json` script |
|---|---|
| `fmt` | `format` |
| `fmt-check` | `format:check` |
| `lint-fix` | `lint:fix` |
| `test-unit` | `test:unit` |
| `test-integration` | `test:integration` |
| `test-e2e` | `test:e2e` |
| any other verb | the same name |

`just`, `make`, `mise` and `moon` tasks use the verb name as-is.

## Defaults by ecosystem

When `sdlc.yaml` does not define a verb, a tool may use these. A project
task runner wins over the language default: if a `justfile`, `Makefile`,
`mise.toml` or `moon.yml` defines a task with the verb's name, that task is
the default.

| Verb | Rust (cargo) | Node (npm, pnpm, bun) | Python (uv) | Go |
|---|---|---|---|---|
| `setup` | `cargo fetch` | `<pm> install` | `uv sync` | `go mod download` |
| `fmt` | `cargo fmt` | `<pm> run format` | `uv run ruff format` | `gofmt -w .` |
| `fmt-check` | `cargo fmt --check` | `<pm> run format:check` | `uv run ruff format --check` | `test -z "$(gofmt -l .)"` |
| `lint` | `cargo clippy --all-targets -- -D warnings` | `<pm> run lint` | `uv run ruff check` | `go vet ./...` |
| `lint-fix` | `cargo clippy --all-targets --fix --allow-dirty` | `<pm> run lint:fix` | `uv run ruff check --fix` | — |
| `typecheck` | — (`lint` compiles) | `<pm> run typecheck` | `uv run mypy .` or `pyright`, whichever is configured | — (`build` compiles) |
| `test` | `cargo test` | `<pm> run test` | `uv run pytest` | `go test ./...` |
| `build` | `cargo build` | `<pm> run build` | `uv build` | `go build ./...` |
| `clean` | `cargo clean` | `<pm> run clean` | — | `go clean` |

A Node default applies only when the matching script exists. A Python default
applies only when the tool is listed in `pyproject.toml`. A Go project with a
`.golangci.yml` uses `golangci-lint run` for `lint`.

## Examples

A TypeScript library with no `sdlc.yaml` and these scripts in `package.json`:
`format`, `format:check`, `lint`, `typecheck`, `test`, `build`, `clean`. It
gets `setup`, `fmt`, `fmt-check`, `lint`, `typecheck`, `test`, `build`,
`clean` and `check` by default, and nothing else.

A web service that adds integration tests and deploys:

```yaml
workflows:
  test-integration:
    - docker compose up -d db
    - npm run test:integration
  deploy:
    - ./scripts/deploy.sh "$1"   # sdlc run deploy staging
```

## Anti-examples

- `lint` that runs `eslint . --fix`. A gate that writes.
- `check` with its own command line. It cannot grow without being edited, and
  its commands drift from the leaf verbs.
- `test` that needs a database someone started by hand. Name it
  `test-integration` and have it start the database.
- `clean` that deletes `node_modules` or a lockfile. The next `build` can no
  longer run.
- `build` that writes tracked files. That is `generate`.
- `deploy` that asks which environment on the terminal. Take it as an
  argument.

## Decisions in this draft

Each of these was a choice. Overturn any of them in review.

1. **`test-e2e`, not `test-functional`.** `e2e` is the more common name in
   current tools (Playwright, Cypress, framework scaffolds). Functional tests
   that drive the whole system through its real interface go under
   `test-e2e`. There is no alias: one name per tier keeps detection and
   aggregates simple.
2. **Arguments are positional and passed through.** `sdlc run deploy staging`
   runs the `deploy` steps with `staging` as `$1`, the same way `hooks:`
   steps already receive theirs. `deploy` takes the environment name as its
   first argument. `test` and its tiers pass extra arguments to the test
   runner as a filter. Named parameters can come later if positional ones
   prove too weak.
3. **No `typecheck` for Rust or Go.** `cargo clippy` and `go vet` both
   type-check the code they analyse, so `lint` covers it, and `check` stays
   `fmt-check`, `lint`, `test` for both.
4. **No more verbs in the first version.** `audit` (dependency and security
   scan), `coverage`, `start` (run the built output) and `migrate` (database)
   are candidates. Each needs a project that uses it before it joins the
   list. A project may define any of them now as its own verb.
