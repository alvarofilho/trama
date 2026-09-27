use serde::Serialize;
use std::{
    path::{Path, PathBuf},
    process::Command,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryInspection {
    pub name: String,
    pub path: String,
    pub branch: String,
}

pub fn inspect(path: &str) -> Result<RepositoryInspection, String> {
    let selected = PathBuf::from(path);
    if !selected.is_dir() {
        return Err("A pasta selecionada não existe ou não está acessível.".into());
    }

    let selected = selected
        .canonicalize()
        .map_err(|_| "Não foi possível acessar a pasta selecionada.".to_string())?;
    let root = git_output(&selected, &["rev-parse", "--show-toplevel"])?;
    let root = PathBuf::from(root.trim())
        .canonicalize()
        .map_err(|_| "O Git retornou um caminho de repositório inválido.".to_string())?;
    let branch = git_output(&root, &["branch", "--show-current"])?;
    let branch = if branch.trim().is_empty() {
        "HEAD detached".to_string()
    } else {
        branch.trim().to_string()
    };
    let name = root
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("Repositório")
        .to_string();

    Ok(RepositoryInspection {
        name,
        path: root.to_string_lossy().into_owned(),
        branch,
    })
}

fn git_output(directory: &Path, arguments: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(directory)
        .args(arguments)
        .output()
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                "Git não foi encontrado. Instale o Git e tente novamente.".to_string()
            } else {
                format!("Não foi possível iniciar o Git: {error}")
            }
        })?;

    if !output.status.success() {
        return Err("A pasta escolhida não pertence a um repositório Git válido.".into());
    }

    String::from_utf8(output.stdout)
        .map_err(|_| "O Git retornou uma resposta em formato inválido.".to_string())
}
