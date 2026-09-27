import type { Project } from "./project";

export type TaskWorkspaceStatus = "creating" | "ready" | "failed";

export interface Task {
  id: string;
  projectId: string;
  title: string;
  prompt: string;
  agentId: string;
  model: string | null;
  effort: string | null;
  useWorktree: boolean;
  status: TaskWorkspaceStatus;
  branch: string | null;
  worktreePath: string | null;
  createdAt: string;
  error: string | null;
}

export interface TaskRepository {
  listForProject(projectId: string): Promise<Task[]>;
  find(taskId: string): Promise<Task | null>;
  create(projectId: string, title: string, prompt: string, options: TaskOptions): Promise<Task>;
  markReady(taskId: string, branch: string | null, worktreePath: string | null): Promise<Task>;
  markFailed(taskId: string, error: string): Promise<void>;
}

export interface TaskRemovalGateway {
  remove(taskId: string, removeWorktree: boolean): Promise<void>;
}

export interface TaskWorkspaceCreator {
  create(project: Project, task: Task): Promise<{ branch: string; worktreePath: string }>;
}

export interface TaskOptions {
  agentId: string;
  model: string | null;
  effort: string | null;
  useWorktree: boolean;
}
