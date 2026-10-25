//! Configuration loading, plus a conformance test against a checked-in
//! `tradecraft.yaml`.
//!
//! Every case that touches `TRADECRAFT_MACHINE_CONFIG` — which is every
//! `load_config`/`machine_config_path` case — runs under
//! [`common::with_machine_env`].

mod common;

use std::fs;
use std::path::{Path, PathBuf};

use common::with_machine_env;
use tradecraft::config::{
    ConfigLoad, PROJECT_FILE, load_config, machine_config_path, resolve_against_cwd,
    resolve_configured_path,
};

/// A fresh scratch dir plus the (not-yet-created) machine file path inside
/// it.
struct Fixture {
    dir: tempfile::TempDir,
    machine_path: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let dir = tempfile::tempdir().unwrap();
        let machine_path = dir.path().join("machine").join("config.yaml");
        Self { dir, machine_path }
    }

    fn path(&self) -> &Path {
        self.dir.path()
    }

    fn write_machine(&self, yaml: &str) {
        fs::create_dir_all(self.machine_path.parent().unwrap()).unwrap();
        fs::write(&self.machine_path, yaml).unwrap();
    }

    fn project_file(&self) -> PathBuf {
        self.path().join(PROJECT_FILE)
    }

    fn write_project(&self, yaml: &str) {
        fs::write(self.project_file(), yaml).unwrap();
    }

    /// Run `f` with `TRADECRAFT_MACHINE_CONFIG` relocated to this
    /// fixture's machine file.
    fn run<T>(&self, f: impl FnOnce() -> T) -> T {
        with_machine_env(Some(&self.machine_path), f)
    }
}

fn home() -> PathBuf {
    PathBuf::from(std::env::var("HOME").expect("HOME must be set to run these tests"))
}

mod machine_config_path_tests {
    use super::*;

    #[test]
    fn is_the_standalone_config_home_for_this_tool() {
        with_machine_env(None, || {
            let expected = tradecraft::dirs::system()
                .unwrap()
                .standalone("tradecraft")
                .unwrap()
                .config()
                .path()
                .join("config.yaml");
            assert_eq!(machine_config_path(), expected);
        });
    }

    #[test]
    fn the_env_var_relocates_it() {
        let fx = Fixture::new();
        fx.run(|| {
            assert_eq!(machine_config_path(), fx.machine_path);
        });
    }
}

mod resolve_configured_path_tests {
    use super::*;

    #[test]
    fn an_absolute_path_is_used_as_given() {
        assert_eq!(
            resolve_configured_path("/abs/path", Path::new("/anywhere")),
            PathBuf::from("/abs/path")
        );
    }

    #[test]
    fn a_relative_path_resolves_against_base_dir_not_cwd() {
        assert_eq!(
            resolve_configured_path("../vault", Path::new("/a/b/configs")),
            PathBuf::from("/a/b/vault")
        );
    }

    #[test]
    fn a_bare_name_is_still_a_relative_path() {
        assert_eq!(
            resolve_configured_path("vault", Path::new("/a/b")),
            PathBuf::from("/a/b/vault")
        );
    }

    #[test]
    fn a_tilde_prefixed_path_expands_against_home() {
        let fx = Fixture::new();
        let resolved = resolve_configured_path("~/vault", fx.path());
        assert!(resolved.is_absolute());
        assert!(resolved.ends_with("vault"));
        assert!(!resolved.to_string_lossy().contains('~'));
    }
}

mod resolve_against_cwd_tests {
    use super::*;

    #[test]
    fn a_relative_path_resolves_against_the_given_cwd_not_the_config_file() {
        assert_eq!(
            resolve_against_cwd("dest", Path::new("/work/dir")),
            PathBuf::from("/work/dir/dest")
        );
    }
}

/// Tested directly against
/// `config_layers::file::find_up`, the primitive `load_config` uses, since
/// this crate exposes no standalone wrapper for it.
mod find_project_file_tests {
    use super::*;

    #[test]
    fn walks_up_from_cwd_to_the_nearest_tradecraft_yaml() {
        let fx = Fixture::new();
        let nested = fx.path().join("a").join("b").join("c");
        fs::create_dir_all(&nested).unwrap();
        fs::write(fx.path().join("a").join(PROJECT_FILE), "vault: v\n").unwrap();
        assert_eq!(
            config_layers::file::find_up(&nested, PROJECT_FILE),
            Some(fx.path().join("a").join(PROJECT_FILE))
        );
    }

    #[test]
    fn none_when_none_is_above() {
        let fx = Fixture::new();
        assert_eq!(config_layers::file::find_up(fx.path(), PROJECT_FILE), None);
    }
}

mod load_config_tests {
    use super::*;

    #[test]
    fn absent_no_project_file_and_no_machine_vault_leaves_flag_only_mode_possible() {
        let fx = Fixture::new();
        fx.run(|| match load_config(None, fx.path()) {
            ConfigLoad::Absent { path } => assert_eq!(path, fx.machine_path),
            other => panic!("expected Absent, got a different kind: {}", kind(&other)),
        });
    }

    #[test]
    fn missing_explicit_config_names_a_file_that_is_not_there() {
        let fx = Fixture::new();
        fx.run(|| {
            let missing = fx.path().join("nope.yaml");
            match load_config(Some(missing.to_str().unwrap()), fx.path()) {
                ConfigLoad::MissingExplicit { .. } => {}
                other => panic!("expected MissingExplicit, got {}", kind(&other)),
            }
        });
    }

    #[test]
    fn loaded_the_nearest_project_file_above_cwd_is_read_and_its_dir_is_the_base() {
        let fx = Fixture::new();
        let nested = fx.path().join("deep").join("er");
        fs::create_dir_all(&nested).unwrap();
        fx.write_project("vault: ../vault\ndestinations:\n  - root: ../proj\n    target: claude\n");
        fx.run(|| match load_config(None, &nested) {
            ConfigLoad::Loaded { config, path, dir } => {
                assert_eq!(config.vault.as_deref(), Some("../vault"));
                assert_eq!(config.destinations.len(), 1);
                assert_eq!(config.destinations[0].root, "../proj");
                assert_eq!(config.destinations[0].target, "claude");
                assert_eq!(dir, fx.path());
                assert_eq!(path, fx.project_file());
            }
            other => panic!("expected Loaded, got {}", kind(&other)),
        });
    }

    #[test]
    fn loaded_the_machine_file_alone_carries_a_run_when_no_project_file_is_above() {
        let fx = Fixture::new();
        fx.write_machine(
            "vault: ~/notes\ndestinations:\n  - root: ~/.claude\n    target: claude\n",
        );
        fx.run(|| match load_config(None, fx.path()) {
            ConfigLoad::Loaded { config, path, .. } => {
                assert_eq!(config.vault.as_deref(), Some("~/notes"));
                assert_eq!(config.destinations[0].root, "~/.claude");
                assert_eq!(path, fx.machine_path);
            }
            other => panic!("expected Loaded, got {}", kind(&other)),
        });
    }

    #[test]
    fn layering_the_machine_file_stands_in_for_vault_and_destinations_left_unset() {
        let fx = Fixture::new();
        fx.write_machine(
            "vault: /machine/vault\ndestinations:\n  - root: /m/dest\n    target: claude\n",
        );
        fx.write_project("namespace: x\n");
        fx.run(
            || match load_config(Some(fx.project_file().to_str().unwrap()), fx.path()) {
                ConfigLoad::Loaded { config, .. } => {
                    assert_eq!(config.vault.as_deref(), Some("/machine/vault"));
                    assert_eq!(config.destinations[0].root, "/m/dest");
                    assert_eq!(config.namespace.as_deref(), Some("x"));
                }
                other => panic!("expected Loaded, got {}", kind(&other)),
            },
        );
    }

    #[test]
    fn layering_a_project_file_that_sets_them_wins_over_the_machine_file() {
        let fx = Fixture::new();
        fx.write_machine(
            "vault: /machine/vault\ndestinations:\n  - root: /m/dest\n    target: claude\n",
        );
        fx.write_project("vault: /p/vault\ndestinations:\n  - root: /p/dest\n    target: codex\n");
        fx.run(
            || match load_config(Some(fx.project_file().to_str().unwrap()), fx.path()) {
                ConfigLoad::Loaded { config, .. } => {
                    assert_eq!(config.vault.as_deref(), Some("/p/vault"));
                    assert_eq!(config.destinations[0].root, "/p/dest");
                    assert_eq!(config.destinations[0].target, "codex");
                }
                other => panic!("expected Loaded, got {}", kind(&other)),
            },
        );
    }

    #[test]
    fn paths_a_name_token_from_either_file_expands_in_every_path_valued_setting() {
        let fx = Fixture::new();
        fx.write_machine("paths:\n  dev: /work/me/dev\n");
        fx.write_project(
            "paths:\n  notes: ~/notes\n\
             vault: '{notes}/vault'\n\
             scan_locations:\n  - '{dev}/skills'\n\
             destinations:\n  - root: '{dev}/proj'\n    target: claude\n\
             marketplace:\n  out: '{dev}/market'\n  skills_root: '{notes}/skills'\n",
        );
        fx.run(
            || match load_config(Some(fx.project_file().to_str().unwrap()), fx.path()) {
                ConfigLoad::Loaded { config, .. } => {
                    assert_eq!(
                        config.vault,
                        Some(
                            home()
                                .join("notes")
                                .join("vault")
                                .to_string_lossy()
                                .into_owned()
                        )
                    );
                    assert_eq!(
                        config.scan_locations,
                        vec!["/work/me/dev/skills".to_string()]
                    );
                    assert_eq!(config.destinations[0].root, "/work/me/dev/proj");
                    assert_eq!(
                        config.marketplace.out.as_deref(),
                        Some("/work/me/dev/market")
                    );
                    assert_eq!(
                        config.marketplace.skills_root,
                        Some(
                            home()
                                .join("notes")
                                .join("skills")
                                .to_string_lossy()
                                .into_owned()
                        )
                    );
                }
                other => panic!("expected Loaded, got {}", kind(&other)),
            },
        );
    }

    #[test]
    fn assets_a_from_path_expands_a_name_token_and_to_and_plugin_pass_through() {
        let fx = Fixture::new();
        fx.write_machine("paths:\n  dev: /work/me/dev\n");
        fx.write_project(
            "assets:\n  - from: '{dev}/cli/sdlc'\n    to: cli/sdlc\n  \
             - from: launcher\n    to: cli/launcher\n    plugin: other\n",
        );
        fx.run(
            || match load_config(Some(fx.project_file().to_str().unwrap()), fx.path()) {
                ConfigLoad::Loaded { config, .. } => {
                    assert_eq!(config.assets.len(), 2);
                    assert_eq!(config.assets[0].from, "/work/me/dev/cli/sdlc");
                    assert_eq!(config.assets[0].to, "cli/sdlc");
                    assert_eq!(config.assets[0].plugin, None);
                    assert_eq!(config.assets[1].from, "launcher");
                    assert_eq!(config.assets[1].plugin.as_deref(), Some("other"));
                }
                other => panic!("expected Loaded, got {}", kind(&other)),
            },
        );
    }

    #[test]
    fn assets_an_unknown_field_on_an_entry_is_refused_by_name() {
        let fx = Fixture::new();
        fx.write_project("assets:\n  - from: cli/sdlc\n    to: cli/sdlc\n    typo: x\n");
        fx.run(
            || match load_config(Some(fx.project_file().to_str().unwrap()), fx.path()) {
                ConfigLoad::Malformed { detail, .. } => {
                    assert!(detail.contains("typo"), "{detail}");
                }
                other => panic!("expected Malformed, got {}", kind(&other)),
            },
        );
    }

    #[test]
    fn paths_a_token_nothing_defines_is_malformed_naming_the_setting() {
        let fx = Fixture::new();
        fx.write_project("vault: '{nowhere}/vault'\n");
        fx.run(
            || match load_config(Some(fx.project_file().to_str().unwrap()), fx.path()) {
                ConfigLoad::Malformed { detail, .. } => {
                    assert!(detail.contains("nowhere"), "{detail}");
                    assert!(detail.contains("vault:"), "{detail}");
                }
                other => panic!("expected Malformed, got {}", kind(&other)),
            },
        );
    }

    #[test]
    fn malformed_invalid_yaml_is_reported_never_partially_read() {
        let fx = Fixture::new();
        fx.write_project("vault: [unclosed\n");
        fx.run(
            || match load_config(Some(fx.project_file().to_str().unwrap()), fx.path()) {
                ConfigLoad::Malformed { .. } => {}
                other => panic!("expected Malformed, got {}", kind(&other)),
            },
        );
    }

    #[test]
    fn malformed_an_unknown_key_is_refused_by_name_the_schema_is_strict() {
        let fx = Fixture::new();
        fx.write_project("vault: /v\nschema_version: 1\n");
        fx.run(
            || match load_config(Some(fx.project_file().to_str().unwrap()), fx.path()) {
                ConfigLoad::Malformed { detail, .. } => {
                    assert!(detail.contains("schema_version"), "{detail}");
                }
                other => panic!("expected Malformed, got {}", kind(&other)),
            },
        );
    }

    #[test]
    fn malformed_a_machine_file_that_cannot_be_read_is_reported_not_degraded_to_no_vault() {
        let fx = Fixture::new();
        fx.write_machine("vault: true\n");
        fx.run(|| match load_config(None, fx.path()) {
            ConfigLoad::Malformed { path, detail } => {
                assert_eq!(path, fx.machine_path);
                assert!(detail.contains("vault"), "{detail}");
            }
            other => panic!("expected Malformed, got {}", kind(&other)),
        });
    }

    #[test]
    fn an_empty_project_file_loads_as_all_defaults() {
        let fx = Fixture::new();
        fx.write_project("");
        match load(&fx) {
            ConfigLoad::Loaded { config, .. } => {
                assert_eq!(config.vault, None);
                assert!(config.destinations.is_empty());
                assert_eq!(
                    config.marketplace,
                    tradecraft::config::MarketplaceSettings::default()
                );
            }
            other => panic!("expected Loaded, got {}", kind(&other)),
        }
    }

    /// A comment-only file also reads as all defaults.
    #[test]
    fn a_comment_only_project_file_loads_as_all_defaults() {
        let fx = Fixture::new();
        fx.write_project("# nothing set yet\n");
        match load(&fx) {
            ConfigLoad::Loaded { config, .. } => assert_eq!(config.vault, None),
            other => panic!("expected Loaded, got {}", kind(&other)),
        }
    }

    #[test]
    fn an_empty_or_comment_only_machine_file_loads_as_defaults() {
        for text in ["", "# nothing set yet\n"] {
            let fx = Fixture::new();
            fx.write_machine(text);
            fx.write_project("vault: /v\n");
            match load(&fx) {
                ConfigLoad::Loaded { config, .. } => {
                    assert_eq!(config.vault.as_deref(), Some("/v"))
                }
                other => panic!("expected Loaded, got {}", kind(&other)),
            }
        }
    }

    #[test]
    fn a_struct_typed_key_with_the_wrong_shape_is_malformed() {
        let cases = [
            ("declared_folders", "declared_folders: []\n"),
            ("declared_folders", "declared_folders: x\n"),
            ("destinations", "destinations: [claude]\n"),
            ("assets", "assets: [a.txt]\n"),
            ("hooks", "hooks: [hooks.json]\n"),
            ("marketplace", "marketplace: []\n"),
        ];
        for (key, yaml) in cases {
            let fx = Fixture::new();
            fx.write_project(&format!("vault: /v\n{yaml}"));
            match load(&fx) {
                ConfigLoad::Malformed { detail, .. } => {
                    assert!(detail.contains(key), "{yaml}: {detail}")
                }
                other => panic!("{yaml}: expected Malformed, got {}", kind(&other)),
            }
        }
    }

    #[test]
    fn a_wrong_shape_in_the_machine_file_is_malformed() {
        let cases = [
            ("declared_folders", "declared_folders: []\n"),
            ("declared_folders", "declared_folders: x\n"),
            ("destinations", "destinations: [claude]\n"),
            ("assets", "assets: [a.txt]\n"),
            ("hooks", "hooks: [hooks.json]\n"),
            ("marketplace", "marketplace: []\n"),
        ];
        for (key, yaml) in cases {
            let fx = Fixture::new();
            fx.write_machine(yaml);
            fx.write_project("vault: /v\n");
            match load(&fx) {
                ConfigLoad::Malformed { detail, .. } => {
                    assert!(detail.contains(key), "{yaml}: {detail}")
                }
                other => panic!("{yaml}: expected Malformed, got {}", kind(&other)),
            }
        }
    }

    #[test]
    fn namespace_an_absent_key_stays_absent() {
        let fx = Fixture::new();
        fx.write_project("vault: /v\n");
        match load(&fx) {
            ConfigLoad::Loaded { config, .. } => assert_eq!(config.namespace, None),
            other => panic!("expected Loaded, got {}", kind(&other)),
        }
    }

    #[test]
    fn namespace_a_non_string_is_malformed_but_an_unvetted_string_is_not_this_modules_business() {
        let fx = Fixture::new();
        fx.write_project("vault: /v\nnamespace: true\n");
        match load(&fx) {
            ConfigLoad::Malformed { detail, .. } => {
                assert!(detail.contains("namespace"), "{detail}")
            }
            other => panic!("expected Malformed, got {}", kind(&other)),
        }

        fx.write_project("vault: /v\nnamespace: my-vault\n");
        match load(&fx) {
            ConfigLoad::Loaded { .. } => {}
            other => panic!("expected Loaded, got {}", kind(&other)),
        }
    }

    /// The marketplace-wide license is a project-file key in its own right,
    /// not a per-plugin override, so a distribution licensed as a whole says
    /// so once here too.
    #[test]
    fn marketplace_carries_a_license_for_every_plugin_under_it() {
        let fx = Fixture::new();
        fx.write_project(
            "vault: /v\nmarketplace:\n  name: demo\n  default_plugin: tools\n  out: ./market\n  license: MIT\n",
        );
        match load(&fx) {
            ConfigLoad::Loaded { config, .. } => {
                assert_eq!(config.marketplace.license.as_deref(), Some("MIT"));
            }
            other => panic!("expected Loaded, got {}", kind(&other)),
        }
    }

    #[test]
    fn marketplace_the_block_loads_whole_the_core_decides_what_it_requires() {
        let fx = Fixture::new();
        fx.write_project(
            "vault: /v\nmarketplace:\n  name: demo\n  default_plugin: tools\n  out: ./market\n  plugins:\n    tools:\n      license: MIT\n",
        );
        match load(&fx) {
            ConfigLoad::Loaded { config, .. } => {
                assert_eq!(config.marketplace.name.as_deref(), Some("demo"));
                let plugins = config.marketplace.plugins.as_ref().unwrap();
                assert_eq!(
                    plugins
                        .get("tools")
                        .unwrap()
                        .get("license")
                        .and_then(|v| v.as_str()),
                    Some("MIT")
                );
            }
            other => panic!("expected Loaded, got {}", kind(&other)),
        }

        for not_an_object in [
            "marketplace: []\n",
            "marketplace: demo\n",
            "marketplace: 3\n",
            "marketplace:\n",
            "declared_folders: []\n",
            "declared_folders: demo\n",
            "declared_folders: 3\n",
        ] {
            fx.write_project(&format!("vault: /v\n{not_an_object}"));
            match load(&fx) {
                ConfigLoad::Malformed { detail, .. } => {
                    assert!(
                        detail.contains("marketplace") || detail.contains("declared_folders"),
                        "{detail}"
                    );
                }
                other => panic!("expected Malformed, got {}", kind(&other)),
            }
        }
    }

    #[test]
    fn an_empty_declared_folders_key_loads_as_unset() {
        let fx = Fixture::new();
        fx.write_project("vault: /v\ndeclared_folders:\n");
        match load(&fx) {
            ConfigLoad::Loaded { config, .. } => {
                assert!(config.declared_folders.is_none());
            }
            other => panic!("expected Loaded, got {}", kind(&other)),
        }
    }

    #[test]
    fn an_explicit_config_files_relative_paths_resolve_against_its_own_directory_not_cwd() {
        let fx = Fixture::new();
        let nested = fx.path().join("configs");
        fs::create_dir_all(&nested).unwrap();
        let config_path = nested.join("repo.yaml");
        fs::write(
            &config_path,
            "vault: ../vault\ndestinations:\n  - root: ../demo-project\n    target: claude\n",
        )
        .unwrap();
        let elsewhere = Path::new("/somewhere/else/entirely");
        fx.run(
            || match load_config(Some(config_path.to_str().unwrap()), elsewhere) {
                ConfigLoad::Loaded { config, dir, .. } => {
                    assert_eq!(
                        resolve_configured_path(config.vault.as_deref().unwrap(), &dir),
                        fx.path().join("vault")
                    );
                    assert_eq!(
                        resolve_configured_path(&config.destinations[0].root, &dir),
                        fx.path().join("demo-project")
                    );
                }
                other => panic!("expected Loaded, got {}", kind(&other)),
            },
        );
    }
}

/// Conformance: the fixture project file `tests/fixtures/tradecraft.yaml`
/// deserializes cleanly with its real values.
#[test]
fn the_fixture_project_file_loads_cleanly() {
    let fixture_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures");
    let fixture_dir = fixture_dir.canonicalize().unwrap();
    assert!(
        fixture_dir.join(PROJECT_FILE).is_file(),
        "expected {} to exist",
        fixture_dir.join(PROJECT_FILE).display()
    );

    // Relocate the machine file so this test never depends on the machine
    // it runs on.
    let empty = tempfile::tempdir().unwrap();
    with_machine_env(
        Some(&empty.path().join("config.yaml")),
        || match load_config(None, &fixture_dir) {
            ConfigLoad::Loaded { config, path, dir } => {
                assert_eq!(dir, fixture_dir);
                assert_eq!(path, fixture_dir.join(PROJECT_FILE));
                assert_eq!(config.vault.as_deref(), Some("vault"));
                assert_eq!(
                    config.marketplace.default_plugin.as_deref(),
                    Some("dev-agent")
                );
                assert_eq!(
                    config.marketplace.out.as_deref(),
                    Some("published/marketplaces/studio")
                );
            }
            other => panic!("expected Loaded, got {}", kind(&other)),
        },
    );
}

/// Loads the fixture's project file inside the fixture's env.
fn load(fx: &Fixture) -> ConfigLoad {
    fx.run(|| load_config(Some(fx.project_file().to_str().unwrap()), fx.path()))
}

fn kind(load: &ConfigLoad) -> &'static str {
    match load {
        ConfigLoad::Loaded { .. } => "Loaded",
        ConfigLoad::Absent { .. } => "Absent",
        ConfigLoad::MissingExplicit { .. } => "MissingExplicit",
        ConfigLoad::Unreadable { .. } => "Unreadable",
        ConfigLoad::Malformed { .. } => "Malformed",
    }
}
