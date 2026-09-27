import { invoke } from "@tauri-apps/api/core";
import type { AgentGateway, AgentId, AgentInfo, AgentSession, TerminalOutput } from "../domain/agent";

export class TauriAgentGateway implements AgentGateway {
  detect(agentId?: AgentId) { return invoke<AgentInfo[]>("detect_agents", { agentId: agentId ?? null }); }
  configurePath(agentId: AgentId, path: string | null) { return invoke<void>("configure_agent_path", { agentId, path }); }
  list() { return invoke<AgentSession[]>("list_agent_sessions"); }
  start(agentId: AgentId, purpose: AgentSession["purpose"], taskId?: string, projectId?: string, projectPath?: string, useWorktree?: boolean, model?: string | null, effort?: string | null) {
    return invoke<AgentSession>("start_agent", { agentId, purpose, taskId: taskId ?? null, projectId: projectId ?? null, projectPath: projectPath ?? null, useWorktree: useWorktree ?? null, model: model ?? null, effort: effort ?? null });
  }
  read(sessionId: string, cursor: number) { return invoke<TerminalOutput>("read_agent_output", { sessionId, cursor }); }
  write(sessionId: string, input: string) { return invoke<void>("write_agent_input", { sessionId, input }); }
  resize(sessionId: string, cols: number, rows: number) { return invoke<void>("resize_agent_terminal", { sessionId, cols, rows }); }
  stop(sessionId: string) { return invoke<void>("stop_agent", { sessionId }); }
}
export const agentGateway = new TauriAgentGateway();
