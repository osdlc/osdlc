//! The lcov reader: line, branch and function totals per record.

use crate::Error;
use crate::model::{Fact, Report};

/// Found and hit counts for lines, branches or functions.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Totals {
    /// How many were instrumented.
    pub found: u64,
    /// How many were executed.
    pub hit: u64,
}

impl Totals {
    /// Hit as a percentage of found, rounded to two decimals; `None` when
    /// nothing was found.
    #[must_use]
    pub fn percent(self) -> Option<f64> {
        (self.found > 0).then(|| (self.hit as f64 * 10_000.0 / self.found as f64).round() / 100.0)
    }

    fn add(self, other: Self) -> Self {
        Self {
            found: self.found + other.found,
            hit: self.hit + other.hit,
        }
    }
}

/// Coverage of one `SF:` (or `KF:`) record.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileCoverage {
    /// The source file, as the tracefile gives it.
    pub path: String,
    /// Line totals: `LF`/`LH`, else counted from `DA` lines.
    pub lines: Totals,
    /// Branch totals: `BRF`/`BRH`, else counted from `BRDA`; `None` when the
    /// record has neither `BRF` nor `BRDA`.
    pub branches: Option<Totals>,
    /// Function totals: `FNF`/`FNH`, else counted from `FN`/`FNDA`; `None`
    /// when the record has neither `FNF` nor `FN`.
    pub functions: Option<Totals>,
}

/// A parsed tracefile.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct LcovReport {
    /// One entry per `SF:` or `KF:` record, in input order, never merged.
    pub files: Vec<FileCoverage>,
}

impl LcovReport {
    /// Line totals over every file.
    #[must_use]
    pub fn lines(&self) -> Totals {
        self.files
            .iter()
            .fold(Totals::default(), |t, f| t.add(f.lines))
    }

    /// Branch totals over files with branch data; `None` if none have any.
    #[must_use]
    pub fn branches(&self) -> Option<Totals> {
        self.files
            .iter()
            .filter_map(|f| f.branches)
            .reduce(Totals::add)
    }

    /// Function totals over files with function data; `None` if none have any.
    #[must_use]
    pub fn functions(&self) -> Option<Totals> {
        self.files
            .iter()
            .filter_map(|f| f.functions)
            .reduce(Totals::add)
    }

    /// The overall facts, no findings: `files`, and `<kind>_found`, `_hit` and, when found is
    /// nonzero, `_percent` for `lines` and for `branches` and `functions` where present.
    #[must_use]
    pub fn to_report(&self) -> Report {
        let mut report = Report::default();
        report
            .facts
            .set("files", Fact::Int(to_i64(self.files.len() as u64)));
        let kinds = [
            ("lines", Some(self.lines())),
            ("branches", self.branches()),
            ("functions", self.functions()),
        ];
        for (kind, totals) in kinds {
            let Some(totals) = totals else { continue };
            report
                .facts
                .set(format!("{kind}_found"), Fact::Int(to_i64(totals.found)));
            report
                .facts
                .set(format!("{kind}_hit"), Fact::Int(to_i64(totals.hit)));
            if let Some(percent) = totals.percent() {
                report
                    .facts
                    .set(format!("{kind}_percent"), Fact::Float(percent));
            }
        }
        report
    }
}

fn to_i64(n: u64) -> i64 {
    i64::try_from(n).unwrap_or(i64::MAX)
}

/// One kind of count (lines, branches or functions) while a record is read.
#[derive(Default)]
struct Tally {
    /// Counted from the data records (`DA`, `BRDA`, `FN`/`FNDA`).
    counted: Totals,
    /// The record's own summary (`LF`, `BRF`, `FNF`).
    found: Option<u64>,
    /// The record's own summary (`LH`, `BRH`, `FNH`).
    hit: Option<u64>,
}

impl Tally {
    /// The record's summary where it gives one, else what was counted.
    fn totals(&self) -> Totals {
        Totals {
            found: self.found.unwrap_or(self.counted.found),
            hit: self.hit.unwrap_or(self.counted.hit),
        }
    }

    /// [`totals`](Self::totals), or `None` when the record has no found
    /// summary and counted no entry of this kind.
    fn totals_if_present(&self) -> Option<Totals> {
        (self.found.is_some() || self.counted.found > 0).then(|| self.totals())
    }
}

/// One record while it is read.
#[derive(Default)]
struct Pending {
    path: String,
    lines: Tally,
    branches: Tally,
    functions: Tally,
}

impl Pending {
    fn finish(self) -> FileCoverage {
        FileCoverage {
            lines: self.lines.totals(),
            branches: self.branches.totals_if_present(),
            functions: self.functions.totals_if_present(),
            path: self.path,
        }
    }
}

/// Parses an lcov tracefile.
///
/// Reads `SF`, `DA`, `LF`, `LH`, `BRDA`, `BRF`, `BRH`, `FN`, `FNDA`, `FNF`,
/// `FNH` and `end_of_record`; other records (`TN`, `VER`, ...) are ignored.
/// `KF` is read as `SF`, the synonym upstream lcov accepts. Blank lines and
/// `#` comments are skipped. A record left open at the end is kept.
///
/// # Errors
///
/// [`Error::Lcov`] for a malformed `DA` or `BRDA`, a count or summary that is
/// not a number (`BRDA`'s `-` aside), a negative summary, a data record with
/// no `SF:` open, or a line that is neither a record nor a comment.
pub fn read_lcov(input: &str) -> Result<LcovReport, Error> {
    let mut files = Vec::new();
    let mut current: Option<Pending> = None;

    for (index, raw) in input.lines().enumerate() {
        let line_no = index + 1;
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let bad = |message: String| Error::Lcov {
            line: line_no,
            message,
        };
        if line == "end_of_record" {
            files.extend(current.take().map(Pending::finish));
            continue;
        }
        let Some((key, value)) = line.split_once(':') else {
            return Err(bad(format!("not a record: `{line}`")));
        };
        if matches!(key, "SF" | "KF") {
            files.extend(current.take().map(Pending::finish));
            current = Some(Pending {
                path: value.to_owned(),
                ..Pending::default()
            });
            continue;
        }
        // Other records are skipped before the open-record check, so they
        // may appear anywhere.
        if !matches!(
            key,
            "DA" | "LF" | "LH" | "BRDA" | "BRF" | "BRH" | "FN" | "FNDA" | "FNF" | "FNH"
        ) {
            continue;
        }
        let Some(p) = current.as_mut() else {
            return Err(bad(format!("`{key}` before any `SF`")));
        };
        let number = |s: &str| {
            s.trim()
                .parse::<i64>()
                .map_err(|_| bad(format!("`{key}` expects a number, found `{s}`")))
        };
        let summary = || {
            u64::try_from(number(value)?)
                .map(Some)
                .map_err(|_| bad(format!("`{key}` is negative")))
        };
        let mut fields = value.split(',');
        match key {
            "DA" => {
                let (Some(line), Some(count)) = (fields.next(), fields.next()) else {
                    return Err(bad("`DA` expects `line,count`".to_owned()));
                };
                number(line)?;
                p.lines.counted.found += 1;
                p.lines.counted.hit += u64::from(number(count)? > 0);
            }
            "BRDA" => {
                let (Some(taken), None) = (fields.nth(3), fields.next()) else {
                    return Err(bad("`BRDA` expects `line,block,branch,taken`".to_owned()));
                };
                p.branches.counted.found += 1;
                // `-` means the block never ran, so the branch was not taken.
                if taken.trim() != "-" {
                    p.branches.counted.hit += u64::from(number(taken)? > 0);
                }
            }
            "FN" => p.functions.counted.found += 1,
            "FNDA" => {
                let count = fields.next().unwrap_or_default();
                p.functions.counted.hit += u64::from(number(count)? > 0);
            }
            "LF" => p.lines.found = summary()?,
            "LH" => p.lines.hit = summary()?,
            "BRF" => p.branches.found = summary()?,
            "BRH" => p.branches.hit = summary()?,
            "FNF" => p.functions.found = summary()?,
            "FNH" => p.functions.hit = summary()?,
            _ => {}
        }
    }
    files.extend(current.map(Pending::finish));
    Ok(LcovReport { files })
}
