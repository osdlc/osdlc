//! Integration tests. Each one creates real git repositories in a temporary
//! directory.

use std::fs;
use std::path::Path;

use serial_test::serial;
use typed_git::{GitError, commit, git, query, worktree};

const NULL_DEVICE: &str = if cfg!(windows) { "NUL" } else { "/dev/null" };

/// Environment variables that isolate git from global/system config.
/// Prevents lock contention when tests run in parallel.
fn test_env(tmp: &Path) -> Vec<(&'static str, String)> {
    vec![
        ("HOME", tmp.to_string_lossy().into_owned()),
        ("GIT_CONFIG_NOSYSTEM", "1".into()),
        ("GIT_CONFIG_GLOBAL", NULL_DEVICE.into()),
        ("GIT_AUTHOR_NAME", "Test".into()),
        ("GIT_AUTHOR_EMAIL", "test@test.com".into()),
        ("GIT_COMMITTER_NAME", "Test".into()),
        ("GIT_COMMITTER_EMAIL", "test@test.com".into()),
    ]
}

/// Create a `GitCommand` pre-configured with test environment isolation.
fn test_git(tmp: &Path) -> typed_git::GitCommand {
    let mut cmd = git();
    cmd.envs(test_env(tmp));
    cmd
}

/// Fails fast when a git hook's `GIT_DIR` or `GIT_WORK_TREE` leaks in.
/// The library's own commands inherit the environment, so with either set
/// they would run against that repository instead of the test's.
fn refuse_leaked_git_env() {
    for var in ["GIT_DIR", "GIT_WORK_TREE"] {
        assert!(
            std::env::var_os(var).is_none(),
            "{var} is set; unset it before running these tests"
        );
    }
}

/// Initialize a bare-minimum git repo in a temp directory.
fn init_repo(path: &Path) {
    refuse_leaked_git_env();
    test_git(path).dir(path).args(&["init"]).run().unwrap();

    test_git(path)
        .dir(path)
        .args(&["config", "user.email", "test@test.com"])
        .run()
        .unwrap();
    test_git(path)
        .dir(path)
        .args(&["config", "user.name", "Test"])
        .run()
        .unwrap();

    test_git(path)
        .dir(path)
        .args(&["commit", "--allow-empty", "-m", "initial"])
        .run()
        .unwrap();
}

// ── cmd tests ─────────────────────────────────────────────────────────

#[test]
#[serial]
fn git_run_returns_stdout() {
    let tmp = tempfile::tempdir().unwrap();
    init_repo(tmp.path());

    let out = test_git(tmp.path())
        .dir(tmp.path())
        .args(&["branch", "--show-current"])
        .run()
        .unwrap();
    // Default branch name varies by system config, just check it's non-empty
    assert!(!out.is_empty());
}

#[test]
#[serial]
fn git_run_returns_error_on_bad_command() {
    let tmp = tempfile::tempdir().unwrap();
    init_repo(tmp.path());

    let err = test_git(tmp.path())
        .dir(tmp.path())
        .args(&["log", "--not-a-real-flag"])
        .run()
        .unwrap_err();

    assert!(matches!(err, GitError::Command { .. }));
}

#[test]
#[serial]
fn git_check_returns_bool() {
    let tmp = tempfile::tempdir().unwrap();
    init_repo(tmp.path());

    assert!(
        test_git(tmp.path())
            .dir(tmp.path())
            .args(&["rev-parse", "HEAD"])
            .check()
            .unwrap()
    );

    assert!(
        !test_git(tmp.path())
            .dir(tmp.path())
            .args(&["rev-parse", "--verify", "refs/heads/nonexistent"])
            .check()
            .unwrap()
    );
}

// ── query tests ───────────────────────────────────────────────────────

#[test]
#[serial]
fn head_sha_is_40_hex_chars() {
    let tmp = tempfile::tempdir().unwrap();
    init_repo(tmp.path());

    let sha = query::head_sha(tmp.path()).unwrap();
    assert_eq!(sha.len(), 40);
    assert!(sha.chars().all(|c| c.is_ascii_hexdigit()));
}

#[test]
#[serial]
fn is_repo_true_for_git_dir() {
    let tmp = tempfile::tempdir().unwrap();
    init_repo(tmp.path());

    assert!(query::is_repo(tmp.path()).unwrap());
}

#[test]
#[serial]
fn is_repo_false_for_plain_dir() {
    refuse_leaked_git_env();
    let tmp = tempfile::tempdir().unwrap();

    assert!(!query::is_repo(tmp.path()).unwrap());
}

#[test]
#[serial]
fn is_clean_on_fresh_repo() {
    let tmp = tempfile::tempdir().unwrap();
    init_repo(tmp.path());

    assert!(query::is_clean(tmp.path()).unwrap());
}

#[test]
#[serial]
fn is_clean_false_with_untracked_file() {
    let tmp = tempfile::tempdir().unwrap();
    init_repo(tmp.path());

    fs::write(tmp.path().join("new.txt"), "hello").unwrap();

    assert!(!query::is_clean(tmp.path()).unwrap());
}

#[test]
#[serial]
fn has_valid_head_true_after_init() {
    let tmp = tempfile::tempdir().unwrap();
    init_repo(tmp.path());

    assert!(query::has_valid_head(tmp.path()).unwrap());
}

#[test]
#[serial]
fn branch_exists_and_not_exists() {
    let tmp = tempfile::tempdir().unwrap();
    init_repo(tmp.path());

    let branch = query::current_branch(tmp.path()).unwrap();
    assert!(query::branch_exists(tmp.path(), &branch).unwrap());
    assert!(!query::branch_exists(tmp.path(), "nonexistent").unwrap());
}

#[test]
#[serial]
fn diff_stat_between_commits() {
    let tmp = tempfile::tempdir().unwrap();
    init_repo(tmp.path());

    let sha1 = query::head_sha(tmp.path()).unwrap();

    fs::write(tmp.path().join("file.txt"), "content").unwrap();

    test_git(tmp.path())
        .dir(tmp.path())
        .args(&["add", "."])
        .run()
        .unwrap();

    test_git(tmp.path())
        .dir(tmp.path())
        .args(&["commit", "-m", "add file"])
        .run()
        .unwrap();

    let sha2 = query::head_sha(tmp.path()).unwrap();

    let stat = query::diff_stat(tmp.path(), &sha1, &sha2).unwrap();
    assert!(stat.contains("file.txt"));
}

#[test]
#[serial]
fn log_oneline_returns_entries() {
    let tmp = tempfile::tempdir().unwrap();
    init_repo(tmp.path());

    test_git(tmp.path())
        .dir(tmp.path())
        .args(&["commit", "--allow-empty", "-m", "second"])
        .run()
        .unwrap();

    let log = query::log_oneline(tmp.path(), "HEAD", 5).unwrap();
    assert_eq!(log.len(), 2);
}

// ── worktree tests ────────────────────────────────────────────────────

#[test]
#[serial]
fn worktree_create_and_remove() {
    let tmp = tempfile::tempdir().unwrap();
    init_repo(tmp.path());

    let wt_path =
        worktree::create(tmp.path(), Path::new(".worktrees"), "test-branch", "wt-1").unwrap();
    assert!(wt_path.exists());
    assert!(query::is_repo(&wt_path).unwrap());

    // Verify it's on the right branch
    let branch = query::current_branch(&wt_path).unwrap();
    assert_eq!(branch, "test-branch");

    worktree::remove(tmp.path(), &wt_path).unwrap();
    assert!(!wt_path.exists());
}

#[test]
#[serial]
fn worktree_create_idempotent_when_path_exists() {
    let tmp = tempfile::tempdir().unwrap();
    init_repo(tmp.path());

    let path1 =
        worktree::create(tmp.path(), Path::new(".worktrees"), "branch-a", "wt-idem").unwrap();
    let path2 =
        worktree::create(tmp.path(), Path::new(".worktrees"), "branch-a", "wt-idem").unwrap();
    assert_eq!(path1, path2);

    worktree::remove(tmp.path(), &path1).unwrap();
}

#[test]
#[serial]
fn worktree_create_reuses_existing_branch() {
    let tmp = tempfile::tempdir().unwrap();
    init_repo(tmp.path());

    // Create a branch first, then create a worktree for it
    test_git(tmp.path())
        .dir(tmp.path())
        .args(&["branch", "preexisting"])
        .run()
        .unwrap();

    let wt_path = worktree::create(
        tmp.path(),
        Path::new(".worktrees"),
        "preexisting",
        "wt-reuse",
    )
    .unwrap();
    assert!(wt_path.exists());

    let branch = query::current_branch(&wt_path).unwrap();
    assert_eq!(branch, "preexisting");

    worktree::remove(tmp.path(), &wt_path).unwrap();
}

#[test]
#[serial]
fn worktree_is_healthy_and_not() {
    refuse_leaked_git_env();
    let tmp = tempfile::tempdir().unwrap();
    init_repo(tmp.path());

    let wt_path = worktree::create(
        tmp.path(),
        Path::new(".worktrees"),
        "health-branch",
        "wt-health",
    )
    .unwrap();
    assert!(worktree::is_healthy(&wt_path).unwrap());

    // Non-existent path is not healthy
    assert!(!worktree::is_healthy(tmp.path().join("nope").as_path()).unwrap());

    // Plain directory outside any git repo is not healthy
    let plain = tempfile::tempdir().unwrap();
    assert!(!worktree::is_healthy(plain.path()).unwrap());

    worktree::remove(tmp.path(), &wt_path).unwrap();
}

#[test]
#[serial]
fn worktree_remove_noop_on_missing_path() {
    let tmp = tempfile::tempdir().unwrap();
    init_repo(tmp.path());

    // Should succeed without error
    worktree::remove(tmp.path(), &tmp.path().join("nonexistent")).unwrap();
}

#[test]
#[serial]
fn status_report_reads_branch_ahead_behind_and_every_file_state() {
    let tmp = tempfile::tempdir().unwrap();
    let repo = tmp.path();
    init_repo(repo);

    fs::write(repo.join("tracked.md"), "one\n").unwrap();
    test_git(repo).dir(repo).args(&["add", "."]).run().unwrap();
    test_git(repo)
        .dir(repo)
        .args(&["commit", "-m", "tracked"])
        .run()
        .unwrap();

    // A LOCAL branch as the upstream. git accepts one, so ahead/behind can be
    // exercised without a second repository and a network-shaped push.
    let branch = query::current_branch(repo).unwrap();
    test_git(repo)
        .dir(repo)
        .args(&["branch", "upstream-ref"])
        .run()
        .unwrap();
    test_git(repo)
        .dir(repo)
        .args(&["branch", "--set-upstream-to=upstream-ref"])
        .arg(&branch)
        .run()
        .unwrap();

    fs::write(repo.join("tracked.md"), "two\n").unwrap();
    test_git(repo)
        .dir(repo)
        .args(&["commit", "-am", "ahead by one"])
        .run()
        .unwrap();

    // One path per state.
    fs::write(repo.join("tracked.md"), "three\n").unwrap();
    fs::write(repo.join("staged.md"), "staged\n").unwrap();
    test_git(repo)
        .dir(repo)
        .args(&["add", "staged.md"])
        .run()
        .unwrap();
    fs::write(repo.join("untracked.md"), "untracked\n").unwrap();

    let report = query::status_report(repo).unwrap();
    assert_eq!(report.branch.as_deref(), Some(branch.as_str()));
    assert_eq!(report.upstream.as_deref(), Some("upstream-ref"));
    assert_eq!(report.ahead, Some(1));
    assert_eq!(report.behind, Some(0));

    let mut entries = report.entries.clone();
    entries.sort_by(|a, b| a.path.cmp(&b.path));
    assert_eq!(
        entries
            .iter()
            .map(|e| (e.path.as_str(), e.state))
            .collect::<Vec<_>>(),
        vec![
            ("staged.md", query::FileState::Staged),
            ("tracked.md", query::FileState::Modified),
            ("untracked.md", query::FileState::Untracked),
        ]
    );
}

#[test]
#[serial]
fn status_report_on_a_clean_untracked_branch_is_empty_and_knows_no_upstream() {
    let tmp = tempfile::tempdir().unwrap();
    init_repo(tmp.path());

    let report = query::status_report(tmp.path()).unwrap();
    assert_eq!(
        report.branch.as_deref(),
        Some(query::current_branch(tmp.path()).unwrap().as_str())
    );
    assert_eq!(report.upstream, None);
    // Unknown, not level — nothing to be ahead OF.
    assert_eq!(report.ahead, None);
    assert_eq!(report.behind, None);
    assert!(report.entries.is_empty());
}

#[test]
#[serial]
fn status_report_of_lists_only_the_named_paths_and_untracked_files_one_by_one() {
    let tmp = tempfile::tempdir().unwrap();
    let repo = tmp.path();
    repo_with_files(repo);
    fs::write(repo.join("a.md"), "changed\n").unwrap();
    fs::create_dir_all(repo.join("new")).unwrap();
    fs::write(repo.join("new/one.md"), "x").unwrap();
    fs::write(repo.join("new/two.md"), "x").unwrap();

    let report = query::status_report_of(repo, &["new/one.md", "b.md"]).unwrap();
    let paths: Vec<_> = report.entries.iter().map(|e| e.path.as_str()).collect();
    assert_eq!(paths, ["new/one.md"]);
}

// ── commit, revert, push and repo state ───────────────────────────────

/// Run one setup command in `repo` with the isolated environment.
fn run(repo: &Path, args: &[&str]) {
    test_git(repo)
        .dir(repo)
        .args(args)
        .run()
        .unwrap_or_else(|e| panic!("git {}: {e}", args.join(" ")));
}

/// A repo with `a.md`, `b.md` and `c.md` committed.
fn repo_with_files(repo: &Path) {
    init_repo(repo);
    for name in ["a.md", "b.md", "c.md"] {
        fs::write(repo.join(name), format!("{name}\n")).unwrap();
    }
    run(repo, &["add", "."]);
    run(repo, &["commit", "-m", "files"]);
}

fn state_of(repo: &Path, path: &str) -> Option<query::FileState> {
    query::status_report(repo)
        .unwrap()
        .entries
        .into_iter()
        .find(|e| e.path == path)
        .map(|e| e.state)
}

#[test]
#[serial]
fn commit_only_commits_the_named_paths_and_leaves_staged_work_staged() {
    let tmp = tempfile::tempdir().unwrap();
    let repo = tmp.path();
    repo_with_files(repo);

    fs::write(repo.join("a.md"), "edited\n").unwrap();
    fs::remove_file(repo.join("c.md")).unwrap();
    fs::write(repo.join("b.md"), "the user's own\n").unwrap();
    run(repo, &["add", "b.md"]);

    let sha = commit::commit_only(
        repo,
        &["a.md".into(), "c.md".into()],
        "chore: fix 1 safe issue",
        None,
    )
    .unwrap();

    assert_eq!(sha, query::head_sha(repo).unwrap());
    let mut changed = query::commit_paths(repo, &sha).unwrap();
    changed.sort();
    assert_eq!(changed, ["a.md", "c.md"]);
    assert_eq!(
        query::commit_subject(repo, &sha).unwrap(),
        "chore: fix 1 safe issue"
    );
    assert_eq!(state_of(repo, "b.md"), Some(query::FileState::Staged));
    assert_eq!(state_of(repo, "a.md"), None);
}

#[test]
#[serial]
fn commit_only_takes_an_author_and_reads_paths_literally() {
    let tmp = tempfile::tempdir().unwrap();
    let repo = tmp.path();
    repo_with_files(repo);
    // `[ab].md` as a glob would also match a.md. It is a valid file name on
    // Windows, where `*` is not.
    fs::write(repo.join("[ab].md"), "a glob\n").unwrap();
    run(repo, &["add", "--", ":(literal)[ab].md"]);
    run(repo, &["commit", "-m", "glob"]);

    fs::write(repo.join("[ab].md"), "changed\n").unwrap();
    fs::write(repo.join("a.md"), "changed too\n").unwrap();
    let sha = commit::commit_only(
        repo,
        &["[ab].md".into()],
        "glob only",
        Some("Ann Other <ann@example.com>"),
    )
    .unwrap();

    assert_eq!(query::commit_paths(repo, &sha).unwrap(), ["[ab].md"]);
    assert_eq!(state_of(repo, "a.md"), Some(query::FileState::Modified));
    let author = test_git(repo)
        .dir(repo)
        .args(&["log", "-1", "--format=%an <%ae>"])
        .run()
        .unwrap();
    assert_eq!(author, "Ann Other <ann@example.com>");
}

#[test]
#[serial]
fn commit_only_refuses_no_paths_and_carries_gits_message_on_failure() {
    let tmp = tempfile::tempdir().unwrap();
    let repo = tmp.path();
    repo_with_files(repo);

    assert!(commit::commit_only(repo, &[], "nothing", None).is_err());
    fs::write(repo.join("new.md"), "untracked\n").unwrap();
    let err = commit::commit_only(repo, &["new.md".into()], "untracked", None).unwrap_err();
    let GitError::Command { stderr, .. } = err else {
        panic!("expected a command error, got {err:?}");
    };
    assert!(stderr.contains("new.md"), "{stderr}");
}

#[test]
#[serial]
fn commit_all_commits_every_change_untracked_files_included() {
    let tmp = tempfile::tempdir().unwrap();
    let repo = tmp.path();
    repo_with_files(repo);
    fs::write(repo.join("a.md"), "edited\n").unwrap();
    fs::write(repo.join("b.md"), "staged\n").unwrap();
    run(repo, &["add", "b.md"]);
    fs::remove_file(repo.join("c.md")).unwrap();
    fs::write(repo.join("new.md"), "untracked\n").unwrap();

    let sha = commit::commit_all(repo, "wip: changes before edit").unwrap();

    let mut changed = query::commit_paths(repo, &sha).unwrap();
    changed.sort();
    assert_eq!(changed, ["a.md", "b.md", "c.md", "new.md"]);
    assert_eq!(
        query::commit_subject(repo, &sha).unwrap(),
        "wip: changes before edit"
    );
    assert!(query::is_clean(repo).unwrap());
}

#[test]
#[serial]
fn config_value_reads_a_set_key_and_is_none_for_an_unset_one() {
    let tmp = tempfile::tempdir().unwrap();
    let repo = tmp.path();
    init_repo(repo);
    assert_eq!(
        query::config_value(repo, "user.name").unwrap().as_deref(),
        Some("Test")
    );
    assert_eq!(
        query::config_value(repo, "user.email").unwrap().as_deref(),
        Some("test@test.com")
    );
    assert_eq!(query::config_value(repo, "example.nothing").unwrap(), None);
}

#[test]
#[serial]
fn file_at_reads_heads_bytes_and_is_none_for_a_missing_path() {
    let tmp = tempfile::tempdir().unwrap();
    let repo = tmp.path();
    repo_with_files(repo);
    fs::remove_file(repo.join("a.md")).unwrap();
    assert_eq!(
        query::file_at(repo, "HEAD", "a.md").unwrap().as_deref(),
        Some(&b"a.md\n"[..])
    );
    assert_eq!(query::file_at(repo, "HEAD", "nope.md").unwrap(), None);
}

#[test]
#[serial]
fn revert_only_reverts_the_commits_paths_and_keeps_other_staged_work_out() {
    let tmp = tempfile::tempdir().unwrap();
    let repo = tmp.path();
    repo_with_files(repo);
    fs::write(repo.join("a.md"), "edited\n").unwrap();
    fs::remove_file(repo.join("c.md")).unwrap();
    let sha = commit::commit_only(repo, &["a.md".into(), "c.md".into()], "edit", None).unwrap();

    fs::write(repo.join("b.md"), "the user's own\n").unwrap();
    run(repo, &["add", "b.md"]);

    let revert = commit::revert_only(repo, &sha, "Revert \"edit\"").unwrap();

    let mut changed = query::commit_paths(repo, &revert).unwrap();
    changed.sort();
    assert_eq!(changed, ["a.md", "c.md"]);
    assert_eq!(fs::read_to_string(repo.join("a.md")).unwrap(), "a.md\n");
    assert_eq!(fs::read_to_string(repo.join("c.md")).unwrap(), "c.md\n");
    assert_eq!(state_of(repo, "b.md"), Some(query::FileState::Staged));
    assert!(!query::git_path(repo, "REVERT_HEAD").unwrap().exists());
}

#[test]
#[serial]
fn a_revert_that_conflicts_leaves_nothing_half_done() {
    let tmp = tempfile::tempdir().unwrap();
    let repo = tmp.path();
    repo_with_files(repo);
    fs::write(repo.join("a.md"), "edited\n").unwrap();
    let sha = commit::commit_only(repo, &["a.md".into()], "edit", None).unwrap();
    fs::write(repo.join("a.md"), "edited again\n").unwrap();
    run(repo, &["commit", "-am", "later"]);
    fs::write(repo.join("b.md"), "the user's own\n").unwrap();
    run(repo, &["add", "b.md"]);

    let err = commit::revert_only(repo, &sha, "Revert").unwrap_err();

    assert!(matches!(err, GitError::Command { .. }));
    assert!(!query::git_path(repo, "REVERT_HEAD").unwrap().exists());
    assert_eq!(
        fs::read_to_string(repo.join("a.md")).unwrap(),
        "edited again\n"
    );
    assert_eq!(state_of(repo, "a.md"), None);
    assert_eq!(state_of(repo, "b.md"), Some(query::FileState::Staged));
}

#[test]
#[serial]
fn repo_state_reads_merge_rebase_and_detached_head() {
    let tmp = tempfile::tempdir().unwrap();
    let repo = tmp.path();
    repo_with_files(repo);
    assert_eq!(
        query::repo_state(repo).unwrap(),
        query::RepoState::default()
    );

    let main = query::current_branch(repo).unwrap();
    run(repo, &["checkout", "-q", "-b", "other"]);
    fs::write(repo.join("a.md"), "other\n").unwrap();
    run(repo, &["commit", "-qam", "other"]);
    run(repo, &["checkout", "-q", &main]);
    fs::write(repo.join("a.md"), "main\n").unwrap();
    run(repo, &["commit", "-qam", "main"]);

    assert!(
        !test_git(repo)
            .dir(repo)
            .args(&["merge", "other"])
            .check()
            .unwrap()
    );
    assert!(query::repo_state(repo).unwrap().merging);
    run(repo, &["merge", "--abort"]);

    assert!(
        !test_git(repo)
            .dir(repo)
            .args(&["rebase", "other"])
            .check()
            .unwrap()
    );
    let state = query::repo_state(repo).unwrap();
    assert!(state.rebasing && !state.merging);
    run(repo, &["rebase", "--abort"]);

    run(repo, &["checkout", "-q", "--detach"]);
    let state = query::repo_state(repo).unwrap();
    assert!(state.detached && !state.merging && !state.rebasing);
}

#[test]
#[serial]
fn repo_state_in_a_linked_worktree_reads_its_own_git_dir() {
    let tmp = tempfile::tempdir().unwrap();
    let repo = tmp.path().join("main");
    fs::create_dir_all(&repo).unwrap();
    repo_with_files(&repo);
    let linked = tmp.path().join("linked");
    run(
        &repo,
        &[
            "worktree",
            "add",
            "-q",
            "-b",
            "side",
            linked.to_str().unwrap(),
        ],
    );
    // A merge stopped in the main checkout is not the linked worktree's.
    std::fs::write(query::git_path(&repo, "MERGE_HEAD").unwrap(), "0\n").unwrap();

    assert!(query::repo_state(&repo).unwrap().merging);
    assert_eq!(
        query::repo_state(&linked).unwrap(),
        query::RepoState::default()
    );
}

#[test]
#[serial]
fn push_upstream_pushes_head_to_the_tracked_branch() {
    let tmp = tempfile::tempdir().unwrap();
    let remote = tmp.path().join("remote.git");
    fs::create_dir_all(&remote).unwrap();
    run(&remote, &["init", "-q", "--bare"]);
    let repo = tmp.path().join("clone");
    fs::create_dir_all(&repo).unwrap();
    repo_with_files(&repo);

    assert!(commit::upstream_of_head(&repo).unwrap().is_none());
    assert!(commit::push_upstream(&repo).is_err());

    let branch = query::current_branch(&repo).unwrap();
    run(
        &repo,
        &["remote", "add", "origin", remote.to_str().unwrap()],
    );
    run(&repo, &["push", "-q", "-u", "origin", &branch]);
    fs::write(repo.join("a.md"), "edited\n").unwrap();
    commit::commit_only(&repo, &["a.md".into()], "edit", None).unwrap();

    commit::push_upstream(&repo).unwrap();

    let remote_head = test_git(&remote)
        .dir(&remote)
        .arg("rev-parse")
        .arg(&branch)
        .run()
        .unwrap();
    assert_eq!(remote_head, query::head_sha(&repo).unwrap());
}

#[test]
#[serial]
fn worktree_create_takes_an_absolute_base_outside_the_repository() {
    let tmp = tempfile::tempdir().unwrap();
    let repo = tmp.path().join("repo");
    fs::create_dir_all(&repo).unwrap();
    init_repo(&repo);
    let base = tmp.path().join("elsewhere");

    let wt_path = worktree::create(&repo, &base, "outside", "wt-abs").unwrap();
    assert_eq!(wt_path, base.join("wt-abs"));
    assert_eq!(query::current_branch(&wt_path).unwrap(), "outside");

    worktree::remove(&repo, &wt_path).unwrap();
    assert!(!wt_path.exists());
}

#[test]
#[serial]
fn status_short_prints_gits_short_codes() {
    let tmp = tempfile::tempdir().unwrap();
    let repo = tmp.path();
    repo_with_files(repo);
    assert_eq!(query::status_short(repo).unwrap(), "");

    fs::write(repo.join("a.md"), "edited\n").unwrap();
    fs::write(repo.join("new.md"), "untracked\n").unwrap();
    let short = query::status_short(repo).unwrap();
    let lines: Vec<&str> = short.lines().map(str::trim).collect();
    assert_eq!(lines, ["M a.md", "?? new.md"]);
}

#[test]
#[serial]
fn short_sha_is_a_prefix_of_the_full_sha() {
    let tmp = tempfile::tempdir().unwrap();
    let repo = tmp.path();
    init_repo(repo);
    let full = query::head_sha(repo).unwrap();

    let short = query::short_sha(repo, &full).unwrap();
    assert!(short.len() >= 4 && short.len() < full.len(), "{short}");
    assert!(full.starts_with(&short));
    assert_eq!(query::resolve_commit(repo, &short).unwrap(), full);
}
