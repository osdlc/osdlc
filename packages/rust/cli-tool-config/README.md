# cli-tool-config

Config files for a command-line tool, in Rust: a committed project file and a
per-machine file, read as YAML.

A tool that keeps its settings in a committed project file soon meets a
setting that only makes sense on one machine, such as `~/Developer`. Put it in
the project file and it is wrong for everyone else. Read it from an env var
and nobody can see where it came from. This crate gives the tool a second,
uncommitted file for those settings, and the small pieces a tool needs to read
the two together:

- `machine::MachineConfigFile<T>` finds the machine file at
  `<config home>/<tool>/config.yaml`, lets an env var move it, and loads it
  into your `T`. `load()` never fails: a missing, unreadable or malformed file
  gives `T::default()`. `read_strict()` reports the problem instead, for a
  `doctor` or `config check` command.
- `paths` reads a `paths:` map of named directories from both files (the
  machine's entry wins per name) and expands `{name}` tokens in any other
  path setting, so `~/Developer` is written once. `resolve_config_path`
  expands `~` and resolves a relative path against a base directory, without
  touching the file system.
- `value` looks a setting up by dotted key (`checkout.layout`) and says
  whether it counts as set.
- `file` reads a file into a YAML mapping, walks up the directory tree to find
  the project file, and overlays the machine file onto the project file.
- `needs` is the check a command runs before it starts: which settings it
  cannot run without, whether they are set, and one message that names the
  command, the key, what the key is for and the file to set it in.

It is for small command-line tools that want a project file and a machine file
and clear messages, with your own serde types for the shape.

The machine file's location comes from [`tiered-dirs`](https://crates.io/crates/tiered-dirs),
which resolves the per-OS config home and its override variables. You build a
`tiered_dirs::TieredDirs` for your vendor and variables and hand it over. The
crate re-exports `tiered_dirs` so you can name the same version.

## Install

```sh
cargo add cli-tool-config
```

## Quick start

```rust
use cli_tool_config::file;
use cli_tool_config::machine::MachineConfigFile;
use cli_tool_config::needs::{KeySpec, Need, Needs, Scope};
use cli_tool_config::tiered_dirs::{BaseDirs, TieredDirs};
use serde::Deserialize;

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Machine {
    repos: Vec<String>,
}

static KEYS: &[KeySpec] = &[KeySpec {
    key: "remote",
    scope: Scope::Project,
    description: "The git remote to push to.",
}];

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let scratch = tempfile::tempdir()?;

    // In a real tool: TieredDirs::from_env("com.example", &ENV, ResolveOptions::new()),
    // with ENV = tiered_dirs::env_vars!("MYTOOL").
    let dirs = TieredDirs::with_base_dirs("com.example", BaseDirs::rooted(scratch.path()))?;
    let machine = MachineConfigFile::<Machine>::new("mytool", &dirs)?;
    assert_eq!(machine.env(), "MYTOOL_MACHINE_CONFIG");

    // No machine file yet: load() gives the defaults and never fails.
    assert!(machine.load().repos.is_empty());

    // The project file, found by walking up from the working directory.
    std::fs::write(scratch.path().join("mytool.yaml"), "remote: ''\n")?;
    let project_path = file::find_up(scratch.path(), "mytool.yaml").expect("written above");
    let project = serde_yaml::Value::Mapping(file::read_mapping(&project_path)?);

    // The command needs `remote`, and an empty string does not count.
    let needs = Needs::new("mytool", "mytool.yaml", KEYS, machine.path(), None);
    let need = Need { config: "remote", unless_input: Some("remote") };
    let no_flags = |_: &str| false;
    assert!(!needs.met(&need, Some(&project), None, &no_flags));

    let message = needs.message(&need, scratch.path(), &["push"]);
    assert!(message.starts_with("`mytool push` needs `remote`, and it is not set (or pass --remote)."));
    Ok(())
}
```

The example uses the `tempfile` crate for a scratch directory and `serde` with
the `derive` feature. It runs as a doc-test. `examples/two_files.rs` reads a
project file and a machine file together, expands `{name}` tokens and checks a
need. Run it with `cargo run --example two_files`.

## Behaviour to know

- **The machine file never fails to load.** `MachineConfigFile::load` gives
  `T::default()` for a missing file, an unreadable file, bad YAML, a document
  that is not a mapping, and a document that does not deserialize as `T`. Give
  every field of `T` a default. `read_strict` returns the specific problem.
- **An empty machine file is empty.** `load` treats an empty document as an
  empty mapping. `read_strict` and `file::read_mapping` report it as
  malformed ("found an empty document"), so a tool can tell the two apart.
- **`load` is memoised** per resolved path. A changed env var gives a new
  path and a fresh read. A file rewritten in place is not re-read until
  `clear_cache`. The memo uses a `RefCell`, so a `MachineConfigFile` is not
  `Sync`.
- **The env var wins verbatim.** When the variable (default
  `<TOOL>_MACHINE_CONFIG`, from `machine::env_stem`) holds a non-blank path,
  that path is the machine file. A blank value is ignored.
- **Project over machine, one level deep.** `file::overlay_top_level` takes a
  machine value only for a top-level key the project leaves unset. It does not
  merge nested mappings. The `paths:` map is the exception the tool handles
  with `paths::path_tokens`, which merges by name.
- **What counts as set.** Missing, `null`, an empty or blank string, an empty
  list and an empty mapping are unset. `false` and `0` are set.
- **What counts as a path.** `resolve_config_path` treats a value as a path
  when it contains `/` or starts with `.` or `~`. A URL (`scheme://`) and a
  bare word pass through unchanged. Write relative paths with `/`, also on
  Windows. An absolute Windows path such as `C:\repos` passes through
  unchanged.
- **An unknown `{name}` is an error**, not an empty string. The message names
  the setting, the fix and the names that exist.

## Which test shows what

| Claim | Test |
|---|---|
| The machine file lives under the standalone config home; a non-blank env var wins | `lives_under_the_standalone_config_home_and_a_non_blank_override_wins`, `the_env_var_relocates_the_file` |
| `load` gives defaults for a missing file and for every bad document | `missing_file_returns_defaults`, `an_invalid_document_degrades_to_defaults_rather_than_throwing` |
| `load` is memoised per path until `clear_cache` | `the_value_is_memoised_per_path_until_clear_cache`, `a_valid_file_is_read_and_re_read_when_the_path_changes` |
| `read_strict` reports what `load` hides | `read_strict_reports_what_load_hides` |
| An invalid tool name is an error | `an_invalid_tool_name_is_an_error` |
| The machine's `paths:` entry wins per name, and every token is absolute | `the_machine_entry_wins_per_name_and_every_value_is_absolute` |
| `~` and relative paths resolve without touching the file system; URLs and bare words pass through | `expands_tilde_and_resolves_a_relative_path_against_the_base`, `leaves_alone_what_is_not_a_path_a_url_a_bare_word`, `normalizes_dot_dot_without_touching_the_filesystem` |
| An unknown `{name}` is an error naming the setting, the fix and what exists | `an_unknown_name_is_an_error_naming_the_setting_the_fix_and_what_exists`, `omits_the_parenthetical_when_no_tokens_are_known`, `the_tool_names_its_own_files_in_the_hint` |
| What counts as set | `missing_null_empty_string_empty_list_and_empty_map_are_unset`, `a_non_empty_string_list_or_map_is_set`, `false_and_zero_are_set` |
| Project over machine, one level deep | `project_wins_on_an_overlapping_key`, `a_project_null_falls_back_to_machine`, `a_machine_only_key_is_added` |
| The need message names the command, key, purpose, flag and file | `names_the_command_the_key_its_purpose_the_stand_in_and_the_project_file`, `a_camel_case_stand_in_renders_as_a_kebab_case_flag_no_command_is_this_command`, `a_key_both_files_carry_the_file_you_stand_in_leads_the_other_follows` |

Coverage is not measured.

## Platforms

The code uses only the standard library, `serde`, `serde_yaml`, `thiserror`
and `tiered-dirs`, has no platform-specific code of its own, and is written for
Linux, macOS and Windows. CI runs the tests on all three. Where the config home
is on each OS is `tiered-dirs`' table.

Minimum supported Rust version: 1.85, checked by running the tests on 1.85.

## When not to use it

- You want layered config from many sources (env vars, several file formats,
  defaults in code) merged into one struct. `config` and `figment` do that.
- You want one config file per user with load and save. `confy` does that.
- You need TOML or JSON files. This crate reads YAML only.
- You need to write config files. This crate only reads.

## Compared with other crates

| | `cli-tool-config` | `config` | `figment` | `confy` |
|---|---|---|---|---|
| Project file plus per-machine file | yes | build it from sources | build it from providers | one file |
| Machine file location per OS | yes, through `tiered-dirs` | no | no | yes |
| Loading never fails, falls back to defaults | yes, plus a strict read | no | no | no |
| `{name}` path tokens | yes | no | no | no |
| "Command needs this setting" check and message | yes | no | no | no |
| Formats | YAML | many | many | TOML, YAML and more |
| Writes files | no | no | no | yes |

This comparison is from each crate's documentation. Pick `config` or `figment`
for general layered configuration. Pick this crate when a command-line tool
wants the project and machine split and the messages that go with it.

## Stability

0.5 is the first published release, and the crate stays on 0.x for now. Every
public item is marked "stable in 0.x" in its docs: it is not expected to change,
and a breaking change would ship as 0.6. There are no unstable items. The 20
items are:

- `file`: `FileProblem`, `read_mapping`, `find_up`, `overlay_top_level`,
  `resolve_paths_at`
- `machine`: `env_stem`, `MachineConfigFile`
- `needs`: `Scope`, `KeySpec`, `Need`, `KeyScopes`, `Needs`
- `paths`: `resolve_config_path`, `PathTokens`, `path_tokens`, `TokenError`,
  `expand_tokens`, `expand_tokens_with_hint`
- `value`: `value_at`, `value_is_set`

The re-export `tiered_dirs` follows `tiered-dirs` 0.3: a move to its 0.4
would be a 0.7 release of this crate.

`tests/stability.rs` checks that every item carries the marker and that this
list names it. `file::FileProblem` and
`needs::Scope` are `#[non_exhaustive]`, so a later release can add a variant
without a breaking change. `needs::KeySpec` and `needs::Need` are plain
structs you build with struct literals in a `static` table, so they will not
gain fields in 0.5.

The public API takes and returns `serde_yaml` values. `serde_yaml` is no
longer maintained upstream. A move to a maintained YAML crate would change
those types and ship as 0.6.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT License](LICENSE-MIT), at your option.
