//! Each harness as a table of argv builders and JSON parsers over its own
//! `plugin` CLI. Nothing outside these tables knows a harness's command shapes.

use std::collections::BTreeMap;
use std::path::Path;

use serde_json::Value;

use super::cli_runner::Argv;

/// Where a harness keeps a registration.
#[derive(Debug, Clone, Copy, PartialEq, Eq, clap::ValueEnum)]
pub enum Scope {
    /// Registered for the current user.
    User,
    /// Registered for the project, shared with its other users.
    Project,
    /// Registered for the project on this machine only.
    Local,
}

impl Scope {
    /// The token this value prints.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::User => "user",
            Self::Project => "project",
            Self::Local => "local",
        }
    }
}

/// A marketplace as the harness lists it. `source` is the path, URL or repo it
/// was added from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MarketSource {
    /// The marketplace name.
    pub name: String,
    /// Where it was added from: a path, URL or repository.
    pub source: String,
}

/// A parsed marketplace listing, or why it could not be parsed.
pub type MarketsResult = Result<Vec<MarketSource>, String>;

/// Installed plugin id to its listed version, `None` when the listing
/// carries none.
pub type Installed = BTreeMap<String, Option<String>>;

/// What the harness should end up with.
#[derive(Debug, Clone)]
pub struct Want {
    /// The marketplace to register.
    pub market: MarketSource,
    /// The git ref to register the marketplace at.
    pub git_ref: Option<String>,
    /// `market.source` is a git URL, so the harness installs from its own
    /// snapshot of it.
    pub from_git: bool,
    /// Plugin names, without the `@<market>` suffix.
    pub plugins: Vec<String>,
}

/// One harness: its name, supported scopes, and argv builders.
pub struct HarnessAdapter {
    /// The CLI target name, and the build root whose `marketplace.json`
    /// names the marketplace.
    pub name: &'static str,
    /// The harness's product name, for messages.
    pub label: &'static str,
    /// The scopes the harness supports.
    pub scopes: &'static [Scope],
    /// The harness can register a marketplace only from a git URL.
    pub needs_git_url: bool,
    /// `add_market` passes [`Want::git_ref`] on.
    pub takes_git_ref: bool,
    /// The command that lists registered marketplaces.
    pub list_markets: fn(Scope) -> Argv,
    /// Parse the output of `list_markets`.
    pub parse_markets: fn(&str) -> MarketsResult,
    /// The marketplaces declared at `scope` for the project at the given
    /// path, read from the harness's own files. `None` when the list command
    /// already reports per scope.
    pub scoped_markets: fn(Scope, &Path) -> Option<MarketsResult>,
    /// The command that registers a marketplace.
    pub add_market: fn(&Want, Scope) -> Argv,
    /// The command that removes a marketplace by name.
    pub remove_market: fn(&str, Scope) -> Argv,
    /// Refresh the harness's snapshot of the marketplace registered under
    /// this name.
    pub update_market: fn(&str, Scope) -> Argv,
    /// `None` when the harness has no per-plugin install.
    pub plugins: Option<PluginCommands>,
}

/// The per-plugin commands of a harness.
pub struct PluginCommands {
    /// The command that lists installed plugins.
    pub list: fn(Scope) -> Argv,
    /// The plugins installed at `scope`, for the project at the given path.
    pub parse: fn(&str, Scope, &Path) -> Result<Installed, String>,
    /// The command that installs a plugin by id.
    pub install: fn(&str, Scope) -> Argv,
    /// Bring an installed plugin to the marketplace's version.
    pub update: fn(&str, Scope) -> Vec<Argv>,
    /// The command that uninstalls a plugin by id.
    pub uninstall: fn(&str, Scope) -> Argv,
}

impl HarnessAdapter {
    /// Refuse a scope the harness does not support.
    pub fn check_scope(&self, scope: Scope) -> Result<(), String> {
        if self.scopes.contains(&scope) {
            return Ok(());
        }
        let supported: Vec<&str> = self.scopes.iter().map(|s| s.as_str()).collect();
        Err(format!(
            "{} supports --scope {} only, not {}",
            self.name,
            supported.join("|"),
            scope.as_str()
        ))
    }

    /// Check `scope` and whether `--git-url` and `--git-ref` were given against
    /// what this harness accepts.
    pub fn check_usage(&self, scope: Scope, git_url: bool, git_ref: bool) -> Result<(), String> {
        self.check_scope(scope)?;
        if self.needs_git_url && !git_url {
            return Err(format!(
                "{} only registers a marketplace from a git URL; pass --git-url",
                self.name
            ));
        }
        if git_ref && !self.takes_git_ref {
            return Err(format!("{} takes no --git-ref", self.name));
        }
        Ok(())
    }
}

fn argv(parts: &[&str]) -> Argv {
    parts.iter().map(|part| (*part).to_string()).collect()
}

fn parse_json(stdout: &str) -> Result<Value, String> {
    serde_json::from_str(stdout).map_err(|e| format!("its output is not valid JSON: {e}"))
}

/// The array at `key`, or the document itself when it is already an array.
fn entries<'a>(doc: &'a Value, key: &str) -> Result<&'a Vec<Value>, String> {
    doc.as_array()
        .or_else(|| doc.get(key).and_then(Value::as_array))
        .ok_or_else(|| format!("its output has no `{key}` list"))
}

pub(super) fn str_at<'a>(entry: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter()
        .find_map(|key| entry.get(*key).and_then(Value::as_str))
}

/// An entry without a name or source is skipped: it cannot be the wanted
/// marketplace.
fn markets_from(entries: &[Value], source: impl Fn(&Value) -> Option<&str>) -> Vec<MarketSource> {
    entries
        .iter()
        .filter_map(|entry| {
            Some(MarketSource {
                name: str_at(entry, &["name"])?.to_string(),
                source: source(entry)?.to_string(),
            })
        })
        .collect()
}

/// `id` to `version` for each entry carrying an id.
fn installed_from<'a>(entries: impl IntoIterator<Item = &'a Value>, id_key: &str) -> Installed {
    entries
        .into_iter()
        .filter_map(|entry| {
            let version = str_at(entry, &["version"]).map(str::to_string);
            Some((str_at(entry, &[id_key])?.to_string(), version))
        })
        .collect()
}

/// `claude plugin <verb> <id> --scope <scope>`.
fn claude_plugin(verb: &str, id: &str, scope: Scope) -> Argv {
    argv(&["claude", "plugin", verb, id, "--scope", scope.as_str()])
}

fn same_dir(a: &Path, b: &Path) -> bool {
    a == b
        || matches!(
            (a.canonicalize(), b.canonicalize()),
            (Ok(a), Ok(b)) if a == b
        )
}

/// The Claude Code adapter.
pub const CLAUDE: HarnessAdapter = HarnessAdapter {
    name: "claude",
    label: "Claude Code",
    scopes: &[Scope::User, Scope::Project, Scope::Local],
    needs_git_url: false,
    takes_git_ref: false,
    list_markets: |_| argv(&["claude", "plugin", "marketplace", "list", "--json"]),
    parse_markets: |stdout| {
        let doc = parse_json(stdout)?;
        Ok(markets_from(entries(&doc, "marketplaces")?, |entry| {
            str_at(entry, &["path", "url", "repo"])
        }))
    },
    // `marketplace list` merges every scope, so a project or local scope reads
    // its own settings file.
    scoped_markets: |scope, project| {
        let file = match scope {
            Scope::User => return None,
            Scope::Project => "settings.json",
            Scope::Local => "settings.local.json",
        };
        Some(claude_settings_markets(
            &project.join(".claude").join(file),
            project,
        ))
    },
    add_market: |want, scope| {
        argv(&[
            "claude",
            "plugin",
            "marketplace",
            "add",
            &want.market.source,
            "--scope",
            scope.as_str(),
        ])
    },
    remove_market: |name, scope| {
        argv(&[
            "claude",
            "plugin",
            "marketplace",
            "remove",
            name,
            "--scope",
            scope.as_str(),
        ])
    },
    update_market: |name, _| argv(&["claude", "plugin", "marketplace", "update", name]),
    plugins: Some(PluginCommands {
        list: |_| argv(&["claude", "plugin", "list", "--json"]),
        // Every scope is listed at once. A project or local install carries
        // the `projectPath` it belongs to; a user install carries none.
        parse: |stdout, scope, project| {
            let doc = parse_json(stdout)?;
            let at_scope = entries(&doc, "plugins")?
                .iter()
                .filter(|entry| str_at(entry, &["scope"]) == Some(scope.as_str()))
                .filter(|entry| {
                    str_at(entry, &["projectPath"]).is_none_or(|p| same_dir(Path::new(p), project))
                });
            Ok(installed_from(at_scope, "id"))
        },
        install: |id, scope| claude_plugin("install", id, scope),
        update: |id, scope| vec![claude_plugin("update", id, scope)],
        uninstall: |id, scope| claude_plugin("uninstall", id, scope),
    }),
};

/// The Codex adapter.
pub const CODEX: HarnessAdapter = HarnessAdapter {
    name: "codex",
    label: "Codex",
    scopes: &[Scope::User],
    needs_git_url: false,
    takes_git_ref: true,
    list_markets: |_| argv(&["codex", "plugin", "marketplace", "list", "--json"]),
    scoped_markets: |_, _| None,
    parse_markets: |stdout| {
        let doc = parse_json(stdout)?;
        Ok(markets_from(entries(&doc, "marketplaces")?, |entry| {
            entry
                .get("marketplaceSource")
                .and_then(|source| str_at(source, &["source"]))
                .or_else(|| str_at(entry, &["root"]))
        }))
    },
    add_market: |want, _| {
        let mut out = argv(&["codex", "plugin", "marketplace", "add", &want.market.source]);
        if let Some(git_ref) = &want.git_ref {
            out.extend(argv(&["--ref", git_ref]));
        }
        out
    },
    remove_market: |name, _| argv(&["codex", "plugin", "marketplace", "remove", name]),
    update_market: |name, _| argv(&["codex", "plugin", "marketplace", "upgrade", name]),
    plugins: Some(PluginCommands {
        list: |_| argv(&["codex", "plugin", "list", "--json"]),
        parse: |stdout, _, _| {
            let doc = parse_json(stdout)?;
            Ok(installed_from(entries(&doc, "installed")?, "pluginId"))
        },
        install: |id, _| argv(&["codex", "plugin", "add", id]),
        // Codex has no update command, so update reinstalls.
        update: |id, scope| {
            let plugins = CODEX.plugins.as_ref().expect("codex installs plugins");
            vec![(plugins.uninstall)(id, scope), (plugins.install)(id, scope)]
        },
        uninstall: |id, _| argv(&["codex", "plugin", "remove", id]),
    }),
};

/// The Cursor adapter.
pub const CURSOR: HarnessAdapter = HarnessAdapter {
    name: "cursor",
    label: "Cursor",
    scopes: &[Scope::User],
    needs_git_url: true,
    takes_git_ref: true,
    list_markets: |_| {
        argv(&[
            "cursor-agent",
            "plugin",
            "marketplace",
            "list",
            "--format",
            "json",
        ])
    },
    parse_markets: |stdout| {
        let doc = parse_json(stdout)?;
        Ok(markets_from(entries(&doc, "marketplaces")?, |entry| {
            str_at(entry, &["gitUrl", "url", "repoUrl", "source"])
        }))
    },
    add_market: |want, _| {
        let mut out = argv(&[
            "cursor-agent",
            "plugin",
            "marketplace",
            "add",
            &want.market.source,
        ]);
        if let Some(git_ref) = &want.git_ref {
            out.extend(argv(&["--git-ref", git_ref]));
        }
        out
    },
    remove_market: |name, _| argv(&["cursor-agent", "plugin", "marketplace", "remove", name]),
    update_market: |name, _| argv(&["cursor-agent", "plugin", "marketplace", "update", name]),
    scoped_markets: |_, _| None,
    plugins: None,
};

/// `extraKnownMarketplaces` in a Claude settings file. A missing file
/// declares none. A relative directory path is resolved against `project`.
fn claude_settings_markets(file: &Path, project: &Path) -> Result<Vec<MarketSource>, String> {
    let bytes = match std::fs::read(file) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(format!("{} could not be read: {e}", file.display())),
    };
    let doc: Value = serde_json::from_slice(&bytes)
        .map_err(|e| format!("{} is not valid JSON: {e}", file.display()))?;
    let Some(markets) = doc.get("extraKnownMarketplaces").and_then(Value::as_object) else {
        return Ok(Vec::new());
    };
    Ok(markets
        .iter()
        .filter_map(|(name, entry)| {
            let source = entry.get("source")?;
            let found = str_at(source, &["path", "url", "repo"])?;
            let source = match source.get("path") {
                Some(_) => project.join(found).display().to_string(),
                None => found.to_string(),
            };
            Some(MarketSource {
                name: name.clone(),
                source,
            })
        })
        .collect())
}

/// Whether a listed source is the wanted one: the same string, or two paths
/// to the same directory.
pub fn same_source(listed: &str, wanted: &str) -> bool {
    listed == wanted || same_dir(Path::new(listed), Path::new(wanted))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_markets_read_a_directory_path_or_a_repo() {
        let stdout = r#"[
          {"name": "a", "source": "github", "repo": "o/a", "installLocation": "/x"},
          {"name": "b", "source": "directory", "path": "/m/b", "installLocation": "/m/b"}
        ]"#;
        let markets = (CLAUDE.parse_markets)(stdout).unwrap();
        assert_eq!(markets[0].source, "o/a");
        assert_eq!(markets[1].source, "/m/b");
    }

    #[test]
    fn claude_plugins_match_the_scope_and_the_project_with_their_versions() {
        let stdout = r#"[
          {"id": "u@m", "scope": "user", "version": "1.2.0"},
          {"id": "here@m", "scope": "local", "projectPath": "/p/here"},
          {"id": "there@m", "scope": "local", "projectPath": "/p/there"}
        ]"#;
        let parse = CLAUDE.plugins.as_ref().unwrap().parse;
        let user = parse(stdout, Scope::User, Path::new("/p/here")).unwrap();
        assert_eq!(user["u@m"].as_deref(), Some("1.2.0"));
        assert_eq!(user.len(), 1);
        let local = parse(stdout, Scope::Local, Path::new("/p/here")).unwrap();
        assert_eq!(local.into_keys().collect::<Vec<_>>(), ["here@m"]);
    }

    #[test]
    fn codex_markets_prefer_the_configured_source_over_the_root() {
        let stdout = r#"{"marketplaces": [
          {"name": "a", "root": "/cache/a", "marketplaceSource": {"sourceType": "local", "source": "/src/a"}},
          {"name": "b", "root": "/cache/b"}
        ]}"#;
        let markets = (CODEX.parse_markets)(stdout).unwrap();
        assert_eq!(markets[0].source, "/src/a");
        assert_eq!(markets[1].source, "/cache/b");
    }

    #[test]
    fn codex_plugins_read_the_installed_ids_and_versions() {
        let stdout =
            r#"{"installed": [{"pluginId": "p@m", "version": "0.3.0", "installed": true}]}"#;
        let parse = CODEX.plugins.as_ref().unwrap().parse;
        let ids = parse(stdout, Scope::User, Path::new("/")).unwrap();
        assert_eq!(ids["p@m"].as_deref(), Some("0.3.0"));
    }
}
