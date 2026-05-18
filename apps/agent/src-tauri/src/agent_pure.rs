//! Vision output parsing — pure logic, heavily unit-tested. Used by `agent::capture_context_snapshot` path.

/// Full pipeline: structured description + resolved category label.
pub(crate) fn parse_analysis(raw: &str) -> (String, String) {
    let lower = raw.to_lowercase();

    let category = extract_category_from_field(&lower)
        .unwrap_or_else(|| infer_category_from_content(&lower));

    let description = build_structured_description(raw);

    (description, category)
}

/// Strip to a single lowercase alnum token so "Code Review", "code_review", "CodeReview" → `codereview`.
fn normalize_category_value(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(|c| c.to_lowercase())
        .collect()
}

/// Extract category from an explicit "CATEGORY: Xyz" line in the model output.
/// The value may be multi-word (e.g. "Code Review"); we normalize instead of taking only the first word.
fn extract_category_from_field(lower: &str) -> Option<String> {
    const MAP: &[(&str, &str)] = &[
        ("coding", "Coding"),
        ("debugging", "Debugging"),
        ("codereview", "CodeReview"),
        ("testing", "Testing"),
        ("documentation", "Documentation"),
        ("design", "Design"),
        ("planning", "Planning"),
        ("meeting", "Meeting"),
        ("communication", "Communication"),
        ("research", "Research"),
        ("learning", "Learning"),
        ("devops", "DevOps"),
        ("database", "Database"),
        ("sales", "Sales"),
        ("admin", "Admin"),
        ("browsing", "Browsing"),
        ("idle", "Idle"),
        ("general", "General"),
    ];

    let idx = lower.rfind("category:")?;
    let after = lower[idx + "category:".len()..].trim_start();
    let first_line = after.lines().next()?.trim();
    if first_line.is_empty() {
        return None;
    }
    let norm = normalize_category_value(first_line);
    for (key, label) in MAP {
        if norm == *key {
            return Some((*label).to_string());
        }
    }
    None
}

/// Fallback: infer category from keywords in the full content.
fn infer_category_from_content(lower: &str) -> String {
    if lower.contains("debugger") || lower.contains("breakpoint") {
        "Debugging"
    } else if lower.contains("pull request")
        || lower.contains("reviewing code")
        || lower.contains("code review")
    {
        "CodeReview"
    } else if lower.contains("running tests")
        || lower.contains("test results")
        || lower.contains("test suite")
    {
        "Testing"
    } else if lower.contains("microsoft excel")
        || lower.contains("google sheets")
        || lower.contains("libreoffice calc")
        || lower.contains("spreadsheet")
        || lower.contains(".xlsx")
        || lower.contains(".xls")
    {
        // Spreadsheets are often miscategorized as "Coding" when the prompt mentions a generic "editor".
        "Admin"
    } else if lower.contains("writing code")
        || lower.contains("visual studio code")
        || lower.contains("vs code")
        || lower.contains("vscode")
        || lower.contains("intellij")
        || lower.contains("pycharm")
        || lower.contains("webstorm")
        || lower.contains("rider")
        || lower.contains("xcode")
        || lower.contains("android studio")
        || lower.contains("neovim")
    {
        "Coding"
    } else if lower.contains("writing docs") || lower.contains("readme") {
        "Documentation"
    } else if lower.contains("figma") || lower.contains("sketch") || lower.contains("design tool") {
        "Design"
    } else if lower.contains("jira") || lower.contains("trello") || lower.contains("backlog") {
        "Planning"
    } else if lower.contains("zoom")
        || lower.contains("google meet")
        || lower.contains("teams meeting")
    {
        "Meeting"
    } else if lower.contains("slack") || lower.contains("discord") || lower.contains("email") {
        "Communication"
    } else if lower.contains("stackoverflow")
        || lower.contains("searching")
        || lower.contains("google search")
    {
        "Research"
    } else if lower.contains("tutorial") || lower.contains("course") || lower.contains("learning") {
        "Learning"
    } else if lower.contains("docker")
        || lower.contains("kubernetes")
        || lower.contains("pipeline")
        || lower.contains("ci/cd")
    {
        "DevOps"
    } else if lower.contains("sql") || lower.contains("database") || lower.contains("supabase") {
        "Database"
    } else if lower.contains("crm") || lower.contains("hubspot") {
        "Sales"
    } else if lower.contains("settings") || lower.contains("configuration") {
        "Admin"
    } else if lower.contains("browser")
        || lower.contains("chrome")
        || lower.contains("firefox")
        || lower.contains("linkedin")
        || lower.contains("github.com")
    {
        "Browsing"
    } else if lower.contains("idle") || lower.contains("no activity") || lower.contains("lock screen") {
        "Idle"
    } else {
        "General"
    }
    .to_string()
}

fn build_structured_description(raw: &str) -> String {
    let fields = [
        "APP:",
        "WINDOW TITLE:",
        "VISIBLE CONTENT:",
        "FILES OR URLS:",
        "CURRENT ACTION:",
        "PROGRESS:",
        "NEXT STEP:",
        "CATEGORY:",
    ];

    let mut parts: Vec<String> = Vec::new();

    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        if trimmed.to_uppercase().starts_with("CATEGORY:") {
            continue;
        }

        let clean = trimmed
            .replace("###", "")
            .replace("##", "")
            .replace("**", "")
            .replace("####", "");
        let clean = clean.trim();
        if clean.is_empty() {
            continue;
        }

        let is_field = fields
            .iter()
            .any(|f| clean.to_uppercase().starts_with(f));
        if is_field {
            parts.push(clean.to_string());
        } else {
            parts.push(clean.to_string());
        }
    }

    if parts.is_empty() {
        return "No analysis available".to_string();
    }

    parts.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_prefers_explicit_category_field() {
        let raw = "APP: X\nCATEGORY: debugging\n";
        let (_desc, cat) = parse_analysis(raw);
        assert_eq!(cat, "Debugging");
    }

    #[test]
    fn parse_category_field_accepts_multiword_code_review() {
        let raw = "APP: Gh\nCATEGORY: Code Review\n";
        let (_desc, cat) = parse_analysis(raw);
        assert_eq!(cat, "CodeReview");
    }

    #[test]
    fn parse_infers_debugging() {
        let raw = "VISIBLE: using the debugger and a breakpoint";
        let (_d, c) = parse_analysis(raw);
        assert_eq!(c, "Debugging");
    }

    #[test]
    fn parse_infers_each_major_bucket() {
        let cases = [
            ("code review here", "CodeReview"),
            ("test suite green", "Testing"),
            ("writing code in editor", "Coding"),
            ("excel spreadsheet open", "Admin"),
            ("readme writing docs", "Documentation"),
            ("figma open", "Design"),
            ("jira board", "Planning"),
            ("zoom call", "Meeting"),
            ("slack message", "Communication"),
            ("stackoverflow page", "Research"),
            ("tutorial course", "Learning"),
            ("docker pipeline", "DevOps"),
            ("sql database supabase", "Database"),
            ("crm hubspot", "Sales"),
            ("settings configuration", "Admin"),
            ("chrome browser linkedin", "Browsing"),
            ("idle lock screen", "Idle"),
        ];
        for (text, expected) in cases {
            let (_, c) = parse_analysis(text);
            assert_eq!(c, expected, "text={text:?}");
        }
    }

    #[test]
    fn parse_generic_editor_word_not_auto_coding() {
        let raw = "VISIBLE: drafting text in a generic editor window";
        let (_, c) = parse_analysis(raw);
        assert_ne!(c, "Coding");
    }

    #[test]
    fn structured_description_strips_category_line() {
        let raw = "APP: VS\nCATEGORY: Coding\nVISIBLE: ok";
        let (d, _) = parse_analysis(raw);
        assert!(!d.to_uppercase().contains("CATEGORY:"));
        assert!(d.contains("APP:"));
    }

    #[test]
    fn empty_lines_yield_no_analysis_available() {
        let (d, c) = parse_analysis("   \n  \n");
        assert_eq!(d, "No analysis available");
        assert_eq!(c, "General");
    }

    #[test]
    fn category_field_maps_general_token() {
        let (_, c) = parse_analysis("noise\nCATEGORY: general\n");
        assert_eq!(c, "General");
    }

    #[test]
    fn markdown_stripped_in_description() {
        let raw = "### APP: Test\n**VISIBLE**: x";
        let (d, _) = parse_analysis(raw);
        assert!(!d.contains("###"));
        assert!(!d.contains("**"));
    }
}
