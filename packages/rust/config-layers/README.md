# config-layers

Layered config files, in Rust: a project file that is committed and a machine
file that is not, read as YAML and merged key by key.

A program that keeps its settings in a committed project file soon meets a
setting that only makes sense on one computer, such as `~/Developer`. Put it in
the project file and it is wrong for everyone else. Read it from an env var
and nobody can see where it came from. This crate gives the program a second,
uncommitted file for those settings, and the small pieces it needs to read
the two together:

- `machine::MachineConfigFile<T>` finds the machine file at
  `<config home>/<tool>/config.yaml`, lets an env var move it, and loads it
  into your `T`. `load()` never fails: a missing, unreadable or malformed file
  gives `T::default()`. `read_strict()` reports the problem instead, for a
  `doctor` or `config check` command.
- `paths` reads a `paths:` map of named directories from both files (the
  machine's entry wins per name) and replaces `{name}` in any other path
  setting (`substitute_path_names`), so `~/Developer` is written once.
  `resolve_config_path` expands `~` and resolves a relative path against a
  base directory, without touching the file system.
- `value` looks a setting up by dotted key (`checkout.layout`) and says
  whether it counts as set.
- `file` reads a file into a YAML mapping, walks up the directory tree to find
  the project file, and fills the project file's gaps from the machine file.
- `needs` is the check a command runs before it starts: which settings it
  cannot run without, whether they are set, and one message that names the
  command, the key, what the key is for and the file to set it in.

It is for programs, command-line tools among them, that want a project file
and a machine file and clear messages, with your own serde types for the
shape.

The machine file's location comes from [`tiered-dirs`](https://crates.io/crates/tiered-dirs),
which resolves the per-OS config home and its override variables. You build a
`tiered_dirs::TieredDirs` for your vendor and variables and hand it over. The
crate re-exports `tiered_dirs` so you can name the same version.

The settings read from a file are a generic tree of `serde_json::Value` and
`serde_json::Map`, which iterates in sorted key order unless your build turns
on `serde_json`'s `preserve_order` feature. The crate re-exports
`serde_json` too. YAML is read with
[`serde-saphyr`](https://crates.io/crates/serde-saphyr), which no public
signature names.

## Install

```sh
cargo add config-layers
```

## Quick start

```rust
use config_layers::file;
use config_layers::machine::MachineConfigFile;
use config_layers::needs::{KeySpec, Need, Needs, Scope};
use config_layers::serde_json::Value;
use config_layers::tiered_dirs::{BaseDirs, TieredDirs};
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

    // In a real tool: TieredDirs::from_env("com.example",
    //     &tiered_dirs::env_vars!("MYTOOL"), ResolveOptions::new()).
    let dirs = TieredDirs::with_base_dirs("com.example", BaseDirs::rooted(scratch.path()))?;
    let machine = MachineConfigFile::<Machine>::new("mytool", &dirs)?;
    assert_eq!(machine.env(), "MYTOOL_MACHINE_CONFIG");

    // No machine file yet: load() gives the defaults and never fails.
    assert!(machine.load().repos.is_empty());

    // The project file, found by walking up from the working directory.
    std::fs::write(scratch.path().join("mytool.yaml"), "remote: ''\n")?;
    let project_path = file::find_up(scratch.path(), "mytool.yaml").expect("written above");
    let project = Value::Object(file::read_mapping(&project_path)?);

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
project file and a machine file together, substitutes `{name}` path names and checks a
need. Run it with `cargo run --example two_files`.

## Behaviour to know

- **The machine file never fails to load.** `MachineConfigFile::load` gives
  `T::default()` for a missing file, an unreadable file, bad YAML, a document
  that is not a mapping, and a document that does not deserialize as `T`. Give
  every field of `T` a default. `read_strict` returns the specific problem.
- **An empty machine file is empty.** `load` treats an empty document as an
  empty mapping. `read_strict` and `file::read_mapping` report it as
  malformed ("found an empty document"), so a tool can tell the two apart.
- **`load` remembers the file's text** per resolved path, and parses it on
  every call. A changed env var gives a new path and a fresh read. A file
  rewritten in place is not re-read until `clear_cache`. The cache uses a
  `RefCell`, so a `MachineConfigFile` is not
  `Sync`.
- **The env var wins verbatim.** When the variable (default
  `<TOOL>_MACHINE_CONFIG`, from `machine::env_stem`) holds a non-blank path,
  that path is the machine file. A blank value is ignored.
- **Project over machine, one level deep.** `file::overlay_top_level` keeps
  every value the project file sets. The machine value fills only a
  top-level key that is missing or unset in the project file. It does not
  merge nested mappings. The `paths:` map is the exception the tool handles
  with `paths::path_tokens`, which merges by name.
- **What counts as set.** Missing, `null`, an empty or whitespace-only string,
  an empty list and an empty mapping are unset. `false` and `0` are set.
- **Only `true` and `false` are booleans.** `yes`, `no`, `on` and `off` read as
  strings. A scalar key such as `1` reads as the string `"1"`; a list or
  mapping as a key is an error. YAML tags are dropped and the value kept.
- **Errors carry their cause.** `FileProblem` has a `source`: an
  `std::io::Error` for `Unreadable`, and the YAML error (or a plain message
  for an empty document or a top level that is not a mapping) for
  `Malformed`. The `Display` text names the file only, so a reporter that
  walks the chain prints the cause once. No file contents are quoted in an
  error. Downcast the source to `std::io::Error` or `serde_saphyr::Error` to
  look closer (the latter makes your crate depend on `serde-saphyr`); the
  empty and not-a-mapping cases carry only a message.
- **Numbers and keys.** An integer beyond `u64` reads as a lossy float, with
  no error. A null key (`~: x`) is an error.
- **Non-finite numbers and merge keys.** `.inf`, `-.inf`, `.nan` and numbers
  that overflow, such as `1e999`, read as strings, since JSON cannot hold
  them. `<<` is an ordinary key and is not merged, as in `serde_yaml`.
- **Parser limits stay at the library defaults.** `serde-saphyr` caps events,
  aliases and anchors far above any real config file, which also stops an
  alias bomb in a file you did not write.
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
| What counts as set | `missing_null_empty_string_empty_list_and_empty_map_are_unset` (includes a whitespace-only string), `a_non_empty_string_list_or_map_is_set`, `false_and_zero_are_set` |
| Project over machine, one level deep; the machine fills only missing or unset keys | `project_wins_on_an_overlapping_key`, `a_set_project_value_is_kept_even_when_falsy`, `every_unset_project_value_falls_back_to_machine`, `a_project_null_falls_back_to_machine`, `nested_mappings_are_not_merged`, `a_machine_only_key_is_added` |
| Only `true` and `false` are booleans; tags are dropped | `only_true_and_false_are_booleans`, `a_tag_is_dropped_and_its_value_kept`, `scalar_keys_read_as_strings_and_a_collection_key_is_malformed` |
| Non-finite numbers read as strings; `<<` is an ordinary key | `a_non_finite_float_reads_as_a_string_and_the_file_loads`, `a_merge_key_stays_an_ordinary_key` |
| A problem carries its source | `the_problem_carries_its_source_for_a_caller_to_downcast`, `read_strict_reports_an_empty_file_and_carries_its_source` |
| An error quotes no file contents and does not repeat its source | `an_error_does_not_quote_the_files_lines`, `display_does_not_repeat_the_source` |
| An empty machine file gives the serde field defaults | `an_empty_or_comment_only_file_gives_the_field_defaults` |
| The need message names the command, key, purpose, flag and file | `names_the_command_the_key_its_purpose_the_stand_in_and_the_project_file`, `a_camel_case_stand_in_renders_as_a_kebab_case_flag_no_command_is_this_command`, `a_key_both_files_carry_the_file_you_stand_in_leads_the_other_follows` |

Coverage is not measured.

## Platforms

The code uses only the standard library, `serde`, `serde_json`, `serde-saphyr`,
`thiserror` and `tiered-dirs`, has no platform-specific code of its own, and is written for
Linux, macOS and Windows. CI runs the tests on all three. Where the config home
is on each OS is `tiered-dirs`' table.

Minimum supported Rust version: 1.89, the version `serde-saphyr` needs. It is
the MSRV of the whole workspace.

## When not to use it

- You want config from many sources (env vars, several file formats,
  defaults in code) merged into one struct. `config` and `figment` do that.
  This crate layers two YAML files.
- You want one config file per user with load and save. `confy` does that.
- You need TOML or JSON files. This crate reads YAML only.
- You need to write config files. This crate only reads.

## Compared with other crates

| | `config-layers` | `config` | `figment` | `confy` |
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

The crate stays on 0.x for now. Every public item is marked "stable in 0.x"
in its docs: `FileProblem`, `read_mapping`, `find_up`, `overlay_top_level`,
`resolve_paths_at`, `env_stem`, `MachineConfigFile`, `Scope`, `KeySpec`,
`Need`, `KeyScopes`, `Needs`, `resolve_config_path`, `PathTokens`,
`path_tokens`, `TokenError`, `substitute_path_names`,
`substitute_path_names_with_hint`, `value_at`, `value_is_set`, and the
re-exports `tiered_dirs` and `serde_json`. A breaking change to one of them
ships only in a new 0.x minor release, with a CHANGELOG entry.

- `FileProblem` and `Scope` are `#[non_exhaustive]`, so a later release can
  add a variant without a breaking change. A `match` on one needs a `_` arm.
- `KeySpec` and `Need` are plain structs you build with struct literals in a
  `static` table. Adding a field to one is a breaking change, so it would ship
  in a new 0.x minor release.
- The re-exports follow their crates: a new `tiered-dirs` minor release, or a
  new major `serde_json`, is a new minor release of this crate.
- The public API names no YAML crate type. A YAML error is a boxed
  `std::error::Error` in `FileProblem`, so changing the YAML crate does not
  change the API.

`tests/stability.rs` checks that every item carries the marker and that this
section names it.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT License](LICENSE-MIT), at your option.
