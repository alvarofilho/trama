use std::path::{Path, PathBuf};

#[derive(Clone)]
pub(super) struct Executable {
    pub program: PathBuf,
    pub prefix: Vec<String>,
    pub source: String,
}

impl Executable {
    pub fn display_path(&self) -> String {
        self.prefix
            .first()
            .cloned()
            .unwrap_or_else(|| self.program.to_string_lossy().into_owned())
    }
}

fn npm_entry(id: &str) -> Option<&'static str> {
    match id {
        "codex" => Some("@openai/codex/bin/codex.js"),
        "claude" => Some("@anthropic-ai/claude-code/cli.js"),
        "gemini" => Some("@google/gemini-cli/dist/index.js"),
        "opencode" => Some("opencode-ai/bin/opencode"),
        _ => None,
    }
}

pub(super) fn from_file(id: &str, path: &Path, source: &str) -> Option<Executable> {
    if !path.is_absolute() || !path.is_file() {
        return None;
    }
    let name = path.file_name()?.to_string_lossy().to_lowercase();
    if name == format!("{id}.exe") || (!cfg!(windows) && name == id) {
        return Some(Executable {
            program: path.to_owned(),
            prefix: vec![],
            source: source.into(),
        });
    }
    if cfg!(windows) && [format!("{id}.cmd"), format!("{id}.ps1")].contains(&name) {
        let script = path.parent()?.join("node_modules").join(npm_entry(id)?);
        if script.is_file() {
            let node = resolve("node")?;
            return Some(Executable {
                program: node.program,
                prefix: vec![script.to_string_lossy().into_owned()],
                source: source.into(),
            });
        }
    }
    None
}

fn from_dir(id: &str, dir: &Path, source: &str) -> Option<Executable> {
    let names = if cfg!(windows) {
        vec![
            format!("{id}.exe"),
            format!("{id}.cmd"),
            format!("{id}.ps1"),
        ]
    } else {
        vec![id.into()]
    };
    names
        .iter()
        .find_map(|name| from_file(id, &dir.join(name), source))
}

// Search only PATH and known user installation roots, never the repository or cwd.
pub(super) fn resolve(id: &str) -> Option<Executable> {
    if let Some(paths) = std::env::var_os("PATH") {
        if let Some(exe) = std::env::split_paths(&paths)
            .filter(|p| p.is_absolute())
            .find_map(|dir| from_dir(id, &dir, "PATH"))
        {
            return Some(exe);
        }
    }
    let home =
        std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from);
    let mut roots = Vec::new();
    if let Some(home) = home {
        roots.extend([
            home.join(".local/bin"),
            home.join(".cargo/bin"),
            home.join("scoop/shims"),
        ]);
    }
    if let Some(roaming) = std::env::var_os("APPDATA").map(PathBuf::from) {
        roots.extend([roaming.join("npm"), roaming.join("fnm/aliases/default")]);
    }
    if let Some(local) = std::env::var_os("LOCALAPPDATA").map(PathBuf::from) {
        roots.extend([
            local.join("Microsoft/WinGet/Links"),
            local.join("Programs/nodejs"),
        ]);
        if id == "codex" || id == "node" {
            let bin = local.join("OpenAI/Codex/bin");
            let mut versions: Vec<_> = std::fs::read_dir(&bin)
                .ok()
                .into_iter()
                .flatten()
                .filter_map(Result::ok)
                .map(|entry| entry.path())
                .filter(|path| path.is_dir() && path.join(format!("{id}.exe")).is_file())
                .collect();
            versions.sort_by_key(|path| {
                std::cmp::Reverse(
                    std::fs::metadata(path.join(format!("{id}.exe")))
                        .and_then(|m| m.modified())
                        .ok(),
                )
            });
            for directory in versions {
                if let Some(exe) = from_dir(id, &directory, "Aplicativo Codex") {
                    return Some(exe);
                }
            }
            if let Some(exe) = from_dir(id, &bin, "Aplicativo Codex") {
                return Some(exe);
            }
        }
    }
    if let Some(programs) = std::env::var_os("ProgramFiles").map(PathBuf::from) {
        roots.push(programs.join("nodejs"));
    }
    roots
        .iter()
        .find_map(|dir| from_dir(id, dir, "Instalação do usuário"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn configured_path_rejects_shell_commands_and_wrong_agent() {
        assert!(from_file("codex", Path::new("codex --login"), "manual").is_none());
        assert!(from_file("codex", Path::new("C:/Windows/System32/cmd.exe"), "manual").is_none());
    }
}
