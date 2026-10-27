//! A tiny YAML-frontmatter builder tailored to the Agent Skills spec.
//!
//! Deliberately avoids pulling in a full YAML crate. The spec frontmatter
//! is a flat map of scalar strings, optional booleans, and one multiline
//! string (`description`), so hand-emitting is simpler and gives us
//! byte-stable output for snapshot tests.
//!
//! # Usage
//!
//! ```
//! use agent_adapt::{FieldNaming, FrontmatterDialect};
//! use agent_adapt::render::FrontmatterBuilder;
//!
//! let dialect = FrontmatterDialect {
//!     field_naming: FieldNaming::Kebab,
//!     omit_fields: &[],
//!     emit_user_invocable_default: false,
//! };
//! let mut b = FrontmatterBuilder::new(&dialect);
//! b.scalar("name", "my-skill");
//! b.scalar("description", "Short description");
//! b.list("allowed_tools", &["Read".into(), "Write".into()]);
//! let yaml = b.build();
//! assert!(yaml.starts_with("---\n"));
//! assert!(yaml.contains("allowed-tools:"));
//! ```

use crate::{FieldNaming, FrontmatterDialect};

/// Fluent builder that emits a YAML frontmatter block (`---` delimited)
/// honoring a [`FrontmatterDialect`].
///
/// Fields are added in the order the caller pushes them; insertion order
/// is preserved so output is deterministic and snapshot-testable. Field
/// names passed to the builder use the *canonical* snake_case form; the
/// builder converts to kebab-case when the dialect requires it.
pub struct FrontmatterBuilder<'a> {
    dialect: &'a FrontmatterDialect,
    /// One entry per emitted key: the name as written, and the lines it
    /// produced. Grouped rather than flat so an override can replace one
    /// key in place, and compare against exactly what it replaced —
    /// see [`FrontmatterBuilder::apply_overrides`].
    entries: Vec<(String, Vec<String>)>,
}

impl<'a> FrontmatterBuilder<'a> {
    /// Start a new frontmatter block with the given dialect.
    pub fn new(dialect: &'a FrontmatterDialect) -> Self {
        Self {
            dialect,
            entries: Vec::new(),
        }
    }

    fn render_name(&self, canonical: &str) -> String {
        match self.dialect.field_naming {
            FieldNaming::Snake => canonical.to_string(),
            FieldNaming::Kebab => canonical.replace('_', "-"),
        }
    }

    fn emit(&mut self, name: String, lines: Vec<String>) {
        self.entries.push((name, lines));
    }

    fn is_omitted(&self, canonical: &str) -> bool {
        self.dialect.omit_fields.contains(&canonical)
    }

    /// Emit a scalar string field. Empty strings are skipped.
    ///
    /// Multi-line values automatically use YAML block-scalar syntax
    /// (`description: |`) with indented continuation lines.
    pub fn scalar(&mut self, canonical_name: &str, value: &str) -> &mut Self {
        if value.is_empty() || self.is_omitted(canonical_name) {
            return self;
        }
        let name = self.render_name(canonical_name);
        let mut lines = Vec::new();
        if value.contains('\n') {
            lines.push(format!("{name}: |"));
            for line in value.lines() {
                lines.push(format!("  {line}"));
            }
        } else {
            lines.push(format!("{name}: {}", structural_scalar(value)));
        }
        self.emit(name, lines);
        self
    }

    /// Emit a double-quoted scalar, escaped. Used for fields like
    /// `argument-hint` where the spec shows a quoted example. Empty
    /// strings are skipped.
    pub fn scalar_quoted(&mut self, canonical_name: &str, value: &str) -> &mut Self {
        if value.is_empty() || self.is_omitted(canonical_name) {
            return self;
        }
        let name = self.render_name(canonical_name);
        let line = format!("{name}: {}", double_quoted(value));
        self.emit(name, vec![line]);
        self
    }

    /// Emit a boolean field. Unlike scalars, booleans are always written
    /// when the field is not in `omit_fields`.
    pub fn boolean(&mut self, canonical_name: &str, value: bool) -> &mut Self {
        if self.is_omitted(canonical_name) {
            return self;
        }
        let name = self.render_name(canonical_name);
        let line = format!("{name}: {value}");
        self.emit(name, vec![line]);
        self
    }

    /// Emit a list of strings as a YAML block sequence. Empty lists are
    /// skipped — no `foo: []` is emitted.
    pub fn list(&mut self, canonical_name: &str, items: &[String]) -> &mut Self {
        if items.is_empty() || self.is_omitted(canonical_name) {
            return self;
        }
        let name = self.render_name(canonical_name);
        let mut lines = vec![format!("{name}:")];
        for item in items {
            lines.push(format!("  - {}", structural_scalar(item)));
        }
        self.emit(name, lines);
        self
    }

    /// Emit an entry at the **top level**: a verbatim field name and an
    /// arbitrary JSON value rendered as YAML.
    ///
    /// No dialect naming conversion and no `omit_fields` check apply — the
    /// key is emitted exactly as given. Nested objects render as indented
    /// block maps with sorted keys, arrays as block sequences, and strings
    /// are double-quoted whenever a plain scalar would re-parse as a
    /// different type.
    ///
    /// An entry whose name matches a field this builder already emitted is
    /// skipped — the modeled field wins, and the frontmatter never carries
    /// a duplicate key.
    ///
    /// # Not the route for unrecognized keys
    ///
    /// Agent Skills frontmatter is a **closed** set of six keys, so a key
    /// the model does not understand cannot be emitted beside the modelled
    /// ones — it goes under `metadata`, and
    /// [`crate::render::render_skill_md`] is what decides that. This method
    /// is the mechanism for emitting one named, spec-shaped key whose value
    /// is a map (`metadata` itself), not a place to pour arbitrary
    /// frontmatter through.
    pub fn raw_entry(&mut self, name: &str, value: &serde_json::Value) -> &mut Self {
        if self.entries.iter().any(|(n, _)| n == name) {
            return self;
        }
        let mut lines = Vec::new();
        emit_yaml_entry(name, value, 0, &mut lines);
        self.emit(name.to_string(), lines);
        self
    }

    /// Merge one target's `tc-overrides` block over what the modelled fields
    /// already wrote, and report the keys that changed nothing.
    ///
    /// Called **last**, after every modelled field, which is the whole
    /// contract: canonical fields render first and the override has the final
    /// word for this one destination. A key the builder already emitted is
    /// replaced *in place*, so a merge never reorders the block; a key it did
    /// not is appended in sorted key order, matching how `emit_yaml_entry`
    /// orders the keys of a nested object.
    ///
    /// # An override outranks `omit_fields`
    ///
    /// No [`FrontmatterDialect::omit_fields`] check applies here, and no
    /// dialect naming conversion: the author named this target and spelled
    /// the key in that harness's own vocabulary, which is more explicit than
    /// a dialect-wide rule about what this crate normally declines to write.
    /// Which keys a target will *accept* is decided before a render, against
    /// [`crate::capabilities::RuntimeCapabilities::overrides`] — the builder
    /// never re-litigates it.
    ///
    /// # The redundancy report
    ///
    /// Returned in sorted key order: every key whose override renders to
    /// exactly the lines the modelled field had already written. That is a
    /// diagnostic and never a refusal — the note publishes unchanged, and a
    /// caller reports "this says what the projection says anyway" so the
    /// author can drop it.
    pub fn apply_overrides(
        &mut self,
        overrides: &serde_json::Map<String, serde_json::Value>,
    ) -> Vec<String> {
        let mut redundant = Vec::new();
        let mut pairs: Vec<_> = overrides.iter().collect();
        pairs.sort_by_key(|(name, _)| *name);
        for (name, value) in pairs {
            let mut lines = Vec::new();
            emit_yaml_entry(name, value, 0, &mut lines);
            match self.entries.iter_mut().find(|(n, _)| n == name) {
                Some((_, existing)) if *existing == lines => redundant.push(name.clone()),
                Some((_, existing)) => *existing = lines,
                None => self.emit(name.clone(), lines),
            }
        }
        redundant
    }

    /// Finalize and return the frontmatter block including the surrounding
    /// `---` delimiters.
    pub fn build(self) -> String {
        let mut out = String::from("---\n");
        for (_, lines) in &self.entries {
            for line in lines {
                out.push_str(line);
                out.push('\n');
            }
        }
        out.push_str("---\n");
        out
    }
}

/// Append `key: value` (recursing into arrays and objects) at the given
/// indent level. Object keys are sorted so output is deterministic even
/// when `serde_json` is built with `preserve_order`.
fn emit_yaml_entry(key: &str, value: &serde_json::Value, indent: usize, out: &mut Vec<String>) {
    use serde_json::Value;
    let pad = "  ".repeat(indent);
    match value {
        Value::Array(items) if items.is_empty() => out.push(format!("{pad}{key}: []")),
        Value::Object(map) if map.is_empty() => out.push(format!("{pad}{key}: {{}}")),
        Value::Array(items) => {
            out.push(format!("{pad}{key}:"));
            for item in items {
                emit_yaml_sequence_item(item, indent + 1, out);
            }
        }
        Value::Object(map) => {
            out.push(format!("{pad}{key}:"));
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            for k in keys {
                emit_yaml_entry(k, &map[k.as_str()], indent + 1, out);
            }
        }
        scalar => out.push(format!("{pad}{key}: {}", yaml_scalar(scalar))),
    }
}

/// Append one `- item` sequence entry, recursing for nested collections.
fn emit_yaml_sequence_item(item: &serde_json::Value, indent: usize, out: &mut Vec<String>) {
    use serde_json::Value;
    let pad = "  ".repeat(indent);
    match item {
        Value::Array(items) if items.is_empty() => out.push(format!("{pad}- []")),
        Value::Object(map) if map.is_empty() => out.push(format!("{pad}- {{}}")),
        Value::Array(items) => {
            out.push(format!("{pad}-"));
            for nested in items {
                emit_yaml_sequence_item(nested, indent + 1, out);
            }
        }
        Value::Object(map) => {
            out.push(format!("{pad}-"));
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            for k in keys {
                emit_yaml_entry(k, &map[k.as_str()], indent + 1, out);
            }
        }
        scalar => out.push(format!("{pad}- {}", yaml_scalar(scalar))),
    }
}

/// Render a scalar JSON value as a YAML scalar.
///
/// Strings emit plain only when re-parsing them cannot change their type
/// or structure; anything ambiguous (empty, bool/null/number lookalikes,
/// YAML indicator characters, leading/trailing spaces, newlines) is
/// double-quoted via JSON escaping, which is valid YAML.
fn yaml_scalar(value: &serde_json::Value) -> String {
    use serde_json::Value;
    match value {
        Value::Null => "null".to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        Value::String(s) if plain_scalar_safe(s) => s.clone(),
        Value::String(s) => Value::String(s.clone()).to_string(),
        // Arrays/objects never reach here — the emitters above match them.
        other => other.to_string(),
    }
}

/// `s` as a scalar that parses back to the same text: plain unless the plain
/// form would break the line's structure, double-quoted otherwise.
///
/// Narrower than [`plain_scalar_safe`] on purpose. A number or `true` stays
/// plain, because `scalar` carries typed values (`temperature`) as text, and
/// ordinary prose with commas and apostrophes stays byte-stable.
fn structural_scalar(s: &str) -> String {
    let breaks = s.is_empty()
        || s.starts_with(char::is_whitespace)
        || s.ends_with(char::is_whitespace)
        || s.starts_with([
            '-', '?', ':', ',', '[', ']', '{', '}', '#', '&', '*', '!', '|', '>', '\'', '"', '%',
            '@', '`',
        ])
        || s.contains(": ")
        || s.contains(" #")
        || s.contains('\t')
        || s.ends_with(':');
    if breaks {
        double_quoted(s)
    } else {
        s.to_owned()
    }
}

/// JSON string escaping, which is valid YAML double-quoted style.
fn double_quoted(s: &str) -> String {
    serde_json::Value::String(s.to_owned()).to_string()
}

fn plain_scalar_safe(s: &str) -> bool {
    let Some(first) = s.chars().next() else {
        return false;
    };
    let lower = s.to_ascii_lowercase();
    if matches!(
        lower.as_str(),
        "true" | "false" | "null" | "~" | "yes" | "no" | "on" | "off"
    ) {
        return false;
    }
    if s.parse::<f64>().is_ok() {
        return false;
    }
    (first.is_ascii_alphanumeric() || first == '_' || first == '/')
        && !s.ends_with(' ')
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, ' ' | '_' | '-' | '.' | '/'))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn kebab() -> FrontmatterDialect {
        FrontmatterDialect {
            field_naming: FieldNaming::Kebab,
            omit_fields: &[],
            emit_user_invocable_default: false,
        }
    }

    /// A JSON object as the override map the builder takes.
    fn map(value: serde_json::Value) -> serde_json::Map<String, serde_json::Value> {
        match value {
            serde_json::Value::Object(m) => m,
            other => panic!("override fixtures are objects, got {other}"),
        }
    }

    fn snake() -> FrontmatterDialect {
        FrontmatterDialect {
            field_naming: FieldNaming::Snake,
            omit_fields: &[],
            emit_user_invocable_default: false,
        }
    }

    #[test]
    fn empty_block_has_delimiters() {
        let d = kebab();
        let b = FrontmatterBuilder::new(&d);
        assert_eq!(b.build(), "---\n---\n");
    }

    #[test]
    fn a_scalar_that_would_break_the_line_is_double_quoted() {
        let d = kebab();
        let mut b = FrontmatterBuilder::new(&d);
        b.scalar("description", "Make a page: diagrams of flows");
        b.scalar("model", "#hash-start");
        b.scalar("summary", "plain prose, with an apostrophe's comma");
        b.scalar("temperature", "0.5");
        b.scalar_quoted("argument_hint", "say \"hi\"");
        b.list("tools", &["Bash(git:*)".into(), "- dash".into()]);
        let yaml = b.build();
        assert!(
            yaml.contains("description: \"Make a page: diagrams of flows\"\n"),
            "{yaml}"
        );
        assert!(yaml.contains("model: \"#hash-start\"\n"), "{yaml}");
        assert!(
            yaml.contains("summary: plain prose, with an apostrophe's comma\n"),
            "{yaml}"
        );
        assert!(yaml.contains("temperature: 0.5\n"), "{yaml}");
        assert!(
            yaml.contains("argument-hint: \"say \\\"hi\\\"\"\n"),
            "{yaml}"
        );
        assert!(yaml.contains("  - Bash(git:*)\n  - \"- dash\"\n"), "{yaml}");
    }

    #[test]
    fn scalar_kebab_converts_name() {
        let d = kebab();
        let mut b = FrontmatterBuilder::new(&d);
        b.scalar("allowed_tools", "x");
        let out = b.build();
        assert!(out.contains("allowed-tools: x"));
        assert!(!out.contains("allowed_tools:"));
    }

    #[test]
    fn scalar_snake_preserves_name() {
        let d = snake();
        let mut b = FrontmatterBuilder::new(&d);
        b.scalar("allowed_tools", "x");
        assert!(b.build().contains("allowed_tools: x"));
    }

    #[test]
    fn empty_scalar_is_skipped() {
        let d = kebab();
        let mut b = FrontmatterBuilder::new(&d);
        b.scalar("name", "");
        assert_eq!(b.build(), "---\n---\n");
    }

    #[test]
    fn multiline_scalar_uses_block_scalar() {
        let d = kebab();
        let mut b = FrontmatterBuilder::new(&d);
        b.scalar("description", "line one\nline two");
        let out = b.build();
        assert!(out.contains("description: |"));
        assert!(out.contains("  line one"));
        assert!(out.contains("  line two"));
    }

    #[test]
    fn list_empty_skipped() {
        let d = kebab();
        let mut b = FrontmatterBuilder::new(&d);
        b.list("allowed_tools", &[]);
        assert_eq!(b.build(), "---\n---\n");
    }

    #[test]
    fn list_emits_block_sequence() {
        let d = kebab();
        let mut b = FrontmatterBuilder::new(&d);
        b.list("allowed_tools", &["Read".to_string(), "Write".to_string()]);
        let out = b.build();
        assert!(out.contains("allowed-tools:"));
        assert!(out.contains("  - Read"));
        assert!(out.contains("  - Write"));
    }

    #[test]
    fn boolean_always_emitted() {
        let d = kebab();
        let mut b = FrontmatterBuilder::new(&d);
        b.boolean("disable_model_invocation", true);
        assert!(b.build().contains("disable-model-invocation: true"));
    }

    #[test]
    fn omit_fields_drops_even_when_set() {
        let d = FrontmatterDialect {
            field_naming: FieldNaming::Kebab,
            omit_fields: &["argument_hint"],
            emit_user_invocable_default: false,
        };
        let mut b = FrontmatterBuilder::new(&d);
        b.scalar_quoted("argument_hint", "x");
        b.scalar("name", "y");
        let out = b.build();
        assert!(!out.contains("argument-hint"));
        assert!(out.contains("name: y"));
    }

    #[test]
    fn raw_entry_scalar_kinds() {
        let d = kebab();
        let mut b = FrontmatterBuilder::new(&d);
        b.raw_entry("count", &json!(3));
        b.raw_entry("ratio", &json!(1.5));
        b.raw_entry("enabled", &json!(true));
        b.raw_entry("nothing", &json!(null));
        b.raw_entry("label", &json!("plain value"));
        let out = b.build();
        assert!(out.contains("count: 3"));
        assert!(out.contains("ratio: 1.5"));
        assert!(out.contains("enabled: true"));
        assert!(out.contains("nothing: null"));
        assert!(out.contains("label: plain value"));
    }

    #[test]
    fn raw_entry_quotes_ambiguous_strings() {
        let d = kebab();
        let mut b = FrontmatterBuilder::new(&d);
        b.raw_entry("looks_bool", &json!("true"));
        b.raw_entry("looks_num", &json!("42"));
        b.raw_entry("has_colon", &json!("key: value"));
        b.raw_entry("multiline", &json!("a\nb"));
        b.raw_entry("empty", &json!(""));
        let out = b.build();
        assert!(out.contains("looks_bool: \"true\""));
        assert!(out.contains("looks_num: \"42\""));
        assert!(out.contains("has_colon: \"key: value\""));
        assert!(out.contains("multiline: \"a\\nb\""));
        assert!(out.contains("empty: \"\""));
    }

    #[test]
    fn raw_entry_name_is_verbatim_not_dialected() {
        let d = kebab();
        let mut b = FrontmatterBuilder::new(&d);
        b.raw_entry("snake_key", &json!("v"));
        let out = b.build();
        assert!(out.contains("snake_key: v"));
        assert!(!out.contains("snake-key"));
    }

    #[test]
    fn raw_entry_nested_collections() {
        let d = kebab();
        let mut b = FrontmatterBuilder::new(&d);
        b.raw_entry("meta", &json!({"zeta": [1, 2], "alpha": {"inner": "x"}}));
        b.raw_entry("list", &json!(["a", {"k": "v"}]));
        b.raw_entry("empty_list", &json!([]));
        b.raw_entry("empty_map", &json!({}));
        let out = b.build();
        let expected = "\
meta:
  alpha:
    inner: x
  zeta:
    - 1
    - 2
list:
  - a
  -
    k: v
empty_list: []
empty_map: {}
";
        assert_eq!(out, format!("---\n{expected}---\n"));
    }

    #[test]
    fn raw_entry_skips_names_already_emitted() {
        let d = kebab();
        let mut b = FrontmatterBuilder::new(&d);
        b.scalar("model", "opus");
        b.raw_entry("model", &json!("haiku"));
        b.raw_entry("model", &json!("sonnet"));
        let out = b.build();
        assert_eq!(out.matches("model:").count(), 1);
        assert!(out.contains("model: opus"));
    }

    #[test]
    fn raw_entry_duplicate_guard_uses_rendered_name() {
        let d = kebab();
        let mut b = FrontmatterBuilder::new(&d);
        b.list("allowed_tools", &["Read".into()]);
        b.raw_entry("allowed-tools", &json!("clobber"));
        let out = b.build();
        assert_eq!(out.matches("allowed-tools:").count(), 1);
        assert!(!out.contains("clobber"));
    }

    #[test]
    fn appended_override_keys_are_sorted_not_insertion_ordered() {
        // This test only discriminates with `serde_json/preserve_order` on,
        // which is what the dev-dependency in `Cargo.toml` is for: with the
        // feature off `Map` is a sorted `BTreeMap` and the assertion holds
        // whether or not `apply_overrides` sorts. With it on, iterating the
        // map raw appends in the order the author wrote the block. Nested
        // object keys are sorted; the top level matches.
        let d = kebab();
        let mut b = FrontmatterBuilder::new(&d);
        b.scalar("name", "review");
        let redundant = b.apply_overrides(&map(json!({
            "zeta": "z",
            "alpha": "a",
            "mid": "m",
        })));
        let out = b.build();
        assert!(redundant.is_empty(), "{redundant:?}");
        let (z, a, m) = (
            out.find("zeta:").unwrap(),
            out.find("alpha:").unwrap(),
            out.find("mid:").unwrap(),
        );
        assert!(a < m && m < z, "appended keys are not sorted: {out}");
    }

    #[test]
    fn an_override_replaces_a_modelled_field_in_place() {
        let d = kebab();
        let mut b = FrontmatterBuilder::new(&d);
        b.scalar("name", "review");
        b.scalar("model", "opus");
        b.scalar("description", "d");
        let redundant = b.apply_overrides(&map(json!({"model": "haiku"})));
        let out = b.build();
        assert!(redundant.is_empty(), "{redundant:?}");
        assert!(out.contains("model: haiku"), "{out}");
        assert!(!out.contains("opus"), "{out}");
        // In place: the block still reads name, model, description.
        assert!(
            out.find("model:").unwrap() < out.find("description:").unwrap(),
            "{out}"
        );
    }

    #[test]
    fn an_override_of_a_key_nothing_modelled_is_appended() {
        let d = kebab();
        let mut b = FrontmatterBuilder::new(&d);
        b.scalar("name", "review");
        let redundant = b.apply_overrides(&map(json!({"permissionMode": "plan"})));
        assert!(redundant.is_empty());
        let out = b.build();
        assert!(out.contains("permissionMode: plan"), "{out}");
        assert!(
            out.find("name:").unwrap() < out.find("permissionMode:").unwrap(),
            "{out}"
        );
    }

    #[test]
    fn an_override_equal_to_the_rendered_field_is_reported_not_rewritten() {
        let d = kebab();
        let mut b = FrontmatterBuilder::new(&d);
        b.list("allowed_tools", &["Read".into(), "Grep".into()]);
        let before = {
            let mut peek = FrontmatterBuilder::new(&d);
            peek.list("allowed_tools", &["Read".into(), "Grep".into()]);
            peek.build()
        };
        let redundant = b.apply_overrides(&map(json!({"allowed-tools": ["Read", "Grep"]})));
        assert_eq!(redundant, vec!["allowed-tools".to_string()]);
        // Reported, and the bytes are untouched.
        assert_eq!(b.build(), before);
    }

    #[test]
    fn an_override_outranks_omit_fields() {
        // The dialect declines `argument_hint` wholesale; the author named
        // this destination and this key, which is the more explicit answer.
        let d = FrontmatterDialect {
            field_naming: FieldNaming::Kebab,
            omit_fields: &["argument_hint"],
            emit_user_invocable_default: false,
        };
        let mut b = FrontmatterBuilder::new(&d);
        b.scalar_quoted("argument_hint", "x");
        b.apply_overrides(&map(json!({"argument-hint": "<path>"})));
        let out = b.build();
        // Quoted, because `<path>` would not re-parse as a plain scalar —
        // the same rule `raw_entry` applies to every value it writes.
        assert!(out.contains("argument-hint: \"<path>\""), "{out}");
    }

    #[test]
    fn an_override_is_not_dialect_renamed() {
        // The key is the harness's own spelling, emitted verbatim — the same
        // rule `raw_entry` follows.
        let d = kebab();
        let mut b = FrontmatterBuilder::new(&d);
        b.apply_overrides(&map(json!({"permission_mode": "plan"})));
        let out = b.build();
        assert!(out.contains("permission_mode: plan"), "{out}");
        assert!(!out.contains("permission-mode"), "{out}");
    }

    #[test]
    fn insertion_order_preserved() {
        let d = kebab();
        let mut b = FrontmatterBuilder::new(&d);
        b.scalar("name", "z");
        b.scalar("description", "d");
        b.list("allowed_tools", &["Read".into()]);
        let out = b.build();
        let name_pos = out.find("name:").unwrap();
        let desc_pos = out.find("description:").unwrap();
        let tools_pos = out.find("allowed-tools:").unwrap();
        assert!(name_pos < desc_pos);
        assert!(desc_pos < tools_pos);
    }
}
