# tiered-dirs

Machine-local directories for every product a vendor ships, on Linux, macOS
and Windows.

A program that keeps state on disk needs a directory for it, and the right
one differs by operating system and by kind of state. A vendor that ships
several programs also has to decide which state they share and which they keep
apart. And a test suite must never write into the developer's real home
directory.

`tiered-dirs` answers all three. A caller names a directory on two axes:

- **tier**: who shares the state. `vendor()` is `<vendor>`, shared by
  everything the vendor ships. `suite(key)` is `<vendor>.<key>`, shared by
  the programs of one suite. `standalone(tool)` is the bare `<tool>`, for a
  general tool that is not part of the vendor's suite.
- **home**: how long the state must last. `durable`, `config`, `cache`,
  `state`, `logs` or `runtime`.

`scratch()` sits outside both axes: the platform temp directory.

A **convention** picks the per-OS table the homes come from: `Native` (the
default) or `Xdg`. They differ on macOS only. A caller picks one through
`ResolveOptions`.

It is for a vendor with more than one program, or one program with tests that
must not touch the real home. It computes paths only: it creates, reads and
deletes nothing on disk.

## When not to use it

- One program with one config file. `dirs` or `directories` is enough.
- You want the app framework's own directories, for example Tauri's. Use the
  framework's.

## Install

```sh
cargo add tiered-dirs
```

## Quick start

```rust
use tiered_dirs::{EnvVars, TieredDirs, env_vars};

// Names the override variables: EXAMPLE_ROOT, EXAMPLE_CACHE_DIR and so on.
const ENV: EnvVars = env_vars!("EXAMPLE");

fn main() -> Result<(), tiered_dirs::Error> {
    let dirs = TieredDirs::from_env("com.example", &ENV)?;
    let index = dirs
        .suite("notes")?
        .cache()
        .scoped("vaults", "v7")?
        .app("search")?;
    // macOS:   ~/Library/Caches/com.example.notes/vaults/v7/search
    // Linux:   ~/.cache/com.example.notes/vaults/v7/search
    // Windows: %LOCALAPPDATA%\com.example.notes\vaults\v7\search
    println!("{}", index.path().display());
    Ok(())
}
```

The vendor is the one segment the caller fixes up front. The suite segment
is `vendor + "." + suite_key`. Tiers are distinct addresses: the crate never
reads two tiers and merges them. `Tier::kind()` reports which constructor
produced a tier.

Every segment a caller passes (vendor, suite key, tool, scope kind and key,
app) must be one safe path segment: a leading ASCII letter or digit, then
letters, digits, `.`, `_` or `-`, with no `..`. It must not be `state`, `logs`
or `run`, in any case (see Homes). Anything else is `Error::InvalidKey`.

`examples/layout.rs` prints every directory for one vendor. Run it with
`cargo run --example layout`.

## A general tool supplies its own root

The vendor and suite tiers are for a suite: programs with one owner. A general
tool that the vendor ships into other people's projects is not part of that
suite. `suite("tool")` would write the vendor's name onto a stranger's
machine.

`standalone(tool)` is the tier for that tool. Its segment is the bare tool
name, with no vendor in it. Its config directory is `~/.config/<tool>` on
Linux, and on macOS under `Xdg`. Under `Native` on macOS it is
`~/Library/Application Support/<tool>`.

## The product tier

One program's own directory, keyed by its bundle identifier, is usually
resolved by an app framework such as Tauri. This crate takes no framework
dependency and leaves that tier to a layer above it.
`TieredDirs::is_vendor_bundle_id` checks that a bundle identifier starts with
the vendor, and `assert_vendor_bundle_id` does the same check in debug builds
only. Both are a plain prefix test.

## Homes

| home | Linux (both) | macOS, Native | macOS, Xdg | Windows (both) |
|---|---|---|---|---|
| durable | `~/.local/share` | `~/Library/Application Support` | `~/.local/share` | `%APPDATA%` |
| config | `~/.config` | `~/Library/Application Support` | `~/.config` | `%APPDATA%` |
| cache | `~/.cache` | `~/Library/Caches` | `~/.cache` | `%LOCALAPPDATA%` |
| state | `~/.local/state` | `~/Library/Application Support` | `~/.local/state` | `%LOCALAPPDATA%\state` |
| logs | `~/.local/state` | `~/Library/Logs` | `~/.local/state` | `%APPDATA%\logs` |
| runtime | `$XDG_RUNTIME_DIR`, else `~/.local/share/run` | `~/Library/Application Support/run` | `$XDG_RUNTIME_DIR`, else `~/.local/share/run` | `%APPDATA%\run` |
| scratch | the temp directory | the temp directory | the temp directory | the temp directory |

The XDG paths are defaults: `XDG_DATA_HOME`, `XDG_CONFIG_HOME`,
`XDG_CACHE_HOME`, `XDG_STATE_HOME` and `XDG_RUNTIME_DIR` move them. This crate
reads those variables itself, through the same environment as the override
variables. A relative value is ignored, as the XDG spec says, and `~` is not
expanded. On Windows, `Xdg` means `Native`. The macOS Native and Windows cells
come from the `dirs` crate. Three rules of this crate apply to every cell:

- Logs, state and runtime never go under cache, because the OS may purge
  cache. Where the platform has no logs or runtime directory, they go under
  durable. On Windows state is `%LOCALAPPDATA%\state`: under the same root
  as each tier's cache folder and beside it, never the same folder.
- `state`, `logs` and `run` are reserved, in any case. A tier, scope or app
  segment with one of those names is `Error::InvalidKey`. Otherwise
  `standalone("state").cache()` would be the Windows state root, and
  `standalone("logs").durable()` the Windows logs root.
- Under XDG, logs and state share one directory. Keep their file names apart.
- A missing base directory is `Error::MissingBaseDir`, never a panic.
  Headless CI and sandboxes do not always have a home directory.

## Choosing a convention

- A CLI or developer tool uses `Xdg`. Its users look for `~/.config/<tool>`
  and keep it in their dotfiles.
- A GUI app uses `Native`. macOS users and tools expect
  `~/Library/Application Support`.
- A file that two programs read is resolved in one place, by the program that
  owns it, under that program's convention.

`BaseDirs::from_env` and `TieredDirs::from_env` mean `Native`.
`from_env_opts` takes a `ResolveOptions`; set `Xdg` on it with
`with_convention`. `<P>_CONVENTION=native` or `xdg` overrides the caller's
choice; any other value is `Error::InvalidConvention`. The value is trimmed,
then must match exactly, in lower case. `Convention` also implements
`FromStr`, which takes `native` or `xdg` exactly, for a command-line flag.

`BaseDirs` and `TieredDirs` each read the environment through four
constructors: `from_env`, `from_env_with`, `from_env_opts` and
`from_env_opts_with`. A later knob goes on `ResolveOptions`, not on a new
constructor.

```rust
use tiered_dirs::{Convention, EnvVars, ResolveOptions, TieredDirs, env_vars};

const ENV: EnvVars = env_vars!("DEVTOOL");
const OPTS: ResolveOptions = ResolveOptions::new().with_convention(Convention::Xdg);

fn main() -> Result<(), tiered_dirs::Error> {
    let dirs = TieredDirs::from_env_opts("com.example", &ENV, OPTS)?;
    // ~/.config/devtool on Linux and macOS, %APPDATA%\devtool on Windows.
    println!("{}", dirs.standalone("devtool")?.config().path().display());
    Ok(())
}
```

## Overrides

Every base directory can be moved by an environment variable, on every OS, so
a test or harness can run a whole program inside one scratch root. The caller
names the variables with `EnvVars`, through `env_vars!("<P>")`. Every name
shares that one prefix. In 0.1 there is no public way to pick unrelated names.
For each base directory, the first answer wins:

| order | source | effect |
|---|---|---|
| 1 | `<P>_<HOME>_DIR` | moves one: `<P>_DURABLE_DIR`, `<P>_CONFIG_DIR`, `<P>_CACHE_DIR`, `<P>_STATE_DIR`, `<P>_LOGS_DIR`, `<P>_RUNTIME_DIR`, `<P>_SCRATCH_DIR` |
| 2 | `<P>_ROOT` | the rooted layout: `<root>/durable`, `<root>/config`, `<root>/cache`, `<root>/state`, `<root>/logs`, `<root>/scratch`, and runtime at `<root>/durable/run` |
| 3 | the OS default | the table above, for `<P>_CONVENTION` when set, else the caller's convention |

Runtime follows durable: when `<P>_RUNTIME_DIR` is unset but durable is moved
by step 1 or 2, runtime is `<durable>/run`. An empty variable counts as unset.
A relative path is `Error::RelativeOverride`. On Windows an absolute path has a
drive or a UNC prefix (`C:\state`, `\\server\share`); `\state` alone is
relative to the current drive and is refused.

`BaseDirs::from_env_with` (and `from_env_opts_with`) reads the variables through
a caller's own function, `XDG_*` included, so a test can try every case
without changing the process environment. `BaseDirs::xdg(home, var)` builds
the XDG table under any home, on any OS.
`EnvVars::is_overridden` reports whether any override variable is set.

## Tests never resolve a real home

`from_env` and `from_env_opts`, on `BaseDirs` and on `TieredDirs`, apply two
rules before that order:

- In a test binary that cargo or nextest runs (one in
  `<target>/<profile>/deps/`, run with `CARGO` or `NEXTEST` set), an unset
  `<P>_ROOT` reads as `<temp>/tiered-dirs-test-<pid>-<start nanos>`. Plain
  `cargo test` needs no setup. `test_root()` returns that root. A doc-test,
  or a test binary started directly, gets no such default.
- With `<P>_REQUIRE_OVERRIDE` set, a home that would fall back to the OS
  default is `Error::OverrideRequired`, whose message names the fix. Child
  processes inherit the variable, so a program a test starts fails loudly
  instead of writing to the real home.

`from_env_with` and `from_env_opts_with` apply neither rule, so a test that
means to read the OS defaults calls one of them.

## Scratch

`scratch()` returns the platform temp directory. It wraps
`std::env::temp_dir()` and adds nothing, so a rule such as "no direct OS path
call outside this crate" holds with no exception.

Scratch is not the runtime home. Scratch holds state that does not outlive one
call. Runtime holds state that does outlive it and describes a live process:
a pidfile, a socket, a lock.

## Platforms

Linux, macOS and Windows. The tests run on all three. Other Unix systems
follow the Linux (XDG) rules; they are not tested. On a target with no home
directory at all, such as `wasm32-unknown-unknown`, the OS defaults are
`Error::MissingBaseDir` and only the override variables or
`BaseDirs::rooted` give directories.

Two Windows limits: segments such as `con` or `nul`, which Windows reserves
as device names, are not rejected, and neither is a segment that ends in `.`,
which Windows drops from a file name.

Minimum supported Rust version: 1.85.

## Compared with other crates

| | `tiered-dirs` | `dirs` | `directories` | `etcetera` |
|---|---|---|---|---|
| Per-OS base directories | yes, through `dirs` and its own XDG reading | yes | yes | yes |
| XDG paths on macOS when asked | yes (`Convention::Xdg`) | no | no | yes (`Xdg` strategy) |
| Per-program directories | yes | no | yes (`ProjectDirs`) | yes (app strategy) |
| Directories shared by several programs of one vendor | yes (vendor and suite tiers) | no | no | no |
| Logs directory on macOS | `~/Library/Logs` | no | no | no |
| One override variable per directory, on every OS | yes | no | no | no |
| Keeps cargo tests off the real home by default | yes | no | no | no |

This comparison is from each crate's documentation. On Linux all of them
follow the `XDG_*` variables.

## Parity with the TypeScript twin

A TypeScript twin is developed alongside it and will be published later. Both
are checked against `tests/fixtures/parity.json`. The two must give the same
path for the same tier, home, scope and app, so a Rust program and a
TypeScript program can share state. The fixture holds the cases: tier, home,
scope and app with the expected path, scratch cases, override cases, the XDG
layout under a stub home, and refused convention values. Both
twins run every case with stubbed base directories (`BaseDirs::rooted("/stub")`
here).

## Which test shows what

| Claim | Test |
|---|---|
| Every tier and home gives the fixture's path | `every_case_resolves_to_its_fixture_path`, `every_tier_by_home_pair_has_a_case` |
| A standalone tool and scratch carry no vendor segment | `nothing_outside_the_suite_carries_the_vendor_segment`, `a_standalone_tool_gets_no_vendor_segment` |
| Tiers are distinct addresses | `tiers_are_distinct_addresses` |
| No tier lands on another home's root; `state`, `logs` and `run` are reserved | `no_tier_lands_on_or_above_another_homes_root`, `reserved_names_are_refused_in_any_case` |
| Unsafe segments are refused in every position | `every_rejected_segment_is_rejected_in_every_position`, `keys_reject_separators_dotdot_and_empty` |
| Override order, and runtime follows durable | `every_env_case_resolves_to_its_fixture_paths`, `a_home_var_beats_the_root_var_for_its_own_home_only`, `runtime_follows_an_overridden_durable` |
| The XDG table, and a relative `XDG_*` value is ignored | `every_convention_case_resolves_to_its_fixture_paths`, `the_xdg_layout_reads_its_variables_and_ignores_relative_ones` |
| `<P>_CONVENTION` beats the caller; Xdg is Native on Windows; Linux is the same under both | `every_env_case_resolves_to_its_fixture_paths`, `the_convention_var_beats_the_callers_convention`, `the_xdg_convention_is_the_xdg_table_off_windows` |
| An unknown convention is refused | `every_rejected_convention_is_refused`, `an_unknown_convention_is_refused` |
| A relative override is refused; on Windows `\state` is relative and a UNC path is absolute | `a_relative_override_is_refused`, `a_path_with_no_drive_is_relative_on_windows`, `a_unc_path_is_absolute_on_windows` |
| Runtime, logs and state never sit under cache | `runtime_is_not_cache`, `from_env_resolves_or_errors_without_panicking` |
| A missing base directory is an error | `a_missing_base_dir_is_an_error_not_a_panic` |
| A cargo test binary resolves under the scratch root | `a_cargo_test_binary_resolves_under_the_scratch_root` |
| `<P>_REQUIRE_OVERRIDE` refuses an OS fallback | `require_override_refuses_an_os_fallback_and_names_the_fix` |

Coverage is not measured.

## Stability

0.1 is the first release. The crate stays on 0.x for now. Every public item is
marked "stable in 0.x" in its docs: `BaseDirs`, `Convention`, `Dir`, `EnvVars`,
`env_vars!`, `Error`, `Home`, `ResolveOptions`, `Tier`, `TierKind`,
`TieredDirs`, `assert_vendor_bundle_id`, `is_valid_segment`,
`is_vendor_bundle_id` and `test_root`.

- `Error` and `Convention` are `#[non_exhaustive]`, so a later release can add
  a variant without a breaking change.
- `EnvVars` and `ResolveOptions` are `#[non_exhaustive]` too, so a later
  release can add a field. Build `EnvVars` with `env_vars!` and
  `ResolveOptions` with `new()` or `default()`.
- `Home` is exhaustive on purpose. A new home changes every caller's layout,
  so adding one is a breaking (0.x minor) release.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT License](LICENSE-MIT), at your option.
