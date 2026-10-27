//! One [`Role`] as a markdown file with frontmatter.
//!
//! Roles are runtime-agnostic authoring content — reusable system-prompt
//! bodies referenced by slug — so there is no `RoleCapability` and no
//! per-runtime dialect: every composition in [`crate::compose`] writes the
//! same `roles/<slug>.md`. A runtime that later grows a role mechanism can
//! read that file; until then it is at least present in the export rather
//! than dropped.

use std::path::PathBuf;

use crate::render::FrontmatterBuilder;
use crate::{FieldNaming, FrontmatterDialect, Role};

/// Snake-case and nothing omitted: a role file is this crate's own shape,
/// not any harness's.
const ROLE_DIALECT: FrontmatterDialect = FrontmatterDialect {
    field_naming: FieldNaming::Snake,
    omit_fields: &[],
    emit_user_invocable_default: false,
};

/// Where a role lands in an exported tree.
pub fn role_path(role: &Role) -> PathBuf {
    PathBuf::from(format!("roles/{}.md", role.slug))
}

/// A role's frontmatter (`name`, `slug`, optional `description`, optional
/// `tags`) followed by its system-prompt body.
pub fn render_role_md(role: &Role) -> String {
    let mut b = FrontmatterBuilder::new(&ROLE_DIALECT);
    b.scalar("name", &role.name);
    b.scalar("slug", &role.slug);
    if let Some(description) = role.description.as_deref()
        && !description.is_empty()
    {
        b.scalar("description", description);
    }
    if !role.tags.is_empty() {
        b.list("tags", &role.tags);
    }
    let body = role.body.trim_end();
    format!("{}\n{body}\n", b.build())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn role() -> Role {
        Role {
            name: "Expert Reviewer".into(),
            slug: "expert-reviewer".into(),
            description: Some("Reviews like an expert.".into()),
            body: "You are an expert reviewer.".into(),
            tags: vec!["review".into()],
        }
    }

    #[test]
    fn a_role_renders_its_frontmatter_and_body() {
        let out = render_role_md(&role());
        assert!(out.starts_with("---\n"), "{out}");
        assert!(out.contains("name: Expert Reviewer"), "{out}");
        assert!(out.contains("slug: expert-reviewer"), "{out}");
        assert!(
            out.contains("description: Reviews like an expert."),
            "{out}"
        );
        assert!(
            out.trim_end().ends_with("You are an expert reviewer."),
            "{out}"
        );
        assert_eq!(
            role_path(&role()).to_string_lossy(),
            "roles/expert-reviewer.md"
        );
    }
}
