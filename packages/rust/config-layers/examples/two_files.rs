//! A tool reads its committed project file and its machine file together,
//! expands `{name}` tokens, and checks a need before it runs.
//!
//! Run it with `cargo run --example two_files`. It works in a scratch
//! directory and prints what it found.

use std::collections::BTreeMap;
use std::fs;

use config_layers::file;
use config_layers::machine::MachineConfigFile;
use config_layers::needs::{KeySpec, Need, Needs, Scope};
use config_layers::paths;
use config_layers::serde_json;
use config_layers::tiered_dirs::{BaseDirs, TieredDirs};
use config_layers::value;
use serde::Deserialize;

/// The machine file's shape. Every field has a default, so a missing or
/// broken file still loads.
#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Machine {
    paths: BTreeMap<String, String>,
}

static KEYS: &[KeySpec] = &[
    KeySpec {
        key: "remote",
        scope: Scope::Both,
        description: "The git remote to push to.",
    },
    KeySpec {
        key: "checkout",
        scope: Scope::Project,
        description: "Where checkouts land.",
    },
];

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let scratch = tempfile::tempdir()?;
    let home = scratch.path().join("home");
    let project_root = scratch.path().join("project");
    fs::create_dir_all(&project_root)?;

    // A real tool builds this with TieredDirs::from_env.
    let dirs = TieredDirs::with_base_dirs("com.example", BaseDirs::rooted(scratch.path()))?;
    let machine = MachineConfigFile::<Machine>::new("mytool", &dirs)?;
    let machine_path = machine.path();
    fs::create_dir_all(machine_path.parent().expect("a file in a directory"))?;
    fs::write(
        &machine_path,
        "paths:\n  dev: ~/Developer\nremote: origin\n",
    )?;
    fs::write(
        project_root.join("mytool.yaml"),
        "checkout: '{dev}/checkouts'\nremote: ''\n",
    )?;

    // The typed machine file, and the raw mappings of both files.
    let typed = machine.load();
    let project_path =
        file::find_up(&project_root, "mytool.yaml").expect("the project file was written");
    let project = file::read_mapping(&project_path)?;
    let machine_raw = file::read_mapping(&machine_path)?;

    // `{dev}` comes from the machine's `paths:` map.
    let tokens = paths::path_tokens(&project_root, &home, &typed.paths, &BTreeMap::new());
    let project_value = serde_json::Value::Object(project.clone());
    let checkout = value::value_at(&project_value, "checkout")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default();
    let checkout = paths::substitute_path_names(checkout, &tokens, "checkout:")?;
    println!("checkout: {checkout}");

    // The project leaves `remote` blank, so the machine's value fills it.
    let merged = file::overlay_top_level(project, &machine_raw);
    println!("remote: {:?}", merged.get("remote"));

    let needs = Needs::new("mytool", "mytool.yaml", KEYS, machine_path, None);
    let need = Need {
        config: "remote",
        unless_input: Some("remote"),
    };
    let merged = serde_json::Value::Object(merged);
    let no_flags = |_: &str| false;
    if needs.met(&need, Some(&merged), None, &no_flags) {
        println!("`mytool push` can run");
    } else {
        println!("{}", needs.message(&need, &project_root, &["push"]));
    }
    Ok(())
}
