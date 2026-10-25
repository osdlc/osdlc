//! Concrete filesystem helpers on top of [`ExportedTree`] and the
//! capability traits.
//!
//! Everything above this layer is pure: renders return
//! [`ExportedFile`]s, not disk writes. This module is the thin
//! side-effectful edge that materializes those virtual files onto a
//! real filesystem, anchored against a caller-supplied project root.
//!
//! [`write_tree`] writes a whole [`ExportedTree`]. [`install_skill`],
//! [`install_agent`], [`install_hooks`], [`install_script`] and
//! [`install_mcp_server`] render + write a single asset in one call, so
//! callers don't have to build a tree for one file. [`install_plugin`] does
//! the same for an entire [`PluginBundle`].

use std::fs;
use std::path::{Path, PathBuf};

use crate::mcp::{McpCapability, McpServer};
use crate::runtime::{Scope, ScopedRelative};
use crate::{
    Agent, AgentCapability, Error, ExportedFile, ExportedTree, Hook, HookCapability, PluginBundle,
    Result, Script, ScriptCapability, Skill, SkillCapability, compose,
};

impl ExportedTree {
    /// Write every file in the tree to disk, anchored at `anchor`.
    ///
    /// Method-call alias for [`write_tree`].
    pub fn write_to_dir(&self, anchor: &Path) -> Result<Vec<PathBuf>> {
        write_tree(self, anchor)
    }
}

/// Write every file in `tree` to disk, anchored at `anchor`.
///
/// Each [`ExportedFile::path`] is joined onto `anchor` to produce an
/// absolute path; parent directories are created recursively. Returns
/// the list of absolute paths written, in the order the tree yielded
/// them.
///
/// # Errors
///
/// Stops at the first I/O failure. Files written before the failure
/// remain on disk — this function does not roll back. Callers that
/// need atomic behavior should write to a staging directory and
/// `rename` when the full tree succeeds.
pub fn write_tree(tree: &ExportedTree, anchor: &Path) -> Result<Vec<PathBuf>> {
    let mut written = Vec::with_capacity(tree.len());
    for file in tree.iter() {
        written.push(write_one(file, anchor)?);
    }
    Ok(written)
}

fn write_one(file: &ExportedFile, anchor: &Path) -> Result<PathBuf> {
    // Defence in depth. Every render in this crate already routes its
    // caller-supplied path through `paths::join_within`, but `write_tree`
    // is public and will happily take a hand-built tree — and
    // `RuntimePaths` documents every path as relative to the anchor, so
    // an `ExportedFile` that is absolute or walks up is out of contract
    // either way.
    let absolute = crate::paths::join_within(anchor, &file.path)?;
    if let Some(parent) = absolute.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&absolute, &file.content)?;
    set_executable(&absolute, file.executable)?;
    Ok(absolute)
}

/// Set or clear the executable bits to match [`ExportedFile::executable`].
/// No-op on non-unix platforms.
#[cfg(unix)]
fn set_executable(path: &Path, executable: bool) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = fs::metadata(path)?.permissions();
    let mode = perms.mode();
    let desired = if executable {
        mode | 0o111
    } else {
        mode & !0o111
    };
    if desired != mode {
        perms.set_mode(desired);
        fs::set_permissions(path, perms)?;
    }
    Ok(())
}

#[cfg(not(unix))]
fn set_executable(_path: &Path, _executable: bool) -> Result<()> {
    Ok(())
}

/// The current user's home directory — the anchor a [`Scope::User`] path
/// joins onto, the way `project_root` is the anchor for [`Scope::Project`].
///
/// Reads `HOME`, then `USERPROFILE` on Windows. Returns `None` when neither
/// is set, which is normal in a sandbox or a CI container and must not be an
/// error.
pub fn user_anchor() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")
        .filter(|h| !h.is_empty())
        .or_else(|| std::env::var_os("USERPROFILE").filter(|h| !h.is_empty()))?;
    Some(PathBuf::from(home))
}

/// The anchor an install at `scope` joins its paths onto: `project_root`
/// for [`Scope::Project`], [`user_anchor`] for [`Scope::User`].
///
/// # Errors
///
/// [`Error::Validation`] for [`Scope::User`] when no home directory is set.
fn scope_anchor(project_root: &Path, scope: Scope) -> Result<PathBuf> {
    match scope {
        Scope::Project => Ok(project_root.to_path_buf()),
        Scope::User => user_anchor().ok_or_else(|| {
            Error::validation("a user-scope install needs HOME or USERPROFILE to be set")
        }),
    }
}

/// Move rendered files from the project-scope layout to `scope`'s.
///
/// Every render lays its files out at project scope. For [`Scope::User`] each
/// path under `dir`'s project path is moved under its user path. A file
/// outside `dir` has no user-scope place, so it is refused.
fn rebase(files: Vec<ExportedFile>, dir: &ScopedRelative, scope: Scope) -> Result<ExportedTree> {
    if scope == Scope::Project || dir.project == dir.user {
        return Ok(files.into_iter().collect());
    }
    files
        .into_iter()
        .map(|mut file| {
            let rest = file.path.strip_prefix(&dir.project).map_err(|_| {
                Error::render(format!(
                    "{} is outside {}, so it has no user-scope path",
                    file.path.display(),
                    dir.project.display()
                ))
            })?;
            // A file that is the scoped path itself (a hooks or MCP file)
            // has an empty rest, and joining "" would add a trailing slash.
            file.path = if rest.as_os_str().is_empty() {
                dir.user.clone()
            } else {
                dir.user.join(rest)
            };
            Ok(file)
        })
        .collect()
}

/// Render and install a single [`Skill`].
///
/// [`Scope::Project`] writes under `project_root`. [`Scope::User`] writes
/// under [`user_anchor`] at the runtime's user-scope skills directory, and
/// ignores `project_root`. Returns the absolute paths written.
///
/// # Errors
///
/// A render failure, an I/O failure, or a user-scope install with no home
/// directory set.
pub fn install_skill<R: SkillCapability>(
    runtime: &R,
    project_root: &Path,
    scope: Scope,
    skill: &Skill,
) -> Result<Vec<PathBuf>> {
    install_skill_at(runtime, &scope_anchor(project_root, scope)?, scope, skill)
}

fn install_skill_at<R: SkillCapability>(
    runtime: &R,
    anchor: &Path,
    scope: Scope,
    skill: &Skill,
) -> Result<Vec<PathBuf>> {
    let files = runtime.render_skill(skill)?;
    write_tree(&rebase(files, &runtime.paths().skills_dir, scope)?, anchor)
}

/// Render and install a single [`Agent`]. Scope works as in
/// [`install_skill`], with the runtime's agents directory.
///
/// # Errors
///
/// As [`install_skill`].
pub fn install_agent<R: AgentCapability>(
    runtime: &R,
    project_root: &Path,
    scope: Scope,
    agent: &Agent,
) -> Result<Vec<PathBuf>> {
    install_agent_at(runtime, &scope_anchor(project_root, scope)?, scope, agent)
}

fn install_agent_at<R: AgentCapability>(
    runtime: &R,
    anchor: &Path,
    scope: Scope,
    agent: &Agent,
) -> Result<Vec<PathBuf>> {
    let files = runtime.render_agent(agent)?;
    write_tree(&rebase(files, &runtime.paths().agents_dir, scope)?, anchor)
}

/// Render and install a collection of [`Hook`]s. Scope works as in
/// [`install_skill`], with the runtime's hooks file.
///
/// Empty slice or runtimes with no hooks file produce a no-op
/// (returning an empty `Vec`), not an error.
///
/// # Errors
///
/// As [`install_skill`].
pub fn install_hooks<R: HookCapability>(
    runtime: &R,
    project_root: &Path,
    scope: Scope,
    hooks: &[Hook],
) -> Result<Vec<PathBuf>> {
    install_hooks_at(runtime, &scope_anchor(project_root, scope)?, scope, hooks)
}

fn install_hooks_at<R: HookCapability>(
    runtime: &R,
    anchor: &Path,
    scope: Scope,
    hooks: &[Hook],
) -> Result<Vec<PathBuf>> {
    let files = runtime.render_hooks(hooks)?;
    let tree = match &runtime.paths().hooks_file {
        Some(file) => rebase(files, file, scope)?,
        None => files.into_iter().collect(),
    };
    write_tree(&tree, anchor)
}

/// Render and install a single [`Script`]. Scope works as in
/// [`install_skill`], with the runtime's scripts directory.
///
/// # Errors
///
/// As [`install_skill`].
pub fn install_script<R: ScriptCapability>(
    runtime: &R,
    project_root: &Path,
    scope: Scope,
    script: &Script,
) -> Result<PathBuf> {
    install_script_at(runtime, &scope_anchor(project_root, scope)?, scope, script)
}

fn install_script_at<R: ScriptCapability>(
    runtime: &R,
    anchor: &Path,
    scope: Scope,
    script: &Script,
) -> Result<PathBuf> {
    let file = runtime.render_script(script)?;
    let tree = rebase(vec![file], &runtime.paths().scripts_dir, scope)?;
    let file = tree.iter().next().expect("rebase keeps every file");
    write_one(file, anchor)
}

/// Render and install a single [`McpServer`]. Scope works as in
/// [`install_skill`], with the runtime's MCP config file.
///
/// Writes a **standalone** config file containing only this server.
/// Merging into an existing user-owned config (preserving entries the
/// user added manually) is not supported yet.
///
/// # Errors
///
/// As [`install_skill`].
pub fn install_mcp_server<R: McpCapability>(
    runtime: &R,
    project_root: &Path,
    scope: Scope,
    server: &McpServer,
) -> Result<Vec<PathBuf>> {
    install_mcp_server_at(runtime, &scope_anchor(project_root, scope)?, scope, server)
}

fn install_mcp_server_at<R: McpCapability>(
    runtime: &R,
    anchor: &Path,
    scope: Scope,
    server: &McpServer,
) -> Result<Vec<PathBuf>> {
    let files = runtime.render_mcp_server(server)?;
    let tree = match &runtime.paths().mcp_config_file {
        Some(file) => rebase(files, file, scope)?,
        None => files.into_iter().collect(),
    };
    write_tree(&tree, anchor)
}

/// Render and install an entire [`PluginBundle`] onto `project_root`.
///
/// Requires the runtime to implement every capability. For generic
/// packaging targets without hooks or MCP, use
/// [`install_plugin_no_mcp_no_hooks`].
pub fn install_plugin<R>(
    runtime: &R,
    project_root: &Path,
    bundle: &PluginBundle,
) -> Result<Vec<PathBuf>>
where
    R: SkillCapability + AgentCapability + HookCapability + ScriptCapability + McpCapability,
{
    let tree = compose::render_plugin(runtime, bundle)?;
    write_tree(&tree, project_root)
}

/// Render and install a [`PluginBundle`] onto `project_root` for a
/// runtime that only supports skills, agents, and scripts.
pub fn install_plugin_no_mcp_no_hooks<R>(
    runtime: &R,
    project_root: &Path,
    bundle: &PluginBundle,
) -> Result<Vec<PathBuf>>
where
    R: SkillCapability + AgentCapability + ScriptCapability,
{
    let tree = compose::render_plugin_no_mcp_no_hooks(runtime, bundle)?;
    write_tree(&tree, project_root)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mcp::McpServer;
    use crate::runtimes::ClaudeCode;
    use crate::{Plugin, PluginBundle, Skill};
    use tempfile::TempDir;

    #[test]
    fn write_tree_creates_parent_dirs() {
        let dir = TempDir::new().unwrap();
        let mut tree = ExportedTree::new();
        tree.push(ExportedFile::text_file(
            "deeply/nested/file.md",
            "hello",
            crate::ExportedFileType::Skill,
        ));
        let written = write_tree(&tree, dir.path()).unwrap();
        assert_eq!(written.len(), 1);
        assert!(written[0].exists());
        assert_eq!(fs::read_to_string(&written[0]).unwrap(), "hello");
    }

    #[test]
    fn install_skill_writes_to_runtime_convention() {
        let dir = TempDir::new().unwrap();
        let skill = Skill::new("My Skill", "desc", "body");
        let written = install_skill(&ClaudeCode, dir.path(), Scope::Project, &skill).unwrap();
        assert_eq!(written.len(), 1);
        let expected = dir.path().join(".claude/skills/my-skill/SKILL.md");
        assert_eq!(written[0], expected);
        assert!(expected.exists());
    }

    #[cfg(unix)]
    #[test]
    fn install_skill_applies_resource_exec_bits() {
        use std::os::unix::fs::PermissionsExt;
        let dir = TempDir::new().unwrap();
        let mut skill = Skill::new("My Skill", "desc", "body");
        skill.resources.push(crate::SkillResource {
            relative_path: "run.sh".into(),
            content: b"#!/bin/sh\n".to_vec(),
            executable: true,
        });
        skill.resources.push(crate::SkillResource {
            relative_path: "notes.md".into(),
            content: b"peer\n".to_vec(),
            executable: false,
        });
        let written = install_skill(&ClaudeCode, dir.path(), Scope::Project, &skill).unwrap();
        assert_eq!(written.len(), 3);
        let mode_of = |name: &str| {
            let p = dir.path().join(".claude/skills/my-skill").join(name);
            fs::metadata(p).unwrap().permissions().mode()
        };
        assert_ne!(mode_of("run.sh") & 0o111, 0, "script gets exec bits");
        assert_eq!(
            mode_of("notes.md") & 0o111,
            0,
            "plain resource stays non-executable"
        );
        assert_eq!(mode_of("SKILL.md") & 0o111, 0);
    }

    #[test]
    fn install_mcp_server_writes_claude_json_at_project_root() {
        let dir = TempDir::new().unwrap();
        let server = McpServer::http("example", "http://localhost:4243/mcp");
        let written = install_mcp_server(&ClaudeCode, dir.path(), Scope::Project, &server).unwrap();
        assert_eq!(written.len(), 1);
        assert_eq!(written[0], dir.path().join(".mcp.json"));
        let content = fs::read_to_string(&written[0]).unwrap();
        assert!(content.contains("\"mcpServers\""));
        assert!(content.contains("\"example\""));
    }

    #[test]
    fn install_plugin_writes_full_tree() {
        let dir = TempDir::new().unwrap();
        let plugin = Plugin {
            name: "Test Plugin".into(),
            slug: "test-plugin".into(),
            namespace: None,
            description: None,
            version_label: "1.0.0".into(),
            author: None,
            license: None,
            tags: vec![],
            category: None,
        };
        let mut bundle = PluginBundle::new(plugin);
        bundle.skills.push(Skill::new("One", "d", "b"));
        bundle.skills.push(Skill::new("Two", "d", "b"));

        let written = install_plugin(&ClaudeCode, dir.path(), &bundle).unwrap();
        assert!(
            written
                .iter()
                .any(|p| p.ends_with(".claude/skills/one/SKILL.md"))
        );
        assert!(
            written
                .iter()
                .any(|p| p.ends_with(".claude/skills/two/SKILL.md"))
        );
        assert!(written.iter().any(|p| p.ends_with("MANIFEST.md")));
    }

    #[test]
    fn user_scope_moves_a_skill_to_the_user_skills_dir() {
        use crate::runtimes::Antigravity;
        let home = TempDir::new().unwrap();
        let skill = Skill::new("My Skill", "desc", "body");
        let written = install_skill_at(&Antigravity, home.path(), Scope::User, &skill).unwrap();
        assert_eq!(
            written,
            [home
                .path()
                .join(".gemini/antigravity-cli/skills/my-skill/SKILL.md")]
        );
    }

    #[test]
    fn user_scope_moves_an_mcp_config_to_the_user_file() {
        use crate::runtimes::Antigravity;
        let home = TempDir::new().unwrap();
        let server = McpServer::http("example", "http://localhost:4243/mcp");
        let written =
            install_mcp_server_at(&Antigravity, home.path(), Scope::User, &server).unwrap();
        assert_eq!(
            written,
            [home.path().join(".gemini/config/mcp_config.json")]
        );
    }

    #[test]
    fn rebase_refuses_a_file_outside_the_scoped_dir() {
        let dir = ScopedRelative {
            project: ".agents/skills".into(),
            user: ".home/skills".into(),
        };
        let file = ExportedFile::text_file("elsewhere/x.md", "x", crate::ExportedFileType::Skill);
        assert!(rebase(vec![file.clone()], &dir, Scope::User).is_err());
        let tree = rebase(vec![file], &dir, Scope::Project).unwrap();
        assert_eq!(tree.as_slice()[0].path, PathBuf::from("elsewhere/x.md"));
    }

    #[test]
    fn project_scope_anchors_at_the_project_root() {
        let root = Path::new("/work/repo");
        assert_eq!(scope_anchor(root, Scope::Project).unwrap(), root);
    }

    #[test]
    fn install_agent_hooks_and_script_write_to_runtime_convention() {
        let dir = TempDir::new().unwrap();
        let agent = Agent::new("Reviewer", "reviewer");
        let written = install_agent(&ClaudeCode, dir.path(), Scope::Project, &agent).unwrap();
        assert_eq!(written, [dir.path().join(".claude/agents/reviewer.md")]);

        let hooks = [Hook::command("Lint", "lint", "PreToolUse", "make lint")];
        let written = install_hooks(&ClaudeCode, dir.path(), Scope::Project, &hooks).unwrap();
        assert_eq!(written, [dir.path().join(".claude/hooks.json")]);

        let script = Script {
            name: "Run".into(),
            slug: "run".into(),
            description: None,
            language: crate::ScriptLanguage::Bash,
            body: "echo hi".into(),
            timeout_ms: 0,
            tags: vec![],
            category: None,
            is_template: false,
        };
        let written = install_script(&ClaudeCode, dir.path(), Scope::Project, &script).unwrap();
        assert_eq!(written, dir.path().join(".claude/scripts/run.sh"));
        let written = install_script_at(&ClaudeCode, dir.path(), Scope::User, &script).unwrap();
        assert_eq!(written, dir.path().join(".claude/scripts/run.sh"));
    }

    #[test]
    fn install_plugin_no_mcp_no_hooks_writes_the_skills() {
        use crate::runtimes::NpmPackage;
        let dir = TempDir::new().unwrap();
        let mut bundle = PluginBundle::new(Plugin {
            name: "P".into(),
            slug: "p".into(),
            namespace: None,
            description: None,
            version_label: "1.0.0".into(),
            author: None,
            license: None,
            tags: vec![],
            category: None,
        });
        bundle.skills.push(Skill::new("One", "d", "b"));
        let written = install_plugin_no_mcp_no_hooks(&NpmPackage, dir.path(), &bundle).unwrap();
        assert!(
            written.iter().any(|p| p.ends_with("one/SKILL.md")),
            "{written:?}"
        );
    }

    #[test]
    fn exported_tree_method_alias_works() {
        let dir = TempDir::new().unwrap();
        let mut tree = ExportedTree::new();
        tree.push(ExportedFile::text_file(
            "a.txt",
            "x",
            crate::ExportedFileType::Other,
        ));
        let written = tree.write_to_dir(dir.path()).unwrap();
        assert_eq!(written.len(), 1);
    }
}
