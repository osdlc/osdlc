//! The strict layer schemas (mirror of `catalogue/schema.ts`): the shipped
//! snapshot's shape and `MachineCatalogueSchema`.
//!
//! The zod schemas are `.strict()` at every level; these types are
//! `deny_unknown_fields` and each has a `validate` for what the type system
//! cannot say (patterns, ranges, dates, the headless slot rules). The fixture
//! vectors in `packages/ts/agent-router/fixtures/catalogue/schema-*.json` hold
//! accept and reject cases for both. Not mirrored: `RouterConfigSchema`, which
//! belongs to the `config` subpath; see the [crate] docs.

use std::sync::LazyLock;

use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::types::{
    CatalogueLayer, ContextSizes, Cost, CuratedOffer, HeadlessTemplate, LayerRow, ModelStatus,
    OfferingRow, Openness, PromptVia, ProviderKind, ServesEntry, Table, Takes, ToolMode,
};
use crate::reference::{
    Trait, is_effort_level, is_js_whitespace, is_tool_id, unknown_effort_message,
};

/// Why a snapshot or machine catalogue document was refused.
#[derive(Debug, thiserror::Error)]
pub enum SchemaError {
    /// The document does not have the schema's shape: a missing, unknown or mistyped field.
    #[error("not valid for the schema: {0}")]
    Shape(#[from] serde_json::Error),
    /// A value has the right type but breaks a rule, prefixed with its path.
    #[error("{0}")]
    Invalid(String),
}

type Check = Result<(), SchemaError>;

fn invalid(path: &str, message: &str) -> SchemaError {
    SchemaError::Invalid(format!("{path}: {message}"))
}

fn ensure(cond: bool, path: &str, message: &str) -> Check {
    if cond {
        Ok(())
    } else {
        Err(invalid(path, message))
    }
}

macro_rules! pattern {
    ($name:ident, $re:expr) => {
        static $name: LazyLock<Regex> = LazyLock::new(|| Regex::new($re).expect("static regex"));
    };
}

// A model id or a name a tool is handed (`--model <name>`): letters, digits
// and `._:/-`, never starting with `-`, so no CLI reads it as a flag.
pattern!(NATIVE_NAME, r"^[A-Za-z0-9._:/][A-Za-z0-9._:/-]*$");
// `provider/id`; the id may itself hold `/` and `:` (`ollama/qwen3:4b`).
pattern!(
    MODEL_KEY,
    r"^[a-z][a-z0-9-]*/[A-Za-z0-9._:/][A-Za-z0-9._:/-]*$"
);
// An environment variable name: `key_env` names the variable, never holds a key.
pattern!(KEY_ENV, r"^[A-Za-z_][A-Za-z0-9_]*$");

/// The format version of the machine catalogue file this build reads.
pub const MACHINE_CATALOGUE_VERSION: u64 = 1;

/// `z.iso.date()`: `YYYY-MM-DD`, a real calendar date.
fn is_iso_date(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() != 10 || b[4] != b'-' || b[7] != b'-' {
        return false;
    }
    let digits = |r: std::ops::Range<usize>| b[r].iter().all(u8::is_ascii_digit);
    if !(digits(0..4) && digits(5..7) && digits(8..10)) {
        return false;
    }
    let num = |r: std::ops::Range<usize>| s[r].parse::<u32>().unwrap_or(0);
    let (year, month, day) = (num(0..4), num(5..7), num(8..10));
    let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
    let days = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return false,
    };
    (1..=days).contains(&day)
}

fn date(s: &str, path: &str) -> Check {
    ensure(is_iso_date(s), path, "must be a YYYY-MM-DD date")
}

fn id(s: &str, path: &str) -> Check {
    ensure(is_tool_id(s), path, "must be a lower-case identifier")
}

fn model_key(s: &str, path: &str) -> Check {
    ensure(MODEL_KEY.is_match(s), path, "must be provider/id")
}

fn native_name(s: &str, path: &str) -> Check {
    ensure(
        NATIVE_NAME.is_match(s),
        path,
        "must be letters, digits and ._:/-, not starting with -",
    )
}

fn non_empty(s: &str, path: &str) -> Check {
    ensure(!s.is_empty(), path, "must not be empty")
}

/// A launch mode: whitespace-separated flags, at least one (the TypeScript's `/\S/`).
fn via(s: &str, path: &str) -> Check {
    ensure(
        s.chars().any(|c| !is_js_whitespace(c)),
        path,
        "must hold at least one flag",
    )
}

/// Efforts on agent-call's scale (the TypeScript's `EffortsSchema`).
fn efforts(list: &Option<Vec<String>>, path: &str) -> Check {
    for e in list.iter().flatten() {
        ensure(is_effort_level(e), path, &unknown_effort_message(e))?;
    }
    Ok(())
}

fn context(c: &Option<ContextSizes>, path: &str) -> Check {
    let Some(c) = c else { return Ok(()) };
    ensure(c.default != Some(0), path, "default must be positive")?;
    ensure(c.max != Some(0), path, "max must be positive")?;
    for v in c.variants.iter().flatten() {
        non_empty(v, path)?;
    }
    Ok(())
}

fn takes(t: &Option<Takes>, path: &str) -> Check {
    match t {
        Some(
            Takes::Flag { name }
            | Takes::Config { name }
            | Takes::Suffix { name }
            | Takes::Bracket { name },
        ) => non_empty(name, path),
        _ => Ok(()),
    }
}

/// The slots a headless template's arguments may hold, each filled as one whole argument.
pub const HEADLESS_SLOTS: &[&str] = &["{prompt}", "{model}", "{effort}"];

/// What is wrong with a headless template's slots, or `None`: a slot must be a
/// whole argument (never part of one), appear at most once, and `{prompt}`
/// appears exactly when the prompt travels in the arguments.
pub fn headless_template_problem(template: &HeadlessTemplate) -> Option<String> {
    for (i, arg) in template.args.iter().enumerate() {
        if let Some(inside) = HEADLESS_SLOTS
            .iter()
            .find(|slot| arg != *slot && arg.contains(**slot))
        {
            return Some(format!(
                "args[{i}]: {inside} must be a whole argument, not part of '{arg}'"
            ));
        }
    }
    for slot in HEADLESS_SLOTS {
        if template.args.iter().filter(|a| a == slot).count() > 1 {
            return Some(format!("{slot} appears more than once"));
        }
    }
    let prompt = template.args.iter().any(|a| a == "{prompt}");
    match template.prompt_via {
        PromptVia::Argv if !prompt => Some("prompt_via: argv needs a {prompt} slot".into()),
        PromptVia::Stdin if prompt => Some("prompt_via: stdin takes no {prompt} slot".into()),
        _ => None,
    }
}

fn curated_offer(o: &CuratedOffer, path: &str) -> Check {
    model_key(&o.model, path)?;
    native_name(&o.native_name, path)?;
    efforts(&o.efforts, path)?;
    context(&o.context, path)
}

fn offering_row(o: &OfferingRow, path: &str) -> Check {
    id(&o.tool, path)?;
    model_key(&o.model, path)?;
    if let Some(n) = &o.native_name {
        native_name(n, path)?;
    }
    if let Some(v) = &o.via {
        via(v, path)?;
    }
    efforts(&o.efforts, path)?;
    context(&o.context, path)
}

/// A tool row as the snapshot states it (a superset of what `router.tools` allows).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ToolRow {
    /// The executable when it is not the tool id (`cursor-agent` for cursor).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub binary: Option<String>,
    /// Providers the tool reaches; adds to the providers a lower layer lists.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub serves: Option<Vec<ServesEntry>>,
    /// How the tool picks models.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub openness: Option<Openness>,
    /// How the tool can run.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub modes: Option<Vec<ToolMode>>,
    /// How the tool takes a model.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<Takes>,
    /// How the tool takes a reasoning effort.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effort: Option<Takes>,
    /// How the tool takes a context size.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context: Option<Takes>,
    /// The effort levels the tool can pass; `[]` when it takes none.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub efforts: Option<Vec<String>>,
    /// The tool's own model aliases: alias to model key.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub aliases: Option<indexmap::IndexMap<String, String>>,
    /// Hand the tool its alias for a model rather than the model id.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prefer_alias: Option<bool>,
    /// The tool calls each provider with that provider's key, not through its own sign-in.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_keys: Option<bool>,
    /// A curated tool's own model list.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub offers: Option<Vec<CuratedOffer>>,
    /// The headless launch template of a tool the host has no headless launcher for (a declared tool).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub headless: Option<HeadlessTemplate>,
    /// The row's own observation date, `YYYY-MM-DD`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub observed_at: Option<String>,
    /// The tool version the row was checked against.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub checked_against: Option<String>,
    /// Fields taken from documentation, not a run on the day of the snapshot.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub verify: Option<Vec<String>>,
}

impl ToolRow {
    fn validate(&self, path: &str) -> Check {
        if let Some(b) = &self.binary {
            non_empty(b, path)?;
        }
        for entry in self.serves.iter().flatten() {
            id(entry.provider(), path)?;
            if let Some(v) = entry.via() {
                via(v, path)?;
            }
        }
        takes(&self.model, path)?;
        takes(&self.effort, path)?;
        takes(&self.context, path)?;
        efforts(&self.efforts, path)?;
        for (alias, key) in self.aliases.iter().flatten() {
            // The TypeScript refuses a `__proto__` key in every record (`refuseProtoKey`); the
            // other tables' key patterns refuse it already, a native name does not.
            ensure(alias != "__proto__", path, "'__proto__' cannot be a key")?;
            native_name(alias, path)?;
            model_key(key, path)?;
        }
        for offer in self.offers.iter().flatten() {
            curated_offer(offer, path)?;
        }
        if let Some(h) = &self.headless {
            ensure(!h.args.is_empty(), path, "headless args must not be empty")?;
            if let Some(problem) = headless_template_problem(h) {
                return Err(invalid(path, &problem));
            }
        }
        if let Some(d) = &self.observed_at {
            date(d, path)?;
        }
        if let Some(c) = &self.checked_against {
            non_empty(c, path)?;
        }
        for v in self.verify.iter().flatten() {
            non_empty(v, path)?;
        }
        Ok(())
    }
}

/// A provider row.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProviderRow {
    /// The API the provider speaks. Required for a provider the snapshot lacks.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<ProviderKind>,
    /// Base URL of the API.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub endpoint: Option<String>,
    /// Name of the environment variable that holds the API key. Never the key itself.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub key_env: Option<String>,
    /// The row's own observation date, `YYYY-MM-DD`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub observed_at: Option<String>,
}

impl ProviderRow {
    fn validate(&self, path: &str) -> Check {
        if let Some(e) = &self.endpoint {
            ensure(url::Url::parse(e).is_ok(), path, "endpoint must be a URL")?;
        }
        if let Some(k) = &self.key_env {
            ensure(
                KEY_ENV.is_match(k),
                path,
                "must be an environment variable name, not a key",
            )?;
        }
        if let Some(d) = &self.observed_at {
            date(d, path)?;
        }
        Ok(())
    }
}

/// A model row as a snapshot or machine catalogue layer states it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ModelRow {
    /// Other names for the model.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub aliases: Option<Vec<String>>,
    /// The model family, which classifier rules match.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub family: Option<String>,
    /// The release day, `YYYY-MM-DD`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub release_date: Option<String>,
    /// The model's context sizes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context: Option<ContextSizes>,
    /// The model's effort levels.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub efforts: Option<Vec<String>>,
    /// US dollars per million tokens.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cost: Option<Cost>,
    /// What the model can do.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub traits: Option<Vec<Trait>>,
    /// The model's lifecycle status.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<ModelStatus>,
    /// When the model was deprecated.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deprecated_on: Option<String>,
    /// The row's own observation date, `YYYY-MM-DD`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub observed_at: Option<String>,
}

impl ModelRow {
    fn validate(&self, path: &str) -> Check {
        for a in self.aliases.iter().flatten() {
            native_name(a, path)?;
        }
        if let Some(f) = &self.family {
            non_empty(f, path)?;
        }
        if let Some(d) = &self.release_date {
            date(d, path)?;
        }
        context(&self.context, path)?;
        efforts(&self.efforts, path)?;
        if let Some(c) = &self.cost {
            ensure(
                c.input >= 0.0 && c.output >= 0.0,
                path,
                "cost must not be negative",
            )?;
        }
        if let Some(d) = &self.deprecated_on {
            non_empty(d, path)?;
        }
        if let Some(d) = &self.observed_at {
            date(d, path)?;
        }
        Ok(())
    }
}

fn table<T>(
    rows: &Table<T>,
    path: &str,
    key_ok: fn(&str, &str) -> Check,
    each: impl Fn(&T, &str) -> Check,
) -> Check {
    for (key, row) in rows {
        let at = format!("{path}.{key}");
        key_ok(key, &at)?;
        each(row, &at)?;
    }
    Ok(())
}

/// The shipped snapshot's shape: a whole layer, strict.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SnapshotLayer {
    /// Always `snapshot`.
    pub source: String,
    /// The date (`YYYY-MM-DD`) the snapshot was taken.
    pub observed_at: String,
    /// Tool rows, keyed by tool id.
    pub tools: Table<ToolRow>,
    /// Provider rows, keyed by provider id.
    pub providers: Table<ProviderRow>,
    /// Model rows, keyed `provider/id`.
    pub models: Table<ModelRow>,
    /// Hand-kept tool and model facts models.dev lacks: the context window a tool runs a model with.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub offerings: Option<Vec<OfferingRow>>,
}

impl SnapshotLayer {
    /// Parse and check a snapshot document.
    pub fn parse(value: Value) -> Result<SnapshotLayer, SchemaError> {
        let layer: SnapshotLayer = serde_json::from_value(value)?;
        layer.validate()?;
        Ok(layer)
    }

    fn validate(&self) -> Check {
        ensure(self.source == "snapshot", "source", "must be 'snapshot'")?;
        date(&self.observed_at, "observed_at")?;
        table(&self.tools, "tools", id, |r, p| r.validate(p))?;
        table(&self.providers, "providers", id, |r, p| r.validate(p))?;
        table(&self.models, "models", model_key, |r, p| r.validate(p))?;
        for (i, o) in self.offerings.iter().flatten().enumerate() {
            offering_row(o, &format!("offerings[{i}]"))?;
        }
        Ok(())
    }

    /// The snapshot as the lowest catalogue layer.
    pub fn into_layer(self) -> CatalogueLayer {
        CatalogueLayer {
            source: self.source,
            observed_at: self.observed_at,
            tools: Some(rows(&self.tools)),
            providers: Some(rows(&self.providers)),
            models: Some(rows(&self.models)),
            offerings: self.offerings,
        }
    }
}

/// The typed rows as the untyped maps layering merges. The merge is untyped
/// because it mirrors `layers.ts` field for field: a per-field `fields`
/// provenance, and a later layer overriding an earlier one key by key.
///
/// # Panics
///
/// When a row does not serialize to a JSON object. Every row type is a struct,
/// so that is a bug in the row type; it panics rather than hide as an empty row.
fn rows<T: Serialize>(table: &Table<T>) -> Table<LayerRow> {
    table
        .iter()
        .map(|(k, v)| match serde_json::to_value(v) {
            Ok(Value::Object(m)) => (k.clone(), m),
            other => panic!("row {k} does not serialize to a JSON object: {other:?}"),
        })
        .collect()
}

/// A machine layer's tool row: only a curated tool's own list.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MachineToolRow {
    /// The curated tool's own model list.
    pub offers: Vec<CuratedOffer>,
}

/// One layer of the machine catalogue: what models.dev or one probe reported.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MachineLayer {
    /// `models.dev` or `probe:<tool>`.
    pub source: String,
    /// The date (`YYYY-MM-DD`) the layer was observed.
    pub observed_at: String,
    /// Model rows, keyed `provider/id`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub models: Option<Table<ModelRow>>,
    /// Curated tools' own model lists, keyed by tool id.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tools: Option<Table<MachineToolRow>>,
}

impl MachineLayer {
    fn validate(&self, path: &str) -> Check {
        let probe_ok = self.source.strip_prefix("probe:").is_some_and(is_tool_id);
        ensure(
            self.source == "models.dev" || probe_ok,
            path,
            "source must be 'models.dev' or 'probe:<tool>'",
        )?;
        date(&self.observed_at, path)?;
        if let Some(models) = &self.models {
            table(models, &format!("{path}.models"), model_key, |r, p| {
                r.validate(p)
            })?;
        }
        if let Some(tools) = &self.tools {
            table(tools, &format!("{path}.tools"), id, |r, p| {
                for offer in &r.offers {
                    curated_offer(offer, p)?;
                }
                Ok(())
            })?;
        }
        Ok(())
    }

    /// The layer as a catalogue layer. A probe's `offers` set the tool's own list.
    pub fn into_layer(self) -> CatalogueLayer {
        CatalogueLayer {
            source: self.source,
            observed_at: self.observed_at,
            tools: self.tools.as_ref().map(rows),
            providers: None,
            models: self.models.as_ref().map(rows),
            offerings: None,
        }
    }
}

/// The machine catalogue: a file of layers a host writes on one machine, one
/// layer per source, laid over the shipped snapshot and under the config
/// layers when read. Where it lives is the host's choice.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MachineCatalogue {
    /// The file format version, [`MACHINE_CATALOGUE_VERSION`].
    pub version: u64,
    /// The date (`YYYY-MM-DD`) the file was last refreshed.
    pub refreshed_at: String,
    /// One layer per source.
    pub layers: Vec<MachineLayer>,
}

impl MachineCatalogue {
    /// Parse and check a machine catalogue document.
    pub fn parse(value: Value) -> Result<MachineCatalogue, SchemaError> {
        let cat: MachineCatalogue = serde_json::from_value(value)?;
        ensure(
            cat.version == MACHINE_CATALOGUE_VERSION,
            "version",
            &format!("must be {MACHINE_CATALOGUE_VERSION}"),
        )?;
        date(&cat.refreshed_at, "refreshed_at")?;
        for (i, layer) in cat.layers.iter().enumerate() {
            layer.validate(&format!("layers[{i}]"))?;
        }
        Ok(cat)
    }

    /// One catalogue layer per machine layer, in file order.
    pub fn into_layers(self) -> Vec<CatalogueLayer> {
        self.layers
            .into_iter()
            .map(MachineLayer::into_layer)
            .collect()
    }
}
