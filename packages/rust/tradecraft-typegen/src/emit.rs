//! Turning the parsed model into TypeScript.
//!
//! The emit is a pure function of the parsed model — no formatter runs over
//! it, and no third-party tool sits in the path. That is deliberate: the drift
//! gate compares the committed file byte for byte, so a formatter in the emit
//! path makes the gate report a formatter upgrade as a surface change.
//!
//! # Direction decides optionality
//!
//! A request is DESERIALIZED, so a field serde can default is one the caller
//! may omit — `mode?: PublishMode`. A response is SERIALIZED, so an
//! `Option<T>` is on the wire as `null` unless the field carries
//! `skip_serializing_if` — `reason: string | null`, but `not_published?:
//! string`. A type reached in both directions would need two spellings, so it
//! is refused rather than emitted under one of them.

use std::collections::BTreeMap;

use crate::parse::{Enum, Export, Field, Model, SerdeAttrs, Struct, TypeDef, path_parts};

/// An emit failure, as the sentence the binary prints.
pub type Error = String;

/// Which way a type crosses the boundary.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Direction {
    /// Deserialized from the caller. Anything serde defaults is optional.
    Request,
    /// Serialized to the caller. Only a skipped field is optional.
    Response,
}

impl Direction {
    fn label(self) -> &'static str {
        match self {
            Self::Request => "a request",
            Self::Response => "a response",
        }
    }
}

/// The whole generated file.
pub fn emit(model: &Model) -> Result<String, Error> {
    let mut walk = Walk {
        model,
        order: Vec::new(),
        seen: BTreeMap::new(),
    };

    for export in &model.exports {
        if let Some(request) = &export.request {
            walk.visit(request, Direction::Request)?;
        }
        // A response resolved off a core constant (`knownTargets`) names a
        // Rust primitive, not a struct or enum this generator emits a
        // declaration for — `ts_name_or_primitive` inlines it at the call
        // site instead, so there is nothing here to walk.
        if let Some((response, _)) = &export.response
            && !is_builtin(response)
        {
            walk.visit(response, Direction::Response)?;
        }
    }

    let mut out = String::new();
    out.push_str(HEADER);

    for (rust_name, direction) in walk.order.clone() {
        let def = &model.types[&rust_name];
        out.push('\n');
        match def {
            TypeDef::Struct(s) => out.push_str(&emit_struct(model, s, direction)?),
            TypeDef::Enum(e) => out.push_str(&emit_enum(model, e)?),
        }
    }

    out.push('\n');
    out.push_str(&emit_enrolment(model)?);
    Ok(out)
}

const HEADER: &str = "\
/**
 * GENERATED FILE — do not edit. Run `cargo run -p tradecraft-typegen`.
 *
 * The request and response types of every `#[wasm_bindgen]` export in
 * `tradecraft-wasm/src/lib.rs`, read out of the Rust source that defines
 * them. The wire is a JSON string in and a JSON string out, so nothing in
 * TypeScript checks its shape; this file is what makes the compiler check it.
 * `cargo test -p tradecraft-typegen` fails when this file is stale, so a Rust
 * type that moves without its TypeScript fails the pull request.
 *
 * Optionality follows the direction. A request field serde can default is
 * optional here; a response field is `| null` unless the Rust side skips it
 * when empty.
 *
 * Doc comments are the Rust ones, verbatim, so there is one description of
 * each field rather than two that can disagree.
 */
";

/// The depth-first walk that decides what gets emitted, and in what order.
struct Walk<'a> {
    model: &'a Model,
    /// Emission order: the type, then everything it reaches.
    order: Vec<(String, Direction)>,
    seen: BTreeMap<String, Direction>,
}

impl Walk<'_> {
    fn visit(&mut self, rust_name: &str, direction: Direction) -> Result<(), Error> {
        if let Some(previous) = self.seen.get(rust_name) {
            let def = &self.model.types[rust_name];
            if *previous != direction && matches!(def, TypeDef::Struct(_)) {
                return Err(format!(
                    "`{rust_name}` is reached as {} and as {}. Optionality differs by \
                     direction, so one TypeScript interface cannot describe both. Split \
                     the Rust type, or give the two uses separate types.",
                    previous.label(),
                    direction.label()
                ));
            }
            return Ok(());
        }

        let Some(def) = self.model.types.get(rust_name) else {
            return Err(format!(
                "`{rust_name}` crosses the wasm boundary but is not a public type of \
                 tradecraft-core or a wire struct of tradecraft-wasm, so there is \
                 nothing to emit for it."
            ));
        };
        if let Some(reason) = unsupported(def) {
            return Err(format!(
                "`{rust_name}` crosses the wasm boundary, and {reason}"
            ));
        }
        self.seen.insert(rust_name.to_string(), direction);
        self.order.push((rust_name.to_string(), direction));

        let mut deps = Vec::new();
        match def {
            TypeDef::Struct(s) => self.struct_deps(s, &mut deps)?,
            TypeDef::Enum(e) => {
                for variant in &e.variants {
                    for field in variant.fields.iter().flatten() {
                        collect_named(self.model, &field.ty, &mut deps)?;
                    }
                }
            }
        }
        for dep in deps {
            self.visit(&dep, direction)?;
        }
        Ok(())
    }

    /// A flattened struct contributes its fields, not itself: the wire has one
    /// object, so TypeScript has one interface. A flattened tagged enum is a
    /// dependency instead, because it is emitted as its own union and
    /// intersected in.
    fn struct_deps(&self, s: &Struct, deps: &mut Vec<String>) -> Result<(), Error> {
        for field in &s.fields {
            if field.attrs.flatten {
                match flattened(self.model, field)? {
                    Flattened::Struct(inner) => self.struct_deps(inner, deps)?,
                    Flattened::Enum(e) => {
                        if !deps.contains(&e.name) {
                            deps.push(e.name.clone());
                        }
                    }
                }
            } else {
                collect_named(self.model, &field.ty, deps)?;
            }
        }
        Ok(())
    }
}

/// Why a type has no shape this generator emits, when it has none.
fn unsupported(def: &TypeDef) -> Option<String> {
    match def {
        TypeDef::Struct(s) => s.unsupported.clone(),
        TypeDef::Enum(e) => e.variants.iter().find_map(|v| v.unsupported.clone()),
    }
}

/// What a `#[serde(flatten)]` field splices in.
enum Flattened<'a> {
    /// Fields spliced inline, into the one object.
    Struct(&'a Struct),
    /// An internally tagged enum. Its arms differ, so there is no single field
    /// list to splice; the outer type becomes an intersection with it.
    Enum(&'a Enum),
}

/// What a `#[serde(flatten)]` field splices in, resolved against the model.
fn flattened<'a>(model: &'a Model, field: &Field) -> Result<Flattened<'a>, Error> {
    let (name, _) = path_parts(&field.ty)
        .ok_or_else(|| format!("the flattened field `{}` is not a named type", field.name))?;
    match model.types.get(&name) {
        Some(TypeDef::Struct(s)) => Ok(Flattened::Struct(s)),
        Some(TypeDef::Enum(e))
            if e.attrs.tag.is_some() && e.variants.iter().any(|v| v.fields.is_some()) =>
        {
            Ok(Flattened::Enum(e))
        }
        Some(TypeDef::Enum(_)) => Err(format!(
            "the flattened field `{}` names `{name}`, an enum with no data variants \
             under a `#[serde(tag = \"...\")]`. Only an internally tagged enum with a \
             payload has an object shape to splice into this one.",
            field.name
        )),
        _ => Err(format!(
            "the flattened field `{}` names `{name}`, which is not a struct or tagged \
             enum this generator can read.",
            field.name
        )),
    }
}

/// The tagged enums a struct splices in, directly or through a flattened
/// struct, in the order they are reached.
fn flattened_enums(model: &Model, s: &Struct, out: &mut Vec<String>) -> Result<(), Error> {
    for field in s.fields.iter().filter(|f| f.attrs.flatten) {
        match flattened(model, field)? {
            Flattened::Struct(inner) => flattened_enums(model, inner, out)?,
            Flattened::Enum(e) => {
                if !out.contains(&e.name) {
                    out.push(e.name.clone());
                }
            }
        }
    }
    Ok(())
}

/// The named types a Rust type reaches, in declaration order.
fn collect_named(model: &Model, ty: &syn::Type, out: &mut Vec<String>) -> Result<(), Error> {
    let ty = deref(ty);
    let Some((head, args)) = path_parts(ty) else {
        return Ok(());
    };
    if is_builtin(&head) {
        for arg in &args {
            collect_named(model, arg, out)?;
        }
        return Ok(());
    }
    if model.types.contains_key(&head) && !out.contains(&head) {
        out.push(head);
    }
    Ok(())
}

fn deref(ty: &syn::Type) -> &syn::Type {
    match ty {
        syn::Type::Reference(r) => deref(&r.elem),
        other => other,
    }
}

/// Types the generator maps to a TypeScript primitive rather than emitting.
fn is_builtin(name: &str) -> bool {
    matches!(
        name,
        "Option"
            | "Vec"
            | "BTreeMap"
            | "HashMap"
            | "BTreeSet"
            | "HashSet"
            | "String"
            | "str"
            | "PathBuf"
            | "Path"
            | "bool"
            | "Value"
            | "u8"
            | "u16"
            | "u32"
            | "u64"
            | "usize"
            | "i8"
            | "i16"
            | "i32"
            | "i64"
            | "isize"
            | "f32"
            | "f64"
    )
}

/// One Rust type as its TypeScript spelling. `Option` is peeled by the caller.
fn ts_type(model: &Model, ty: &syn::Type) -> Result<String, Error> {
    let ty = deref(ty);
    let (head, args) =
        path_parts(ty).ok_or_else(|| format!("`{}` is not a named type", quoted(ty)))?;
    let arg = |i: usize| -> Result<String, Error> {
        let a = args
            .get(i)
            .ok_or_else(|| format!("`{head}` is missing a type argument"))?;
        ts_type(model, a)
    };
    Ok(match head.as_str() {
        "String" | "str" | "PathBuf" | "Path" => "string".to_string(),
        "bool" => "boolean".to_string(),
        "Value" => "unknown".to_string(),
        "Option" => arg(0)?,
        "Vec" | "BTreeSet" | "HashSet" => format!("{}[]", arg(0)?),
        "BTreeMap" | "HashMap" => format!("Record<{}, {}>", arg(0)?, arg(1)?),
        _ if is_builtin(&head) => "number".to_string(),
        _ => ts_name(model, &head)?,
    })
}

/// The TypeScript name of a Rust type.
///
/// A wire wrapper is named for the struct it flattens — `WireExportRequest`
/// splices `ExportRequest` and one extra key, and the wire it describes IS an
/// export request. A wrapper that flattens nothing loses a leading `Wire`.
/// Both rules are mechanical, so a sixth export needs no entry anywhere.
fn ts_name(model: &Model, rust_name: &str) -> Result<String, Error> {
    let Some(TypeDef::Struct(s)) = model.types.get(rust_name) else {
        return Ok(rust_name.to_string());
    };
    let bare = || {
        rust_name
            .strip_prefix("Wire")
            .unwrap_or(rust_name)
            .to_string()
    };
    let spliced: Vec<_> = s.fields.iter().filter(|f| f.attrs.flatten).collect();
    match spliced.len() {
        0 => Ok(bare()),
        1 => match flattened(model, spliced[0])? {
            Flattened::Struct(inner) => Ok(inner.name.clone()),
            // An intersection arm, not a rename: the outer type is the whole
            // object and keeps its own name.
            Flattened::Enum(_) => Ok(bare()),
        },
        n => Err(format!(
            "`{rust_name}` flattens {n} types. One object on the wire needs one \
             name, and this generator cannot pick between them."
        )),
    }
}

/// A response's element name, as `ts_name` for anything the model defines and
/// as `ts_type`'s primitive spelling for anything it does not — a response
/// resolved off a core constant (`knownTargets` -> `KNOWN_TARGETS: &[&str]`)
/// names a Rust primitive rather than a struct or enum, and `ts_name` alone
/// would hand that back unlowered (`String`, not `string`).
fn ts_name_or_primitive(model: &Model, rust_name: &str) -> Result<String, Error> {
    Ok(match rust_name {
        "String" | "str" | "PathBuf" | "Path" => "string".to_string(),
        "bool" => "boolean".to_string(),
        "Value" => "unknown".to_string(),
        _ if is_builtin(rust_name) => "number".to_string(),
        _ => ts_name(model, rust_name)?,
    })
}

fn quoted(ty: &syn::Type) -> String {
    use quote::ToTokens;
    ty.to_token_stream().to_string()
}

/// A struct as one interface, or — when it flattens a tagged enum — as an
/// intersection of its own object with that enum's union, which is the only
/// TypeScript that describes a wire object whose remaining keys depend on a
/// tag.
fn emit_struct(model: &Model, s: &Struct, direction: Direction) -> Result<String, Error> {
    let mut arms = Vec::new();
    flattened_enums(model, s, &mut arms)?;

    let mut body = String::new();
    let mut no_fields = true;
    emit_fields(model, s, direction, &mut body, &mut no_fields)?;

    let name = ts_name(model, &s.name)?;
    let mut out = doc_block(&s.docs, 0);
    if arms.is_empty() {
        out.push_str(&format!("export interface {name} {{\n{body}}}\n"));
    } else if no_fields {
        out.push_str(&format!("export type {name} = {};\n", arms.join(" & ")));
    } else {
        out.push_str(&format!(
            "export type {name} = {{\n{body}}} & {};\n",
            arms.join(" & ")
        ));
    }
    Ok(out)
}

fn emit_fields(
    model: &Model,
    s: &Struct,
    direction: Direction,
    out: &mut String,
    first: &mut bool,
) -> Result<(), Error> {
    for field in &s.fields {
        if field.attrs.flatten {
            match flattened(model, field)? {
                Flattened::Struct(inner) => emit_fields(model, inner, direction, out, first)?,
                // `emit_struct` intersects it in beside this object.
                Flattened::Enum(_) => {}
            }
            continue;
        }
        if !*first {
            out.push('\n');
        }
        *first = false;
        out.push_str(&doc_block(&field.docs, 2));
        out.push_str(&format!(
            "  {}\n",
            field_line(model, field, &s.attrs, direction)?
        ));
    }
    Ok(())
}

/// `name: type;`, `name?: type;` or `name: type | null;`.
fn field_line(
    model: &Model,
    field: &Field,
    container: &SerdeAttrs,
    direction: Direction,
) -> Result<String, Error> {
    let name = wire_name(&field.name, &field.attrs, container);
    let ts = ts_type(model, &field.ty)?;
    let optional = is_option(&field.ty);
    let defaulted = field.attrs.default || container.default;

    let spelled = match direction {
        // Absent is legal for anything serde can default, and every `Option`
        // field the core deserializes carries `#[serde(default)]`.
        Direction::Request if optional || defaulted => format!("{name}?: {ts}"),
        Direction::Request => format!("{name}: {ts}"),
        // Skipped when empty, so the reader must handle its absence.
        Direction::Response if field.attrs.skip_serializing_if => format!("{name}?: {ts}"),
        // `unknown` already admits null; `unknown | null` says nothing more.
        Direction::Response if optional && ts != "unknown" => format!("{name}: {ts} | null"),
        Direction::Response => format!("{name}: {ts}"),
    };
    Ok(format!("{spelled};"))
}

fn is_option(ty: &syn::Type) -> bool {
    path_parts(deref(ty)).is_some_and(|(head, _)| head == "Option")
}

fn emit_enum(model: &Model, e: &Enum) -> Result<String, Error> {
    let unit_only = e.variants.iter().all(|v| v.fields.is_none());
    if unit_only {
        let mut out = doc_block(&e.docs, 0);
        let arms: Vec<_> = e
            .variants
            .iter()
            .map(|v| format!("\"{}\"", wire_name(&v.name, &v.attrs, &e.attrs)))
            .collect();
        out.push_str(&format!("export type {} = {};\n", e.name, arms.join(" | ")));
        return Ok(out);
    }

    let Some(tag) = &e.attrs.tag else {
        return Err(format!(
            "`{}` has data variants and no `#[serde(tag = \"...\")]`. serde's default \
             externally tagged shape is not one this generator emits; tag it \
             internally, as `ExportUnit` is.",
            e.name
        ));
    };

    // An enum's `rename_all` renames its VARIANTS; only `rename_all_fields`
    // reaches the fields inside them. Feeding the former to a field turned
    // `version_bump_suggestion` into `version-bump-suggestion`, which the
    // core never writes and TypeScript cannot even parse unquoted.
    let field_container = SerdeAttrs {
        rename_all: e.attrs.rename_all_fields.clone(),
        ..SerdeAttrs::default()
    };

    let mut out = doc_block(&e.docs, 0);
    out.push_str(&format!("export type {} =\n", e.name));
    for variant in &e.variants {
        let Some(fields) = &variant.fields else {
            return Err(format!(
                "`{}::{}` is a unit variant beside data variants. An internally tagged \
                 enum mixing the two is not a shape this generator emits.",
                e.name, variant.name
            ));
        };
        out.push_str(&doc_block(&variant.docs, 2));
        out.push_str("  | {\n");
        out.push_str(&format!(
            "      {tag}: \"{}\";\n",
            wire_name(&variant.name, &variant.attrs, &e.attrs)
        ));
        for field in fields {
            out.push_str(&doc_block(&field.docs, 6));
            // A variant's own fields are its payload — they are always on the
            // wire, so direction cannot change how they are spelled.
            out.push_str(&format!(
                "      {}: {};\n",
                wire_name(&field.name, &field.attrs, &field_container),
                ts_type_in_variant(model, field)?
            ));
        }
        out.push_str("    }\n");
    }
    // The trailing `;` closes the union, which the last arm's `}` did not.
    let trimmed = out.trim_end().to_string();
    Ok(format!("{trimmed};\n"))
}

/// A variant field's TypeScript.
///
/// The same mapping every other field gets — a variant that carried a
/// `Vec<T>` or a map would otherwise be spelled as though it were a number.
/// A variant's payload is always on the wire, so nothing here is optional,
/// but an `Option<T>` still serializes as `null` and is spelled that way.
fn ts_type_in_variant(model: &Model, field: &Field) -> Result<String, Error> {
    let ts = ts_type(model, &field.ty)?;
    if is_option(&field.ty) && ts != "unknown" {
        return Ok(format!("{ts} | null"));
    }
    Ok(ts)
}

/// A name as it appears on the wire, after `rename` and `rename_all`.
fn wire_name(name: &str, own: &SerdeAttrs, container: &SerdeAttrs) -> String {
    if let Some(rename) = &own.rename {
        return rename.clone();
    }
    match container.rename_all.as_deref() {
        Some("lowercase") => name.to_lowercase(),
        Some("UPPERCASE") => name.to_uppercase(),
        Some("kebab-case") => split_words(name).join("-"),
        Some("snake_case") => split_words(name).join("_"),
        Some("camelCase") => {
            let words = split_words(name);
            let mut out = words[0].clone();
            for word in &words[1..] {
                out.push_str(&capitalize(word));
            }
            out
        }
        _ => name.to_string(),
    }
}

/// `NotCarried` -> `["not", "carried"]`; `skills_root` -> `["skills", "root"]`.
fn split_words(name: &str) -> Vec<String> {
    let mut words = Vec::new();
    let mut current = String::new();
    for ch in name.chars() {
        if ch == '_' || ch == '-' {
            if !current.is_empty() {
                words.push(std::mem::take(&mut current));
            }
        } else if ch.is_uppercase() && !current.is_empty() {
            words.push(std::mem::take(&mut current));
            current.push(ch.to_ascii_lowercase());
        } else {
            current.push(ch.to_ascii_lowercase());
        }
    }
    if !current.is_empty() {
        words.push(current);
    }
    words
}

fn capitalize(word: &str) -> String {
    let mut chars = word.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

/// The Rust doc lines as a TSDoc block at `indent` spaces, or nothing.
fn doc_block(docs: &[String], indent: usize) -> String {
    if docs.is_empty() {
        return String::new();
    }
    let pad = " ".repeat(indent);
    // `*/` inside a doc would end the block early. The core has none today;
    // this keeps a future one from emitting a file that will not parse.
    let escape = |line: &str| line.replace("*/", "*\\/");
    if docs.len() == 1 && docs[0].len() + indent + 7 <= 100 {
        return format!("{pad}/** {} */\n", escape(&docs[0]));
    }
    let mut out = format!("{pad}/**\n");
    for line in docs {
        if line.trim().is_empty() {
            out.push_str(&format!("{pad} *\n"));
        } else {
            out.push_str(&format!("{pad} * {}\n", escape(line)));
        }
    }
    out.push_str(&format!("{pad} */\n"));
    out
}

/// The record of which export carries which shape.
///
/// This is the part that makes enrolment automatic: an export added to the
/// wrapper lands in one of these three declarations without anyone registering
/// it, and the drift gate then sees the new line.
fn emit_enrolment(model: &Model) -> Result<String, Error> {
    let mut out = String::new();
    out.push_str(
        "/**\n * The request each export deserializes, by the name JavaScript calls it.\n */\n",
    );
    out.push_str("export interface WasmRequests {\n");
    for export in &model.exports {
        if let Some(request) = &export.request {
            out.push_str(&format!(
                "  {}: {};\n",
                export.js_name,
                ts_name(model, request)?
            ));
        }
    }
    out.push_str("}\n\n");

    out.push_str("/**\n * The report each export serializes back.\n */\n");
    out.push_str("export interface WasmResponses {\n");
    for export in &model.exports {
        if let Some((response, is_list)) = &export.response {
            let ts = ts_name_or_primitive(model, response)?;
            let ts = if *is_list { format!("{ts}[]") } else { ts };
            out.push_str(&format!("  {}: {ts};\n", export.js_name));
        }
    }
    out.push_str("}\n\n");

    let bare: Vec<_> = model
        .exports
        .iter()
        .filter(|e| e.request.is_none() && e.response.is_none())
        .map(|e| format!("\"{}\"", e.js_name))
        .collect();
    out.push_str(
        "/**\n * Exports with no JSON on either side, so nothing here can drift for them.\n \
         * `validateNamespace(stem: string): void` is the whole signature.\n */\n",
    );
    out.push_str(&format!(
        "export type WasmExportsWithoutJson = {};\n",
        if bare.is_empty() {
            "never".to_string()
        } else {
            bare.join(" | ")
        }
    ));
    Ok(out)
}

/// The exports, for the summary the binary prints.
pub fn summary(model: &Model) -> Vec<String> {
    model
        .exports
        .iter()
        .map(|export: &Export| {
            let request = export.request.as_deref().unwrap_or("—");
            let response = export
                .response
                .as_ref()
                .map(|(name, list)| {
                    if *list {
                        format!("{name}[]")
                    } else {
                        name.clone()
                    }
                })
                .unwrap_or_else(|| "—".to_string());
            format!("{}: {request} -> {response}", export.js_name)
        })
        .collect()
}
