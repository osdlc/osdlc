//! The findings model: a SARIF subset for findings, and a map of named values for facts.

use std::collections::BTreeMap;
use std::fmt;
use std::str::FromStr;

use serde::{Deserialize, Serialize};

use crate::Error;

/// How serious a finding is (the SARIF `level`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Level {
    /// Informational.
    Note,
    /// Worth fixing; not necessarily wrong.
    Warning,
    /// Wrong.
    Error,
}

/// One problem at one place: a subset of a SARIF result.
///
/// Optional fields are omitted from the JSON when `None`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Finding {
    /// The tool's rule, without any check-name prefix a runner adds.
    pub rule: String,
    /// How serious it is.
    pub level: Level,
    /// What is wrong.
    pub message: String,
    /// The file, with `/` separators.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    /// First line, 1-based.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line: Option<u32>,
    /// The column on `line`, 1-based.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub col: Option<u32>,
    /// Last line, 1-based.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end_line: Option<u32>,
    /// Stable while the code moves, when the tool provides one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fingerprint: Option<String>,
}

/// One measured value: a number, string or boolean.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Fact {
    /// A yes or no.
    Bool(bool),
    /// An integer, such as a count.
    Int(i64),
    /// A real number, such as a percentage or seconds.
    Float(f64),
    /// A word or sentence.
    Text(String),
}

/// What a tool measured: named values.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Facts(BTreeMap<String, Fact>);

impl Facts {
    /// Sets `name` to `value`, replacing any earlier value.
    pub fn set(&mut self, name: impl Into<String>, value: Fact) {
        self.0.insert(name.into(), value);
    }

    /// The fact named `name`, if one was set.
    #[must_use]
    pub fn get(&self, name: &str) -> Option<&Fact> {
        self.0.get(name)
    }

    /// Whether no fact is set.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// Every fact, in name order.
    pub fn iter(&self) -> impl Iterator<Item = (&str, &Fact)> {
        self.0.iter().map(|(name, fact)| (name.as_str(), fact))
    }
}

/// What a reader produced.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Report {
    /// The problems found, in input order.
    #[serde(default)]
    pub findings: Vec<Finding>,
    /// The measurements taken.
    #[serde(default)]
    pub facts: Facts,
    /// `lines` only: non-blank input lines that did not match the pattern,
    /// exposed rather than counted because no findings or facts follow from them.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub unmatched: Vec<String>,
}

/// The tool output formats this crate reads (without
/// `result`, which a runner reads itself).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Format {
    /// One finding per line.
    Lines,
    /// SARIF 2.1.0.
    Sarif,
    /// JUnit XML.
    Junit,
    /// An lcov tracefile.
    Lcov,
}

impl Format {
    /// The format's name as written in a check definition.
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Lines => "lines",
            Self::Sarif => "sarif",
            Self::Junit => "junit",
            Self::Lcov => "lcov",
        }
    }
}

impl fmt::Display for Format {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl FromStr for Format {
    type Err = Error;

    fn from_str(s: &str) -> Result<Self, Error> {
        match s {
            "lines" => Ok(Self::Lines),
            "sarif" => Ok(Self::Sarif),
            "junit" => Ok(Self::Junit),
            "lcov" => Ok(Self::Lcov),
            other => Err(Error::UnknownFormat(other.to_owned())),
        }
    }
}

/// The reader options of a check definition, under its field names.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Options {
    /// `lines`: a regular expression with named groups `path`, `line`, `col`,
    /// `level`, `rule` and `message`. Only `message` is required.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pattern: Option<String>,
    /// `lines`: maps the tool's level words onto ours.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub levels: BTreeMap<String, Level>,
    /// The folder relative finding paths are printed from; they are joined
    /// onto it and normalised, without touching the filesystem.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub paths_from: Option<String>,
}
