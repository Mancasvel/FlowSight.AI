//! Supabase URL / anon key from environment (testable with `temp-env`).

pub(crate) fn supabase_url() -> String {
    std::env::var("VITE_SUPABASE_URL")
        .unwrap_or_else(|_| "https://dzpyrdxelcgfpmcdojvb.supabase.co".to_string())
}

pub(crate) fn supabase_anon_key() -> String {
    std::env::var("VITE_SUPABASE_PUBLIC_KEY").unwrap_or_else(|_| {
        "sb_publishable_Ky02yQS5HHpkmrN1DE2yaw_EwENlsPZ".to_string()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn respects_env_overrides() {
        temp_env::with_vars(
            [
                ("VITE_SUPABASE_URL", Some("https://custom.supabase.co")),
                ("VITE_SUPABASE_PUBLIC_KEY", Some("pk-test")),
            ],
            || {
                assert_eq!(supabase_url(), "https://custom.supabase.co");
                assert_eq!(supabase_anon_key(), "pk-test");
            },
        );
    }

    #[test]
    fn defaults_when_supabase_env_unset() {
        temp_env::with_vars(
            [
                ("VITE_SUPABASE_URL", None::<&str>),
                ("VITE_SUPABASE_PUBLIC_KEY", None::<&str>),
            ],
            || {
                assert!(supabase_url().contains("dzpyrdxelcgfpmcdojvb"));
                assert!(supabase_anon_key().starts_with("sb_publishable_"));
            },
        );
    }
}
