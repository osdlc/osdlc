//! Profiles (mirror of `profile.ts`): an ordered list of references, as a bare
//! list or the long form `{ order, host?, context? }`, and the built-in
//! profiles that exist without config.

use indexmap::IndexMap;
use serde::Serialize;
use serde_json::Value;

use crate::context::{MAX_SIZE, SizeProblem, read_size};
use crate::reference::{Ref, RefParseError, parse_ref};

/// The profiles that exist without config: `default`, the `standard` category
/// chain across every tool, and `small`, the `fast` one. A project's `profiles:`
/// entry of the same name replaces one whole.
pub const BUILTIN_PROFILES: &[(&str, &[&str])] =
    &[("default", &["*/standard"]), ("small", &["*/fast"])];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Profile {
    pub order: Vec<Ref>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub host: Option<String>,
    /// `context:` in tokens: an entry whose model cannot reach it is skipped.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum ProfileError {
    /// The wrong shape. The message is this crate's own, not zod's.
    InvalidShape {
        message: String,
    },
    InvalidRef {
        index: usize,
        error: RefParseError,
        message: String,
    },
    InvalidContext {
        message: String,
    },
}

impl ProfileError {
    /// The error's message.
    pub fn message(&self) -> &str {
        match self {
            ProfileError::InvalidShape { message }
            | ProfileError::InvalidRef { message, .. }
            | ProfileError::InvalidContext { message } => message,
        }
    }

    fn message_mut(&mut self) -> &mut String {
        match self {
            ProfileError::InvalidShape { message }
            | ProfileError::InvalidRef { message, .. }
            | ProfileError::InvalidContext { message } => message,
        }
    }
}

/// A profile's config after its shape is checked, before its references parse.
struct Shaped {
    order: Vec<String>,
    host: Option<String>,
    context: Option<String>,
}

fn strings(v: &Value, what: &str) -> Result<Vec<String>, String> {
    let list = v
        .as_array()
        .ok_or_else(|| format!("{what}: expected an array"))?;
    if list.is_empty() {
        return Err(format!("{what}: expected at least 1 entry"));
    }
    list.iter()
        .map(|e| {
            e.as_str()
                .map(str::to_string)
                .ok_or_else(|| format!("{what}: expected a string"))
        })
        .collect()
}

fn optional_string(
    map: &serde_json::Map<String, Value>,
    key: &str,
) -> Result<Option<String>, String> {
    match map.get(key) {
        None => Ok(None),
        Some(Value::String(s)) => Ok(Some(s.clone())),
        Some(_) => Err(format!("{key}: expected a string")),
    }
}

/// A bare list of references, or the long form with exactly the keys `order`, `host`, `context`.
fn shape(input: &Value) -> Result<Shaped, String> {
    match input {
        Value::Array(_) => Ok(Shaped {
            order: strings(input, "order")?,
            host: None,
            context: None,
        }),
        Value::Object(map) => {
            if let Some(extra) = map
                .keys()
                .find(|k| !matches!(k.as_str(), "order" | "host" | "context"))
            {
                return Err(format!("Unrecognized key: \"{extra}\""));
            }
            let order = map.get("order").ok_or("order: required")?;
            Ok(Shaped {
                order: strings(order, "order")?,
                host: optional_string(map, "host")?,
                context: optional_string(map, "context")?,
            })
        }
        _ => Err("expected a list of references or an object with `order`".to_string()),
    }
}

fn normalize(config: Shaped) -> Result<Profile, ProfileError> {
    let mut order = Vec::with_capacity(config.order.len());
    for (index, text) in config.order.iter().enumerate() {
        match parse_ref(text) {
            Ok(r) => order.push(r),
            Err(error) => {
                return Err(ProfileError::InvalidRef {
                    index,
                    message: format!("order[{index}]: {}", error.message),
                    error,
                });
            }
        }
    }
    let context = match &config.context {
        None => None,
        Some(text) => match read_size(text) {
            Ok(n) => Some(n),
            Err(problem) => {
                return Err(ProfileError::InvalidContext {
                    message: match problem {
                        SizeProblem::TooLarge => format!(
                            "context: '{text}' is above the largest size, {MAX_SIZE} tokens"
                        ),
                        SizeProblem::Malformed => {
                            format!("context: must be digits plus k or m (1m, 200k); got '{text}'")
                        }
                    },
                });
            }
        },
    };
    Ok(Profile {
        order,
        host: config.host,
        context,
    })
}

/// Parse one profile config (a JSON value) into a [`Profile`].
pub fn parse_profile(input: &Value) -> Result<Profile, ProfileError> {
    let shaped = shape(input).map_err(|message| ProfileError::InvalidShape { message })?;
    normalize(shaped)
}

/// Parse a `profiles:` section over [`BUILTIN_PROFILES`]: the result holds the
/// built-in profiles a section does not redefine, and every profile it defines.
/// Every shape is checked before any reference parses, as the TypeScript does.
pub fn parse_profiles(input: &Value) -> Result<IndexMap<String, Profile>, ProfileError> {
    let Value::Object(section) = input else {
        return Err(ProfileError::InvalidShape {
            message: "expected an object of profiles".to_string(),
        });
    };
    let mut shaped: IndexMap<String, Shaped> = BUILTIN_PROFILES
        .iter()
        .map(|(name, order)| {
            (
                (*name).to_string(),
                Shaped {
                    order: order.iter().map(|s| (*s).to_string()).collect(),
                    host: None,
                    context: None,
                },
            )
        })
        .collect();
    // JSON's `__proto__` is an own key here; the TypeScript refuses it rather than lose it.
    if section.contains_key("__proto__") {
        return Err(ProfileError::InvalidShape {
            message: "__proto__: '__proto__' cannot be a key".to_string(),
        });
    }
    for (name, config) in section {
        let s = shape(config).map_err(|message| ProfileError::InvalidShape {
            message: format!("{name}: {message}"),
        })?;
        // Replacing a built-in keeps its position, as a JavaScript object spread does.
        shaped.insert(name.clone(), s);
    }
    let mut out = IndexMap::new();
    for (name, config) in shaped {
        let profile = normalize(config).map_err(|mut e| {
            let m = e.message_mut();
            *m = format!("profile '{name}': {m}");
            e
        })?;
        out.insert(name, profile);
    }
    Ok(out)
}
