//! Every vector the TypeScript package emits (`packages/ts/agent-router/fixtures`;
//! decision D-05 there): each file is an array of `{ name, input, expected }`,
//! and the Rust result for `input` must equal `expected`. Regenerate the files
//! from the TypeScript (`pnpm run fixtures` in `packages/ts/agent-router`); do
//! not edit them here.

use std::fs;
use std::path::PathBuf;

use agent_router::binding::{Binding, resolve_binding};
use agent_router::catalogue::{MachineCatalogue, SnapshotLayer};
use agent_router::catalogue::{SchemaError, derive_offerings};
use agent_router::chains::expand_chain;
use agent_router::choose::{
    AVAILABILITY_REASONS, Availability, AvailabilityReason, ChooseContext, PROFILE_SKIP_REASONS,
    ProfileSkipReason, choose_from_profile, skip_reason_text, validate_profile,
};
use agent_router::classify::{builtin_classify_rules, classify, parameter_count};
use agent_router::context::{
    Ctx, check_context, context_args, default_window, format_size, parse_size,
};
use agent_router::effort::{adjust_effort, effort_adjusted_message};
use agent_router::profile::{BUILTIN_PROFILES, Profile, parse_profile, parse_profiles};
use agent_router::reference::{Tier, Trait, format_ref, parse_ref};
use agent_router::resolve::{ResolveContext, resolve_ref};
use agent_router::routing::{
    ROUTING_KEYS, RouteRequest, RoutingRule, RoutingVocabulary, format_when, match_rule,
    parse_routing, shadowed_rules,
};
use agent_router::validity::{CheckContext, check_ref};
use agent_router::wildcard::expand_wildcard;
use agent_router::{
    CatalogueLayer, CatalogueQuery, LayerOptions, MappingPolicy, Ref, layer_catalogue,
    query_catalogue,
};
use serde::Deserialize;
use serde_json::{Map, Value, json};

fn ts_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../ts/agent-router")
}

/// The vectors the TypeScript package emits (`pnpm run fixtures` there). The path is
/// spelled whole, not built from [`ts_dir`], so the conformance suites' scan
/// (`@osdlc/conformance-suites`) sees this crate read the other language's fixtures; the
/// crate is listed in `unmigrated` in `packages/conformance/config.json`.
fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../ts/agent-router/fixtures/")
}

fn read_json(path: PathBuf) -> Value {
    let text = fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("parse {}: {e}", path.display()))
}

#[derive(Deserialize)]
struct Vector {
    name: String,
    input: Value,
    expected: Value,
}

fn vectors(file: &str) -> Vec<Vector> {
    let value = read_json(fixtures_dir().join(file));
    serde_json::from_value(value).unwrap_or_else(|e| panic!("{file}: {e}"))
}

/// Equal as JSON, with numbers compared by value (the TypeScript writes `15`, serde writes `15.0`).
fn same(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => x.as_f64() == y.as_f64(),
        (Value::Array(x), Value::Array(y)) => {
            x.len() == y.len() && x.iter().zip(y).all(|(p, q)| same(p, q))
        }
        (Value::Object(x), Value::Object(y)) => {
            x.len() == y.len() && x.iter().all(|(k, p)| y.get(k).is_some_and(|q| same(p, q)))
        }
        _ => a == b,
    }
}

/// Run `f` over every vector of `file` and fail with every mismatch, not only the first.
fn check(file: &str, f: impl Fn(&Value) -> Value) {
    let all = vectors(file);
    assert!(!all.is_empty(), "{file} has no vectors");
    let mut failures = Vec::new();
    for v in &all {
        let actual = f(&v.input);
        if !same(&actual, &v.expected) {
            failures.push(format!(
                "{}\n  input:    {}\n  expected: {}\n  actual:   {}",
                v.name, v.input, v.expected, actual
            ));
        }
    }
    assert!(
        failures.is_empty(),
        "{file}: {} of {} vectors differ\n{}",
        failures.len(),
        all.len(),
        failures.join("\n")
    );
}

fn named_layers() -> Map<String, Value> {
    match read_json(fixtures_dir().join("layers.json")) {
        Value::Object(m) => m,
        other => panic!("layers.json is not an object: {other}"),
    }
}

fn snapshot_json() -> Value {
    read_json(ts_dir().join("src/catalogue/snapshot.json"))
}

fn layers_of(input: &Value) -> Vec<CatalogueLayer> {
    let named = named_layers();
    input["layers"]
        .as_array()
        .expect("layers is an array")
        .iter()
        .map(|l| {
            let value = match l.as_str() {
                Some("snapshot") => snapshot_json(),
                Some(name) => named
                    .get(name)
                    .unwrap_or_else(|| panic!("unknown named layer {name}"))
                    .clone(),
                None => l.clone(),
            };
            serde_json::from_value(value).expect("a catalogue layer")
        })
        .collect()
}

fn policy_of(input: &Value) -> MappingPolicy {
    input
        .get("policy")
        .map_or_else(MappingPolicy::default, |p| {
            serde_json::from_value(p.clone()).expect("a mapping policy")
        })
}

fn query_of(input: &Value) -> CatalogueQuery {
    query_catalogue(
        layer_catalogue(&layers_of(input), &LayerOptions::default()),
        policy_of(input),
    )
}

fn tier_of(v: &Value) -> Tier {
    serde_json::from_value(v.clone()).expect("a tier")
}

fn to_value<T: serde::Serialize>(t: &T) -> Value {
    serde_json::to_value(t).expect("serializable")
}

fn str_of(v: &Value) -> &str {
    v.as_str().expect("a string")
}

fn opt_str(v: &Value) -> Option<&str> {
    v.as_str()
}

// ---------------------------------------------------------------- constants

#[test]
fn constants_match_typescript() {
    check("constants.json", |_| {
        json!({
            "effort_levels": agent_router::effort::EFFORT_LEVELS,
            "default_chain_order": agent_router::chains::DEFAULT_CHAIN_ORDER,
            "builtin_classify_rules": to_value(&builtin_classify_rules()),
            "builtin_profiles": BUILTIN_PROFILES
                .iter()
                .map(|(name, order)| ((*name).to_string(), json!(order)))
                .collect::<Map<String, Value>>(),
            "availability_reasons": to_value(&AVAILABILITY_REASONS),
            "profile_skip_reasons": to_value(&PROFILE_SKIP_REASONS),
            "routing_keys": ROUTING_KEYS,
        })
    });
}

// ---------------------------------------------------------------- reference

#[test]
fn ref_parse() {
    check("ref/parse.json", |input| {
        match parse_ref(str_of(&input["text"])) {
            Ok(r) => json!({ "ok": true, "ref": to_value(&r), "formatted": format_ref(&r) }),
            Err(e) => json!({ "ok": false, "error": to_value(&e) }),
        }
    });
}

#[test]
fn ref_format() {
    check("ref/format.json", |input| {
        let r: Ref = serde_json::from_value(input.clone()).expect("a reference");
        json!(format_ref(&r))
    });
}

// ------------------------------------------------------------------ context

#[test]
fn context_size() {
    check("context/size.json", |input| match str_of(&input["fn"]) {
        "parse" => to_value(&parse_size(str_of(&input["value"]))),
        _ => json!(format_size(input["value"].as_u64().expect("tokens"))),
    });
}

#[test]
fn context_args_vectors() {
    check("context/args.json", |input| {
        to_value(&context_args(
            str_of(&input["tool"]),
            opt_str(&input["model"]),
            input["ctx"].as_u64().expect("ctx"),
            input["defaultContext"].as_u64(),
        ))
    });
}

#[test]
fn context_default_window() {
    check("context/default-window.json", |input| {
        let q = query_of(input);
        to_value(&default_window(
            &q,
            str_of(&input["tool"]),
            opt_str(&input["model"]),
        ))
    });
}

#[test]
fn context_check() {
    check("context/check.json", |input| {
        let q = query_of(input);
        let want: Option<Ctx> = input
            .get("want")
            .map(|w| serde_json::from_value(w.clone()).expect("ctx"));
        to_value(&check_context(
            str_of(&input["tool"]),
            opt_str(&input["model"]),
            want,
            input["required"].as_u64(),
            &q,
        ))
    });
}

// ------------------------------------------------------------------- effort

#[test]
fn effort_adjust() {
    check("effort/adjust.json", |input| {
        let supported: Vec<String> =
            serde_json::from_value(input["supported"].clone()).expect("levels");
        let result = adjust_effort(str_of(&input["effort"]), &supported);
        let message = result
            .as_ref()
            .and_then(|r| r.adjusted.as_ref())
            .map(effort_adjusted_message);
        json!({ "result": to_value(&result), "message": to_value(&message) })
    });
}

// ----------------------------------------------------------------- validity

#[test]
fn validity_check_ref() {
    check("validity/check-ref.json", |input| {
        let q = query_of(input);
        let r = parse_ref(str_of(&input["ref"])).expect("the fixture reference parses");
        let known: Option<Vec<String>> = input
            .get("ctx")
            .and_then(|c| c.get("knownTools"))
            .map(|k| serde_json::from_value(k.clone()).expect("a list of tool ids"));
        let ctx = CheckContext {
            strict: input
                .get("ctx")
                .and_then(|c| c.get("strict"))
                .and_then(Value::as_bool),
            known_tools: known.as_deref(),
        };
        to_value(&check_ref(&r, &q, &ctx))
    });
}

// ----------------------------------------------------------------- catalogue

fn accepted<T>(r: Result<T, SchemaError>) -> Value {
    json!({ "accepted": r.is_ok() })
}

#[test]
fn schema_snapshot() {
    check("catalogue/schema-snapshot.json", |input| {
        accepted(SnapshotLayer::parse(input["document"].clone()))
    });
}

#[test]
fn schema_machine() {
    check("catalogue/schema-machine.json", |input| {
        accepted(MachineCatalogue::parse(input["document"].clone()))
    });
}

/// The shipped snapshot passes the strict schema, as the TypeScript test of it does.
#[test]
fn the_shipped_snapshot_is_accepted() {
    SnapshotLayer::parse(snapshot_json()).expect("snapshot.json passes the strict schema");
}

/// A machine catalogue read the way a host's refresh writes it, then laid over the snapshot.
#[test]
fn a_machine_catalogue_layers_over_the_snapshot() {
    let doc = json!({
        "version": 1,
        "refreshed_at": "2026-10-20",
        "layers": [
            { "source": "models.dev", "observed_at": "2026-10-20",
              "models": { "anthropic/claude-new-1": { "family": "claude-opus", "release_date": "2026-10-19", "traits": ["agent"] } } },
            { "source": "probe:cursor", "observed_at": "2026-10-20",
              "tools": { "cursor": { "offers": [{ "model": "anthropic/claude-new-1", "native_name": "new-1-high" }] } } },
        ],
    });
    let machine = MachineCatalogue::parse(doc).expect("accepted");
    let mut layers =
        vec![serde_json::from_value::<CatalogueLayer>(snapshot_json()).expect("snapshot layer")];
    layers.extend(machine.into_layers());
    let cat = layer_catalogue(&layers, &LayerOptions::default());
    assert!(cat.problems.is_empty(), "{:?}", cat.problems);
    let q = query_catalogue(cat, MappingPolicy::default());
    let found = q
        .find_model("cursor", "new-1-high")
        .expect("cursor offers the probed model");
    assert_eq!(found.model.key, "anthropic/claude-new-1");
    assert_eq!(found.model.prov.source, "models.dev");
    assert_eq!(
        q.tier_of("anthropic/claude-new-1"),
        agent_router::classify::Placement::Max
    );
}

#[test]
fn catalogue_layers() {
    check("catalogue/layers.json", |input| {
        let options = LayerOptions {
            strict: input["strict"] == json!(true),
        };
        let cat = layer_catalogue(&layers_of(input), &options);
        if input["summary"] == json!(true) {
            let field_sources: Map<String, Value> = cat
                .tools
                .iter()
                .map(|(id, t)| {
                    (
                        id.clone(),
                        json!([t.prov.source, t.prov.observed_at, t.fields.len()]),
                    )
                })
                .collect();
            return json!({
                "tools": cat.tools.keys().collect::<Vec<_>>(),
                "providers": cat.providers.keys().collect::<Vec<_>>(),
                "models": cat.models.len(),
                "offeringRows": cat.offering_rows.len(),
                "problems": to_value(&cat.problems),
                "warnings": to_value(&cat.warnings),
                "fieldSources": field_sources,
            });
        }
        to_value(&cat)
    });
}

#[test]
fn catalogue_offerings() {
    check("catalogue/offerings.json", |input| {
        let offerings = derive_offerings(&layer_catalogue(
            &layers_of(input),
            &LayerOptions::default(),
        ));
        if input["lines"] == json!(true) {
            let lines: Vec<String> = offerings
                .iter()
                .map(|o| {
                    let via = o
                        .via
                        .as_ref()
                        .map_or(String::new(), |v| format!(" via {v}"));
                    format!("{} {} {}{via}", o.tool, o.model, o.native_name)
                })
                .collect();
            return to_value(&lines);
        }
        to_value(&offerings)
    });
}

#[test]
fn catalogue_query() {
    check("catalogue/query.json", |input| {
        let q = query_of(input);
        let args = input["args"].as_array().expect("args");
        let a = args.first().and_then(Value::as_str).unwrap_or("");
        let b = args.get(1).and_then(Value::as_str);
        match str_of(&input["op"]) {
            "tools" => to_value(&q.tools().iter().map(|t| t.id.clone()).collect::<Vec<_>>()),
            "knownTools" => to_value(&q.known_tools()),
            "modelsFor" => to_value(
                &q.models_for(a)
                    .iter()
                    .map(|m| m.key.clone())
                    .collect::<Vec<_>>(),
            ),
            "findModel" => match q.find_model(a, b.expect("a name")) {
                Some(f) => json!({ "model": f.model.key, "native_name": f.offering.native_name }),
                None => Value::Null,
            },
            "offering" => to_value(&q.offering(a, b.expect("a key"))),
            "tierOf" => to_value(&q.tier_of(a)),
            "tierModel" => to_value(&q.tier_model(a, tier_of(&args[1]))),
            "pinned" => json!(q.pinned(a, tier_of(&args[1]))),
            "effortsFor" => to_value(&q.efforts_for(a, b)),
            other => panic!("unknown query op {other}"),
        }
    });
}

#[test]
fn catalogue_classify() {
    check("catalogue/classify.json", |input| {
        match str_of(&input["fn"]) {
            "parameterCount" => to_value(&parameter_count(str_of(&input["id"]))),
            _ => {
                let cat = layer_catalogue(&layers_of(input), &LayerOptions::default());
                let mut rules = policy_of(input).classify;
                rules.extend(builtin_classify_rules());
                to_value(&classify(cat.models.values().map(|m| &m.row), &rules))
            }
        }
    });
}

#[test]
fn catalogue_chains() {
    check("catalogue/chains.json", |input| {
        let q = query_of(input);
        let traits: Vec<Trait> = serde_json::from_value(input["traits"].clone()).expect("traits");
        to_value(&expand_chain(tier_of(&input["tier"]), &traits, &q))
    });
}

// ------------------------------------------- resolve, walk, profiles, routing

/// A vector's catalogue, plus the `knownTools` and `strict` a resolve reads.
struct Resolving {
    query: CatalogueQuery,
    known_tools: Option<Vec<String>>,
    strict: Option<bool>,
}

impl Resolving {
    fn of(input: &Value) -> Resolving {
        Resolving {
            query: query_of(input),
            known_tools: input
                .get("knownTools")
                .map(|k| serde_json::from_value(k.clone()).expect("a list of tool ids")),
            strict: input.get("strict").and_then(Value::as_bool),
        }
    }

    fn context(&self) -> ResolveContext<'_> {
        ResolveContext {
            catalogue: &self.query,
            known_tools: self.known_tools.as_deref(),
            strict: self.strict,
        }
    }
}

/// `{ ok, value }` or `{ ok, error }`, as the TypeScript's `Result` serializes.
fn result_value<T: serde::Serialize, E: serde::Serialize>(r: &Result<T, E>) -> Value {
    match r {
        Ok(value) => json!({ "ok": true, "value": value }),
        Err(error) => json!({ "ok": false, "error": error }),
    }
}

/// A parse result with a shape error's message dropped: the TypeScript's is zod's text, not mirrored.
fn without_shape_message(mut result: Value) -> Value {
    if let Some(error) = result.get_mut("error").and_then(Value::as_object_mut)
        && error.get("kind") == Some(&json!("invalid-shape"))
    {
        error.remove("message");
    }
    result
}

/// An `invalid-profile` binding error over a shape error, with both messages
/// dropped: they carry zod's text, which is not mirrored.
fn without_inline_shape_message(mut result: Value) -> Value {
    if let Some(error) = result.get_mut("error").and_then(Value::as_object_mut)
        && error.get("kind") == Some(&json!("invalid-profile"))
        && error.get("error").and_then(|e| e.get("kind")) == Some(&json!("invalid-shape"))
    {
        error.remove("message");
        error.insert("error".to_string(), json!({ "kind": "invalid-shape" }));
    }
    result
}

fn parsed_ref(text: &str) -> agent_router::Ref {
    parse_ref(text).expect("the fixture reference parses")
}

fn parsed_profile(config: &Value) -> Profile {
    parse_profile(config).expect("the fixture profile parses")
}

#[test]
fn wildcard_expand() {
    check("wildcard/expand.json", |input| {
        let r = Resolving::of(input);
        to_value(&expand_wildcard(
            &parsed_ref(str_of(&input["ref"])),
            &r.context(),
        ))
    });
}

#[test]
fn profile_parse_vectors() {
    check("profile/parse.json", |input| {
        without_shape_message(result_value(&parse_profile(&input["value"])))
    });
}

#[test]
fn profiles_parse_vectors() {
    check("profile/parse-profiles.json", |input| {
        without_shape_message(result_value(&parse_profiles(&input["value"])))
    });
}

/// The availability a vector scripts, by entry text; an entry not listed is available.
fn scripted(answers: &Value) -> impl Fn(&agent_router::resolve::Resolved) -> Availability + '_ {
    move |entry| match answers.get(&entry.text) {
        None => Availability::Ok,
        Some(a) => Availability::Unavailable {
            reason: serde_json::from_value::<AvailabilityReason>(a["reason"].clone())
                .expect("an availability reason"),
            detail: a["detail"].as_str().map(str::to_string),
        },
    }
}

#[test]
fn walk_choose() {
    check("walk/choose.json", |input| {
        let r = Resolving::of(input);
        let profile = parsed_profile(&input["profile"]);
        let answers = input.get("availability").cloned().unwrap_or(json!({}));
        let script = scripted(&answers);
        let asked = std::cell::RefCell::new(Vec::<String>::new());
        let is_available = |entry: &agent_router::resolve::Resolved| {
            asked.borrow_mut().push(entry.text.clone());
            script(entry)
        };
        let choice = choose_from_profile(
            &profile,
            &ChooseContext {
                resolve: r.context(),
                is_available: &is_available,
            },
        );
        json!({
            "choice": to_value(&choice),
            "asked": asked.into_inner(),
            "errors": to_value(&validate_profile(&profile, &r.context())),
        })
    });
}

#[test]
fn walk_skip_reason_text() {
    check("walk/skip-reason-text.json", |input| {
        let reason: ProfileSkipReason =
            serde_json::from_value(input["reason"].clone()).expect("a skip reason");
        json!(skip_reason_text(reason, opt_str(&input["detail"])))
    });
}

/// A reference built in code skips the parser: the walk and `check_ref` still refuse
/// an effort off `EFFORT_LEVELS`, a wildcard's included (the TypeScript's tests do the same).
#[test]
fn an_unknown_effort_built_in_code_is_refused() {
    let r = Resolving::of(&json!({ "layers": ["snapshot"] }));
    let mut wildcard = parsed_ref("*/max");
    wildcard.effort = Some("hgih".to_string());
    let profile = Profile {
        order: vec![wildcard],
        host: None,
        context: None,
    };
    let errors = validate_profile(&profile, &r.context());
    assert_eq!(errors.len(), 1);
    assert_eq!(
        errors[0].message,
        "effort 'hgih' is not a level (levels: none, minimal, low, medium, high, xhigh, max)"
    );
    let mut tool = parsed_ref("opencode");
    tool.effort = Some("hgih".to_string());
    let v = to_value(&check_ref(&tool, &r.query, &CheckContext::default()));
    assert_eq!(v["code"], json!("unknown-effort"));
}

#[test]
fn resolve_vectors() {
    check("resolve/resolve.json", |input| {
        let r = Resolving::of(input);
        result_value(&resolve_ref(
            &parsed_ref(str_of(&input["ref"])),
            &r.context(),
        ))
    });
}

#[test]
fn binding_vectors() {
    check("binding/resolve.json", |input| {
        let r = Resolving::of(input);
        let profiles = parse_profiles(&input["profiles"]).expect("the fixture profiles parse");
        let binding: Binding = serde_json::from_value(input["binding"].clone()).expect("a binding");
        let answers = input.get("availability").cloned().unwrap_or(json!({}));
        let is_available = scripted(&answers);
        without_inline_shape_message(result_value(&resolve_binding(
            &binding,
            &profiles,
            &ChooseContext {
                resolve: r.context(),
                is_available: &is_available,
            },
        )))
    });
}

fn rules_of(v: &Value) -> Vec<RoutingRule> {
    parse_routing(v, &RoutingVocabulary::new()).expect("the fixture rules parse")
}

#[test]
fn routing_parse_vectors() {
    check("routing/parse.json", |input| {
        let vocabulary: RoutingVocabulary = input
            .get("vocabulary")
            .map_or_else(RoutingVocabulary::new, |v| {
                serde_json::from_value(v.clone()).expect("a vocabulary")
            });
        without_shape_message(result_value(&parse_routing(&input["value"], &vocabulary)))
    });
}

#[test]
fn routing_match() {
    check("routing/match.json", |input| {
        let request: RouteRequest =
            serde_json::from_value(input["request"].clone()).expect("a request");
        to_value(&match_rule(&rules_of(&input["rules"]), &request))
    });
}

#[test]
fn routing_shadow() {
    check("routing/shadow.json", |input| {
        to_value(&shadowed_rules(&rules_of(&input["rules"])))
    });
}

#[test]
fn routing_format_when() {
    check("routing/format-when.json", |input| {
        // A `when` has the shape of a rule's, so parse it as one.
        let rules = rules_of(&json!([{ "when": input["when"], "profile": "p" }]));
        json!(format_when(&rules[0].when))
    });
}

/// The manifest names every file, and every file it names exists with that many vectors.
#[test]
fn the_manifest_matches_the_files() {
    let manifest = read_json(fixtures_dir().join("manifest.json"));
    for entry in manifest.as_array().expect("an array") {
        let file = str_of(&entry["file"]);
        assert_eq!(
            vectors(file).len() as u64,
            entry["vectors"].as_u64().expect("a count"),
            "{file}"
        );
    }
}

/// Every file the manifest names is checked by a test here, and every file a test checks is in
/// the manifest, so a file the emitter adds cannot pass unread. The checked files are read from
/// this file's own `check` calls.
#[test]
fn every_manifest_file_is_checked() {
    let needle = concat!("check", "(\"");
    let checked: std::collections::BTreeSet<&str> = include_str!("fixtures.rs")
        .split(needle)
        .skip(1)
        .map(|rest| rest.split('"').next().expect("a closing quote"))
        .collect();
    let manifest = read_json(fixtures_dir().join("manifest.json"));
    let listed: std::collections::BTreeSet<&str> = manifest
        .as_array()
        .expect("an array")
        .iter()
        .map(|entry| str_of(&entry["file"]))
        .collect();
    assert_eq!(checked, listed);
}
