use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, VecDeque},
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{Manager, State};

const OUTPUT_LIMIT: usize = 512 * 1024;
const PROVIDERS: [(&str, &str); 4] = [
    ("codex", "Codex"),
    ("claude", "Claude Code"),
    ("opencode", "OpenCode"),
    ("gemini", "Gemini CLI"),
];

mod discovery;
use discovery::{resolve, Executable};

fn probe(executable: &Executable, args: &[&str]) -> Result<(bool, String), String> {
    let mut command = Command::new(&executable.program);
    command
        .args(&executable.prefix)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command.spawn().map_err(|e| e.to_string())?;
    let mut stdout = child.stdout.take().unwrap();
    let mut stderr = child.stderr.take().unwrap();
    // Drain both pipes concurrently; retain only bounded output and never expose auth text.
    let (out_sender, out) = std::sync::mpsc::channel();
    let (err_sender, err) = std::sync::mpsc::channel();
    thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = (&mut stdout).take(65536).read_to_end(&mut bytes);
        let _ = out_sender.send(bytes);
    });
    thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = (&mut stderr).take(65536).read_to_end(&mut bytes);
        let _ = err_sender.send(bytes);
    });
    let deadline = Instant::now() + Duration::from_secs(8);
    loop {
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(status) => {
                let bytes = [
                    out.recv_timeout(deadline.saturating_duration_since(Instant::now()))
                        .map_err(|_| "A verificação de saída excedeu o tempo limite.")?,
                    err.recv_timeout(deadline.saturating_duration_since(Instant::now()))
                        .map_err(|_| "A verificação de saída excedeu o tempo limite.")?,
                ]
                .concat();
                return Ok((
                    status.success(),
                    String::from_utf8_lossy(&bytes).trim().to_string(),
                ));
            }
            None if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("A verificação excedeu 8 segundos.".into());
            }
            None => thread::sleep(Duration::from_millis(50)),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInfo {
    id: String,
    name: String,
    installed: bool,
    version: Option<String>,
    authentication: String,
    detail: String,
    executable_path: Option<String>,
    source: Option<String>,
    configured: bool,
    models: Vec<AgentModel>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentModel {
    id: String,
    name: String,
    description: Option<String>,
    is_default: bool,
    reasoning_efforts: Vec<String>,
}

fn codex_models(executable: &Executable) -> Vec<AgentModel> {
    let mut command = Command::new(&executable.program);
    command
        .args(&executable.prefix)
        .args(["app-server", "--listen", "stdio://"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let Ok(mut child) = command.spawn() else {
        return Vec::new();
    };
    let (Some(mut stdin), Some(stdout)) = (child.stdin.take(), child.stdout.take()) else {
        let _ = child.kill();
        return Vec::new();
    };
    let requests = [
        serde_json::json!({"id": 1, "method": "initialize", "params": {"clientInfo": {"name": "trama", "title": "Trama", "version": env!("CARGO_PKG_VERSION")}}}),
        serde_json::json!({"method": "initialized", "params": {}}),
        serde_json::json!({"id": 2, "method": "model/list", "params": {"limit": 100}}),
    ];
    for request in requests {
        if writeln!(stdin, "{request}").is_err() {
            let _ = child.kill();
            return Vec::new();
        }
    }
    let _ = stdin.flush();
    let (sender, receiver) = std::sync::mpsc::channel();
    thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if sender.send(line).is_err() {
                break;
            }
        }
    });
    let deadline = Instant::now() + Duration::from_secs(8);
    let mut models = Vec::new();
    while Instant::now() < deadline {
        let Ok(line) = receiver.recv_timeout(deadline.saturating_duration_since(Instant::now()))
        else {
            break;
        };
        let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
        if value.get("id").and_then(|id| id.as_u64()) != Some(2) {
            continue;
        }
        if let Some(data) = value
            .pointer("/result/data")
            .and_then(|data| data.as_array())
        {
            models = data
                .iter()
                .filter_map(|model| {
                    let id = model
                        .get("model")
                        .or_else(|| model.get("id"))?
                        .as_str()?
                        .to_string();
                    let name = model
                        .get("displayName")
                        .and_then(|name| name.as_str())
                        .unwrap_or(&id)
                        .to_string();
                    let description = model
                        .get("description")
                        .and_then(|description| description.as_str())
                        .map(str::to_string);
                    let is_default = model
                        .get("isDefault")
                        .and_then(|value| value.as_bool())
                        .unwrap_or(false);
                    let reasoning_efforts = model
                        .get("supportedReasoningEfforts")
                        .and_then(|items| items.as_array())
                        .into_iter()
                        .flatten()
                        .filter_map(|item| {
                            item.get("reasoningEffort")
                                .and_then(|effort| effort.as_str())
                                .map(str::to_string)
                        })
                        .collect();
                    Some(AgentModel {
                        id,
                        name,
                        description,
                        is_default,
                        reasoning_efforts,
                    })
                })
                .collect();
        }
        break;
    }
    let _ = child.kill();
    let _ = child.wait();
    models
}

fn opencode_models(executable: &Executable) -> Vec<AgentModel> {
    let Ok((true, output)) = probe(executable, &["models"]) else {
        return Vec::new();
    };
    output
        .lines()
        .filter_map(|line| {
            let id = line.trim();
            if id.is_empty() || id.chars().any(char::is_whitespace) {
                return None;
            }
            Some(AgentModel {
                id: id.into(),
                name: id.into(),
                description: None,
                is_default: false,
                reasoning_efforts: Vec::new(),
            })
        })
        .collect()
}

fn inspect_agent(id: &str, name: &str, configured: Option<PathBuf>) -> AgentInfo {
    let mut info = AgentInfo {
        id: id.into(),
        name: name.into(),
        installed: false,
        version: None,
        authentication: "unknown".into(),
        detail: "Não encontramos o CLI nas instalações conhecidas. Localize o executável ou instale a ferramenta.".into(),
        executable_path: configured.as_ref().map(|p| p.to_string_lossy().into_owned()),
        source: None,
        configured: configured.is_some(),
        models: Vec::new(),
    };
    let executable = if let Some(path) = configured {
        info.detail = "O caminho salvo não está mais disponível. Localize o CLI novamente ou use a busca automática.".into();
        discovery::from_file(id, &path, "Caminho escolhido")
    } else {
        resolve(id)
    };
    let Some(executable) = executable else {
        return info;
    };
    info.executable_path = Some(executable.display_path());
    info.source = Some(executable.source.clone());
    info.installed = true;
    match probe(&executable, &["--version"]) {
        Ok((true, version)) => info.version = Some(version.chars().take(160).collect()),
        _ => {
            info.detail = "CLI encontrado, mas não respondeu à verificação de versão.".into();
            return info;
        }
    }
    let args: &[&str] = match id {
        "codex" => &["login", "status"],
        "claude" => &["auth", "status"],
        _ => &[],
    };
    if args.is_empty() {
        info.detail = "Autenticação consultada dentro do terminal nativo da ferramenta.".into();
    } else {
        info.authentication = match probe(&executable, args) {
            Ok((true, _)) => "authenticated",
            Ok((false, output))
                if id == "claude"
                    && serde_json::from_str::<serde_json::Value>(&output)
                        .ok()
                        .and_then(|v| v.get("loggedIn").and_then(|v| v.as_bool()))
                        == Some(false) =>
            {
                "unauthenticated"
            }
            Ok((false, output))
                if id == "codex" && output.to_lowercase().contains("not logged in") =>
            {
                "unauthenticated"
            }
            _ => "unknown",
        }
        .into();
        info.detail = match info.authentication.as_str() {
            "authenticated" => {
                "Credenciais reconhecidas pelo CLI; disponibilidade do modelo depende do provedor."
            }
            "unauthenticated" => "Entre usando o login nativo da ferramenta.",
            _ => "Não foi possível confirmar a autenticação. Verifique no terminal.",
        }
        .into();
    }
    info.models = match id {
        "codex" => codex_models(&executable),
        "opencode" => opencode_models(&executable),
        _ => Vec::new(),
    };
    info
}

#[tauri::command]
pub async fn detect_agents(
    manager: State<'_, AgentManager>,
    agent_id: Option<String>,
) -> Result<Vec<AgentInfo>, String> {
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let workers: Vec<_> = PROVIDERS
            .into_iter()
            .filter(|(id, _)| agent_id.as_ref().is_none_or(|selected| selected == id))
            .map(|(id, name)| {
                let path = manager.configured_path(id)?;
                Ok(thread::spawn(move || inspect_agent(id, name, path)))
            })
            .collect::<Result<Vec<_>, String>>()?;
        workers
            .into_iter()
            .map(|w| w.join().map_err(|_| "Falha ao verificar agentes.".into()))
            .collect()
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub id: String,
    pub task_id: Option<String>,
    pub agent_id: String,
    pub purpose: String,
    pub status: String,
    pub started_at: u64,
    pub exit_code: Option<u32>,
    pub error: Option<String>,
}
struct Runtime {
    child: Box<dyn Child + Send + Sync>,
    master: Box<dyn MasterPty + Send>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    stopping: bool,
}
struct Session {
    info: SessionInfo,
    runtime: Option<Runtime>,
    output: VecDeque<u8>,
    offset: u64,
}
struct Inner {
    sessions: HashMap<String, Session>,
    database: Connection,
}
#[derive(Clone)]
pub struct AgentManager(Arc<Mutex<Inner>>);

impl AgentManager {
    fn configured_path(&self, id: &str) -> Result<Option<PathBuf>, String> {
        let inner = self.0.lock().map_err(|e| e.to_string())?;
        inner
            .database
            .query_row(
                "SELECT path FROM agent_paths WHERE agent_id = ?1",
                [id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map(|p| p.map(PathBuf::from))
            .map_err(|e| e.to_string())
    }

    fn executable(&self, id: &str) -> Result<Executable, String> {
        if let Some(path) = self.configured_path(id)? {
            discovery::from_file(id, &path, "Caminho escolhido")
                .ok_or("O executável salvo não está disponível. Localize o CLI em Agentes.".into())
        } else {
            resolve(id).ok_or("CLI não encontrado. Use Localizar CLI na tela Agentes.".into())
        }
    }

    pub fn open(path: &Path) -> Result<Self, String> {
        let database = Connection::open(path).map_err(|e| e.to_string())?;
        database.execute_batch("CREATE TABLE IF NOT EXISTS agent_sessions (id TEXT PRIMARY KEY, metadata TEXT NOT NULL);").map_err(|e| e.to_string())?;
        database.execute_batch("CREATE TABLE IF NOT EXISTS agent_paths (agent_id TEXT PRIMARY KEY, path TEXT NOT NULL);").map_err(|e| e.to_string())?;
        let records: Vec<String> = database
            .prepare("SELECT metadata FROM agent_sessions")
            .map_err(|e| e.to_string())?
            .query_map([], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<_, _>>()
            .map_err(|e| e.to_string())?;
        let mut sessions = HashMap::new();
        for record in records {
            let mut info: SessionInfo = serde_json::from_str(&record).map_err(|e| e.to_string())?;
            if info.status == "running" || info.status == "starting" {
                info.status = "stopped".into();
                info.error = Some("A execução foi interrompida ao fechar o aplicativo; a conversa não foi retomada.".into());
                persist(&database, &info)?;
            }
            sessions.insert(
                info.id.clone(),
                Session {
                    info,
                    runtime: None,
                    output: VecDeque::new(),
                    offset: 0,
                },
            );
        }
        Ok(Self(Arc::new(Mutex::new(Inner { sessions, database }))))
    }

    fn start(
        &self,
        executable: Executable,
        args: Vec<String>,
        cwd: &Path,
        task_id: Option<String>,
        agent_id: String,
        purpose: String,
    ) -> Result<SessionInfo, String> {
        let mut inner = self.0.lock().map_err(|e| e.to_string())?;
        if inner.sessions.values().any(|s| {
            s.runtime.is_some()
                && (task_id.is_some() && s.info.task_id == task_id
                    || s.info.agent_id == agent_id
                        && (task_id.is_none() || s.info.task_id.is_none()))
        }) {
            return Err("Já existe uma sessão ativa para esta tarefa ou autenticação.".into());
        }
        let pair = native_pty_system()
            .openpty(PtySize {
                rows: 28,
                cols: 100,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
        let mut command = CommandBuilder::new(&executable.program);
        command.args(&executable.prefix);
        command.args(args);
        command.cwd(cwd);
        command.env("TERM", "xterm-256color");
        let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
        let mut child = pair
            .slave
            .spawn_command(command)
            .map_err(|e| format!("Não foi possível iniciar o agente: {e}"))?;
        drop(pair.slave);
        let info = SessionInfo {
            id: uuid::Uuid::new_v4().to_string(),
            task_id,
            agent_id,
            purpose,
            status: "running".into(),
            started_at: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
            exit_code: None,
            error: None,
        };
        if let Err(error) = persist(&inner.database, &info) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
        inner.sessions.insert(
            info.id.clone(),
            Session {
                info: info.clone(),
                runtime: Some(Runtime {
                    child,
                    master: pair.master,
                    writer: Arc::new(Mutex::new(writer)),
                    stopping: false,
                }),
                output: VecDeque::new(),
                offset: 0,
            },
        );
        drop(inner);
        let manager = self.clone();
        let id = info.id.clone();
        thread::spawn(move || {
            let mut buffer = [0u8; 8192];
            let mut opening = cfg!(windows);
            let mut initial = Vec::new();
            while let Ok(count) = reader.read(&mut buffer) {
                if count == 0 {
                    break;
                }
                let Ok(mut inner) = manager.0.lock() else {
                    break;
                };
                let Some(session) = inner.sessions.get_mut(&id) else {
                    break;
                };
                // ConPTY asks to inherit the cursor before launching the CLI. Answer once
                // even before a view attaches, and do not replay that query on reattachment.
                if opening {
                    initial.extend_from_slice(&buffer[..count]);
                    if initial.len() < 4 && b"\x1b[6n".starts_with(&initial) {
                        continue;
                    }
                    if initial.starts_with(b"\x1b[6n") {
                        if let Some(runtime) = session.runtime.as_mut() {
                            if let Ok(mut writer) = runtime.writer.lock() {
                                let _ = writer.write_all(b"\x1b[1;1R");
                                let _ = writer.flush();
                            }
                        }
                        initial.drain(..4);
                    }
                    opening = false;
                    append_output(session, &initial);
                    initial.clear();
                    continue;
                }
                append_output(session, &buffer[..count]);
            }
        });
        let manager = self.clone();
        let id = info.id.clone();
        thread::spawn(move || loop {
            thread::sleep(Duration::from_millis(100));
            let Ok(mut inner) = manager.0.lock() else {
                break;
            };
            let Some(session) = inner.sessions.get_mut(&id) else {
                break;
            };
            let Some(runtime) = session.runtime.as_mut() else {
                break;
            };
            let result = runtime.child.try_wait();
            if matches!(result, Ok(None)) {
                continue;
            }
            match result {
                Ok(Some(exit)) => {
                    session.info.exit_code = Some(exit.exit_code());
                    session.info.status = if runtime.stopping {
                        "stopped"
                    } else if exit.success() {
                        "exited"
                    } else {
                        "failed"
                    }
                    .into();
                }
                Err(error) => {
                    let _ = runtime.child.kill();
                    session.info.status = "failed".into();
                    session.info.error = Some(error.to_string());
                }
                _ => unreachable!(),
            }
            let runtime = session.runtime.take();
            let info = session.info.clone();
            if let Err(error) = persist(&inner.database, &info) {
                if let Some(s) = inner.sessions.get_mut(&id) {
                    s.info.error = Some(format!("Falha ao salvar estado: {error}"));
                }
            }
            drop(inner);
            // Closing ConPTY may wait for the reader: never hold the session lock here.
            drop(runtime);
            break;
        });
        Ok(info)
    }

    pub fn shutdown(&self) {
        let mut resources = Vec::new();
        if let Ok(mut inner) = self.0.lock() {
            for session in inner.sessions.values_mut() {
                if let Some(mut runtime) = session.runtime.take() {
                    runtime.stopping = true;
                    let _ = runtime.child.kill();
                    session.info.status = "stopped".into();
                    resources.push(runtime);
                }
            }
            for session in inner.sessions.values() {
                let _ = persist(&inner.database, &session.info);
            }
        }
        // Close pseudo consoles while reader threads can still drain their pipes.
        drop(resources);
    }
}

fn persist(db: &Connection, info: &SessionInfo) -> Result<(), String> {
    db.execute(
        "INSERT OR REPLACE INTO agent_sessions(id, metadata) VALUES (?1, ?2)",
        params![
            info.id,
            serde_json::to_string(info).map_err(|e| e.to_string())?
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
fn append_output(session: &mut Session, bytes: &[u8]) {
    session.output.extend(bytes);
    let excess = session.output.len().saturating_sub(OUTPUT_LIMIT);
    session.output.drain(..excess);
    session.offset += excess as u64;
}

fn arguments(agent: &str, purpose: &str) -> Result<Vec<String>, String> {
    let args: &[&str] = match (agent, purpose) {
        ("codex", "task") => &["--no-alt-screen", "--no-daemon"],
        ("claude" | "opencode" | "gemini", "task") => &[],
        ("codex", "login") => &["login"],
        ("codex", "device-login") => &["login", "--device-auth"],
        ("codex", "logout") => &["logout"],
        ("claude" | "opencode", "login") => &["auth", "login"],
        ("claude" | "opencode", "logout") => &["auth", "logout"],
        ("gemini", "login") => &[],
        _ => return Err("Agente ou operação não suportada.".into()),
    };
    Ok(args.iter().map(|s| s.to_string()).collect())
}

#[tauri::command]
pub async fn start_agent(
    app: tauri::AppHandle,
    manager: State<'_, AgentManager>,
    agent_id: String,
    purpose: String,
    task_id: Option<String>,
    project_id: Option<String>,
    project_path: Option<String>,
    use_worktree: Option<bool>,
    model: Option<String>,
    effort: Option<String>,
) -> Result<SessionInfo, String> {
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut args = arguments(&agent_id, &purpose)?;
        let executable = manager.executable(&agent_id)?;
        if purpose == "task" {
            if let Some(model) = model.filter(|value| !value.trim().is_empty()) {
                let model = model.trim();
                if model.len() > 160 {
                    return Err("O identificador do modelo deve ter até 160 caracteres.".into());
                }
                args.extend(["--model".into(), model.into()]);
            }
            if let Some(effort) = effort {
                let valid = match agent_id.as_str() {
                    "codex" => ["low", "medium", "high", "xhigh"].contains(&effort.as_str()),
                    "opencode" => {
                        ["minimal", "low", "medium", "high", "max"].contains(&effort.as_str())
                    }
                    _ => false,
                };
                if !valid {
                    return Err("O esforço selecionado não é compatível com este agente.".into());
                }
                match agent_id.as_str() {
                    "codex" => {
                        args.extend(["-c".into(), format!("model_reasoning_effort={effort}")])
                    }
                    "opencode" => args.extend(["--variant".into(), effort]),
                    _ => unreachable!(),
                }
            }
        }
        let data = app.path().app_data_dir().map_err(|e| e.to_string())?;
        let cwd = if purpose == "task" {
            let task = task_id.as_deref().ok_or("Selecione uma tarefa.")?;
            let project = project_id.as_deref().ok_or("Selecione um projeto.")?;
            uuid::Uuid::parse_str(task).map_err(|_| "Tarefa inválida.")?;
            uuid::Uuid::parse_str(project).map_err(|_| "Projeto inválido.")?;
            if use_worktree.unwrap_or(false) {
                let worktree_root = data
                    .join("worktrees")
                    .join(project)
                    .join(task)
                    .canonicalize()
                    .map_err(|_| "O worktree da tarefa não está acessível.")?;
                if !worktree_root.join(".git").is_file() {
                    return Err("A tarefa não tem um worktree válido.".into());
                }
                worktree_root
            } else {
                let path = project_path
                    .as_deref()
                    .ok_or("Selecione a pasta do projeto.")?;
                let path = PathBuf::from(path)
                    .canonicalize()
                    .map_err(|_| "A pasta do projeto não está acessível.")?;
                let root = Command::new("git")
                    .arg("-C")
                    .arg(&path)
                    .args(["rev-parse", "--show-toplevel"])
                    .output()
                    .map_err(|e| e.to_string())?;
                if !root.status.success() {
                    return Err("A pasta do projeto não é um repositório Git válido.".into());
                }
                PathBuf::from(String::from_utf8_lossy(&root.stdout).trim())
                    .canonicalize()
                    .map_err(|e| e.to_string())?
            }
        } else {
            if task_id.is_some() {
                return Err("Autenticação não pertence a uma tarefa.".into());
            }
            let cwd = data.join("agent-login");
            std::fs::create_dir_all(&cwd).map_err(|e| e.to_string())?;
            cwd
        };
        // Prompts are sent deliberately through the terminal after native trust/login prompts.
        manager.start(executable, args, &cwd, task_id, agent_id, purpose)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn list_agent_sessions(manager: State<'_, AgentManager>) -> Result<Vec<SessionInfo>, String> {
    let inner = manager.0.lock().map_err(|e| e.to_string())?;
    let mut sessions: Vec<_> = inner.sessions.values().map(|s| s.info.clone()).collect();
    sessions.sort_by_key(|s| std::cmp::Reverse(s.started_at));
    Ok(sessions)
}

#[tauri::command]
pub async fn configure_agent_path(
    manager: State<'_, AgentManager>,
    agent_id: String,
    path: Option<String>,
) -> Result<(), String> {
    if !PROVIDERS.iter().any(|(id, _)| *id == agent_id) {
        return Err("Agente desconhecido.".into());
    }
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(ref path) = path {
            let executable = discovery::from_file(&agent_id, Path::new(path), "Caminho escolhido")
                .ok_or("Escolha o executável deste agente (.exe) ou o launcher npm (.cmd/.ps1) com sua instalação completa.")?;
            if !probe(&executable, &["--version"])?.0 { return Err("O CLI selecionado não respondeu corretamente a --version.".into()); }
        }
        let inner = manager.0.lock().map_err(|e| e.to_string())?;
        if inner.sessions.values().any(|s| s.info.agent_id == agent_id && s.runtime.is_some()) { return Err("Encerre as sessões deste agente antes de trocar o executável.".into()); }
        if let Some(path) = path {
            inner.database.execute("INSERT OR REPLACE INTO agent_paths(agent_id, path) VALUES (?1, ?2)", params![agent_id, path]).map_err(|e| e.to_string())?;
        } else { inner.database.execute("DELETE FROM agent_paths WHERE agent_id = ?1", [agent_id]).map_err(|e| e.to_string())?; }
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutput {
    data: Vec<u8>,
    cursor: u64,
    truncated: bool,
    session: SessionInfo,
}
#[tauri::command]
pub fn read_agent_output(
    manager: State<'_, AgentManager>,
    session_id: String,
    cursor: u64,
) -> Result<TerminalOutput, String> {
    let inner = manager.0.lock().map_err(|e| e.to_string())?;
    let session = inner
        .sessions
        .get(&session_id)
        .ok_or("Sessão não encontrada.")?;
    let start = cursor
        .saturating_sub(session.offset)
        .min(session.output.len() as u64) as usize;
    Ok(TerminalOutput {
        data: session.output.iter().skip(start).copied().collect(),
        cursor: session.offset + session.output.len() as u64,
        truncated: cursor < session.offset,
        session: session.info.clone(),
    })
}

#[tauri::command]
pub async fn write_agent_input(
    manager: State<'_, AgentManager>,
    session_id: String,
    input: String,
) -> Result<(), String> {
    if input.len() > 65536 {
        return Err("Envie até 64 KB por vez.".into());
    }
    let writer = {
        let inner = manager.0.lock().map_err(|e| e.to_string())?;
        inner
            .sessions
            .get(&session_id)
            .and_then(|s| s.runtime.as_ref())
            .ok_or("A sessão não está em execução.")?
            .writer
            .clone()
    };
    tauri::async_runtime::spawn_blocking(move || {
        let mut writer = writer.lock().map_err(|e| e.to_string())?;
        writer
            .write_all(input.as_bytes())
            .and_then(|_| writer.flush())
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn resize_agent_terminal(
    manager: State<'_, AgentManager>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    if !(2..=500).contains(&cols) || !(2..=200).contains(&rows) {
        return Err("Dimensões de terminal inválidas.".into());
    }
    let inner = manager.0.lock().map_err(|e| e.to_string())?;
    let runtime = inner
        .sessions
        .get(&session_id)
        .and_then(|s| s.runtime.as_ref())
        .ok_or("A sessão não está em execução.")?;
    runtime
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn stop_agent(manager: State<'_, AgentManager>, session_id: String) -> Result<(), String> {
    let mut inner = manager.0.lock().map_err(|e| e.to_string())?;
    let session = inner
        .sessions
        .get_mut(&session_id)
        .ok_or("Sessão não encontrada.")?;
    if let Some(runtime) = session.runtime.as_mut() {
        runtime.child.kill().map_err(|e| e.to_string())?;
        runtime.stopping = true;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(windows)]
    #[test]
    #[ignore = "Local regression: Codex installed by desktop app, without shell-specific PATH"]
    fn codex_without_shell_path() {
        let original = std::env::var_os("PATH");
        std::env::set_var("PATH", "C:\\Windows\\System32");
        let found = resolve("codex");
        if let Some(path) = original {
            std::env::set_var("PATH", path);
        } else {
            std::env::remove_var("PATH");
        }
        assert!(
            found.is_some(),
            "Codex installed by desktop app was not detected outside Codex shell PATH"
        );
    }
    #[cfg(windows)]
    #[test]
    fn shutdown_stops_process_and_auth_cannot_race_task() {
        let manager = AgentManager::open(Path::new(":memory:")).unwrap();
        let executable = resolve("powershell").unwrap();
        let args = vec![
            "-NoProfile".into(),
            "-Command".into(),
            "Start-Sleep -Seconds 30".into(),
        ];
        let session = manager
            .start(
                executable.clone(),
                args.clone(),
                &std::env::temp_dir(),
                Some("fixture".into()),
                "fixture".into(),
                "task".into(),
            )
            .unwrap();
        assert!(manager
            .start(
                executable,
                args,
                &std::env::temp_dir(),
                None,
                "fixture".into(),
                "logout".into()
            )
            .is_err());
        let start = Instant::now();
        manager.shutdown();
        assert!(start.elapsed() < Duration::from_secs(10));
        let inner = manager.0.lock().unwrap();
        assert_eq!(inner.sessions[&session.id].info.status, "stopped");
        assert!(inner.sessions[&session.id].runtime.is_none());
        let record: String = inner
            .database
            .query_row(
                "SELECT metadata FROM agent_sessions WHERE id = ?1",
                [&session.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            serde_json::from_str::<SessionInfo>(&record).unwrap().status,
            "stopped"
        );
    }
    #[cfg(windows)]
    #[test]
    fn conpty_input_resize_exit_and_duplicate_protection() {
        let manager = AgentManager::open(Path::new(":memory:")).unwrap();
        let executable = resolve("powershell").expect("PowerShell installed on Windows");
        let args = vec!["-NoProfile".into(), "-Command".into(), "Write-Output 'READY'; $line = [Console]::ReadLine(); Write-Output ('RECEIVED:' + $line); exit 7".into()];
        let session = manager
            .start(
                executable.clone(),
                args.clone(),
                &std::env::temp_dir(),
                Some("fixture".into()),
                "fixture".into(),
                "task".into(),
            )
            .unwrap();
        assert!(manager
            .start(
                executable,
                args,
                &std::env::temp_dir(),
                Some("fixture".into()),
                "fixture".into(),
                "task".into()
            )
            .is_err());
        let deadline = Instant::now() + Duration::from_secs(15);
        loop {
            {
                let inner = manager.0.lock().unwrap();
                let output: Vec<_> = inner.sessions[&session.id].output.iter().copied().collect();
                if String::from_utf8_lossy(&output).contains("READY") {
                    break;
                }
            }
            if Instant::now() >= deadline {
                let inner = manager.0.lock().unwrap();
                let item = &inner.sessions[&session.id];
                panic!(
                    "PTY status={} output={:?}",
                    item.info.status,
                    String::from_utf8_lossy(&item.output.iter().copied().collect::<Vec<_>>())
                );
            }
            thread::sleep(Duration::from_millis(50));
        }
        {
            let mut inner = manager.0.lock().unwrap();
            let runtime = inner
                .sessions
                .get_mut(&session.id)
                .unwrap()
                .runtime
                .as_mut()
                .unwrap();
            runtime
                .master
                .resize(PtySize {
                    cols: 80,
                    rows: 24,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .unwrap();
            let mut writer = runtime.writer.lock().unwrap();
            writer.write_all("trama-á-test\r\n".as_bytes()).unwrap();
            writer.flush().unwrap();
        }
        loop {
            {
                let inner = manager.0.lock().unwrap();
                let item = &inner.sessions[&session.id];
                let output: Vec<_> = item.output.iter().copied().collect();
                if item.info.status == "failed"
                    && String::from_utf8_lossy(&output).contains("RECEIVED:trama-á-test")
                {
                    assert_eq!(item.info.exit_code, Some(7));
                    break;
                }
            }
            if Instant::now() >= deadline {
                manager.shutdown();
                panic!("PTY input or exit was not observed");
            }
            thread::sleep(Duration::from_millis(50));
        }
    }
    #[test]
    #[ignore = "Requires the locally installed Codex CLI; no prompt or model request is sent"]
    fn installed_codex_runs_in_pty() {
        let manager = AgentManager::open(Path::new(":memory:")).unwrap();
        let executable = resolve("codex").expect("Codex CLI installed");
        let session = manager
            .start(
                executable,
                vec!["--version".into()],
                &std::env::temp_dir(),
                None,
                "codex".into(),
                "probe".into(),
            )
            .unwrap();
        let deadline = Instant::now() + Duration::from_secs(15);
        loop {
            {
                let inner = manager.0.lock().unwrap();
                let item = &inner.sessions[&session.id];
                let output: Vec<_> = item.output.iter().copied().collect();
                if item.info.status == "exited"
                    && String::from_utf8_lossy(&output).contains("codex")
                {
                    assert_eq!(item.info.exit_code, Some(0));
                    break;
                }
            }
            if Instant::now() >= deadline {
                manager.shutdown();
                let inner = manager.0.lock().unwrap();
                let item = &inner.sessions[&session.id];
                panic!(
                    "Codex status={} output={:?}",
                    item.info.status,
                    String::from_utf8_lossy(&item.output.iter().copied().collect::<Vec<_>>())
                );
            }
            thread::sleep(Duration::from_millis(50));
        }
    }
    #[test]
    fn rejects_unknown_commands() {
        assert!(arguments("shell", "task").is_err());
        assert!(arguments("codex", "anything").is_err());
        assert!(arguments("gemini", "logout").is_err());
    }
    #[test]
    fn reconciles_interrupted_sessions_without_persisting_terminal() {
        let directory = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir(&directory).unwrap();
        let path = directory.join("sessions.db");
        let info = SessionInfo {
            id: "test".into(),
            task_id: Some("task".into()),
            agent_id: "codex".into(),
            purpose: "task".into(),
            status: "running".into(),
            started_at: 1,
            exit_code: None,
            error: None,
        };
        {
            let manager = AgentManager::open(&path).unwrap();
            persist(&manager.0.lock().unwrap().database, &info).unwrap();
        }
        {
            let manager = AgentManager::open(&path).unwrap();
            let inner = manager.0.lock().unwrap();
            assert_eq!(inner.sessions["test"].info.status, "stopped");
            assert!(inner.sessions["test"].output.is_empty());
        }
        std::fs::remove_file(path).unwrap();
        std::fs::remove_dir(directory).unwrap();
    }
    #[test]
    fn output_buffer_is_bounded_and_tracks_lost_bytes() {
        let info = SessionInfo {
            id: "test".into(),
            task_id: None,
            agent_id: "codex".into(),
            purpose: "login".into(),
            status: "running".into(),
            started_at: 1,
            exit_code: None,
            error: None,
        };
        let mut session = Session {
            info,
            runtime: None,
            output: VecDeque::new(),
            offset: 0,
        };
        append_output(&mut session, &vec![65; OUTPUT_LIMIT + 123]);
        assert_eq!(session.output.len(), OUTPUT_LIMIT);
        assert_eq!(session.offset, 123);
    }
}
