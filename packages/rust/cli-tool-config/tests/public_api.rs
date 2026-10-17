//! The crate used as a consumer would: through its public paths only, with
//! every public item called at least once.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use cli_tool_config::file::{self, FileProblem};
use cli_tool_config::machine::{MachineConfigFile, env_stem};
use cli_tool_config::needs::{KeyScopes, KeySpec, Need, Needs, Scope};
use cli_tool_config::paths::{self, PathTokens, TokenError};
use cli_tool_config::tiered_dirs::{BaseDirs, TieredDirs};
use cli_tool_config::value;
use serde::Deserialize;

#[derive(Debug, Default, PartialEq, Deserialize)]
#[serde(default, deny_unknown_fields)]
struct Machine {
    repos: Vec<String>,
}

static KEYS: &[KeySpec] = &[
    KeySpec {
        key: "remote",
        scope: Scope::Project,
        description: "The git remote to push to.",
    },
    KeySpec {
        key: "repos",
        scope: Scope::Machine,
        description: "Directories that hold checkouts.",
    },
];

fn dirs(root: &Path) -> TieredDirs {
    TieredDirs::with_base_dirs("com.example", BaseDirs::rooted(root)).unwrap()
}

/// `CARGO_MANIFEST_DIR` is set for every test cargo runs, so it stands in
/// for a user's override variable without the test mutating the
/// environment.
#[test]
fn the_env_var_relocates_the_file() {
    let tmp = tempfile::tempdir().unwrap();
    let m = MachineConfigFile::<Machine>::new("mytool", &dirs(tmp.path()))
        .unwrap()
        .with_env("CARGO_MANIFEST_DIR");
    assert_eq!(m.path(), PathBuf::from(env!("CARGO_MANIFEST_DIR")));
}

#[test]
fn the_machine_file_loads_strictly_or_with_defaults() {
    let tmp = tempfile::tempdir().unwrap();
    let m = MachineConfigFile::<Machine>::new("my-tool", &dirs(tmp.path()))
        .unwrap()
        .with_env("CLI_TOOL_CONFIG_TEST_UNSET_VARIABLE")
        .with_file_name("machine.yaml");
    assert_eq!(m.env(), "CLI_TOOL_CONFIG_TEST_UNSET_VARIABLE");
    assert_eq!(env_stem("my-tool"), "MY_TOOL");

    let path = m.path();
    assert!(path.starts_with(tmp.path()));
    assert!(path.ends_with(Path::new("my-tool").join("machine.yaml")));
    assert_eq!(m.load(), Machine::default());
    assert_eq!(m.read_strict().unwrap(), None);

    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(&path, "repos: [/a]\n").unwrap();
    m.clear_cache();
    assert_eq!(m.load().repos, vec!["/a".to_string()]);
    assert_eq!(
        m.read_strict().unwrap().unwrap().repos,
        vec!["/a".to_string()]
    );

    fs::write(&path, "unknown: 1\n").unwrap();
    m.clear_cache();
    assert_eq!(m.load(), Machine::default());
    assert!(matches!(
        m.read_strict(),
        Err(FileProblem::Malformed { .. })
    ));
}

#[test]
fn files_are_found_read_overlaid_and_resolved() {
    let tmp = tempfile::tempdir().unwrap();
    let project_path = tmp.path().join("mytool.yaml");
    fs::write(&project_path, "remote: ''\ncheckout: ./c\n").unwrap();
    let nested = tmp.path().join("a").join("b");
    fs::create_dir_all(&nested).unwrap();

    assert_eq!(
        file::find_up(&nested, "mytool.yaml"),
        Some(project_path.clone())
    );
    let mut project = file::read_mapping(&project_path).unwrap();
    let missing = file::read_mapping(&tmp.path().join("absent.yaml")).unwrap_err();
    assert!(matches!(missing, FileProblem::Unreadable { .. }));

    file::resolve_paths_at(&mut project, &["checkout"], tmp.path(), Path::new("/h"));
    assert_eq!(
        PathBuf::from(project.get("checkout").unwrap().as_str().unwrap()),
        tmp.path().join("c")
    );

    let machine: serde_yaml::Mapping = serde_yaml::from_str("remote: origin\n").unwrap();
    let merged = file::overlay_top_level(project, &machine);
    assert_eq!(merged.get("remote").unwrap().as_str(), Some("origin"));
}

#[test]
fn values_paths_and_tokens() {
    let doc: serde_yaml::Value = serde_yaml::from_str("a:\n  b: ''\n  c: 0\n").unwrap();
    assert!(!value::value_is_set(value::value_at(&doc, "a.b")));
    assert!(value::value_is_set(value::value_at(&doc, "a.c")));
    assert_eq!(value::value_at(&doc, "a.d"), None);

    let base = Path::new("/base");
    let home = Path::new("/home/me");
    assert_eq!(
        PathBuf::from(paths::resolve_config_path("~/x", base, home)),
        home.join("x")
    );

    let machine = BTreeMap::from([("dev".to_string(), "~/dev".to_string())]);
    let tokens: PathTokens = paths::path_tokens(base, home, &machine, &BTreeMap::new());
    assert_eq!(
        PathBuf::from(paths::expand_tokens("{dev}", &tokens, "repos:").unwrap()),
        home.join("dev")
    );
    let err: TokenError =
        paths::expand_tokens_with_hint("{nope}", &tokens, "repos:", "add it to mytool.yaml")
            .unwrap_err();
    assert!(
        err.to_string()
            .ends_with("add it to mytool.yaml (available: {dev})")
    );
}

#[test]
fn needs_check_and_message() {
    let tmp = tempfile::tempdir().unwrap();
    let needs = Needs::new(
        "mytool",
        "mytool.yaml",
        KEYS,
        PathBuf::from("/cfg/mytool/config.yaml"),
        Some("`mytool config scaffold` shows the full shape"),
    );
    assert!(needs.key_exists("remote"));
    assert_eq!(
        needs.key_description("repos"),
        Some("Directories that hold checkouts.")
    );
    assert_eq!(
        needs.key_scopes("repos"),
        KeyScopes {
            project: false,
            machine: true
        }
    );

    let need = Need {
        config: "repos",
        unless_input: Some("repoDir"),
    };
    let machine: serde_yaml::Value = serde_yaml::from_str("repos: [/r]\n").unwrap();
    assert!(needs.met(&need, None, Some(&machine), &|_| false));
    assert!(needs.met(&need, None, None, &|input| input == "repoDir"));
    assert!(!needs.met(&need, None, None, &|_| false));

    assert_eq!(
        needs.where_to_set("repos", tmp.path()),
        "the machine config (/cfg/mytool/config.yaml)"
    );
    assert_eq!(
        needs.message(&need, tmp.path(), &["sync"]),
        "`mytool sync` needs `repos`, and it is not set (or pass --repo-dir). \
         Directories that hold checkouts. \
         Set it in the machine config (/cfg/mytool/config.yaml); \
         `mytool config scaffold` shows the full shape."
    );
}
