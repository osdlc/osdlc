//! The `lines` reader: one finding per matching line.

use regex::Regex;

use crate::Error;
use crate::model::{Finding, Level, Options, Report};
use crate::path::Locator;

/// `path:line: message` or `path:line:col: message`. The optional drive
/// prefix lets a Windows path such as `C:\src\a.rs:12: msg` keep its colon.
const DEFAULT_PATTERN: &str =
    r"^(?P<path>(?:[A-Za-z]:[\\/])?[^:]+?):(?P<line>\d+)(?::(?P<col>\d+))?:\s*(?P<message>.*)$";

/// The rule given to a finding whose pattern has no `rule` group.
const DEFAULT_RULE: &str = "lines";

pub(crate) fn read_lines(input: &str, options: &Options) -> Result<Report, Error> {
    let pattern = options.pattern.as_deref().unwrap_or(DEFAULT_PATTERN);
    let re = Regex::new(pattern).map_err(|e| Error::Lines {
        message: e.to_string(),
    })?;
    if !re.capture_names().flatten().any(|name| name == "message") {
        return Err(Error::Lines {
            message: "no `message` group".to_owned(),
        });
    }

    let locator = Locator::new(options.paths_from.as_deref());
    let mut report = Report::default();
    for line in input.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let Some(caps) = re.captures(line) else {
            report.unmatched.push(line.to_owned());
            continue;
        };
        let group = |name: &str| caps.name(name).map(|m| m.as_str());
        report.findings.push(Finding {
            rule: group("rule")
                .filter(|rule| !rule.is_empty())
                .unwrap_or(DEFAULT_RULE)
                .to_owned(),
            level: group("level").map_or(Level::Error, |word| level_of(word, options)),
            message: group("message").unwrap_or_default().trim().to_owned(),
            path: locator.path(group("path")),
            line: Locator::line(group("line").and_then(|n| n.parse().ok())),
            col: Locator::col(group("col").and_then(|n| n.parse().ok())),
            end_line: None,
            fingerprint: None,
        });
    }
    Ok(report)
}

/// The configured mapping first (exact word, then lowercased), then common
/// level words; anything else is an error, the strictest reading.
fn level_of(word: &str, options: &Options) -> Level {
    let lower = word.to_lowercase();
    if let Some(&level) = options
        .levels
        .get(word)
        .or_else(|| options.levels.get(&lower))
    {
        return level;
    }
    match lower.as_str() {
        "note" | "info" | "information" | "notice" | "hint" | "style" | "refactor" => Level::Note,
        "warning" | "warn" | "caution" => Level::Warning,
        _ => Level::Error,
    }
}
