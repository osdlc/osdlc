//! `parse_git_source`.
//!
//! Parse-only: no network, no checkout, no `fetch_git_source` call. The
//! fetch/cache-path behavior has its own tests inside `src/git_source.rs`
//! itself, over local `file://` fixtures.

use skillwright::git_source::{GitSource, parse_git_source};

#[test]
fn a_bare_owner_and_repo_is_github() {
    assert_eq!(
        parse_git_source("acme/agent-kit"),
        Some(GitSource {
            url: "https://github.com/acme/agent-kit".to_string(),
            r#ref: None,
            subpath: None,
        })
    );
}

#[test]
fn a_path_inside_and_a_ref_come_off_the_end() {
    assert_eq!(
        parse_git_source("acme/agent-kit/skills@v2.1"),
        Some(GitSource {
            url: "https://github.com/acme/agent-kit".to_string(),
            r#ref: Some("v2.1".to_string()),
            subpath: Some("skills".to_string()),
        })
    );
    assert_eq!(
        parse_git_source("github.com/acme/agent-kit/skills/inner"),
        Some(GitSource {
            url: "https://github.com/acme/agent-kit".to_string(),
            r#ref: None,
            subpath: Some("skills/inner".to_string()),
        })
    );
}

#[test]
fn a_browser_url_gives_up_the_ref_and_path_it_carries_in_its_path() {
    assert_eq!(
        parse_git_source("https://github.com/acme/agent-kit/tree/v2.1/skills"),
        Some(GitSource {
            url: "https://github.com/acme/agent-kit".to_string(),
            r#ref: Some("v2.1".to_string()),
            subpath: Some("skills".to_string()),
        })
    );
}

#[test]
fn the_ssh_form_keeps_its_authority_and_still_takes_a_ref() {
    // The `@` in `git@github.com` must not read as a ref, and the one before
    // `v2.1` must.
    assert_eq!(
        parse_git_source("git@github.com:acme/agent-kit.git@v2.1"),
        Some(GitSource {
            url: "git@github.com:acme/agent-kit.git".to_string(),
            r#ref: Some("v2.1".to_string()),
            subpath: None,
        })
    );
}

#[test]
fn a_file_url_is_a_repository_and_one_segment_is_not() {
    assert_eq!(
        parse_git_source("file:///tmp/kit.git@main#skills"),
        Some(GitSource {
            url: "file:///tmp/kit.git".to_string(),
            r#ref: Some("main".to_string()),
            subpath: Some("skills".to_string()),
        })
    );
    assert_eq!(parse_git_source("agent-kit"), None);
    assert_eq!(parse_git_source(""), None);
}

#[test]
fn an_option_like_ref_or_url_is_refused_so_it_cannot_reach_git_as_a_flag() {
    // A ref beginning with `-` would reach `git fetch`/`git checkout` as an
    // option — `--upload-pack=<prog>` is local command execution.
    assert_eq!(parse_git_source("acme/kit@--upload-pack=sh"), None);
    assert_eq!(parse_git_source("acme/kit@-oProxyCommand=sh"), None);
    // A dash-led ref carried inside a browser URL is refused too.
    assert_eq!(
        parse_git_source("https://github.com/acme/kit/tree/--upload-pack=sh"),
        None
    );
    // A legitimate ref that merely contains a dash still parses.
    assert_eq!(
        parse_git_source("acme/kit@release-1.2").and_then(|s| s.r#ref),
        Some("release-1.2".to_string())
    );
}
