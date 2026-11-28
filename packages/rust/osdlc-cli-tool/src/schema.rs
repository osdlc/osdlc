//! JSON Schema for a command's input, from its clap arguments, and output, from
//! the payload type its report serializes. The Rust twin of `@osdlc/cli-tool`'s
//! `command/schema.ts` and the `schema` entries of its `app.ts`. clap cannot say
//! what a command prints, so a tool registers that in [`CommandDocs`].

use std::collections::BTreeMap;

use clap::{ArgAction, Command};
use schemars::JsonSchema;
use schemars::r#gen::SchemaSettings;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};

use crate::cli::CommandError;
use crate::document::{ErrorDocument, SCHEMA_VERSION};
use crate::exit::{EXIT_MISSING_TOOL, EXIT_UNREACHABLE, Exit};
use crate::help::{
    FlagKind, HelpExit, UNIVERSAL_EXITS, about, arg_help, built, children, choices, command_line,
    default_value, flag_args, flag_kind, is_variadic, locate, node_runs, positional_args,
};

/// The JSON Schema dialect of every schema this module writes.
pub const SCHEMA_DIALECT: &str = "https://json-schema.org/draft/2020-12/schema";

/// What clap cannot say about one command: the document it prints under
/// `--json`, its own exit codes and examples, and whether it changes anything.
#[derive(Debug, Clone, PartialEq)]
pub struct CommandDoc {
    /// The subcommand words from the root, such as `["context", "files"]`.
    pub path: Vec<String>,
    /// The `kind` of its document.
    pub kind: String,
    /// The `schemaVersion` of its document.
    pub schema_version: u32,
    /// The payload's JSON Schema, without the envelope's `schemaVersion` and
    /// `kind`: usually [`payload_schema`] of the report type.
    pub output: Value,
    /// Its own exit codes, listed after the universal ones; one with a
    /// universal code replaces that entry.
    pub exits: Vec<HelpExit>,
    /// Example command lines, without the tool's name (help prepends it).
    pub examples: Vec<String>,
    /// True only when the command changes nothing under any flag: no flag
    /// makes it write, or start anything that may.
    pub read_only: bool,
    /// The other documents a flag makes it print: each one's `kind` and
    /// payload schema. They share the command's `schemaVersion`.
    pub alternates: Vec<(String, Value)>,
}

impl CommandDoc {
    /// The doc of the command at `path`, printing a `kind` document of
    /// `schema_version` with payload schema `output`, and nothing else set.
    pub fn new(path: &[&str], kind: &str, schema_version: u32, output: Value) -> Self {
        Self {
            path: path.iter().map(|word| (*word).to_owned()).collect(),
            kind: kind.to_owned(),
            schema_version,
            output,
            exits: Vec::new(),
            examples: Vec::new(),
            read_only: false,
            alternates: Vec::new(),
        }
    }

    /// This doc with one more exit code of the command's own.
    #[must_use]
    pub fn exit(mut self, code: i32, meaning: &str) -> Self {
        self.exits.push(HelpExit::new(code, meaning));
        self
    }

    /// This doc with one more example, written without the tool's name.
    #[must_use]
    pub fn example(mut self, line: &str) -> Self {
        self.examples.push(line.to_owned());
        self
    }

    /// This doc marked as changing nothing under any flag.
    #[must_use]
    pub fn read_only(mut self) -> Self {
        self.read_only = true;
        self
    }

    /// This doc with one more document a flag makes the command print.
    #[must_use]
    pub fn alternate(mut self, kind: &str, output: Value) -> Self {
        self.alternates.push((kind.to_owned(), output));
        self
    }
}

/// The [`CommandDoc`] of each command, by path, and which of the universal
/// exits the tool can return.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct CommandDocs {
    by_path: BTreeMap<Vec<String>, CommandDoc>,
    /// The failure-class exits the tool can return; `None` for all of them.
    failure_exits: Option<Vec<i32>>,
}

impl CommandDocs {
    /// These docs for a tool that can return only `codes` of the failure-class
    /// exits ([`EXIT_MISSING_TOOL`](crate::EXIT_MISSING_TOOL) to
    /// [`EXIT_UNREACHABLE`](crate::EXIT_UNREACHABLE)), `&[]` for none: help lists
    /// only those. 0, 1 and 2 are always listed.
    #[must_use]
    pub fn failure_exits(mut self, codes: &[i32]) -> Self {
        self.failure_exits = Some(codes.to_vec());
        self
    }

    /// The universal exits the tool has, in order: 0, 1 and 2, then the
    /// failure-class exits it can return.
    pub fn universal_exits(&self) -> impl Iterator<Item = HelpExit> + '_ {
        UNIVERSAL_EXITS
            .iter()
            .filter(|(code, _)| {
                !is_failure_exit(*code)
                    || self
                        .failure_exits
                        .as_ref()
                        .is_none_or(|kept| kept.contains(code))
            })
            .map(|(code, meaning)| HelpExit::new(*code, *meaning))
    }

    /// Add `doc`, replacing any doc already given for its path.
    pub fn add(&mut self, doc: CommandDoc) {
        self.by_path.insert(doc.path.clone(), doc);
    }

    /// These docs with `doc` added.
    #[must_use]
    pub fn with(mut self, doc: CommandDoc) -> Self {
        self.add(doc);
        self
    }

    /// The doc of the command at `path`.
    pub fn get(&self, path: &[String]) -> Option<&CommandDoc> {
        self.by_path.get(path)
    }

    /// Every doc, in path order.
    pub fn iter(&self) -> impl Iterator<Item = &CommandDoc> {
        self.by_path.values()
    }
}

/// The JSON Schema of `T` as a command's payload, derived by schemars: an
/// `Option` field also takes `null`, since serde writes `None` as `null` unless
/// the field is skipped; its definitions are under `$defs`, and a tuple's
/// keywords are those of 2020-12 (`prefixItems`).
pub fn payload_schema<T: JsonSchema>() -> Value {
    let settings = SchemaSettings::draft2019_09().with(|settings| {
        settings.meta_schema = Some(SCHEMA_DIALECT.to_owned());
        settings.definitions_path = "#/$defs/".to_owned();
    });
    let schema = settings.into_generator().into_root_schema_for::<T>();
    // A schemars schema is plain data: it always serializes.
    let mut value = serde_json::to_value(schema).unwrap_or(Value::Bool(true));
    // schemars 0.8 writes its definitions under `definitions` whatever the
    // path its references use; 2020-12 names them `$defs`.
    if let Value::Object(map) = &mut value
        && let Some(defs) = map.remove("definitions")
    {
        map.insert("$defs".into(), defs);
    }
    tuples_to_2020_12(&mut value);
    value
}

fn is_failure_exit(code: i32) -> bool {
    (EXIT_MISSING_TOOL..=EXIT_UNREACHABLE).contains(&code)
}

/// The name the `error` document is published under in `schema`; see [`schema_entries`].
pub const ERROR_ENTRY: &str = "error";

/// The JSON Schema of the [`ErrorDocument`] a command prints on stdout under
/// `--json` when it fails, with its `schemaVersion` and `kind` fixed.
pub fn error_schema() -> Value {
    let mut schema = payload_schema::<ErrorDocument>();
    if let Some(Value::Object(props)) = schema.get_mut("properties") {
        for (name, fixed) in [
            ("schemaVersion", Value::from(SCHEMA_VERSION)),
            ("kind", Value::from(ERROR_ENTRY)),
        ] {
            if let Some(Value::Object(prop)) = props.get_mut(name) {
                prop.remove("type");
                prop.remove("format");
                prop.remove("minimum");
                prop.insert("const".into(), fixed);
            }
        }
    }
    schema
}

/// The `schema` entry of the `error` document, for the tool `app`.
fn error_entry(app: &str) -> SchemaEntry {
    SchemaEntry {
        path: vec![ERROR_ENTRY.to_owned()],
        command: format!("{app} <command> --json"),
        summary: "The document a command prints on stdout under --json when it fails.".to_owned(),
        group: false,
        interactive: false,
        kind: Some(ERROR_ENTRY.to_owned()),
        schema_version: Some(SCHEMA_VERSION),
        input: None,
        output: Some(error_schema()),
        description: Some(
            "Not a command: what any command prints on stdout in place of its own document \
             when it fails or refuses, a command line it cannot run as typed included. \
             `exit` is the code the run returns, and `code` a stable name to branch on."
                .to_owned(),
        ),
        read_only: None,
    }
}

/// The JSON Schema of a command line: one property per argument, keyed by its
/// clap id, with a flag's spelling under `x-cli` (`flag`, `short`) and a
/// positional's index in `x-cli.positional`. clap's `--help` and `--version`
/// are left out. `cmd` is a node of a built tree ([`Command::build`]), so the
/// global flags it inherits are among its arguments.
pub fn input_schema(cmd: &Command) -> Value {
    let mut properties = Map::new();
    let mut required = Vec::new();
    for arg in flag_args(cmd) {
        let kind = flag_kind(arg);
        let mut cli = Map::new();
        if let Some(long) = arg.get_long() {
            cli.insert("flag".into(), format!("--{long}").into());
        }
        if let Some(short) = arg.get_short() {
            cli.insert("short".into(), format!("-{short}").into());
        }
        let mut schema = Map::new();
        schema.insert("description".into(), arg_help(arg).into());
        schema.insert("x-cli".into(), cli.into());
        let defaults = default_value(arg, kind);
        match kind {
            FlagKind::Boolean => {
                let on = matches!(arg.get_action(), ArgAction::SetFalse);
                schema.insert("type".into(), "boolean".into());
                schema.insert("default".into(), on.into());
            }
            FlagKind::Count => {
                schema.insert("type".into(), "integer".into());
                schema.insert("minimum".into(), 0.into());
                schema.insert("default".into(), 0.into());
            }
            FlagKind::Enum => {
                schema.insert("type".into(), "string".into());
                schema.insert("enum".into(), choices(arg).into());
            }
            FlagKind::String => {
                schema.insert("type".into(), "string".into());
            }
            FlagKind::List => {
                schema.insert("type".into(), "array".into());
                schema.insert("items".into(), json!({ "type": "string" }));
            }
        }
        if let Some(default) = defaults {
            schema.insert("default".into(), default);
        }
        if arg.is_required_set() {
            required.push(arg.get_id().to_string());
        }
        properties.insert(arg.get_id().to_string(), schema.into());
    }
    for (index, arg) in positional_args(cmd).into_iter().enumerate() {
        let variadic = is_variadic(arg);
        let mut schema = Map::new();
        if variadic {
            schema.insert("type".into(), "array".into());
            schema.insert("items".into(), json!({ "type": "string" }));
        } else {
            schema.insert("type".into(), "string".into());
        }
        let help = arg_help(arg);
        if !help.is_empty() {
            schema.insert("description".into(), help.into());
        }
        let mut cli = Map::new();
        cli.insert("positional".into(), index.into());
        if variadic {
            cli.insert("variadic".into(), true.into());
        }
        schema.insert("x-cli".into(), cli.into());
        if arg.is_required_set() {
            required.push(arg.get_id().to_string());
        }
        properties.insert(arg.get_id().to_string(), schema.into());
    }
    let mut schema = Map::new();
    schema.insert("$schema".into(), SCHEMA_DIALECT.into());
    schema.insert("type".into(), "object".into());
    schema.insert("properties".into(), properties.into());
    if !required.is_empty() {
        schema.insert("required".into(), required.into());
    }
    schema.insert("additionalProperties".into(), false.into());
    schema.into()
}

/// The JSON Schema of the document `doc`'s command prints under `--json`: its
/// payload schema with `schemaVersion` and `kind` fixed in front. With
/// alternates, `oneOf` that document and one per alternate, each with its own
/// `kind`. Every payload's `$defs` are gathered at the root; a name two
/// payloads define alike is kept once.
///
/// # Errors
/// When two of its payloads define one name differently, since a `$ref` to it
/// would be ambiguous.
pub fn document_schema(doc: &CommandDoc) -> Result<Value, CommandError> {
    let command = doc.path.join(" ");
    let mut defs = Map::new();
    let main = enveloped(
        &doc.output,
        doc.schema_version,
        &doc.kind,
        &command,
        &mut defs,
    )?;
    let mut schema = Map::new();
    schema.insert("$schema".into(), SCHEMA_DIALECT.into());
    if doc.alternates.is_empty() {
        schema.extend(main);
    } else {
        let mut branches = vec![Value::Object(main)];
        for (kind, output) in &doc.alternates {
            let branch = enveloped(output, doc.schema_version, kind, &command, &mut defs)?;
            branches.push(branch.into());
        }
        schema.insert("oneOf".into(), branches.into());
    }
    if !defs.is_empty() {
        schema.insert("$defs".into(), defs.into());
    }
    Ok(schema.into())
}

/// `payload` with `schemaVersion` and `kind` fixed and required in front of
/// its properties, its `$schema` dropped and its `$defs` moved into `defs`
/// (failing when one differs from the `defs` entry of that name). A payload
/// with no root `properties` (a `oneOf` of variants, say) is wrapped in an
/// `allOf` of itself and the envelope.
fn enveloped(
    payload: &Value,
    schema_version: u32,
    kind: &str,
    command: &str,
    defs: &mut Map<String, Value>,
) -> Result<Map<String, Value>, CommandError> {
    let mut schema = match payload {
        Value::Object(map) => map.clone(),
        _ => Map::new(),
    };
    schema.remove("$schema");
    let mut own = match schema.remove("$defs") {
        Some(Value::Object(own)) => own,
        _ => Map::new(),
    };
    let mut envelope = Map::new();
    envelope.insert("schemaVersion".into(), json!({ "const": schema_version }));
    envelope.insert("kind".into(), json!({ "const": kind }));
    let names = || vec![Value::from("schemaVersion"), Value::from("kind")];

    let schema = if let Some(Value::Object(props)) = schema.get_mut("properties") {
        let mut ordered = envelope;
        ordered.extend(std::mem::take(props));
        *props = ordered;
        let mut required = names();
        if let Some(Value::Array(own)) = schema.get("required") {
            required.extend(own.iter().cloned());
        }
        schema.insert("required".into(), required.into());
        schema
    } else {
        admit_envelope(&mut schema, &mut own);
        let mut wrapped = Map::new();
        if let Some(title) = schema.remove("title") {
            wrapped.insert("title".into(), title);
        }
        wrapped.insert(
            "allOf".into(),
            json!([schema, { "properties": envelope, "required": names() }]),
        );
        wrapped
    };
    for (name, def) in own {
        match defs.get(&name) {
            Some(kept) if *kept != def => {
                return Err(CommandError::Coded {
                    code: "error".to_owned(),
                    message: format!(
                        "the payloads of the command '{command}' define '{name}' differently"
                    ),
                    exit: Exit::Error.code(),
                    hint: Some(format!(
                        "rename one of the types called '{name}', so each payload's \
                         definition has a name of its own"
                    )),
                });
            }
            Some(_) => {}
            None => {
                defs.insert(name, def);
            }
        }
    }
    Ok(schema)
}

/// Let the envelope's two properties through each schema at the top of an
/// `allOf`-wrapped payload that refuses unknown properties, which would
/// otherwise refuse every document: the root and each `oneOf` or `anyOf`
/// member, a `$ref` followed once into `defs`.
fn admit_envelope(root: &mut Map<String, Value>, defs: &mut Map<String, Value>) {
    admit_one(root, defs);
    for key in ["oneOf", "anyOf"] {
        if let Some(Value::Array(members)) = root.get_mut(key) {
            for member in members {
                if let Value::Object(member) = member {
                    admit_one(member, defs);
                }
            }
        }
    }
}

/// [`admit_envelope`] for one schema, or for the definition its `$ref` names.
fn admit_one(schema: &mut Map<String, Value>, defs: &mut Map<String, Value>) {
    let target = match schema.get("$ref").and_then(Value::as_str) {
        Some(reference) => match reference
            .strip_prefix("#/$defs/")
            .and_then(|name| defs.get_mut(name))
        {
            Some(Value::Object(def)) => def,
            _ => return,
        },
        None => schema,
    };
    if target.get("additionalProperties") != Some(&Value::Bool(false)) {
        return;
    }
    if let Value::Object(props) = target
        .entry("properties")
        .or_insert_with(|| Value::Object(Map::new()))
    {
        for name in ["schemaVersion", "kind"] {
            props.entry(name).or_insert(Value::Bool(true));
        }
    }
}

/// `value` with schemars' draft 2019-09 tuple keywords in their 2020-12 form,
/// everywhere in the tree: an array-valued `items` becomes `prefixItems`, and
/// its sibling `additionalItems` becomes `items`.
fn tuples_to_2020_12(value: &mut Value) {
    match value {
        Value::Object(map) => {
            if matches!(map.get("items"), Some(Value::Array(_))) {
                if let Some(prefix) = map.remove("items") {
                    map.insert("prefixItems".into(), prefix);
                }
                if let Some(rest) = map.remove("additionalItems") {
                    map.insert("items".into(), rest);
                }
            }
            for (key, child) in map.iter_mut() {
                // Data, not schemas.
                if !matches!(key.as_str(), "const" | "enum" | "default" | "examples") {
                    tuples_to_2020_12(child);
                }
            }
        }
        Value::Array(items) => items.iter_mut().for_each(tuples_to_2020_12),
        _ => {}
    }
}

/// One entry of the `schema` document: a command and its input and output schemas.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SchemaEntry {
    /// The subcommand words from the root.
    pub path: Vec<String>,
    /// The full command: `mytool context files`.
    pub command: String,
    /// The one-line summary.
    pub summary: String,
    /// Whether it has subcommands.
    pub group: bool,
    /// Always false: clap has no interactive commands.
    pub interactive: bool,
    /// The `kind` of its `--json` document, when the tool registered one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    /// The `schemaVersion` of that document.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub schema_version: Option<u32>,
    /// The JSON Schema of its command line, for a command that runs.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub input: Option<Value>,
    /// The JSON Schema of its `--json` document.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output: Option<Value>,
    /// Its long description, for a command that runs and has one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// True when the command changes nothing; left out otherwise.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub read_only: Option<bool>,
}

/// The `schema` entries of the node at `path` under `root` (the tool's whole
/// command, built here) and every node under it, hidden ones included. The
/// whole tree's entries end with the `error` document's ([`ERROR_ENTRY`]);
/// `path` `["error"]` gives that entry alone unless the tool has a top-level
/// command or alias of that name.
///
/// # Errors
/// [`CommandError::Usage`] when `path` names no command, or the error of
/// [`document_schema`].
pub fn schema_entries(
    root: &Command,
    path: &[String],
    docs: &CommandDocs,
) -> Result<Vec<SchemaEntry>, CommandError> {
    let tree = built(root);
    let app = tree.get_name();
    if path == [ERROR_ENTRY] && tree.find_subcommand(ERROR_ENTRY).is_none() {
        return Ok(vec![error_entry(app)]);
    }
    let (node, path) = locate(&tree, path)?;
    let whole = path.is_empty();
    let mut entries = Vec::new();
    walk(app, node, path, docs, &mut entries)?;
    if whole {
        entries.push(error_entry(app));
    }
    Ok(entries)
}

fn walk(
    app: &str,
    cmd: &Command,
    path: Vec<String>,
    docs: &CommandDocs,
    out: &mut Vec<SchemaEntry>,
) -> Result<(), CommandError> {
    let kids = children(cmd, true);
    let mut entry = SchemaEntry {
        path: path.clone(),
        command: command_line(app, &path),
        summary: about(cmd),
        group: !kids.is_empty(),
        interactive: false,
        kind: None,
        schema_version: None,
        input: None,
        output: None,
        description: None,
        read_only: None,
    };
    if node_runs(cmd) {
        entry.input = Some(input_schema(cmd));
        entry.description = cmd.get_long_about().map(ToString::to_string);
        if let Some(doc) = docs.get(&path) {
            entry.kind = Some(doc.kind.clone());
            entry.schema_version = Some(doc.schema_version);
            entry.output = Some(document_schema(doc)?);
            entry.read_only = doc.read_only.then_some(true);
        }
    }
    out.push(entry);
    for child in kids {
        let mut child_path = path.clone();
        child_path.push(child.get_name().to_owned());
        walk(app, child, child_path, docs, out)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::help::tests::tool;

    #[derive(Serialize, JsonSchema)]
    struct Greet {
        greeting: String,
        times: u32,
    }

    #[derive(Serialize, JsonSchema)]
    struct Plan {
        steps: Vec<String>,
        dry: bool,
    }

    fn greet_doc() -> CommandDoc {
        CommandDoc::new(&["greet"], "greet", 1, payload_schema::<Greet>())
    }

    fn validates(schema: &Value, doc: &Value) -> bool {
        jsonschema::validator_for(schema).unwrap().is_valid(doc)
    }

    #[test]
    fn input_schema_of_a_command() {
        let tree = built(&tool());
        let files = tree.find_subcommand("files").unwrap();
        assert_eq!(
            input_schema(files),
            json!({
                "$schema": "https://json-schema.org/draft/2020-12/schema",
                "type": "object",
                "properties": {
                    "verbose": {
                        "description": "More detail",
                        "x-cli": { "flag": "--verbose", "short": "-v" },
                        "type": "integer",
                        "minimum": 0,
                        "default": 0
                    },
                    "format": {
                        "description": "How to print them",
                        "x-cli": { "flag": "--format" },
                        "type": "string",
                        "enum": ["text", "table"],
                        "default": "text"
                    },
                    "trace": {
                        "description": "Trace the walk",
                        "x-cli": { "flag": "--trace" },
                        "type": "boolean",
                        "default": false
                    },
                    "json": {
                        "description": "Print a JSON document",
                        "x-cli": { "flag": "--json" },
                        "type": "boolean",
                        "default": false
                    },
                    "paths": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "Folders to list",
                        "x-cli": { "positional": 0, "variadic": true }
                    }
                },
                "required": ["paths"],
                "additionalProperties": false
            })
        );
    }

    #[test]
    fn document_schema_accepts_the_envelope_and_only_its_kind() {
        let schema = document_schema(&greet_doc()).unwrap();
        let good = json!({ "schemaVersion": 1, "kind": "greet", "greeting": "hi", "times": 2 });
        assert!(validates(&schema, &good));
        for kind in ["greeting", "error", ""] {
            let mut other = good.clone();
            other["kind"] = kind.into();
            assert!(!validates(&schema, &other), "{kind}");
        }
        let mut version = good.clone();
        version["schemaVersion"] = 2.into();
        assert!(!validates(&schema, &version));
        let missing = json!({ "schemaVersion": 1, "greeting": "hi", "times": 2 });
        assert!(!validates(&schema, &missing));
        let keys: Vec<&String> = schema["properties"].as_object().unwrap().keys().collect();
        assert_eq!(keys, ["schemaVersion", "kind", "greeting", "times"]);
    }

    #[test]
    fn document_schema_with_an_alternate() {
        let doc = greet_doc().alternate("greet.plan", payload_schema::<Plan>());
        let schema = document_schema(&doc).unwrap();
        let greet = json!({ "schemaVersion": 1, "kind": "greet", "greeting": "hi", "times": 2 });
        let plan = json!({ "schemaVersion": 1, "kind": "greet.plan", "steps": ["a"], "dry": true });
        assert!(validates(&schema, &greet));
        assert!(validates(&schema, &plan));
        let mut mixed = greet.clone();
        mixed["kind"] = "greet.plan".into();
        assert!(!validates(&schema, &mixed));
    }

    #[derive(Serialize, JsonSchema)]
    #[serde(untagged)]
    #[expect(dead_code, reason = "only its schema is read")]
    enum Either {
        One { one: Inner },
        Two { two: u32 },
    }

    #[derive(Serialize, JsonSchema)]
    struct Inner {
        name: String,
    }

    #[test]
    fn a_payload_without_properties_is_wrapped_and_keeps_its_defs() {
        let doc = CommandDoc::new(&["x"], "x", 3, payload_schema::<Either>());
        let schema = document_schema(&doc).unwrap();
        assert!(schema.get("allOf").is_some(), "{schema:#}");
        assert!(schema["$defs"].get("Inner").is_some(), "{schema:#}");
        let one = json!({ "schemaVersion": 3, "kind": "x", "one": { "name": "a" } });
        assert!(validates(&schema, &one));
        let wrong = json!({ "schemaVersion": 3, "kind": "y", "two": 2 });
        assert!(!validates(&schema, &wrong));
    }

    #[test]
    fn payload_schema_lets_an_option_be_null() {
        #[derive(Serialize, JsonSchema)]
        struct Maybe {
            note: Option<String>,
        }
        let schema = payload_schema::<Maybe>();
        assert_eq!(schema["$schema"], SCHEMA_DIALECT);
        assert_eq!(
            schema["properties"]["note"],
            json!({ "type": ["string", "null"] })
        );
        let printed = serde_json::to_value(Maybe { note: None }).unwrap();
        assert_eq!(printed, json!({ "note": null }));
        assert!(validates(&schema, &printed));
        assert!(validates(&schema, &json!({ "note": "seen" })));
        assert!(!validates(&schema, &json!({ "note": 1 })));

        let doc = CommandDoc::new(&["maybe"], "maybe", 1, schema);
        let schema = document_schema(&doc).unwrap();
        let printed = json!({ "schemaVersion": 1, "kind": "maybe", "note": null });
        assert!(validates(&schema, &printed));
    }

    #[test]
    fn a_tuple_field_is_written_in_the_2020_12_dialect() {
        #[derive(Serialize, JsonSchema)]
        struct Paired {
            pair: (String, u32),
        }
        let doc = CommandDoc::new(&["pair"], "pair", 1, payload_schema::<Paired>());
        let schema = document_schema(&doc).unwrap();
        let pair = &schema["properties"]["pair"];
        assert_eq!(
            pair["prefixItems"][0],
            json!({ "type": "string" }),
            "{schema:#}"
        );
        assert_eq!(pair["prefixItems"][1]["type"], "integer", "{schema:#}");
        assert!(pair.get("items").is_none(), "{schema:#}");
        let validator = jsonschema::validator_for(&schema).expect("the schema compiles");
        let printed = serde_json::to_value(Paired {
            pair: ("a".into(), 2),
        })
        .unwrap();
        let mut document = json!({ "schemaVersion": 1, "kind": "pair" });
        document["pair"] = printed["pair"].clone();
        assert!(validator.is_valid(&document));
        for wrong in [json!(["a", "b"]), json!(["a", 2, 3]), json!([2, "a"])] {
            let mut other = document.clone();
            other["pair"] = wrong.clone();
            assert!(!validator.is_valid(&other), "{wrong}");
        }
    }

    mod first {
        #[derive(serde::Serialize, schemars::JsonSchema)]
        pub(super) struct Entry {
            pub(super) name: String,
        }
    }

    mod second {
        #[derive(serde::Serialize, schemars::JsonSchema)]
        pub(super) struct Entry {
            pub(super) step: u32,
        }
    }

    #[derive(Serialize, JsonSchema)]
    struct Listed {
        items: Vec<first::Entry>,
    }

    #[derive(Serialize, JsonSchema)]
    struct Listed2 {
        more: Vec<first::Entry>,
    }

    #[derive(Serialize, JsonSchema)]
    struct Stepped {
        steps: Vec<second::Entry>,
    }

    #[test]
    fn a_definition_two_payloads_share_is_kept_once() {
        let doc = CommandDoc::new(&["list"], "list", 1, payload_schema::<Listed>())
            .alternate("list.more", payload_schema::<Listed2>());
        let schema = document_schema(&doc).unwrap();
        let defs: Vec<&String> = schema["$defs"].as_object().unwrap().keys().collect();
        assert_eq!(defs, ["Entry"]);
        let more = json!({ "schemaVersion": 1, "kind": "list.more", "more": [{ "name": "a" }] });
        assert!(validates(&schema, &more));
    }

    #[test]
    fn two_payloads_that_define_one_name_differently_are_an_error() {
        let doc = CommandDoc::new(&["list"], "list", 1, payload_schema::<Listed>())
            .alternate("list.steps", payload_schema::<Stepped>());
        let error = document_schema(&doc).unwrap_err();
        assert!(matches!(error, CommandError::Coded { .. }), "{error:?}");
        let message = error.to_string();
        assert!(
            message.contains("'list'") && message.contains("'Entry'"),
            "{message}"
        );
    }

    #[derive(Serialize, JsonSchema)]
    #[serde(tag = "type", deny_unknown_fields)]
    #[expect(dead_code, reason = "only its schema is read")]
    enum Tagged {
        A { x: u32 },
        B { y: u32 },
    }

    #[test]
    fn a_payload_that_denies_unknown_fields_still_takes_the_envelope() {
        let doc = CommandDoc::new(&["tag"], "tag", 1, payload_schema::<Tagged>());
        let schema = document_schema(&doc).unwrap();
        let printed = json!({ "schemaVersion": 1, "kind": "tag", "type": "A", "x": 1 });
        assert!(validates(&schema, &printed), "{schema:#}");
        let mut extra = printed.clone();
        extra["z"] = 1.into();
        assert!(!validates(&schema, &extra));
    }

    #[test]
    fn schema_entries_walk_every_node_with_the_registered_docs() {
        let docs = CommandDocs::default()
            .with(CommandDoc::new(&["files"], "files", 2, payload_schema::<Greet>()).read_only());
        let entries = schema_entries(&tool(), &[], &docs).unwrap();
        let paths: Vec<String> = entries.iter().map(|e| e.path.join(" ")).collect();
        assert_eq!(paths, ["", "files", "files tree", "secret", "error"]);
        let root = &entries[0];
        assert!(root.group && root.input.is_none() && root.kind.is_none());
        let files = &entries[1];
        assert_eq!(
            (files.kind.as_deref(), files.schema_version, files.read_only),
            (Some("files"), Some(2), Some(true))
        );
        assert_eq!(
            files.output.as_ref().unwrap()["properties"]["kind"]["const"],
            "files"
        );
        assert!(files.input.is_some());
        assert!(files.description.is_some());
        let tree = &entries[2];
        assert!(tree.input.is_some() && tree.output.is_none() && tree.read_only.is_none());
    }

    #[test]
    fn the_error_document_is_published_once_from_its_type() {
        let docs = CommandDocs::default();
        let listed = schema_entries(&tool(), &[], &docs).unwrap();
        let alone = schema_entries(&tool(), &[ERROR_ENTRY.into()], &docs).unwrap();
        assert_eq!(alone.len(), 1);
        assert_eq!(listed.last(), alone.first());
        let entry = &alone[0];
        assert_eq!(
            (
                entry.kind.as_deref(),
                entry.schema_version,
                entry.input.as_ref()
            ),
            (Some("error"), Some(SCHEMA_VERSION), None)
        );
        assert_eq!(entry.command, "tool <command> --json");
        let schema = entry.output.as_ref().unwrap();
        assert_eq!(*schema, error_schema());
        let printed = |doc: &ErrorDocument| serde_json::from_str::<Value>(&doc.to_json()).unwrap();
        let usage = ErrorDocument::new("usage", "no such flag", 2, None);
        let hinted = ErrorDocument::new("untrusted", "not trusted", 10, Some("trust it"));
        assert!(validates(schema, &printed(&usage)));
        assert!(validates(schema, &printed(&hinted)));
        let mut other = printed(&usage);
        other["kind"] = "files".into();
        assert!(!validates(schema, &other));
        other["kind"] = "error".into();
        other["schemaVersion"] = (SCHEMA_VERSION + 1).into();
        assert!(!validates(schema, &other));
        // A subtree's entries do not repeat it.
        let files = schema_entries(&tool(), &["files".into()], &docs).unwrap();
        assert!(files.iter().all(|e| e.path != [ERROR_ENTRY]));
    }

    #[test]
    fn schema_entries_of_a_subtree_and_of_nothing() {
        let entries = schema_entries(&tool(), &["files".into()], &CommandDocs::default()).unwrap();
        assert_eq!(entries.len(), 2);
        let error = schema_entries(&tool(), &["nope".into()], &CommandDocs::default()).unwrap_err();
        assert!(matches!(error, CommandError::Usage(_)));
    }
}
