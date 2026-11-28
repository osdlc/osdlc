//! The `--json` documents: a versioned envelope around a command's payload, and
//! the error document a failed command prints on stdout instead.
//!
//! Field names are camelCase and the envelope's keys come first, so a document
//! reads `{ "schemaVersion": 1, "kind": "...", ...payload }`. The wire format
//! is the one `@osdlc/cli-tool` writes.

use serde::de::IgnoredAny;
use serde::{Deserialize, Serialize};

use crate::safe::safe;

/// The `schemaVersion` of every document this crate writes by itself (the
/// error document), and the default for a payload.
pub const SCHEMA_VERSION: u32 = 1;

/// A command's payload wrapped with its `schemaVersion` and `kind`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Envelope<'a, T: Serialize + ?Sized> {
    schema_version: u32,
    kind: &'a str,
    #[serde(flatten)]
    payload: &'a T,
}

/// The envelope's keys, read back from a finished document: a key written
/// twice fails with `duplicate field`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
#[expect(dead_code, reason = "read only to find a key written twice")]
struct EnvelopeKeys {
    schema_version: IgnoredAny,
    kind: IgnoredAny,
}

/// The pretty-printed (two-space) document for `payload`, without a trailing
/// newline.
///
/// # Errors
/// Fails when the payload is not a struct or map, or has a field named
/// `schemaVersion` or `kind`; that error names the `kind` argument and field.
pub fn envelope_json<T: Serialize + ?Sized>(
    schema_version: u32,
    kind: &str,
    payload: &T,
) -> serde_json::Result<String> {
    let json = serde_json::to_string_pretty(&Envelope {
        schema_version,
        kind,
        payload,
    })?;
    // serde writes a flattened field without comparing names, and a reader of
    // a duplicate key usually keeps the payload's silently. Reading the
    // finished text checks the document that would be printed.
    match serde_json::from_str::<EnvelopeKeys>(&json) {
        Ok(_) => Ok(json),
        // The one data error this read can meet is a key written twice.
        Err(error) if error.is_data() => Err(serde::ser::Error::custom(format!(
            "the payload of the `{kind}` report has a field the document's envelope sets: {error}"
        ))),
        Err(error) => Err(error),
    }
}

/// A failed run as JSON.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ErrorDocument {
    /// Always [`SCHEMA_VERSION`].
    pub schema_version: u32,
    /// Always `"error"`.
    pub kind: String,
    /// A stable name a script can branch on: `usage` for a command line that
    /// cannot run as typed, a failure's kind (such as `not-installed`), the
    /// code a command error was given, or else `error`.
    pub code: String,
    /// What went wrong, with terminal controls removed.
    pub message: String,
    /// The exit code the run returns.
    pub exit: i32,
    /// What to do next. Left out when empty.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>,
}

impl ErrorDocument {
    /// A blank hint is left out. The message and hint lose terminal controls:
    /// they often quote repository files, and JSON escaping keeps C1 controls.
    pub fn new(code: &str, message: &str, exit: i32, hint: Option<&str>) -> Self {
        let hint = hint
            .map(|h| safe(h).trim().to_owned())
            .filter(|h| !h.is_empty());
        Self {
            schema_version: SCHEMA_VERSION,
            kind: "error".to_owned(),
            code: code.to_owned(),
            message: safe(message),
            exit,
            hint,
        }
    }

    /// The pretty-printed (two-space) document, without a trailing newline.
    pub fn to_json(&self) -> String {
        // A struct of strings and integers always serializes.
        serde_json::to_string_pretty(self).unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Serialize)]
    struct Payload {
        greeting: String,
    }

    #[test]
    fn envelope_puts_version_and_kind_before_the_payload() {
        let json = envelope_json(
            1,
            "greet",
            &Payload {
                greeting: "hi".into(),
            },
        )
        .unwrap();
        assert_eq!(
            json,
            "{\n  \"schemaVersion\": 1,\n  \"kind\": \"greet\",\n  \"greeting\": \"hi\"\n}"
        );
    }

    #[derive(Serialize)]
    struct Check {
        name: String,
        kind: String,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Versioned {
        schema_version: u32,
    }

    #[test]
    fn envelope_rejects_a_payload_field_named_like_one_of_its_own() {
        let check = Check {
            name: "lint".into(),
            kind: "command".into(),
        };
        let error = envelope_json(1, "check", &check).unwrap_err().to_string();
        assert!(error.contains("`check`"), "{error}");
        assert!(error.contains("`kind`"), "{error}");

        let error = envelope_json(1, "stats", &Versioned { schema_version: 2 })
            .unwrap_err()
            .to_string();
        assert!(error.contains("`stats`"), "{error}");
        assert!(error.contains("`schemaVersion`"), "{error}");
    }

    #[test]
    fn envelope_rejects_a_payload_that_is_not_an_object() {
        assert!(envelope_json(1, "x", &3_u32).is_err());
    }

    #[test]
    fn error_document_shape() {
        let doc = ErrorDocument::new("not-installed", "gh is missing.", 22, Some("Install it.\n"));
        assert_eq!(
            doc.to_json(),
            "{\n  \"schemaVersion\": 1,\n  \"kind\": \"error\",\n  \"code\": \"not-installed\",\n  \"message\": \"gh is missing.\",\n  \"exit\": 22,\n  \"hint\": \"Install it.\"\n}"
        );
    }

    #[test]
    fn a_blank_or_absent_hint_is_left_out() {
        for hint in [None, Some(""), Some("  \n")] {
            let doc = ErrorDocument::new("error", "boom", 1, hint);
            assert!(!doc.to_json().contains("hint"));
        }
    }

    #[test]
    fn message_and_hint_have_controls_removed() {
        let doc = ErrorDocument::new("e", "a\u{9b}2Jb", 1, Some("c\u{1b}[1md"));
        assert_eq!(doc.message, "ab");
        assert_eq!(doc.hint.as_deref(), Some("cd"));
    }
}
