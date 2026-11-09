//! Derived offerings (mirror of `catalogue/offerings.ts`): every allowed tool
//! and model combination.

use indexmap::IndexMap;

use super::types::{Catalogue, Model, Offering, Openness, Tool};

/// What `tool` is handed for `model`, in the decision's order:
///
/// 1. the tool's alias for the model, when the tool declares aliases and sets `prefer_alias`;
/// 2. else a curated tool's own name (`curated_name`);
/// 3. else the provider's model id;
/// 4. for a multi-provider (`open`) tool, `provider/id`, as opencode and pi expect.
pub fn native_name(tool: &Tool, model: &Model, curated_name: Option<&str>) -> String {
    if tool.prefer_alias == Some(true)
        && let Some(aliases) = &tool.aliases
        && let Some((alias, _)) = aliases.iter().find(|(_, key)| **key == model.key)
    {
        return alias.clone();
    }
    if let Some(name) = curated_name {
        return name.to_string();
    }
    if tool.openness == Openness::Open {
        return format!("{}/{}", model.provider, model.id);
    }
    model.id.clone()
}

fn key_of(tool: &str, model: &str) -> String {
    format!("{tool} {model}")
}

/// Every allowed tool and model combination. A `closed` or `open` tool offers
/// `serves` times each served provider's models; a `curated` tool offers its
/// own `offers` list. Then each `router.offerings` row, in layer order, removes
/// one (`remove: true`) or adds one, replacing any earlier row for the same
/// tool and model; a field the row leaves out (`native_name`, `via`, `efforts`,
/// `context`) is the replaced row's. When there is no earlier row, a row that
/// sets no `native_name` takes its name from the [`native_name`] fn, which keeps
/// a curated tool's own name. An added row for a model the catalogue lacks is
/// kept, named by its id unless the row sets `native_name`, but
/// `layer_catalogue` reports it as a problem.
pub fn derive_offerings(cat: &Catalogue) -> Vec<Offering> {
    let mut by_key: IndexMap<String, Offering> = IndexMap::new();
    let mut models_by_provider: IndexMap<&str, Vec<&Model>> = IndexMap::new();
    for model in cat.models.values() {
        models_by_provider
            .entry(&model.provider)
            .or_default()
            .push(&model.row);
    }

    for tool in cat.tools.values() {
        let base = |model: &Model, native_name: String| Offering {
            tool: tool.id.clone(),
            model: model.key.clone(),
            native_name,
            via: None,
            efforts: None,
            context: None,
            source: tool.prov.source.clone(),
            observed_at: tool.prov.observed_at.clone(),
        };
        if tool.openness == Openness::Curated {
            for offer in tool.offers.iter().flatten() {
                let Some(model) = cat.models.get(&offer.model) else {
                    continue;
                };
                let mut o = base(model, native_name(tool, model, Some(&offer.native_name)));
                o.efforts = offer.efforts.clone();
                o.context = offer.context.clone();
                by_key.insert(key_of(&o.tool, &o.model), o);
            }
            continue;
        }
        for entry in &tool.serves {
            for model in models_by_provider
                .get(entry.provider())
                .into_iter()
                .flatten()
            {
                let mut o = base(model, native_name(tool, model, None));
                o.via = entry.via().map(str::to_string);
                by_key.insert(key_of(&o.tool, &o.model), o);
            }
        }
    }

    for row in &cat.offering_rows {
        let key = key_of(&row.tool, &row.model);
        if row.remove == Some(true) {
            by_key.shift_remove(&key);
            continue;
        }
        let tool = cat.tools.get(&row.tool);
        let model = cat.models.get(&row.model);
        let fallback = match row.model.find('/') {
            Some(slash) => &row.model[slash + 1..],
            None => &row.model,
        };
        let prev = by_key.get(&key);
        let name = row
            .native_name
            .clone()
            .or_else(|| prev.map(|o| o.native_name.clone()))
            .unwrap_or_else(|| match (tool, model) {
                (Some(t), Some(m)) => {
                    let curated = if t.openness == Openness::Curated {
                        t.offers
                            .iter()
                            .flatten()
                            .find(|offer| offer.model == row.model)
                            .map(|offer| offer.native_name.as_str())
                    } else {
                        None
                    };
                    native_name(t, m, curated)
                }
                _ => fallback.to_string(),
            });
        let via = row.via.clone().or_else(|| prev.and_then(|o| o.via.clone()));
        let efforts = row
            .efforts
            .clone()
            .or_else(|| prev.and_then(|o| o.efforts.clone()));
        let context = row
            .context
            .clone()
            .or_else(|| prev.and_then(|o| o.context.clone()));
        by_key.insert(
            key,
            Offering {
                tool: row.tool.clone(),
                model: row.model.clone(),
                native_name: name,
                via,
                efforts,
                context,
                source: row.source.clone(),
                observed_at: row.observed_at.clone(),
            },
        );
    }
    by_key.into_values().collect()
}
