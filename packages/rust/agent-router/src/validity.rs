//! Validity (mirror of `validity.ts`): every candidate reference is checked
//! against the catalogue before availability. Decision D-06 says which
//! failures are errors, skips or warnings. Pure: machine state is an
//! availability reason, never a result here.

use serde::{Deserialize, Serialize};

use crate::catalogue::{CatalogueQuery, Model, ModelStatus, Sourced};
use crate::effort::adjust_effort;
use crate::reference::{Ref, Tier, format_ref, is_effort_level, unknown_effort_message};

/// Impossible everywhere: the profile holding the reference is invalid.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ValidityErrorCode {
    /// The tool is not a known tool.
    UnknownTool,
    /// The tool has no model for the tier.
    NoTierEntry,
    /// The tool does not serve the model's provider.
    ProviderNotServed,
    /// The tool serves the model's provider but does not offer the model.
    ModelNotOffered,
    /// The effort is more than one step from any level the tool and model accept.
    UnsupportedEffort,
    /// An effort that is not one of `EFFORT_LEVELS` (`parse_ref` refuses it too).
    UnknownEffort,
    /// Only with `strict`: a model the catalogue does not know.
    UnknownModel,
}

/// The reference stays, and the person should know.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ValidityWarningCode {
    /// A model the catalogue does not know.
    UnknownModel,
    /// A deprecated model, which still runs.
    DeprecatedModel,
}

/// Impossible here and now: the entry is skipped and traced, and the walk continues.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ValiditySkipCode {
    /// A withdrawn model.
    WithdrawnModel,
}

/// The outcome of checking a reference against the catalogue: `Ok`, a
/// `Warning` to surface, a `Skip` that passes the entry over, or an `Error`
/// that makes the reference invalid everywhere.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Validity {
    /// The reference passes.
    Ok,
    /// The reference stays, with a warning to surface.
    Warning {
        /// What the warning is about.
        code: ValidityWarningCode,
        /// A human-readable explanation.
        message: String,
    },
    /// The entry is passed over here and now.
    Skip {
        /// Why the entry is passed over.
        code: ValiditySkipCode,
        /// A human-readable explanation.
        message: String,
    },
    /// The reference is invalid everywhere.
    Error {
        /// What failed.
        code: ValidityErrorCode,
        /// A human-readable explanation, naming the hint when there is one.
        message: String,
        /// The nearest valid reference, when the catalogue knows one (`claude/sonnet` for `codex/sonnet`).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        hint: Option<String>,
        /// For `unsupported-effort`: the levels the tool and model accept.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        efforts: Option<Vec<String>>,
    },
}

/// Options for [`check_ref`]: `strict` makes an unknown model an error, and
/// `known_tools` closes the set of tool ids.
#[derive(Debug, Clone, Copy, Default, Serialize)]
pub struct CheckContext<'a> {
    /// `router.strict`: an unknown model is an error, not a warning. A
    /// deprecated one stays a warning.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub strict: Option<bool>,
    /// A closed set of tool ids; any other tool is `unknown-tool`, and hints name only these.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        rename = "knownTools"
    )]
    pub known_tools: Option<&'a [String]>,
}

fn list(xs: &[String]) -> String {
    if xs.is_empty() {
        "(none)".to_string()
    } else {
        xs.join(", ")
    }
}

fn error(
    code: ValidityErrorCode,
    message: String,
    hint: Option<String>,
    efforts: Option<Vec<String>>,
) -> Validity {
    let message = match &hint {
        Some(h) => format!("{message}; nearest valid: {h}"),
        None => message,
    };
    Validity::Error {
        code,
        message,
        hint,
        efforts,
    }
}

/// The model `name` means anywhere in the catalogue: a key, an id, a model
/// alias, or any tool's alias.
fn lookup_model<'a>(catalogue: &'a CatalogueQuery, name: &str) -> Option<&'a Sourced<Model>> {
    let models = &catalogue.catalogue().models;
    if let Some(m) = models.get(name) {
        return Some(m);
    }
    models
        .values()
        .find(|m| m.id == name)
        .or_else(|| {
            models.values().find(|m| {
                m.aliases
                    .as_ref()
                    .is_some_and(|a| a.iter().any(|x| x == name))
            })
        })
        .or_else(|| {
            catalogue
                .tools()
                .into_iter()
                .find_map(|t| t.aliases.as_ref()?.get(name).and_then(|k| models.get(k)))
        })
}

fn serves_provider(catalogue: &CatalogueQuery, tool: &str, provider: &str) -> bool {
    catalogue
        .tool(tool)
        .is_some_and(|t| t.serves.iter().any(|s| s.provider() == provider))
}

/// True when `effort` is in `efforts` or one step from a level in it.
fn accepts(efforts: &[String], effort: &str) -> bool {
    adjust_effort(effort, efforts).is_some()
}

/// The first tool (in `known_tools` order, else catalogue order) that offers
/// `name`, as a reference.
fn nearest(
    catalogue: &CatalogueQuery,
    name: &str,
    effort: Option<&str>,
    ctx: &CheckContext<'_>,
) -> Option<String> {
    let tools: Vec<String> = match &ctx.known_tools {
        Some(t) => t.to_vec(),
        None => catalogue
            .known_tools()
            .into_iter()
            .map(str::to_string)
            .collect(),
    };
    for tool in tools {
        if catalogue.find_model(&tool, name).is_none() {
            continue;
        }
        let efforts = catalogue.efforts_for(&tool, Some(name));
        let keep = match (effort, &efforts) {
            (Some(e), Some(list)) => accepts(list, e),
            _ => false,
        };
        return Some(format_ref(&Ref {
            tool,
            model: Some(name.to_string()),
            qualifiers: None,
            effort: if keep {
                effort.map(str::to_string)
            } else {
                None
            },
        }));
    }
    None
}

fn effort_error(tool: &str, model: Option<&str>, effort: &str, efforts: Vec<String>) -> Validity {
    let on = format!(
        "{} on '{tool}'",
        model.map_or(String::new(), |m| format!(" for model '{m}'"))
    );
    let message = if efforts.is_empty() {
        format!("effort '{effort}' is not supported{on}; it takes no effort")
    } else {
        format!(
            "effort '{effort}' is not supported{on}; supported: {}",
            efforts.join(", ")
        )
    };
    error(
        ValidityErrorCode::UnsupportedEffort,
        message,
        None,
        Some(efforts),
    )
}

/// Check one reference against the catalogue. The result has one of four kinds:
///
/// - `ok`.
/// - `warning`: the model is unknown to the catalogue, or deprecated. The entry stays.
/// - `skip`: the model is withdrawn. A walk passes over it.
/// - `error`: the reference cannot work anywhere: an unknown tool, a tier the
///   tool has no model for, a tool that does not serve the model's provider, a
///   known model the tool does not offer, an unknown model under `strict`, an
///   effort the tool and model do not accept, or an effort not on
///   `EFFORT_LEVELS` at all (`unknown-effort`).
///
/// An effort one step from an accepted level passes; the resolve moves it
/// (`adjust_effort`). For a model the catalogue does not know, effort is
/// checked against the tool's own levels only, and passes when the tool
/// declares none.
pub fn check_ref(r: &Ref, catalogue: &CatalogueQuery, ctx: &CheckContext<'_>) -> Validity {
    let tool = r.tool.as_str();
    let effort = r.effort.as_deref();
    let known: Vec<String> = match &ctx.known_tools {
        Some(t) => t.to_vec(),
        None => catalogue
            .known_tools()
            .into_iter()
            .map(str::to_string)
            .collect(),
    };
    if !known.iter().any(|k| k == tool) || catalogue.tool(tool).is_none() {
        return error(
            ValidityErrorCode::UnknownTool,
            format!("unknown tool '{tool}'; known: {}", list(&known)),
            None,
            None,
        );
    }
    if let Some(e) = effort.filter(|e| !is_effort_level(e)) {
        return error(
            ValidityErrorCode::UnknownEffort,
            unknown_effort_message(e),
            None,
            None,
        );
    }

    let mut name = r.model.clone();
    if let Some(tier) = name.as_deref().and_then(Tier::parse) {
        let Some(mapped) = catalogue.tier_model(tool, tier) else {
            return error(
                ValidityErrorCode::NoTierEntry,
                format!("tool '{tool}' has no model for tier '{}'", tier.as_str()),
                None,
                None,
            );
        };
        name = Some(mapped);
    }

    let Some(name) = name else {
        if let (Some(e), Some(efforts)) = (effort, catalogue.efforts_for(tool, None))
            && !accepts(&efforts, e)
        {
            return effort_error(tool, None, e, efforts);
        }
        return Validity::Ok;
    };
    let name = name.as_str();

    let Some(found) = catalogue.find_model(tool, name) else {
        if let Some(elsewhere) = lookup_model(catalogue, name) {
            if !serves_provider(catalogue, tool, &elsewhere.provider) {
                return error(
                    ValidityErrorCode::ProviderNotServed,
                    format!(
                        "'{tool}' does not serve {}, the provider of '{name}'",
                        elsewhere.provider
                    ),
                    nearest(catalogue, name, effort, ctx),
                    None,
                );
            }
            return error(
                ValidityErrorCode::ModelNotOffered,
                format!("'{tool}' does not offer {}", elsewhere.key),
                nearest(catalogue, name, effort, ctx),
                None,
            );
        }
        let provider = name.find('/').filter(|&s| s > 0).map(|s| &name[..s]);
        if let Some(provider) = provider
            && catalogue.catalogue().providers.contains_key(provider)
            && !serves_provider(catalogue, tool, provider)
        {
            return error(
                ValidityErrorCode::ProviderNotServed,
                format!("'{tool}' does not serve {provider}"),
                None,
                None,
            );
        }
        if let (Some(e), Some(efforts)) = (effort, catalogue.efforts_for(tool, None))
            && !accepts(&efforts, e)
        {
            return effort_error(tool, Some(name), e, efforts);
        }
        return if ctx.strict == Some(true) {
            error(
                ValidityErrorCode::UnknownModel,
                format!(
                    "model '{name}' is not in the model catalogue for '{tool}', and router.strict refuses unknown models"
                ),
                None,
                None,
            )
        } else {
            Validity::Warning {
                code: ValidityWarningCode::UnknownModel,
                message: format!(
                    "model '{name}' is not in the model catalogue for '{tool}'; it is passed as written"
                ),
            }
        };
    };

    if let Some(e) = effort
        && let Some(efforts) = catalogue.efforts_for(tool, Some(name))
        && !accepts(&efforts, e)
    {
        return effort_error(tool, Some(name), e, efforts);
    }
    let model = found.model;
    match model.status {
        ModelStatus::Withdrawn => Validity::Skip {
            code: ValiditySkipCode::WithdrawnModel,
            message: format!("model '{name}' ({}) is withdrawn", model.key),
        },
        ModelStatus::Deprecated => Validity::Warning {
            code: ValidityWarningCode::DeprecatedModel,
            message: format!(
                "model '{name}' ({}) is deprecated{}",
                model.key,
                model
                    .deprecated_on
                    .as_ref()
                    .map_or(String::new(), |d| format!(" since {d}"))
            ),
        },
        ModelStatus::Current => Validity::Ok,
    }
}
