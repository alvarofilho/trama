mod agents;
mod git;
mod worktrees;

#[tauri::command]
fn inspect_repository(path: String) -> Result<git::RepositoryInspection, String> {
    git::inspect(&path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            use tauri::Manager;
            let directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&directory)?;
            app.manage(agents::AgentManager::open(
                &directory.join("agents.sqlite"),
            )?);
            Ok(())
        })
        .on_window_event(|window, event| {
            use tauri::Manager;
            if matches!(event, tauri::WindowEvent::Destroyed) {
                window.state::<agents::AgentManager>().shutdown();
            }
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            inspect_repository,
            worktrees::create_task_worktree,
            agents::detect_agents,
            agents::configure_agent_path,
            agents::start_agent,
            agents::remove_task,
            agents::list_agent_sessions,
            agents::read_agent_output,
            agents::write_agent_input,
            agents::resize_agent_terminal,
            agents::stop_agent
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
