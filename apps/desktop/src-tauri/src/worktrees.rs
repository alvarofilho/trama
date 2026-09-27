use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedWorkspace {
    pub branch: String,
    pub worktree_path: String,
}

#[tauri::command]
pub fn create_task_worktree(
    app: AppHandle,
    repo_path: String,
    project_id: String,
    task_id: String,
    title: String,
    base_branch: String,
) -> Result<CreatedWorkspace, String> {
    validate_id(&project_id)?;
    validate_id(&task_id)?;

    let repository = PathBuf::from(&repo_path)
        .canonicalize()
        .map_err(|_| "O repositório salvo não está mais acessível.".to_string())?;
    let root = git_output(&repository, &["rev-parse", "--show-toplevel"])?;
    let root = PathBuf::from(root.trim())
        .canonicalize()
        .map_err(|_| "O Git retornou um caminho de repositório inválido.".to_string())?;

    let base = if base_branch == "HEAD detached" {
        "HEAD".to_string()
    } else {
        git_output(&root, &["check-ref-format", "--branch", &base_branch])?;
        format!("refs/heads/{}", base_branch.trim())
    };

    let branch = task_branch(&task_id, &title);
    git_output(&root, &["check-ref-format", "--branch", &branch])?;

    let data_directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Não foi possível localizar os dados do Trama: {error}"))?;
    let worktree = data_directory
        .join("worktrees")
        .join(&project_id)
        .join(&task_id);
    if worktree.exists() {
        return Err("Já existe um worktree para esta tarefa.".into());
    }
    if let Some(parent) = worktree.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Não foi possível preparar a pasta do worktree: {error}"))?;
    }

    let worktree_text = worktree.to_string_lossy().into_owned();
    git_output(
        &root,
        &["worktree", "add", "-b", &branch, &worktree_text, &base],
    )?;

    Ok(CreatedWorkspace {
        branch,
        worktree_path: worktree_text,
    })
}

fn validate_id(value: &str) -> Result<(), String> {
    let valid = value.len() == 36
        && value.bytes().enumerate().all(|(index, byte)| {
            if [8, 13, 18, 23].contains(&index) {
                byte == b'-'
            } else {
                byte.is_ascii_hexdigit()
            }
        });
    if valid {
        Ok(())
    } else {
        Err("O identificador da tarefa ou do projeto é inválido.".into())
    }
}

fn task_branch(task_id: &str, title: &str) -> String {
    let mut slug = String::new();
    for character in title.chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character.to_ascii_lowercase());
        } else if !slug.is_empty() && !slug.ends_with('-') {
            slug.push('-');
        }
        if slug.len() >= 32 {
            break;
        }
    }
    let slug = slug.trim_matches('-');
    let slug = if slug.is_empty() { "tarefa" } else { slug };
    format!("agent/{}-{}", &task_id[..8], slug)
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
    let response = String::from_utf8_lossy(if output.status.success() {
        &output.stdout
    } else {
        &output.stderr
    })
    .trim()
    .to_string();
    if output.status.success() {
        Ok(response)
    } else {
        Err(if response.is_empty() {
            "O Git não conseguiu criar o worktree desta tarefa.".into()
        } else {
            response
        })
    }
}
