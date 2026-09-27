export type AgentId = "codex" | "claude" | "opencode" | "gemini";
export interface AgentInfo {
  id: AgentId;
  name: string;
  installed: boolean;
  version: string | null;
  authentication: "authenticated" | "unauthenticated" | "unknown";
  detail: string;
  executablePath?: string | null;
  source?: string | null;
  configured?: boolean;
}
export interface AgentSession {
  id: string;
  taskId: string | null;
  agentId: AgentId;
  purpose: "task" | "login" | "device-login" | "logout";
  status: "running" | "exited" | "stopped" | "failed";
  startedAt: number;
  exitCode: number | null;
  error: string | null;
}
export interface TerminalOutput {
  data: number[];
  cursor: number;
  truncated: boolean;
  session: AgentSession;
}
export interface AgentGateway {
  detect(agentId?: AgentId): Promise<AgentInfo[]>;
  configurePath(agentId: AgentId, path: string | null): Promise<void>;
  list(): Promise<AgentSession[]>;
  start(agentId: AgentId, purpose: AgentSession["purpose"], taskId?: string, projectId?: string, projectPath?: string, useWorktree?: boolean, model?: string | null, effort?: string | null): Promise<AgentSession>;
  read(sessionId: string, cursor: number): Promise<TerminalOutput>;
  write(sessionId: string, input: string): Promise<void>;
  resize(sessionId: string, cols: number, rows: number): Promise<void>;
  stop(sessionId: string): Promise<void>;
}
export const sessionLabels: Record<AgentSession["status"], string> = {
  running: "Em execução", exited: "Encerrado", stopped: "Interrompido", failed: "Falha na execução",
};
