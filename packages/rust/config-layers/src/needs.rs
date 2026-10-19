//! What a command needs from the config before it can run, and the one
//! message every unmet need renders: the command, the key, what the key is
//! for, and where to set it.
//!
//! A tool declares a static [`KeySpec`] table beside its serde structs, one
//! entry per dotted key it cares about, stating the key's scope and a
//! one-sentence description. Rust cannot read either from a serde-derived
//! type, so the table says them directly.

use std::path::Path;

use serde_json::Value;

use crate::value::{value_at, value_is_set};

/// Which config file(s) a key may live in.
///
/// New variants may be added in a compatible release, so a `match` needs a
/// wildcard arm.
///
/// **Stability:** stable in 0.x.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[non_exhaustive]
pub enum Scope {
    /// The committed project file only.
    Project,
    /// The machine-local file only.
    Machine,
    /// Either file; the one a person is standing in leads.
    Both,
}

/// One entry in a tool's static key table.
///
/// **Stability:** stable in 0.x.
#[derive(Debug, Clone, Copy)]
pub struct KeySpec {
    /// Dotted path into the config: `lease_authority`, `paths.dev`.
    pub key: &'static str,
    /// Which file(s) the key may live in.
    pub scope: Scope,
    /// One sentence saying what the key is for. [`Needs::message`] prints it
    /// as written.
    pub description: &'static str,
}

/// A setting a command cannot run without.
///
/// **Stability:** stable in 0.x.
#[derive(Debug, Clone, Copy)]
pub struct Need {
    /// Dotted path into the config: `lease_authority`, `paths.dev`.
    pub config: &'static str,
    /// An input key that stands in for the setting when given on the
    /// command line (`authority` for `--authority`). The need is met when
    /// that input is present and non-empty, whatever the config says.
    pub unless_input: Option<&'static str>,
}

/// Which files carry a key.
///
/// **Stability:** stable in 0.x.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct KeyScopes {
    /// The key may live in the project file.
    pub project: bool,
    /// The key may live in the machine file.
    pub machine: bool,
}

/// A tool's key table plus the two files' identifying details, for
/// answering whether a need is met and rendering the one message when it
/// is not.
///
/// It holds the machine file's resolved path, not a
/// [`MachineConfigFile`](crate::machine::MachineConfigFile): it reports on
/// paths and never needs the file's typed shape.
///
/// **Stability:** stable in 0.x.
#[derive(Debug)]
pub struct Needs {
    tool: String,
    project_file: String,
    keys: &'static [KeySpec],
    machine_path: std::path::PathBuf,
    scaffold_hint: Option<&'static str>,
}

impl Needs {
    /// `tool` names the command in [`Needs::message`]; `project_file` is
    /// the committed file's name, looked for at the project root;
    /// `machine_path` is the already-resolved path to the machine file
    /// (e.g. from [`crate::machine::MachineConfigFile::path`]);
    /// `scaffold_hint` is appended after a semicolon, e.g.
    /// `` `tooly config scaffold` shows the full shape ``.
    pub fn new(
        tool: &str,
        project_file: &str,
        keys: &'static [KeySpec],
        machine_path: std::path::PathBuf,
        scaffold_hint: Option<&'static str>,
    ) -> Self {
        Self {
            tool: tool.to_string(),
            project_file: project_file.to_string(),
            keys,
            machine_path,
            scaffold_hint,
        }
    }

    fn find(&self, key: &str) -> Option<&'static KeySpec> {
        self.keys.iter().find(|spec| spec.key == key)
    }

    /// Which files' key table carries `key`.
    pub fn key_scopes(&self, key: &str) -> KeyScopes {
        match self.find(key) {
            Some(spec) => KeyScopes {
                project: matches!(spec.scope, Scope::Project | Scope::Both),
                machine: matches!(spec.scope, Scope::Machine | Scope::Both),
            },
            None => KeyScopes {
                project: false,
                machine: false,
            },
        }
    }

    /// Whether the key table knows `key` at all.
    pub fn key_exists(&self, key: &str) -> bool {
        self.find(key).is_some()
    }

    /// The matching [`KeySpec`]'s description, or `None` if `key` is not in
    /// the table.
    pub fn key_description(&self, key: &str) -> Option<&str> {
        self.find(key).map(|spec| spec.description)
    }

    /// Whether `need` is met: the stand-in input is set, or the setting is
    /// set in the project config or the machine config. `project` and
    /// `machine` are the two files' already-hydrated top-level values (a
    /// caller that has no machine file yet passes `None`); `input_set`
    /// answers whether a given input key was passed on the command line.
    pub fn met(
        &self,
        need: &Need,
        project: Option<&Value>,
        machine: Option<&Value>,
        input_set: &dyn Fn(&str) -> bool,
    ) -> bool {
        if need.unless_input.is_some_and(input_set) {
            return true;
        }
        if value_is_set(project.and_then(|p| value_at(p, need.config))) {
            return true;
        }
        value_is_set(machine.and_then(|m| value_at(m, need.config)))
    }

    /// Where `key` can be set, as prose: the file(s) whose key table
    /// carries it, the one a person is standing in first. Outside a
    /// project (no project file at the root) the project file is
    /// described rather than pointed at, since the root is not one.
    pub fn where_to_set(&self, key: &str, project_root: &Path) -> String {
        let scopes = self.key_scopes(key);
        let project_path = project_root.join(&self.project_file);
        let in_project = project_path.exists();
        let project_text = if in_project {
            project_path.display().to_string()
        } else {
            format!(
                "an {} at the project root (none above {})",
                self.project_file,
                project_root.display()
            )
        };
        let machine_text = format!("the machine config ({})", self.machine_path.display());
        if scopes.machine && scopes.project {
            if in_project {
                format!("{project_text} or {machine_text}")
            } else {
                format!("{machine_text} or {project_text}")
            }
        } else if scopes.machine {
            machine_text
        } else {
            project_text
        }
    }

    /// The one message every unmet need renders. `command` is the command
    /// words after the tool name (`&["push"]` for `mytool push`); with none,
    /// the message says "this command". `project_root` is where the project
    /// file is, or would be.
    ///
    /// ```
    /// use config_layers::needs::{KeySpec, Need, Needs, Scope};
    ///
    /// static KEYS: &[KeySpec] = &[KeySpec {
    ///     key: "remote",
    ///     scope: Scope::Machine,
    ///     description: "The git remote to push to.",
    /// }];
    /// let needs = Needs::new("mytool", "mytool.yaml", KEYS, "/cfg/mytool/config.yaml".into(), None);
    /// let need = Need { config: "remote", unless_input: None };
    /// assert_eq!(
    ///     needs.message(&need, std::path::Path::new("/nowhere"), &["push"]),
    ///     "`mytool push` needs `remote`, and it is not set. The git remote to push to. \
    ///      Set it in the machine config (/cfg/mytool/config.yaml).",
    /// );
    /// ```
    pub fn message(&self, need: &Need, project_root: &Path, command: &[&str]) -> String {
        let who = if command.is_empty() {
            "this command".to_string()
        } else {
            format!("`{} {}`", self.tool, command.join(" "))
        };
        let flag = match need.unless_input {
            Some(input) => format!(" (or pass --{})", to_flag(input)),
            None => String::new(),
        };
        let what = self.key_description(need.config);
        let hint = match self.scaffold_hint {
            Some(hint) => format!("; {hint}"),
            None => String::new(),
        };

        let mut out = format!("{who} needs `{}`, and it is not set{flag}.", need.config);
        if let Some(what) = what {
            out.push(' ');
            out.push_str(what);
        }
        out.push_str(&format!(
            " Set it in {}{hint}.",
            self.where_to_set(need.config, project_root)
        ));
        out
    }
}

/// camelCase -> kebab-case: `authorityToken` -> `authority-token`. A key
/// with no uppercase letters is unchanged.
fn to_flag(key: &str) -> String {
    let mut out = String::with_capacity(key.len() + 4);
    for c in key.chars() {
        if c.is_ascii_uppercase() {
            out.push('-');
            out.push(c.to_ascii_lowercase());
        } else {
            out.push(c);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    const TOOL: &str = "tooly";
    const PROJECT_FILE: &str = "tooly.yaml";

    // `paths.dev` and `checkout.layout` may live in either file.
    static KEYS: &[KeySpec] = &[
        KeySpec {
            key: "authority",
            scope: Scope::Project,
            description: "The remote leases are taken against.",
        },
        KeySpec {
            key: "repos",
            scope: Scope::Machine,
            description: "Directories that hold checkouts.",
        },
        KeySpec {
            key: "paths.dev",
            scope: Scope::Both,
            description: "Named directories, referred to as `{name}`.",
        },
        KeySpec {
            key: "checkout.layout",
            scope: Scope::Both,
            description: "Where a checkout lands.",
        },
    ];

    fn machine_path() -> PathBuf {
        PathBuf::from("/machine/tooly/config.yaml")
    }

    fn needs_with_hint() -> Needs {
        Needs::new(
            TOOL,
            PROJECT_FILE,
            KEYS,
            machine_path(),
            Some("`tooly config scaffold` shows the full shape"),
        )
    }

    fn needs_without_hint() -> Needs {
        Needs::new(TOOL, PROJECT_FILE, KEYS, machine_path(), None)
    }

    fn yaml(text: &str) -> Value {
        serde_saphyr::from_str(text).unwrap()
    }

    mod key_lookup_tests {
        use super::*;

        #[test]
        fn scopes_existence_and_description() {
            let needs = needs_with_hint();
            assert_eq!(
                needs.key_scopes("authority"),
                KeyScopes {
                    project: true,
                    machine: false
                }
            );
            assert_eq!(
                needs.key_scopes("repos"),
                KeyScopes {
                    project: false,
                    machine: true
                }
            );
            assert_eq!(
                needs.key_scopes("paths.dev"),
                KeyScopes {
                    project: true,
                    machine: true
                }
            );
            assert_eq!(
                needs.key_scopes("nope"),
                KeyScopes {
                    project: false,
                    machine: false
                }
            );
            assert!(needs.key_exists("repos"));
            assert!(!needs.key_exists("nope"));
            assert_eq!(
                needs.key_description("checkout.layout"),
                Some("Where a checkout lands.")
            );
            assert_eq!(
                needs.key_description("repos"),
                Some("Directories that hold checkouts.")
            );
            assert_eq!(needs.key_description("nope"), None);
        }
    }

    mod met_tests {
        use super::*;

        const NEED: Need = Need {
            config: "authority",
            unless_input: Some("authority"),
        };

        #[test]
        fn the_setting_the_stand_in_input_or_the_machine_file_each_satisfy_it() {
            let needs = needs_with_hint();
            let no_input = |_: &str| false;

            let project = yaml("authority: origin\n");
            assert!(needs.met(&NEED, Some(&project), None, &no_input));

            let project = yaml("authority: ''\n");
            assert!(!needs.met(&NEED, Some(&project), None, &no_input));

            // The stand-in input satisfies the need even though the setting
            // itself is unset.
            let has_authority = |k: &str| k == "authority";
            assert!(needs.met(&NEED, Some(&project), None, &has_authority));

            // `input_set` already answers "is this input usefully set", so an
            // input present but empty is `false` here, the same as no input.
            assert!(!needs.met(&NEED, Some(&project), None, &no_input));

            let machine = yaml("paths:\n  dev: ~/Developer\n");
            let dev_need = Need {
                config: "paths.dev",
                unless_input: None,
            };
            let other_need = Need {
                config: "paths.other",
                unless_input: None,
            };
            let empty_project = yaml("paths: {}\n");
            assert!(needs.met(&dev_need, Some(&empty_project), Some(&machine), &no_input));
            assert!(!needs.met(&other_need, Some(&empty_project), Some(&machine), &no_input));
        }

        #[test]
        fn an_empty_list_or_map_counts_as_unset() {
            let needs = needs_with_hint();
            let no_input = |_: &str| false;
            let paths_need = Need {
                config: "paths",
                unless_input: None,
            };
            let project = yaml("paths: {}\n");
            assert!(!needs.met(&paths_need, Some(&project), None, &no_input));

            let repos_need = Need {
                config: "repos",
                unless_input: None,
            };
            let empty_project = yaml("{}\n");
            assert!(!needs.met(&repos_need, Some(&empty_project), None, &no_input));
        }
    }

    mod message_tests {
        use super::*;

        #[test]
        fn names_the_command_the_key_its_purpose_the_stand_in_and_the_project_file() {
            let needs = needs_with_hint();
            let dir = tempfile::tempdir().unwrap();
            fs::write(dir.path().join(PROJECT_FILE), "paths: {}\n").unwrap();

            let need = Need {
                config: "authority",
                unless_input: Some("authority"),
            };
            let msg = needs.message(&need, dir.path(), &["lease", "list"]);
            let expected = format!(
                "`tooly lease list` needs `authority`, and it is not set (or pass --authority). \
                 The remote leases are taken against. \
                 Set it in {}; `tooly config scaffold` shows the full shape.",
                dir.path().join(PROJECT_FILE).display()
            );
            assert_eq!(msg, expected);
            // authority is project-only: the machine file is not offered.
            assert!(!msg.contains("machine config"));
        }

        #[test]
        fn a_camel_case_stand_in_renders_as_a_kebab_case_flag_no_command_is_this_command() {
            let needs = needs_with_hint();
            let dir = tempfile::tempdir().unwrap();
            let need = Need {
                config: "repos",
                unless_input: Some("repoDir"),
            };
            let msg = needs.message(&need, dir.path(), &[]);
            assert!(msg.starts_with(
                "this command needs `repos`, and it is not set (or pass --repo-dir)."
            ));
            // repos is machine-only: the project file is not offered.
            assert!(msg.contains(&format!(
                "Set it in the machine config ({});",
                machine_path().display()
            )));
            assert!(!msg.contains(PROJECT_FILE));
        }

        #[test]
        fn a_key_both_files_carry_the_file_you_stand_in_leads_the_other_follows() {
            let needs = needs_with_hint();

            let inside = tempfile::tempdir().unwrap();
            fs::write(inside.path().join(PROJECT_FILE), "").unwrap();
            assert_eq!(
                needs.where_to_set("paths.dev", inside.path()),
                format!(
                    "{} or the machine config ({})",
                    inside.path().join(PROJECT_FILE).display(),
                    machine_path().display()
                )
            );

            let outside = tempfile::tempdir().unwrap();
            assert_eq!(
                needs.where_to_set("paths.dev", outside.path()),
                format!(
                    "the machine config ({}) or an {} at the project root (none above {})",
                    machine_path().display(),
                    PROJECT_FILE,
                    outside.path().display()
                )
            );
        }

        #[test]
        fn without_a_scaffold_hint_the_sentence_ends_at_the_location() {
            let bare = needs_without_hint();
            let dir = tempfile::tempdir().unwrap();
            fs::write(dir.path().join(PROJECT_FILE), "").unwrap();
            let need = Need {
                config: "authority",
                unless_input: None,
            };
            let msg = bare.message(&need, dir.path(), &[]);
            let suffix = format!("Set it in {}.", dir.path().join(PROJECT_FILE).display());
            assert!(
                msg.ends_with(&suffix),
                "{msg:?} does not end with {suffix:?}"
            );
        }
    }
}
