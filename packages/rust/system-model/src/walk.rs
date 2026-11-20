//! The filesystem half: find manifests, parse each into a `ManifestInfo`.

use std::collections::HashMap;
use std::fs;
use std::path::Path;

use crate::model::{DepDecl, DepKind, Ecosystem, ManifestInfo, SpecifierKind};

/// Directory names the walk always skips.
pub const DEFAULT_EXCLUDES: &[&str] = &[
    "node_modules",
    ".git",
    "target",
    "dist",
    ".nuxt",
    ".output",
    ".sdlc",
    ".claude",
];

/// What `walk_manifests` accepts.
#[derive(Debug, Clone, Default)]
pub struct WalkOptions {
    /// Additional directory names to skip, merged with `DEFAULT_EXCLUDES`.
    pub exclude: Vec<String>,
}

/// Recursively find and parse every `package.json` and `Cargo.toml` under
/// `root`. Skips the default excluded directory names (plus any in
/// `options.exclude`) and symlinked entries. A malformed manifest becomes an
/// entry with its `error` field set — the walk never fails for one.
///
/// Results are sorted by `dir` (then path) for deterministic output.
pub fn walk_manifests(root: &Path, options: &WalkOptions) -> Vec<ManifestInfo> {
    let mut excluded: Vec<&str> = DEFAULT_EXCLUDES.to_vec();
    excluded.extend(options.exclude.iter().map(String::as_str));

    let mut found = Vec::new();
    let mut workspaces = Vec::new();
    walk_dir(root, root, &excluded, &mut found, &mut workspaces);
    apply_workspace_renames(&mut found, &workspaces);
    found.sort_by(|a, b| a.dir.cmp(&b.dir).then_with(|| a.path.cmp(&b.path)));
    found
}

/// A cargo workspace root's dir and its `[workspace.dependencies]` renames
/// (alias -> real crate name).
type WorkspaceRenames = (String, HashMap<String, String>);

fn walk_dir(
    root: &Path,
    dir: &Path,
    excluded: &[&str],
    out: &mut Vec<ManifestInfo>,
    workspaces: &mut Vec<WorkspaceRenames>,
) {
    // An unreadable directory is skipped, never an abort.
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        // `file_type()` on a DirEntry does not follow the link, so a symlinked
        // tree is someone else's manifests — and following one invites cycles.
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_symlink() {
            continue;
        }
        let name = entry.file_name();
        let name = name.to_string_lossy();
        let full = entry.path();

        if file_type.is_dir() {
            if !excluded.iter().any(|e| *e == name) {
                walk_dir(root, &full, excluded, out, workspaces);
            }
        } else if name == "package.json" {
            out.push(parse_manifest(root, &full, Ecosystem::Node, workspaces));
        } else if name == "Cargo.toml" {
            out.push(parse_manifest(root, &full, Ecosystem::Rust, workspaces));
        }
    }
}

/// Root-relative, `/`-separated directory of a manifest. `""` is the root.
fn relative_dir(root: &Path, manifest: &Path) -> String {
    let parent = manifest.parent().unwrap_or(manifest);
    let rel = parent.strip_prefix(root).unwrap_or(parent);
    rel.components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/")
}

fn parse_manifest(
    root: &Path,
    path: &Path,
    ecosystem: Ecosystem,
    workspaces: &mut Vec<WorkspaceRenames>,
) -> ManifestInfo {
    let base = ManifestInfo::blank(
        path.to_string_lossy().into_owned(),
        relative_dir(root, path),
        ecosystem,
    );

    let raw = match fs::read_to_string(path) {
        Ok(raw) => raw,
        Err(e) => {
            return ManifestInfo {
                error: Some(format!("unreadable: {e}")),
                ..base
            };
        }
    };

    let parsed = match ecosystem {
        Ecosystem::Node => parse_node_manifest(base.clone(), &raw),
        Ecosystem::Rust => parse_cargo_manifest(base.clone(), &raw, workspaces),
    };
    match parsed {
        Ok(info) => info,
        Err(e) => ManifestInfo {
            error: Some(format!("parse failed: {e}")),
            ..base
        },
    }
}

const NODE_DEP_FIELDS: &[(&str, DepKind)] = &[
    ("dependencies", DepKind::Prod),
    ("devDependencies", DepKind::Dev),
    ("peerDependencies", DepKind::Peer),
    ("optionalDependencies", DepKind::Optional),
];

fn parse_node_manifest(base: ManifestInfo, raw: &str) -> Result<ManifestInfo, String> {
    let pkg: serde_json::Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
    let pkg = pkg.as_object().ok_or("package.json is not a JSON object")?;

    let mut deps = Vec::new();
    for (field, kind) in NODE_DEP_FIELDS {
        let Some(table) = pkg.get(*field).and_then(|v| v.as_object()) else {
            continue;
        };
        // Sorted by key, whatever order the map keeps: another crate in the workspace
        // may turn on serde_json's `preserve_order`, and the TypeScript twin sorts too.
        let mut entries: Vec<_> = table.iter().collect();
        entries.sort_by(|a, b| a.0.cmp(b.0));
        for (name, spec) in entries {
            let specifier = match spec {
                serde_json::Value::String(s) => s.clone(),
                other => other.to_string(),
            };
            let specifier_kind = classify_node_specifier(&specifier);
            deps.push(DepDecl {
                name: npm_alias_target(&specifier).unwrap_or(name).to_string(),
                kind: *kind,
                specifier,
                specifier_kind,
            });
        }
    }

    // node `workspaces` is either an array of globs or `{ packages: [...] }`.
    let workspaces = match pkg.get("workspaces") {
        Some(serde_json::Value::Array(globs)) => string_list(globs),
        Some(serde_json::Value::Object(o)) => match o.get("packages") {
            Some(serde_json::Value::Array(globs)) => string_list(globs),
            _ => Vec::new(),
        },
        _ => Vec::new(),
    };

    let is_nuxt_layer = pkg
        .get("main")
        .and_then(|v| v.as_str())
        .is_some_and(|m| m.ends_with("nuxt.config.ts"));
    let has_bin = match pkg.get("bin") {
        Some(serde_json::Value::String(_)) => true,
        Some(serde_json::Value::Object(o)) => !o.is_empty(),
        _ => false,
    };

    Ok(ManifestInfo {
        name: str_field(pkg.get("name")),
        version: str_field(pkg.get("version")),
        private: pkg.get("private") == Some(&serde_json::Value::Bool(true)),
        description: str_field(pkg.get("description")),
        workspaces,
        entry: crate::model::Entry {
            main: str_field(pkg.get("main")),
            types: str_field(pkg.get("types")),
        },
        is_nuxt_layer,
        has_bin,
        deps,
        ..base
    })
}

fn string_list(values: &[serde_json::Value]) -> Vec<String> {
    values
        .iter()
        .filter_map(|v| v.as_str().map(str::to_string))
        .collect()
}

fn str_field(value: Option<&serde_json::Value>) -> Option<String> {
    value.and_then(|v| v.as_str()).map(str::to_string)
}

/// The real package an `npm:<name>[@<range>]` alias points at.
fn npm_alias_target(spec: &str) -> Option<&str> {
    let rest = spec.strip_prefix("npm:")?;
    // Skip the first char so a scope's leading '@' is not read as the range.
    let name = match rest.get(1..).and_then(|r| r.rfind('@')) {
        Some(at) => &rest[..at + 1],
        None => rest,
    };
    (!name.is_empty()).then_some(name)
}

fn classify_node_specifier(spec: &str) -> SpecifierKind {
    if spec.starts_with("workspace:") {
        return SpecifierKind::Workspace;
    }
    if spec.starts_with("file:") {
        return SpecifierKind::File;
    }
    // git/http/npm-alias/link specifiers carry a ':', paths start with '.' or
    // '/', and github shorthand is `owner/repo`; a plain registry range or
    // dist-tag has none of these.
    if spec.contains(':') || spec.contains('/') || spec.starts_with('.') {
        return SpecifierKind::Other;
    }
    SpecifierKind::Registry
}

const CARGO_DEP_TABLES: &[(&str, DepKind)] = &[
    ("dependencies", DepKind::Prod),
    ("dev-dependencies", DepKind::Dev),
    ("dev_dependencies", DepKind::Dev), // deprecated cargo alias, still accepted
    ("build-dependencies", DepKind::Build),
    ("build_dependencies", DepKind::Build),
];

fn parse_cargo_manifest(
    base: ManifestInfo,
    raw: &str,
    workspaces: &mut Vec<WorkspaceRenames>,
) -> Result<ManifestInfo, String> {
    let doc: toml::Value = toml::from_str(raw).map_err(|e| e.to_string())?;
    let doc = doc.as_table().ok_or("Cargo.toml is not a table")?;

    let mut deps = Vec::new();
    push_cargo_deps(doc, &mut deps);
    // `[target.'cfg(…)'.dependencies]` and friends hold the same tables.
    if let Some(targets) = doc.get("target").and_then(|v| v.as_table()) {
        for platform in targets.values().filter_map(|v| v.as_table()) {
            push_cargo_deps(platform, &mut deps);
        }
    }

    let empty = toml::value::Table::new();
    let pkg = doc
        .get("package")
        .and_then(|v| v.as_table())
        .unwrap_or(&empty);
    let workspace = doc
        .get("workspace")
        .and_then(|v| v.as_table())
        .unwrap_or(&empty);
    if doc.get("workspace").is_some_and(toml::Value::is_table) {
        let renames = workspace
            .get("dependencies")
            .and_then(|v| v.as_table())
            .into_iter()
            .flatten()
            .filter_map(|(alias, spec)| {
                let real = toml_str(spec.get("package"))?;
                Some((alias.clone(), real))
            })
            .collect();
        workspaces.push((base.dir.clone(), renames));
    }

    let workspaces = workspace
        .get("members")
        .and_then(|v| v.as_array())
        .map(|members| {
            members
                .iter()
                .filter_map(|m| m.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();

    Ok(ManifestInfo {
        name: toml_str(pkg.get("name")),
        // `version.workspace = true` parses as a table — only plain strings count.
        version: toml_str(pkg.get("version")),
        // `publish = []` allows no registry, the same as `publish = false`.
        private: match pkg.get("publish") {
            Some(toml::Value::Boolean(b)) => !b,
            Some(toml::Value::Array(registries)) => registries.is_empty(),
            _ => false,
        },
        description: toml_str(pkg.get("description")),
        workspaces,
        entry: crate::model::Entry::default(),
        is_nuxt_layer: false,
        has_bin: doc
            .get("bin")
            .and_then(|v| v.as_array())
            .is_some_and(|a| !a.is_empty()),
        deps,
        ..base
    })
}

/// A member's `foo = { workspace = true }` inherits any `package = "…"` rename
/// from its workspace root, taken as the nearest enclosing `[workspace]`
/// manifest (an explicit `package.workspace` path is not followed).
fn apply_workspace_renames(manifests: &mut [ManifestInfo], workspaces: &[WorkspaceRenames]) {
    let encloses = |ws: &str, dir: &str| {
        ws.is_empty() || dir == ws || dir.strip_prefix(ws).is_some_and(|r| r.starts_with('/'))
    };
    for m in manifests
        .iter_mut()
        .filter(|m| m.ecosystem == Ecosystem::Rust)
    {
        let Some((_, renames)) = workspaces
            .iter()
            .filter(|(ws, _)| encloses(ws, &m.dir))
            .max_by_key(|(ws, _)| ws.len())
        else {
            continue;
        };
        for dep in &mut m.deps {
            if dep.specifier_kind != SpecifierKind::Workspace {
                continue;
            }
            if let Some(real) = renames.get(&dep.name) {
                dep.name = real.clone();
            }
        }
    }
}

fn push_cargo_deps(table: &toml::value::Table, deps: &mut Vec<DepDecl>) {
    for (name, kind) in CARGO_DEP_TABLES {
        let Some(t) = table.get(*name).and_then(|v| v.as_table()) else {
            continue;
        };
        let mut entries: Vec<_> = t.iter().collect();
        entries.sort_by(|a, b| a.0.cmp(b.0));
        for (key, spec) in entries {
            deps.push(cargo_dep(key, spec, *kind));
        }
    }
}

fn toml_str(value: Option<&toml::Value>) -> Option<String> {
    value.and_then(|v| v.as_str()).map(str::to_string)
}

fn cargo_dep(key: &str, spec: &toml::Value, kind: DepKind) -> DepDecl {
    if let Some(s) = spec.as_str() {
        return DepDecl {
            name: key.to_string(),
            kind,
            specifier: s.to_string(),
            specifier_kind: SpecifierKind::Registry,
        };
    }
    let empty = toml::value::Table::new();
    let t = spec.as_table().unwrap_or(&empty);
    // A renamed dep (`alias = { package = "real" }`) matches by its real name.
    let name = toml_str(t.get("package")).unwrap_or_else(|| key.to_string());

    let (specifier, specifier_kind) = if let Some(p) = toml_str(t.get("path")) {
        (p, SpecifierKind::Path)
    } else if t.get("workspace").and_then(|v| v.as_bool()) == Some(true) {
        ("workspace".to_string(), SpecifierKind::Workspace)
    } else if let Some(g) = toml_str(t.get("git")) {
        (g, SpecifierKind::Other)
    } else if let Some(v) = toml_str(t.get("version")) {
        (v, SpecifierKind::Registry)
    } else {
        (String::new(), SpecifierKind::Other)
    };

    DepDecl {
        name,
        kind,
        specifier,
        specifier_kind,
    }
}
