# Trama Desktop

Desktop app built with Tauri 2, Angular 22, TypeScript, and Rust.

## Run on Windows

Install Node.js 24.15+, Rust with the MSVC toolchain, Microsoft C++ Build Tools, and WebView2. From this directory:

```powershell
npm install
npm run tauri dev
```

For a production package, run `npm run tauri build`.

## Angular frontend

The interface uses standalone Angular components, Signals and Signal Forms. `src/app/core/workspace-api.ts` connects the UI to the application services, domain interfaces and Tauri/SQLite adapters under `src/core`.

- `npm run build`: compile templates and generate the production frontend in `dist/`.
- `npm test`: run the Angular component and path-formatting tests with isolated native adapters.
- `npm run dev`: serve the frontend on port 1420. Native folder selection, Git and SQLite require the Tauri window (`npm run tauri dev`).

The frontend is client-rendered, without SSR. The Angular CLI owns its build and development server.

## Implemented slice

- Select a local folder with the native directory picker.
- Verify the selected path with the installed Git CLI and resolve its repository root and current branch.
- Save opened repositories in SQLite under the app's configuration directory and list recent projects when the app reopens.
- Keep repository inspection and persistence behind application/domain interfaces.

- Create isolated tasks with Git branches and worktrees.
- Detect Codex, Claude Code, OpenCode and Gemini CLIs from PATH and known Windows installation folders, including the Codex desktop application's versioned CLI. An executable selected with **Localizar CLI** is verified and saved in `agents.sqlite`.
- Query native authentication status for Codex and Claude; keep it unknown when the CLI cannot confirm it. OpenCode and Gemini authenticate inside their own terminal.
- Start native login/logout (Gemini login uses its interactive CLI), select an agent per task, and interact through xterm.js and a real PTY/ConPTY.
- Resize and stop sessions, prevent duplicate execution per task, retain session metadata in `agents.sqlite`, and reconcile interrupted executions when reopening.

## Agent workflow

Open **Agentes**, select a tool and use **Conectar conta** if needed. The terminal's authentication links open in your browser. Authentication is rechecked automatically when the native process exits, and periodically while it is running. **Já autorizei, verificar** also checks immediately. A process exit alone never marks an account connected. Codex offers **Entrar com código** for environments where browser callbacks do not work; device login must be enabled by the account or workspace. No credentials are copied between tools.

If the CLI is missing, use **Localizar CLI**, or **Como instalar** to open the official instructions. **Instalação e opções** shows the detected executable and its source, supports changing the path, and can restore automatic discovery.

In the workspace, create a task, choose an installed agent and click **Iniciar agente**. After accepting the CLI's login/trust prompts, use **Inserir descrição** and press Enter. Prompts are never interpolated into shell commands.

Closing a terminal panel keeps its process running; **Interromper** or closing Trama terminates it. A new session starts a fresh conversation. A successful process exit is displayed as **Encerrado**, not as proof of task completion. No waiting/completed states are inferred from terminal silence.

Only session metadata is persisted. Terminal output is bounded to 512 KiB per session in memory, with a truncation notice; it is lost when Trama exits. The application does not read credential files. The native CLI can persist its own credentials and conversation history.

ACP, automatic conversation resume and the remaining diff/commit/merge flows are not implemented. OpenCode and Gemini adapters still need end-to-end validation with those CLIs installed. The Windows smoke test executes the installed Codex version command through ConPTY without making a model request.

## Validation

```powershell
npm run build
npm test
cargo test --manifest-path src-tauri/Cargo.toml --lib
# Optional: requires Codex installed; does not send a model request.
cargo test --manifest-path src-tauri/Cargo.toml installed_codex_runs_in_pty -- --ignored
```

CLI command references: [Codex](https://learn.chatgpt.com/docs/developer-commands?surface=cli), [Claude Code](https://code.claude.com/docs/en/cli-reference), [OpenCode](https://opencode.ai/docs/cli/), [Gemini](https://geminicli.com/docs/get-started/authentication/).
