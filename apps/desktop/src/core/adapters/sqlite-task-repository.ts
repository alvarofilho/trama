import type { Task, TaskOptions, TaskRepository } from "../domain/task";
import { appDatabase } from "./database";

interface TaskRow {
  id: string;
  project_id: string;
  title: string;
  prompt: string;
  agent_id: string;
  model: string | null;
  effort: string | null;
  use_worktree: number;
  status: Task["status"];
  branch: string | null;
  worktree_path: string | null;
  created_at: string;
  error: string | null;
}

export class SqliteTaskRepository implements TaskRepository {
  private initialized?: Promise<void>;

  initialize(): Promise<void> {
    this.initialized ??= this.initializeSchema();
    return this.initialized;
  }

  private async initializeSchema(): Promise<void> {
    const db = await appDatabase();
    await db.execute("PRAGMA foreign_keys = ON");
    await db.execute(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        prompt TEXT NOT NULL,
        agent_id TEXT NOT NULL DEFAULT 'codex',
        model TEXT,
        effort TEXT,
        use_worktree INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL,
        branch TEXT,
        worktree_path TEXT,
        created_at TEXT NOT NULL,
        error TEXT
      )
    `);
    const columns = await db.select<{ name: string }[]>(
      "SELECT name FROM pragma_table_info('tasks')",
    );
    const existing = new Set(columns.map(({ name }) => name));
    for (const [name, definition] of [
      ["agent_id", "TEXT NOT NULL DEFAULT 'codex'"],
      ["model", "TEXT"],
      ["effort", "TEXT"],
      ["use_worktree", "INTEGER NOT NULL DEFAULT 1"],
    ] as const) {
      if (!existing.has(name)) {
        await db.execute(`ALTER TABLE tasks ADD COLUMN ${name} ${definition}`);
      }
    }
    await db.execute(
      "CREATE INDEX IF NOT EXISTS idx_tasks_project_created ON tasks(project_id, created_at DESC)",
    );
  }

  async listForProject(projectId: string): Promise<Task[]> {
    const db = await appDatabase();
    const rows = await db.select<TaskRow[]>(
      "SELECT id, project_id, title, prompt, agent_id, model, effort, use_worktree, status, branch, worktree_path, created_at, error FROM tasks WHERE project_id = $1 ORDER BY created_at DESC",
      [projectId],
    );
    return rows.map(mapTask);
  }

  async create(
    projectId: string,
    title: string,
    prompt: string,
    options: TaskOptions,
  ): Promise<Task> {
    const db = await appDatabase();
    const task: Task = {
      id: crypto.randomUUID(),
      projectId,
      title,
      prompt,
      ...options,
      status: "creating",
      branch: null,
      worktreePath: null,
      createdAt: new Date().toISOString(),
      error: null,
    };
    await db.execute(
      `INSERT INTO tasks (id, project_id, title, prompt, agent_id, model, effort, use_worktree, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        task.id,
        task.projectId,
        task.title,
        task.prompt,
        task.agentId,
        task.model,
        task.effort,
        task.useWorktree ? 1 : 0,
        task.status,
        task.createdAt,
      ],
    );
    return task;
  }

  async markReady(
    taskId: string,
    branch: string | null,
    worktreePath: string | null,
  ): Promise<Task> {
    const db = await appDatabase();
    await db.execute(
      "UPDATE tasks SET status = 'ready', branch = $1, worktree_path = $2, error = NULL WHERE id = $3",
      [branch, worktreePath, taskId],
    );
    const rows = await db.select<TaskRow[]>(
      "SELECT id, project_id, title, prompt, agent_id, model, effort, use_worktree, status, branch, worktree_path, created_at, error FROM tasks WHERE id = $1 LIMIT 1",
      [taskId],
    );
    if (!rows[0]) {
      throw new Error("A tarefa não foi encontrada depois de criar o worktree.");
    }
    return mapTask(rows[0]);
  }

  async markFailed(taskId: string, error: string): Promise<void> {
    const db = await appDatabase();
    await db.execute("UPDATE tasks SET status = 'failed', error = $1 WHERE id = $2", [
      error,
      taskId,
    ]);
  }

  async remove(taskId: string): Promise<void> {
    const db = await appDatabase();
    await db.execute("DELETE FROM tasks WHERE id = $1", [taskId]);
  }
}

function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    prompt: row.prompt,
    agentId: row.agent_id,
    model: row.model,
    effort: row.effort,
    useWorktree: row.use_worktree === 1,
    status: row.status,
    branch: row.branch,
    worktreePath: row.worktree_path,
    createdAt: row.created_at,
    error: row.error,
  };
}
