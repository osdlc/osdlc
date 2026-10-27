//! Render a [`Script`] into its on-disk form: shebang (if applicable)
//! followed by the script body.
//!
//! The shebang is picked from [`crate::ScriptLanguage::shebang`]. Runtimes that
//! don't care about shebangs (or that embed scripts in another format)
//! use [`Script::body`] directly instead.

use crate::Script;

/// Render `script` as the complete file contents (shebang + body + trailing
/// newline).
///
/// For [`crate::ScriptLanguage::Other`], no shebang is emitted — the caller is
/// expected to supply its own if needed.
pub fn render_script_body(script: &Script) -> String {
    let mut out = String::new();
    if let Some(shebang) = script.language.shebang() {
        out.push_str(shebang);
        out.push('\n');
    }
    out.push_str(&script.body);
    if !out.ends_with('\n') {
        out.push('\n');
    }
    out
}

/// Convenience: concatenate the script's slug with the language extension.
///
/// Runtime impls use this to build the filename for scripts in their
/// `scripts/` directory.
pub fn script_filename(script: &Script) -> String {
    format!("{}.{}", script.slug, script.language.extension())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ScriptLanguage;

    fn sample(language: ScriptLanguage) -> Script {
        Script {
            name: "Lint".into(),
            slug: "lint".into(),
            description: None,
            language,
            body: "echo hi".into(),
            timeout_ms: 0,
            tags: vec![],
            category: None,
            is_template: false,
        }
    }

    #[test]
    fn bash_shebang_and_extension() {
        let s = sample(ScriptLanguage::Bash);
        assert!(render_script_body(&s).starts_with("#!/usr/bin/env bash\n"));
        assert_eq!(script_filename(&s), "lint.sh");
    }

    #[test]
    fn python_shebang_and_extension() {
        let s = sample(ScriptLanguage::Python);
        assert!(render_script_body(&s).starts_with("#!/usr/bin/env python3\n"));
        assert_eq!(script_filename(&s), "lint.py");
    }

    #[test]
    fn node_shebang_and_extension() {
        let s = sample(ScriptLanguage::Node);
        assert!(render_script_body(&s).starts_with("#!/usr/bin/env node\n"));
        assert_eq!(script_filename(&s), "lint.js");
    }

    #[test]
    fn other_language_no_shebang() {
        let s = sample(ScriptLanguage::Other("rb".into()));
        assert!(!render_script_body(&s).starts_with("#!"));
        assert_eq!(script_filename(&s), "lint.rb");
    }

    #[test]
    fn trailing_newline_added() {
        let mut s = sample(ScriptLanguage::Bash);
        s.body = "echo hi".into();
        assert!(render_script_body(&s).ends_with('\n'));
    }
}
