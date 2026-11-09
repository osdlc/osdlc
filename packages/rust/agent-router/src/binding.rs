//! A task or step binding (mirror of `binding.ts`): exactly one of a profile
//! or a single reference (`tool`). `profile` names an entry of the profiles, or
//! is an inline list of references walked as an unnamed profile. A `tool`
//! reference walks as a one-entry profile, so a wildcard expands through the
//! chain order.

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

use crate::choose::{Choice, ChooseContext, choose_from_profile, ref_profile};
use crate::profile::{Profile, ProfileError, parse_profile};
use crate::reference::{RefParseError, parse_ref};

/// A task or step binding: exactly one of a profile or a single reference (`tool`).
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Binding {
    /// A profile name, or an inline list of references walked as an unnamed profile.
    #[serde(default, deserialize_with = "present_profile")]
    pub profile: Option<BindingProfile>,
    /// A single reference, walked as a one-entry profile.
    #[serde(default, deserialize_with = "present_tool")]
    pub tool: Option<BindingTool>,
}

/// A binding's `tool`: a reference, or any other value (a number, a list,
/// `null`), kept so it fails as `binding-invalid`, as in TypeScript, not at
/// deserialize.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(untagged)]
pub enum BindingTool {
    /// A reference string.
    Text(String),
    /// Any other value, refused as `binding-invalid`.
    Other(serde_json::Value),
}

/// Reads a present `tool` key as `Some`, `null` included.
fn present_tool<'de, D>(d: D) -> Result<Option<BindingTool>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    BindingTool::deserialize(d).map(Some)
}

/// A binding's `profile`: a profile name, or an inline list of references.
/// The list holds raw values so a non-string entry reaches `parse_profile` and
/// fails as `invalid-profile`, as in TypeScript, not at deserialize. Any other
/// value (an object, `null`) is kept as `Other` and fails the same way.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(untagged)]
pub enum BindingProfile {
    /// The name of an entry of the profiles.
    Name(String),
    /// An inline list of references, walked as an unnamed profile.
    Inline(Vec<serde_json::Value>),
    /// Any other value, refused as `invalid-profile`.
    Other(serde_json::Value),
}

/// Reads a present `profile` key as `Some`, `null` included, so `profile: null`
/// is a value to refuse and not an unset key.
fn present_profile<'de, D>(d: D) -> Result<Option<BindingProfile>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    BindingProfile::deserialize(d).map(Some)
}

/// Why a binding could not be walked.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum BindingError {
    /// The binding sets both or neither of `profile` and `tool`, or its `tool` is not a string.
    BindingInvalid {
        /// A human-readable explanation.
        message: String,
    },
    /// The binding names a profile that is not defined.
    UnknownProfile {
        /// The profile name the binding gave.
        name: String,
        /// The defined profile names, sorted.
        known: Vec<String>,
        /// A human-readable explanation.
        message: String,
    },
    /// The binding's inline profile does not parse.
    InvalidProfile {
        /// Why the profile did not parse.
        error: ProfileError,
        /// A human-readable explanation.
        message: String,
    },
    /// The binding's `tool` reference does not parse.
    InvalidRef {
        /// Why the reference did not parse.
        error: RefParseError,
        /// A human-readable explanation.
        message: String,
    },
}

/// Walk a [`Binding`]: a named profile from `profiles`, an inline list of
/// references (an unnamed profile), or a single `tool` reference (a one-entry
/// profile). Returns a [`BindingError`] when the binding sets both or neither,
/// names an unknown profile, or holds a reference or profile that does not
/// parse; otherwise the [`Choice`] of [`choose_from_profile`].
pub fn resolve_binding(
    binding: &Binding,
    profiles: &IndexMap<String, Profile>,
    ctx: &ChooseContext,
) -> Result<Choice, BindingError> {
    match (&binding.profile, &binding.tool) {
        (Some(_), Some(_)) => Err(BindingError::BindingInvalid {
            message: "binding sets both 'profile' and 'tool'; set exactly one".to_string(),
        }),
        (None, None) => Err(BindingError::BindingInvalid {
            message: "binding sets neither 'profile' nor 'tool'; set exactly one".to_string(),
        }),
        (Some(BindingProfile::Inline(list)), None) => {
            let input = serde_json::Value::Array(list.clone());
            match parse_profile(&input) {
                Ok(profile) => Ok(choose_from_profile(&profile, ctx)),
                Err(error) => Err(BindingError::InvalidProfile {
                    message: format!("binding profile: {}", error.message()),
                    error,
                }),
            }
        }
        (Some(BindingProfile::Other(_)), None) => {
            let message = "expected a profile name or a list of references".to_string();
            Err(BindingError::InvalidProfile {
                message: format!("binding profile: {message}"),
                error: ProfileError::InvalidShape { message },
            })
        }
        (Some(BindingProfile::Name(name)), None) => match profiles.get(name) {
            Some(profile) => Ok(choose_from_profile(profile, ctx)),
            None => {
                let mut known: Vec<String> = profiles.keys().cloned().collect();
                known.sort();
                Err(BindingError::UnknownProfile {
                    name: name.clone(),
                    message: format!(
                        "unknown profile '{name}'; known: {}",
                        if known.is_empty() {
                            "(none)".to_string()
                        } else {
                            known.join(", ")
                        }
                    ),
                    known,
                })
            }
        },
        (None, Some(BindingTool::Other(_))) => Err(BindingError::BindingInvalid {
            message: "binding tool: expected a reference string".to_string(),
        }),
        (None, Some(BindingTool::Text(tool))) => match parse_ref(tool) {
            Ok(r) => Ok(choose_from_profile(&ref_profile(r), ctx)),
            Err(error) => Err(BindingError::InvalidRef {
                message: format!("binding tool: {}", error.message),
                error,
            }),
        },
    }
}
