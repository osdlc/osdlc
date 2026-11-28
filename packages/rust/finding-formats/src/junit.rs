//! The JUnit reader: one finding per `<failure>` or `<error>` in a `<testcase>`.

use std::borrow::Cow;

use quick_xml::Reader;
use quick_xml::escape::resolve_xml_entity;
use quick_xml::events::{BytesStart, Event};

use crate::Error;
use crate::model::{Fact, Finding, Level, Options, Report};
use crate::path::Locator;

/// A `<failure>` or `<error>` being read.
struct Problem {
    message: Option<String>,
    /// `type` attribute, the fallback message.
    kind: Option<String>,
    /// Element text, entities resolved.
    text: String,
    is_error: bool,
}

impl Problem {
    /// Appends what `event` adds to the element text; most events add none.
    fn append(&mut self, event: &Event<'_>) -> Result<(), String> {
        match event {
            Event::Text(t) => self.text.push_str(&t.decode().map_err(|e| e.to_string())?),
            Event::CData(t) => self.text.push_str(&t.decode().map_err(|e| e.to_string())?),
            Event::GeneralRef(r) => {
                let name = r.decode().map_err(|e| e.to_string())?;
                // Not `resolve_predefined_entity`: it reads HTML entities too
                // if any crate in the build turns on quick-xml's `escape-html`.
                if let Some(c) = r.resolve_char_ref().map_err(|e| e.to_string())? {
                    self.text.push(c);
                } else if let Some(text) = resolve_xml_entity(&name) {
                    self.text.push_str(text);
                } else {
                    // Any other entity is kept as written, even one a DTD declares.
                    self.text.push('&');
                    self.text.push_str(&name);
                    self.text.push(';');
                }
            }
            _ => {}
        }
        Ok(())
    }

    fn message(self) -> String {
        let fallback = if self.is_error {
            "test errored"
        } else {
            "test failed"
        };
        self.message
            .filter(|m| !m.trim().is_empty())
            .or_else(|| {
                self.text
                    .lines()
                    .map(str::trim)
                    .find(|l| !l.is_empty())
                    .map(str::to_owned)
            })
            .or(self.kind.filter(|k| !k.is_empty()))
            .unwrap_or_else(|| fallback.to_owned())
    }
}

/// A `<testcase>` being read.
struct Case<'a> {
    /// Rule, path and line are read from it only if a problem turns up.
    start: BytesStart<'a>,
    problems: Vec<Problem>,
}

#[derive(Default)]
struct State<'a> {
    report: Report,
    /// Open elements.
    depth: usize,
    seen_element: bool,
    tests: i64,
    failures: i64,
    errors: i64,
    skipped: i64,
    /// Sum of the test cases' `time`; `None` until one has a time.
    case_time: Option<f64>,
    /// The root element's `time`.
    root_time: Option<f64>,
    case: Option<Case<'a>>,
    problem: Option<Problem>,
}

impl<'a> State<'a> {
    fn open(&mut self, start: BytesStart<'a>) -> Result<(), String> {
        self.seen_element = true;
        match start.local_name().as_ref() {
            b"testsuites" | b"testsuite" if self.depth == 0 => {
                let [time] = attributes(&start, ["time"])?;
                self.root_time = seconds(time);
            }
            b"testcase" => {
                let [time] = attributes(&start, ["time"])?;
                self.tests += 1;
                if let Some(time) = seconds(time) {
                    *self.case_time.get_or_insert(0.0) += time;
                }
                self.case = Some(Case {
                    start,
                    problems: Vec::new(),
                });
            }
            b"failure" | b"error" if self.case.is_some() => {
                let [message, kind] = attributes(&start, ["message", "type"])?;
                self.problem = Some(Problem {
                    message: message.map(Cow::into_owned),
                    kind: kind.map(Cow::into_owned),
                    text: String::new(),
                    is_error: start.local_name().as_ref() == b"error",
                });
            }
            name => {
                // A malformed attribute is an error even here.
                attributes(&start, [])?;
                if name == b"skipped" && self.case.is_some() {
                    self.skipped += 1;
                }
            }
        }
        self.depth += 1;
        Ok(())
    }

    /// A closed problem joins its case; a closed case becomes findings.
    fn close(&mut self, name: &[u8], locator: &Locator) -> Result<(), String> {
        self.depth = self.depth.saturating_sub(1);
        match name {
            b"failure" | b"error" => {
                if let (Some(problem), Some(case)) = (self.problem.take(), self.case.as_mut()) {
                    case.problems.push(problem);
                }
            }
            b"testcase" => {
                let Some(case) = self.case.take().filter(|c| !c.problems.is_empty()) else {
                    return Ok(());
                };
                // The tag was checked when it opened, so this does not fail.
                let [class, name, file, line] =
                    attributes(&case.start, ["classname", "name", "file", "line"])?;
                let name = name.unwrap_or_default();
                let rule = match class.filter(|c| !c.is_empty()) {
                    Some(class) => format!("{class}.{name}"),
                    None => name.into_owned(),
                };
                let path = locator.path(file.as_deref());
                let line = Locator::line(line.and_then(|n| n.trim().parse().ok()));
                for problem in case.problems {
                    if problem.is_error {
                        self.errors += 1;
                    } else {
                        self.failures += 1;
                    }
                    self.report.findings.push(Finding {
                        rule: rule.clone(),
                        level: Level::Error,
                        message: problem.message(),
                        path: path.clone(),
                        line,
                        col: None,
                        end_line: None,
                        fingerprint: None,
                    });
                }
            }
            _ => {}
        }
        Ok(())
    }

    fn finish(mut self) -> Report {
        let facts = &mut self.report.facts;
        facts.set("tests", Fact::Int(self.tests));
        facts.set("failures", Fact::Int(self.failures));
        facts.set("errors", Fact::Int(self.errors));
        facts.set("skipped", Fact::Int(self.skipped));
        if let Some(time) = self.case_time.or(self.root_time) {
            facts.set("time", Fact::Float(time));
        }
        self.report
    }
}

pub(crate) fn read_junit(input: &str, options: &Options) -> Result<Report, Error> {
    let mut reader = Reader::from_str(input);
    // `<x/>` reads as `<x></x>`: every element has one start and one end.
    reader.config_mut().expand_empty_elements = true;
    let fail = |reader: &Reader<&[u8]>, message: String| {
        let at = usize::try_from(reader.buffer_position()).unwrap_or(input.len());
        let before = &input[..at.min(input.len())];
        Error::Junit {
            line: before.matches('\n').count() + 1,
            column: before.rsplit('\n').next().map_or(0, |l| l.chars().count()) + 1,
            message,
        }
    };

    let locator = Locator::new(options.paths_from.as_deref());
    let mut state = State::default();
    loop {
        let event = reader
            .read_event()
            .map_err(|e| fail(&reader, e.to_string()))?;
        match event {
            Event::Start(start) => state.open(start),
            Event::End(end) => state.close(end.local_name().as_ref(), &locator),
            Event::Eof => break,
            event => match &mut state.problem {
                Some(problem) => problem.append(&event),
                None => Ok(()),
            },
        }
        .map_err(|message| fail(&reader, message))?;
    }
    if !state.seen_element {
        return Err(fail(&reader, "no root element".to_owned()));
    }
    if state.depth != 0 {
        return Err(fail(&reader, "unexpected end of document".to_owned()));
    }
    Ok(state.finish())
}

/// The values of the attributes named `wanted`, by local name; the first
/// wins where a name repeats under different prefixes. Every attribute is
/// checked, so a malformed one fails whatever the caller asks for.
fn attributes<'e, const N: usize>(
    start: &'e BytesStart<'_>,
    wanted: [&str; N],
) -> Result<[Option<Cow<'e, str>>; N], String> {
    let mut found = [const { None }; N];
    for attribute in start.attributes() {
        let attribute = attribute.map_err(|e| e.to_string())?;
        let value = attribute
            .normalized_value(quick_xml::XmlVersion::Implicit1_0)
            .map_err(|e| e.to_string())?;
        let name = attribute.key.local_name();
        let slot = wanted.iter().position(|w| w.as_bytes() == name.as_ref());
        if let Some(slot) = slot.filter(|&i| found[i].is_none()) {
            found[slot] = Some(value);
        }
    }
    Ok(found)
}

/// A `time` attribute as seconds, if it is a number.
fn seconds(time: Option<Cow<'_, str>>) -> Option<f64> {
    time.and_then(|t| t.trim().parse().ok())
}
