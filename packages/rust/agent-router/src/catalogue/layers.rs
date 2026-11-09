//! Layering (mirror of `catalogue/layers.ts`): merge catalogue layers, lowest
//! first, keeping per-field provenance and reporting `problems`.

use indexmap::IndexMap;
use serde::de::DeserializeOwned;
use serde_json::{Map, Value};

use super::types::{
    Catalogue, CatalogueLayer, CatalogueProblem, LayerOptions, LayerRow, Model, ProblemTable,
    Provenance, Provider, Sourced, SourcedOfferingRow, Table, Tool,
};

struct Acc {
    row: Map<String, Value>,
    prov: Provenance,
    fields: IndexMap<String, Provenance>,
}

fn serves_provider(entry: &Value) -> Option<&str> {
    match entry {
        Value::String(s) => Some(s),
        Value::Object(o) => o.get("provider").and_then(Value::as_str),
        _ => None,
    }
}

/// `serves` adds across layers (`opencode: { serves: [corp] }` adds a provider
/// to the built-in list); an entry for a provider already served replaces it,
/// so a layer can change its `via`. Every other field is replaced whole.
fn merge_serves(prev: Option<&Value>, next: &Value) -> Value {
    let mut out: Vec<Value> = match prev {
        Some(Value::Array(a)) => a.clone(),
        _ => Vec::new(),
    };
    for entry in next.as_array().into_iter().flatten() {
        let at = out
            .iter()
            .position(|e| serves_provider(e) == serves_provider(entry));
        match at {
            Some(i) => out[i] = entry.clone(),
            None => out.push(entry.clone()),
        }
    }
    Value::Array(out)
}

fn merge_table(
    acc: &mut IndexMap<String, Acc>,
    rows: Option<&Table<LayerRow>>,
    layer: &CatalogueLayer,
) {
    for (key, row) in rows.into_iter().flatten() {
        let prov = Provenance {
            source: layer.source.clone(),
            observed_at: match row.get("observed_at") {
                Some(Value::String(s)) => s.clone(),
                _ => layer.observed_at.clone(),
            },
        };
        let into = acc.entry(key.clone()).or_insert_with(|| Acc {
            row: Map::new(),
            prov: prov.clone(),
            fields: IndexMap::new(),
        });
        for (field, value) in row {
            if field == "observed_at" {
                continue;
            }
            let merged = if field == "serves" {
                merge_serves(into.row.get(field), value)
            } else {
                value.clone()
            };
            into.row.insert(field.clone(), merged);
            into.fields.insert(field.clone(), prov.clone());
        }
        into.prov = prov;
    }
}

fn problem(table: ProblemTable, key: &str, message: String) -> CatalogueProblem {
    CatalogueProblem {
        table,
        key: key.to_string(),
        message,
    }
}

/// Build the typed merged row from its parts, or a `malformed` problem when the
/// layers' values do not fit the row type. Layers are meant to pass the schemas
/// first (`catalogue::schema`); TypeScript has no such check and passes a
/// malformed value through, which Rust cannot.
fn build<T: DeserializeOwned>(
    table: ProblemTable,
    noun: &str,
    key: &str,
    parts: Map<String, Value>,
    problems: &mut Vec<CatalogueProblem>,
) -> Option<Sourced<T>> {
    match serde_json::from_value::<Sourced<T>>(Value::Object(parts)) {
        Ok(v) => Some(v),
        Err(e) => {
            problems.push(problem(
                table,
                key,
                format!("{noun} '{key}' is malformed: {e}"),
            ));
            None
        }
    }
}

fn with_identity(
    mut row: Map<String, Value>,
    prov: &Provenance,
    fields: &IndexMap<String, Provenance>,
) -> Map<String, Value> {
    row.insert("source".into(), prov.source.clone().into());
    row.insert("observed_at".into(), prov.observed_at.clone().into());
    row.insert(
        "fields".into(),
        serde_json::to_value(fields).unwrap_or(Value::Null),
    );
    row
}

fn finish_tools(
    acc: IndexMap<String, Acc>,
    problems: &mut Vec<CatalogueProblem>,
) -> Table<Sourced<Tool>> {
    let mut out = Table::new();
    for (id, Acc { row, prov, fields }) in acc {
        let lacks: Vec<&str> = ["serves", "openness", "modes"]
            .into_iter()
            .filter(|f| !row.contains_key(*f))
            .collect();
        if !lacks.is_empty() {
            problems.push(problem(
                ProblemTable::Tools,
                &id,
                format!("tool '{id}' has no {}", lacks.join(", ")),
            ));
            continue;
        }
        // A declared tool runs as the command its id names; only the snapshot names another.
        let mut parts = Map::new();
        parts.insert("binary".into(), id.clone().into());
        parts.extend(row);
        parts.insert("id".into(), id.clone().into());
        if let Some(t) = build(
            ProblemTable::Tools,
            "tool",
            &id,
            with_identity(parts, &prov, &fields),
            problems,
        ) {
            out.insert(id, t);
        }
    }
    out
}

fn finish_providers(
    acc: IndexMap<String, Acc>,
    problems: &mut Vec<CatalogueProblem>,
) -> Table<Sourced<Provider>> {
    let mut out = Table::new();
    for (id, Acc { row, prov, fields }) in acc {
        if !row.contains_key("kind") {
            problems.push(problem(
                ProblemTable::Providers,
                &id,
                format!("provider '{id}' has no kind"),
            ));
            continue;
        }
        let mut parts = row;
        parts.insert("id".into(), id.clone().into());
        if let Some(p) = build(
            ProblemTable::Providers,
            "provider",
            &id,
            with_identity(parts, &prov, &fields),
            problems,
        ) {
            out.insert(id, p);
        }
    }
    out
}

fn finish_models(
    acc: IndexMap<String, Acc>,
    problems: &mut Vec<CatalogueProblem>,
) -> Table<Sourced<Model>> {
    let mut out = Table::new();
    for (key, Acc { row, prov, fields }) in acc {
        let slash = key.find('/');
        let Some(slash) = slash.filter(|&s| s > 0 && s != key.len() - 1) else {
            problems.push(problem(
                ProblemTable::Models,
                &key,
                format!("model key '{key}' is not provider/id"),
            ));
            continue;
        };
        let (provider, id) = (&key[..slash], &key[slash + 1..]);
        if let Some(named) = row.get("provider")
            && named.as_str() != Some(provider)
        {
            let shown = match named {
                Value::String(s) => s.clone(),
                other => other.to_string(),
            };
            problems.push(problem(
                ProblemTable::Models,
                &key,
                format!("model '{key}' names provider '{shown}'"),
            ));
            continue;
        }
        let mut parts = row;
        parts.insert("key".into(), key.clone().into());
        parts.insert("provider".into(), provider.into());
        parts.insert("id".into(), id.into());
        if let Some(m) = build(
            ProblemTable::Models,
            "model",
            &key,
            with_identity(parts, &prov, &fields),
            problems,
        ) {
            out.insert(key, m);
        }
    }
    out
}

/// Merge catalogue layers, lowest first: the shipped snapshot, then the
/// machine catalogue's layers, then the `router:` config. A higher layer
/// replaces a field of a row (`serves` adds) and the row takes that layer's
/// `source` and `observed_at`; the per-field `fields` map keeps where every
/// other field came from. A merged row missing a required field is left out
/// and reported in `problems`. A reference that only warns goes to `warnings`, or to `problems`
/// under `options.strict`. Inputs are never mutated.
pub fn layer_catalogue(layers: &[CatalogueLayer], options: &LayerOptions) -> Catalogue {
    let mut tools = IndexMap::new();
    let mut providers = IndexMap::new();
    let mut models = IndexMap::new();
    let mut offering_rows = Vec::new();
    for layer in layers {
        merge_table(&mut tools, layer.tools.as_ref(), layer);
        merge_table(&mut providers, layer.providers.as_ref(), layer);
        merge_table(&mut models, layer.models.as_ref(), layer);
        for row in layer.offerings.iter().flatten() {
            offering_rows.push(SourcedOfferingRow {
                tool: row.tool.clone(),
                model: row.model.clone(),
                native_name: row.native_name.clone(),
                via: row.via.clone(),
                efforts: row.efforts.clone(),
                context: row.context.clone(),
                remove: row.remove,
                source: layer.source.clone(),
                observed_at: layer.observed_at.clone(),
            });
        }
    }
    let mut problems = Vec::new();
    let tools = finish_tools(tools, &mut problems);
    let providers = finish_providers(providers, &mut problems);
    let models = finish_models(models, &mut problems);
    let mut cat = Catalogue {
        tools,
        providers,
        models,
        offering_rows,
        problems,
        warnings: Vec::new(),
    };
    let (more, warnings) = reference_problems(&cat);
    cat.problems.extend(more);
    if options.strict {
        cat.problems.extend(warnings);
    } else {
        cat.warnings = warnings;
    }
    cat
}

/// References to a tool, provider or model the merged catalogue lacks. Checks each tool's
/// `serves` providers, alias targets and `offers` models; each model's provider; and that each
/// `cat.offering_rows` entry names a known tool and a known model. Returns the problems, then the
/// warnings: a removal row naming an unknown model only warns.
fn reference_problems(cat: &Catalogue) -> (Vec<CatalogueProblem>, Vec<CatalogueProblem>) {
    let mut out = Vec::new();
    let mut warn = Vec::new();
    for tool in cat.tools.values() {
        for entry in &tool.serves {
            let provider = entry.provider();
            if !cat.providers.contains_key(provider) {
                out.push(problem(
                    ProblemTable::Tools,
                    &tool.id,
                    format!("tool '{}' serves unknown provider '{provider}'", tool.id),
                ));
            }
        }
        for (alias, key) in tool.aliases.iter().flatten() {
            if !cat.models.contains_key(key) {
                out.push(problem(
                    ProblemTable::Tools,
                    &tool.id,
                    format!(
                        "tool '{}' alias '{alias}' names unknown model '{key}'",
                        tool.id
                    ),
                ));
            }
        }
        for offer in tool.offers.iter().flatten() {
            if !cat.models.contains_key(&offer.model) {
                out.push(problem(
                    ProblemTable::Tools,
                    &tool.id,
                    format!("tool '{}' offers unknown model '{}'", tool.id, offer.model),
                ));
            }
        }
    }
    for model in cat.models.values() {
        if !cat.providers.contains_key(&model.provider) {
            out.push(problem(
                ProblemTable::Models,
                &model.key,
                format!(
                    "model '{}' names unknown provider '{}'",
                    model.key, model.provider
                ),
            ));
        }
    }
    for row in &cat.offering_rows {
        if !cat.tools.contains_key(&row.tool) {
            out.push(problem(
                ProblemTable::Offerings,
                &row.tool,
                format!("offering names unknown tool '{}'", row.tool),
            ));
        }
        // A removal row only warns: whether a model is in the catalogue depends on the machine's
        // probe layer, and removing a model nobody offers is a no-op. But a mistyped key also does
        // nothing, so it is still reported.
        if !cat.models.contains_key(&row.model) {
            let removes = row.remove == Some(true);
            let verb = if removes { "removes" } else { "names" };
            let unknown = problem(
                ProblemTable::Offerings,
                &row.tool,
                format!("offering {verb} unknown model '{}'", row.model),
            );
            if removes {
                warn.push(unknown);
            } else {
                out.push(unknown);
            }
        }
    }
    (out, warn)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn layers() -> Vec<CatalogueLayer> {
        serde_json::from_value(json!([
            {
                "source": "snapshot",
                "observed_at": "2026-10-01",
                "providers": { "anthropic": { "kind": "anthropic" } },
                "tools": { "t": { "serves": ["anthropic"], "openness": "closed", "modes": ["headless"] } },
                "models": { "anthropic/m-1": {} }
            },
            {
                "source": "config",
                "observed_at": "2026-10-09",
                "offerings": [
                    { "tool": "t", "model": "anthropic/m-2", "native_name": "m2" },
                    { "tool": "t", "model": "anthropic/m-1-typo", "remove": true }
                ]
            }
        ]))
        .unwrap()
    }

    fn messages(problems: &[CatalogueProblem]) -> Vec<&str> {
        problems.iter().map(|p| p.message.as_str()).collect()
    }

    #[test]
    fn an_unknown_model_removal_row_warns() {
        let cat = layer_catalogue(&layers(), &LayerOptions::default());
        assert_eq!(
            messages(&cat.problems),
            ["offering names unknown model 'anthropic/m-2'"]
        );
        assert_eq!(
            messages(&cat.warnings),
            ["offering removes unknown model 'anthropic/m-1-typo'"]
        );
    }

    #[test]
    fn an_unknown_model_removal_row_is_a_problem_under_strict() {
        let cat = layer_catalogue(&layers(), &LayerOptions { strict: true });
        assert_eq!(
            messages(&cat.problems),
            [
                "offering names unknown model 'anthropic/m-2'",
                "offering removes unknown model 'anthropic/m-1-typo'"
            ]
        );
        assert!(cat.warnings.is_empty());
    }
}
