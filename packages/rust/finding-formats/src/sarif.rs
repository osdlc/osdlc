//! The SARIF 2.1.0 reader: the subset of `runs[].results[]` a finding needs.
//!
//! The types below declare only the fields read; serde ignores the rest.

use std::collections::{BTreeMap, HashMap};

use serde::Deserialize;
use serde_json::Number;

use crate::Error;
use crate::model::{Fact, Finding, Level, Options, Report};
use crate::path::Locator;

/// The rule given to a result that names none.
const DEFAULT_RULE: &str = "sarif";

#[derive(Deserialize)]
struct Document {
    /// Absent or `null` is no runs. The schema allows `null`; a missing `runs`
    /// is tolerated.
    runs: Option<Vec<Run>>,
}

#[derive(Deserialize)]
struct Run {
    tool: Option<Tool>,
    results: Option<Vec<SarifResult>>,
}

#[derive(Deserialize)]
struct Tool {
    driver: Option<Driver>,
}

#[derive(Deserialize)]
struct Driver {
    rules: Option<Vec<Rule>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Rule {
    id: Option<String>,
    default_configuration: Option<Configuration>,
}

#[derive(Deserialize)]
struct Configuration {
    level: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SarifResult {
    rule_id: Option<String>,
    /// Any number `serde_json` can hold, so one that is no index (the spec's
    /// -1, a float, one too large) costs the result its index and not the
    /// document its findings.
    rule_index: Option<Number>,
    rule: Option<RuleRef>,
    level: Option<String>,
    message: Option<Message>,
    locations: Option<Vec<Location>>,
    partial_fingerprints: Option<BTreeMap<String, String>>,
    fingerprints: Option<BTreeMap<String, String>>,
}

#[derive(Deserialize)]
struct RuleRef {
    id: Option<String>,
    /// Read like `ruleIndex`.
    index: Option<Number>,
}

#[derive(Deserialize)]
struct Message {
    text: Option<String>,
    markdown: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Location {
    physical_location: Option<Physical>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Physical {
    artifact_location: Option<Artifact>,
    region: Option<Region>,
}

#[derive(Deserialize)]
struct Artifact {
    uri: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Region {
    /// Any number `serde_json` can hold, so one that no line can be costs the
    /// result its line and not the document its findings.
    start_line: Option<Number>,
    /// A `Number` for the same reason as `start_line`.
    start_column: Option<Number>,
    end_line: Option<Number>,
}

/// A run's rule definitions, found by position or by id.
struct Rules<'a> {
    list: &'a [Rule],
    /// The first definition of each id.
    by_id: HashMap<&'a str, &'a Rule>,
}

impl<'a> Rules<'a> {
    fn new(list: &'a [Rule]) -> Self {
        let mut by_id = HashMap::new();
        for rule in list {
            if let Some(id) = rule.id.as_deref() {
                by_id.entry(id).or_insert(rule);
            }
        }
        Self { list, by_id }
    }

    /// The definition at the first of `indexes` that has one, else the one
    /// named `id`.
    ///
    /// An index that names no definition is the same as an absent one: the
    /// next index is tried, then the id.
    fn find(&self, indexes: [Option<usize>; 2], id: Option<&str>) -> Option<&'a Rule> {
        indexes
            .into_iter()
            .flatten()
            .find_map(|i| self.list.get(i))
            .or_else(|| self.by_id.get(id?).copied())
    }
}

pub(crate) fn read_sarif(input: &str, options: &Options) -> Result<Report, Error> {
    let doc: Document = serde_json::from_str(input).map_err(|e| Error::Sarif {
        line: e.line(),
        column: e.column(),
        message: e.to_string(),
    })?;

    let locator = Locator::new(options.paths_from.as_deref());
    let mut report = Report::default();
    for run in doc.runs.unwrap_or_default() {
        let rules = run
            .tool
            .and_then(|t| t.driver)
            .and_then(|d| d.rules)
            .unwrap_or_default();
        let rules = Rules::new(&rules);
        for result in run.results.unwrap_or_default() {
            report.findings.push(finding_of(result, &rules, &locator));
        }
    }

    let count = |level| report.findings.iter().filter(|f| f.level == level).count();
    let facts = [
        ("results", report.findings.len()),
        ("results_error", count(Level::Error)),
        ("results_warning", count(Level::Warning)),
        ("results_note", count(Level::Note)),
    ];
    for (name, n) in facts {
        let n = i64::try_from(n).unwrap_or(i64::MAX);
        report.facts.set(name, Fact::Int(n));
    }
    Ok(report)
}

fn finding_of(result: SarifResult, rules: &Rules<'_>, locator: &Locator) -> Finding {
    let (ref_id, ref_index) = result.rule.map_or((None, None), |r| (r.id, r.index));
    // `ruleId` and `rule.id` name the same rule; either is the result's id.
    let id = result.rule_id.or(ref_id);

    // The definition only supplies a level or an id the result leaves out,
    // so a result that gives both never looks it up.
    let definition = if result.level.is_none() || id.is_none() {
        // `ruleIndex` and `rule.index` name the same position; either finds it.
        let indexes = [result.rule_index, ref_index].map(|n| index_of(n.as_ref()));
        rules.find(indexes, id.as_deref())
    } else {
        None
    };

    // SARIF 3.27.10: an absent level is the rule's default, else "warning".
    // "none" means no severity, which the model's lowest level stands for.
    let level = result
        .level
        .as_deref()
        .or_else(|| {
            definition
                .and_then(|r| r.default_configuration.as_ref())
                .and_then(|c| c.level.as_deref())
        })
        .map_or(Level::Warning, |word| match word {
            "error" => Level::Error,
            "note" | "none" => Level::Note,
            _ => Level::Warning,
        });

    let rule = id
        .or_else(|| definition.and_then(|r| r.id.clone()))
        .unwrap_or_else(|| DEFAULT_RULE.to_owned());

    let physical = result
        .locations
        .as_deref()
        .and_then(<[Location]>::first)
        .and_then(|l| l.physical_location.as_ref());
    let uri = physical
        .and_then(|p| p.artifact_location.as_ref())
        .and_then(|a| a.uri.as_deref());
    let region = physical.and_then(|p| p.region.as_ref());

    Finding {
        rule,
        level,
        message: result
            .message
            .and_then(|m| m.text.or(m.markdown))
            .unwrap_or_default(),
        path: locator.path(uri.map(|uri| uri.strip_prefix("file://").unwrap_or(uri))),
        line: line_of(region.and_then(|r| r.start_line.as_ref())),
        col: col_of(region.and_then(|r| r.start_column.as_ref())),
        end_line: line_of(region.and_then(|r| r.end_line.as_ref())),
        fingerprint: [result.partial_fingerprints, result.fingerprints]
            .into_iter()
            .flatten()
            .find_map(|map| map.into_values().next()),
    }
}

/// A position in a run's rules: none unless the number is written as a
/// non-negative integer, with no fraction or exponent, and fits.
fn index_of(index: Option<&Number>) -> Option<usize> {
    usize::try_from(index?.as_u64()?).ok()
}

/// A region's line as a finding's: none unless the number is written as an
/// integer, with no fraction or exponent, is at least 1, and fits.
fn line_of(line: Option<&Number>) -> Option<u32> {
    Locator::line(u32::try_from(line?.as_u64()?).ok())
}

/// A region's column as a finding's, under the same rules as [`line_of`].
fn col_of(col: Option<&Number>) -> Option<u32> {
    Locator::col(u32::try_from(col?.as_u64()?).ok())
}
