//! The model catalogue of decision D-06 (mirror of `catalogue/types.ts`): facts
//! about tools, providers, models and the offerings that join them. Plain
//! data, no I/O.
//!
//! The `*Row` types are what one layer states (a strict subset of the fields,
//! `deny_unknown_fields`, as the zod schemas are `.strict()`). The unsuffixed
//! `Tool`, `Provider` and `Model` are merged rows.

use std::ops::Deref;

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::reference::Trait;

/// An insertion-ordered table keyed by id (a JS object's iteration order).
pub type Table<T> = IndexMap<String, T>;

/// The layer a fact came from (`snapshot`, `models.dev`, `config`, `probe:<tool>`)
/// and the date (`YYYY-MM-DD`) it was observed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Provenance {
    /// Where the fact came from: `snapshot`, `models.dev`, `config` or `probe:<tool>`.
    pub source: String,
    /// The date (`YYYY-MM-DD`) the fact was observed.
    pub observed_at: String,
}

/// A row with the provenance of the layer that last touched it, and per field
/// the layer that set that field (`fields`), so a partial override keeps the
/// snapshot's provenance on the fields it left alone.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Sourced<T> {
    /// The merged row.
    #[serde(flatten)]
    pub row: T,
    /// The provenance of the layer that last touched the row.
    #[serde(flatten)]
    pub prov: Provenance,
    /// Per field name, the provenance of the layer that set it.
    pub fields: IndexMap<String, Provenance>,
}

impl<T> Deref for Sourced<T> {
    type Target = T;
    fn deref(&self) -> &T {
        &self.row
    }
}

/// How a tool picks models: one vendor's, its own list, or any provider's.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Openness {
    /// One vendor's models.
    Closed,
    /// The tool's own model list (`offers`).
    Curated,
    /// Any provider's models, named `provider/id`.
    Open,
}

/// How a tool can run.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ToolMode {
    /// One prompt, no terminal.
    Headless,
    /// A terminal session.
    Interactive,
}

/// How a tool takes a model, effort or context: a flag (`--model`), a config
/// key (codex `-c model_reasoning_effort=…`), a model suffix (`opus[1m]`), a
/// bracket key (Cursor `model[effort=high]`), or not at all.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "via", rename_all = "lowercase", deny_unknown_fields)]
pub enum Takes {
    /// A command-line flag.
    Flag {
        /// The flag, e.g. `--model`.
        name: String,
    },
    /// A config key.
    Config {
        /// The config key, e.g. `model_reasoning_effort`.
        name: String,
    },
    /// A suffix on the model name.
    Suffix {
        /// The suffix, e.g. `[1m]`.
        name: String,
    },
    /// A key in brackets after the model name.
    Bracket {
        /// The bracket key, e.g. `effort`.
        name: String,
    },
    /// The tool takes no such setting.
    // A struct variant, so `deny_unknown_fields` also refuses `{via: none, name}`.
    None {},
}

impl Default for Takes {
    fn default() -> Takes {
        Takes::None {}
    }
}

/// A provider with the launch mode that reaches it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ServesVia {
    /// The provider id.
    pub provider: String,
    /// The launch mode that reaches this provider, e.g. `--oss --local-provider ollama`.
    pub via: String,
}

/// A provider a tool serves: its id, or `{provider, via}` when a launch mode is needed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ServesEntry {
    /// A provider id, reached without a launch mode.
    Id(String),
    /// A provider with the launch mode that reaches it.
    Via(ServesVia),
}

impl ServesEntry {
    /// The provider id.
    pub fn provider(&self) -> &str {
        match self {
            ServesEntry::Id(id) => id,
            ServesEntry::Via(v) => &v.provider,
        }
    }

    /// The launch mode that reaches the provider, when one is needed.
    pub fn via(&self) -> Option<&str> {
        match self {
            ServesEntry::Id(_) => None,
            ServesEntry::Via(v) => Some(&v.via),
        }
    }
}

/// Whether a headless launch passes the prompt in the arguments or on stdin.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PromptVia {
    /// The prompt goes in the arguments, in the `{prompt}` slot.
    Argv,
    /// The prompt goes on stdin.
    Stdin,
}

/// The headless launch template of a declared tool: `{prompt}`, `{model}` and `{effort}` are slots.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HeadlessTemplate {
    /// Arguments after the binary; each slot is a whole argument.
    pub args: Vec<String>,
    /// Whether the prompt goes in the arguments or on stdin.
    pub prompt_via: PromptVia,
}

/// Context window sizes in tokens: the `default` a tool runs the model with,
/// the model's `max`, and named `variants`.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ContextSizes {
    /// Context size in tokens when nothing selects one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default: Option<u64>,
    /// Largest context size in tokens.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max: Option<u64>,
    /// Named variants a tool selects, e.g. `1m`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub variants: Option<Vec<String>>,
}

/// A curated tool's own listing of one model.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CuratedOffer {
    /// The model's catalogue key, `provider/id`.
    pub model: String,
    /// The name the tool is given for the model.
    pub native_name: String,
    /// The effort levels on this tool, when listed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub efforts: Option<Vec<String>>,
    /// The context sizes on this tool, when listed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context: Option<ContextSizes>,
}

/// A merged tool row: a coding-agent CLI in the catalogue, the providers it
/// serves, how it takes a model, effort and context, and how it is launched.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Tool {
    /// The tool id.
    pub id: String,
    /// The executable, looked up on `PATH`: the snapshot's for a built-in tool,
    /// the tool id for a declared one.
    pub binary: String,
    /// The providers the tool reaches.
    pub serves: Vec<ServesEntry>,
    /// How the tool picks models.
    pub openness: Openness,
    /// How the tool can run.
    pub modes: Vec<ToolMode>,
    /// How the tool takes a model.
    #[serde(default)]
    pub model: Takes,
    /// How the tool takes a reasoning effort.
    #[serde(default)]
    pub effort: Takes,
    /// How the tool takes a context size.
    #[serde(default)]
    pub context: Takes,
    /// The levels the tool can pass; absent when the tool has no fixed list.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub efforts: Option<Vec<String>>,
    /// The tool's own aliases: alias to model key.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub aliases: Option<IndexMap<String, String>>,
    /// Hand the tool its alias rather than the model id.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prefer_alias: Option<bool>,
    /// The tool calls each provider itself, with that provider's key, rather
    /// than through its own sign-in; absent means its own sign-in is enough.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_keys: Option<bool>,
    /// A curated tool's own model list.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub offers: Option<Vec<CuratedOffer>>,
    /// The headless launch template of a declared tool.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub headless: Option<HeadlessTemplate>,
    /// The tool version the row was checked against.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub checked_against: Option<String>,
    /// Fields taken from documentation, not a run on the day of the snapshot.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub verify: Option<Vec<String>>,
}

/// The API a provider speaks.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ProviderKind {
    /// The Anthropic API.
    #[serde(rename = "anthropic")]
    Anthropic,
    /// The OpenAI API.
    #[serde(rename = "openai")]
    Openai,
    /// The Google API.
    #[serde(rename = "google")]
    Google,
    /// An Ollama server.
    #[serde(rename = "ollama")]
    Ollama,
    /// An LM Studio server.
    #[serde(rename = "lmstudio")]
    Lmstudio,
    /// Any API that speaks the OpenAI protocol.
    #[serde(rename = "openai-compatible")]
    OpenaiCompatible,
}

/// A merged provider row: its id, the kind of API it speaks, an optional
/// endpoint and the name of its key variable.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Provider {
    /// The provider id.
    pub id: String,
    /// The API the provider speaks.
    pub kind: ProviderKind,
    /// Base URL of the API.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub endpoint: Option<String>,
    /// The name of the environment variable holding the key, never the key.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub key_env: Option<String>,
}

/// US dollars per million tokens.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Cost {
    /// Dollars per million input tokens.
    pub input: f64,
    /// Dollars per million output tokens.
    pub output: f64,
}

/// A model's lifecycle status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ModelStatus {
    /// The model is current.
    #[default]
    Current,
    /// The model still runs, with a warning.
    Deprecated,
    /// The model is skipped.
    Withdrawn,
}

/// A merged model row: a model of a provider, keyed `provider/id`, with its
/// family, release date, context sizes, effort levels, cost, traits and
/// lifecycle status.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Model {
    /// `provider/id`.
    pub key: String,
    /// The id of the provider that serves the model.
    pub provider: String,
    /// The model id within its provider.
    pub id: String,
    /// Other names for the model.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub aliases: Option<Vec<String>>,
    /// The model family (`claude-opus`, say), which classifier rules match.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub family: Option<String>,
    /// The release day, `YYYY-MM-DD`; the newest model heads a tier.
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
    /// What the model can do; see [`Trait`].
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub traits: Option<Vec<Trait>>,
    /// `Deprecated` still runs, with a warning; `Withdrawn` is skipped.
    #[serde(default)]
    pub status: ModelStatus,
    /// When the model was deprecated.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deprecated_on: Option<String>,
}

impl Model {
    /// Whether the model has the trait `t`.
    pub fn has_trait(&self, t: Trait) -> bool {
        self.traits.as_ref().is_some_and(|ts| ts.contains(&t))
    }
}

/// One model on one tool: what the tool is given and how it differs from the model.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Offering {
    /// The tool id.
    pub tool: String,
    /// The model's catalogue key, `provider/id`.
    pub model: String,
    /// What the tool is given for the model.
    pub native_name: String,
    /// The launch mode this offering needs.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub via: Option<String>,
    /// Effort levels on this tool, when they differ from the model's.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub efforts: Option<Vec<String>>,
    /// Context sizes on this tool, when they differ from the model's.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context: Option<ContextSizes>,
    /// The layer the offering came from.
    pub source: String,
    /// The date (`YYYY-MM-DD`) the offering was observed.
    pub observed_at: String,
}

/// A `router.offerings` row: adds (or replaces) one offering, or removes one.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OfferingRow {
    /// The tool.
    pub tool: String,
    /// The model key, `provider/id`.
    pub model: String,
    /// What the tool is given; derived when omitted.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub native_name: Option<String>,
    /// The launch mode this offering needs.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub via: Option<String>,
    /// Effort levels on this tool, when they differ from the model's.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub efforts: Option<Vec<String>>,
    /// Context sizes on this tool, when they differ from the model's.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context: Option<ContextSizes>,
    /// Remove this tool and model combination instead of adding it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub remove: Option<bool>,
}

/// An offering row with its layer's provenance.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SourcedOfferingRow {
    /// The tool.
    pub tool: String,
    /// The model key, `provider/id`.
    pub model: String,
    /// What the tool is given; derived when omitted.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub native_name: Option<String>,
    /// The launch mode this offering needs.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub via: Option<String>,
    /// Effort levels on this tool, when they differ from the model's.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub efforts: Option<Vec<String>>,
    /// Context sizes on this tool, when they differ from the model's.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context: Option<ContextSizes>,
    /// Remove this tool and model combination instead of adding it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub remove: Option<bool>,
    /// The layer the row came from.
    pub source: String,
    /// The date (`YYYY-MM-DD`) of that layer.
    pub observed_at: String,
}

/// A row as one layer states it: any subset of its fields, by name. Rows are
/// kept as JSON maps so a layer can state any subset and merging is per field.
pub type LayerRow = Map<String, Value>;

/// One layer, lowest first in `layer_catalogue`. Plain data: reading a file is the caller's job.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CatalogueLayer {
    /// Where the layer's facts came from.
    pub source: String,
    /// The date (`YYYY-MM-DD`) the layer was observed.
    pub observed_at: String,
    /// Tool rows, keyed by tool id.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tools: Option<Table<LayerRow>>,
    /// Provider rows, keyed by provider id.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub providers: Option<Table<LayerRow>>,
    /// Keyed `provider/id`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub models: Option<Table<LayerRow>>,
    /// Offering rows that add, replace or remove an offering.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub offerings: Option<Vec<OfferingRow>>,
}

/// The catalogue table a problem is in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProblemTable {
    /// The tools table.
    Tools,
    /// The providers table.
    Providers,
    /// The models table.
    Models,
    /// The offering rows.
    Offerings,
}

/// A merged row that lacks a required field (it is left out), or a reference
/// to a tool, provider or model the catalogue lacks (the row stays).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CatalogueProblem {
    /// The table the row is in.
    pub table: ProblemTable,
    /// The row's key.
    pub key: String,
    /// What is wrong.
    pub message: String,
}

/// The merged catalogue: tools, providers and models keyed by id (each with
/// its provenance), the offering rows, and the problems and warnings found
/// while merging.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Catalogue {
    /// Tools keyed by id.
    pub tools: Table<Sourced<Tool>>,
    /// Providers keyed by id.
    pub providers: Table<Sourced<Provider>>,
    /// Models keyed `provider/id`.
    pub models: Table<Sourced<Model>>,
    /// `router.offerings` rows in layer order, each with its layer's provenance.
    #[serde(rename = "offeringRows")]
    pub offering_rows: Vec<SourcedOfferingRow>,
    /// Problems found while merging.
    pub problems: Vec<CatalogueProblem>,
    /// References worth a look that do not fail the load: a removal row naming a model the
    /// catalogue lacks. Under `strict` they are `problems` instead.
    #[serde(default)]
    pub warnings: Vec<CatalogueProblem>,
}

/// How `layer_catalogue` judges what it merges.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct LayerOptions {
    /// `router.strict`: a warning is a problem.
    pub strict: bool,
}
