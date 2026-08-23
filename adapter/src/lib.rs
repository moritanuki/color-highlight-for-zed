use std::{env, fs};

use zed_extension_api::{self as zed, Result};

const LANGUAGE_SERVER_ID: &str = "color-highlight-for-zed";
const SERVER_SOURCE: &str = include_str!("../../server/color-highlight-server.cjs");
const SOURCE_FINGERPRINT: &str = match option_env!("COLOR_HIGHLIGHT_SOURCE_FINGERPRINT") {
    Some(fingerprint) => fingerprint,
    None => "development",
};

struct ColorHighlightExtension;

impl ColorHighlightExtension {
    fn install_server() -> Result<String> {
        let server_filename = format!("color-highlight-server-{SOURCE_FINGERPRINT}.cjs");
        let server_path = env::current_dir()
            .map_err(|error| format!("failed to locate the extension work directory: {error}"))?
            .join(server_filename);

        let is_current = fs::read_to_string(&server_path)
            .map(|contents| contents == SERVER_SOURCE)
            .unwrap_or(false);

        if !is_current {
            fs::write(&server_path, SERVER_SOURCE).map_err(|error| {
                format!("failed to install the embedded language server: {error}")
            })?;
        }

        Ok(server_path.to_string_lossy().into_owned())
    }
}

impl zed::Extension for ColorHighlightExtension {
    fn new() -> Self {
        Self
    }

    fn language_server_command(
        &mut self,
        language_server_id: &zed::LanguageServerId,
        _worktree: &zed::Worktree,
    ) -> Result<zed::Command> {
        if language_server_id.as_ref() != LANGUAGE_SERVER_ID {
            return Err(format!(
                "unsupported language server: {language_server_id:?}"
            ));
        }

        Ok(zed::Command {
            command: zed::node_binary_path()?,
            args: vec![Self::install_server()?],
            env: Default::default(),
        })
    }
}

zed::register_extension!(ColorHighlightExtension);
